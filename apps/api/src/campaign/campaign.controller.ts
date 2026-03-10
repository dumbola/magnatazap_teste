import { Body, Controller, Post, Get, Param, UseGuards, Request, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SmartDispatcherService } from './smart-dispatcher.service';

@UseGuards(JwtAuthGuard)
@Controller('campaign')
export class CampaignController {
    constructor(
        @InjectQueue('campaign-queue') private campaignQueue: Queue,
        private prisma: PrismaService,
        private dispatcher: SmartDispatcherService
    ) { }

    // ... (existing code) ...

    // [NEW] Dispatcher Stats for Visualizer
    @Get(':id/dispatcher')
    getDispatcherStats(@Param('id') id: string) {
        const stats = this.dispatcher.getStats(id);
        if (!stats) return { instances: [], currentIndex: 0, status: 'IDLE' };

        return {
            ...stats,
            instances: stats.instances.map(id => ({
                id,
                name: 'Instance ' + id.split('-')[1], // Simple name extraction
                // [FIX] Use cooldownMap to check failure STATUS
                status: stats.cooldownMap.has(id) ? 'FAILED' : 'SENDING'
            }))
        };
    }


    private readonly logger = new Logger(CampaignController.name);

    @Post('send')
    async sendCampaign(@Request() req, @Body() body: {
        instanceNames: string[]; // [NEW] Array
        instanceName?: string;   // Legacy fallback
        customDomain?: string;   // [NEW] Dynamic Link Base
        messageVariations?: string[]; // [NEW] Anti-Ban Variations
        delayConfig?: { // [NEW] Human Delay Configuration
            minDelay: number;
            maxDelay: number;
            minTyping: number;
            maxTyping: number;
        };
        items: Array<{ number: string; message: string; variables: Record<string, string> }>
    }) {
        try {
            // Normailize Instances
            const targetNames = body.instanceNames && body.instanceNames.length > 0
                ? body.instanceNames
                : (body.instanceName ? [body.instanceName] : []);

            if (targetNames.length === 0) return { error: 'No instances selected' };

            // Validation
            if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
                return { error: 'Invalid or empty list' };
            }

            const previewMessage = body.items[0]?.message || '';
            const hasVariations = body.messageVariations && body.messageVariations.length > 0;

            // [FIX] Validate numbers before DB
            const validItems = body.items.filter(i => i.number && String(i.number).length >= 8);
            if (validItems.length === 0) {
                return { error: 'No valid numbers found in list' };
            }

            // [MULTI-DISPARO] Resolve Session IDs
            // sessionId = userId-instanceName
            const targetSessionIds = targetNames.map(name => `${req.user.id}-${name}`);

            // 1. Create Campaign (Connected to Instances)
            // We need to fetch Instance IDs to connect
            const instances = await this.prisma.instance.findMany({
                where: { sessionId: { in: targetSessionIds } }
            });

            if (instances.length === 0) return { error: 'Instances not found' };

            const campaign = await this.prisma.campaign.create({
                data: {
                    userId: req.user.id,
                    instanceName: targetNames.join(', '), // Display backup
                    instances: {
                        connect: instances.map(i => ({ id: i.id }))
                    },
                    customDomain: body.customDomain, // [NEW] Save Domain
                    message: previewMessage,
                    messageVariations: hasVariations ? body.messageVariations : undefined, // [NEW] Save Variations

                    // [HUMAN DELAY CONFIG]
                    minDelay: body.delayConfig?.minDelay || 10,
                    maxDelay: body.delayConfig?.maxDelay || 20,
                    minTyping: body.delayConfig?.minTyping || 2,
                    maxTyping: body.delayConfig?.maxTyping || 10,

                    status: 'PROCESSING'
                }
            });

            // 2. Round Robin Assignment & Bulk Insert logic
            const leadsData = validItems.map((item, index) => {
                // Round Robin: index % length
                const assignedInstance = instances[index % instances.length];

                return {
                    campaignId: campaign.id,
                    number: String(item.number).trim(),
                    variables: item.variables || {},
                    assignedInstanceId: assignedInstance.id, // [NEW] Track assignment
                    status: 'PENDING',
                    sequence: index + 1 // [NEW] 1-based index
                };
            });

            await this.prisma.campaignLead.createMany({ data: leadsData });

            // 3. Fetch created leads (need IDs for Queue Jobs)
            const leads = await this.prisma.campaignLead.findMany({
                where: { campaignId: campaign.id },
                orderBy: { sequence: 'asc' },
                select: { id: true, number: true, variables: true, assignedInstanceId: true }
            });

            // Map Instances Map for quick lookup
            const instanceIdToSessionMap = new Map(instances.map(i => [i.id, i.sessionId]));

            const sessionId = `${req.user.id}-${body.instanceName}`; // fallback ? NO.

            // Group original items
            const itemsByNumber = new Map<string, Array<typeof body.items[0]>>();
            for (const item of validItems) {
                const num = String(item.number).trim();
                if (!itemsByNumber.has(num)) itemsByNumber.set(num, []);
                itemsByNumber.get(num)?.push(item);
            }

            // Map Leads to Jobs
            const jobs = leads.map(lead => {
                const num = String(lead.number).trim();
                const availableItems = itemsByNumber.get(num);
                const originalItem = availableItems?.shift();

                // [ANTI-BAN] Random Variation Selection
                let msgToSend = originalItem?.message || previewMessage || 'Olá!';
                if (hasVariations) {
                    const variations = body.messageVariations as string[];
                    const randomIndex = Math.floor(Math.random() * variations.length);
                    msgToSend = variations[randomIndex];
                }

                // [MULTI-DISPARO] Use assigned instance
                const targetSessionId = lead.assignedInstanceId
                    ? instanceIdToSessionMap.get(lead.assignedInstanceId)
                    : targetSessionIds[0];

                return {
                    name: 'sendMessage',
                    data: {
                        campaignId: campaign.id,
                        leadId: lead.id,
                        instanceName: targetSessionId, // [CRITICAL] Route to correct instance
                        number: lead.number,
                        message: msgToSend,
                        variables: lead.variables
                    },
                    opts: {
                        attempts: 3,
                        backoff: {
                            type: 'fixed',
                            delay: 3000
                        },
                        removeOnComplete: true
                    }
                };
            });

            this.dispatcher.initialize(campaign.id, instances);

            this.logger.log(`Starting campaign ${campaign.id} with ${jobs.length} jobs across ${instances.length} instances`);
            await this.campaignQueue.addBulk(jobs);

            return { success: true, campaignId: campaign.id, count: jobs.length, leads };

        } catch (error: any) {
            this.logger.error(`Failed to send campaign: ${error.message}`, error.stack);
            throw new HttpException(
                {
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    error: 'Failed to initiate campaign',
                    message: error.message || 'Unknown error'
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
    @Post(':id/start')
    async startCampaign(@Param('id') id: string, @Request() req) {
        try {
            // [RETRY LOGIC] Reset failed/stuck leads to pending (User Request + Auto-Fix)
            await this.prisma.campaignLead.updateMany({
                where: {
                    campaignId: id,
                    status: { in: ['FAILED', 'PROCESSING'] } // Recover stuck items too
                },
                data: { status: 'PENDING' }
            });

            // Fetch Campaign and Pending Leads
            // Fetch Campaign and Pending Leads with Instances
            const campaign = await this.prisma.campaign.findUnique({
                where: {
                    id,
                    userId: req.user.id
                },
                include: {
                    leads: {
                        where: { status: 'PENDING' },
                        orderBy: { sequence: 'asc' }
                    },
                    instances: true // [NEW] Fetch instances for mapping
                }
            });

            if (!campaign) {
                throw new HttpException('Campaign not found', HttpStatus.NOT_FOUND);
            }

            if (campaign.leads.length === 0) {
                return { success: true, message: 'No pending leads to process' };
            }

            // Map Instance ID -> Session Name
            const instanceMap = new Map<string, string>();
            campaign.instances.forEach(inst => instanceMap.set(inst.id, inst.sessionId));
            const availableSessionIds = campaign.instances.map(i => i.sessionId);

            // Create Jobs
            const jobs = campaign.leads.map((lead, index) => {
                // Determine message: Use campaign message or random variation if available
                let msgToSend = campaign.message;
                if (campaign.messageVariations && Array.isArray(campaign.messageVariations) && campaign.messageVariations.length > 0) {
                    const variations = campaign.messageVariations as string[];
                    const randomIndex = Math.floor(Math.random() * variations.length);
                    msgToSend = variations[randomIndex];
                }

                // [FIX] Resolve Correct Instance
                let targetSessionId = lead.assignedInstanceId ? instanceMap.get(lead.assignedInstanceId) : null;

                // Fallback: Round Robin (if assigned ID not found or legacy)
                if (!targetSessionId && availableSessionIds.length > 0) {
                    targetSessionId = availableSessionIds[index % availableSessionIds.length];
                }

                // If still null (no instances?), fallback to legacy string construction (safety)
                if (!targetSessionId) {
                    targetSessionId = `${req.user.id}-${campaign.instanceName}`;
                }

                return {
                    name: 'sendMessage',
                    data: {
                        campaignId: campaign.id,
                        leadId: lead.id,
                        instanceName: targetSessionId, // [CRITICAL] Correct Session ID
                        number: lead.number,
                        message: msgToSend,
                        variables: lead.variables
                    },
                    opts: {
                        attempts: 3,
                        backoff: {
                            type: 'fixed',
                            delay: 3000
                        },
                        removeOnComplete: true
                    }
                };
            });

            // [FIX] Eager Dispatcher Init for Visualizer
            this.dispatcher.initialize(campaign.id, campaign.instances);

            // Add to Queue
            await this.campaignQueue.addBulk(jobs);

            // Update Campaign Status
            await this.prisma.campaign.update({
                where: { id },
                data: { status: 'PROCESSING' }
            });

            this.logger.log(`Resumed campaign ${id} with ${jobs.length} leads (Retried items included)`);

            return {
                success: true,
                campaignId: campaign.id,
                count: jobs.length,
                restored: true
            };

        } catch (error: any) {
            this.logger.error(`Failed to start campaign: ${error.message}`, error.stack);
            throw new HttpException(
                {
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    error: 'Failed to start campaign',
                    message: error.message || 'Unknown error'
                },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    async stopCampaign(@Param('id') id: string) {
        await this.prisma.campaign.update({
            where: { id },
            data: { status: 'CANCELED' }
        });
        return { success: true, status: 'CANCELED' };
    }

    // Endpoint for Monitor
    @Get(':id/leads')
    async getCampaignLeads(@Request() req, @Param('id') id: string) {
        // Return remaining leads (Pending or Failed)
        const leads = await this.prisma.campaignLead.findMany({
            where: { campaignId: id },
            orderBy: { status: 'asc' } // Failed/Pending
        });

        const summary = await this.prisma.campaign.findUnique({
            where: { id, userId: req.user.id },
            select: { status: true, instanceName: true, createdAt: true, message: true, messageVariations: true }
        });

        if (!summary) return { error: 'Not found or forbidden' };

        return { ...summary, leads };
    }

    // [NEW] Get Current Active/Draft Campaign
    @Get('active')
    async getActiveCampaign(@Request() req) {
        // Find latest campaign that is DRAFT or PROCESSING
        const campaign = await this.prisma.campaign.findFirst({
            where: {
                userId: req.user.id,
                status: { in: ['DRAFT', 'PROCESSING', 'PENDING'] }
            },
            orderBy: { updatedAt: 'desc' },
            include: { leads: true }
        });

        if (!campaign) return null;

        return {
            id: campaign.id,
            status: campaign.status,
            instanceName: campaign.instanceName || '',
            message: campaign.message,
            messageVariations: campaign.messageVariations,
            leads: campaign.leads,
            updatedAt: campaign.updatedAt
        };
    }

    // [NEW] Save Draft
    @Post('draft')
    async saveDraft(@Request() req, @Body() body: any) {
        const { id, instanceName, leads, messages } = body;

        let campaign;

        if (id) {
            // Update existing
            campaign = await this.prisma.campaign.update({
                where: { id },
                data: {
                    instanceName,
                    message: messages?.[0] || '',
                    messageVariations: messages || [], // Save all variations
                }
            });
            // Upsert leads? Re-creating is safer for draft sync
            if (leads && Array.isArray(leads)) {
                await this.prisma.campaignLead.deleteMany({ where: { campaignId: id } });
                await this.prisma.campaignLead.createMany({
                    data: leads.map(l => ({
                        campaignId: id,
                        number: l.number,
                        variables: l.vars || {},
                        status: 'PENDING'
                    }))
                });
            }
        } else {
            // Create new
            campaign = await this.prisma.campaign.create({
                data: {
                    userId: req.user.id,
                    instanceName: instanceName || null,
                    message: messages?.[0] || '',
                    status: 'DRAFT',
                    leads: {
                        create: (leads || []).map(l => ({
                            number: l.number,
                            variables: l.vars || {}
                        }))
                    }
                }
            });
        }

        return { id: campaign.id, status: campaign.status };
    }

    // [NEW] Clear Sent Leads
    @Post(':id/leads/clear-sent')
    async clearSentLeads(@Param('id') id: string) {
        await this.prisma.campaignLead.deleteMany({
            where: {
                campaignId: id,
                status: 'SENT'
            }
        });
        return { success: true };
    }

    // [NEW] Recycle Failed Leads (System Recovery)
    @Post(':id/recycle-failed')
    async recycleFailedLeads(@Param('id') id: string) {
        // [RECOVERY]
        // 1. Reset 'FAILED' leads (that are valid numbers) to 'PENDING'.
        // 2. We intentionally EXCLUDE 'Invalid Number' or 'not exists'.

        const result = await this.prisma.campaignLead.updateMany({
            where: {
                campaignId: id,
                status: 'FAILED',
                NOT: [
                    { error: { contains: 'Invalid Number' } },
                    { error: { contains: 'not exists' } }
                ]
            },
            data: {
                status: 'PENDING',
                error: null
            }
        });

        return {
            success: true,
            restored: result.count,
            message: `Lead Recovery: Restored ${result.count} failed leads to PENDING state.`
        };
    }

    // [NEW] Clear All Leads (Reset implementation to just delete pending/failed, keeping sent?)
    // [FIX] User Request: "Reset failed to pending, keep sent". 
    // This looks like what startCampaign does, but maybe they want a manual "Clean/Reset" button.
    @Post(':id/leads/reset-failed')
    async resetFailedLeads(@Param('id') id: string) {
        // [SMART RECYCLE]
        // 1. Delete "Invalid Number" permanently (No point retrying)
        // Using 'contains' to catch "Invalid Number", "Number Invalid", etc.
        const deleted = await this.prisma.campaignLead.deleteMany({
            where: {
                campaignId: id,
                status: 'FAILED',
                error: { contains: 'Invalid' }
            }
        });

        // 2. Reset other errors (Timeouts, Proxies, etc) to PENDING
        // Everything that matches FAILED but is NOT Invalid
        const result = await this.prisma.campaignLead.updateMany({
            where: {
                campaignId: id,
                status: 'FAILED',
                error: { not: { contains: 'Invalid' } }
            },
            data: {
                status: 'PENDING',
                error: null,
                sentAt: null // Explicitly clear sentAt to allow retry
            }
        });

        return {
            success: true,
            deleted: deleted.count,
            restored: result.count,
            message: `Smart Recycle: Deleted ${deleted.count} invalid numbers, Restored ${result.count} failures.`
        };
    }

    @Post(':id/leads/clear-all')
    async clearAllLeads(@Param('id') id: string) {
        // [CAUTION] This deletes EVERYTHING. 
        // If user wants to "clean list" but keep sent, they should use 'reset-failed' or we change behavior here.
        // Let's change behavior to: Delete ONLY Pending/Failed (Cancel remainder), KEEP SENT.
        // OR provide a specific "Hard Delete" vs "Soft Reset".

        // Current behavior: Delete ALL. 
        // Proposed Fix: If this is the button they click to "fix" a bugged campaign, 
        // they probably want to KEEP sent history.

        // Force User: Delete ONLY NON-SENT items.
        const result = await this.prisma.campaignLead.deleteMany({
            where: {
                campaignId: id,
                status: { not: 'SENT' } // Keep SENT history
            }
        });
        return { success: true, count: result.count, message: 'Cleared all non-sent leads.' };
    }

    // [EMERGENCY] Force Clear Redis Queue
    @Post('queue/clean')
    @Post('queue/clean')
    async cleanQueue() {
        try {
            await this.campaignQueue.pause();
            await this.campaignQueue.obliterate({ force: true });
            this.logger.warn('Queue OBLITERATED by user request.');
            return { success: true, message: 'Queue wiped clean' };
        } catch (e: any) {
            this.logger.error(`Queue clean failed: ${e.message}`);
            return { error: e.message };
        } finally {
            try {
                // ALWAYS Resume, even if obliterate failed
                await this.campaignQueue.resume();
                this.logger.log('Queue Resumed');
            } catch (resumeErr) {
                this.logger.error('Failed to resume queue', resumeErr);
            }
        }
    }
}
