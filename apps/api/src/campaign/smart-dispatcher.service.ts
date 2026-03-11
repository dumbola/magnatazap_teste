import { Injectable, Logger } from '@nestjs/common';
import { Instance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DispatchState {
    instances: string[]; // List of Instance IDs (Session IDs)
    currentIndex: number;
    // [HARDENING] Replace permanent blacklist with temporary Cooldown Map
    // InstanceID -> Timestamp when it can be used again
    cooldownMap: Map<string, number>;
    nextSlotTime: number; // Global time cursor for scheduling
    ipMap: Map<string, string>; // InstanceID -> IP
}

@Injectable()
export class SmartDispatcherService {
    private readonly logger = new Logger(SmartDispatcherService.name);

    constructor(private prisma: PrismaService) { }

    // In-memory state storage
    private campaignStates = new Map<string, DispatchState>();
    // [HUMAN] Human Cycle Constant (10s base cycle for human behavior)
    // Matches User Request: Slower, safer throughput
    private readonly HUMAN_DELAY_CYCLE = 10000;
    private readonly FAILURE_COOLDOWN_MS = 5000; // [HARDENING] 5 Seconds Cooldown

    /**
     * Initializes a campaign with Smart Selection (Unique IP enforcement)
     */
    initialize(campaignId: string, instances: Instance[]): string[] {
        // [FIX] Race Condition Handling
        // If multiple workers call initialize concurrently, we must PRESERVE the schedule.
        // We only update the instance list.

        const uniqueIpInstances = this.filterUniqueIps(instances);
        const instanceIds = uniqueIpInstances.map(i => i.sessionId);

        const existingState = this.campaignStates.get(campaignId);
        const nextSlotTime = existingState ? existingState.nextSlotTime : Date.now();
        const currentIndex = existingState ? existingState.currentIndex : 0;
        // Preserve existing cooldowns or start fresh
        const cooldownMap = existingState ? existingState.cooldownMap : new Map<string, number>();

        this.campaignStates.set(campaignId, {
            instances: instanceIds,
            currentIndex,
            cooldownMap,
            nextSlotTime, // Preserved
            ipMap: new Map(uniqueIpInstances.map(i => [i.sessionId, this.extractIp(i.proxyConfig, i.sessionId)]))
        });

        this.logger.log(`[SmartStart] Campaign ${campaignId} initialized/updated. Instances: ${instanceIds.length}. Next Slot preserved: ${new Date(nextSlotTime).toISOString()}`);
        return instanceIds;
    }

    getStats(campaignId: string) {
        // Helper to visualize stats, converting map to object for JSON logging if needed
        const state = this.campaignStates.get(campaignId);
        if (!state) return null;
        return {
            ...state,
            cooldownMapSize: state.cooldownMap.size
        };
    }

    /**
     * [NEW] Global Health Check
     * Returns a Set of Instance IDs that are currently in cooldown (Unstable/Dead)
     */
    getUnstableInstances(): Set<string> {
        const unstable = new Set<string>();
        for (const state of this.campaignStates.values()) {
            for (const [instanceId, cooldownUntil] of state.cooldownMap.entries()) {
                if (Date.now() < cooldownUntil) {
                    unstable.add(instanceId);
                }
            }
        }
        return unstable;
    }

    /**
     * Parsing helper for proxy config
     */
    private extractIp(proxyConfig: string | null, instanceId: string = 'UNKNOWN'): string {
        if (!proxyConfig) return 'DIRECT';
        try {
            // [ROTATING PROXY SUPPORT] 
            // If we detect a known rotating proxy provider, we TRUST that the Sticky IP logic
            // (sessid-INSTANCE_NAME) is doing its job. Therefore, effectively every instance has a unique IP.
            const isRotating = proxyConfig.includes('webshare.io') ||
                proxyConfig.includes('brightdata') ||
                proxyConfig.includes('luminati') ||
                proxyConfig.includes('smartproxy');

            if (isRotating) {
                // Return a unique key per instance so they are NOT deduped
                return `ROTATING-[${instanceId}]`;
            }

            // [BRIGHTDATA SUPPORT] Extract IP from Username (Static Zone)
            // Pattern: ...-ip-1.2.3.4...
            const brightDataMatch = proxyConfig.match(/-ip-(\d+\.\d+\.\d+\.\d+)/);
            if (brightDataMatch) {
                return brightDataMatch[1];
            }

            if (proxyConfig.startsWith('{')) {
                const parsed = JSON.parse(proxyConfig);
                return parsed.host || 'UNKNOWN';
            }
            if (proxyConfig.includes('@')) {
                return proxyConfig.split('@')[1].split(':')[0];
            }

            // Basic Host extraction
            return proxyConfig.split(':')[0];
        } catch (e) {
            return 'UNKNOWN';
        }
    }

    private filterUniqueIps(instances: Instance[]): Instance[] {
        const seenIps = new Set<string>();
        const unique: Instance[] = [];

        for (const instance of instances) {
            const ip = this.extractIp(instance.proxyConfig, instance.sessionId);
            if (seenIps.has(ip) && ip !== 'DIRECT') { // Allow multiple DIRECT? 
                // User Requirement: "Se a Instância A e a Instância B partilham o IP 'X', apenas uma delas pode ser usada"
                // This implies STRICT enforcement even for 'DIRECT' if it's the same machine/IP.
                // Assuming DIRECT is one IP.
                this.logger.warn(`[SmartSelector] Skipping instance ${instance.name} (${instance.sessionId}) - Duplicate IP: ${ip}`);
                continue; // Enforce Unique IP (Restored from Backup)
            }
            seenIps.add(ip);
            unique.push(instance);
        }
        return unique;
    }

    /**
     * Gets the next scheduled slot using "Sliding Window" Algorithm.
     * Formula: Global_Delay = Safety_Constant (10s) / Active_Instances
     */
    getNextSlot(campaignId: string): { instanceId: string | null, delayMs: number, reason: 'OK' | 'EMPTY' | 'COOLDOWN' } {
        const state = this.campaignStates.get(campaignId);
        // [FIX] Reason: EMPTY (No State/Instances)
        if (!state || state.instances.length === 0) return { instanceId: null, delayMs: 0, reason: 'EMPTY' };

        const total = state.instances.length;

        // [HARDENING] Check for cooldown expirations "lazily" or just checks active count
        const now = Date.now();
        let activeCount = 0;

        for (const inst of state.instances) {
            const blockedUntil = state.cooldownMap.get(inst) || 0;
            if (now >= blockedUntil) {
                // If cooldown expired, we consider it active (and remove from map mainly for cleanliness, though check suffices)
                if (blockedUntil > 0) state.cooldownMap.delete(inst);
                activeCount++;
            }
        }

        // [FIX] Reason: COOLDOWN (All instances busy/unstable)
        if (activeCount === 0) {
            // this.logger.warn(`[SmartDispatch] All instances in cooldown for Campaign ${campaignId}. Backing off...`);
            return { instanceId: null, delayMs: 0, reason: 'COOLDOWN' };
        }

        // [ALGORITHM] 1. Calculate Global Interval dynamically
        // Example: 2 instances = 5000ms, 4 instances = 2500ms
        const dynamicInterval = Math.floor(this.HUMAN_DELAY_CYCLE / activeCount);

        // [ALGORITHM] 2. Determine Schedule Cursor
        // We use a global ticker that moves forward by `dynamicInterval`
        // CRITICAL: We update state.nextSlotTime immediately so the NEXT call sees the future time.
        // We do NOT wait for message completion. This is "Fire-and-Forgetting" the schedule slot.
        let scheduleCursor = Math.max(now, state.nextSlotTime);

        // [ALGORITHM] 3. Find Next Available Instance (Round Robin)
        // If an instance is failed/cooldown, we skip it and try the next one for THIS slot.
        // We do not add "compensation time" because the `dynamicInterval` itself 
        // has already expanded to compensate for the missing node.
        let attempts = 0;

        while (attempts < total) {
            const candidateId = state.instances[state.currentIndex];
            // Always advance index for next call (Circular Ring)
            state.currentIndex = (state.currentIndex + 1) % total;

            const blockedUntil = state.cooldownMap.get(candidateId) || 0;
            if (now < blockedUntil) {
                // [HARDENING] Skip cooled-down instance
                // this.logger.debug(`[SmartDispatch] Skipping ${candidateId} (Cooldown until ${new Date(blockedUntil).toISOString()})`);
                attempts++;
                continue;
            }

            // Found valid instance for this slot
            const executionTime = scheduleCursor;

            // Advance global cursor for the NEXT request
            state.nextSlotTime = executionTime + dynamicInterval;

            const delayMs = Math.max(0, executionTime - now);
            this.logger.log(`[SmartDispatch] Scheduled ${candidateId} in ${delayMs}ms (Interval: ${dynamicInterval}ms | Active: ${activeCount})`);

            return { instanceId: candidateId, delayMs, reason: 'OK' };
        }

        // Should be covered by activeCount check, but fallback
        return { instanceId: null, delayMs: 0, reason: 'COOLDOWN' };
    }

    async dispatchSafe(campaignId: string, instanceId: string, whatsappService: any): Promise<void> {
        const state = this.campaignStates.get(campaignId);
        if (!state || !state.instances.includes(instanceId)) {
            throw new Error(`Instance ${instanceId} not part of campaign ${campaignId}`);
        }

        if (state.cooldownMap.has(instanceId)) {
            const cooldown = state.cooldownMap.get(instanceId);
            if (Date.now() < cooldown) {
                // Silent fail to allow scheduler to pick another one next time
                throw new Error(`Instance ${instanceId} is Cooling Down`);
            }
        }

        // [RESILIÊNCIA ADAPTATIVA] 
        // Aumentando drasticamente o tempo de tolerância para "Wait-to-Stabilize".
        // Motivo: Sob alta carga de CPU (várias instâncias abrindo), o handshake demora.
        // Se matarmos em 10s, criamos um loop infinito de restarts.
        // Novo Timeout Total: ~30 segundos (15 tentativas de 2s)
        let attempts = 0;
        const maxRetries = 15;
        const retryDelay = 2000;

        while (attempts < maxRetries) {
            const sessionStatus = whatsappService.getStatus(instanceId);

            if (sessionStatus && sessionStatus.status === 'CONNECTED') {
                return; // Sucesso imediato
            }

            // Se estiver reconectando ou syncando, aguarda pacientemente.
            // Sob carga, 'CONNECTING' pode durar 30s+.
            if (sessionStatus && sessionStatus.status === 'CONNECTING') {
                if (attempts % 5 === 0) { // Log menos frequente para não floodar
                    this.logger.warn(`[HoldOn] Instance ${instanceId} is stabilizing (Attempt ${attempts + 1}/${maxRetries})... CPU Load Protection.`);
                }
                await new Promise(r => setTimeout(r, retryDelay));
                attempts++;
                continue;
            }

            // Se estiver definitivamente morto
            if (!sessionStatus || sessionStatus.status === 'DISCONNECTED') {
                // [AUTO-HEAL] Tenta acordar a instância se ela estiver morta no banco mas talvez viva no processo
                // ou se precisar de um empurrãozinho.
                if (attempts === 0) {
                    this.logger.warn(`[SmartDispatch] Instance ${instanceId} is DISCONNECTED in DB. Attempting DEFIBRILLATOR...`);
                    // Tenta reconectar sem limpar sessão (Soft Reconnect)
                    // Precisamos garantir que o método existe no service (Phase 1 adicionou)
                    if (typeof whatsappService.reconnect === 'function') {
                        whatsappService.reconnect(instanceId).catch(e => this.logger.error(`Defibrillator failed: ${e.message}`));
                    }
                    // Espera um pouco para ver se volta
                    await new Promise(r => setTimeout(r, 5000));
                    attempts++;
                    continue;
                }

                this.reportFailure(campaignId, instanceId, 'DISCONNECTED');
                throw new Error(`Instance ${instanceId} is DEAD/DISCONNECTED. Skipping.`);
            }

            // Fallback (Status desconhecido ou indefinido)
            await new Promise(r => setTimeout(r, retryDelay));
            attempts++;
        }

        // Se chegou aqui, é Timeout de Estabilização (Ocioso ou Lento demais)
        // Não penalizamos tanto quanto um crash real.
        this.reportFailure(campaignId, instanceId, 'TIMEOUT');
        throw new Error(`Instance ${instanceId} Timed Out (Stabilization Failed > 60s).`);
    }

    /**
     * [HARDENING] Reports a failure for an instance to trigger a temporary cooldown.
     * Use this when a send operation fails or a connection drops.
     */
    reportFailure(campaignId: string, instanceId: string, reason: 'TIMEOUT' | 'ERROR' | 'DISCONNECTED' = 'ERROR') {
        const state = this.campaignStates.get(campaignId);
        if (state) {
            // [HARDENING] Cooldown Variável (Dispatcher 3.0)
            // - TIMEOUT (Stabilization): 30s -> Deixa o processador tentar outro, mas não bane por muito tempo.
            // - ERROR (Send Fail): 120s -> Instância instável, geladeira severa.
            // - DISCONNECTED: 120s -> Instância caiu, precisa de tempo para reconnect/backoff.

            let cooldownMs = 60000; // Default 1m

            switch (reason) {
                case 'TIMEOUT':
                    cooldownMs = 30000; // 30s
                    break;
                case 'ERROR':
                case 'DISCONNECTED':
                    cooldownMs = 120000; // 2 Minutes
                    break;
            }

            const cooldownUntil = Date.now() + cooldownMs;
            state.cooldownMap.set(instanceId, cooldownUntil);

            this.logger.warn(`[AutoHeal] ❄️ Cooling down ${instanceId} for ${cooldownMs / 1000}s. Reason: ${reason}`);

            // [LOGGING] Persist Instability Event
            this.prisma.connectionLog.create({
                data: {
                    instanceName: instanceId, // SessionId
                    status: 'UNSTABLE',
                    reason: reason,
                    metadata: { cooldownMs, campaignId },
                    timestamp: new Date()
                }
            }).catch(e => this.logger.error(`Failed to log instability: ${e.message}`));
        }
    }
}
