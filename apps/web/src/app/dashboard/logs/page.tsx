'use client';

import { useState, useEffect } from 'react';
import { ScrollText, RefreshCw, AlertCircle, Info, CheckCircle2, ShieldAlert } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { format } from 'date-fns';

interface LogEntry {
    id: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    message: string;
    context: string;
    metadata?: any;
    createdAt: string;
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const getToken = () => {
        if (typeof document !== 'undefined') {
            return document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
        }
        return null;
    };

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const token = getToken();
            if (!token) return;

            const res = await fetch(`${API_URL}/system-logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (e) {
            console.error('Failed to fetch logs:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        // Auto refresh every 10 seconds
        const t = setInterval(fetchLogs, 10000);
        return () => clearInterval(t);
    }, []);

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'ERROR': return <ShieldAlert className="w-5 h-5 text-red-500" />;
            case 'WARN': return <AlertCircle className="w-5 h-5 text-yellow-500" />;
            case 'INFO': return <CheckCircle2 className="w-5 h-5 text-neon-green" />;
            default: return <Info className="w-5 h-5 text-blue-400" />;
        }
    };

    const getLevelStyle = (level: string) => {
        switch (level) {
            case 'ERROR': return 'bg-red-500/10 border-red-500/20 text-red-500';
            case 'WARN': return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500';
            case 'INFO': return 'bg-neon-green/10 border-neon-green/20 text-neon-green';
            default: return 'bg-blue-500/10 border-blue-500/20 text-blue-400';
        }
    };

    return (
        <div className="relative min-h-screen pb-24 overflow-hidden">
            <div className="relative z-10 p-4 md:p-8 max-w-[1800px] mx-auto space-y-8 animate-in fade-in duration-700">

                {/* Header */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 backdrop-blur-sm bg-black/20 p-6 rounded-3xl border border-white/5">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-neon-green via-zinc-200 to-zinc-500 tracking-tighter flex items-center gap-3 drop-shadow-sm">
                            <ScrollText className="w-10 h-10 text-neon-green drop-shadow-[0_0_10px_rgba(0,255,0,0.5)]" />
                            HISTÓRICO <span className="text-white font-mono">DO SISTEMA</span>
                        </h1>
                        <p className="text-zinc-400 mt-2 text-sm font-medium tracking-wide">
                            Logs detalhados de conexões, erros e eventos do servidor.
                        </p>
                    </div>

                    <button
                        onClick={fetchLogs}
                        disabled={loading}
                        className="bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar Logs
                    </button>
                </div>

                {/* Logs List */}
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden min-h-[60vh]">
                    {logs.length === 0 && !loading ? (
                        <div className="flex flex-col items-center justify-center h-full py-32 opacity-50">
                            <ScrollText className="w-20 h-20 text-zinc-500 mb-4" />
                            <p className="text-xl font-bold text-zinc-400">Nenhum log registrado</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {logs.map((log) => (
                                <div key={log.id} className="bg-zinc-900/50 border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col md:flex-row gap-4 items-start md:items-center transition-colors group">
                                    {/* Icon & Level */}
                                    <div className="flex items-center gap-4 min-w-[150px]">
                                        <div className="p-3 bg-black/50 rounded-xl border border-white/5 shadow-inner">
                                            {getLevelIcon(log.level)}
                                        </div>
                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getLevelStyle(log.level)}`}>
                                            {log.level}
                                        </div>
                                    </div>

                                    {/* Message & Context */}
                                    <div className="flex-1">
                                        <h4 className="text-white font-bold text-base md:text-lg mb-1">{log.message}</h4>
                                        <div className="flex flex-wrap gap-2 text-xs font-mono">
                                            <span className="text-zinc-500 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                                Contexto: <span className="text-zinc-300">{log.context}</span>
                                            </span>
                                            {log.metadata?.status && (
                                                <span className="text-zinc-500 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                                    Status: <span className="text-zinc-300">{log.metadata.status}</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Timestamp */}
                                    <div className="text-right whitespace-nowrap">
                                        <p className="text-zinc-400 font-mono text-xs font-bold bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                                            {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss")}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
