import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WhatsappClient, WhatsappSessionConfig } from '@repo/wa-engine';
import { PrismaService } from '../prisma/prisma.service';
import { Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import { ProxyTurboService } from './proxy-turbo.service';
import { OpenaiService } from '../openai/openai.service';
import { ProfileService } from '../instance/profile.service';

import * as path from 'path';
import * as fs from 'fs';
import * as sharp from 'sharp';

@Injectable()
export class WhatsappService implements OnModuleInit {
    private readonly logger = new Logger(WhatsappService.name);
    public sessions = new Map<string, WhatsappClient>();
    private pairingCodes = new Map<string, { code: string, expiresAt: number }>();
    private connectionStatuses = new Map<string, string>();

    private proxyIndex = 0;

    // [FIX] Support multiple proxies (Comma separated)
    private readonly proxies: string[] = process.env.WA_PROXY_URL
        ? process.env.WA_PROXY_URL.split(',').map(p => p.trim())
        : [];

    constructor(
        private prisma: PrismaService,
        private proxyTurboService: ProxyTurboService,
        private openaiService: OpenaiService,
        private profileService: ProfileService
    ) { }

    async onModuleInit() {
        this.logger.log(`[INIT] OnModuleInit starting...`);
        // [AUTO-HEAL] Start Periodic Zombie Sweeper
        this.startHealthCheck();

        const instances = await this.prisma.instance.findMany({
            where: {
                status: {
                    in: ['CONNECTED', 'CONNECTING']
                }
            },
        });
        this.logger.log(`[INIT] Found ${instances.length} instances to restore (CONNECTED + CONNECTING).`);

        for (const instance of instances) {
            this.logger.log(`Restoring session: ${instance.name} (${instance.status})`);
            if (instance.sessionId && instance.userId) {
                // [LISO] Staggered Startup (Fila Indiana)
                // Evita pico de CPU que causa Timeout
                try {
                    await this.initSession(instance.sessionId, instance.name, instance.userId);
                } catch (e) {
                    this.logger.error(`[INIT] Failed to restore ${instance.name}: ${e.message}`);
                }
                await new Promise(r => setTimeout(r, 2000)); // Espera 2s entre cada boot
            }
        }
        this.logger.log(`[INIT] Restoration complete.`);
    }

    private healthCheckInterval: NodeJS.Timeout | null = null;

    // Converted to separate init method to avoid duplication if multiple hooks exist
    // onModuleInit is already declared above
    // private initSweeper() { // This method is now redundant as startHealthCheck is called directly in onModuleInit
    //     this.startHealthCheck();
    // }

    onModuleDestroy() {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    }

    /**
     * [PROACTIVE] Periodic Zombie Sweeper
     * Scans all "CONNECTED" sessions. If socket.user is missing, it's a Zombie.
     * Forcefully updates status to DISCONNECTED to reflect reality in Dashboard.
     */
    private startHealthCheck() {
        if (this.healthCheckInterval) return;

        this.logger.log('[HEALTH] 🏥 Starting Proactive Zombie Sweeper (Every 60s)');

        this.healthCheckInterval = setInterval(async () => {
            console.log(`[DEBUG] Health check interval tick. Active sessions: ${this.sessions.size}`);
            const activeSessions = Array.from(this.sessions.keys());
            this.logger.warn(`[HEALTH] Checking ${activeSessions.length} active sessions.`);
            const now = Date.now();

            // [STRICT] 1. Cleanup Expired Pairing Codes & Stuck Connecting
            this.pairingCodes.forEach((data, sessionId) => {
                if (now > data.expiresAt) {
                    this.logger.warn(`[TIMEOUT] ⏳ Pairing Code Expired for ${sessionId}. Checking authentication...`);

                    // [RULE 1] No Zombies: If expired AND not authenticated, DELETE immediately.
                    const client = this.sessions.get(sessionId);
                    if (client?.socket?.user) {
                        this.logger.log(`[TIMEOUT] ${sessionId} is authenticated. Ignoring expiration.`);
                        this.pairingCodes.delete(sessionId);
                        return;
                    }

                    this.logger.warn(`[ZOMBIE KILL] 🧟 Expired Pairing & Unauthenticated. DELETING ${sessionId} from DB.`);
                    this.pairingCodes.delete(sessionId);
                    this.updateStatus(sessionId, 'DISCONNECTED');
                    
                    // Rule 1: Immediate Deletion from DB (keepRecord = false)
                    this.deleteSession(sessionId, false);
                }
            });

            for (const sessionId of activeSessions) {
                const client = this.sessions.get(sessionId);
                const status = this.connectionStatuses.get(sessionId);

                // [STRICT] 2. Timeout for Stuck 'CONNECTING' (Any Stuck State) or Looping DISCONNECTED
                if (status === 'CONNECTING' || status === 'DISCONNECTED') {
                    const startTime = this.connectionStartTimes.get(sessionId);
                    if (startTime) {
                        const age = now - startTime;
                        this.logger.warn(`[TIMEOUT CHECK] ${sessionId} | Status: ${status} | Age: ${age / 1000}s`);

                        if (age > 120000) {
                            this.logger.warn(`[AUTO-CLEANUP] 🗑️ Connection Stuck/Looping for ${sessionId} (> 2m). Deleting instance.`);
                            this.updateStatus(sessionId, 'DISCONNECTED');
                            this.connectionStartTimes.delete(sessionId);
                            await this.deleteSession(sessionId, false);
                        }
                    } else {
                        this.logger.warn(`[TIMEOUT CHECK] ${sessionId} | Status: ${status} | No Start Time - Skipping`);
                    }
                }

                // [STRICT] 3. Target: Connected locally but Dead Socket
                if (status === 'CONNECTED' && client?.socket && !client.socket.user) {
                    this.logger.warn(`[AUTO-CLEANUP] 🗑️ Zombie Detected: ${sessionId}. (Status: CONNECTED, User: NULL). Deleting instance.`);
                    this.updateStatus(sessionId, 'DISCONNECTED');
                    await this.deleteSession(sessionId, false);
                }
            }

            // [STRICT] 4. DB Sweep: Remove instâncias DISCONNECTED órfãs (sem sessão ativa em memória)
            try {
                const orphans = await this.prisma.instance.findMany({
                    where: { status: 'DISCONNECTED' }
                });
                for (const orphan of orphans) {
                    if (!this.sessions.has(orphan.sessionId)) {
                        this.logger.warn(`[AUTO-CLEANUP] 🗑️ Orphan instance ${orphan.name} (${orphan.sessionId}) found DISCONNECTED in DB with no active session. Deleting.`);
                        await this.deleteSession(orphan.sessionId, false);
                    }
                }
            } catch (e) {
                this.logger.error(`[AUTO-CLEANUP] DB Sweep failed: ${e.message}`);
            }
        }, 30000); // Check every 30 seconds
    }

    private pendingDisconnects = new Map<string, NodeJS.Timeout>();
    private connectionStartTimes = new Map<string, number>(); // [STRICT] Track Start Time

    async initSession(sessionId: string, name: string, userId: string, phoneNumber?: string, useTurbo = false, retryCount = 0): Promise<any> {
        // [STRICT] Start Clock
        this.connectionStartTimes.set(sessionId, Date.now());
        this.connectionStatuses.set(sessionId, 'CONNECTING');

        // [SECURITY] Strict Session Ownership Check
        if (this.sessions.has(sessionId)) {
            const client = this.sessions.get(sessionId);

            // [FIX] Zombie Session: Force destroy before re-creating
            if (client) {
                this.logger.warn(`[ZOMBIE] Destroying stale session for ${sessionId} before re-init`);
                await client.destroy(); // Await destruction
                this.sessions.delete(sessionId);
                // [MEMORY] Force GC if exposed
                if (global.gc) {
                    this.logger.debug('[MEMORY] Running Manual GC to clear zombie session');
                    global.gc();
                }
            }
        }

        // [AUTO-HEAL] Start Periodic Zombie Sweeper
        this.startHealthCheck();

        const cleanPhone = phoneNumber?.replace(/\D/g, '');
        const sessionsDir = path.resolve(__dirname, '../../../../sessions');

        // [CONFIG] 1. Check for existing Persistent Config to Ensure Immutability
        const existingInstance = await this.prisma.instance.findUnique({ where: { sessionId } });
        let sessionConfig: { proxyUrl?: string, browser?: [string, string, string] } = {};

        try {
            if (existingInstance?.proxyConfig) {
                // Handle legacy string (just proxyUrl) or new JSON
                if (existingInstance.proxyConfig.trim().startsWith('{')) {
                    sessionConfig = JSON.parse(existingInstance.proxyConfig);
                } else {
                    sessionConfig = { proxyUrl: existingInstance.proxyConfig };
                }
            }
        } catch (e) {
            this.logger.warn(`Failed to parse proxyConfig for ${sessionId}, resetting.`);
        }

        // [HARDENING] Blacklist Unstable IPs (User Request)
        if (sessionConfig.proxyUrl && sessionConfig.proxyUrl.includes('.85.28.')) {
            this.logger.warn(`[PROXY GUARD] 🛡️ Blocked unstable proxy ${sessionConfig.proxyUrl} for ${sessionId}. Falling back to pool.`);
            delete sessionConfig.proxyUrl;
        }

        // [CONFIG] 2. Assign Persistent Browser (If missing or Ubuntu) - force Mac OS transition (Restored from Backup)
        if (!sessionConfig.browser || sessionConfig.browser[0] === 'Ubuntu') {
            sessionConfig.browser = Browsers.macOS('Chrome');
            this.logger.log(`[CONFIG] Updated/Assigned Persistent Browser for ${sessionId} to MacOS`);
        }

        // [CONFIG] 3. Assign Persistent Proxy (If missing and available)
        if (!sessionConfig.proxyUrl && this.proxies.length > 0) {
            sessionConfig.proxyUrl = this.proxies[this.proxyIndex % this.proxies.length];
            this.proxyIndex++;
            this.logger.log(`[CONFIG] Assigned New Persistent Proxy for ${sessionId}: ${sessionConfig.proxyUrl}`);
        } else if (!sessionConfig.proxyUrl) {
            this.logger.warn(`[CONFIG] No proxy configured/available for ${sessionId}. Using DIRECT.`);
        }

        const proxyConfigString = JSON.stringify(sessionConfig);

        // [CONFIG] 4. Save to DB (Upsert) - Persisting the immutable config
        await this.prisma.instance.upsert({
            where: { sessionId },
            update: { status: 'CONNECTING', phone: cleanPhone, name, proxyConfig: proxyConfigString },
            create: { sessionId, name, userId, status: 'CONNECTING', phone: cleanPhone, proxyConfig: proxyConfigString },
        });

        // [TURBO MODE] Active only for NEW connections (Pairing Phase)
        let turboAgent;
        if (useTurbo && !sessionConfig.proxyUrl) {
            // Only engage Turbo if explicitly requested (Manual Init) AND no custom proxy set.
            const turboResult = this.proxyTurboService.createUniversalAgent();
            if (turboResult?.agent) {
                turboAgent = turboResult.agent;
                this.logger.log(`[TURBO] Injected Pre-Warmed Agent for ${name} (Pairing Mode)`);
            }
        }

        const config: WhatsappSessionConfig = {
            instanceName: sessionId,
            sessionsDir,
            phoneNumber: cleanPhone,
            proxyUrl: sessionConfig.proxyUrl, // Fallback to DB if Agent is null
            browser: sessionConfig.browser,   // Persistent Browser
            name: name, // [FIX] Sticky IP Identity
            agent: turboAgent, // [INJECTION] Inject Pre-Warmed Agent (Tcp/Tls Ready)

            printQR: false,
            onPairingCode: async (code) => {
                console.log(`[DEBUG SERVICE] Pairing Code Received for ${sessionId}: ${code}`);
                this.logger.log(`Pairing Code for ${sessionId} (${name}): ${code}`);
                // [EXPIRATION] Code allows max 2 mins. We set 1m50s to be safe visually.
                this.pairingCodes.set(sessionId, { code, expiresAt: Date.now() + 110000 });
                console.log(`[DEBUG SERVICE] Code stored in map. Keys: ${Array.from(this.pairingCodes.keys())}`);
            },
            onIpFound: async (ip) => {
                // [NEW] Save Public IP to DB
                this.logger.log(`[IP REVEAL] ${name} (${sessionId}) is using Public IP: ${ip}`);
                await this.prisma.instance.update({
                    where: { sessionId },
                    data: { lastKnownIp: ip, lastIpCheck: new Date() }
                }).catch(e => this.logger.warn(`Failed to save IP for ${sessionId}: ${e.message}`));
            },
            onStatusChange: async (update) => {
                const { connection, lastDisconnect } = update;

                // [DEBUG] Trace Event Propagation (Is Service receiving the event?)
                if (connection === 'close') {
                    this.logger.warn(`[EVENT] Service received 'close' event for ${sessionId}. Status: ${JSON.stringify((lastDisconnect?.error as any)?.output?.statusCode)}`);
                }

                // [RESILIENCE] State Protection
                if (connection === 'close') {
                    // Rule: If we have an active pairing code, IGNORE the close event (don't scare the UI).
                    if (this.pairingCodes.has(sessionId)) {
                        this.logger.warn(`[STATE PROTECT] Socket closed for ${sessionId} but Pairing Code is active. Ignoring DISCONNECTED state.`);
                        return;
                    }
                }

                // [FIX] Update Real-time Status Map (Normal Flow)
                if (connection) {
                    const status = connection === 'open' ? 'CONNECTED' : (connection === 'close' ? 'DISCONNECTED' : 'CONNECTING');
                    this.connectionStatuses.set(sessionId, status);
                }

                if (connection === 'open') {
                    // [HISTORY FIX] Debounce Check
                    // If we were "disconnecting" but reconnected quickly, cancel the disconnect!
                    if (this.pendingDisconnects.has(sessionId)) {
                        this.logger.log(`[HISTORY] 🔄 Instability Resolved for ${sessionId}. Cancelling pending disconnect status.`);
                        clearTimeout(this.pendingDisconnects.get(sessionId));
                        this.pendingDisconnects.delete(sessionId);
                        // NO NEW LOG. We pretend we never left.

                        // We STILL need to ensure the DB knows we are connected (just in case)
                        await this.prisma.instance.update({
                            where: { sessionId },
                            data: { status: 'CONNECTED' },
                        }).catch(() => { });

                        return; // EXIT early
                    }

                    // Success! Clear code & timer.
                    this.pairingCodes.delete(sessionId);
                    this.connectionStartTimes.delete(sessionId); // [STRICT] Stop Clock
                    const user = this.sessions.get(sessionId)?.socket?.user;
                    // [FIX] Sanitize phone number (remove @s.whatsapp.net and device ID)
                    const phone = user?.id ? user.id.split(':')[0].split('@')[0] : undefined;

                    // 1. Update Instance Status
                    await this.prisma.instance.update({
                        where: { sessionId },
                        data: { status: 'CONNECTED', phone },
                    });

                    // 2. Log Connection Event (Start of Session)
                    await this.prisma.connectionLog.create({
                        data: {
                            instanceName: sessionId, // Storing SessionID for consistent joining with Logs
                            status: 'CONNECTED',
                            timestamp: new Date()
                        }
                    }).catch(e => this.logger.error(`Failed to log CONNECT: ${e.message}`));

                    // [ANTI-BAN] Harvester: Extract Safe Contacts (Friends)
                    setTimeout(async () => {
                        try {
                            const client = this.sessions.get(sessionId);
                            // @ts-ignore - Accessing internal store if available
                            const store = (client as any).store;

                            if (store && store.chats) {
                                const chats = Object.values(store.chats);
                                const safeContacts = chats
                                    .filter((c: any) => c.id.endsWith('@s.whatsapp.net') && !c.id.includes('broadcast'))
                                    // @ts-ignore
                                    .sort((a: any, b: any) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0))
                                    .slice(0, 15)
                                    .map((c: any) => c.id);

                                if (safeContacts.length > 0) {
                                    await this.prisma.instance.update({
                                        where: { sessionId },
                                        data: { warmupNumbers: safeContacts }
                                    });
                                    this.logger.log(`[HARVESTER] ${safeContacts.length} safe contacts saved for instance ${name}`);
                                }
                            } else {
                                this.logger.debug(`[HARVESTER] Store not available for ${name}, skipping harvest.`);
                            }
                        } catch (e) {
                            this.logger.warn(`[HARVESTER] Failed to harvest contacts for ${name}: ${e.message}`);
                        }
                    }, 5000);

                    // [AUTO-HUMANIZE] Trigger after connection is fully stable (15s buffer)
                    setTimeout(() => {
                        this.autoHumanize(sessionId).catch(e =>
                            this.logger.error(`[AUTO-HUMANIZE] Unhandled error: ${e.message}`)
                        );
                    }, 15000);

                } else if (connection === 'close') {
                    // [DEBUG] Inspect Raw Disconnect Object
                    this.logger.warn(`[DEBUG] Connection Closed. LastDisconnect: ${JSON.stringify(lastDisconnect, null, 2)}`);

                    const error = lastDisconnect?.error as any;
                    const statusCode = error?.output?.statusCode;
                    const errorMsg = error?.message || 'Unknown Error';

                    // [Reason Logic]
                    let reason = "UNKNOWN";
                    let metadata = {};

                    if (statusCode === 401) {
                        const msgLower = errorMsg.toLowerCase();
                        // [FIX] Catch 'conflict' OR 'Connection Failure' as Recoverable
                        if (msgLower.includes('conflict') || msgLower.includes('connection failure') || msgLower.includes('mac')) {
                            reason = "CONFLICT"; // Retry instead of Wipe
                        } else {
                            reason = "LOGGED_OUT";
                        }
                    }
                    else if (statusCode === 403) reason = "BANNED";
                    else if (statusCode === 515 || statusCode === 500) reason = "STREAM_ERROR";
                    else if (statusCode === 408 || statusCode === 504) reason = "TIMEOUT";
                    else if (statusCode === 407 || statusCode === 502 || errorMsg.includes('Proxy')) reason = "PROXY_ERROR";
                    else reason = "CONNECTION_LOST";

                    metadata = {
                        error: error?.message,
                        stack: error?.stack,
                        statusCode
                    };

                    this.logger.error(`[DISCONNECT] Instance ${name} (${sessionId}) - Reason: ${reason} (${statusCode})`);

                    // [HISTORY FIX] Debounce Disconnects (Instability Filter)
                    // If FATAL (Banned/LoggedOut), log immediately.
                    // If network error, wait 45s to see if it recovers (proxy/slow networks need more time).
                    if (['LOGGED_OUT', 'BANNED'].includes(reason)) {
                        await this.finalizeDisconnect(sessionId, reason, metadata, name);
                    } else {
                        const gracePeriodMs = 45000; // 45s - was 20s; Baileys reconnection under load can take longer
                        this.logger.warn(`[HISTORY] ⏳ Instability Detected for ${sessionId}. Waiting ${gracePeriodMs / 1000}s before marking as DISCONNECTED...`);

                        // Clear existing if any (refresh timer)
                        if (this.pendingDisconnects.has(sessionId)) clearTimeout(this.pendingDisconnects.get(sessionId));

                        const timeout = setTimeout(async () => {
                            this.logger.warn(`[HISTORY] ❌ Instability Timeout for ${sessionId}. Marking as DISCONNECTED.`);
                            this.pendingDisconnects.delete(sessionId);
                            await this.finalizeDisconnect(sessionId, reason, metadata, name);
                        }, gracePeriodMs);

                        this.pendingDisconnects.set(sessionId, timeout);
                    }
                }
            },
        };

        // [DEBUG] Log Configuration Used
        this.logger.log(`[INIT] Initializing Session ${sessionId} with Proxy: ${sessionConfig.proxyUrl || 'DIRECT'} | Browser: ${sessionConfig.browser?.join('/')}`);

        const client = new WhatsappClient(config);
        this.sessions.set(sessionId, client);
        this.connectionStatuses.set(sessionId, 'CONNECTING');

        // [LOG] Log initial attempt
        await this.prisma.connectionLog.create({
            data: {
                instanceName: sessionId,
                status: 'CONNECTING',
                timestamp: new Date()
            }
        }).catch(e => this.logger.error(`Failed to log CONNECTING: ${e.message}`));



        // [RESILIENCE] Init with Trap
        client.init().then(() => {
            this.logger.log(`[INIT] Client.init() resolved for ${sessionId}`);
            // DEBUG: Listen to ACKs
            client.socket?.ev.on('messages.update', (updates) => {
                for (const update of updates) {
                    this.logger.log(`ACK Update for ${sessionId}: ${JSON.stringify(update)}`);
                }
            });
        }).catch(e => {
            // [ERROR SURVIVAL]
            const msg = e?.message || '';
            const isProxyError = msg.includes('512') || msg.includes('Proxy') || msg.includes('Bad Gateway');

            if (isProxyError) {
                // SWALLOW THE ERROR so the Controller doesn't crash 500/512.
                // We leave the status as 'CONNECTING' (set previously) so the user keeps waiting.
                // The Baileys client might auto-retry internally or we wait for user retry.
                this.logger.warn(`[INIT SURVIVAL] Swallowing Proxy Error for ${sessionId}: ${msg}. Keeping instance in CONNECTING state.`);
            } else {
                this.logger.error(`[INIT] FATAL: Client.init() failed for ${sessionId}`, e);
                // Update status to DISCONNECTED to reflect failure
                this.prisma.instance.update({
                    where: { sessionId },
                    data: { status: 'DISCONNECTED' }
                }).catch(err => this.logger.error(`Failed to update status on init error`, err));
                this.connectionStatuses.set(sessionId, 'DISCONNECTED');
            }
        });


        /* [LEGACY MODE] Watchdog Disabled
         * The legacy client handles its own connection loop. We should not interrupt it.
        setTimeout(async () => {
            const currentStatus = this.connectionStatuses.get(sessionId);
            const hasCode = this.pairingCodes.has(sessionId);
            const isConnected = currentStatus === 'CONNECTED';
            const isClientReady = client.socket?.user;
         
            if (hasCode || isConnected || isClientReady) {
                this.logger.log(`[WATCHDOG] Instance ${name} started successfully (Code or Connected).`);
                return;
            }
         
            // FAILED (Stuck in 'TENTANDO')
            if (retryCount < 3) {
                this.logger.warn(`[WATCHDOG] Instance ${name} stuck generating code (Try ${retryCount + 1}/3). Retrying SAME config...`);
                this.wipeSessionAuth(sessionId);
                this.initSession(sessionId, name, userId, phoneNumber, retryCount + 1);
            } else {
                this.logger.error(`[WATCHDOG] Instance ${name} failed to generate code after 3 attempts. Aborting.`);
                this.connectionStatuses.set(sessionId, 'DISCONNECTED');
                await this.prisma.instance.update({ where: { sessionId }, data: { status: 'DISCONNECTED' } }).catch(() => { });
            }
        }, 40000);
        */

        // Add 5s delay to allow initial connection
        await new Promise(r => setTimeout(r, 2000));
        return { status: 'CONNECTING', pairingCode: null };
    }

    // [AUTO-ROTATION] Watchdog & Rotation Logic
    private async rotateSessionConfig(sessionId: string) {
        const instance = await this.prisma.instance.findUnique({ where: { sessionId } });
        if (!instance) return;

        // 1. Next Proxy (Circular)
        const nextProxy = this.proxies.length > 0
            ? this.proxies[this.proxyIndex % this.proxies.length]
            : undefined;
        this.proxyIndex++;

        // 2. New Browser (Standard)
        const newBrowser = Browsers.ubuntu('Chrome');

        // 3. Update DB
        const newConfig = {
            proxyUrl: nextProxy,
            browser: newBrowser
        };
        const proxyConfigString = JSON.stringify(newConfig);

        await this.prisma.instance.update({
            where: { sessionId },
            data: { proxyConfig: proxyConfigString }
        });

        this.logger.warn(`[WATCHDOG] Rotation Triggered for ${instance.name}: New Proxy ${nextProxy || 'DIRECT'} | Browser ${newBrowser.join('/')}`);
    }

    // [HELPER] Safe Wipe of Session Files (Without deleting DB Record)
    private wipeSessionAuth(sessionId: string) {
        try {
            // 1. Close Window/Socket
            if (this.sessions.has(sessionId)) {
                this.sessions.get(sessionId)?.socket?.end(undefined);
                this.sessions.delete(sessionId);
            }
            // 2. Delete Folder
            // [FIX] Use more robust path resolution or absolute path for Docker
            let sessionsDir = path.resolve(__dirname, '../../../../sessions');

            // Docker Fallback
            if (!fs.existsSync(sessionsDir) && fs.existsSync('/app/sessions')) {
                sessionsDir = '/app/sessions';
            }

            const sessionPath = path.join(sessionsDir, sessionId);

            this.logger.warn(`[WIPE] Attempting to delete session at: ${sessionPath}`);

            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                this.logger.log(`[WIPE] ✅ Deleted session files for ${sessionId}`);
            } else {
                this.logger.warn(`[WIPE] Session path not found (already deleted?): ${sessionPath}`);
            }
        } catch (e) {
            this.logger.error(`[WIPE] Failed to wipe session for ${sessionId}: ${e.message}`);
        }
    }

    // [DEFIBRILLATOR] Force Reconnect Logic
    // Called when the Processor detects a Zombie (Connected but Unauthenticated)
    async reconnect(sessionId: string) {
        // Debounce: If already connecting, ignore
        if (this.connectionStatuses.get(sessionId) === 'CONNECTING') {
            this.logger.debug(`[RECONNECT] Skipping ${sessionId}, already connecting.`);
            return;
        }

        this.logger.warn(`[DEFIBRILLATOR] ⚡ Soft-Shocking ${sessionId} to force reconnection (No Wipe)...`);
        this.connectionStatuses.set(sessionId, 'CONNECTING');

        try {
            // 1. Force Destroy (if exists)
            if (this.sessions.has(sessionId)) {
                await this.sessions.get(sessionId)?.destroy();
                // Client removal is handled by destroy/disconnect logic or overwritten below
                // We keep the map entry for a split second or overwrite it.
            }

            // [FIX] Removed wipeSessionAuth(sessionId) to prevent logging out the user.
            // We just want to restart the socket connection.

            // 2. Fetch User ID/Name to Re-Init (From DB because we might have lost memory state)
            const instance = await this.prisma.instance.findUnique({ where: { sessionId } });
            if (instance) {
                // Re-Init (This will pick up the proxy and browser configs again)
                await this.initSession(sessionId, instance.name, instance.userId);
                this.logger.log(`[DEFIBRILLATOR] ⚡ ${sessionId} pulse restarted (Soft).`);
            } else {
                this.logger.error(`[DEFIBRILLATOR] Failed to find instance ${sessionId} in DB.`);
            }
        } catch (e) {
            this.logger.error(`[DEFIBRILLATOR] Failed to reconnect ${sessionId}: ${e.message}`);
        }
    }

    getStatus(sessionId: string) {
        const client = this.sessions.get(sessionId);
        if (!client) return null;

        // [SELF-HEALING] 1. Socket Truth Check
        // Use the socket's internal state as the Source of Truth.
        // If Baileys has a 'user', it IS connected.
        const isSocketActive = !!client.socket?.user;
        let status = this.connectionStatuses.get(sessionId) || (isSocketActive ? 'CONNECTED' : 'CONNECTING');

        if (isSocketActive && status === 'DISCONNECTED') {
            this.logger.warn(`[SELF-HEAL] Instance ${sessionId} found active socket but status was ${status}. Forcing CONNECTED.`);
            status = 'CONNECTED';
            this.connectionStatuses.set(sessionId, 'CONNECTED');

            // Fix DB Asynchronously
            this.prisma.instance.update({
                where: { sessionId },
                data: { status: 'CONNECTED', phone: client.socket.user.id.split(':')[0] }
            }).catch(e => this.logger.error(`[SELF-HEAL] DB Update failed: ${e.message}`));
        }

        // [RESILIENCE] 2. Pairing Code Priority
        // If we have a valid code, we override visual status to ensure user sees the code
        // UNLESS we are already definitely connected.
        const codeData = this.pairingCodes.get(sessionId);
        if (codeData) {
            if (Date.now() < codeData.expiresAt) {
                // Only show code if we are NOT fully connected
                if (status !== 'CONNECTED') {
                    return {
                        status: 'PAIRING',
                        pairingCode: codeData.code,
                        phone: null
                    };
                }
            } else {
                this.pairingCodes.delete(sessionId); // Expired
            }
        }

        return {
            status,
            pairingCode: null,
            phone: client.socket?.user?.id?.split(':')[0]?.split('@')[0]
        };
    }

    getSession(sessionId: string) {
        return this.sessions.get(sessionId);
    }

    async deleteSession(sessionId: string, keepRecord = true) {
        console.log(`[DEBUG] deleteSession called for ${sessionId} with keepRecord=${keepRecord}`);
        if (this.sessions.has(sessionId)) {
            // [FIX] Use new destroy method to prevent zombie reconnection
            const client = this.sessions.get(sessionId);
            await client?.destroy(); // Ensure agents are closed
            this.sessions.delete(sessionId);

            // [MEMORY] Force GC
            if (global.gc) {
                global.gc();
            }
            this.pairingCodes.delete(sessionId);
            this.connectionStartTimes.delete(sessionId); // [STRICT] Cleanup
            this.connectionStatuses.delete(sessionId);
        }

        // Cleanup Files
        const sessionsDir = path.resolve(__dirname, '../../../../sessions');
        const sessionPath = path.join(sessionsDir, sessionId);
        if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });

        // [FIX] Optional DB Deletion (keepRecord=true for Timeout Kill)
        if (!keepRecord) {
            await this.prisma.instance.delete({ where: { sessionId } });
        }
        return { success: true };
    }

    // [HELPER] Finalize Disconnect (Extracted for Debounce)
    private async finalizeDisconnect(sessionId: string, reason: string, metadata: any, name: string) {
        // Log Disconnection Event before deletion
        await this.prisma.connectionLog.create({
            data: {
                instanceName: sessionId,
                status: 'DISCONNECTED',
                reason: reason,
                metadata: metadata,
                timestamp: new Date()
            }
        }).catch(e => this.logger.error(`Failed to log DISCONNECT: ${e.message}`));

        // [AUTO-CLEANUP] Instância que não recuperou em 20s é considerada morta.
        // Excluir sessão + registro do DB para manter o dashboard limpo.
        this.logger.warn(`[AUTO-CLEANUP] 🗑️ Removing dead instance ${name} (${sessionId}). Reason: ${reason}`);
        await this.deleteSession(sessionId, false);
    }

    /**
     * [HELPER] Force Update Status (Used by Sweeper/Self-Healer)
     */
    updateStatus(sessionId: string, status: string) {
        this.connectionStatuses.set(sessionId, status);
    }

    // --- NOVOS MÉTODOS DE PERFIL ---

    // [ANTI-BAN] Helper to Sanitize Image (Strip Metadata + Standardize)
    private async sanitizeImage(buffer: Buffer): Promise<Buffer> {
        try {
            const cleanBuffer = await sharp(buffer)
                .resize(640, 640, { fit: 'cover' }) // Standard WA Size
                .toFormat('jpeg', { quality: 85 })
                // By default sharp strips metadata (Anti-Ban), so we don't call .withMetadata()
                .toBuffer();

            this.logger.log(`[ANTI-BAN] 🧼 Image Sanitized: ${buffer.length} -> ${cleanBuffer.length} bytes.`);
            return cleanBuffer;
        } catch (e) {
            this.logger.error(`[ANTI-BAN] Sanitization Failed: ${e.message}. Using original buffer.`);
            return buffer; // Fallback to avoid breaking
        }
    }

    async updateProfileName(sessionId: string, newName: string) {
        const session = this.sessions.get(sessionId);
        if (!session?.socket) throw new Error('Sessão não conectada');

        try {
            await session.socket.updateProfileName(newName);
        } catch (e: any) {
            this.logger.warn(`[PROFILE] Name update failed for ${sessionId} (Business Restricted?): ${e.message}`);
            // Proceed to ensure privacy settings are fixed even if name fails
        }

        // [PRIVACY] Force Everyone
        await session.updatePrivacySettings('all');
        // [BUSINESS] Try to remove cover if it exists (Clean Slate)
        await session.removeBusinessCover();
    }

    async updateProfileStatus(sessionId: string, newStatus: string) {
        const session = this.sessions.get(sessionId);
        if (!session?.socket) throw new Error('Sessão não conectada');
        await session.socket.updateProfileStatus(newStatus);
        // [PRIVACY] Force Everyone
        await session.updatePrivacySettings('all');
    }

    // [NEW] Manual IP Check Trigger
    async checkInstanceIp(sessionId: string) {
        const client = this.sessions.get(sessionId);
        if (!client) throw new Error('Sessão não encontrada / desconectada');

        // Use exposed agent or default
        if (client.agent) {
            await client.checkPublicIp(client.agent);
        } else {
            await client.checkPublicIp(undefined);
        }
    }

    async updateProfilePicture(sessionId: string, imageBase64: string) {
        const session = this.sessions.get(sessionId);
        if (!session?.socket) throw new Error('Sessão não conectada');

        const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const rawBuffer = Buffer.from(b64, 'base64');
        // [ANTI-BAN] Sanitize Before Sending
        const buffer = await this.sanitizeImage(rawBuffer);

        const user = session.socket.user?.id?.split(':')[0];
        if (!user) throw new Error('Usuário não identificado');

        this.logger.log(`[PROFILE] 📸 Starting Profile Picture Update for ${sessionId}...`);

        try {
            await session.socket.updateProfilePicture(`${user}@s.whatsapp.net`, buffer);
            this.logger.log(`[PROFILE] ✅ Picture updated for ${sessionId}`);
        } catch (e: any) {
            this.logger.warn(`[PROFILE] Picture update failed for ${sessionId}: ${e.message}`);
            throw e; // Critical failure
        }

        // [STABILITY] Delay to prevent socket saturation
        await new Promise(r => setTimeout(r, 2000));

        // [PRIVACY] Force Everyone (Robust Attempt)
        try {
            await session.updatePrivacySettings('all');
            this.logger.debug(`[PROFILE] Privacy set to ALL for ${sessionId}`);
        } catch (e: any) {
            this.logger.warn(`[PROFILE] Privacy update failed (Non-Critical): ${e.message}`);
        }

        // [STABILITY] Another small delay
        await new Promise(r => setTimeout(r, 1000));

        // [BUSINESS] Remove Banner/Cover
        try {
            await session.removeBusinessCover();
            this.logger.debug(`[PROFILE] Business cover removed for ${sessionId}`);
        } catch (e: any) {
            this.logger.warn(`[PROFILE] Business cover removal failed (Non-Critical): ${e.message}`);
        }
    }

    // [ROBUST] Consolidated Profile Update (Name -> Bio -> Photo -> Privacy)
    // Prevents Throttling / Rate Limits by adding delays
    async updateProfileFull(sessionId: string, data: { name?: string, status?: string, image?: string }) {
        const session = this.sessions.get(sessionId);
        if (!session?.socket) throw new Error('Sessão não conectada');

        const user = session.socket.user?.id?.split(':')[0];
        if (!user) throw new Error('Usuário não identificado');

        this.logger.log(`[PROFILE] 🛡️ Starting Robust Update for ${sessionId}...`);

        // 1. UPDATE NAME
        if (data.name) {
            try {
                this.logger.debug(`[PROFILE] Updating Name: ${data.name}`);
                await session.socket.updateProfileName(data.name);
            } catch (e: any) {
                this.logger.warn(`[PROFILE] Name update failed (Attempt 1): ${e.message}. Retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
                try {
                    await session.socket.updateProfileName(data.name); // Retry
                } catch (retryErr: any) {
                    this.logger.error(`[PROFILE] Name update FAILED (Final): ${retryErr.message}`);
                }
            }
            // Delay before next step
            await new Promise(r => setTimeout(r, 2000));
        }

        // 2. UPDATE STATUS (Bio)
        if (data.status) {
            try {
                this.logger.debug(`[PROFILE] Updating Status`);
                await session.socket.updateProfileStatus(data.status);
            } catch (e: any) {
                this.logger.warn(`[PROFILE] Status update failed: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        // 3. UPDATE PICTURE
        if (data.image) {
            try {
                this.logger.debug(`[PROFILE] Updating Picture`);
                const b64 = data.image.replace(/^data:image\/\w+;base64,/, "");
                const rawBuffer = Buffer.from(b64, 'base64');
                const buffer = await this.sanitizeImage(rawBuffer); // [ANTI-BAN] Sanitized
                await session.socket.updateProfilePicture(`${user}@s.whatsapp.net`, buffer);
            } catch (e: any) {
                this.logger.warn(`[PROFILE] Picture update failed (Attempt 1): ${e.message}. Retrying in 2s...`);
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const b64Retry = data.image.replace(/^data:image\/\w+;base64,/, "");
                    const rawBufferRetry = Buffer.from(b64Retry, 'base64');
                    // Reuse sanitized if possible, but for retry lets be safe and resanitize (or just use raw if sanitize failed above usually)
                    // Just sanitizing again to be consistent
                    const bufferRetry = await this.sanitizeImage(rawBufferRetry);
                    await session.socket.updateProfilePicture(`${user}@s.whatsapp.net`, bufferRetry);
                } catch (retryErr: any) {
                    this.logger.error(`[PROFILE] Picture update FAILED (Final): ${retryErr.message}`);
                }
            }
            await new Promise(r => setTimeout(r, 1500));
        }

        // 4. CLEANUP (Privacy + Banner)
        // [PRIVACY] Force Everyone
        await session.updatePrivacySettings('all');
        // [BUSINESS] Remove Banner
        await session.removeBusinessCover();

        this.logger.log(`[PROFILE] ✅ Robust Update Completed for ${sessionId}`);
    }

    /**
     * [AUTO-HUMANIZE] Automaticamente troca foto, nome e bio de uma instância recém-conectada.
     * Usa IA para gerar perfis e Hash Buster para imagens únicas.
     * Assets permanecem no banco - Hash Buster já garante unicidade a cada uso.
     */
    private async autoHumanize(sessionId: string) {
        try {
            const instance = await this.prisma.instance.findUnique({ where: { sessionId } });
            if (!instance || instance.isHumanized || !instance.userId) return;

            const user = await this.prisma.user.findUnique({ where: { id: instance.userId } });
            if (!user?.openaiApiKey) {
                this.logger.warn(`[AUTO-HUMANIZE] Skipping ${instance.name}: No OpenAI API Key configured.`);
                return;
            }

            this.logger.log(`[AUTO-HUMANIZE] 🤖 Starting for ${instance.name} (${sessionId})...`);

            // 1. Generate AI profile (name + bio)
            const defaultPrompt = 'Gere perfis de pessoas brasileiras reais e diversas. Nomes comuns brasileiros variados (masculinos e femininos). Bios curtas e naturais para WhatsApp, como se fossem pessoas reais.';
            const profiles = await this.openaiService.generateProfiles(1, defaultPrompt, user.openaiApiKey, user.openaiAssistantId);
            const profile = profiles[0];

            if (!profile) {
                this.logger.error(`[AUTO-HUMANIZE] AI failed to generate profile for ${instance.name}`);
                return;
            }

            this.logger.log(`[AUTO-HUMANIZE] Generated: ${profile.name} | Bio: ${profile.bio}`);

            // 2. Pick a random asset and apply Hash Buster
            let uniqueBase64: string | undefined;
            const assets = await this.prisma.asset.findMany({
                where: { userId: instance.userId, type: 'PROFILE_PIC' },
            });

            if (assets.length > 0) {
                const randomIndex = Math.floor(Math.random() * assets.length);
                const chosenAsset = assets[randomIndex];

                try {
                    const uniqueBuffer = await this.profileService.uniqueImage(chosenAsset.data);
                    uniqueBase64 = `data:image/jpeg;base64,${uniqueBuffer.toString('base64')}`;
                    this.logger.log(`[AUTO-HUMANIZE] Hash-busted image from asset ${chosenAsset.id}`);

                    // 3. Delete used asset to prevent reuse
                    await this.prisma.asset.delete({ where: { id: chosenAsset.id } });
                    this.logger.log(`[AUTO-HUMANIZE] Consumed asset ${chosenAsset.id} (${assets.length - 1} remaining)`);
                } catch (imgErr: any) {
                    this.logger.warn(`[AUTO-HUMANIZE] Image processing failed: ${imgErr.message}. Skipping photo.`);
                }
            } else {
                this.logger.warn(`[AUTO-HUMANIZE] No assets available for ${instance.name}. Updating name/bio only.`);
            }

            // 4. Apply profile changes
            await this.updateProfileFull(sessionId, {
                name: profile.name,
                status: profile.bio,
                image: uniqueBase64
            });

            // 5. Mark as humanized
            await this.prisma.instance.update({
                where: { sessionId },
                data: { isHumanized: true }
            });

            this.logger.log(`[AUTO-HUMANIZE] ✅ ${instance.name} humanized successfully as "${profile.name}"`);

        } catch (e: any) {
            this.logger.error(`[AUTO-HUMANIZE] Failed for ${sessionId}: ${e.message}`);
        }
    }
}
