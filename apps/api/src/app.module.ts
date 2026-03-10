import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InstanceModule } from './instance/instance.module';
import { CampaignModule } from './campaign/campaign.module';
import { PrismaService } from './prisma/prisma.service';
import { LoggerController } from './logger/logger.controller';
import { PrismaLogger } from './logger/prisma.logger';
import { StatsController } from './stats/stats.controller';
import { AuthModule } from './auth/auth.module';


@Module({
    imports: [
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
            },
        }),
        InstanceModule,
        CampaignModule,
        AuthModule
    ],
    controllers: [LoggerController, StatsController],
    providers: [PrismaService, PrismaLogger],
    exports: [PrismaService, PrismaLogger],
})
export class AppModule { }
