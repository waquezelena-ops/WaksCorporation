import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Modal from './Modal';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface PlayerStatsModalProps {
    player: any;
    isOpen: boolean;
    onClose: () => void;
    userRole?: string;
    showAdvancedIntel?: boolean;
}

const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({
    player,
    isOpen,
    onClose,
    userRole = 'member',
    showAdvancedIntel = false
}) => {
    const [breakdown, setBreakdown] = useState<any>(null);
    const [loadingBreakdown, setLoadingBreakdown] = useState(false);
    const [breakdownError, setBreakdownError] = useState<string | null>(null);
    const [detailView, setDetailView] = useState<{ type: 'agent' | 'role' | 'map', name: string } | null>(null);
    const [matchIntelDetail, setMatchIntelDetail] = useState<any>(null);
    const [loadingMatchIntel, setLoadingMatchIntel] = useState(false);
    const [selectedMatchForStats, setSelectedMatchForStats] = useState<any>(null);
    const [matchDetails, setMatchDetails] = useState<any>(null); // { scrim, stats }
    const [matchDetailsError, setMatchDetailsError] = useState<string | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [matchIntelError, setMatchIntelError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBreakdown = async () => {
            if (!isOpen || !player?.id) return;
            setLoadingBreakdown(true);
            setBreakdownError(null);
            try {
                const res = await fetch(`${GET_API_BASE_URL()}/api/players/${player.id}/breakdown`);
                const result = await res.json();
                if (result.success) {
                    setBreakdown(result.data);
                } else {
                    setBreakdownError(result.error || "Failed to load tactical breakdown.");
                }
            } catch (err) {
                console.error("Breakdown fetch error:", err);
                setBreakdownError("Signal interference detected. Could not retrieve intel.");
            } finally {
                setLoadingBreakdown(false);
            }
        };

        if (isOpen) {
            fetchBreakdown();
        } else {
            setDetailView(null);
            setMatchIntelDetail(null);
        }
    }, [isOpen, player?.id]);

    useEffect(() => {
        const fetchMatchDetails = async () => {
            if (!selectedMatchForStats) return;
            setLoadingDetails(true);
            setMatchDetailsError(null);
            setMatchDetails(null);
            try {
                const rawType = selectedMatchForStats.type || 'scrim';
                const apiType = rawType === 'tournament' ? 'tournaments' : 'scrims';
                const matchId = selectedMatchForStats.matchId || selectedMatchForStats.id;
                if (!matchId) {
                    setMatchDetailsError('No match ID available.');
                    return;
                }
                const res = await fetch(`${GET_API_BASE_URL()}/api/${apiType}/${matchId}/stats`);
                if (!res.ok) {
                    setMatchDetailsError(`Server error: ${res.status} ${res.statusText}`);
                    return;
                }
                const result = await res.json();
                if (result.success) {
                    setMatchDetails(result.data); // stores { scrim, stats }
                } else {
                    setMatchDetailsError(result.error || 'Failed to load match details.');
                }
            } catch (err: any) {
                console.error("Match details fetch error:", err);
                setMatchDetailsError('Signal interference. Could not retrieve match data.');
            } finally {
                setLoadingDetails(false);
            }
        };

        fetchMatchDetails();
    }, [selectedMatchForStats]);

    const calculateKDA = (k: number, a: number, d: number) => {
        if (d === 0) return (k + a).toFixed(2);
        return ((k + a) / d).toFixed(2);
    };

    const getKDAColor = (kda: string) => {
        const val = parseFloat(kda);
        if (val >= 2.0) return 'text-emerald-500';
        if (val >= 1.0) return 'text-amber-500';
        return 'text-red-500';
    };

    const handleMatchClick = async (s: any) => {
        const rawType = s.type || 'scrim';
        const apiType = rawType === 'tournament' ? 'tournaments' : 'scrims';
        const matchId = s.matchId || s.id;
        if (!matchId) return;

        setLoadingMatchIntel(true);
        setMatchIntelError(null);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/${apiType}/${matchId}/stats`);
            if (!res.ok) {
                setMatchIntelError(`Server error: ${res.status}`);
                setMatchIntelDetail({ ...s, details: null });
                return;
            }
            const result = await res.json();
            if (result.success) {
                setMatchIntelDetail({
                    ...s,
                    details: result.data
                });
            } else {
                setMatchIntelError(result.error || 'Failed to load match intel.');
                setMatchIntelDetail({ ...s, details: null });
            }
        } catch (err: any) {
            console.error("Match intel fetch error:", err);
            setMatchIntelError('Signal interference. Could not retrieve match intel.');
            setMatchIntelDetail({ ...s, details: null });
        } finally {
            setLoadingMatchIntel(false);
        }
    };

    const getDetailData = () => {
        if (!detailView || !breakdown?.history) return [];
        return breakdown.history
            .filter((s: any) => {
                if (detailView.type === 'agent') return s.agent === detailView.name;
                if (detailView.type === 'role') return s.role === detailView.name;
                if (detailView.type === 'map') return s.map === detailView.name;
                return false;
            })
            .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((s: any) => ({
                date: s.date,
                kd: parseFloat(calculateKDA(s.kills, s.assists, s.deaths))
            }));
    };

    const getAgentsInRole = () => {
        if (!detailView || detailView.type !== 'role' || !breakdown?.agents) return [];
        return breakdown.agents
            .filter((a: any) => a.role === detailView.name)
            .map((a: any) => a.name);
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} zIndex={3000} backdropClassName="bg-black/98 backdrop-blur-3xl animate-in fade-in duration-700" className="w-full max-w-5xl max-h-[92vh] p-4">
                {player && (
                    <div className="relative w-full max-h-[88vh] bg-[#020617]/95 backdrop-blur-3xl rounded-[40px] md:rounded-[56px] border border-amber-500/30 shadow-[0_0_120px_rgba(245,158,11,0.2)] overflow-y-auto overflow-x-hidden custom-scrollbar animate-in fade-in zoom-in-95 duration-500">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-50" />

                        {/* Top Banner */}
                        <div className="relative h-[180px] md:h-[240px] overflow-hidden border-b border-white/5 bg-[#020617]">
                            <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 to-transparent z-10" />
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80')] bg-cover bg-center opacity-20 grayscale brightness-50" />
                            <div className="absolute bottom-0 left-0 w-full p-8 md:p-12 z-20 flex items-end justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-lg text-[8px] font-black text-amber-500 uppercase tracking-[0.3em]">Operational Unit</span>
                                        {player.role?.includes('coach') && <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/30 rounded-lg text-[8px] font-black text-purple-400 uppercase tracking-[0.3em]">Command Staff</span>}
                                    </div>
                                    <h2 className="text-4xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-none">{player.name}</h2>
                                    <p className="text-xs md:text-sm text-slate-400 font-bold tracking-[0.2em] uppercase">{player.team} Intelligence Profile</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-slate-500 hover:text-white transition-all border border-white/5 hover:border-white/20 group"
                                >
                                    <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="p-8 md:p-12 space-y-12 relative z-10">
                            {loadingBreakdown ? (
                                <div className="py-20 flex flex-col items-center justify-center space-y-6">
                                    <div className="relative">
                                        <div className="w-16 h-16 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
                                        <div className="absolute inset-0 w-16 h-16 border-4 border-purple-500/10 border-b-purple-500 rounded-full animate-spin-slow" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-amber-500 font-black uppercase tracking-[0.5em] text-[10px] animate-pulse">Decrypting Battle Records...</p>
                                        <p className="text-[8px] text-slate-500 uppercase font-bold mt-2 tracking-widest">Waks Corp High-Speed Uplink</p>
                                    </div>
                                </div>
                            ) : breakdownError ? (
                                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/20 mb-4 animate-bounce">
                                        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <h5 className="text-red-500 font-black uppercase tracking-[0.4em] text-xs">Tactical Feed Disrupted</h5>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest text-center max-w-xs">{breakdownError}</p>
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="mt-6 px-8 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-black rounded-xl text-[10px] font-black uppercase tracking-[0.3em] transition-all border border-red-500/20"
                                    >
                                        Attempt Reconnection
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                                        <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 hover:bg-white/[0.05] transition-all">
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.3em] mb-2">Hostile Neutralizations</p>
                                            <p className="text-3xl font-black text-white italic">{breakdown?.overall?.avgKills?.toFixed(1) || '0.0'}</p>
                                            <span className="text-[8px] text-amber-500/60 font-black uppercase tracking-widest mt-1 italic">Average per Mission</span>
                                        </div>
                                        <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 hover:bg-white/[0.05] transition-all">
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.3em] mb-2">Neural Efficiency</p>
                                            <p className={`text-3xl font-black italic ${getKDAColor(breakdown?.overall?.avgKda?.toFixed(2) || '0.00')}`}>{breakdown?.overall?.avgKda?.toFixed(2) || '0.00'}</p>
                                            <span className="text-[8px] text-amber-500/60 font-black uppercase tracking-widest mt-1 italic">Composite KDA Ratio</span>
                                        </div>
                                        <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 hover:bg-white/[0.05] transition-all">
                                            <p className="text-[8px] text-indigo-400 font-black uppercase tracking-[0.3em] mb-2">Combat Support</p>
                                            <p className="text-3xl font-black text-indigo-400 italic">{breakdown?.overall?.avgAssists?.toFixed(1) || '0.0'}</p>
                                            <span className="text-[8px] text-indigo-400/60 font-black uppercase tracking-widest mt-1 italic">Mission Influence</span>
                                        </div>
                                        <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 hover:bg-white/[0.05] transition-all">
                                            <p className="text-[8px] text-purple-400 font-black uppercase tracking-[0.3em] mb-2">Combat Score</p>
                                            <p className="text-3xl font-black text-purple-400 italic">{Math.round(breakdown?.overall?.avgAcs || 0)}</p>
                                            <span className="text-[8px] text-purple-400/60 font-black uppercase tracking-widest mt-1 italic">Average Combat Output</span>
                                        </div>
                                    </div>

                                    {/* Charts Section */}
                                    <div className="space-y-16">
                                        {/* Operator Affinity */}
                                        <div className="space-y-8">
                                            <div className="flex items-center space-x-4 text-amber-500">
                                                <div className="w-1.5 h-8 bg-amber-500 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.3)] animate-pulse" />
                                                <h4 className="text-sm font-black uppercase tracking-[0.4em] italic">Operator Affinity Matrix</h4>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {breakdown?.agents?.map((agent: any, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        onClick={() => setDetailView({ type: 'agent', name: agent.name })}
                                                        className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 hover:bg-amber-500/5 hover:border-amber-500/30 transition-all cursor-pointer group"
                                                    >
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <img
                                                                    src={`/assets/agents/${agent.name.replace('/', '_')}${agent.name === 'Veto' ? '.webp' : '.png'}`}
                                                                    className="w-10 h-10 object-contain drop-shadow-[0_0_5px_rgba(245,158,11,0.3)] group-hover:scale-110 transition-transform"
                                                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                                                />
                                                                <div>
                                                                    <p className="text-xs font-black text-white uppercase tracking-tight">{agent.name}</p>
                                                                    <p className="text-[7px] text-slate-500 font-black uppercase tracking-[0.2em]">{agent.role}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xs font-black text-amber-500 italic">{agent.kda?.toFixed(2)}</p>
                                                                <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">KDA</p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <div className="flex justify-between text-[7px] font-black uppercase tracking-widest">
                                                                <span className="text-slate-500">Pick Frequency</span>
                                                                <span className="text-white">{agent.matches} Ops</span>
                                                            </div>
                                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                                <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${Math.min(100, (agent.matches / (breakdown?.overall?.totalMatches || 1)) * 300)}%` }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Deployment Zones */}
                                        <div className="space-y-8">
                                            <div className="flex items-center space-x-4 text-emerald-500">
                                                <div className="w-1.5 h-8 bg-emerald-500 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.3)]" />
                                                <h4 className="text-sm font-black uppercase tracking-[0.4em] italic">Theater Proficiency</h4>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                {breakdown?.maps?.map((map: any, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        onClick={() => setDetailView({ type: 'map', name: map.name })}
                                                        className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all cursor-pointer text-center group"
                                                    >
                                                        <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">{map.name}</p>
                                                        <p className={`text-base font-black italic group-hover:text-emerald-500 transition-colors ${getKDAColor(map.kda?.toFixed(2))}`}>{map.kda?.toFixed(2)}</p>
                                                        <p className="text-[7px] text-slate-600 font-black uppercase tracking-tighter mt-1">{map.winRate}% Vic Rate</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Tactical Archive */}
                                        <div className="space-y-8">
                                            <div className="flex items-center space-x-4 text-rose-400">
                                                <div className="w-1.5 h-8 bg-rose-400 rounded-full shadow-[0_0_20px_rgba(251,113,133,0.3)]" />
                                                <h4 className="text-sm font-black uppercase tracking-[0.4em] italic">Class Proficiency</h4>
                                            </div>
                                            {breakdown?.roles?.length > 0 ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {breakdown.roles.map((role: any, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setDetailView({ type: 'role', name: role.name })}
                                                            className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:bg-rose-500/5 hover:border-rose-400/30 transition-all cursor-pointer group"
                                                        >
                                                            <div className="flex items-center justify-between mb-4">
                                                                <div>
                                                                    <p className="text-xs font-black text-white uppercase italic">{role.name}</p>
                                                                    <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest mt-0.5">{role.matches} Ops</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className={`text-sm font-black italic ${getKDAColor(role.kda?.toFixed(2))}`}>{role.kda?.toFixed(2)}</p>
                                                                    <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">KDA</p>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between text-[7px] font-black uppercase tracking-widest">
                                                                    <span className="text-slate-500">Win Rate</span>
                                                                    <span className={role.winRate >= 50 ? 'text-emerald-500' : 'text-red-400'}>{role.winRate}%</span>
                                                                </div>
                                                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                                    <div className={`h-full rounded-full transition-all duration-1000 ${role.winRate >= 50 ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${role.winRate}%` }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest text-center py-6">No role data recorded</p>
                                            )}
                                        </div>

                                        {/* Engagement Archive */}
                                        <div className="space-y-8">
                                            <div className="flex items-center space-x-4 text-purple-400">
                                                <div className="w-1.5 h-8 bg-purple-400 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)]" />
                                                <h4 className="text-sm font-black uppercase tracking-[0.4em] italic">Engagement Archive</h4>
                                            </div>
                                            <div className="space-y-3">
                                                {breakdown?.history?.slice(0, 10).map((s: any, idx: number) => (
                                                    <div
                                                        key={idx}
                                                        onClick={() => setSelectedMatchForStats(s)}
                                                        className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 flex items-center justify-between hover:bg-white/[0.05] transition-all cursor-pointer group"
                                                    >
                                                        <div className="flex items-center gap-6">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] ${s.isWin ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                                {s.isWin ? 'WIN' : 'LOSS'}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-black text-white uppercase italic">vs {s.opponent}</p>
                                                                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">{new Date(s.date).toLocaleDateString()}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-8 text-right pr-4">
                                                            <div>
                                                                <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Theater</p>
                                                                <p className="text-[10px] font-black text-white uppercase">{s.map}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest mb-0.5">Registry</p>
                                                                <p className="text-[10px] font-black text-amber-500 italic">{s.kills}/{s.deaths}/{s.assists}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Nested Detail View Modal */}
            <Modal
                isOpen={!!detailView}
                onClose={() => setDetailView(null)}
                zIndex={4000}
                backdropClassName="bg-black/90 backdrop-blur-3xl animate-in fade-in duration-500"
                className="w-full max-w-4xl p-4 md:p-6"
            >
                {detailView && (
                    <div className="relative w-full bg-[#020617]/95 backdrop-blur-3xl rounded-[40px] md:rounded-[56px] border border-amber-500/30 shadow-[0_0_150px_rgba(245,158,11,0.2)] overflow-hidden flex flex-col p-8 md:p-12 animate-in zoom-in-95 duration-500 max-h-[85vh] overflow-y-auto custom-scrollbar">
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/[0.05] blur-[150px] rounded-full pointer-events-none" />
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 relative z-10">
                            <button
                                onClick={() => setDetailView(null)}
                                className="w-fit px-6 py-3.5 bg-white/5 hover:bg-amber-500 text-slate-400 hover:text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-3 transition-all border border-white/5 hover:border-amber-500 active:scale-95 shadow-2xl group/back"
                            >
                                <svg className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                                Retract Intel
                            </button>
                            <div className="text-left md:text-right space-y-1">
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.5em]">{detailView.type} Operational Archives</p>
                                <div className="flex items-center md:justify-end gap-4">
                                    {detailView.type === 'agent' && (
                                        <img
                                            src={`/assets/agents/${detailView.name.replace('/', '_')}${detailView.name === 'Veto' ? '.webp' : '.png'}`}
                                            alt={detailView.name}
                                            className="w-12 h-12 md:w-16 md:h-16 object-contain drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    )}
                                    <h4 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter italic leading-none">{detailView.name}</h4>
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow space-y-8 relative z-10">
                            <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 md:p-10">
                                <div className="flex items-center space-x-4 text-amber-500 mb-8">
                                    <div className="w-1.5 h-8 bg-amber-500 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.5)] animate-pulse" />
                                    <h4 className="text-xs md:text-sm font-black uppercase tracking-[0.4em] italic">Historical Performance Trajectory</h4>
                                </div>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={getDetailData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorKdDetail" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="date" stroke="#475569" fontSize={10} tickFormatter={(str) => {
                                                const d = new Date(str);
                                                return `${d.getMonth() + 1}/${d.getDate()}`;
                                            }} />
                                            <YAxis stroke="#475569" fontSize={10} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#020617', borderColor: '#fbbf2433', borderRadius: '16px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                                                itemStyle={{ color: '#fbbf24' }}
                                                labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                                                labelFormatter={(label) => `Timestamp: ${label}`}
                                                formatter={(value, name) => [value, 'KDA Ratio']}
                                            />
                                            <Area type="monotone" dataKey="kd" stroke="#fbbf24" strokeWidth={4} fillOpacity={1} fill="url(#colorKdDetail)" activeDot={{ r: 8, strokeWidth: 0, fill: '#fbbf24' }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {detailView.type === 'role' && (
                                <div className="space-y-4 pt-4">
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] pl-4">Combat Ready Operatives</p>
                                    <div className="flex flex-wrap gap-3">
                                        {getAgentsInRole().map((agent, idx) => (
                                            <span key={idx} className="px-5 py-2.5 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black text-amber-500/80 uppercase tracking-widest italic group hover:bg-amber-500/10 hover:border-amber-500/30 transition-all">{agent}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Match List in Details */}
                            <div className="space-y-6 pt-8">
                                <div className="flex items-center space-x-4 text-amber-500">
                                    <div className="w-1.5 h-8 bg-amber-500 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.4)]" />
                                    <h4 className="text-xs md:text-sm font-black uppercase tracking-[0.4em] italic">Mission History Intelligence</h4>
                                </div>
                                <div className="space-y-4">
                                    {breakdown?.history
                                        ?.filter((s: any) => {
                                            if (detailView.type === 'agent') return s.agent === detailView.name;
                                            if (detailView.type === 'role') return s.role === detailView.name;
                                            if (detailView.type === 'map') return s.map === detailView.name;
                                            return false;
                                        })
                                        .slice(0, 8)
                                        .map((s: any, idx: number) => (
                                            <div
                                                key={idx}
                                                onClick={() => handleMatchClick(s)}
                                                className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-amber-500/5 hover:border-amber-500/20 transition-all cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[8px] ${s.isWin ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                        {s.isWin ? 'W' : 'L'}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-white uppercase">vs {s.opponent}</p>
                                                        <p className="text-[7px] text-slate-500 font-bold uppercase tracking-widest">{new Date(s.date).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${s.type === 'tournament' ? 'bg-purple-500/10 text-purple-400' : 'bg-amber-500/10 text-amber-500'}`}>
                                                        {s.type === 'tournament' ? 'TOURN' : 'SCRIM'}
                                                    </span>
                                                    <div className="text-right">
                                                        <p className="text-[10px] font-black text-amber-500 italic">{s.kills}/{s.deaths}/{s.assists}</p>
                                                        <p className="text-[7px] text-slate-500 font-black uppercase tracking-widest">{s.map}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Nested Match Intel Modal */}
            <Modal
                isOpen={!!matchIntelDetail}
                onClose={() => setMatchIntelDetail(null)}
                zIndex={4005}
                backdropClassName="bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500"
                className="w-full max-w-2xl p-4 md:p-6"
            >
                {matchIntelDetail && (
                    <div className="relative w-full bg-[#020617]/95 backdrop-blur-3xl rounded-[40px] border border-amber-500/30 shadow-2xl overflow-hidden p-8 md:p-10 animate-in zoom-in-95 duration-500 max-h-[80vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-start mb-8">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.4em]">Tactical Match Report</p>
                                <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter">vs {matchIntelDetail.opponent}</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{new Date(matchIntelDetail.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                            </div>
                            <button onClick={() => setMatchIntelDetail(null)} className="text-slate-500 hover:text-white transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 text-center">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Theater</p>
                                    <p className="text-sm font-black text-white uppercase italic">{matchIntelDetail.map}</p>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 text-center">
                                    <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Status</p>
                                    <p className={`text-sm font-black uppercase italic ${matchIntelDetail.isWin ? 'text-emerald-500' : 'text-red-500'}`}>{matchIntelDetail.isWin ? 'VICTORY' : 'DEFEAT'}</p>
                                </div>
                            </div>

                            <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={`/assets/agents/${(matchIntelDetail.agent || '').replace('/', '_')}${matchIntelDetail.agent === 'Veto' ? '.webp' : '.png'}`}
                                            className="w-10 h-10 object-contain drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                        <div>
                                            <p className="text-xs font-black text-white uppercase">{matchIntelDetail.agent}</p>
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">{matchIntelDetail.role}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-black text-amber-500 italic">{matchIntelDetail.kills}/{matchIntelDetail.deaths}/{matchIntelDetail.assists}</p>
                                        <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">KDA Registry</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Performance Metrics</p>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] font-black uppercase">
                                                <span className="text-slate-400">ACS</span>
                                                <span className="text-purple-400">{matchIntelDetail.acs || 0}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px] font-black uppercase">
                                                <span className="text-slate-400">ADR</span>
                                                <span className="text-amber-500">{matchIntelDetail.adr || 0}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {matchIntelError && (
                                <div className="py-10 flex flex-col items-center justify-center space-y-3 text-center bg-red-500/5 border border-red-500/10 rounded-2xl">
                                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-[10px] text-red-400 font-black uppercase tracking-widest">{matchIntelError}</p>
                                </div>
                            )}

                            {matchIntelDetail.details && (
                                <div className="space-y-4">
                                    {/* Map Result for this specific map */}
                                    {(() => {
                                        const raw = matchIntelDetail.details?.scrim?.results || matchIntelDetail.details?.scrim?.maps;
                                        let mapResults: any[] = [];
                                        if (raw) { try { mapResults = JSON.parse(raw); } catch { } }
                                        const thisMap = matchIntelDetail.map;
                                        const filtered = thisMap
                                            ? mapResults.filter((r: any) => String(r.mapName || r.map || '').toLowerCase() === thisMap.toLowerCase())
                                            : mapResults;
                                        if (filtered.length === 0) return null;
                                        return (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 text-indigo-400">
                                                    <div className="w-1.5 h-5 bg-indigo-400 rounded-full" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">Map Result</p>
                                                </div>
                                                {filtered.map((r: any, i: number) => {
                                                    const score = r.score || '';
                                                    const won = r.isVictory === true || (typeof score === 'string' && (() => { const [a, b] = score.split('-').map(Number); return !isNaN(a) && !isNaN(b) && a > b; })());
                                                    const lost = r.isVictory === false || (typeof score === 'string' && (() => { const [a, b] = score.split('-').map(Number); return !isNaN(a) && !isNaN(b) && a < b; })());
                                                    return (
                                                        <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border ${won ? 'bg-emerald-500/5 border-emerald-500/20' : lost ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/5'}`}>
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[8px] ${won ? 'bg-emerald-500/20 text-emerald-500' : lost ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-slate-400'}`}>
                                                                    {won ? 'W' : lost ? 'L' : 'D'}
                                                                </div>
                                                                <p className="text-xs font-black text-white uppercase italic">{thisMap}</p>
                                                            </div>
                                                            {score && <p className="text-sm font-black text-amber-500 italic">{score}</p>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}

                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Team Deployment Registry</p>
                                    <div className="space-y-2">
                                        {(matchIntelDetail.details?.stats || matchIntelDetail.details || []).filter((st: any) =>
                                            !matchIntelDetail.map || st.map === matchIntelDetail.map
                                        ).map((st: any, i: number) => (
                                            <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${st.playerId === player.id ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/5'}`}>
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={`/assets/agents/${(st.agent || '').replace('/', '_')}${st.agent === 'Veto' ? '.webp' : '.png'}`}
                                                        className="w-6 h-6 object-contain"
                                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                                    />
                                                    <span className="text-xs font-black text-white uppercase">{st.playerName || st.name}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-[10px] font-black text-slate-400">{st.kills}/{st.deaths}/{st.assists}</span>
                                                    <span className="text-[10px] font-black text-amber-500 w-8 text-right">{st.acs}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setMatchIntelDetail(null)}
                            className="w-full mt-8 py-4 bg-amber-500 text-black font-black uppercase tracking-[0.4em] text-[10px] rounded-2xl hover:bg-amber-400 transition-all active:scale-95 shadow-xl shadow-amber-500/20"
                        >
                            Return to Archives
                        </button>
                    </div>
                )}
            </Modal>

            {/* Engagement Analysis Modal (from breakdown history) */}
            <Modal isOpen={!!selectedMatchForStats} onClose={() => setSelectedMatchForStats(null)} zIndex={4000} backdropClassName="bg-black/95 backdrop-blur-3xl" className="w-full max-w-4xl p-4">
                {selectedMatchForStats && (
                    <div className="bg-[#020617] p-8 md:p-12 rounded-[40px] shadow-2xl w-full max-h-[85vh] overflow-y-auto custom-scrollbar border border-white/10 relative overflow-hidden animate-in zoom-in-95 duration-500">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />

                        <div className="relative z-10 space-y-8">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter">Engagement Analysis</h3>
                                    <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.4em] mt-2">
                                        vs {selectedMatchForStats.opponent} • {new Date(selectedMatchForStats.date).toLocaleDateString()} • {selectedMatchForStats.map}
                                    </p>
                                </div>
                                <button onClick={() => setSelectedMatchForStats(null)} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-all">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            {loadingDetails ? (
                                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                                    <div className="w-12 h-12 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
                                    <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest">Retrieving Neural Archives...</p>
                                </div>
                            ) : matchDetailsError ? (
                                <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
                                    <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <p className="text-[10px] text-red-400 font-black uppercase tracking-widest">{matchDetailsError}</p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Theater</p>
                                            <p className="text-xs font-black text-white uppercase">{selectedMatchForStats.map}</p>
                                        </div>
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">K/D/A</p>
                                            <p className="text-xs font-black text-amber-500">{selectedMatchForStats.kills}/{selectedMatchForStats.deaths}/{selectedMatchForStats.assists}</p>
                                        </div>
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Score</p>
                                            <p className="text-xs font-black text-purple-400">{selectedMatchForStats.acs || 0} ACS</p>
                                        </div>
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                            <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Outcome</p>
                                            <p className={`text-xs font-black uppercase ${selectedMatchForStats.isWin ? 'text-emerald-500' : 'text-red-500'}`}>{selectedMatchForStats.isWin ? 'VICTORY' : 'DEFEAT'}</p>
                                        </div>
                                    </div>

                                    {/* Map Result for this specific map */}
                                    {(() => {
                                        const matchResultsRaw = matchDetails?.scrim?.results || matchDetails?.scrim?.maps;
                                        let mapResults: any[] = [];
                                        if (matchResultsRaw) {
                                            try { mapResults = JSON.parse(matchResultsRaw); } catch { }
                                        }
                                        // Only show the result for the specific map played
                                        const thisMap = selectedMatchForStats.map;
                                        const filtered = thisMap
                                            ? mapResults.filter((r: any) => String(r.mapName || r.map || '').toLowerCase() === thisMap.toLowerCase())
                                            : mapResults;
                                        if (filtered.length === 0) return null;
                                        return (
                                            <div className="space-y-4">
                                                <div className="flex items-center space-x-4 text-indigo-400">
                                                    <div className="w-1.5 h-6 bg-indigo-400 rounded-full" />
                                                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">Map Result</p>
                                                </div>
                                                <div className="grid gap-3">
                                                    {filtered.map((r: any, i: number) => {
                                                        const mapName = r.mapName || r.map || thisMap || `Map ${i + 1}`;
                                                        const score = r.score || '';
                                                        const won = r.isVictory === true || (typeof score === 'string' && (() => { const [a, b] = score.split('-').map(Number); return !isNaN(a) && !isNaN(b) && a > b; })());
                                                        const lost = r.isVictory === false || (typeof score === 'string' && (() => { const [a, b] = score.split('-').map(Number); return !isNaN(a) && !isNaN(b) && a < b; })());
                                                        return (
                                                            <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border ${won ? 'bg-emerald-500/5 border-emerald-500/20' : lost ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/5'}`}>
                                                                <div className="flex items-center gap-4">
                                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[8px] ${won ? 'bg-emerald-500/20 text-emerald-500' : lost ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-slate-400'}`}>
                                                                        {won ? 'W' : lost ? 'L' : 'D'}
                                                                    </div>
                                                                    <p className="text-xs font-black text-white uppercase italic">{mapName}</p>
                                                                </div>
                                                                {score && <p className="text-sm font-black text-amber-500 italic">{score}</p>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {matchDetails?.stats?.filter((st: any) => !selectedMatchForStats.map || st.map === selectedMatchForStats.map).length > 0 && (
                                        <div className="bg-white/[0.02] rounded-3xl border border-white/5 overflow-hidden">
                                            <div className="p-5 border-b border-white/5 bg-white/[0.01]">
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Combat Registry Details</p>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-white/[0.01]">
                                                            <th className="px-6 py-4 text-[8px] font-black text-slate-600 uppercase tracking-widest">Operator</th>
                                                            <th className="px-6 py-4 text-[8px] font-black text-slate-600 uppercase tracking-widest text-center">K/D/A</th>
                                                            <th className="px-6 py-4 text-[8px] font-black text-slate-600 uppercase tracking-widest text-center">ACS</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5">
                                                        {(matchDetails?.stats || []).filter((st: any) => !selectedMatchForStats.map || st.map === selectedMatchForStats.map).map((st: any, i: number) => (
                                                            <tr key={i} className={st.playerId === player.id ? 'bg-amber-500/5' : ''}>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <img
                                                                            src={`/assets/agents/${(st.agent || '').replace('/', '_')}${st.agent === 'Veto' ? '.webp' : '.png'}`}
                                                                            className="w-6 h-6 object-contain"
                                                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                                                        />
                                                                        <span className="text-xs font-black text-white uppercase">{st.playerName || st.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <span className="text-xs font-black text-slate-400">{st.kills}/{st.deaths}/{st.assists}</span>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <span className="text-xs font-black text-purple-400">{st.acs || 0}</span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setSelectedMatchForStats(null)}
                                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] transition-all border border-white/5"
                                    >
                                        Retract Analysis
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
};

export default PlayerStatsModal;
