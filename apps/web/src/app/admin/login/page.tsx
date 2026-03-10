'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { ShieldAlert } from 'lucide-react';

export default function AdminLoginPage() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/auth/admin-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const data = await res.json();

            if (res.ok) {
                document.cookie = `token=${data.access_token}; path=/; max-age=86400;`;
                localStorage.setItem('user', JSON.stringify(data.user));
                router.push('/admin/dashboard');
            } else {
                setError(data.message || 'Acesso negado');
            }
        } catch (err) {
            setError('Erro de conexão');
        }
    };

    return (
        <div className="h-screen flex items-center justify-center bg-[#110000]">
            <div className="w-full max-w-md p-8 space-y-8 bg-red-950/20 rounded-xl border border-red-900/50 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-red-600"></div>
                <div className="text-center flex flex-col items-center">
                    <ShieldAlert className="w-12 h-12 text-red-600 mb-4" />
                    <h2 className="text-3xl font-bold text-red-500 tracking-tight">Admin Access</h2>
                    <p className="mt-2 text-sm text-red-400/60">Área Restrita. Tentativas monitoradas.</p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-3 bg-black/50 border border-red-900/50 rounded-lg text-red-100 placeholder-red-900 focus:border-red-600 outline-none transition-colors"
                            placeholder="Master Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                        />
                    </div>

                    {error && <div className="text-red-500 text-sm text-center font-mono border border-red-900/30 p-2 bg-red-950/30 rounded">{error}</div>}

                    <button
                        type="submit"
                        className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors shadow-[0_0_20px_rgba(220,38,38,0.3)]"
                    >
                        AUTENTICAR
                    </button>
                </form>
            </div>
        </div>
    );
}
