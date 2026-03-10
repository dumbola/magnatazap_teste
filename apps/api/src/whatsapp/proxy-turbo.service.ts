import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { HttpsProxyAgent } from 'https-proxy-agent';

@Injectable()
export class ProxyTurboService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ProxyTurboService.name);
    private pool: { id: string, agent: any, createdAt: number }[] = [];
    private isRefilling = false; // [LOCK] Previne condições de corrida

    // [CONFIG] Elite Settings
    private readonly POOL_SIZE = 30;
    private readonly AGENT_TTL_MS = 20000; // 20s de vida (Frescor Garantido)
    private readonly REFILL_INTERVAL = 2000;

    onApplicationBootstrap() {
        this.logger.log('[TURBO] 🚀 Starting Universal Engine (Oxylabs/BrightData Ready)...');
        this.refillPool();
        setInterval(() => this.refillPool(), this.REFILL_INTERVAL);
    }

    /**
     * Obtém um Agente Configurado e Pronto (Universal)
     */
    async getEliteAgent(): Promise<any | undefined> {
        try {
            const candidates = this.pool
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 3);

            if (candidates.length === 0) {
                this.logger.warn('[TURBO] ⚠️ Pool Empty! Emergency Refill.');
                this.refillPool();
                return undefined;
            }

            const selected = candidates[0];

            // Remove do pool (Uso único)
            this.pool = this.pool.filter(a => a.id !== selected.id);

            this.logger.log(`[TURBO] ⚡ Handover: Agent ${selected.id} (Age: ${Date.now() - selected.createdAt}ms)`);

            // Gatilho de refill não bloqueante
            this.refillPool();

            return selected.agent;

        } catch (e) {
            this.logger.error(`[TURBO] Failed to select agent: ${e.message}`);
            return undefined;
        }
    }

    private async refillPool() {
        if (this.isRefilling) return;
        this.isRefilling = true;

        try {
            // 1. Limpeza de Agentes Velhos
            const now = Date.now();
            const validAgents: typeof this.pool = [];

            for (const item of this.pool) {
                if ((now - item.createdAt) < this.AGENT_TTL_MS) {
                    validAgents.push(item);
                } else {
                    // [CLEANUP] Destroi o socket explicitamente
                    try {
                        if (item.agent.destroy) item.agent.destroy();
                    } catch (e) { }
                }
            }
            this.pool = validAgents;

            // 2. Reabastecimento
            const missing = this.POOL_SIZE - this.pool.length;
            if (missing <= 0) return;

            // Cria agentes sincronamente (rápido, sem check de rede)
            for (let i = 0; i < missing; i++) {
                const agentData = this.createUniversalAgent();
                if (agentData) this.pool.push(agentData);
            }

            if (missing > 0) {
                this.logger.log(`[TURBO] Pool Refilled: ${this.pool.length}/${this.POOL_SIZE}`);
            }

        } catch (e) {
            this.logger.error(`[TURBO] Refill Error: ${e.message}`);
        } finally {
            this.isRefilling = false;
        }
    }

    public createUniversalAgent(): { id: string, agent: any, createdAt: number } | null {
        try {
            const proxyUrlRaw = process.env.WA_PROXY_URL;
            if (!proxyUrlRaw) {
                this.logger.error('[TURBO] WA_PROXY_URL missing from environment variables');
                return null;
            }

            // Normaliza URL
            const urlString = proxyUrlRaw.split(',')[0].trim();
            // Log masked URL for debug
            this.logger.debug(`[TURBO] Constructing agent from: ${urlString.replace(/:[^:@]+@/, ':***@')}`);

            const url = new URL(urlString);
            if (!url.protocol.startsWith('http')) url.protocol = 'http:';

            const randomId = Math.floor(Math.random() * 1000000);
            const isOxylabs = url.hostname.includes('oxylabs.io');

            // [LÓGICA UNIVERSAL DE INJEÇÃO]
            if (isOxylabs) {
                // Oxylabs usa: customer-username-sessid-ID
                if (url.username.includes('sessid-')) {
                    // Substitui ID existente
                    url.username = url.username.replace(/sessid-[a-zA-Z0-9]+/, `sessid-${randomId}`);
                } else {
                    // Adiciona novo ID
                    url.username = `${url.username}-sessid-${randomId}`;
                }
            } else {
                // Bright Data/Outros usa: user-zone-session-ID
                if (url.username.includes('-session-')) {
                    url.username = url.username.replace(/-session-[^-:]+/, `-session-${randomId}`);
                } else {
                    url.username = url.username ? `${url.username}-session-${randomId}` : `session-${randomId}`;
                }
            }

            const rotatedUrl = url.toString();
            // ID para logs internos
            const id = isOxylabs ? `sessid-${randomId}` : `session-${randomId}`;

            // Cria o Agente (Configuração Limpa, o Baileys abre o socket)
            const agent = new HttpsProxyAgent(rotatedUrl, {
                keepAlive: true,
                keepAliveMsecs: 5000,
                maxSockets: 10,
                scheduling: 'lifo',
                timeout: 30000,
                rejectUnauthorized: false
            });

            return {
                id,
                agent,
                createdAt: Date.now()
            };

        } catch (e) {
            this.logger.error(`[TURBO] Create Agent Failed: ${e.message}`);
            return null;
        }
    }
}
