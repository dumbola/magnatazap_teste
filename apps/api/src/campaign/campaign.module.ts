import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq'; // Correct package for BullMQ
import { CampaignController } from './campaign.controller';
import { CampaignProcessor } from './campaign.processor';
import { SmartDispatcherService } from './smart-dispatcher.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'campaign-queue',
        }),
        WhatsappModule
    ],
    controllers: [CampaignController],
    providers: [CampaignProcessor, PrismaService, SmartDispatcherService],
    exports: [SmartDispatcherService] // [FIX] Shared State for Instance Health Check
})
export class CampaignModule { }
