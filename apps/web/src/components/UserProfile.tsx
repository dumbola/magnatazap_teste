'use client';

import { useState, useEffect } from 'react';
import { Key, User, RefreshCw, Copy, Check } from 'lucide-react';
import { API_URL } from '@/lib/api';

export function UserProfile() {
    const [user, setUser] = useState<any>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const u = localStorage.getItem('user');
        if (u) setUser(JSON.parse(u));
    }, []);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(user?.apiKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const regenerateToken = async () => {
        if (!confirm('Gerar nova API Key? A anterior deixará de funcionar.')) return;

        const token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/instance/regenerate-token`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                const newUser = { ...user, apiKey: data.apiKey };
                setUser(newUser);
                localStorage.setItem('user', JSON.stringify(newUser));
            }
        } catch (e) {
            alert('Erro ao gerar nova chave');
        }
    };

    if (!user) return null;

    return (
        <div className="w-full">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <User className="w-5 h-5" />
                </div>
                <div>
                    <div className="text-sm font-bold text-white">{user.name || 'Usuário'}</div>
                    <div className="text-[10px] text-zinc-500 uppercase">{user.role}</div>
                </div>
            </div>

            <div className="bg-black/50 p-2 rounded border border-zinc-800 flex items-center justify-between group">
                <div className="flex items-center gap-2 overflow-hidden">
                    <Key className="w-3 h-3 text-zinc-500 shrink-0" />
                    <code className="text-[10px] text-zinc-300 truncate font-mono">
                        {user.apiKey}
                    </code>
                </div>
                <div className="flex gap-1">
                    <button onClick={copyToClipboard} className="text-zinc-500 hover:text-white transition-colors">
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <button onClick={regenerateToken} className="text-zinc-500 hover:text-white transition-colors">
                        <RefreshCw className="w-3 h-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}
