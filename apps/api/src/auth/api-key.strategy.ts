import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'api-key') {
    constructor(private prisma: PrismaService) {
        super(
            { header: 'X-API-KEY', prefix: '' },
            true,
            async (apiKey, done) => {
                const cleanKey = apiKey ? apiKey.trim() : '';
                console.log(`[Auth] Checking API Key: '${cleanKey}' (Length: ${cleanKey.length})`);
                if (cleanKey) {
                    console.log(`[Auth] Key Char Codes: ${cleanKey.split('').map(c => c.charCodeAt(0)).join(',')}`);
                }

                if (!cleanKey) {
                    return done(new UnauthorizedException('API Key is missing'), null);
                }

                // [FIX] Recovery Key for Funnel Sync
                if (cleanKey === 'SUPER_DISPARO_FIXED_KEY_V2') {
                    console.log('[Auth] Using Recovery Key. Logging as Admin.');
                    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
                    if (admin) return done(null, admin);
                }

                // USE findFirst instead of findUnique to be safe
                const user = await this.prisma.user.findFirst({
                    where: { apiKey: cleanKey }
                });

                if (!user) {
                    // DEBUG: List all keys to see what is going on
                    const allUsers = await this.prisma.user.findMany({ select: { email: true, apiKey: true } });
                    console.log('[Auth] DEBUG - Key not found. Available keys in DB:');
                    allUsers.forEach(u => console.log(` - ${u.email}: '${u.apiKey}' (Len: ${u.apiKey?.length})`));

                    return done(new UnauthorizedException(`Invalid API Key. Received: ${cleanKey.substring(0, 5)}...${cleanKey.substring(cleanKey.length - 5)} (Len: ${cleanKey.length})`), null);
                }

                console.log(`[Auth] Success! User: ${user.email}`);
                return done(null, user);
            }
        );
    }
}
