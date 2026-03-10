'use client';

import { useState, useEffect } from 'react';
import {
    Activity, Users, BarChart3, RefreshCcw, Calendar as CalendarIcon,
    ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle, Smartphone, MessageSquare
} from 'lucide-react';
import {
    format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO, addDays, isWithinInterval, startOfDay, endOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import MoneyRain from '@/components/MoneyRain';

// --- Types ---
interface DailyStats {
    totalSent: number;
    totalSentAllTime: number; // [NEW] Added
    activeInstances: number;
    totalCampaigns: number;
    systemStatus: 'Online' | 'Offline';
    history: InstanceHistory[];
    chartData: { time: string; value: number }[];
    totalInstances?: number;
}

interface InstanceHistory {
    id: string;
    instanceName: string;
    status: 'CONNECTED' | 'DISCONNECTED';
    connectedAt: string;
    disconnectedAt?: string;
    messagesSent: number;
}

// --- Mock Data Removed (Using Real Backend Data) ---
// const generateMockData = ...

export default function DashboardPage() {
    // --- State ---
    // Range State: "from" is always set (default today), "to" is optional.
    const [range, setRange] = useState<{ from: Date; to?: Date }>({ from: new Date() });

    // Calendar Navigation State
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Data State
    const [stats, setStats] = useState<DailyStats | null>(null);
    const [loading, setLoading] = useState(false);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'; // Fallback for dev

    // --- Calendar Interactions ---
    const handleDateClick = (date: Date) => {
        if (!range.from || (range.from && range.to)) {
            // Start new selection
            setRange({ from: date, to: undefined });
        } else {
            // "from" exists, "to" is empty.
            if (isSameDay(date, range.from)) {
                // Clicked same day twice -> Select just this day as range (Explicit 1 day)
                setRange({ from: range.from, to: date });
            } else if (date < range.from) {
                // Clicked before "from" -> New "from"
                setRange({ from: date, to: undefined });
            } else {
                // Clicked after "from" -> Set "to" (Complete Range)
                setRange({ ...range, to: date });
            }
        }
    };

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

    // --- Data Fetching ---
    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                // Calculate Query Params
                const startISO = startOfDay(range.from).toISOString();
                const endISO = endOfDay(range.to || range.from).toISOString();

                // [FIX] Include JWT token in Authorization header
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/stats?start=${startISO}&end=${endISO}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
                const data = await res.json();
                setStats(data);
            } catch (err) {
                console.error('[Dashboard] Erro ao buscar stats:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [range, API_URL]);


    // --- Calendar Rendering ---
    const renderCalendar = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const dateFormat = "d";
        const rows = [];
        let days = [];
        let day = startDate;

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                const dayDate = day;
                const formattedDate = format(dayDate, dateFormat);
                const isCurrentMonth = isSameMonth(dayDate, monthStart);

                // Selection Logic
                const isFrom = isSameDay(dayDate, range.from);
                const isTo = range.to && isSameDay(dayDate, range.to);
                const isInRange = range.to && isWithinInterval(dayDate, { start: range.from, end: range.to });

                // Styling
                let bgClass = "text-zinc-400 hover:bg-zinc-800 hover:text-white"; // Default
                if (isFrom || isTo) bgClass = "bg-neon-green text-black font-bold shadow-[0_0_10px_rgba(0,230,118,0.5)] z-10 scale-110";
                else if (isInRange) bgClass = "bg-neon-green/20 text-neon-green";
                else if (isToday(dayDate)) bgClass = "border border-neon-green/30 text-neon-green";

                if (!isCurrentMonth) bgClass += " text-zinc-700 opacity-50";

                days.push(
                    <div
                        key={dayDate.toString()}
                        onClick={() => handleDateClick(dayDate)}
                        className={`
                            relative h-10 w-10 md:h-12 md:w-12 flex items-center justify-center rounded-xl cursor-pointer transition-all duration-200 text-sm font-medium
                            ${bgClass}
                        `}
                    >
                        {formattedDate}
                    </div>
                );
                day = addDays(day, 1);
            }
            rows.push(
                <div className="flex justify-between items-center mb-1" key={day.toString()}>
                    {days}
                </div>
            );
            days = [];
        }
        return <div className="flex flex-col gap-1">{rows}</div>;
    };

    // --- UI Components ---
    const StatCard = ({ label, value, icon: Icon, color, subValue }: any) => (
        <div className="bg-surface border border-border p-5 rounded-2xl hover:border-zinc-600 transition-all duration-300 shadow-lg group relative overflow-hidden">
            <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500`}>
                <Icon className={`w-24 h-24 ${color}`} />
            </div>
            <div className="relative z-10 flex flex-col justify-between h-full">
                <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg bg-zinc-900/50 ${color.replace('text-', 'text-opacity-80 ')}`}>
                        <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <span className="text-text-muted text-xs font-bold uppercase tracking-wider">{label}</span>
                </div>
                <div>
                    <div className="text-3xl font-black text-white tracking-tight">{loading ? '...' : value}</div>
                    {subValue && <div className="text-[10px] text-zinc-500 font-mono mt-1">{subValue}</div>}
                </div>
            </div>
        </div>
    );

    return (
        <div className="relative min-h-screen pb-24 overflow-hidden">
            <MoneyRain />

            <div className="relative z-10 p-4 md:p-8 max-w-[1800px] mx-auto space-y-8 animate-in fade-in duration-700">

                {/* Header Section */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 backdrop-blur-sm bg-black/20 p-6 rounded-3xl border border-white/5">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-500 tracking-tighter flex items-center gap-3 drop-shadow-sm">
                            <Activity className="w-10 h-10 text-neon-green drop-shadow-[0_0_10px_rgba(0,255,0,0.5)]" />
                            ANALYTICS <span className="text-neon-green font-mono">PRO</span>
                        </h1>
                        <p className="text-zinc-400 mt-2 text-sm font-medium tracking-wide">
                            {range.to
                                ? `Análise de ${format(range.from, "dd/MM")} até ${format(range.to, "dd/MM")}`
                                : `Análise de ${format(range.from, "dd 'de' MMMM", { locale: ptBR })}`
                            }
                        </p>
                    </div>

                    <div className="flex items-center gap-4 bg-black/40 border border-white/10 px-6 py-3 rounded-2xl backdrop-blur-md shadow-2xl">
                        <CalendarIcon className="w-6 h-6 text-neon-green" />
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Período Selecionado</span>
                            <span className="text-white font-mono font-bold capitalize text-sm md:text-base tracking-wide">
                                {format(range.from, "dd/MM/yyyy")}
                                {range.to && ` - ${format(range.to, "dd/MM/yyyy")}`}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left Column: Calendar & Filters (4 Columns) */}
                    <div className="lg:col-span-4 space-y-6">
                        {/* Calendar Widget */}
                        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden group hover:border-neon-green/30 transition-all duration-500">
                            <div className="absolute inset-0 bg-gradient-to-br from-neon-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl pointer-events-none" />

                            {/* Calendar Header */}
                            <div className="relative z-10 flex items-center justify-between mb-8">
                                <h2 className="text-xl font-black text-white capitalize tracking-wide">
                                    {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                                </h2>
                                <div className="flex gap-2">
                                    <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white transition-all active:scale-95"><ChevronLeft className="w-6 h-6" /></button>
                                    <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-xl text-zinc-400 hover:text-white transition-all active:scale-95"><ChevronRight className="w-6 h-6" /></button>
                                </div>
                            </div>

                            {/* Week Days Header */}
                            <div className="relative z-10 grid grid-cols-7 mb-4">
                                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                                    <div key={d} className="text-center text-[10px] font-black text-zinc-600 uppercase tracking-widest">{d}</div>
                                ))}
                            </div>

                            {/* Days Grid */}
                            <div className="relative z-10 select-none">
                                {renderCalendar()}
                            </div>

                            <p className="relative z-10 text-[10px] text-zinc-600 text-center mt-6 font-medium">
                                * Clique duplo para selecionar dia único, ou clique em dois dias distintos para intervalo.
                            </p>
                        </div>

                        {/* Today's Quick Summary */}
                        <div className="bg-gradient-to-br from-zinc-900/80 to-black/80 backdrop-blur-md border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                            <div className="absolute -right-10 -top-10 w-32 h-32 bg-neon-green/20 rounded-full blur-[50px] pointer-events-none" />
                            <h3 className="text-neon-green font-black mb-6 text-sm uppercase tracking-widest flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" /> Performance da Sessão
                            </h3>
                            <div className="space-y-6 relative z-10">
                                <div className="flex justify-between items-end border-b border-white/5 pb-4">
                                    <span className="text-zinc-400 text-sm font-medium">Disparos no Período</span>
                                    <span className="text-3xl font-black text-white tracking-tighter drop-shadow-lg">{stats?.totalSent || 0}</span>
                                </div>
                                <div className="flex justify-between items-end border-b border-white/5 pb-4">
                                    <span className="text-zinc-400 text-sm font-medium">Sessões Registradas</span>
                                    <span className="text-3xl font-black text-white tracking-tighter drop-shadow-lg">{stats?.history.length || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Stats & Content (8 Columns) */}
                    <div className="lg:col-span-8 space-y-6">

                        {/* Top Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard
                                label="Total Geral Enviado"
                                value={stats?.totalSentAllTime || 0}
                                icon={MessageSquare}
                                color="text-neon-green"
                                subValue={`${stats?.totalSent || 0} neste período`}
                            />
                            <StatCard
                                label="Instâncias Ativas"
                                value={stats?.activeInstances || 0}
                                icon={Smartphone}
                                color="text-blue-400"
                                subValue={`De ${stats?.totalInstances || 0} instaladas`}
                            />
                            <StatCard
                                label="Campanhas"
                                value={stats?.totalCampaigns || 0}
                                icon={BarChart3}
                                color="text-purple-400"
                                subValue="Ativas/Criadas"
                            />
                            <StatCard
                                label="Status do Sistema"
                                value={stats?.systemStatus || 'Online'}
                                icon={RefreshCcw}
                                color="text-yellow-400"
                                subValue="Monitoramento Real-time"
                            />
                        </div>

                        {/* Chart Section */}
                        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl h-[350px] w-full relative group">
                            <div className="absolute inset-0 bg-gradient-to-t from-neon-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none rounded-3xl" />
                            <h3 className="text-sm font-black text-zinc-400 mb-6 uppercase tracking-widest flex justify-between relative z-10">
                                <span>Fluxo de Disparos ({range.to ? 'Diário' : 'Horário'})</span>
                                {loading && <span className="text-neon-green text-[10px] animate-pulse font-bold">ATUALIZANDO DADOS...</span>}
                            </h3>
                            <div className="h-full w-full absolute inset-0 pt-20 pb-6 px-6 z-10">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats?.chartData || []}>
                                        <defs>
                                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#00e676" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} opacity={0.5} />
                                        <XAxis
                                            dataKey="time"
                                            stroke="#52525b"
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                            interval={range.to ? "preserveStartEnd" : 2}
                                            tick={{ fill: '#71717a' }}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(9, 9, 11, 0.9)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '12px',
                                                color: '#fff',
                                                backdropFilter: 'blur(10px)',
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                                            }}
                                            itemStyle={{ color: '#00e676', fontWeight: 'bold' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#00e676"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorValue)"
                                            animationDuration={1500}
                                            // [NEW] Markers
                                            dot={{ r: 4, fill: '#00e676', strokeWidth: 0, fillOpacity: 1 }}
                                            activeDot={{ r: 6, fill: '#fff', stroke: '#00e676', strokeWidth: 2 }}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Advanced History Table */}
                        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
                            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tight">Histórico Detalhado</h3>
                                    <p className="text-zinc-500 text-xs mt-1 font-medium">Registro completo de conexões e atividades.</p>
                                </div>
                            </div>

                            <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left text-sm">
                                    <thead className="text-[10px] uppercase bg-zinc-950/80 text-zinc-500 font-black border-b border-white/5 sticky top-0 backdrop-blur-md z-20 tranking-widest">
                                        <tr>
                                            <th className="px-8 py-5">Instância</th>
                                            <th className="px-8 py-5">Horário Conexão</th>
                                            <th className="px-8 py-5">Envios</th>
                                            <th className="px-8 py-5 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-zinc-300">
                                        {loading ? (
                                            <tr><td colSpan={4} className="p-12 text-center text-zinc-600 animate-pulse font-mono text-xs">BUSCANDO REGISTROS...</td></tr>
                                        ) : stats?.history.length === 0 ? (
                                            <tr><td colSpan={4} className="p-12 text-center text-zinc-600 font-medium">Nenhuma atividade registrada neste período.</td></tr>
                                        ) : (
                                            stats?.history.map((item) => (
                                                <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                                    <td className="px-8 py-5 font-bold text-white flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-800 to-black flex items-center justify-center text-zinc-400 group-hover:text-neon-green group-hover:from-neon-green/20 group-hover:to-black transition-all shadow-lg border border-white/5">
                                                            <Smartphone className="w-4 h-4" />
                                                        </div>
                                                        <span className="tracking-wide">{item.instanceName}</span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <div className="font-mono text-xs text-zinc-400 flex items-center gap-2 bg-black/30 w-fit px-3 py-1.5 rounded-lg border border-white/5">
                                                            <Clock className="w-3 h-3 text-zinc-600" />
                                                            <span className="text-zinc-300">{item.connectedAt}</span>
                                                            <span className="text-zinc-700">➜</span>
                                                            <span className={item.disconnectedAt ? "text-zinc-300" : "text-neon-green font-bold"}>
                                                                {item.disconnectedAt || 'Ativo'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className="bg-zinc-900 text-white px-4 py-1.5 rounded-full text-xs font-bold border border-white/10 flex items-center w-fit gap-2 shadow-sm group-hover:border-neon-green/30 transition-colors">
                                                            <MessageSquare className="w-3 h-3 text-zinc-500" />
                                                            {item.messagesSent}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <span className={`
                                                            px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg
                                                            ${item.status === 'CONNECTED'
                                                                ? 'bg-neon-green text-black shadow-[0_0_15px_rgba(0,255,0,0.3)]'
                                                                : 'bg-zinc-800 text-zinc-500 border border-zinc-700'}
                                                        `}>
                                                            {item.status === 'CONNECTED' ? 'ONLINE' : 'OFFLINE'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}

// Ensure MoneyRain is imported at top.
// Since I'm replacing the whole return, I should be careful.
// I'll assume I need to add the import at the top as well. This tool replaces a BLOCK.
// Ah, the tool replaces lines. I need to make sure I import MoneyRain.
// I'll grab imports too.

