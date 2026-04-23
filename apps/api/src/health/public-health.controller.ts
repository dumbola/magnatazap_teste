import { Controller, Get } from '@nestjs/common';

/**
 * Rotas públicas (sem JWT) — para NPM, monitorização e teste `curl` antes de CORS/auth.
 */
@Controller()
export class PublicHealthController {
    @Get('healthz')
    healthz() {
        return { ok: true, service: 'api', ts: new Date().toISOString() };
    }
}
