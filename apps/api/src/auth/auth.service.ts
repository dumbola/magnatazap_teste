import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    private readonly MAX_ATTEMPTS = 5;
    private readonly BLOCK_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    private readonly MASTER_PASS = 'PENEU23#';

    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (user && await bcrypt.compare(pass, user.password)) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any) {
        const payload = { email: user.email, sub: user.id, role: user.role };
        return {
            access_token: this.jwtService.sign(payload),
            user: { ...user, apiKey: user.apiKey } // Return API key for dashboard
        };
    }

    async register(data: any) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const user = await this.prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
                role: 'USER'
            }
        });
        return this.login(user);
    }

    async adminLogin(password: string, ip: string) {
        // 1. Check Block
        const blocked = await this.prisma.blockedIp.findUnique({ where: { ip } });
        if (blocked && blocked.blockedUntil && blocked.blockedUntil > new Date()) {
            throw new ForbiddenException(`IP Blocked until ${blocked.blockedUntil}`);
        }

        // 2. Validate
        if (password !== this.MASTER_PASS) {
            await this.handleFailedAttempt(ip);
            throw new UnauthorizedException('Invalid Admin Password');
        }

        // 3. Reset Block on Success
        if (blocked) {
            await this.prisma.blockedIp.update({
                where: { ip },
                data: { attempts: 0, blockedUntil: null }
            });
        }

        // 4. Create/Get Admin User
        let admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
        if (!admin) {
            admin = await this.prisma.user.create({
                data: {
                    email: 'admin@system.com',
                    password: await bcrypt.hash(this.MASTER_PASS, 10),
                    name: 'Super Admin',
                    role: 'ADMIN'
                }
            });
        }

        return this.login(admin);
    }

    private async handleFailedAttempt(ip: string) {
        const entry = await this.prisma.blockedIp.upsert({
            where: { ip },
            update: { attempts: { increment: 1 } },
            create: { ip, attempts: 1 }
        });

        if (entry.attempts >= this.MAX_ATTEMPTS) {
            await this.prisma.blockedIp.update({
                where: { ip },
                data: { blockedUntil: new Date(Date.now() + this.BLOCK_DURATION) }
            });
            throw new ForbiddenException('Too many failed attempts. IP Blocked for 24h.');
        }
    }
    async getAllUsers() {
        return this.prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                apiKey: true,
                createdAt: true,
                _count: {
                    select: { instances: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async createUser(data: any) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        return this.prisma.user.create({
            data: {
                ...data,
                password: hashedPassword,
                role: 'USER'
            },
            select: {
                id: true,
                email: true,
                apiKey: true
            }
        });
    }

    async updateUserProfile(userId: string, data: { openaiApiKey?: string; openaiAssistantId?: string }) {
        return this.prisma.user.update({
            where: { id: userId },
            data
        });
    }
}
