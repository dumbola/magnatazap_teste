'use client';

import { useState } from 'react';
import { Rocket, Zap, ShieldCheck, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SmartStartButtonProps {
    campaignId: string;
    instanceCount: number;
    onStart: () => void;
}

export function SmartStartButton({
    campaignId,
    instanceCount = 0,
    onStart,
}: SmartStartButtonProps) {
    const [open, setOpen] = useState(false);

    const handleStart = () => {
        setOpen(false);
        onStart();
    };

    const estimatedSpeed = instanceCount * 60;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                disabled={instanceCount === 0}
                className={cn(
                    "w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                    "group"
                )}
            >
                <Rocket className="w-5 h-5 group-hover:animate-pulse" />
                SMART START
            </button>

            {/* CUSTOM MODAL OVERLAY */}
            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
                        {/* Close Button */}
                        <button
                            onClick={() => setOpen(false)}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Header */}
                        <div className="mb-6">
                            <h2 className="flex items-center gap-2 text-xl font-bold text-white mb-1">
                                <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                                Disparo Inteligente
                            </h2>
                            <p className="text-zinc-400 text-sm">
                                Otimize sua campanha com nosso algoritmo Multi-Instância.
                            </p>
                        </div>

                        {/* Content */}
                        <div className="space-y-4 mb-6">
                            <div className="flex items-center gap-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                <div className="p-2 bg-blue-500/20 rounded-full">
                                    <ShieldCheck className="w-6 h-6 text-blue-400" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-blue-100 text-sm">Proteção Anti-Ban Ativa</h4>
                                    <p className="text-xs text-blue-200/60 leading-relaxed">
                                        Isolamento de IP e Typing Caótico aplicados.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-center">
                                    <div className="text-2xl font-black text-white">{instanceCount}</div>
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Instâncias</div>
                                </div>
                                <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-center">
                                    <div className="text-2xl font-black text-green-500">~{estimatedSpeed}</div>
                                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Msgs/Hora</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-800 text-xs text-zinc-500">
                                <Info className="w-4 h-4 shrink-0" />
                                <p>
                                    Ciclo Round-Robin com atraso dinâmico. Falhas são compensadas automaticamente.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setOpen(false)}
                                className="flex-1 py-3 rounded-lg font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleStart}
                                className="flex-[2] py-3 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 transition-all hover:scale-[1.02] active:scale-95"
                            >
                                Iniciar Campanha
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
