import { Injectable, LoggerService } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PrismaLogger implements LoggerService {
    constructor(private readonly prisma: PrismaService) { }

    async log(message: any, ...optionalParams: any[]) {
        await this.saveLog('INFO', message, optionalParams);
    }

    async error(message: any, ...optionalParams: any[]) {
        await this.saveLog('ERROR', message, optionalParams);
    }

    async warn(message: any, ...optionalParams: any[]) {
        await this.saveLog('WARN', message, optionalParams);
    }

    async debug?(message: any, ...optionalParams: any[]) {
        await this.saveLog('DEBUG', message, optionalParams);
    }

    async verbose?(message: any, ...optionalParams: any[]) {
        await this.saveLog('VERBOSE', message, optionalParams);
    }

    private async saveLog(level: string, message: any, params: any[]) {
        const context = params.find(p => typeof p === 'string') || 'System'; // Extract context if available
        const metadata = params.find(p => typeof p === 'object') || {};

        // Don't log trivial PrismaQuery logs to DB to avoid recursive explosions
        if (context === 'PrismaService' || context === 'PrismaClient') return;

        // [DEBUG] Write to file
        try {
            const logLine = `[${new Date().toISOString()}] ${level} [${context}]: ${typeof message === 'string' ? message : JSON.stringify(message)}\n`;
            fs.appendFileSync(path.join(process.cwd(), 'debug_logs.txt'), logLine);
        } catch (err) {
            // Ignore file write errors
        }

        try {
            await this.prisma.systemLog.create({
                data: {
                    level,
                    message: typeof message === 'string' ? message : JSON.stringify(message),
                    context,
                    metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined
                }
            });
        } catch (e: any) {
            // Fallback to console if DB fails
            console.error('Failed to write log to DB', e);
            try {
                fs.appendFileSync(path.join(process.cwd(), 'debug_logs.txt'), `[DB_ERROR] ${e.message}\n`);
            } catch (f) { }
        }
    }
}

