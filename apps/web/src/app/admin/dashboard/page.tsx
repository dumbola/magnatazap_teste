'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { Users, UserPlus, Key, RefreshCw, LogOut } from 'lucide-react';

export default function AdminDashboard() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
    const router = useRouter();

    useEffect(() => {
        fetchUsers();
    }, []);

    const getToken = () => document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1];

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_URL}/auth/users`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.status === 401) return router.push('/admin/login');
            const data = await res.json();
            setUsers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/auth/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                setShowModal(false);
                setNewUser({ name: '', email: '', password: '' });
                fetchUsers();
            } else {
                alert('Erro ao criar usuário');
            }
        } catch (e) {
            alert('Erro de conexão');
        }
    };

    const logout = () => {
        document.cookie = 'token=; path=/; max-age=0;';
        localStorage.removeItem('user');
        router.push('/admin/login');
    };

    return (
        <div className="min-h-screen bg-[#110000] text-gray-200 font-sans">
            {/* Header */}
            <div className="bg-red-950/30 border-b border-red-900/30 px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-600 rounded-lg">
                        <Users className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-red-100">Painel Administrativo</h1>
                </div>
                <button onClick={logout} className="flex items-center gap-2 text-red-400 hover:text-white transition-colors">
                    <LogOut className="w-4 h-4" />
                    Sair
                </button>
            </div>

            {/* Content */}
            <main className="p-8 max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold text-white">Usuários do Sistema</h2>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all shadow-[0_0_10px_rgba(220,38,38,0.3)]"
                    >
                        <UserPlus className="w-4 h-4" />
                        Novo Usuário
                    </button>
                </div>

                {loading ? (
                    <div className="text-center text-red-500 animate-pulse">Carregando...</div>
                ) : (
                    <div className="grid gap-4">
                        {users.map(user => (
                            <div key={user.id} className="bg-black/40 border border-red-900/20 p-4 rounded-xl flex items-center justify-between hover:border-red-900/50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-red-900/20 flex items-center justify-center text-red-500 font-bold border border-red-900/30">
                                        {user.name?.[0] || 'U'}
                                    </div>
                                    <div>
                                        <div className="font-bold text-white">{user.name}</div>
                                        <div className="text-sm text-gray-500">{user.email}</div>
                                    </div>
                                    {user.role === 'ADMIN' && (
                                        <span className="text-[10px] bg-red-600/20 text-red-500 px-2 py-0.5 rounded border border-red-600/30">ADMIN</span>
                                    )}
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col items-end">
                                        <span className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">API Key</span>
                                        <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded border border-red-900/30">
                                            <Key className="w-3 h-3 text-red-500" />
                                            <code className="text-xs font-mono text-gray-300">{user.apiKey}</code>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-white">{user._count?.instances || 0}</div>
                                        <div className="text-[10px] text-gray-500 uppercase">Instâncias</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-[#1a0505] border border-red-900/50 p-6 rounded-xl w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-6">Criar Novo Usuário</h3>
                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-xs uppercase text-red-500 mb-1 font-bold">Nome</label>
                                <input
                                    className="w-full bg-black/50 border border-red-900/30 rounded p-2 text-white focus:border-red-600 outline-none"
                                    value={newUser.name}
                                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-red-500 mb-1 font-bold">Email</label>
                                <input
                                    className="w-full bg-black/50 border border-red-900/30 rounded p-2 text-white focus:border-red-600 outline-none"
                                    type="email"
                                    value={newUser.email}
                                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-red-500 mb-1 font-bold">Senha</label>
                                <input
                                    className="w-full bg-black/50 border border-red-900/30 rounded p-2 text-white focus:border-red-600 outline-none"
                                    type="password"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="flex justify-end gap-2 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 hover:bg-white/5 text-gray-400 rounded transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors"
                                >
                                    Criar Usuário
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
