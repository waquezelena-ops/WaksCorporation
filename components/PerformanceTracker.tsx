import React, { useEffect, useState } from 'react';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface TeamStats {
    gamesPlayed: number;
    winRate: number;
    wins: number;
    losses: number;
    recentForm: string[];
    mapStats: Record<string, { played: number, wins: number, losses: number }>;
    topPlayers: Array<{ name: string, kd: string, avgAcs: number, games: number }>;
}

const PerformanceTracker: React.FC<{ teamId: number }> = ({ teamId }) => {
    const [stats, setStats] = useState<TeamStats | null>(null);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        fetch(`${GET_API_BASE_URL()}/api/teams/${teamId}/stats`)
            .then(async res => {
                if (!res.ok) {
                    if (res.status === 404) throw new Error('API Endpoint Not Found (404)');
                    throw new Error(`Server Error: ${res.status}`);
                }
                const result = await res.json();
                if (result.success) {
                    setStats(result.data);
                } else {
                    throw new Error(result.error || "Tactical sync failed");
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError(err.message);
                setLoading(false);
            });
    }, [teamId]);

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading performance analytics...</div>;
    if (error) return (
        <div className="p-8 text-center bg-red-50 dark:bg-red-900/10 rounded-3xl border border-red-200 dark:border-red-500/20">
            <h3 className="text-red-600 dark:text-red-400 font-bold mb-2">Connection Error</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">{error}</p>
            <p className="text-xs text-slate-500">Please restart the backend server to apply recent API updates.</p>
        </div>
    );
    if (!stats) return <div className="p-8 text-center text-slate-500">No data available.</div>;

    return (
        <div className="glass rounded-3xl p-8 shadow-soft transition-colors">
            <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-400">
                Team Performance
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Win Rate Card */}
                <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors" />
                    <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-xs mb-2 z-10">Win Rate</span>
                    <div className="relative">
                        <svg className="w-32 h-32 transform -rotate-90">
                            <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-200 dark:text-slate-800" />
                            <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={351.86} strokeDashoffset={351.86 - (351.86 * stats.winRate) / 100} className="text-blue-500 transition-all duration-1000 ease-out" />
                        </svg>
                        <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-3xl font-black text-slate-800 dark:text-white">
                            {stats.winRate}%
                        </span>
                    </div>
                    <div className="mt-4 text-sm font-bold text-slate-600 dark:text-slate-300 z-10">
                        {stats.wins}W - {stats.losses}L
                    </div>
                </div>

                {/* Form & Overview */}
                <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
                    <div>
                        <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-xs">Recent Form</span>
                        <div className="flex space-x-2 mt-3">
                            {stats.recentForm.map((result, idx) => (
                                <div key={idx} className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${result === 'W' ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' : 'bg-red-500 text-white shadow-lg shadow-red-500/30'}`}>
                                    {result}
                                </div>
                            ))}
                            {stats.recentForm.length === 0 && <span className="text-slate-400 text-sm">No recent matches</span>}
                        </div>
                    </div>
                    <div>
                        <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-xs block mb-2">Matches Played</span>
                        <span className="text-4xl font-black text-slate-800 dark:text-white">{stats.gamesPlayed}</span>
                    </div>
                </div>

                {/* Top Player (MVP) */}
                <div className="bg-black/20 p-6 rounded-2xl border border-white/5 relative overflow-hidden">
                    <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-xs">Top Performer (K/D)</span>
                    {stats.topPlayers.length > 0 ? (
                        <div className="mt-4">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">{stats.topPlayers[0].name}</h3>
                            <div className="flex items-end space-x-2 mt-1">
                                <span className="text-4xl font-black text-amber-500">{stats.topPlayers[0].kd}</span>
                                <span className="text-slate-400 font-bold mb-1">K/D</span>
                            </div>
                            <div className="mt-2 text-sm text-slate-500">
                                Avg ACS: <span className="text-slate-700 dark:text-slate-300 font-bold">{stats.topPlayers[0].avgAcs}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-8 text-slate-400 italic">No player data yet</div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Map Stats */}
                <div>
                    <h3 className="font-bold text-lg mb-4 text-slate-700 dark:text-slate-200">Map Performance</h3>
                    <div className="space-y-3">
                        {Object.entries(stats.mapStats).map(([mapName, data]: [string, any]) => (
                            <div key={mapName} className="flex items-center text-sm">
                                <div className="w-24 font-bold text-slate-600 dark:text-slate-400">{mapName}</div>
                                <div className="flex-1 bg-slate-200 dark:bg-white/10 h-2 rounded-full overflow-hidden mx-3">
                                    <div
                                        className="h-full bg-blue-500"
                                        style={{ width: `${(data.wins / data.played) * 100}%` }}
                                    />
                                </div>
                                <div className="w-20 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                                    {Math.round((data.wins / data.played) * 100)}% ({data.wins}-{data.losses})
                                </div>
                            </div>
                        ))}
                        {Object.keys(stats.mapStats).length === 0 && <p className="text-slate-500 text-sm">No map data available.</p>}
                    </div>
                </div>

                {/* Top Players Table */}
                <div>
                    <h3 className="font-bold text-lg mb-4 text-slate-700 dark:text-slate-200">Player Stats (Avg)</h3>
                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/5">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white/5 text-slate-500 uppercase text-xs">
                                <tr>
                                    <th className="p-3">Player</th>
                                    <th className="p-3 text-right">K/D</th>
                                    <th className="p-3 text-right">+/-</th>
                                    <th className="p-3 text-right">ACS</th>
                                    <th className="p-3 text-right">Games</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                                {stats.topPlayers.map((p, i) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors">
                                        <td className="p-3 font-bold text-slate-700 dark:text-slate-300">{p.name}</td>
                                        <td className="p-3 text-right font-mono font-bold text-amber-500">{p.kd}</td>
                                        <td className="p-3 text-right font-mono font-bold">
                                            {(() => {
                                                const ak = (p as any).avgKills;
                                                const ad = (p as any).avgDeaths;
                                                if (ak !== undefined && ad !== undefined) {
                                                    const d = (ak - ad).toFixed(1);
                                                    return <span className={parseFloat(d) > 0 ? 'text-emerald-500' : parseFloat(d) < 0 ? 'text-red-500' : 'text-slate-500'}>{parseFloat(d) > 0 ? `+${d}` : d}</span>;
                                                }
                                                return '--';
                                            })()}
                                        </td>
                                        <td className="p-3 text-right font-mono">{p.avgAcs}</td>
                                        <td className="p-3 text-right font-mono text-slate-500">{p.games}</td>
                                    </tr>
                                ))}
                                {stats.topPlayers.length === 0 && (
                                    <tr><td colSpan={4} className="p-4 text-center text-slate-500">No stats.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PerformanceTracker;
