import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartDispatcherService } from './smart-dispatcher.service';
import { Logger } from '@nestjs/common';
import { getLinkPreview } from 'link-preview-js';
import * as sharp from 'sharp';

@Processor('campaign-queue', {
    // Reduced from 150 to 100 to prevent DB connection exhaustion with 70+ instances
    concurrency: 100,
    // Proteção de sobrecarga do banco
    limiter: {
        max: 500,
        duration: 1000
    },
    // Garante re-tentativa se o servidor reiniciar
    maxStalledCount: 1,
    // [FIX] Aumentado para 5min: o processamento total pode chegar em ~120s
    // (pre-flight 20s + dispatchSafe 30s + typing 10s + send retries).
    // Com 60s, o lock expirava antes do job terminar → Missing lock → UNSTABLE falso.
    lockDuration: 300000,
    // [FIX] Renovar lock automaticamente a cada 60s enquanto o job está ativo
    lockRenewTime: 60000
})
export class CampaignProcessor extends WorkerHost {
    private readonly logger = new Logger(CampaignProcessor.name);

    // [STABILITY] Per-Instance Lock to prevent socket overload
    // Map<InstanceName, Promise<void>>
    private static instanceLocks = new Map<string, Promise<void>>();

    // [CACHE] Configuration Cache (TTL 10s)
    private static configCache = new Map<string, { data: any, expires: number }>();


