'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Smartphone, Send, ScrollText, Settings, Crown, Menu, X } from 'lucide-react';
import { UserProfile } from './UserProfile';


import Image from 'next/image';

export function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    const menuItems = [
        { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { name: 'Conexões', icon: Smartphone, path: '/dashboard/connections' },
        { name: 'Disparar', icon: Send, path: '/dashboard/sender' },
        { name: 'Histórico', icon: ScrollText, path: '/dashboard/logs' },
        { name: 'Configurações', icon: Settings, path: '/dashboard/settings' },
    ];

    return (
        <>
            {/* MOBILE: BOTTOM NAVIGATION BAR (Fixed) */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] h-[72px] glass-card border-t border-white/5 pb-safe flex items-center justify-around px-2">
                {menuItems.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            href={item.path}
                            className={`
                                flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-300 w-full relative
                                ${isActive ? 'text-neon-green' : 'text-zinc-500 hover:text-zinc-300'}
                            `}
                        >
                            <div className={`
                                p-1.5 rounded-full transition-all duration-300 relative
                                ${isActive ? 'bg-neon-green/10 -translate-y-1' : ''}
                            `}>
                                <item.icon className={`w-5 h-5 ${isActive ? 'drop-shadow-[0_0_8px_rgba(0,230,118,0.6)]' : ''}`} />
                                {isActive && <div className="absolute inset-0 bg-neon-green/20 blur-lg rounded-full" />}
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                                {item.name.split(' ')[0]} {/* Shorten name if needed */}
                            </span>

                            {/* Active Indicator Dot */}
                            {isActive && (
                                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-neon-green shadow-glow" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* DESKTOP: SIDEBAR (Fixed Left) */}
            <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 w-72 bg-black/90 border-r border-zinc-800/50 backdrop-blur-xl flex-col h-screen shadow-2xl">
                {/* Header / Logo */}
                {/* Header / Logo */}
                <div className="flex-shrink-0 h-32 relative w-full overflow-hidden border-b border-white/5 bg-black group cursor-pointer hover:opacity-90 transition-opacity">
                    <Image
                        src="/sidebar-logo.png"
                        alt="MagnataZap"
                        fill
                        className="object-cover"
                        priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-50" />
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto scrollbar-luxury">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`
                                    group flex items-center gap-4 px-4 py-4 rounded-xl
                                    transition-all duration-300 relative
                                    ${isActive
                                        ? 'bg-zinc-900 border border-zinc-800 text-white shadow-lg'
                                        : 'text-zinc-500 hover:text-white hover:bg-zinc-900/50'
                                    }
                                `}
                            >
                                <div className={`
                                    p-2 rounded-lg transition-all duration-300
                                    ${isActive
                                        ? 'bg-neon-green text-black shadow-[0_0_15px_rgba(0,230,118,0.4)]'
                                        : 'bg-zinc-800/50 text-zinc-500 group-hover:text-neon-green group-hover:bg-zinc-800'
                                    }
                                `}>
                                    <item.icon className="w-5 h-5" />
                                </div>

                                <span className={`font-semibold text-sm tracking-wide ${isActive ? 'text-white' : ''}`}>
                                    {item.name}
                                </span>

                                {isActive && (
                                    <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-neon-green shadow-glow" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer User Profile */}
                <div className="p-4 border-t border-zinc-800/50 bg-black/40">
                    <div className="p-2 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group">
                        <UserProfile />
                    </div>
                </div>
            </aside>
        </>
    );
}
