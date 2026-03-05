import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar, Cell } from 'recharts';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface PlayerStat {
    name: string;
    kda: string;
    acs: number;
    teamId: number;
}

interface MapStat {
    name: string;
    winRate: number;
}

interface AnalyticsData {
    players: PlayerStat[];
    mapStats?: MapStat[];
}

interface PerformanceGraphsProps {
    teamId?: number | 'all';
    availableTeams: any[];
}

const PerformanceGraphs: React.FC<PerformanceGraphsProps> = ({ teamId: initialTeamId = 'all', availableTeams }) => {
    const [selectedTeamId, setSelectedTeamId] = useState<number | 'all'>(initialTeamId);
    const [data, setData] = useState<AnalyticsData>({ players: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [selectedTeamId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/analytics/performers?teamId=${selectedTeamId}`);
            if (res.ok) {
                const result = await res.json();
                setData(result);
            }
        } catch (e) {
            console.error("Failed to fetch analytics:", e);
        } finally {
            setLoading(false);
        }
    };

    const ROYALTY_PURPLE = "#4c1d95";
    const ROYALTY_GOLD = "#fbbf24";
    const DARK_BG = "#020617";

    return (
        <div className="space-y-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-amber-500 to-purple-600 dark:from-purple-400 dark:via-amber-400 dark:dark:to-purple-400 animate-gradient-x">
                        Elite Performance Command
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-bold uppercase tracking-widest flex items-center">
                        <span className="w-2 h-2 bg-amber-500 rounded-full mr-2 shadow-[0_0_10px_#fbbf24]" />
                        Real-time Strategic Intelligence
                    </p>
                </div>
                <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="glass backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 text-sm font-black text-amber-500 focus:outline-none focus:border-amber-500 shadow-[0_0_20px_rgba(251,191,36,0.1)] transition-all cursor-pointer hover:bg-white/5"
                >
                    <option value="all">Global Organizational Stats</option>
                    {availableTeams.map(t => (
                        <option key={t.id} value={t.id}>{t.name} ({t.game})</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div className="h-96 flex items-center justify-center">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                        <div className="absolute inset-0 w-16 h-16 border-4 border-purple-500/20 border-b-purple-500 rounded-full animate-spin-slow" />
                    </div>
                </div>
            ) : data.players.length > 0 ? (
                <div className="space-y-12">
                    {/* Maps Mastery Section - NEW */}
                    {data.mapStats && data.mapStats.length > 0 && (
                        <div className="glass backdrop-blur-2xl p-10 rounded-[40px] border border-white/10 shadow-soft relative group">
                            <h4 className="text-xs font-black text-amber-600 dark:text-amber-500/60 uppercase tracking-[0.3em] mb-8 text-center">Strategic Map Mastery</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                                {data.mapStats.map((map, idx) => (
                                    <div key={idx} className="relative group flex flex-col items-center">
                                        <div className="relative w-32 h-32 mb-4">
                                            <svg className="w-full h-full transform -rotate-90">
                                                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                                                <circle
                                                    cx="64" cy="64" r="58"
                                                    stroke="url(#goldGradient)" strokeWidth="8" fill="transparent"
                                                    strokeDasharray={364.4}
                                                    strokeDashoffset={364.4 - (364.4 * map.winRate) / 100}
                                                    strokeLinecap="round"
                                                    className="transition-all duration-1000 ease-out"
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                                <span className="text-2xl font-black text-[var(--text-color)] dark:text-white">{map.winRate}%</span>
                                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">WIN RATE</span>
                                            </div>
                                            <svg width="0" height="0">
                                                <defs>
                                                    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#fbbf24" />
                                                        <stop offset="100%" stopColor="#d97706" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                        </div>
                                        <h5 className="font-black text-[var(--text-color)] dark:text-slate-300 text-sm">{map.name}</h5>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                        {/* KDA Chart */}
                        <div className="glass backdrop-blur-2xl p-10 rounded-[40px] border border-white/10 shadow-soft relative group">
                            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-100 transition-opacity">
                                <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                            </div>
                            <h4 className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-[0.5em] mb-12">Assault Efficiency (Avg KDA)</h4>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.players}>
                                        <CartesianGrid strokeDasharray="10 10" stroke="#4c1d9522" vertical={false} />
                                        <XAxis dataKey="name" stroke="#6366f1" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} dy={10} />
                                        <YAxis stroke="#6366f1" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '24px', fontSize: '12px', padding: '15px' }}
                                            itemStyle={{ color: '#a78bfa', fontWeight: 'bold' }}
                                            cursor={{ fill: 'rgba(76, 29, 149, 0.15)' }}
                                        />
                                        <Bar dataKey="kda" radius={[8, 8, 0, 0]} barSize={24}>
                                            {data.players.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={`url(#purpleGradient)`} />
                                            ))}
                                        </Bar>
                                        <defs>
                                            <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                                                <stop offset="100%" stopColor="#4c1d95" stopOpacity={0.8} />
                                            </linearGradient>
                                        </defs>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* ACS Chart */}
                        <div className="bg-white dark:bg-slate-900/40 backdrop-blur-2xl p-10 rounded-[40px] border border-slate-200 dark:border-amber-500/10 shadow-soft relative group">
                            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-100 transition-opacity">
                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                            </div>
                            <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-[0.5em] mb-12">Average Combat Score (Intensity)</h4>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data.players}>
                                        <CartesianGrid strokeDasharray="10 10" stroke="#fbbf2411" vertical={false} />
                                        <XAxis dataKey="name" stroke="#fbbf24" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} dy={10} />
                                        <YAxis stroke="#fbbf24" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '24px', fontSize: '12px', padding: '15px' }}
                                            itemStyle={{ color: '#fbbf24', fontWeight: 'bold' }}
                                            cursor={{ fill: 'rgba(251, 191, 36, 0.05)' }}
                                        />
                                        <Bar dataKey="acs" radius={[8, 8, 0, 0]} barSize={24}>
                                            {data.players.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={`url(#goldBarGradient)`} />
                                            ))}
                                        </Bar>
                                        <defs>
                                            <linearGradient id="goldBarGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#fbbf24" stopOpacity={1} />
                                                <stop offset="100%" stopColor="#d97706" stopOpacity={0.8} />
                                            </linearGradient>
                                        </defs>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="h-96 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-white/10 rounded-[40px] bg-black/20">
                    <svg className="w-12 h-12 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <p className="font-bold uppercase tracking-widest text-xs">No Combat Records Found</p>
                </div>
            )}
        </div>
    );
};

export default PerformanceGraphs;