    // Helper to acquire lock
    private async acquireLock(instanceName: string): Promise<() => void> {
        let release: () => void;
        const currentLock = CampaignProcessor.instanceLocks.get(instanceName) || Promise.resolve();

        // Create new lock promise
        const newLock = new Promise<void>(resolve => {
            release = resolve;
        });

        // 1. Get the current tail promise for this instance.
        const previous = CampaignProcessor.instanceLocks.get(instanceName) || Promise.resolve();

        // 2. Create the signal for "I am done".
        let unlock: () => void;
        const myTurn = new Promise<void>(resolve => unlock = resolve);

        // 3. Update the tail to be MY turn.
        CampaignProcessor.instanceLocks.set(instanceName, previous.then(() => myTurn));

        // 4. Wait for turn
        await previous;

        return unlock!;
    }

    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly prisma: PrismaService,
        private readonly dispatcher: SmartDispatcherService
    ) {
        super();
    }

    // [HELPER] Random Human Delay with Gaussian Distribution (Chaos Typing)
    private getChaosDelay(mean: number, stdDev: number): number {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return Math.floor(mean + z * stdDev);
    }

    // [HELPER] Random Floating Point Delay (Min/Max in Seconds -> MS)
    // E.g. 14.62s -> 14620ms
    private getRandomFloatingDelay(minSeconds: number, maxSeconds: number): number {
        const min = minSeconds * 1000;
        const max = maxSeconds * 1000;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // [HELPER] Resolve Spintax {Option A|Option B}
    private resolveSpintax(text: string): string {
        if (!text) return "";
        const regex = /\{([^{}]+)\}/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const choices = match[1].split("|");
            const randomChoice = choices[Math.floor(Math.random() * choices.length)];
            text = text.replace(match[0], randomChoice);
            regex.lastIndex = 0;
        }
        return text;
    }

    // [HELPER] Robust Link Preview Fetcher (Prioritize Regex -> Library Fallback)
    private async fetchLinkMetadata(url: string): Promise<{ title?: string; description?: string; thumbnail?: Buffer } | null> {
        let title: string | undefined;
        let description: string | undefined;
        let thumbnail: Buffer | undefined;
        let imgUrl: string | undefined;

        // 1. [STRATEGY A] Manual HTML Regex (Prioritized for Multiline Meta Tags)
        try {
            this.logger.debug(`[LinkPreview] Strategy A: Regex for ${url}`);

            // [STABILITY] Add 5s Timeout to prevent worker hang
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'WhatsApp/2.23.18.79 i' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const html = await response.text();

                    // Regex for og:image (Handles multiline)
                    const imgRegex = /<meta\s+property=["']og:image["'][\s\S]*?content=["']([^"']+)["']/i;
                    const imgMatch = html.match(imgRegex);
                    if (imgMatch && imgMatch[1]) imgUrl = imgMatch[1];

                    // Regex for Title/Desc
                    const titleMatch = html.match(/<meta\s+property=["']og:title["'][\s\S]*?content=["']([^"']+)["']/i) || html.match(/<title>([^<]*)<\/title>/i);
                    if (titleMatch && titleMatch[1]) title = titleMatch[1];

                    const descMatch = html.match(/<meta\s+property=["']og:description["'][\s\S]*?content=["']([^"']+)["']/i);
                    if (descMatch && descMatch[1]) description = descMatch[1];
                }
            } catch (fetchError: any) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    this.logger.warn(`[LinkPreview] Strategy A TIMEOUT (5s) for ${url}`);
                } else {
                    throw fetchError;
                }
            }
        } catch (e) {
            this.logger.warn(`[LinkPreview] Strategy A failed: ${e}`);
        }

        // 2. [STRATEGY B] Library Fallback (If Regex found no image)
        if (!imgUrl) {
            try {
                this.logger.debug(`[LinkPreview] Strategy B: Library Fallback`);
                const data: any = await getLinkPreview(url, {
                    imagesPropertyType: 'og',
                    followRedirects: 'follow',
                    timeout: 5000,
                    headers: { 'User-Agent': 'WhatsApp/2.23.18.79 i' }
                });
                if (data) {
                    if (data.title && !title) title = data.title;
                    if (data.description && !description) description = data.description;
                    if (data.images && data.images.length > 0) imgUrl = data.images[0];
                }
            } catch (e2) {
                this.logger.warn(`[LinkPreview] Strategy B failed: ${e2}`);
            }
        }

        if (!title && !imgUrl) return null; // Failed both

        // 3. Image Processing (Common Pipeline)
        if (imgUrl) {
            try {
                // Resolve relative URLs
                if (imgUrl.startsWith('/')) {
                    const u = new URL(url);
                    imgUrl = `${u.protocol}//${u.host}${imgUrl}`;
                }

                const imgRes = await fetch(imgUrl);
                if (imgRes.ok) {
                    const arrayBuffer = await imgRes.arrayBuffer();
                    const inputBuffer = Buffer.from(arrayBuffer);

                    // [FIX] Flatten to White background (fixes transparent PNGs becoming black)
                    // [STABILITY] 600px is the sweet spot. 800px (>100kb) kills the socket. 600px is crisp on mobile.
                    thumbnail = await sharp(inputBuffer)
                        .resize(600, null, { fit: 'inside' })
                        .flatten({ background: '#ffffff' })
                        .jpeg({ quality: 60 })
                        .toBuffer();
                }
            } catch (imgErr) {
                this.logger.warn(`[LinkPreview] Image process failed: ${imgErr}`);
            }
        }

        return {
            title: title || 'Link Preview',
            description,
            thumbnail
        };
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { campaignId, leadId, number, message, variables } = job.data;
        let selectedInstanceId: string | null = null;
        let unlock: (() => void) | undefined;

        try {
            // [INIT] Fetch Campaign Config & Dispatcher
            // We need campaign config for delays + instances for dispatcher

            // [OPTIMIZATION] Check Cache First
            let campaignConfig;
            const now = Date.now();
            const cached = CampaignProcessor.configCache.get(campaignId);

            if (cached && now < cached.expires) {
                campaignConfig = cached.data;
            } else {
                campaignConfig = await this.prisma.campaign.findUnique({
                    where: { id: campaignId },
                    include: { instances: true }
                });
                // Set Cache (10s TTL)
                if (campaignConfig) {
                    CampaignProcessor.configCache.set(campaignId, {
                        data: campaignConfig,
                        expires: now + 10000
                    });
                }
            }

            if (!campaignConfig || campaignConfig.status === 'CANCELED' || campaignConfig.status === 'PAUSED') {
                this.logger.debug(`Skipping job for campaign ${campaignId} (Status: ${campaignConfig?.status || 'NOT_FOUND'})`);
                return; // Clean exit
            }

            // Ensure Dispatcher Loaded
            let stats = this.dispatcher.getStats(campaignId);
            if (!stats) {
                this.dispatcher.initialize(campaignId, campaignConfig.instances);
            }

            // [HUMANIZATION] 1. CONFIGURABLE PRE-FLIGHT DELAY
            // "Entering Chat" Delay (User configured manual range)
            // Floating point precision requested: e.g. 14.62s
            const minDelay = campaignConfig.minDelay || 10;
            const maxDelay = campaignConfig.maxDelay || 20;
            const preFlightWait = this.getRandomFloatingDelay(minDelay, maxDelay);

            this.logger.debug(`[HumanDelay] Waiting ${preFlightWait}ms (Config: ${minDelay}-${maxDelay}s) before processing...`);
            // [FIX] Renova o lock antes de esperar para não expirar durante o pre-flight
            if (job.token) await job.extendLock(job.token, 300000).catch(() => { });
            await new Promise(r => setTimeout(r, preFlightWait));


            // [STEP 2] GET SLOT
            const slot = this.dispatcher.getNextSlot(campaignId);

            // [FIX] Handle Temporary Cooldown vs Fatal Empty
            if (slot.reason === 'COOLDOWN') {
                this.logger.warn(`[SmartDispatch] All instances are in Cooldown. Backing off 5s...`);
                await job.moveToDelayed(Date.now() + 5000, job.token);
                return;
            }

            if (slot.reason === 'EMPTY' || !slot.instanceId) {
                this.logger.error(`[CRITICAL] No active instances for Campaign ${campaignId}. Pausing...`);
                await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED' } });
                throw new Error('NO_INSTANCES'); // Trigger backoff
            }

            selectedInstanceId = slot.instanceId;

            // [STEP 3] WAIT FOR SLOT
            if (slot.delayMs > 0) {
                // [FIX] Renova lock antes de esperar pelo slot
                if (job.token) await job.extendLock(job.token, 300000).catch(() => { });
                await new Promise(r => setTimeout(r, slot.delayMs));
            }

            // [STEP 4] GATEKEEPER CHECK (dispatchSafe)
            // This waits for stabilization or throws if dead.
            // [FIX] Renova lock antes do dispatchSafe que pode demorar até 30s
            if (job.token) await job.extendLock(job.token, 300000).catch(() => { });
            await this.dispatcher.dispatchSafe(campaignId, selectedInstanceId, this.whatsappService);

            // [PERFORMANCE] Pre-Lock Health Check
            // Se a instância ainda estiver "CONNECTING" (mesmo após o dispatchSafe ter esperado um pouco),
            // devolvemos para a fila com delay para liberar este worker para outra tarefa.
            // Isso evita que o worker fique preso esperando o Lock de uma instância lenta.
            const currentStatus = this.whatsappService.getStatus(selectedInstanceId);
            if (currentStatus && currentStatus.status === 'CONNECTING') {
                this.logger.log(`[Defer] Instance ${selectedInstanceId} is busy/connecting. Deferring job 5s.`);
                await job.moveToDelayed(Date.now() + 5000, job.token); // Move para "Delayed"
                return; // Libera o worker imediatamente
            }

            // [STEP 5] ACQUIRE INSTANCE LOCK
            unlock = await this.acquireLock(selectedInstanceId!);

            // [STEP 6] EXECUTION
            // [PREPARE] Sanitize & Format (Before Lock/Try)
            const cleanNumber = number.replace(/\D/g, '');
            
            // Message Preparation
            let customDomain = job.data.customDomain;
            if (!customDomain) {
                customDomain = campaignConfig?.customDomain;
            }

            let dynamicLink = '';
            if (customDomain) {
                let domain = customDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
                if (variables && variables['var1']) {
                    const firstName = variables['var1'].split(' ')[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
                    dynamicLink = `https://${firstName}.${domain}/`;
                } else {
                    dynamicLink = `https://${domain}/`;
                }
            }

            let finalMessage = message;
            if (dynamicLink) {
                finalMessage = finalMessage.replace(/{dominio}/g, dynamicLink);
            }
            if (variables) {
                Object.keys(variables).forEach(key => {
                    finalMessage = finalMessage.replace(new RegExp(`{{?${key}}}?`, 'g'), variables[key]);
                });
            }
            finalMessage = this.resolveSpintax(finalMessage);

            // [STRICT] Rule 2: Wrap in Try/Catch for Strict Status Control
            try {
                // [ANTI-BAN] Rule 6: Jitter & Human Behavior
                // 1. Typing Simulation
                const minTyping = campaignConfig.minTyping || 2;
                const maxTyping = campaignConfig.maxTyping || 10;
                const typingDuration = this.getRandomFloatingDelay(minTyping, maxTyping);

                // Send 'composing' presence
                const client = this.whatsappService.getSession(selectedInstanceId!);
                if (client?.socket) {
                     await client.socket.sendPresenceUpdate('composing', cleanNumber + '@s.whatsapp.net');
                }
                
                await new Promise(r => setTimeout(r, typingDuration));

                // 2. Random Delay (Jitter) before sending
                const minDelay = campaignConfig.minDelay || 5; 
                const maxDelay = campaignConfig.maxDelay || 15;
                const jitter = this.getRandomFloatingDelay(minDelay, maxDelay);
                await new Promise(r => setTimeout(r, jitter));

                // 3. Send Message
                if (!client?.socket) throw new Error('Socket disconnected during delay');
                
                // [FIX] Ensure existence check
                const [onWa] = await client.socket.onWhatsApp(cleanNumber);
                if (!onWa?.jid) {
                    throw new Error('Invalid Number'); // Will be caught below
                }

                // Send Logic (Simplified for stability)
                await client.socket.sendMessage(onWa.jid, { text: finalMessage });

                // [SUCCESS] Mark as SENT
                if (leadId) {
                    await this.prisma.campaignLead.update({
                        where: { id: leadId },
                        data: { 
                            status: 'SENT', 
                            sentAt: new Date(), 
                            assignedInstanceId: selectedInstanceId 
                        }
                    });
                }
                
                // Update Campaign Stats
                await this.prisma.campaign.update({
                    where: { id: campaignId },
                    data: { sentCount: { increment: 1 } }
                });

            } catch (error: any) {
                // [STRICT] Error Handling
                const msg = error.message?.toLowerCase() || '';
                const isInvalid = msg.includes('invalid') || msg.includes('not on whatsapp') || msg.includes('no exists');

                if (isInvalid && leadId) {
                    // Permanent Fail
                    await this.markAsFailed(leadId, 'Invalid Number');
                } else {
                    // Technical Fail -> Keep PENDING (Retry)
                    // Do NOT mark as FAILED. Just throw to let BullMQ retry.
                    this.logger.warn(`[Retry] Processing failed for ${number}: ${msg}. Keeping as PENDING.`);
                    throw error; 
                }
            } finally {
                if (unlock) unlock();
            }
        } catch (e: any) {
             // Catch errors from pre-lock phase
             this.logger.error(`[CRITICAL] Job Failed outside lock: ${e.message}`);
             throw e; // Retry
        }
    }

    private async markAsFailed(leadId: string, reason: string) {
        await this.prisma.campaignLead.update({
            where: { id: leadId },
            data: { status: 'FAILED', error: reason }
        });
    }

    // [LISTENER] Catch Permanently Failed Jobs
    // Ensures DB status is updated even if retries are exhausted.
    // This fixes the "Not 100% marked" issue.
    @OnWorkerEvent('failed')
    async onFailed(job: Job, err: Error) {
        const { leadId, number } = job.data;
        const msg = err.message.toLowerCase();

        // [RULE] Strict Status: Only 'Invalid Number' can be FAILED.
        const isInvalid = msg.includes('invalid') || msg.includes('not on whatsapp') || msg.includes('no exists');

        if (leadId) {
            if (isInvalid) {
                this.logger.error(`[FATAL] Job ${job.id} (Lead ${leadId}) is INVALID. Marking FAILED.`);
                await this.markAsFailed(leadId, 'Invalid Number');
            } else {
                // [RULE] Technical failure -> Reset to PENDING (Do not leave as Processing/Failed)
                // This ensures the user sees it as "Not Done" rather than "Error".
                this.logger.warn(`[SOFT FAIL] Job ${job.id} (Lead ${leadId}) failed technically. Resetting to PENDING.`);
                await this.prisma.campaignLead.update({
                    where: { id: leadId },
                    data: { status: 'PENDING', error: null }
                });
            }
        }
    }
}
