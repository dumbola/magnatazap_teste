'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { Crown, Lock, Mail, KeyRound } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Erro ao fazer login');
            }

            const data = await res.json();
            document.cookie = `token=${data.access_token}; path=/; max-age=86400`;
            localStorage.setItem('user', JSON.stringify(data.user));

            router.push('/dashboard');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-midnight relative overflow-hidden p-4">
            {/* Amplified Ambient Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-neon-green/5 rounded-full blur-[180px] animate-pulse-glow" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gold/3 rounded-full blur-[150px]" />

            {/* Vault Opening Animation Container */}
            <div className="w-full max-w-md animate-fade-in-up">
                {/* Crown Badge */}
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <div className="absolute inset-0 bg-neon-green/20 rounded-full blur-2xl animate-pulse-glow" />
                        <div className="relative w-20 h-20 rounded-full glass-card neon-border flex items-center justify-center">
                            <Crown className="w-10 h-10 text-gold animate-float" />
                        </div>
                    </div>
                </div>

                {/* Title "Vault" */}
                <div className="text-center mb-8 space-y-2">
                    <h1 className="text-4xl md:text-5xl font-display font-black tracking-wider text-gradient-green text-glow">
                        ACESSO VIP
                    </h1>
                    <div className="flex items-center justify-center gap-2 text-zinc-600">
                        <Lock className="w-3 h-3" />
                        <p className="text-xs font-mono tracking-[0.3em] uppercase">Somente Autorizados</p>
                        <Lock className="w-3 h-3" />
                    </div>
                </div>

                {/* Login Card - "Vault Door" */}
                <div className="glass-card p-8 md:p-10 rounded-2xl neon-border relative overflow-hidden">
                    {/* Inner Glow */}
                    <div className="absolute inset-0 bg-gradient-to-br from-neon-green/5 via-transparent to-gold/5 pointer-events-none" />

                    <form onSubmit={handleLogin} className="space-y-6 relative z-10">
                        {/* Email Input */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-bold text-neon-green uppercase tracking-widest">
                                <Mail className="w-3 h-3" />
                                Credencial
                            </label>
                            <div className="relative group">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="input-luxury w-full text-base font-mono group-hover:border-neon-green/50"
                                    placeholder="email@elite.com"
                                    required
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-bold text-neon-green uppercase tracking-widest">
                                <KeyRound className="w-3 h-3" />
                                Senha
                            </label>
                            <div className="relative group">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input-luxury w-full text-base font-mono tracking-widest group-hover:border-neon-green/50"
                                    placeholder="••••••••••"
                                    required
                                />
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="glass-card p-4 border-danger/50 rounded-lg text-red-400 text-sm text-center font-medium animate-fade-in">
                                ⚠️ {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full text-base relative group overflow-hidden"
                        >
                            <span className="relative z-10">
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                        VERIFICANDO...
                                    </span>
                                ) : (
                                    'DESBLOQUEAR ACESSO'
                                )}
                            </span>
                            {!loading && (
                                <div className="absolute inset-0 shimmer opacity-50" />
                            )}
                        </button>
                    </form>

                    {/* Decorative Lines */}
                    <div className="mt-8 pt-6 border-t border-zinc-800/50 flex items-center justify-center gap-3">
                        <div className="h-px w-12 bg-gradient-to-r from-transparent to-gold/30" />
                        <p className="text-[10px] font-mono text-zinc-700 tracking-[0.3em] uppercase">MagnataZap Elite Platform</p>
                        <div className="h-px w-12 bg-gradient-to-l from-transparent to-gold/30" />
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center">
                    <p className="text-zinc-800 text-xs font-mono tracking-widest">
                        © 2025 MAGNATAZAP • TODOS OS DIREITOS RESERVADOS
                    </p>
                </div>
            </div>
        </div>
    );
}
