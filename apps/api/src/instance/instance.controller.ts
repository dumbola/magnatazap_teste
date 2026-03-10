import { Body, Controller, Get, Post, Delete, Param, UseGuards, Request, Put, Logger as NestLogger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { OpenaiService } from '../openai/openai.service';
import { ProfileService } from './profile.service';

import { SmartDispatcherService } from '../campaign/smart-dispatcher.service';

@UseGuards(AuthGuard(['jwt', 'api-key']))
@Controller('instance')
export class InstanceController {
    private readonly logger = new NestLogger(InstanceController.name);

    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly prisma: PrismaService,
        private readonly openaiService: OpenaiService,
        private readonly profileService: ProfileService,
        private readonly dispatcher: SmartDispatcherService
    ) { }

    @Get('health')
    async getHealthReport(@Request() req) {
        // 1. Fetch Instances
        const instances = await this.prisma.instance.findMany({
            where: { userId: req.user.id },
            include: {
                // [AGGREGATE] Sent Count via Relation?
                // No, Prisma doesn't do deep aggregates easily in include. 
                // We'll use a separate groupBy or count.
            }
        });

        // 2. Fetch Aggregated Counts (Group By Instance)
        // [FIX] Support both UUID (New) and SessionID (Legacy) formats
        const allIds = [
            ...instances.map(i => i.sessionId),
            ...instances.map(i => i.id)
        ];

        const sentCounts = await this.prisma.campaignLead.groupBy({
            by: ['assignedInstanceId'],
            where: {
                status: 'SENT',
                assignedInstanceId: { in: allIds }
            },
            _count: { id: true }
        });

        const countMap = new Map<string, number>();
        sentCounts.forEach(c => {
            if (c.assignedInstanceId) countMap.set(c.assignedInstanceId, c._count.id);
        });

        // 3. Get Unstable List
        const unstableSet = this.dispatcher.getUnstableInstances();

        // 4. Merge All Data
        return instances.map(instance => {
            const liveStatus = this.whatsappService.getStatus(instance.sessionId);
            const isUnstable = unstableSet.has(instance.sessionId);

            // [FIX] Sum both potential keys
            const countBySession = countMap.get(instance.sessionId) || 0;
            const countByUuid = countMap.get(instance.id) || 0;
            const sentCount = countBySession + countByUuid;

            const finalStatus = liveStatus?.status || instance.status;

            // [LOGIC] Determine "Health"
            // If it's connected but in cooldown -> "UNSTABLE"
            // If it's connected -> "HEALTHY"
            // Else -> "DEAD"

            let health = 'DEAD';
            if (finalStatus === 'CONNECTED') health = isUnstable ? 'UNSTABLE' : 'HEALTHY';
            else if (finalStatus === 'CONNECTING') health = 'CONNECTING';

            return {
                id: instance.id,
                name: instance.name, // Visual Name
                sessionId: instance.sessionId,
                phone: instance.phone,
                // [NEW] Proxy Data
                proxyIp: instance.lastKnownIp || 'Checking...',
                lastCheck: instance.lastIpCheck,
                // Status
                status: finalStatus,
                health: health,
                isUnstable,
                // Stats
                sentCount,
                // Metadata
                proxyConfig: instance.proxyConfig
            };
        });
    }

    @Post('init')
    async initInstance(@Body() body: { name: string; phoneNumber?: string }, @Request() req) {
        try {
            this.logger.log(`Autenticado: ${req.user.email} (ID: ${req.user.id}) via Token iniciando instância: ${body.name}`);
            const userId = req.user.id;
            const sessionId = `${userId}-${body.name}`;
            // We pass 'name' as visual name, but 'sessionId' as the engine ID
            // [TURBO] Activate Turbo Mode for manual interaction (faster QR generation)
            return await this.whatsappService.initSession(sessionId, body.name, userId, body.phoneNumber, true);
        } catch (error: any) {
            this.logger.error(`Failed to init instance: ${error.message}`, error.stack);
            throw error; // Let Nest handle the 500, but now we have logs
        }
    }

    @Get('list')
    async listInstances(@Request() req) {
        const instances = await this.prisma.instance.findMany({
            where: { userId: req.user.id }
        });

        // [SELF-HEALING] Inject Live Status
        // The DB might be stale. We check the active memory map for the truth.
        return instances.map(instance => {
            const liveStatus = this.whatsappService.getStatus(instance.sessionId);
            // If the service says it's connected (or has a pairing code), we trust the service.
            if (liveStatus && liveStatus.status !== instance.status) {
                // [FIX] Spread ALL live properties (status, pairingCode, phone)
                return { ...instance, ...liveStatus };
            }
            // [FIX] Even if status matches, we might have a pairing code (e.g. status CONNECTING in DB and Live)
            if (liveStatus && liveStatus.pairingCode) {
                return { ...instance, ...liveStatus };
            }
            return instance;
        });
    }

    @Get(':name/status')
    getStatus(@Param('name') name: string, @Request() req) {
        const sessionId = `${req.user.id}-${name}`;
        return this.whatsappService.getStatus(sessionId);
    }

    @Delete(':name')
    async deleteInstance(@Param('name') name: string, @Request() req) {
        // [FIX] Robust Deletion: Lookup actual sessionId from DB first
        // This handles cases where constructed ID `${req.user.id}-${name}` doesn't match stored ID (e.g. legacy data)
        const instance = await this.prisma.instance.findFirst({
            where: {
                userId: req.user.id,
                name: name
            }
        });

        if (!instance) {
            // If not found by name, try the constructed ID as fallback
            const sessionId = `${req.user.id}-${name}`;
            return await this.whatsappService.deleteSession(sessionId, false);
        }

        return await this.whatsappService.deleteSession(instance.sessionId, false);
    }

    // Rotas de Perfil
    @Post(':name/update-name')
    async updateName(@Param('name') name: string, @Body() body: { name: string }, @Request() req) {
        const sessionId = `${req.user.id}-${name}`;
        await this.whatsappService.updateProfileName(sessionId, body.name);
        return { success: true };
    }

    @Post(':name/update-status')
    async updateStatus(@Param('name') name: string, @Body() body: { status: string }, @Request() req) {
        const sessionId = `${req.user.id}-${name}`;
        await this.whatsappService.updateProfileStatus(sessionId, body.status);
        return { success: true };
    }

    @Post(':name/update-picture')
    async updatePicture(@Param('name') name: string, @Body() body: { image: string }, @Request() req) {
        const sessionId = `${req.user.id}-${name}`;
        await this.whatsappService.updateProfilePicture(sessionId, body.image);
        return { success: true };
    }

    // [NEW] Manual IP Check
    @Post(':name/check-ip')
    async checkIp(@Param('name') name: string, @Request() req) {
        const sessionId = `${req.user.id}-${name}`;
        await this.whatsappService.checkInstanceIp(sessionId);
        return { success: true };
    }

    // [NEW] Detailed Logs Endpoint
    @Get(':name/logs')
    async getLogs(@Param('name') name: string, @Request() req) {
        const sessionId = `${req.user.id}-${name}`;
        // Fetch last 50 logs for this instance
        const logs = await this.prisma.connectionLog.findMany({
            where: { instanceName: sessionId },
            orderBy: { timestamp: 'desc' },
            take: 50
        });
        return logs;
    }

    // [NEW] Bulk Humanize (AI + Hash Buster)
    @Post('bulk-humanize')
    async bulkHumanize(@Body() body: {
        instanceNames: string[];
        imageBase64?: string;
        prompt: string;
    }, @Request() req) {
        let results: any[] = [];
        const { instanceNames, imageBase64, prompt } = body;

        this.logger.log(`Starting Bulk Humanize for ${instanceNames.length} instances. Prompt: ${prompt}`);

        try {
            // 1. Get User API Key
            const user = await this.prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user?.openaiApiKey) {
                throw new Error('OpenAI API Key não configurada. Vá em Configurações.');
            }

            // 2. Generate Profiles
            const profiles = await this.openaiService.generateProfiles(
                instanceNames.length,
                prompt,
                user.openaiApiKey,
                user.openaiAssistantId // [NEW] Pass Assistant ID if present
            );

            // 3. Apply changes
            // 3. Apply changes (Parallel to avoid Timeouts)
            const tasks = instanceNames.map(async (name, i) => {
                const profile = profiles[i];
                const sessionId = `${req.user.id}-${name}`;

                try {
                    if (!profile) {
                        throw new Error(`Profile not generated for index ${i}`);
                    }

                    // Handle Image Uniqueness Logic
                    let uniqueBase64 = undefined;
                    if (imageBase64) {
                        try {
                            const uniqueBuffer = await this.profileService.uniqueImage(imageBase64);
                            uniqueBase64 = `data:image/jpeg;base64,${uniqueBuffer.toString('base64')}`;
                        } catch (imgErr) {
                            this.logger.warn(`Failed to unique image for ${name}, using original: ${imgErr.message}`);
                            uniqueBase64 = imageBase64;
                        }
                    }

                    // Call Consolidated Method (Single Update per Instance)
                    await this.whatsappService.updateProfileFull(sessionId, {
                        name: profile.name,
                        status: profile.bio,
                        image: uniqueBase64
                    });

                    return { name, success: true, profile };
                } catch (error: any) {
                    this.logger.error(`Failed to humanize ${name}: ${error.message}`);
                    return { name, success: false, error: error.message };
                }
            });

            // Execute all tasks and gather results
            results = await Promise.all(tasks);

        } catch (e: any) {
            this.logger.error(`Bulk Humanize Critical Error: ${e.message}`);
            return { success: false, error: e.message };
        }

        return { success: true, results };
    }

    // Legacy manual bulk update (kept for compatibility if needed, or removed if replaced)
    @Post('bulk/update-profile')
    async bulkUpdateProfile(@Body() body: {
        instanceNames: string[];
        name?: string;
        status?: string;
        image?: string;
    }, @Request() req) {
        const results = [];
        for (const name of body.instanceNames) {
            const sessionId = `${req.user.id}-${name}`;
            try {
                if (body.name) await this.whatsappService.updateProfileName(sessionId, body.name);
                if (body.status) await this.whatsappService.updateProfileStatus(sessionId, body.status);
                if (body.image) await this.whatsappService.updateProfilePicture(sessionId, body.image);
                results.push({ name, success: true });
            } catch (error: any) {
                this.logger.error(`Failed to update ${name}: ${error.message}`);
                results.push({ name, success: false, error: error.message });
            }
        }
        return { success: true, results };
    }

    @Post('regenerate-token')
    async regenerateToken(@Request() req) {
        const newKey = uuidv4();
        await this.prisma.user.update({
            where: { id: req.user.id },
            data: { apiKey: newKey }
        });
        return { apiKey: newKey };
    }
}
