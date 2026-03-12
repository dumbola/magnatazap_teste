import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProxyTurboService } from './proxy-turbo.service';
import { OpenaiService } from '../openai/openai.service';
import { ProfileService } from '../instance/profile.service';

@Module({
    imports: [],
    providers: [WhatsappService, PrismaService, ProxyTurboService, OpenaiService, ProfileService],
    exports: [WhatsappService, ProxyTurboService],
})
export class WhatsappModule { }
