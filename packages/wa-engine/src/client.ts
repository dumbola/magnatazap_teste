import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    UserFacingSocketConfig,
    ConnectionState,
    Browsers,
    delay
} from '@whiskeysockets/baileys';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as https from 'https'; // Usado para validar o proxy
import pino from 'pino';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import NodeCache = require('node-cache'); // [FIX] TS-compatible Require to avoid default constructor error

// [CRÍTICO] Permite que o Node aceite certificados interceptados pelo Proxy (Bright Data/Oxylabs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export interface WhatsappSessionConfig {
    instanceName: string;
    sessionsDir: string;
    phoneNumber?: string;
    name?: string; // [FIX] Added for Sticky IP Logic
    printQR?: boolean;
    onQR?: (qr: string) => void;
    onPairingCode?: (code: string) => void;
    onIpFound?: (ip: string) => void; // [NEW] Callback for Public IP
    onStatusChange?: (status: Partial<ConnectionState>) => void;
    proxyUrl?: string;
    browser?: [string, string, string];
    agent?: any; // [TURBO] Injected Agent from Pool
}

export class WhatsappClient {
    public socket: any;
    public agent: any; // [EXPOSED] For manual checks
    private config: WhatsappSessionConfig;
    private logger = pino({ level: 'info' }); // Nível INFO para ver o status do proxy
    private isDestroyed = false; // Added to match original destruction logic
    private hasGeneratedCode = false; // Added to match original pairing logic

    // [NEW] Retry Cache to prevent disconnections on ACK failure
    private msgRetryCounterCache = new NodeCache();
    private pendingConnectionTimeout: NodeJS.Timeout | null = null; // [ANTI-FALSE POSITIVE]
    private retryCount = 0;

    constructor(config: WhatsappSessionConfig) {
        this.config = config;
        // [OBSERVABILITY] Bind Instance Name to Logger
        this.logger = this.logger.child({ instance: config.instanceName });
        // [STABILITY] Prevent MaxListenersExceededWarning
        process.setMaxListeners(0);
    }

