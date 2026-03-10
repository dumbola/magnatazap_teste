import { Controller, Post, Body, Ip, UseGuards, Get, Request, UnauthorizedException, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private prisma: PrismaService
    ) { }

    @UseGuards(JwtAuthGuard)
    @Patch('profile')
    async updateProfile(@Request() req, @Body() body: { openaiApiKey?: string; openaiAssistantId?: string }) {
        const updatedUser = await this.authService.updateUserProfile(req.user.id, body);
        const { password, ...result } = updatedUser;
        return result;
    }

    @Post('login')
    async login(@Body() req) {
        // Manual validation for simple example, better use LocalStrategy
        const user = await this.authService.validateUser(req.email, req.password);
        if (!user) throw new UnauthorizedException('Invalid credentials');
        return this.authService.login(user);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Get('users')
    async listUsers() {
        return this.authService.getAllUsers();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Post('users')
    async createUser(@Body() body) {
        return this.authService.createUser(body);
    }

    @Post('admin-login')
    async adminLogin(@Body() body, @Ip() ip) {
        return this.authService.adminLogin(body.password, ip);
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    async getProfile(@Request() req) {
        // Fetch fresh user from DB
        const user = await this.prisma.user.findUnique({
            where: { id: req.user.id }
        });
        const { password, ...result } = user || {};
        return result;
    }
}
