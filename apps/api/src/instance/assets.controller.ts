
import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard(['jwt', 'api-key']))
@Controller('assets')
export class AssetsController {
    private readonly logger = new Logger(AssetsController.name);

    constructor(private readonly prisma: PrismaService) { }

    @Get()
    async listAssets(@Request() req) {
        return await this.prisma.asset.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            select: { id: true, type: true, data: true, createdAt: true }
        });
    }

    @Post()
    async createAsset(@Request() req, @Body() body: { type: string, data: string }) {
        return await this.prisma.asset.create({
            data: {
                userId: req.user.id,
                type: body.type || 'PROFILE_PIC',
                data: body.data
            }
        });
    }

    @Delete(':id')
    async deleteAsset(@Request() req, @Param('id') id: string) {
        // Ensure user owns the asset
        const asset = await this.prisma.asset.findFirst({
            where: { id, userId: req.user.id }
        });

        if (!asset) {
            throw new Error('Asset not found or access denied');
        }

        return await this.prisma.asset.delete({
            where: { id }
        });
    }
}
