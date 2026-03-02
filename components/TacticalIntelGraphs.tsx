import React, { useEffect, useState } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { calculateKDA, getKDAColor, parseMatchResult } from '../utils/tactical';
import PlayerStatsModal, { PlayerStats } from './PlayerStatsModal';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface TacticalIntelGraphsProps {
    teamId?: number | null;
    availableTeams: { id: number; name: string; game: string }[];
    userRole?: string;
}

interface PlayerStat {
    id: number;
    name: string;
    kd: string | number;
    avgAcs: number;
    games: number;
}

interface AgentStat {
    name: string;
    pickRate: number;
    winRate: number;
    totalGames: number;
    wins: number;
    losses: number;
    draws: number;
}

const GOLD = '#fbbf24';
const PURPLE = '#8b5cf6';
const EMERALD = '#10b981';
const RED = '#ef4444';
const SLATE = '#334155';
const DARK = '#020617';

// SVG Donut Ring
const DonutRing: React.FC<{ wins: number; losses: number; draws?: number; label?: string }> = ({ wins, losses, draws = 0, label }) => {
    const total = wins + losses + draws || 1;
    const winPct = Math.round((wins / total) * 100);
    const r = 52;
    const circ = 2 * Math.PI * r;
    const winArc = (wins / total) * circ;
    const lossArc = (losses / total) * circ;
    const drawArc = (draws / total) * circ;

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-28 h-28 md:w-36 md:h-36">
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                    <circle cx="60" cy="60" r={r} fill="none" stroke="#ffffff08" strokeWidth="12" />
                    {/* Wins segment */}
                    <circle
                        cx="60" cy="60" r={r} fill="none"
                        stroke="url(#donutWin)" strokeWidth="12"
                        strokeDasharray={`${winArc} ${circ - winArc}`}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                    />
                    {/* Losses segment */}
                    <circle
                        cx="60" cy="60" r={r} fill="none"
                        stroke={RED + '66'} strokeWidth="12"
                        strokeDasharray={`${lossArc} ${circ - lossArc}`}
                        strokeDashoffset={-winArc - drawArc}
                        strokeLinecap="round"
                    />
                    {/* Draws segment */}
                    <circle
                        cx="60" cy="60" r={r} fill="none"
                        stroke={GOLD + '66'} strokeWidth="12"
                        strokeDasharray={`${drawArc} ${circ - drawArc}`}
                        strokeDashoffset={-winArc}
                        strokeLinecap="round"
                    />
                    <defs>
                        <linearGradient id="donutWin" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={GOLD} />
                            <stop offset="100%" stopColor={EMERALD} />
                        </linearGradient>
                    </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xl md:text-2xl font-black text-white tracking-tighter">{winPct}%</span>
                    <span className="text-[7px] md:text-[9px] font-black text-amber-500/60 uppercase tracking-[0.2em]">WIN RATE</span>
                </div>
            </div>
            {label && <p className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] md:tracking-[0.3em] mt-2">{label}</p>}
            <div className="flex gap-4 mt-3">
                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />{wins}W
                </span>
                <span className="flex items-center gap-1 text-[10px] font-black text-amber-500">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{draws}D
                </span>
                <span className="flex items-center gap-1 text-[10px] font-black text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />{losses}L
                </span>
            </div>
        </div>
    );
};

