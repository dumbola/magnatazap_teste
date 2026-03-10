'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Send, CheckCircle, XCircle, PauseCircle, Upload,
    Smartphone, MessageSquare, Trash2, Zap, LayoutGrid,
    FileText, Play, RefreshCw, AlertTriangle, List,
    Search, Wifi, Activity, Calendar as CalendarIcon, ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import MoneyRain from '@/components/MoneyRain';
import { SmartStartButton } from '@/components/campaign/smart-start-button';
import { CampaignVisualizer } from '@/components/campaign/campaign-visualizer';

// --- CONFIG ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken() {
    if (typeof window !== 'undefined') {
        const local = localStorage.getItem('token');
        if (local) return local;
        return document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
    }
    return null;
}

// --- TYPES ---
type LeadStatus = 'PENDING' | 'SENT' | 'FAILED';
interface Lead {
    id?: string;
    number: string;
    vars: Record<string, string>;
    status: LeadStatus;
    error?: string;
    sentAt?: number; // [NEW] Track when it was sent
}

// --- COMPONENTS ---

// Design matched from dashboard/page.tsx
const StatCard = ({ label, value, icon: Icon, color, subValue }: any) => (
    <div className="bg-surface border border-border p-5 rounded-2xl hover:border-zinc-600 transition-all duration-300 shadow-lg group relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500`}>
            <Icon className={`w-24 h-24 ${color}`} />
        </div>
        <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg bg-zinc-900/50 ${color.replace('text-', 'text-opacity-80 ')}`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <span className="text-text-muted text-xs font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div>
                <div className="text-3xl font-black text-white tracking-tight">{value}</div>
                {subValue && <div className="text-[10px] text-zinc-500 font-mono mt-1">{subValue}</div>}
            </div>
        </div>
    </div>
);

export default function SenderPage() {
    // --- STATE ---
    const [instances, setInstances] = useState<any[]>([]);
    // [REF] Multi-Select Instance
    const [selectedInstances, setSelectedInstances] = useState<string[]>([]);

    // Data
    // Data
    const [campaignId, setCampaignId] = useState<string | null>(null);
    // [NEW] Message Variations
    const [messages, setMessages] = useState<string[]>(['']);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [initialCount, setInitialCount] = useState(0);

    // [RESTORED] UI State
    const [status, setStatus] = useState('PRONTO');
    const [loading, setLoading] = useState(false);
    // [NEW] Custom Domain
    const [customDomain, setCustomDomain] = useState('');

    // [NEW] Human Delay Configuration (Defaults: 10-20s, 2-10s)
    const [minDelay, setMinDelay] = useState(10);
    const [maxDelay, setMaxDelay] = useState(20);
    const [minTyping, setMinTyping] = useState(2);
    const [maxTyping, setMaxTyping] = useState(10);

    // --- STATISTICS ---
    const pendingCount = leads.filter(l => l.status === 'PENDING').length;
    const failedCount = leads.filter(l => l.status === 'FAILED').length;
    // [FIX] Counter logic: Initial - Waiting - Failed = Sent (Implicitly)
    const totalSent = Math.max(0, initialCount - pendingCount - failedCount);

    const loadPersistedState = () => {
        const wip = localStorage.getItem('sender_wip_luxury');
        if (wip) {
            try {
                const parsed = JSON.parse(wip);
                if (parsed.leads?.length) setLeads(parsed.leads);
                // Load variations or fallback to single message
                if (parsed.messages && Array.isArray(parsed.messages)) setMessages(parsed.messages);
                else if (parsed.message) setMessages([parsed.message]);

                // [REF] Multi-Select Load
                if (parsed.selectedInstances) setSelectedInstances(parsed.selectedInstances);
                else if (parsed.instance) setSelectedInstances([parsed.instance]);

                // [NEW] Load Custom Domain
                if (parsed.customDomain) setCustomDomain(parsed.customDomain);

                // [NEW] Load Delay Config
                if (parsed.delayConfig) {
                    setMinDelay(parsed.delayConfig.minDelay || 10);
                    setMaxDelay(parsed.delayConfig.maxDelay || 20);
                    setMinTyping(parsed.delayConfig.minTyping || 2);
                    setMaxTyping(parsed.delayConfig.maxTyping || 10);
                }
            } catch (e) { }
        }
        // ...
    };

    const saveWipState = () => {
        // Save 'messages' array instead of single 'message'
        const state = {
            selectedInstances,
            messages,
            leads,
            customDomain,
            delayConfig: { minDelay, maxDelay, minTyping, maxTyping } // [NEW] Save Delays
        };
        localStorage.setItem('sender_wip_luxury', JSON.stringify(state));
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStatus('LENDO ARQUIVO...');
        setLoading(true);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                const validRows = data
                    .filter(row => row && row.length > 0 && row[0])
                    .map(row => {
                        const number = String(row[0]).replace(/\D/g, '');
                        const vars: Record<string, string> = {};
                        row.slice(1).forEach((v, i) => vars[`var${i + 1}`] = String(v || ''));
                        return { number, vars, status: 'PENDING' } as Lead;
                    });

                if (validRows.length > 0) {
                    setLeads(validRows);
                    setInitialCount(validRows.length);
                    setCampaignId(null);
                    localStorage.removeItem('active_campaign_id');
                    setStatus('IMPORTADO');
                } else {
                    alert('Nenhum número encontrado na coluna A.');
                }
            } catch (e) {
                alert('Erro ao ler arquivo.');
            } finally {
                setLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const syncCampaignStatus = async () => {
        const token = getToken();
        if (!token || !campaignId) return;

        try {
            const res = await fetch(`${API_URL}/campaign/${campaignId}/leads`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                const serverLeads = data.leads || [];
                const serverMap = new Map(serverLeads.map((l: any) => [l.id, l]));
                // [FIX] Fallback map by number in case ID is missing locally
                const serverNumMap = new Map(serverLeads.map((l: any) => [l.number, l]));

                setLeads(current => {
                    return current.map(local => {
                        let remote: any = null;

                        // Try to find remote lead
                        if (local.id && serverMap.has(local.id)) {
                            remote = serverMap.get(local.id);
                        } else if (!local.id && serverNumMap.has(local.number)) {
                            remote = serverNumMap.get(local.number);
                            // Found by number! Adopt the ID.
                            local.id = remote.id;
                        }

                        // Case 1: Found on server (Still Pending or Failed)
                        if (remote) {
                            if (remote.status !== local.status) {
                                return { ...local, status: remote.status, error: remote.error, sentAt: remote.status === 'SENT' ? Date.now() : undefined };
                            }
                            return { ...local, status: remote.status, error: remote.error };
                        }

                        // Case 2: Not found on server (Deleted = Sent)
                        // If we had an ID (or assume we synced before), and now it's gone -> SENT
                        // But if we never had an ID, and it's not on server... maybe it was sent very fast?
                        // We check if we are in 'DISPARANDO' state.
                        if (status.includes('DISPARANDO') || status.includes('ENVIANDO')) {
                            if (local.status !== 'SENT' || !local.sentAt) {
                                return { ...local, status: 'SENT', error: undefined, sentAt: local.sentAt || Date.now() };
                            }
                        }

                        return local;
                    });
                });
            }
        } catch (e) { console.error("Sync error", e); }
    };

    // [MANUAL CLEANUP] Remove SENT and Recycle FAILED -> PENDING
    // [MANUAL CLEANUP] Replaced by version below
    // const clearSent = ...

    // [NEW] Delete Instance directly from Sender
    const deleteInstance = async (e: React.MouseEvent, name: string) => {
        e.stopPropagation();
        if (!confirm(`Desconectar e remover ${name}?`)) return;

        const token = getToken();
        await fetch(`${API_URL}/instance/${name}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Optimistic UI Update
        setInstances(prev => prev.filter(i => i.name !== name));
        setSelectedInstances(prev => prev.filter(n => n !== name));
    };

    // [NEW] Dispatcher Logic
    const [dispatcherStats, setDispatcherStats] = useState<any>(null);

    // Polling Logic
    useEffect(() => {
        if (!campaignId) {
            setDispatcherStats(null);
            return;
        }

        const interval = setInterval(async () => {
            await syncCampaignStatus();

            // Poll Dispatcher
            try {
                const token = getToken();
                const res = await fetch(`${API_URL}/campaign/${campaignId}/dispatcher`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    setDispatcherStats(await res.json());
                }
            } catch (e) { console.error('Dispatcher poll failed', e); }

        }, 2000); // 2s Sync

        return () => clearInterval(interval);
    }, [campaignId]);

    // --- EFFECTS ---
    useEffect(() => {
        // refreshInstances(); // Call this? Or add to component body?
        // Let's add the logic here inline or restore refreshInstances helper if it's missing too.
        // Waiting... refreshInstances is missing too! I should restore IT as well or just inline it in useEffect.
        // Let's look at the file content again.
        // refreshInstances IS MISSING.
        // I will restore both handleImport, syncCampaignStatus, and refreshInstances logic.

        const fetchInstances = async () => {
            const token = getToken();
            if (!token) return;
            try {
                const res = await fetch(`${API_URL}/instance/list`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                    const data = await res.json();
                    setInstances(data.filter((i: any) => i.status === 'CONNECTED'));
                }
            } catch (e) { console.error(e); }
        };

        fetchInstances();
        loadPersistedState();
    }, []);

    // [PERSISTENCE FIX] Save state whenever it changes (Debounced by nature of React updates)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            saveWipState();
        }
    }, [messages, leads, selectedInstances, customDomain, minDelay, maxDelay, minTyping, maxTyping]);

    // [GHOST FIX] Automatically remove selected instances that don't exist in the API list anymore
    useEffect(() => {
        if (instances.length > 0) {
            setSelectedInstances(prev => {
                const valid = prev.filter(name => instances.some(i => i.name === name));
                if (valid.length !== prev.length) {
                    console.log('Pruned ghost instances:', prev.filter(p => !valid.includes(p)));
                }
                return valid;
            });
        }
    }, [instances]);

    const startCampaign = async () => {
        if (selectedInstances.length === 0) return alert('Selecione ao menos uma instância.');
        if (messages.every(m => !m.trim())) return alert('Escreva pelo menos uma mensagem.');
        if (leads.length === 0) return alert('Importe uma lista.');

        // [PROXY VALIDATION]
        if (selectedInstances.length > 1) {
            // Get objects
            const selectedObjs = instances.filter(i => selectedInstances.includes(i.name));
            const ips = new Set();
            let missingProxy = false;

            for (const inst of selectedObjs) {
                if (!inst.proxyConfig || inst.proxyConfig.length < 5) {
                    missingProxy = true;
                } else {
                    // Extract IP (Naive check: assume host is first part before :)
                    // Format: host:port:user:pass OR json
                    let ip = inst.proxyConfig;
                    if (ip.includes('://')) ip = ip.split('://')[1];
                    // Handle Auth (user:pass@host) FIRST
                    // [FIX] Keep Auth! Different user = Different Session/IP
                    // if (ip.includes('@')) ip = ip.split('@')[1]; 
                    // [UPDATED] Do NOT strip port, as different ports = different proxies
                    // if (ip.includes(':')) ip = ip.split(':')[0];
                    ips.add(ip);
                }
            }

            if (missingProxy) {
                console.warn('Algumas instâncias não têm proxy configurado. Disparo em massa pode ser arriscado.');
            }
            // [REMOVED] Uniqueness Check as per user request
            // if (ips.size < selectedObjs.length) return alert('ERRO: Para multi-disparo, cada instância deve ter um IP de Proxy DIFERENTE.');
        }

        const token = getToken();
        if (!token) return alert('Sessão expirada. Faça login novamente.');

        setLoading(true);
        setStatus('LIMPANDO FILA...');

        try {
            // [FIX] Auto-clean queue to prevent "Stuck" jobs from previous crash
            await fetch(`${API_URL}/campaign/queue/clean`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) { console.error("Auto-clean failed", e); }

        setStatus('INICIANDO...');

        try {
            const pendingLeads = leads.filter(l => l.status === 'PENDING');

            // [ROBOT] Round-Robin Message Distribution
            const validMessages = messages.filter(m => m.trim().length > 0);

            // Map items
            const items = pendingLeads.map((l, index) => ({
                number: l.number,
                message: validMessages[index % validMessages.length], // Rotate messages
                variables: l.vars
            }));

            // ... (rest is same)
            const payload = {
                instanceNames: selectedInstances, // [NEW] Array
                customDomain, // [NEW] Custom Domain for Dynamic Links
                delayConfig: { minDelay, maxDelay, minTyping, maxTyping }, // [NEW] Pass Config
                items: items
            };

            // ... fetch call
            const res = await fetch(`${API_URL}/campaign/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                if (data.leads && Array.isArray(data.leads)) {
                    const idMap = new Map(data.leads.map((l: any) => [l.number, l.id]));
                    setLeads(curr => curr.map(l => ({
                        ...l,
                        id: idMap.get(l.number) || l.id
                    })));
                }

                setCampaignId(data.campaignId);
                localStorage.setItem('active_campaign_id', data.campaignId);
                localStorage.setItem('campaign_init_' + data.campaignId, String(initialCount || leads.length));
                setStatus('DISPARANDO 🚀');
            } else {
                const err = await res.json();
                alert('Erro: ' + (err.error || 'Falha desconhecida'));
                setStatus('ERRO NO ENVIO');
            }
        } catch (e) {
            console.error(e);
            setStatus('ERRO DE CONEXÃO');
        } finally {
            setLoading(false);
        }
    };

    const stopCampaign = async () => {
        if (!campaignId) return;
        const token = getToken();
        await fetch(`${API_URL}/campaign/${campaignId}/stop`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        setStatus('PARADO');
        setCampaignId(null);
        localStorage.removeItem('active_campaign_id');
    };

    // UI RENDER HELPERS
    const addMessage = () => setMessages([...messages, '']);
    const removeMessage = (idx: number) => {
        if (messages.length === 1) return;
        setMessages(messages.filter((_, i) => i !== idx));
    };
    const updateMessage = (idx: number, val: string) => {
        const newMsgs = [...messages];
        newMsgs[idx] = val;
        setMessages(newMsgs);
    };

    // [NEW] Lead Management
    const removeLead = (idx: number) => {
        setLeads(prev => prev.filter((_, i) => i !== idx));
    };

    const clearSent = async () => {
        if (!window.confirm('Isso irá:\n1. Reciclar erros (FALHOU -> AGUARDANDO)\n2. Limpar histórico de enviados\n\nDeseja continuar?')) return;

        // If just local (no campaign yet), simple filter
        if (!campaignId) {
            setLeads(prev => prev.filter(l => l.status === 'PENDING'));
            return;
        }

        setStatus('RECICLANDO...');
        setLoading(true);

        const token = getToken();
        try {
            // 1. Recycle Failed -> Pending
            await fetch(`${API_URL}/campaign/${campaignId}/leads/reset-failed`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // 2. Clear Sent (Optional? User said "Clean & Recycle" so implies cleaning sent)
            await fetch(`${API_URL}/campaign/${campaignId}/leads/clear-sent`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // 3. HARD REFRESH (Fetch fresh list from server to fix the UI counters)
            const res = await fetch(`${API_URL}/campaign/${campaignId}/leads`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.leads) {
                    setLeads(data.leads);
                }
            }
            setStatus(dispatcherStats?.status || 'PRONTO');
        } catch (e) {
            console.error(e);
            alert('Erro ao reciclar lista.');
            setStatus('ERRO');
        } finally {
            setLoading(false);
        }
    };

    // --- RENDER ---
    return (
        <div className="relative min-h-screen pb-24 overflow-hidden">
            <MoneyRain />

            <div className="relative z-10 p-4 md:p-8 max-w-[1800px] mx-auto space-y-8 animate-in fade-in duration-700">

                {/* Header Section (Matched Dashboard) */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 backdrop-blur-sm bg-black/20 p-6 rounded-3xl border border-white/5">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-green via-zinc-200 to-zinc-500 tracking-tighter flex items-center gap-3 drop-shadow-sm">
                            <Zap className="w-10 h-10 text-neon-green drop-shadow-[0_0_10px_rgba(0,255,0,0.5)]" />
                            DISPARADOR <span className="text-white font-mono">TURBO</span>
                        </h1>
                        <p className="text-zinc-400 mt-2 text-sm font-medium tracking-wide">
                            Envio em massa de alta performance com Múltiplas Proxies Inteligentes.
                        </p>
                    </div>

                    <div className="flex items-center gap-4 bg-black/40 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-md shadow-2xl">
                        <Activity className="w-6 h-6 text-neon-green/80" />
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Status do Motor</span>
                            <span className="text-white font-mono font-bold capitalize text-sm md:text-base tracking-wide flex items-center justify-end gap-2">
                                {status === 'DISPARANDO 🚀' ? <span className="animate-pulse text-neon-green">ENVIANDO...</span> : status}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 1. TOP STATUS BAR (Matched Stats Cards) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatCard
                        label="ENVIADOS"
                        value={totalSent}
                        icon={Send}
                        color="text-neon-green"
                        subValue={`Progresso: ${Math.round((totalSent / Math.max(initialCount, 1)) * 100)}%`}
                    />
                    <StatCard
                        label="NA FILA"
                        value={pendingCount}
                        icon={List}
                        color="text-blue-400"
                        subValue="Aguardando liberação"
                    />
                    <StatCard
                        label="FALHAS"
                        value={failedCount}
                        icon={XCircle}
                        color="text-red-500"
                        subValue="Erros críticos"
                    />
                    <StatCard
                        label="INSTÂNCIA"
                        value={selectedInstances.length > 0 ? `${selectedInstances.length} ON` : 'OFF'}
                        icon={Wifi}
                        color={selectedInstances.length > 0 ? 'text-green-400' : 'text-zinc-600'}
                        subValue={selectedInstances.join(', ') || 'Desconectado'}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* LEFT: CONFIG (4 Cols) - Matched "Calendar/Filter" aesthetics */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden group hover:border-neon-green/30 transition-all duration-500">
                            <div className="absolute inset-0 bg-gradient-to-br from-neon-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl pointer-events-none" />

                            <div className="relative z-10 space-y-6">
                                <div>
                                    <h2 className="text-xl font-black text-white tracking-wide flex items-center gap-2 mb-1">
                                        <Smartphone className="w-5 h-5 text-neon-green" />
                                        Configuração
                                    </h2>
                                    <p className="text-zinc-600 text-xs font-medium">Prepare sua campanha em segundos.</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Conexão</label>
                                            <button
                                                onClick={() => {
                                                    const uniqueIPs = new Map();
                                                    const bestInstances: string[] = [];

                                                    // Prioritize instances with Proxy
                                                    const sorted = [...instances].sort((a, b) => {
                                                        const aHas = a.proxyConfig && a.proxyConfig.length > 5;
                                                        const bHas = b.proxyConfig && b.proxyConfig.length > 5;
                                                        return (bHas ? 1 : 0) - (aHas ? 1 : 0);
                                                    });

                                                    for (const inst of sorted) {
                                                        if (bestInstances.length >= 10) break;

                                                        let ip = 'direct';
                                                        if (inst.proxyConfig && inst.proxyConfig.length > 5) {
                                                            ip = inst.proxyConfig;
                                                            if (ip.includes('://')) ip = ip.split('://')[1];
                                                            // Group by Host+Port? Or just Host?
                                                            // Using full string as unique key for now (Host:Port:User:Pass) ensures mostly unique logic
                                                            // But effectively we want unique CONNECTIONS.
                                                            // Let's use the full proxy string as key.
                                                        }

                                                        if (!uniqueIPs.has(ip)) {
                                                            uniqueIPs.set(ip, true);
                                                            bestInstances.push(inst.name);
                                                        }
                                                    }

                                                    if (bestInstances.length === 0) return alert('Nenhuma instância disponível.');
                                                    setSelectedInstances(bestInstances);
                                                }}
                                                className="text-[10px] text-neon-green hover:text-white font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                                                title="Selecionar até 10 IPs únicos"
                                            >
                                                <Zap className="w-3 h-3" />
                                                Auto Select (Max 10)
                                            </button>
                                        </div>
                                        <div className="bg-zinc-900/50 border border-zinc-700/50 rounded-xl p-2 max-h-[150px] overflow-y-auto space-y-1 custom-scrollbar">
                                            {instances.map(i => {
                                                const isSelected = selectedInstances.includes(i.name);
                                                const hasProxy = i.proxyConfig && i.proxyConfig.length > 5;

                                                // [PROXY NUMBERING] Calculate index based on unique IPs (Host + Port)
                                                let proxyIndex = -1;
                                                if (hasProxy) {
                                                    const uniqueIPs = Array.from(new Set(
                                                        instances
                                                            .filter(inst => inst.proxyConfig && inst.proxyConfig.length > 5)
                                                            .map(inst => {
                                                                let ip = inst.proxyConfig;
                                                                if (ip.includes('://')) ip = ip.split('://')[1];
                                                                // [FIX] Keep Auth (User:Pass) because BrightData uses unique usernames for sessions
                                                                // if (ip.includes('@')) ip = ip.split('@')[1]; 
                                                                return ip;
                                                            })
                                                    ));

                                                    // Get current IP
                                                    let currentIp = i.proxyConfig;
                                                    if (currentIp.includes('://')) currentIp = currentIp.split('://')[1];
                                                    // if (currentIp.includes('@')) currentIp = currentIp.split('@')[1];

                                                    proxyIndex = uniqueIPs.indexOf(currentIp) + 1;
                                                }

                                                return (
                                                    <div
                                                        key={i.name}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setSelectedInstances(prev => prev.filter(n => n !== i.name));
                                                            } else {
                                                                if (selectedInstances.length >= 10) return alert('Máximo de 10 instâncias permitidas.');
                                                                setSelectedInstances(prev => [...prev, i.name]);
                                                            }
                                                        }}
                                                        className={`
                                                                flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border
                                                                ${isSelected
                                                                ? 'bg-neon-green/10 border-neon-green/50'
                                                                : 'hover:bg-zinc-800 border-transparent'}
                                                            `}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-neon-green border-neon-green' : 'border-zinc-600'}`}>
                                                                {isSelected && <div className="w-2 h-2 bg-black rounded-full" />}
                                                            </div>
                                                            <span className={`text-xs font-mono font-bold ${isSelected ? 'text-white' : 'text-zinc-400'}`}>
                                                                {i.name}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            {/* Delete Button */}
                                                            <button
                                                                onClick={(e) => deleteInstance(e, i.name)}
                                                                className="p-1.5 hover:bg-red-500/20 text-zinc-600 hover:text-red-500 rounded transition-colors"
                                                                title="Remover Instância"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </div>

                                                        <div className="flex items-center gap-2" title={hasProxy ? `Proxy #${proxyIndex}` : "Sem Proxy"}>
                                                            {hasProxy ? (
                                                                <div className="flex items-center gap-1 text-[10px] text-green-400 bg-green-900/20 px-1.5 py-0.5 rounded border border-green-500/20">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                                    PROXY {proxyIndex}
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-1 text-[10px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded border border-red-500/20">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                                    DIRECT
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {instances.length === 0 && (
                                                <div className="p-4 text-center text-xs text-zinc-500">Nenhuma instância conectada.</div>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-zinc-600 text-right">
                                            {selectedInstances.length}/10 Selecionadas
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                Domínio Personalizado (Opcional)
                                            </label>
                                            <input
                                                type="text"
                                                value={customDomain}
                                                onChange={(e) => setCustomDomain(e.target.value)}
                                                placeholder="ex: entregaexpressa.com"
                                                className="w-full bg-zinc-900/50 border border-zinc-700/50 text-white rounded-xl px-4 py-2 focus:border-neon-green focus:ring-1 focus:ring-neon-green/50 outline-none transition-all font-mono text-xs"
                                            />
                                            <p className="text-[10px] text-zinc-600">
                                                Gera links como: <span className="text-zinc-400">https://NOME.seu-dominio.com</span>
                                            </p>
                                        </div>

                                        {/* [NEW] Human Delay Controls */}
                                        <div className="space-y-3 pt-4 border-t border-white/5">
                                            <label className="text-[10px] font-black text-neon-green uppercase tracking-widest flex items-center gap-2">
                                                <Activity className="w-3 h-3" />
                                                Comportamento Humano (Segundos)
                                            </label>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Entrar no Chat (Min - Max)</span>
                                                    <div className="flex items-center gap-2">
                                                        <input type="number" value={minDelay} onChange={e => setMinDelay(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center" />
                                                        <span className="text-zinc-600">-</span>
                                                        <input type="number" value={maxDelay} onChange={e => setMaxDelay(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Digitando (Min - Max)</span>
                                                    <div className="flex items-center gap-2">
                                                        <input type="number" value={minTyping} onChange={e => setMinTyping(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center" />
                                                        <span className="text-zinc-600">-</span>
                                                        <input type="number" value={maxTyping} onChange={e => setMaxTyping(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-white text-xs font-mono text-center" />
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-[9px] text-zinc-500 italic text-right">
                                                O sistema escolherá um tempo aleatório exato (ex: 14.62s) dentro destes intervalos.
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                                Mensagens (Rotação Automática)
                                            </label>
                                            <button
                                                onClick={addMessage}
                                                className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-neon-green px-2 py-1 rounded uppercase font-bold transition-colors"
                                            >
                                                + Adicionar Variação
                                            </button>
                                        </div>

                                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                            {messages.map((msg, idx) => (
                                                <div key={idx} className="relative group/msg mb-4">
                                                    <div className="absolute -left-3 top-3 text-[10px] font-mono text-zinc-600 font-bold rotate-[-90deg]">
                                                        #{idx + 1}
                                                    </div>

                                                    {/* HIGHLIGHTER WRAPPER */}
                                                    <div className="relative w-full min-h-[120px] rounded-xl bg-zinc-900/50 border border-zinc-700/50 focus-within:border-neon-green focus-within:ring-1 focus-within:ring-neon-green/50 transition-all overflow-hidden group-focus-within:ring-opacity-50">

                                                        {/* BACKDROP (Renderer) */}
                                                        <div className="absolute inset-0 p-4 font-mono text-sm whitespace-pre-wrap break-words pointer-events-none z-0" aria-hidden="true">
                                                            {msg.split(/(\{[^{}]+\})/g).map((part, i) => {
                                                                if (part.match(/^\{[^{}]+\}$/)) {
                                                                    // Highlight Variable/Spintax
                                                                    return <span key={i} className="text-neon-green font-bold bg-neon-green/10 rounded px-0.5 shadow-[0_0_5px_rgba(0,230,118,0.2)]">{part}</span>;
                                                                }
                                                                return <span key={i} className="text-zinc-400">{part}</span>;
                                                            })}
                                                            {/* Line break fix for trailing newlines */}
                                                            {msg.endsWith('\n') && <br />}
                                                        </div>

                                                        {/* TEXTAREA (Input) */}
                                                        <textarea
                                                            value={msg}
                                                            onChange={(e) => updateMessage(idx, e.target.value)}
                                                            className="relative z-10 w-full h-full min-h-[120px] bg-transparent text-transparent caret-white px-4 py-4 font-mono text-sm outline-none resize-none focus:outline-none custom-scrollbar leading-normal"
                                                            placeholder={`Variação de mensagem ${idx + 1}...`}
                                                            spellCheck={false}
                                                            style={{ lineHeight: '1.5' }} // Force line-height match
                                                        />
                                                    </div>

                                                    {messages.length > 1 && (
                                                        <button
                                                            onClick={() => removeMessage(idx)}
                                                            className="absolute top-2 right-2 text-zinc-600 hover:text-red-500 transition-colors p-1 z-20 bg-zinc-900 rounded-md border border-zinc-800"
                                                            title="Remover variação"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-white/5 space-y-3">
                                        <label className="flex items-center justify-center gap-3 w-full bg-zinc-900/50 hover:bg-zinc-800 p-4 rounded-xl cursor-pointer transition-all border border-zinc-700/50 hover:border-white/20 border-dashed group/upload">
                                            <Upload className="w-5 h-5 text-zinc-500 group-hover/upload:text-neon-green transition-colors" />
                                            <span className="text-xs font-bold text-zinc-400 group-hover/upload:text-white uppercase tracking-wider">Importar CSV/XLSX</span>
                                            <input type="file" onChange={handleImport} className="hidden" accept=".xlsx,.csv" />
                                        </label>

                                        {!campaignId ? (
                                            <SmartStartButton
                                                campaignId="new"
                                                instanceCount={selectedInstances.length}
                                                onStart={startCampaign}
                                            />
                                        ) : (
                                            <button
                                                onClick={stopCampaign}
                                                className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl shadow-lg shadow-red-900/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                                            >
                                                <PauseCircle className="fill-white w-5 h-5" />
                                                PARAR IMEDIATAMENTE
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: MONITOR (8 Cols) - Matched "Advanced History Table" */}
                    <div className="lg:col-span-8">
                        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative h-full flex flex-col">
                            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tight">Monitoramento em Tempo Real</h3>
                                    <p className="text-zinc-500 text-xs mt-1 font-medium">Acompanhe o status individual de cada envio.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {/* [NEW] Clear Sent Button - Also Recycles Failed */}
                                    {!campaignId && leads.some(l => l.status === 'SENT' || l.status === 'FAILED') && (
                                        <button
                                            onClick={clearSent}
                                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                                        >
                                            <Trash2 className="w-3 h-3" /> Limpar & Reciclar
                                        </button>
                                    )}
                                    <span className="bg-zinc-900/80 border border-white/10 text-zinc-300 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
                                        Total: {leads.length} leads
                                    </span>
                                </div>
                            </div>

                            {/* [VISUALIZER] */}
                            {campaignId && dispatcherStats && (
                                <div className="border-b border-white/5 p-4 bg-black/10">
                                    <div className="flex items-center gap-2 mb-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                                        <Activity className="w-4 h-4" />
                                        Dispatcher Visualizer
                                    </div>
                                    <CampaignVisualizer stats={dispatcherStats} />
                                </div>
                            )}

                            {/* [HELP] Variables Hint */}
                            <div className="bg-black/20 px-8 py-3 border-b border-white/5 flex items-center gap-3">
                                <div className="p-1.5 bg-blue-500/20 rounded-md">
                                    <FileText className="w-4 h-4 text-blue-400" />
                                </div>
                                <p className="text-xs text-blue-200/80">
                                    <span className="font-bold text-blue-100">Como usar variáveis:</span> As colunas da planilha (B, C, D...) viram
                                    <code className="mx-1 bg-black/40 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[10px]">{`{var1}`}</code>,
                                    <code className="mx-1 bg-black/40 px-1.5 py-0.5 rounded text-blue-300 font-mono text-[10px]">{`{var2}`}</code>, etc.
                                </p>
                            </div>


                            {/* TABLE CONTAINER: Fixed Height for ~10 rows (approx 600px or so) */}
                            {/* Each row is ~60px padding + text. 10 rows ~= 600px. */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[600px] bg-zinc-950/20 relative">
                                {leads.length > 0 ? (
                                    <table className="w-full text-left text-sm">
                                        <thead className="text-[10px] uppercase bg-zinc-950/90 text-zinc-500 font-black border-b border-white/5 sticky top-0 backdrop-blur-md z-20 tracking-widest shadow-sm">
                                            <tr>
                                                <th className="px-8 py-5">Status</th>
                                                <th className="px-8 py-5">Número</th>
                                                <th className="px-8 py-5 text-right">Log / Erro</th>
                                                <th className="px-4 py-5 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 text-zinc-300">
                                            {leads.slice(0, 300).map((lead, idx) => (
                                                <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                                    <td className="px-8 py-4">
                                                        {lead.status === 'PENDING' && (
                                                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 text-[10px] font-bold">
                                                                <span className="relative flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-500"></span>
                                                                </span>
                                                                AGUARDANDO
                                                            </span>
                                                        )}
                                                        {lead.status === 'SENT' && (
                                                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-900/20 border border-green-500/20 text-neon-green text-[10px] font-bold shadow-[0_0_10px_rgba(0,255,0,0.2)]">
                                                                <CheckCircle className="w-3 h-3" /> ENVIADO
                                                            </span>
                                                        )}
                                                        {lead.status === 'FAILED' && (
                                                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-900/20 border border-red-500/20 text-red-500 text-[10px] font-bold">
                                                                <XCircle className="w-3 h-3" /> FALHOU
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-4 font-mono font-bold text-white tracking-wider">
                                                        {lead.number}
                                                    </td>
                                                    <td className="px-8 py-4 text-right">
                                                        <span className="text-zinc-600 text-xs font-mono group-hover:text-zinc-400 transition-colors">
                                                            {lead.error ? lead.error : (lead.status === 'SENT' ? 'Entregue com sucesso' : '-')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 text-right">
                                                        <button
                                                            onClick={() => removeLead(idx)}
                                                            className="p-1.5 text-zinc-700 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                            title="Excluir Lead"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {leads.length > 300 && (
                                                <tr><td colSpan={3} className="p-8 text-center text-[10px] uppercase tracking-widest text-zinc-600 font-bold border-t border-dashed border-zinc-800">
                                                    ... Mais {leads.length - 300} leads ocultos para performance ...
                                                </td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="h-full min-h-[400px] flex flex-col items-center justify-center gap-6 text-zinc-700">
                                        <div className="p-6 rounded-full bg-black/40 border border-white/5">
                                            <Search className="w-16 h-16 opacity-20" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-zinc-400 font-bold uppercase tracking-widest text-xs mb-2">Lista Vazia</p>
                                            <p className="text-zinc-600 text-sm max-w-xs">Importe uma planilha para visualizar os contatos aqui.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div >
            </div >
        </div >
    );
}
