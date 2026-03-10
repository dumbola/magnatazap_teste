import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

import { PrismaLogger } from './logger/prisma.logger';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { HttpAdapterHost } from '@nestjs/core';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));

    const logger = app.get(PrismaLogger);
    app.useLogger(logger);

    const httpAdapter = app.get(HttpAdapterHost);
    app.useGlobalFilters(new AllExceptionsFilter(httpAdapter, logger));

    const frontendUrls = (process.env.FRONTEND_URL || '').split(',').map(u => u.trim());

    app.enableCors({
        origin: [
            ...frontendUrls,
            'http://178.156.166.139:3000',
            'http://localhost:3000',
        ],
        credentials: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    });
    await logger.log('System Initialized', 'MyBootstrap');
    await app.listen(4000, '0.0.0.0');
    console.log('API is running on http://0.0.0.0:4000');
}
bootstrap();

// [STABILITY] Global Error Handlers (Container Armor)
// Evita que o container morra por erros de conexão bobos do Baileys
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection (Não derrube o sistema):', reason);
    // Não dê process.exit(1) aqui!
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ Uncaught Exception:', error);
});
