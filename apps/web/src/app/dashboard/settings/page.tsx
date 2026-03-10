'use client';

import { useState, useEffect } from 'react';
import { Save, Bot, Key, Upload, Trash2, Image as ImageIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { API_URL } from '@/lib/api';

interface Asset {
    id: string;
    type: string;
    data: string;
    createdAt: string;
}

export default function SettingsPage() {
    const [apiKey, setApiKey] = useState('');
    const [assistantId, setAssistantId] = useState('');
    const [loadingKey, setLoadingKey] = useState(false);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [uploading, setUploading] = useState(false);

    const getToken = () => {
        if (typeof document !== 'undefined') {
            return document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
        }
        return null;
    };

    const fetchProfile = async () => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/auth/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.openaiApiKey) setApiKey(data.openaiApiKey);
                if (data.openaiAssistantId) setAssistantId(data.openaiAssistantId);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchAssets = async () => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/assets`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAssets(data);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchProfile();
        fetchAssets();
    }, []);

    const saveSettings = async () => {
        const token = getToken();
        if (!token) return;
        setLoadingKey(true);
        try {
            const res = await fetch(`${API_URL}/auth/profile`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    openaiApiKey: apiKey,
                    openaiAssistantId: assistantId
                })
            });
            if (res.ok) {
                alert('Configurações salvas com sucesso!');
            } else {
                alert('Erro ao salvar settings.');
            }
        } catch (e) {
            alert('Erro de conexão.');
        }
        setLoadingKey(false);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validations
        if (file.size > 2 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 2MB.');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            setUploading(true);
            const token = getToken();
            try {
                const res = await fetch(`${API_URL}/assets`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ type: 'PROFILE_PIC', data: base64 })
                });

                if (res.ok) {
                    await fetchAssets();
                } else {
                    alert('Falha no upload.');
                }
            } catch (error) {
                alert('Erro ao enviar imagem.');
            }
            setUploading(false);
        };
        reader.readAsDataURL(file);
    };

    const deleteAsset = async (id: string) => {
        if (!confirm('Excluir esta imagem?')) return;
        const token = getToken();
        try {
            await fetch(`${API_URL}/assets/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setAssets(assets.filter(a => a.id !== id));
        } catch (e) {
            alert('Erro ao excluir.');
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-green to-white tracking-tighter flex items-center gap-3">
                    <Bot className="w-8 h-8 text-neon-green" />
                    CONFIGURAÇÃO DE IA
                </h1>
                <p className="text-zinc-400 mt-2 font-medium">Gerencie suas chaves de API e banco de imagens para humanização.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* AI Config Card */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-neon-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-neon-green/10 flex items-center justify-center border border-neon-green/20">
                                <Key className="w-5 h-5 text-neon-green" />
                            </div>
                            <h2 className="text-xl font-bold text-white">OpenAI Connect</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">API Key (Obrigatório)</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full bg-zinc-900/50 border border-zinc-700/50 text-white rounded-xl px-4 py-3 focus:border-neon-green focus:ring-1 focus:ring-neon-green/50 outline-none transition-all font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Assistant ID (Opcional)</label>
                                <input
                                    type="text"
                                    value={assistantId}
                                    onChange={e => setAssistantId(e.target.value)}
                                    placeholder="asst_..."
                                    className="w-full bg-zinc-900/50 border border-zinc-700/50 text-white rounded-xl px-4 py-3 focus:border-neon-green focus:ring-1 focus:ring-neon-green/50 outline-none transition-all font-mono text-sm"
                                />
                                <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                                    <Bot className="w-3 h-3" />
                                    Prioriza o uso de Assistants ao invés do GPT-3.5 padrão.
                                </p>
                            </div>

                            <button
                                onClick={saveSettings}
                                disabled={loadingKey}
                                className="w-full bg-white text-black font-bold py-3 px-6 rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                            >
                                {loadingKey ? <span className="animate-spin">⏳</span> : <Save className="w-4 h-4" />}
                                Salvar Configurações
                            </button>
                        </div>
                    </div>
                </div>

                {/* Assets Gallery */}
                <div className="lg:col-span-2">
                    <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                                    <ImageIcon className="w-5 h-5 text-purple-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Banco de Imagens</h2>
                                    <p className="text-zinc-500 text-xs">Para variação de perfil (Hash Buster)</p>
                                </div>
                            </div>

                            <label className={`
                                bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2
                                ${uploading ? 'opacity-50 cursor-wait' : ''}
                            `}>
                                <Upload className="w-3 h-3" />
                                {uploading ? 'Enviando...' : 'Upload Foto'}
                                <input type="file" onChange={handleUpload} className="hidden" accept="image/*" disabled={uploading} />
                            </label>
                        </div>

                        {assets.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl p-12 text-center min-h-[300px]">
                                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-4 text-zinc-600">
                                    <ImageIcon className="w-8 h-8" />
                                </div>
                                <h3 className="text-zinc-400 font-bold mb-1">Galeria Vazia</h3>
                                <p className="text-zinc-600 text-sm max-w-[200px]">Faça upload de fotos de pessoas reais para humanizar seus perfis.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                                {assets.map(asset => (
                                    <div key={asset.id} className="group relative aspect-square bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all">
                                        <img src={asset.data} alt="Asset" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button
                                                onClick={() => deleteAsset(asset.id)}
                                                className="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white p-2 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