// Recent Form Strip
const FormStrip: React.FC<{ form: string[] }> = ({ form }) => (
    <div className="flex flex-col items-start">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Recent Form</p>
        <div className="flex gap-2 flex-wrap">
            {form.length === 0
                ? <span className="text-[10px] text-slate-600 font-bold">No completed matches yet</span>
                : form.slice(-7).map((r, i) => (
                    <span key={i} className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black border transition-all ${r === 'W'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                        : r === 'D'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>{r}</span>
                ))
            }
        </div>
    </div>
);

// Status Pill Row
const StatusPills: React.FC<{ pending: number; completed: number; cancelled: number }> = ({ pending, completed, cancelled }) => (
    <div className="flex flex-col">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">Condition</p>
        <div className="flex flex-wrap gap-3">
            <span className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider">
                {pending} Pending
            </span>
            <span className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                {completed} Done
            </span>
            <span className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider">
                {cancelled} Cancelled
            </span>
        </div>
    </div>
);

// Section header
const SectionLabel: React.FC<{ label: string; color?: string }> = ({ label, color = 'text-amber-500/60' }) => (
    <p className={`text-[9px] font-black uppercase tracking-[0.35em] mb-4 ${color}`}>{label}</p>
);

// Custom recharts tooltip
const RoyalTooltip: React.FC<any> = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#020617] border border-amber-500/20 rounded-2xl px-5 py-3 shadow-2xl">
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/60 mb-1">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} className="text-sm font-black" style={{ color: p.color }}>{p.value}</p>
            ))}
        </div>
    );
};