    /**
     * Valida se o Proxy está funcional antes de iniciar o WhatsApp.
     * Isso impede conexões fantasmas ou timeouts silenciosos.
     */
    private async validateProxy(agent: any, proxyUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.logger.info(`[PROXY CHECK] Testando conectividade com Proxy...`);

            // 1. Validate WhatsApp Access
            const options = {
                hostname: 'web.whatsapp.com',
                port: 443,
                path: '/',
                method: 'HEAD',
                agent: agent,
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
                    this.logger.info(`[PROXY SUCCESS] Conexão confirmada via ${proxyUrl.split('@')[1] || 'Proxy'}`);

                    // [NEW] Fire-and-forget IP Check to reveal real public IP
                    this.checkPublicIp(agent).catch(e => this.logger.warn(`[IP CHECK FAIL] ${e.message}`));

                    resolve();
                } else {
                    reject(new Error(`Proxy respondeu com Status ${res.statusCode}`));
                }
            });

            req.on('error', (e) => {
                reject(new Error(`Falha na conexão com Proxy: ${e.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout ao testar Proxy (Lentidão Excessiva)'));
            });

            req.end();
        });
    }

    /**
     * [NEW] Check Public IP via Proxy
     */
    /**
     * [NEW] Check Public IP via Proxy
     */
    public async checkPublicIp(agent: any): Promise<void> {
        return new Promise((resolve) => {
            const options = {
                hostname: 'api.ipify.org',
                path: '/?format=json',
                method: 'GET',
                agent: agent,
                timeout: 5000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.ip && this.config.onIpFound) {
                            this.logger.info(`[PUBLIC IP] Detectado: ${json.ip}`);
                            this.config.onIpFound(json.ip);
                        }
                    } catch (e) { }
                    resolve();
                });
            });
            req.on('error', () => resolve());
            req.end();
        });
    }

    public async init() {
        this.hasGeneratedCode = false; // [FIX] Reset flag on re-init to allow new pairing codes

        // [FIX] Reset retry cache logic on re-init to prevent "Waiting for message" loop
        this.msgRetryCounterCache = new NodeCache();
        try {
            // 1. Setup de Pastas e Autenticação
            if (!fs.existsSync(this.config.sessionsDir)) {
                fs.mkdirSync(this.config.sessionsDir, { recursive: true });
            }

            const sessionPath = path.join(this.config.sessionsDir, this.config.instanceName);
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            this.logger.info(`[INIT] Iniciando ${this.config.instanceName} v${version.join('.')}`);

            // 2. Configuração de Proxy (TURBO vs STANDARD)
            let proxyUrl = this.config.proxyUrl;
            let shouldRotate = false;

            const systemProxies = (process.env.WA_PROXY_URL || '').split(',').map(p => p.trim());

            // [AUTO-INDENTIFY] Se a proxy salva for igual a uma proxy do sistema, ative a rotação
            if (proxyUrl && systemProxies.some(p => p === proxyUrl.trim())) {
                shouldRotate = true;
            }

            // Fallback para ENV se não houver config
            if (!proxyUrl && systemProxies.length > 0 && systemProxies[0]) {
                proxyUrl = systemProxies[0];
                shouldRotate = true;
            }

            let agent: any = undefined;

            // [A] MODO TURBO (Prioridade Máxima - Injeção do Pool)
            if (this.config.agent) {
                this.logger.info(`[TURBO] 🚀 Usando Agente Pré-Aquecido (Zero Latency).`);
                agent = this.config.agent;
                this.agent = agent;
            }
            // [B] MODO STANDARD (Criação Manual / Fallback)
            else if (proxyUrl) {
                if (!proxyUrl.startsWith('http')) proxyUrl = `http://${proxyUrl}`;

                try {
                    const { HttpsProxyAgent } = require('https-proxy-agent');
                    const url = new URL(proxyUrl);

                    // [ROTAÇÃO UNIVERSAL] Suporte a Webshare e BrightData
                    if (shouldRotate) {
                        const isWebshare = url.hostname.includes('webshare.io');

                        if (isWebshare) {
                            // Webshare: NÃO modifica o username. A rotação é controlada pelo painel do Webshare.
                            // Cada nova conexão recebe um IP diferente automaticamente.
                            this.logger.info(`[PROXY] Webshare Rotating - usando credenciais originais (rotação automática)`);
                        } else {
                            // BrightData/Outros: Injeção de Session ID no username para sticky IP
                            const timestampKey = Math.floor(Date.now() / (1000 * 60 * 10));
                            const seed = `${this.config.name}-${timestampKey}`;

                            let hash = 0;
                            for (let i = 0; i < seed.length; i++) {
                                hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                                hash |= 0;
                            }
                            const randomId = Math.abs(hash) % 1000000;

                            this.logger.info(`[STICKY IP] Gerado Session ID: ${randomId} para instância ${seed}`);

                            if (url.username.includes('-session-')) {
                                url.username = url.username.replace(/-session-[^-:]+/, `-session-${randomId}`);
                            } else {
                                url.username = url.username ? `${url.username}-session-${randomId}` : `session-${randomId}`;
                            }
                            this.logger.info(`[PROXY ROTATION] Novo Túnel (BRD - Sticky): ${url.username}`);
                        }
                    }

                    const rotatedProxyUrl = url.toString();

                    // [CORREÇÃO FINAL] Estabilidade + Camuflagem Humana (JA3 Spoofing)
                    agent = new HttpsProxyAgent(rotatedProxyUrl, {
                        // 1. Estabilidade: Mantém o túnel TCP aberto (evita quedas a cada msg)
                        keepAlive: true,
                        keepAliveMsecs: 1000,
                        maxSockets: 256,
                        scheduling: 'lifo',
                        timeout: 60000,
                        rejectUnauthorized: false,

                        // 2. Camuflagem: Cifras na ordem exata do Google Chrome (Bypass Anti-Bot)
                        ciphers: [
                            'TLS_AES_128_GCM_SHA256',
                            'TLS_AES_256_GCM_SHA384',
                            'TLS_CHACHA20_POLY1305_SHA256',
                            'ECDHE-ECDSA-AES128-GCM-SHA256',
                            'ECDHE-RSA-AES128-GCM-SHA256',
                            'ECDHE-ECDSA-AES256-GCM-SHA384',
                            'ECDHE-RSA-AES256-GCM-SHA384',
                            'ECDHE-ECDSA-CHACHA20-POLY1305',
                            'ECDHE-RSA-CHACHA20-POLY1305',
                            'ECDHE-RSA-AES128-SHA',
                            'ECDHE-RSA-AES256-SHA',
                            'AES128-GCM-SHA256',
                            'AES256-GCM-SHA384',
                            'AES128-SHA',
                            'AES256-SHA'
                        ].join(':'),
                        honorCipherOrder: true,
                        minVersion: 'TLSv1.2',
                        ecdhCurve: 'auto'
                    });

                    this.agent = agent;

                } catch (error) {
                    this.logger.error(`[PROXY FATAL] Erro ao criar agente: ${error}`);
                    throw new Error('Falha na configuração do Proxy');
                }
            }

            // 3. Configuração do Socket Baileys
            const socketConfig: UserFacingSocketConfig = {
                version,
                logger: this.logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, this.logger),
                },
                agent, // Agente Injetado

                mobile: false,
                browser: this.config.browser || Browsers.macOS('Chrome'), // [FIX] Use Mac OS for better trust score
                // [FEATURE] Enable Link Preview for rich messages. Fallback handled in CampaignProcessor.
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,

                // [HARDENING] Boosted Timeouts & Retry Logic
                connectTimeoutMs: 60000,       // [FIX] 60s (Fail faster to retry next proxy)
                defaultQueryTimeoutMs: 60000,  // [FIX] 60s
                keepAliveIntervalMs: 20000,    // [FIX] 20s (Faster than Proxy Timeout of 30s)
                retryRequestDelayMs: 5000,      // [FIX] 5s (More patience between retries)

                // [FIX] Message Retry Cache
                msgRetryCounterCache: this.msgRetryCounterCache,

                // [FIX] Ignore Group Updates to save bandwidth
                shouldIgnoreJid: jid => typeof jid === 'string' && jid.includes('@g.us')
            };

            this.socket = makeWASocket(socketConfig);

            // 4. Event Listeners
            this.socket.ev.on('creds.update', saveCreds);

            this.socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (connection === 'connecting') {
                    this.logger.info(`[STATUS] 🟡 Conectando via ${proxyUrl || 'DIRECT'}...`);
                    // [FIX] Emit CONNECTING immediately so UI shows "Connecting..."
                    if (this.config.onStatusChange) this.config.onStatusChange({ connection: 'connecting' });
                }

                // Lógica de Pairing Code
                if (qr && this.config.phoneNumber && !this.hasGeneratedCode) {
                    this.logger.info(`[PAIRING] QR Recebido. Aguardando estabilização...`);
                    this.hasGeneratedCode = true;

                    setTimeout(async () => {
                        try {
                            if (!this.socket) return;
                            // Delay de segurança
                            await delay(5000);

                            const cleanPhone = this.config.phoneNumber!.replace(/\D/g, "");
                            const code = await this.socket.requestPairingCode(cleanPhone);
                            this.logger.info(`[PAIRING SUCCESS] 🟢 Código Gerado: ${code}`);

                            if (this.config.onPairingCode) this.config.onPairingCode(code);
                        } catch (err: any) {
                            this.logger.error(`[PAIRING ERROR] Falha: ${err.message}`);
                            this.hasGeneratedCode = false;
                        }
                    }, 0);
                }

                // Lógica de Reconexão
                if (connection === 'open') {
                    this.logger.info(`[STATUS] 🟢 Conectado! (Aguardando estabilização de 5s...)`);
                    this.retryCount = 0;

                    // [ANTI-FALSE POSITIVE] Quarentena de Conexão
                    // Só confirma status "CONNECTED" se a conexão durar > 5 segundos.
                    // Isso evita que o Pixel dispare para sessões que caem por revogação (401) logo em seguida.
                    if (this.pendingConnectionTimeout) clearTimeout(this.pendingConnectionTimeout);

                    this.pendingConnectionTimeout = setTimeout(() => {
                        // Checagem Dupla: Ainda estamos conectados?
                        if (this.socket?.user) {
                            this.logger.info(`[STATUS] 🟢 Conexão Estabilizada e Confirmada.`);

                            // [FIX] Only emit OPEN when fully stable
                            if (this.config.onStatusChange) {
                                this.config.onStatusChange({ connection: 'open' });
                            }
                        }
                        this.pendingConnectionTimeout = null;
                    }, 5000); // 5 Segundos de Prova de Vida
                }

                if (connection === 'close') {
                    // [ANTI-FALSE POSITIVE] Cancela confirmação se cair na quarentena
                    if (this.pendingConnectionTimeout) {
                        clearTimeout(this.pendingConnectionTimeout);
                        this.pendingConnectionTimeout = null;
                        this.logger.warn(`[STATUS] 🔴 Queda durante quarentena. Status CONNECTED cancelado.`);
                    }

                    // [FIX] Emit CLOSE immediately
                    if (this.config.onStatusChange) this.config.onStatusChange({ connection: 'close', lastDisconnect });

                    const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const error = lastDisconnect?.error as any;
                    // [FIX] Enhanced Recovery: Conflict, Stream Error, Connection Failure, MAC issues
                    const isRecoverable401 = reason === 401 && error?.message?.includes('Stream Errored');
                    const isConflict =
                        (error?.message?.toLowerCase().includes('conflict') ||
                            error?.message?.toLowerCase().includes('connection failure') ||
                            error?.message?.toLowerCase().includes('mac')) &&
                        reason !== 401; // [FIX] 401 is fatal unless it's a specific Stream Error

                    // [FIX] Allow reconnecting on Conflict (401) errors instead of treating as Fatal
                    // [RULE] Zombie Prevention: If 408 (Timeout) happens and we are NOT authenticated, 
                    // it means Pairing Code expired. We MUST NOT reconnect.
                    const isPairingTimeout = reason === 408 && !this.socket?.user;

                    const shouldReconnect = (
                        (reason !== DisconnectReason.loggedOut && !isPairingTimeout) ||
                        isConflict ||
                        isRecoverable401
                    );

                    this.logger.warn(`[CONNECTION] Fechada (Razão: ${reason}). Reconectar? ${shouldReconnect}`);

                    if (shouldReconnect && !this.isDestroyed) {
                        // [RESILIENCE] Jittered Retry
                        // Wait random 2-5s to avoid thundering herd on proxy
                        const jitter = Math.floor(Math.random() * 3000) + 2000;
                        this.logger.info(`[RETRY] Aguardando ${jitter}ms antes de reconectar...`);

                        setTimeout(async () => {
                            // [FIX] Ensure clean slate before re-init
                            if (this.socket) {
                                this.socket.end(undefined);
                                this.socket = undefined;
                            }
                            this.init().catch(e => this.logger.error('[RECONNECT ERROR]', e));
                        }, jitter);
                    } else {
                        this.logger.error('[STOP] Conexão encerrada permanentemente.');
                    }
                } else if (connection === 'open') {
                    this.logger.info(`[CONNECTION] ✅ Conectado com sucesso!`);
                }

                // [FIX] Removed unconditional emit to prevent race conditions
                // if (this.config.onStatusChange) this.config.onStatusChange(update);
            });

            return this.socket;

        } catch (error) {
            this.logger.error('[INIT FATAL] Erro ao iniciar cliente:', error);
            throw error;
        }
    }

    // Helpers
    public async updateProfileName(name: string) {
        if (!this.socket) throw new Error('Socket not initialized');
        return await this.socket.updateProfileName(name);
    }

    public async updateProfilePicture(jid: string, content: Buffer | { url: string }) {
        if (!this.socket) throw new Error('Socket not initialized');
        return await this.socket.updateProfilePicture(jid, content);
    }

    public destroy() {
        this.isDestroyed = true;
        this.config.onStatusChange = undefined; // prevent callbacks
        this.config.onQR = undefined;
        this.config.onPairingCode = undefined;

        try {
            this.socket?.end(undefined);
            this.socket = undefined;
            // [MEMORY] Explicitly destroy agent to close sockets
            if (this.agent && typeof this.agent.destroy === 'function') {
                this.agent.destroy();
                this.agent = undefined;
            }
        } catch (e) {
            this.logger.error('Error destroying socket', e);
        }
        this.logger.info(`Session ${this.config.instanceName} destroyed permanently.`);
    }

    public async updatePrivacySettings(value: 'all' | 'contacts' | 'none' = 'all') {
        if (!this.socket) return; // Silent fail
        this.logger.info(`[PRIVACY] Updating settings to '${value}'...`);

        try {
            // Node Structure for Privacy
            await this.socket.query({
                tag: 'iq',
                attrs: {
                    to: 's.whatsapp.net',
                    type: 'set',
                    xmlns: 'privacy'
                },
                content: [
                    {
                        tag: 'privacy',
                        attrs: {},
                        content: [
                            { tag: 'category', attrs: { name: 'profile', value: value } },
                            { tag: 'category', attrs: { name: 'status', value: value } },
                            { tag: 'category', attrs: { name: 'last', value: value } },
                        ]
                    }
                ]
            });
            this.logger.info(`[PRIVACY] Settings updated successfully.`);
        } catch (e: any) {
            this.logger.warn(`[PRIVACY] Failed to update settings: ${e.message}`);
        }
    }

    public async removeBusinessCover() {
        if (!this.socket) throw new Error('Socket not initialized');
        this.logger.info(`[BUSINESS] Attempting to remove cover photo...`);

        try {
            await this.socket.query({
                tag: 'iq',
                attrs: {
                    to: 's.whatsapp.net',
                    type: 'set',
                    xmlns: 'w:biz'
                },
                content: [{
                    tag: 'business_profile',
                    attrs: { v: '116' },
                    content: [{
                        tag: 'cover_photo',
                        attrs: { type: 'delete' }
                    }]
                }]
            });
            this.logger.info(`[BUSINESS] Cover photo removed.`);
        } catch (e: any) {
            // Ignore if not a business account or feature not supported
            this.logger.warn(`[BUSINESS] Failed to remove cover (Might not be Business account): ${e.message}`);
        }
    }
}
