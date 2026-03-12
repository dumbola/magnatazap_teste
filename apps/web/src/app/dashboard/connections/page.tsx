'use client';

import { useState, useEffect } from 'react';
import {
    Plus, Wifi, WifiOff, Trash2, Smartphone, UserCog, Save, X, Upload,
    KeyRound, CheckSquare, Square, RefreshCw, Zap, ShieldCheck, Sparkles, Image as ImageIcon
} from 'lucide-react';
import { API_URL } from '@/lib/api';
// MoneyRain removed

interface Instance {
    id: string;
    name: string;
    phone: string | null;
    status: string;
    updatedAt: string;
    isHumanized?: boolean;
}

export default function ConnectionsPage() {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [form, setForm] = useState({ name: '', phone: '' });
    const [activePairingCode, setActivePairingCode] = useState<string | null>(null);
    const [availableCodes, setAvailableCodes] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [identityModal, setIdentityModal] = useState<string | null>(null);
    const [identityForm, setIdentityForm] = useState({ name: '', status: '', imageBase64: '' });
    const [uploadPreview, setUploadPreview] = useState<string | null>(null);

    // [NEW] Bulk Selection State
    const [selectedInstances, setSelectedInstances] = useState<Set<string>>(new Set());

    // [NEW] Track creation time to detect timeouts (Local only for UI)
    const [creationTimes, setCreationTimes] = useState<Record<string, number>>({});

    const getToken = () => {
        if (typeof document !== 'undefined') {
            return document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
        }
        return null;
    };

    const refresh = async () => {
        try {
            const token = getToken();
            if (!token) return;

            const res = await fetch(`${API_URL}/instance/list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                if (res.status === 401) window.location.href = '/login';
                return;
            }

            const data = await res.json();

            if (Array.isArray(data)) {
                setInstances(data);

                // Polling for Pairing Codes
                const connecting = data.filter((i: Instance) => i.status === 'CONNECTING');
                const newCodes: Record<string, string> = {};

                if (connecting.length) {
                    for (const c of connecting) {
                        try {
                            const statusRes = await fetch(`${API_URL}/instance/${c.name}/status`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            }).then(r => r.json());

                            if (statusRes.pairingCode) {
                                newCodes[c.name] = statusRes.pairingCode;
                            }
                        } catch { }
                    }
                }
                // [FIX] Replace state completely to remove expired/cleared codes
                setAvailableCodes(newCodes);
            }
        } catch (e) {
            console.error('Fetch Error:', e);
        }
    };

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, 2000);
        return () => clearInterval(t);
    }, []);

    const create = async () => {
        if (!form.name || !form.phone) return;
        setLoading(true);
        setActivePairingCode(null);

        try {
            const res = await fetch(`${API_URL}/instance/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ name: form.name, phoneNumber: form.phone })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Falha ao criar instância');
            }

            // [NEW] Track start time for timeout handling
            setCreationTimes(prev => ({ ...prev, [form.name]: Date.now() }));

            setForm({ name: '', phone: '' });
            await refresh();
        } catch (e: any) {
            console.error('Init Error:', e);
            alert(`Erro: ${e.message}`);
        }
        setLoading(false);
    };

    const remove = async (name: string) => {
        if (confirm(`Excluir ${name}?`)) {
            await deleteInstance(name);
        }
    };

    const deleteInstance = async (name: string) => {
        const res = await fetch(`${API_URL}/instance/${name}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!res.ok) {
            const data = await res.json();
            alert(`Erro ao excluir: ${data.message || 'Falha desconhecida'}`);
            return;
        }

        setAvailableCodes(prev => {
            const copy = { ...prev };
            delete copy[name];
            return copy;
        });

        // Remove from selection if present
        if (selectedInstances.has(name)) {
            const newSet = new Set(selectedInstances);
            newSet.delete(name);
            setSelectedInstances(newSet);
        }

        refresh();
    };

    const bulkDelete = async () => {
        if (!confirm(`Excluir ${selectedInstances.size} instâncias selecionadas?`)) return;

        const toDelete = Array.from(selectedInstances);
        // Simple Promise.all works fine for small batches
        await Promise.all(toDelete.map(name => deleteInstance(name)));
        setSelectedInstances(new Set());
    };

    const toggleSelection = (name: string) => {
        const newSet = new Set(selectedInstances);
        if (newSet.has(name)) newSet.delete(name);
        else newSet.add(name);
        setSelectedInstances(newSet);
    };

    // Identity functions (unchanged logic, just style updates)
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setUploadPreview(reader.result as string);
            setIdentityForm(prev => ({ ...prev, imageBase64: reader.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const saveIdentity = async () => {
        /* ... existing logic ... */
        if (!identityModal) return;
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
        try {
            if (identityForm.name) await fetch(`${API_URL}/instance/${identityModal}/update-name`, { method: 'POST', headers, body: JSON.stringify({ name: identityForm.name }) });
            if (identityForm.status) await fetch(`${API_URL}/instance/${identityModal}/update-status`, { method: 'POST', headers, body: JSON.stringify({ status: identityForm.status }) });
            if (identityForm.imageBase64) await fetch(`${API_URL}/instance/${identityModal}/update-picture`, { method: 'POST', headers, body: JSON.stringify({ image: identityForm.imageBase64 }) });
            alert('Perfil Atualizado!');
            setIdentityModal(null);
        } catch (e) { alert('Erro ao atualizar.'); }
    };

    // [NEW] Bulk Profile Update
    const [bulkEditModal, setBulkEditModal] = useState(false);
    const [modifiedInstances, setModifiedInstances] = useState<Set<string>>(new Set());

    // [NEW] AI Humanization State
    const [assets, setAssets] = useState<any[]>([]);
    const [humanizePrompt, setHumanizePrompt] = useState('');
    const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
    const [isHumanizing, setIsHumanizing] = useState(false);

    useEffect(() => {
        if (bulkEditModal) {
            // Fetch assets when modal opens
            const token = getToken();
            if (token) {
                fetch(`${API_URL}/assets`, { headers: { 'Authorization': `Bearer ${token}` } })
                    .then(r => r.json())
                    .then(data => { if (Array.isArray(data)) setAssets(data); })
                    .catch(() => { });
            }
        }
    }, [bulkEditModal]);

    const bulkHumanize = async () => {
        if (!humanizePrompt) {
            alert('Por favor, descreva o perfil (Prompt) para a IA.');
            return;
        }

        const token = getToken();
        if (!token) return;

        setIsHumanizing(true);
        try {
            // Find selected asset data if any
            const assetData = assets.find(a => a.id === selectedAsset)?.data;

            const res = await fetch(`${API_URL}/instance/bulk-humanize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    instanceNames: Array.from(selectedInstances),
                    prompt: humanizePrompt,
                    imageBase64: assetData // Optional
                })
            });

            const data = await res.json();
            if (data.success && data.results) {
                const newModified = new Set(modifiedInstances);
                data.results.forEach((r: any) => {
                    if (r.success) newModified.add(r.name);
                });
                setModifiedInstances(newModified);

                alert(`Humanização concluída com sucesso! ${data.results.length} perfis atualizados.`);
                setBulkEditModal(false);
                setHumanizePrompt('');
                setSelectedAsset(null);
                setSelectedInstances(new Set());
            } else {
                alert(`Erro: ${data.error || 'Falha na humanização.'}`);
            }
        } catch (e: any) {
            alert('Erro ao conectar com servidor.');
        }
        setIsHumanizing(false);
    };

    return (
        <div className="relative min-h-screen pb-24 overflow-hidden">
            {/* MoneyRain Removed */}

            <div className="relative z-10 p-4 md:p-8 max-w-[1800px] mx-auto space-y-8 animate-in fade-in duration-700">

                {/* Header Section */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 backdrop-blur-sm bg-black/20 p-6 rounded-3xl border border-white/5">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-green via-zinc-200 to-zinc-500 tracking-tighter flex items-center gap-3 drop-shadow-sm">
                            <Wifi className="w-10 h-10 text-neon-green drop-shadow-[0_0_10px_rgba(0,255,0,0.5)]" />
                            GATEWAYS <span className="text-white font-mono">WHATSAPP</span>
                        </h1>
                        <p className="text-zinc-400 mt-2 text-sm font-medium tracking-wide">
                            Gerencie suas conexões de alta performance.
                        </p>
                    </div>

                    {/* Quick Stats / Actions */}
                    <div className="flex gap-4">
                        {selectedInstances.size > 0 && (
                            <>
                                <button
                                    onClick={() => setBulkEditModal(true)}
                                    className="bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all animate-in fade-in"
                                >
                                    <UserCog className="w-4 h-4 text-neon-green" />
                                    Humanizar ({selectedInstances.size})
                                </button>
                                <button
                                    onClick={bulkDelete}
                                    className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-500 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all animate-in fade-in"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Excluir ({selectedInstances.size})
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Config & Create */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden">
                        <div className="flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Nome da Instância</label>
                                <input
                                    placeholder="Ex: Comercial 01"
                                    className="w-full bg-zinc-900/50 border border-zinc-700/50 text-white rounded-xl px-4 py-3 focus:border-neon-green focus:ring-1 focus:ring-neon-green/50 outline-none transition-all font-mono text-sm"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                />
                            </div>
                            <div className="w-full md:w-48">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Telefone</label>
                                <input
                                    placeholder="55..."
                                    className="w-full bg-zinc-900/50 border border-zinc-700/50 text-white rounded-xl px-4 py-3 focus:border-neon-green focus:ring-1 focus:ring-neon-green/50 outline-none transition-all font-mono text-sm"
                                    value={form.phone}
                                    onChange={e => setForm({ ...form, phone: e.target.value })}
                                />
                            </div>
                            <button
                                onClick={create}
                                disabled={loading || !form.name || !form.phone}
                                className="w-full md:w-auto bg-neon-green hover:bg-[#00cc6a] text-black font-black py-3 px-8 rounded-xl shadow-lg shadow-neon-green/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 h-[46px]"
                            >
                                {loading ? <RefreshCw className="animate-spin w-5 h-5" /> : <Plus className="fill-black w-5 h-5" />}
                                NOVA CONEXÃO
                            </button>
                        </div>
                    </div>
                </div>

                {/* Instance Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {instances.map(inst => {
                        const online = inst.status === 'CONNECTED';
                        const connecting = inst.status === 'CONNECTING';
                        const codeAvailable = availableCodes[inst.name];
                        const createdTime = creationTimes[inst.name] || 0;
                        const isStuck = connecting && !codeAvailable && (Date.now() - createdTime > 30000);
                        const isHumanized = inst.isHumanized || modifiedInstances.has(inst.name);

                        return (
                            <div
                                key={inst.name}
                                className={`
                                    relative group bg-zinc-900/40 border p-6 rounded-3xl transition-all duration-300 hover:scale-[1.01]
                                    ${online ? 'border-neon-green/30 shadow-[0_0_20px_rgba(0,255,0,0.1)]' : 'border-white/5 hover:border-white/10'}
                                    ${selectedInstances.has(inst.name) ? 'ring-2 ring-neon-green bg-neon-green/5' : ''}
                                `}
                            >
                                {/* Humanized Badge (Verified) */}
                                {isHumanized && (
                                    <div className="absolute top-0 right-0 -mt-2 -mr-2 bg-neon-green text-black rounded-full p-1.5 shadow-lg border-2 border-black z-20" title="Perfil humanizado">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                )}

                                {/* Header */}
                                <div className="flex justify-between items-start mb-6">
                                    <div
                                        onClick={() => toggleSelection(inst.name)}
                                        className="cursor-pointer text-zinc-600 hover:text-white transition-colors"
                                    >
                                        {selectedInstances.has(inst.name) ? <CheckSquare className="w-5 h-5 text-neon-green" /> : <Square className="w-5 h-5" />}
                                    </div>

                                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${online ? 'bg-neon-green/10 border-neon-green/20 text-neon-green' :
                                        connecting ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 'bg-red-500/10 border-red-500/20 text-red-500'
                                        }`}>
                                        {inst.status}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${online ? 'bg-neon-green text-black' : 'bg-zinc-800 text-zinc-500'
                                            }`}>
                                            <Smartphone className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-white font-bold text-lg truncate max-w-[140px]" title={inst.name}>{inst.name}</h3>
                                            <p className="text-zinc-500 font-mono text-xs">{inst.phone || '---'}</p>
                                        </div>
                                    </div>

                                    {/* Actions / Status Message */}
                                    <div className="pt-4 border-t border-white/5">
                                        {online ? (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setIdentityModal(inst.name); }}
                                                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <UserCog className="w-3 h-3" /> PERFIL
                                                </button>
                                                <button
                                                    onClick={() => remove(inst.name)}
                                                    className="w-8 bg-zinc-800 hover:bg-red-500/20 hover:text-red-500 text-zinc-500 rounded-lg flex items-center justify-center transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : connecting ? (
                                            <div className="space-y-3">
                                                {codeAvailable ? (
                                                    <button
                                                        onClick={() => setActivePairingCode(codeAvailable)}
                                                        className="w-full bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/50 text-xs font-black py-2.5 rounded-lg animate-pulse flex items-center justify-center gap-2"
                                                    >
                                                        VER CÓDIGO
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2 text-yellow-500 text-xs font-bold bg-yellow-500/5 p-2 rounded-lg border border-yellow-500/10">
                                                        <RefreshCw className="w-3 h-3 animate-spin" />
                                                        {isStuck ? 'TENTANDO...' : 'GERANDO CÓDIGO...'}
                                                    </div>
                                                )}

                                                {/* Stuck? Force Delete */}
                                                <button
                                                    onClick={() => remove(inst.name)}
                                                    className="w-full text-zinc-600 hover:text-red-500 text-[10px] uppercase font-bold tracking-wider transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <Trash2 className="w-3 h-3" /> CANCELAR
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => remove(inst.name)}
                                                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 text-xs font-bold py-2 rounded-lg transition-colors"
                                            >
                                                REMOVER
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {instances.length === 0 && !loading && (
                    <div className="text-center py-24 opacity-30">
                        <WifiOff className="w-24 h-24 mx-auto mb-4 text-zinc-500" />
                        <h3 className="text-xl font-bold text-white">Nenhuma conexão ativa</h3>
                        <p className="text-zinc-500">Adicione uma nova instância para começar.</p>
                    </div>
                )}

            </div>

            {/* Pairing Code Modal (Copied from previous, kept nice) */}
            {activePairingCode && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in zoom-in-95 duration-300">
                    <div className="bg-zinc-950 border border-neon-green/30 p-8 md:p-10 rounded-3xl max-w-md w-full text-center relative shadow-[0_0_50px_rgba(0,255,0,0.1)]">
                        <button onClick={() => setActivePairingCode(null)} className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>

                        <div className="w-20 h-20 mx-auto rounded-full bg-neon-green/10 flex items-center justify-center border border-neon-green/20 mb-6">
                            <KeyRound className="w-10 h-10 text-neon-green" />
                        </div>

                        <h3 className="text-3xl font-black text-white mb-2 tracking-tight">Código de Pareamento</h3>
                        <p className="text-zinc-500 mb-8 text-sm font-medium">Digite este código no seu WhatsApp</p>

                        <div className="bg-black border border-white/10 p-8 rounded-2xl mb-8 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-neon-green/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="text-5xl font-mono font-black text-neon-green tracking-[0.2em] relative z-10 drop-shadow-[0_0_15px_rgba(0,255,0,0.5)]">
                                {activePairingCode.match(/.{1,4}/g)?.join('-')}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Indentity Modal (Single - Existing) */}
            {identityModal && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-950 border border-white/10 p-8 rounded-3xl max-w-md w-full relative shadow-2xl">
                        <h3 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
                            <UserCog className="w-6 h-6 text-neon-green" />
                            Editar Perfil
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Nome de Exibição</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-3 outline-none focus:border-neon-green transition-colors font-medium text-sm"
                                    value={identityForm.name}
                                    onChange={e => setIdentityForm({ ...identityForm, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1 block">Recado (Bio)</label>
                                <input
                                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-3 outline-none focus:border-neon-green transition-colors font-medium text-sm"
                                    value={identityForm.status}
                                    onChange={e => setIdentityForm({ ...identityForm, status: e.target.value })}
                                />
                            </div>

                            <div className="pt-2">
                                <label className="flex items-center justify-center gap-3 w-full bg-zinc-900 hover:bg-zinc-800 p-4 rounded-xl cursor-pointer transition-all border border-zinc-800 border-dashed group">
                                    {uploadPreview ? (
                                        <img src={uploadPreview} className="w-12 h-12 rounded-full object-cover border-2 border-neon-green" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                                            <Upload className="w-5 h-5 text-zinc-400" />
                                        </div>
                                    )}
                                    <span className="text-sm font-bold text-zinc-400 group-hover:text-white uppercase tracking-wider">Alterar Foto</span>
                                    <input type="file" onChange={handleFileChange} className="hidden" accept="image/*" />
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button onClick={() => setIdentityModal(null)} className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={saveIdentity} className="flex-1 bg-neon-green hover:bg-[#00cc6a] text-black font-black py-3 rounded-xl transition-colors shadow-lg shadow-neon-green/20">
                                    Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* [NEW] Bulk Edit Modal */}
            {bulkEditModal && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-950 border border-neon-green/30 p-8 rounded-3xl max-w-2xl w-full relative shadow-[0_0_50px_rgba(0,255,0,0.1)]">
                        <h3 className="text-2xl font-black text-white mb-2 flex items-center gap-3">
                            <Sparkles className="w-6 h-6 text-neon-green" />
                            Humanização com IA
                        </h3>
                        <p className="text-zinc-500 text-sm mb-6">
                            Gerar perfis únicos para <b className="text-white">{selectedInstances.size}</b> instâncias.
                        </p>

                        <div className="space-y-6">

                            {/* Step 1: Image Selection */}
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block flex items-center gap-2">
                                    <ImageIcon className="w-3 h-3" />
                                    1. Imagem Base (HashBuster) - Opcional
                                </label>
                                <div className="grid grid-cols-5 gap-3 max-h-[120px] overflow-y-auto mb-2 custom-scrollbar p-1">
                                    {assets.map(asset => (
                                        <div
                                            key={asset.id}
                                            onClick={() => setSelectedAsset(selectedAsset === asset.id ? null : asset.id)}
                                            className={`
                                                cursor-pointer rounded-lg overflow-hidden border-2 aspect-square relative group
                                                ${selectedAsset === asset.id ? 'border-neon-green ring-2 ring-neon-green/20' : 'border-zinc-800 hover:border-zinc-600'}
                                            `}
                                        >
                                            <img src={asset.data} className="w-full h-full object-cover" />
                                            {selectedAsset === asset.id && (
                                                <div className="absolute inset-0 bg-neon-green/20 flex items-center justify-center">
                                                    <div className="bg-neon-green rounded-full p-1">
                                                        <ShieldCheck className="w-3 h-3 text-black" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {assets.length === 0 && (
                                        <div className="col-span-5 text-center py-4 bg-zinc-900 rounded-lg border border-zinc-800 border-dashed text-xs text-zinc-500">
                                            Nenhum banco de imagens. Vá em Configurações.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Step 2: Prompt */}
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block flex items-center gap-2">
                                    <Sparkles className="w-3 h-3" />
                                    2. Definição da Persona (IA)
                                </label>
                                <textarea
                                    placeholder="Ex: Atendentes de suporte da Loggi, nomes masculinos, tom profissional, mencionando entregas rápidas..."
                                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-4 py-3 outline-none focus:border-neon-green transition-colors font-medium text-sm min-h-[100px] resize-none"
                                    value={humanizePrompt}
                                    onChange={e => setHumanizePrompt(e.target.value)}
                                />
                                <p className="text-xs text-zinc-600 mt-2">
                                    A IA gerará nomes e recados únicos baseados neste contexto.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-white/5">
                                <button
                                    onClick={() => { setBulkEditModal(false); }}
                                    className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl transition-colors"
                                    disabled={isHumanizing}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={bulkHumanize}
                                    disabled={isHumanizing || !humanizePrompt}
                                    className="flex-1 bg-neon-green hover:bg-[#00cc6a] text-black font-black py-3 rounded-xl transition-colors shadow-lg shadow-neon-green/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {isHumanizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-black" />}
                                    {isHumanizing ? 'Gerando Perfis...' : 'Gerar e Aplicar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
