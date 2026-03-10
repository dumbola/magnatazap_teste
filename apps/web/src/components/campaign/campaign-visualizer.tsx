'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Smartphone, AlertCircle, CheckCircle2 } from 'lucide-react';

interface InstanceState {
    id: string;
    name: string;
    status: 'IDLE' | 'SENDING' | 'WAITING' | 'FAILED' | 'SKIPPED';
    lastActivity?: number;
}

interface CampaignVisualizerProps {
    stats: {
        instances: InstanceState[];
        currentIndex: number;
    } | null;
}

export function CampaignVisualizer({ stats }: CampaignVisualizerProps) {
    if (!stats || !stats.instances.length) return null;

    // Simple ring layout calculation
    const total = stats.instances.length;
    const radius = 120; // px

    return (
        <div className="relative w-full h-[300px] flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/20 border rounded-xl overflow-hidden">
            {/* Central Hub */}
            <div className="absolute z-10 flex flex-col items-center justify-center w-24 h-24 bg-white dark:bg-slate-800 rounded-full shadow-xl border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-medium text-slate-500">DISPATCHER</div>
                <div className="text-lg font-bold animate-pulse text-indigo-500">ACTIVE</div>
            </div>

            {/* Orbiting Instances */}
            <div className="relative w-[300px] h-[300px] animate-spin-slow">
                {/* Note: In a real implementation we might position them static and animate activity highlights */}
                {stats.instances.map((inst, index) => {
                    const angle = (index / total) * 2 * Math.PI - (Math.PI / 2); // Start at top
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    const isActive = index === stats.currentIndex;
                    const isFailed = inst.status === 'FAILED';

                    return (
                        <div
                            key={inst.id}
                            className={cn(
                                "absolute flex items-center justify-center w-10 h-10 -ml-5 -mt-5 rounded-full border-2 shadow-md transition-all duration-300",
                                isActive ? "bg-indigo-600 border-indigo-200 scale-125 z-20" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
                                isFailed && "bg-red-500 border-red-200"
                            )}
                            style={{
                                left: `calc(50% + ${x}px)`,
                                top: `calc(50% + ${y}px)`,
                            }}
                            title={inst.name}
                        >
                            {isFailed ? (
                                <AlertCircle className="w-5 h-5 text-white" />
                            ) : isActive ? (
                                <Smartphone className="w-5 h-5 text-white animate-bounce" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1 text-[10px] text-slate-400">
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500" /> Active</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-300" /> Idle</div>
                <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500" /> Failed</div>
            </div>
        </div>
    );
}
