import { Controller, Get, Query, UseGuards, Request, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard(['jwt', 'api-key']))
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

        const now = new Date();
        const start = startQuery ? new Date(startQuery) : new Date(new Date().setHours(0, 0, 0, 0));
        const end = endQuery ? new Date(endQuery) : new Date(new Date().setHours(23, 59, 59, 999));

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            const fallbackStart = new Date();
            fallbackStart.setHours(0, 0, 0, 0);
            const fallbackEnd = new Date();
            fallbackEnd.setHours(23, 59, 59, 999);
            return this.getStats(req, fallbackStart.toISOString(), fallbackEnd.toISOString());
        }

        // Hybrid: query both DispatchLog (new) and CampaignLead (legacy)
        const [
            dispatchSentPeriod,
            dispatchSentAllTime,
            legacySentPeriod,
            legacySentAllTime,
            activeInstances,
            totalInstances,
            totalCampaigns,
            dispatchChartRaw,
            legacyChartRaw,
            instances,
            dispatchCountsByInstance,
            legacyCountsByInstance
        ] = await Promise.all([
            this.prisma.dispatchLog.count({
                where: { userId, status: 'SENT', sentAt: { gte: start, lte: end } }
            }),
            this.prisma.dispatchLog.count({
                where: { userId, status: 'SENT' }
            }),
            this.prisma.campaignLead.count({
                where: { status: 'SENT', sentAt: { gte: start, lte: end }, campaign: { userId } }
            }),
            this.prisma.campaignLead.count({
                where: { status: 'SENT', campaign: { userId } }
            }),
            this.prisma.instance.count({
                where: { userId, status: 'CONNECTED' }
            }),
            this.prisma.instance.count({
                where: { userId }
            }),
            this.prisma.campaign.count({
                where: { userId }
            }),
            this.prisma.dispatchLog.findMany({
                where: { userId, status: 'SENT', sentAt: { gte: start, lte: end } },
                select: { sentAt: true }
            }),
            this.prisma.campaignLead.findMany({
                where: { status: 'SENT', sentAt: { gte: start, lte: end }, campaign: { userId } },
                select: { sentAt: true }
            }),
            this.prisma.instance.findMany({
                where: { userId },
                select: { id: true, name: true, status: true, sessionId: true, phone: true }
            }),
            this.prisma.dispatchLog.groupBy({
                by: ['instanceId'],
                where: { userId, status: 'SENT', sentAt: { gte: start, lte: end } },
                _count: { id: true }
            }),
            this.prisma.campaignLead.groupBy({
                by: ['assignedInstanceId'],
                where: { status: 'SENT', sentAt: { gte: start, lte: end }, campaign: { userId } },
                _count: { id: true }
            })
        ]);

        // Hybrid aggregation: use whichever source has more data
        const totalSent = Math.max(dispatchSentPeriod, legacySentPeriod);
        const totalSentAllTime = Math.max(dispatchSentAllTime, legacySentAllTime);

        // Chart: use the richer dataset
        const chartSource = dispatchChartRaw.length >= legacyChartRaw.length ? dispatchChartRaw : legacyChartRaw;

        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        const isMultiDay = diffHours > 24;
        const chartMap = new Map<string, number>();

        if (isMultiDay) {
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                chartMap.set(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), 0);
            }
        } else {
            for (let i = 0; i < 24; i++) {
                chartMap.set(`${String(i).padStart(2, '0')}:00`, 0);
            }
        }

        chartSource.forEach(log => {
            if (!log.sentAt) return;
            let key: string;
            if (isMultiDay) {
                key = new Date(log.sentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            } else {
                key = `${String(new Date(log.sentAt).getHours()).padStart(2, '0')}:00`;
            }
            if (chartMap.has(key)) chartMap.set(key, (chartMap.get(key) || 0) + 1);
        });

        const chartData = Array.from(chartMap.entries()).map(([time, value]) => ({ time, value }));

        // Hybrid instance counts: merge DispatchLog (UUID) + CampaignLead (sessionId)
        // Build sessionId→UUID lookup for legacy data
        const sessionToUuid = new Map<string, string>();
        instances.forEach(inst => sessionToUuid.set(inst.sessionId, inst.id));

        const countMap = new Map<string, number>();

        // DispatchLog uses Instance UUID directly
        dispatchCountsByInstance.forEach(item => {
            countMap.set(item.instanceId, item._count.id);
        });

        // CampaignLead.assignedInstanceId stores sessionId — resolve to UUID
        legacyCountsByInstance.forEach(item => {
            if (!item.assignedInstanceId) return;
            const uuid = sessionToUuid.get(item.assignedInstanceId) || item.assignedInstanceId;
            const existing = countMap.get(uuid) || 0;
            countMap.set(uuid, Math.max(existing, item._count.id));
        });

        const history = instances.map(instance => {
            const count = countMap.get(instance.id) || 0;
            return {
                id: instance.id,
                instanceName: instance.name,
                status: instance.status,
                messagesSent: count,
                connectedAt: instance.status === 'CONNECTED' ? 'Online' : '-',
                disconnectedAt: instance.status === 'DISCONNECTED' ? 'Offline' : '-',
                rawStart: null,
                rawEnd: null
            };
        });

        history.sort((a, b) => b.messagesSent - a.messagesSent);

        return {
            totalSent,
            totalSentAllTime,
            activeInstances,
            totalInstances,
            totalCampaigns,
            systemStatus: 'Online',
            chartData,
            history
        };
    }
}
