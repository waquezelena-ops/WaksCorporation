import React, { useEffect, useState } from 'react';
import { GET_API_BASE_URL } from '../utils/apiUtils';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

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
                    {/* Maps Mastery Section */}
                    {data.mapStats && data.mapStats.length > 0 && (
                        <div className="glass backdrop-blur-2xl p-6 md:p-10 rounded-[32px] md:rounded-[40px] border border-white/10 shadow-soft relative group">
                            <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500/60 uppercase tracking-[0.3em] mb-8 text-center">Strategic Map Mastery</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                                {data.mapStats.map((map, idx) => (
                                    <div key={idx} className="relative group flex flex-col items-center">
                                        <div className="relative w-20 h-20 md:w-32 md:h-32 mb-4">
                                            <svg className="w-full h-full transform -rotate-90">
                                                <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100 dark:text-slate-800" />
                                                <circle
                                                    cx="50%" cy="50%" r="45%"
                                                    stroke="url(#goldGradient)" strokeWidth="8" fill="transparent"
                                                    strokeDasharray="283"
                                                    strokeDashoffset={283 - (283 * map.winRate) / 100}
                                                    strokeLinecap="round"
                                                    className="transition-all duration-1000 ease-out"
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                                <span className="text-sm md:text-2xl font-black text-[var(--text-color)] dark:text-white">{map.winRate}%</span>
                                                <span className="text-[7px] md:text-[10px] text-slate-500 uppercase font-bold tracking-tighter">WIN RATE</span>
                                            </div>
                                            <svg width="0" height="0">
                                                <defs>
                                                    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#f59e0b" />
                                                        <stop offset="100%" stopColor="#a855f7" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                        </div>
                                        <h5 className="font-black text-[var(--text-color)] dark:text-slate-300 text-[10px] md:text-sm">{map.name}</h5>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 md:gap-12">
                        {/* KDA Chart */}
                        <div className="glass backdrop-blur-2xl p-6 md:p-10 rounded-[32px] md:rounded-[40px] border border-white/10 shadow-soft relative group overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-100 transition-opacity">
                                <span className="text-[8px] font-mono text-purple-400">TERM://INTEL_KDA</span>
                            </div>
                            <h4 className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-[0.5em] mb-8">Pulse Matrix (Avg KDA)</h4>
                            <div className="h-[250px] w-full relative z-10">
                                <Bar 
                                    data={{
                                        labels: data.players.map(p => p.name),
                                        datasets: [{
                                            label: 'Average KDA',
                                            data: data.players.map(p => Number(p.kda)),
                                            backgroundColor: (context) => {
                                                const ctx = context.chart.ctx;
                                                const gradient = ctx.createLinearGradient(0, 0, 400, 0);
                                                gradient.addColorStop(0, '#a855f7');
                                                gradient.addColorStop(1, '#f59e0b');
                                                return gradient;
                                            },
                                            borderRadius: 8,
                                        }]
                                    }}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        indexAxis: 'y',
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: {
                                                backgroundColor: 'rgba(2, 6, 23, 0.95)',
                                                cornerRadius: 12,
                                                padding: 12,
                                                borderColor: 'rgba(168, 85, 247, 0.3)',
                                                borderWidth: 1.5,
                                                titleFont: { weight: 'bold' }
                                            }
                                        },
                                        scales: {
                                            x: { 
                                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                                ticks: { color: 'rgba(255, 255, 255, 0.3)', font: { size: 10 } }
                                            },
                                            y: { 
                                                grid: { display: false },
                                                ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10, weight: 'bold' } }
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* ACS Chart */}
                        <div className="glass backdrop-blur-2xl p-6 md:p-10 rounded-[32px] md:rounded-[40px] border border-white/10 shadow-soft relative group overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:opacity-100 transition-opacity">
                                <span className="text-[8px] font-mono text-amber-500">TERM://INTEL_ACS</span>
                            </div>
                            <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-[0.5em] mb-8">Neural Intensity (Average ACS)</h4>
                            <div className="h-[250px] w-full relative z-10">
                                <Bar 
                                    data={{
                                        labels: data.players.map(p => p.name),
                                        datasets: [{
                                            label: 'Average ACS',
                                            data: data.players.map(p => Number(p.acs)),
                                            backgroundColor: (context) => {
                                                const ctx = context.chart.ctx;
                                                const gradient = ctx.createLinearGradient(0, 400, 0, 0);
                                                gradient.addColorStop(0, '#f59e0b');
                                                gradient.addColorStop(1, '#a855f7');
                                                return gradient;
                                            },
                                            borderRadius: 8,
                                        }]
                                    }}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: {
                                                backgroundColor: 'rgba(2, 6, 23, 0.95)',
                                                cornerRadius: 12,
                                                padding: 12,
                                                borderColor: 'rgba(245, 158, 11, 0.3)',
                                                borderWidth: 1.5,
                                                titleFont: { weight: 'bold' }
                                            }
                                        },
                                        scales: {
                                            x: { 
                                                grid: { display: false },
                                                ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { size: 10, weight: 'bold' } }
                                            },
                                            y: { 
                                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                                ticks: { color: 'rgba(255, 255, 255, 0.3)', font: { size: 10 } }
                                            }
                                        }
                                    }}
                                />
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
