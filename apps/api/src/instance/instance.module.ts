import { Module } from '@nestjs/common';
import { InstanceController } from './instance.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PrismaService } from '../prisma/prisma.service';

import { AssetsController } from './assets.controller';
import { OpenaiService } from '../openai/openai.service';
import { ProfileService } from './profile.service';

import { CampaignModule } from '../campaign/campaign.module';

@Module({
    imports: [WhatsappModule, CampaignModule],
    controllers: [InstanceController, AssetsController],
    providers: [PrismaService, OpenaiService, ProfileService],
})
export class InstanceModule { }
