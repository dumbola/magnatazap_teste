import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';


import { ProxyTurboService } from './proxy-turbo.service';

@Module({
    imports: [],
    providers: [WhatsappService, PrismaService, ProxyTurboService],
    exports: [WhatsappService, ProxyTurboService], // Exported in case other modules need it
})
export class WhatsappModule { }
