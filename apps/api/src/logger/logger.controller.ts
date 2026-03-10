import { Controller, Get, Delete, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('system-logs')
export class LoggerController {
    constructor(private readonly prisma: PrismaService) { }

    @Get()
    async getLogs(@Query('level') level?: string) {
        let systemLogs = [];
        let connectionLogs = [];

        // 1. Fetch System Logs (Robust)
        try {
            systemLogs = await this.prisma.systemLog.findMany({
                where: level && level !== 'ALL' ? { level } : {},
                orderBy: { createdAt: 'desc' },
                take: 100
            });
        } catch (e) {
            console.error('Failed to fetch SystemLogs', e);
        }

        // 2. Fetch Connection Logs (Robust - Handle missing table/migrations)
        try {
            connectionLogs = await this.prisma.connectionLog.findMany({
                orderBy: { timestamp: 'desc' },
                take: 50
            });
        } catch (e) {
            console.error('Failed to fetch ConnectionLogs (Migration pending?)', e);
            // Ignore error, just don't show connection logs
        }

        // Transform ConnectionLogs to match SystemLog shape
        const formattedConnLogs = connectionLogs.map(c => ({
            id: c.id,
            level: c.status === 'DISCONNECTED' ? 'ERROR' : 'INFO',
            message: `Instance ${c.instanceName} is now ${c.status}`,
            context: 'ConnectionMonitor',
            metadata: { type: 'CONNECTION_EVENT', status: c.status },
            createdAt: c.timestamp
        }));

        // Merge and Sort
        const allLogs = [...systemLogs, ...formattedConnLogs].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return allLogs.slice(0, 150);
    }

    @Delete()
    async clearLogs() {
        return await this.prisma.systemLog.deleteMany();
    }

    @Get('test') // [DEBUG] Manual Trigger
    async testLog() {
        await this.prisma.systemLog.create({
            data: {
                level: 'INFO',
                message: 'Test Log Triggered by User',
                context: 'LoggerController'
            }
        });
        return { success: true };
    }
}
