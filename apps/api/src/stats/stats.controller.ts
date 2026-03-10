import { Controller, Get, Query, UseGuards, Request, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'))
@Controller('stats')
export class StatsController {
    private readonly logger = new Logger(StatsController.name);

    constructor(private prisma: PrismaService) { }

    @Get()
    async getStats(
        @Request() req,
        @Query('start') startQuery?: string,
        @Query('end') endQuery?: string
    ) {
        const userId = req.user.id;
        this.logger.log(`[STATS] Fetching Stats... User: ${userId} | Start: ${startQuery} | End: ${endQuery}`);

        // 1. Determine Date Range
        const now = new Date();
        const start = startQuery ? new Date(startQuery) : new Date(now.setHours(0, 0, 0, 0));
        const end = endQuery ? new Date(endQuery) : new Date(now.setHours(23, 59, 59, 999));

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            const fallbackStart = new Date();
            fallbackStart.setHours(0, 0, 0, 0);
            const fallbackEnd = new Date();
            fallbackEnd.setHours(23, 59, 59, 999);
            return this.getStats(req, fallbackStart.toISOString(), fallbackEnd.toISOString());
        }

        // 2. Parallel Data Fetching (Direct Counts)
        const [
            totalSent,
            totalSentAllTime, // [NEW] Total Lifetime
            activeInstances,
            totalInstances,
            totalCampaigns,
            chartDataRaw,
            instances,
            messageCountsByInstance
        ] = await Promise.all([
            // [METRIC] Total Sent (Filtered by Date)
            this.prisma.campaignLead.count({
                where: {
                    status: 'SENT',
                    sentAt: { gte: start, lte: end },
                    campaign: { userId }
                }
            }),
            // [METRIC] Total Sent (All Time)
            this.prisma.campaignLead.count({
                where: {
                    status: 'SENT',
                    campaign: { userId }
                }
            }),
            // [METRIC] Active Instances
            this.prisma.instance.count({
                where: { userId, status: 'CONNECTED' }
            }),
            // [METRIC] Total Instances
            this.prisma.instance.count({
                where: { userId }
            }),
            // [METRIC] Total Campaigns
            this.prisma.campaign.count({
                where: { userId }
            }),
            // [CHART] Raw Dates for Graph
            this.prisma.campaignLead.findMany({
                where: {
                    status: 'SENT',
                    sentAt: { gte: start, lte: end },
                    campaign: { userId }
                },
                select: { sentAt: true }
            }),
            // [HISTORY] All Instances for Table
            this.prisma.instance.findMany({
                where: { userId },
                select: { id: true, name: true, status: true, sessionId: true }
            }),
            // [HISTORY] Grouped Counts by Instance
            this.prisma.campaignLead.groupBy({
                by: ['assignedInstanceId'],
                where: {
                    status: 'SENT',
                    sentAt: { gte: start, lte: end },
                    campaign: { userId }
                },
                _count: { id: true }
            })
        ]);

        // 3. Process Chart Data (Group by Hour/Day)
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const isMultiDay = diffHours > 24;
        const chartMap = new Map<string, number>();

        // Initialize Map with Zeros
        if (isMultiDay) {
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                chartMap.set(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), 0);
            }
        } else {
            for (let i = 0; i < 24; i++) {
                chartMap.set(`${String(i).padStart(2, '0')}:00`, 0);
            }
        }

        // Fill Map
        chartDataRaw.forEach(log => {
            if (!log.sentAt) return;
            let key;
            if (isMultiDay) {
                key = new Date(log.sentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            } else {
                key = `${String(new Date(log.sentAt).getHours()).padStart(2, '0')}:00`;
            }
            if (chartMap.has(key)) chartMap.set(key, (chartMap.get(key) || 0) + 1);
        });

        const chartData = Array.from(chartMap.entries()).map(([time, value]) => ({ time, value }));

        // 4. Process History (Simplified: Instance Status + Total Sent)
        // Map counts for O(1) lookup
        const countMap = new Map<string, number>();
        messageCountsByInstance.forEach(item => {
            if (item.assignedInstanceId) {
                countMap.set(item.assignedInstanceId, item._count.id);
            }
        });

        const history = instances.map(instance => {
            const count = countMap.get(instance.id) || 0;
            return {
                id: instance.id,
                instanceName: instance.name,
                status: instance.status,
                messagesSent: count,
                // [COMPATIBILITY] Frontend expects these fields, return null/defaults
                connectedAt: instance.status === 'CONNECTED' ? 'Online' : '-',
                disconnectedAt: instance.status === 'DISCONNECTED' ? 'Offline' : '-',
                rawStart: null,
                rawEnd: null
            };
        });

        // Sort by Messages Sent (Desc)
        history.sort((a, b) => b.messagesSent - a.messagesSent);

        return {
            totalSent,
            totalSentAllTime, // [NEW] Return
            activeInstances,
            totalInstances,
            totalCampaigns,
            systemStatus: 'Online',
            chartData,
            history
        };
    }
}