// ─── PLAYER STATS TABLE ───────────────────────────────────────────────────────
const PlayerStatsTable: React.FC<{ stats: PlayerStat[], title: string, onPlayerClick: (stat: PlayerStat) => void }> = ({ stats, title, onPlayerClick }) => (
    <div className="bg-white/[0.02] rounded-[24px] md:rounded-[32px] border border-white/5 overflow-hidden">
        <div className="p-6 md:p-8 border-b border-white/5">
            <SectionLabel label={title} />
        </div>
        <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[500px] md:min-w-full">
                <thead>
                    <tr className="bg-white/[0.01]">
                        <th className="px-6 md:px-8 py-4 md:py-5 text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Operative</th>
                        <th className="px-6 md:px-8 py-4 md:py-5 text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest text-center whitespace-nowrap">KDA Ratio</th>
                        <th className="px-6 md:px-8 py-4 md:py-5 text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest text-center whitespace-nowrap">Average ACS</th>
                        <th className="px-6 md:px-8 py-4 md:py-5 text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest text-center whitespace-nowrap">Ops Logged</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {stats.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="px-8 py-10 text-center text-[10px] font-black text-slate-600 uppercase tracking-widest">No intelligence gathered for this unit</td>
                        </tr>
                    ) : (
                        stats.map((p, i) => (
                            <tr key={i} onClick={() => onPlayerClick(p)} className="hover:bg-white/[0.02] transition-colors group cursor-pointer">
                                <td className="px-8 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 text-[10px] font-black border border-amber-500/20">
                                            {p.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-black text-white uppercase tracking-tight group-hover:text-amber-400 transition-colors">{p.name}</span>
                                    </div>
                                </td>
                                <td className="px-8 py-5 text-center">
                                    <span className={`text-sm font-black tracking-tighter ${getKDAColor(p.kd)}`}>
                                        {p.kd}
                                    </span>
                                </td>
                                <td className="px-8 py-5 text-center">
                                    <span className="text-sm font-black text-amber-400 tracking-tighter">{p.avgAcs}</span>
                                </td>
                                <td className="px-8 py-5 text-center">
                                    <span className="text-xs font-black text-slate-500 tracking-widest">{p.games}</span>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
);

// ─── SCRIM TAB ───────────────────────────────────────────────────────────────
const ScrimIntel: React.FC<{ scrims: any[], playerStats: PlayerStat[], onPlayerClick: (stat: PlayerStat) => void }> = ({ scrims, playerStats, onPlayerClick }) => {
    const completed = scrims.filter(s => s.status === 'completed');
    const pending = scrims.filter(s => s.status === 'pending').length;
    const cancelled = scrims.filter(s => s.status === 'cancelled').length;

    // Win/Loss from results JSON: a scrim is a W if majority maps are WIN
    let wins = 0, losses = 0, draws = 0;
    const recentForm: string[] = [];
    const mapWins: Record<string, { w: number; t: number }> = {};

    completed.forEach(s => {
        let results: any[] = [];
        try {
            results = typeof s.results === 'string' ? JSON.parse(s.results) : (s.results || []);
        } catch { results = []; }

        const ws = results.filter((r: any) => r && parseMatchResult(r.score, r.isVictory) === 1).length;
        const ls = results.filter((r: any) => r && parseMatchResult(r.score, r.isVictory) === 0).length;

        if (ws > ls) {
            wins++;
            recentForm.push('W');
        } else if (ws < ls) {
            losses++;
            recentForm.push('L');
        } else if (results.length > 0) {
            draws++;
            recentForm.push('D');
        }

        // Map stats
        let maps: string[] = [];
        try {
            maps = typeof s.maps === 'string' ? JSON.parse(s.maps) : (s.maps || []);
        } catch { maps = []; }

        maps.forEach((m: string, i: number) => {
            if (!m) return;
            if (!mapWins[m]) mapWins[m] = { w: 0, t: 0 };
            mapWins[m].t++;
            if (parseMatchResult(results[i]?.score, results[i]?.isVictory) === 1) mapWins[m].w++;
        });
    });

    const mapData = Object.entries(mapWins).map(([name, v]) => ({
        name,
        winRate: Math.round((v.w / v.t) * 100),
    })).sort((a, b) => b.winRate - a.winRate);

    if (scrims.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <svg className="w-12 h-12 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">No Scrims Logged</p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {/* Top row: donut + form + status */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                <div className="bg-white/[0.02] rounded-[24px] md:rounded-[32px] border border-white/5 p-6 md:p-8 flex flex-col items-center justify-center">
                    <SectionLabel label="Combat Record" />
                    <DonutRing wins={wins} losses={losses} draws={draws} label="Win Rate" />
                </div>
                <div className="bg-white/[0.02] rounded-[24px] md:rounded-[32px] border border-white/5 p-6 md:p-8 flex flex-col gap-6 md:gap-8 justify-center">
                    <FormStrip form={recentForm} />
                    <StatusPills pending={pending} completed={completed.length} cancelled={cancelled} />
                </div>
                <div className="bg-white/[0.02] rounded-[24px] md:rounded-[32px] border border-white/5 p-6 md:p-8 flex flex-col justify-center">
                    <SectionLabel label="Totals" />
                    <div className="space-y-3 md:space-y-4">
                        {[
                            { label: 'Total', value: scrims.length, color: 'text-white' },
                            { label: 'Done', value: completed.length, color: 'text-emerald-400' },
                            { label: 'Wins', value: wins, color: 'text-emerald-400' },
                            { label: 'Draws', value: draws, color: 'text-amber-500' },
                            { label: 'Losses', value: losses, color: 'text-red-400' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="flex justify-between items-center border-b border-white/5 pb-2 md:pb-3 last:border-0 last:pb-0">
                                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
                                <span className={`text-base md:text-xl font-black tracking-tighter ${color}`}>{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Map Win Rate Bars */}
            {mapData.length > 0 && (
                <div className="bg-white/[0.02] rounded-[32px] border border-white/5 p-8">
                    <SectionLabel label="Theater Win Rate (%)" />
                    <div className="h-[250px] min-h-[250px] w-full"> {/* Stable height wrapper */}
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={mapData} barSize={28}>
                                <defs>
                                    <linearGradient id="scrimMapGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={GOLD} stopOpacity={1} />
                                        <stop offset="100%" stopColor={PURPLE} stopOpacity={0.8} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="8 8" stroke="#ffffff06" vertical={false} />
                                <XAxis dataKey="name" stroke={GOLD + '66'} fontSize={10} fontWeight="900" tickLine={false} axisLine={false} dy={8} />
                                <YAxis domain={[0, 100]} stroke={GOLD + '44'} fontSize={9} fontWeight="900" tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                                <Tooltip content={<RoyalTooltip />} />
                                <Bar dataKey="winRate" radius={[8, 8, 0, 0]} fill="url(#scrimMapGrad)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <PlayerStatsTable stats={playerStats} title="Scrim Performance Metrics" onPlayerClick={onPlayerClick} />
        </div>
    );
};

// ─── TOURNAMENT TAB ───────────────────────────────────────────────────────────
const TournamentIntel: React.FC<{ tournaments: any[], playerStats: PlayerStat[], onPlayerClick: (stat: PlayerStat) => void }> = ({ tournaments, playerStats, onPlayerClick }) => {
    const completed = tournaments.filter(t => t.status === 'completed');
    const pending = tournaments.filter(t => t.status === 'pending').length;
    const cancelled = tournaments.filter(t => t.status === 'cancelled').length;

    let wins = 0, losses = 0, draws = 0;
    const recentForm: string[] = [];
    const opponentCount: Record<string, number> = {};
    const formatCount: Record<string, number> = {};

    completed.forEach(t => {
        let results: any[] = [];
        try {
            results = typeof t.results === 'string' ? JSON.parse(t.results) : (t.results || []);
        } catch { results = []; }

        const ws = results.filter((r: any) => r && parseMatchResult(r.score, r.isVictory) === 1).length;
        const ls = results.filter((r: any) => r && parseMatchResult(r.score, r.isVictory) === 0).length;

        if (ws > ls) {
            wins++;
            recentForm.push('W');
        } else if (ws < ls) {
            losses++;
            recentForm.push('L');
        } else if (results.length > 0) {
            draws++;
            recentForm.push('D');
        }
    });

    tournaments.forEach(t => {
        if (t.opponent) opponentCount[t.opponent] = (opponentCount[t.opponent] || 0) + 1;
        if (t.format) formatCount[t.format] = (formatCount[t.format] || 0) + 1;
    });

    const opponentData = Object.entries(opponentCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    const formatData = Object.entries(formatCount).map(([name, value]) => ({ name, value }));
    const FORMAT_COLORS = [GOLD, PURPLE, EMERALD, '#60a5fa', '#f472b6'];

    if (tournaments.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <svg className="w-12 h-12 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600">No Tournament Data</p>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            {/* Top row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white/[0.02] rounded-[32px] border border-white/5 p-8 flex flex-col items-center justify-center">
                    <SectionLabel label="Tournament Record" />
                    <DonutRing wins={wins} losses={losses} draws={draws} label="Tournament Win Rate" />
                </div>
                <div className="bg-white/[0.02] rounded-[32px] border border-white/5 p-8 flex flex-col gap-8 justify-center">
                    <FormStrip form={recentForm} />
                    <StatusPills pending={pending} completed={completed.length} cancelled={cancelled} />
                </div>
                <div className="bg-white/[0.02] rounded-[32px] border border-white/5 p-8 flex flex-col justify-center">
                    <SectionLabel label="Format Breakdown" />
                    {formatData.length > 0 ? (
                        <div className="h-[180px] min-h-[180px] w-full mt-4"> {/* Stable height wrapper */}
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={formatData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                                        innerRadius={35} outerRadius={58} paddingAngle={4}>
                                        {formatData.map((_, i) => (
                                            <Cell key={i} fill={FORMAT_COLORS[i % FORMAT_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<RoyalTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="text-[10px] text-slate-600 font-bold">No format data</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-3">
                        {formatData.map((f, i) => (
                            <span key={f.name} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                <span className="w-2 h-2 rounded-full" style={{ background: FORMAT_COLORS[i % FORMAT_COLORS.length] }} />
                                {f.name} ({f.value})
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Opponent Frequency */}
            {opponentData.length > 0 && (
                <div className="bg-white/[0.02] rounded-[32px] border border-white/5 p-8">
                    <SectionLabel label="Opponent Frequency" color="text-purple-400/60" />
                    <div className="h-[250px] min-h-[250px] w-full"> {/* Stable height wrapper */}
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={opponentData} barSize={28}>
                                <defs>
                                    <linearGradient id="tourneyBarGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={PURPLE} stopOpacity={1} />
                                        <stop offset="100%" stopColor="#4c1d95" stopOpacity={0.7} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="8 8" stroke="#ffffff06" vertical={false} />
                                <XAxis dataKey="name" stroke={PURPLE + '99'} fontSize={9} fontWeight="900" tickLine={false} axisLine={false} dy={8} />
                                <YAxis stroke={PURPLE + '66'} fontSize={9} fontWeight="900" tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip content={<RoyalTooltip />} />
                                <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="url(#tourneyBarGrad)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            <PlayerStatsTable stats={playerStats} title="Tournament Performance Metrics" onPlayerClick={onPlayerClick} />
        </div>
    );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const TacticalIntelGraphs: React.FC<TacticalIntelGraphsProps> = ({ teamId: initialTeamId, availableTeams, userRole: initialUserRole }) => {
    const [activeTab, setActiveTab] = useState<'scrim' | 'tournament'>('scrim');
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(initialTeamId ?? (availableTeams[0]?.id || null));
    const [scrims, setScrims] = useState<any[]>([]);
    const [tournaments, setTournaments] = useState<any[]>([]);
    const [scrimStats, setScrimStats] = useState<PlayerStat[]>([]);
    const [tourneyStats, setTourneyStats] = useState<PlayerStat[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [intelError, setIntelError] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedTimeFilter, setSelectedTimeFilter] = useState('All');
    const [selectedPlayerForModal, setSelectedPlayerForModal] = useState<PlayerStats | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [userRole, setUserRole] = useState<string | undefined>(initialUserRole);

    useEffect(() => {
        if (initialUserRole) {
            setUserRole(initialUserRole);
        } else {
            const storedRole = localStorage.getItem('userRole');
            if (storedRole) setUserRole(storedRole);
        }
    }, [initialUserRole]);

    const handlePlayerClick = (stat: PlayerStat) => {
        // Since we now have the ID from the backend stats, we can fetch the full player details 
        // using the new /api/teams/:id endpoint which includes players.

        const API = GET_API_BASE_URL();
        fetch(`${API}/api/teams/${selectedTeamId}`)
            .then(res => res.json())
            .then(result => {
                if (result.success && result.data.players) {
                    const fullPlayer = result.data.players.find((p: any) => p.id === stat.id);
                    if (fullPlayer) {
                        setSelectedPlayerForModal({
                            id: fullPlayer.id,
                            name: fullPlayer.name,
                            role: fullPlayer.role,
                            image: fullPlayer.image,
                            acs: stat.avgAcs.toString(),
                            kda: stat.kd.toString()
                        });
                        setIsModalOpen(true);
                    }
                }
            })
            .catch(err => {
                console.error("Error fetching player details:", err);
                // Fallback to partial data if fetch fails
                setSelectedPlayerForModal({
                    id: stat.id,
                    name: stat.name,
                    acs: stat.avgAcs.toString(),
                    kda: stat.kd.toString()
                } as any);
                setIsModalOpen(true);
            });
    };

    const selectedTeam = availableTeams.find(t => t.id === selectedTeamId) || availableTeams[0];

    const API = GET_API_BASE_URL();

    useEffect(() => {
        if (availableTeams.length > 0 && !selectedTeamId) {
            setSelectedTeamId(availableTeams[0].id);
        }
    }, [availableTeams]);

    useEffect(() => {
        if (!selectedTeamId) return;
        setLoading(true);
        setIntelError(null);
        Promise.all([
            fetch(`${API}/api/scrims?teamId=${selectedTeamId}`).then(r => r.ok ? r.json() : { success: false, error: 'SCRIM_FEED_FAILED' }),
            fetch(`${API}/api/tournaments?teamId=${selectedTeamId}`).then(r => r.ok ? r.json() : { success: false, error: 'TOURNAMENT_FEED_FAILED' }),
            fetch(`${API}/api/teams/${selectedTeamId}/stats`).then(r => r.ok ? r.json() : { success: false, error: 'INTEL_STATS_FAILED' }),
        ]).then(([sRes, tRes, stRes]) => {
            if (sRes.success) setScrims(Array.isArray(sRes.data) ? sRes.data : []);
            if (tRes.success) setTournaments(Array.isArray(tRes.data) ? tRes.data : []);

            if (stRes.success && stRes.data) {
                const st = stRes.data;
                setStats(st);
                if (st.scrim) setScrimStats(st.scrim.topPlayers || []);
                if (st.tournament) setTourneyStats(st.tournament.topPlayers || []);
            }

            if (!sRes.success && !tRes.success && !stRes.success) {
                throw new Error("Tactical Neural Network: All streams offline. Verify connectivity.");
            }
        }).catch(err => {
            console.error("Tactical Intelligence Error:", err);
            setIntelError(err.message || 'Quantum Feed Interrupted');
        }).finally(() => setLoading(false));
    }, [selectedTeamId, API]);

    const availableMonths = React.useMemo(() => {
        const months = new Set<string>();
        const allItems = [...scrims, ...tournaments];
        console.log("Tactical Intel Data:", allItems);
        allItems.forEach(item => {
            if (!item.date) return;
            const d = new Date(item.date);
            if (isNaN(d.getTime())) return;
            // Get first and last day of the month
            const start = new Date(d.getFullYear(), d.getMonth(), 1);
            const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

            const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            months.add(JSON.stringify({
                label: `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}`,
                start: start.getTime(),
                end: end.getTime()
            }));
        });

        return Array.from(months)
            .map(m => JSON.parse(m))
            .sort((a, b) => b.start - a.start);
    }, [scrims, tournaments]);

    const filteredScrims = React.useMemo(() => {
        if (selectedTimeFilter === 'All') return scrims;
        const filterObj = JSON.parse(selectedTimeFilter);
        return scrims.filter(s => {
            if (!s.date) return false;
            const t = new Date(s.date).getTime();
            return t >= filterObj.start && t <= filterObj.end;
        });
    }, [scrims, selectedTimeFilter]);

    const filteredTournaments = React.useMemo(() => {
        if (selectedTimeFilter === 'All') return tournaments;
        const filterObj = JSON.parse(selectedTimeFilter);
        return tournaments.filter(t => {
            if (!t.date) return false;
            const time = new Date(t.date).getTime();
            return time >= filterObj.start && time <= filterObj.end;
        });
    }, [tournaments, selectedTimeFilter]);

    return (
        <div className="space-y-8 max-h-[85vh] flex flex-col bg-[#020617]/40 backdrop-blur-3xl rounded-[40px] border border-white/5 p-6 md:p-8 shadow-2xl">
            {/* Header / Navigation Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white/[0.02] p-6 md:p-8 rounded-[32px] border border-white/10 gap-8 flex-shrink-0 relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.02] via-transparent to-purple-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                <div className="flex flex-col gap-2 w-full sm:w-auto relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-2.5 h-8 bg-amber-500 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.6)] animate-pulse" />
                        <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter italic">Tactical Intelligence</h3>
                    </div>
                    <p className="text-[10px] font-black text-amber-500/50 uppercase tracking-[0.5em] ml-6 leading-none">Quantum Analytics Neural Feed // Unit {selectedTeam?.name}</p>
                </div>

                <div className="flex flex-wrap lg:flex-nowrap items-center gap-4 w-full lg:w-auto relative z-10">
                    {/* Tab Switcher */}
                    <div className="bg-black/60 rounded-[20px] p-1.5 border border-white/10 flex shadow-2xl overflow-hidden flex-shrink-0 backdrop-blur-md">
                        {[
                            { id: 'scrim', label: 'Scrims' },
                            { id: 'tournament', label: 'Tournaments' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-6 md:px-8 py-2.5 md:py-3.5 text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] rounded-[14px] transition-all duration-500 whitespace-nowrap ${activeTab === tab.id
                                    ? 'bg-amber-500 text-black shadow-[0_0_30px_rgba(245,158,11,0.4)] scale-105'
                                    : 'text-slate-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >{tab.label}</button>
                        ))}
                    </div>

                    {/* Period Filter */}
                    <div className="relative min-w-[160px] xl:min-w-[200px] flex-grow lg:flex-grow-0 group/select">
                        <select
                            value={selectedTimeFilter}
                            onChange={(e) => setSelectedTimeFilter(e.target.value)}
                            className={`w-full bg-black/60 border border-white/10 rounded-[20px] px-6 py-4 text-[11px] font-black uppercase tracking-widest appearance-none cursor-pointer focus:outline-none focus:border-amber-500/50 transition-all backdrop-blur-md ${selectedTimeFilter !== 'All' ? 'text-amber-400 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.1)]' : 'text-slate-400'}`}
                        >
                            <option value="All" className="bg-[#0d0d14] text-amber-500">All Time Intel</option>
                            {availableMonths.map((m, i) => (
                                <option key={i} value={JSON.stringify(m)} className="bg-[#0d0d14] text-slate-300">
                                    {m.label}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 group-hover/select:text-amber-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>

                    {/* Team Picker */}
                    {availableTeams.length > 0 && (
                        <div className="relative min-w-[220px] xl:min-w-[320px] flex-grow lg:flex-grow-0">
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="w-full bg-black/60 border border-white/10 rounded-[20px] px-8 py-4 text-[11px] font-black text-amber-400 uppercase tracking-[0.2em] focus:outline-none focus:border-amber-500/50 flex items-center justify-between gap-6 hover:bg-black/80 transition-all backdrop-blur-md shadow-xl group/team"
                            >
                                <span className="truncate">{selectedTeam?.name}</span>
                                <svg className={`w-5 h-5 transition-transform duration-500 ${isDropdownOpen ? 'rotate-180' : ''} group-hover/team:text-amber-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {isDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-[60]" onClick={() => setIsDropdownOpen(false)} />
                                    <div className="absolute top-full mt-4 right-0 w-80 bg-[#0d0d14]/95 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] z-[70] overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-500">
                                        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Select Operational Unit</p>
                                        </div>
                                        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                                            {availableTeams.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => {
                                                        setSelectedTeamId(t.id);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className={`w-full px-8 py-5 text-[11px] font-black text-left uppercase tracking-widest transition-all hover:bg-amber-500/10 border-b border-white/5 last:border-0 flex flex-col gap-1.5 ${selectedTeamId === t.id ? 'text-amber-500 bg-amber-500/5' : 'text-slate-400 hover:text-white'}`}
                                                >
                                                    {t.name}
                                                    <span className="text-[8px] text-slate-600 tracking-[0.3em] font-bold">{t.game.toUpperCase()} SIMULATOR</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-grow pr-4 -mr-4 min-h-0">
                {/* Content */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-6">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
                            <div className="absolute inset-0 w-16 h-16 border-4 border-purple-500/10 border-b-purple-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '2s' }} />
                        </div>
                        <p className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-600 animate-pulse italic">Compiling Intelligence...</p>
                    </div>
                ) : intelError ? (
                    <div className="flex flex-col items-center justify-center py-32 px-10 space-y-8 animate-in fade-in zoom-in-95 duration-700">
                        <div className="relative">
                            <div className="absolute -inset-6 bg-red-500/20 rounded-full blur-3xl animate-pulse" />
                            <div className="relative w-24 h-24 rounded-[32px] bg-[#020617] border border-red-500/40 flex items-center justify-center text-red-500 shadow-[0_0_60px_rgba(239,68,68,0.2)]">
                                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            </div>
                        </div>
                        <div className="text-center space-y-3">
                            <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">Intelligence Stream Offline</h3>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] max-w-sm leading-relaxed">{intelError}</p>
                        </div>
                        <button
                            onClick={() => {
                                setLoading(true);
                                setIntelError(null);
                                // Simple force refresh
                                const cid = selectedTeamId;
                                setSelectedTeamId(null);
                                setTimeout(() => setSelectedTeamId(cid), 50);
                            }}
                            className="px-10 py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] transition-all border border-red-500/20 active:scale-95"
                        >
                            Emergency Reboot
                        </button>
                    </div>
                ) : (
                    <div className="animate-in fade-in duration-500 space-y-8">
                        {activeTab === 'scrim' ? (
                            <ScrimIntel scrims={filteredScrims} playerStats={scrimStats} onPlayerClick={handlePlayerClick} />
                        ) : (
                            <TournamentIntel tournaments={filteredTournaments} playerStats={tourneyStats} onPlayerClick={handlePlayerClick} />
                        )}

                        {/* Agent Performance Section */}
                        {(() => {
                            const teamAgentStats = activeTab === 'scrim' ? stats?.scrim?.agentStats : stats?.tournament?.agentStats;
                            const agentPerformanceData: AgentStat[] = teamAgentStats ? Object.entries(teamAgentStats)
                                .filter(([name]) => name && name !== '' && name !== 'Unknown' && name !== 'null' && name !== 'undefined')
                                .map(([name, s]: [string, any]) => {
                                    const totalGames = activeTab === 'scrim' ? (stats?.scrim?.gamesPlayed || 1) : (stats?.tournament?.gamesPlayed || 1);
                                    return {
                                        name,
                                        totalGames: s.total,
                                        wins: s.wins || 0,
                                        draws: s.draws || 0,
                                        losses: s.total - (s.wins || 0) - (s.draws || 0),
                                        pickRate: Math.round((s.total / (totalGames || 1)) * 100),
                                        winRate: Math.round((s.wins / (s.total || 1)) * 100)
                                    };
                                }).sort((a, b) => b.totalGames - a.totalGames) : [];

                            if (agentPerformanceData.length === 0) return null;

                            return (
                                <div className="bg-white/[0.03] rounded-[32px] border border-white/5 p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                    <div className="flex items-center justify-between">
                                        <SectionLabel label="Agent Tactical Performance" color="text-amber-500/60" />
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Active Division Intel</span>
                                        </div>
                                    </div>

                                    <div className="flex overflow-x-auto pb-4 space-x-6 custom-scrollbar">
                                        {agentPerformanceData.map((agent, idx) => (
                                            <div key={idx} className="flex-shrink-0 w-64 bg-black/40 rounded-2xl border border-white/5 p-6 space-y-4 hover:border-amber-500/30 transition-all group">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <img
                                                            src={`/assets/agents/${agent.name.replace('/', '_')}${agent.name === 'Veto' ? '.webp' : '.png'}`}
                                                            className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(245,158,11,0.3)] group-hover:scale-110 transition-transform duration-500"
                                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                                        />
                                                        <h4 className="text-sm font-black text-white uppercase tracking-tighter italic group-hover:text-amber-500 transition-colors uppercase">{agent.name}</h4>
                                                    </div>
                                                    <span className="text-[8px] font-black text-slate-600 uppercase">Games: {agent.totalGames}</span>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                                                            <span className="text-slate-500">Pick Rate</span>
                                                            <span className="text-white">{agent.pickRate}%</span>
                                                        </div>
                                                        <div className="flex justify-between text-[7px] font-black uppercase tracking-widest text-slate-500/60 pb-1">
                                                            <span>Record</span>
                                                            <span className="text-slate-400">{agent.wins}W-{agent.losses}L-{agent.draws}D</span>
                                                        </div>
                                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${agent.pickRate}%` }} />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                                                            <span className="text-slate-500">Win Rate</span>
                                                            <span className="text-emerald-500">{agent.winRate}%</span>
                                                        </div>
                                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${agent.winRate}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                <PlayerStatsModal
                    player={selectedPlayerForModal}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    userRole={userRole}
                    showAdvancedIntel={true}
                />
            </div>
        </div>
    );
};

export default TacticalIntelGraphs;
