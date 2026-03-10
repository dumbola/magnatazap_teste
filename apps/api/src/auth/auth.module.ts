import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

import { ApiKeyStrategy } from './api-key.strategy';
import { PrismaModule } from '../prisma/prisma.module'; // Assuming PrismaModule exists and is imported

@Module({
    imports: [
        PrismaModule,
        PassportModule,
        JwtModule.register({
            secret: 'SUPER_SECRET_KEY_CHANGE_ME', // TODO: env
            signOptions: { expiresIn: '1d' },
        }),
    ],
    providers: [AuthService, JwtStrategy, ApiKeyStrategy],
    controllers: [AuthController],
    exports: [AuthService],
})
export class AuthModule { }
