import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: 'SUPER_SECRET_KEY_CHANGE_ME', // TODO: Use env
        });
    }

    async validate(payload: any) {
        if (!payload.sub) return null;

        // Verify if user actually exists
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, role: true } // Select only needed fields
        });

        if (!user) {
            throw new UnauthorizedException('User not found in database (Token invalid for current DB)');
        }

        return user;
    }
}
