import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';
import Modal from './Modal';
import { GAME_TITLES, GAME_MAPS, VALORANT_AGENTS } from './constants';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface Strat {
    id: number;
    teamId: number;
    title: string;
    game: string;
    map: string;
    side: string;
    role: string | null;
    content: string;
    videoUrl: string | null;
    authorId: number;
    createdAt: string;
}

interface Team {
    id: number;
    name: string;
    game: string;
}

const Playbook: React.FC<{ userRole?: string; userId?: number; lockedTeamId?: number; onBack?: () => void }> = ({ userRole, userId, lockedTeamId, onBack }) => {
    const isManagement = ['manager', 'coach', 'admin', 'ceo'].some(r => userRole?.toLowerCase().includes(r));
    const isPlayer = userRole?.toLowerCase() === 'player';
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<number | ''>(lockedTeamId || '');
    const [strats, setStrats] = useState<Strat[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [copyTargetTeamId, setCopyTargetTeamId] = useState<number | ''>('');

    // Filtering
    const [filterGame, setFilterGame] = useState('');
    const [filterMap, setFilterMap] = useState('');
    const [filterSide, setFilterSide] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Modals
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [selectedStrat, setSelectedStrat] = useState<Strat | null>(null);

    // Editor State
    const [editId, setEditId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [game, setGame] = useState('');
    const [map, setMap] = useState('');
    const [side, setSide] = useState('');
    const [role, setRole] = useState('');
    const [content, setContent] = useState('');
    const [videoUrl, setVideoUrl] = useState('');

    const { showNotification } = useNotification();

    // Fetch teams user manages or is part of
    const fetchTeams = async () => {
        try {
            // If manager or coach, fetch teams they manage/assist. If player, fetch teams they are in.
            const isManagement = ['manager', 'coach', 'admin', 'ceo'].some(r => userRole?.includes(r));
            let url = `${GET_API_BASE_URL()}/api/teams`;

            if (userId && !['admin', 'ceo'].some(r => userRole?.includes(r))) {
                url += `?requesterId=${userId}`;
            }

            const res = await fetch(url);
            const result = await res.json();
            if (result.success) {
                setTeams(result.data);
                if (!selectedTeamId && result.data.length > 0) {
                    setSelectedTeamId(result.data[0].id);
                }
            }
        } catch (err) {
            console.error("Failed to fetch teams", err);
        }
    };

    useEffect(() => {
        fetchTeams();
    }, [userRole, userId, lockedTeamId]);

    const fetchStrats = async (teamId: number) => {
        if (!teamId) return;
        setLoading(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams/${teamId}/playbook?requesterId=${userId}`);
            const result = await res.json();
            if (result.success) {
                setStrats(result.data);
            } else {
                showNotification({ message: result.error || 'Failed to sync strategies', type: 'error' });
            }
        } catch (err) {
            console.error("Failed to fetch playbook", err);
            showNotification({ message: 'Strategy Server Unreachable', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedTeamId && userId) {
            fetchStrats(selectedTeamId as number);
        } else {
            setStrats([]);
        }

        const handleRefresh = () => {
            console.log("[PLAYBOOK] Real-time sync triggered");
            fetchTeams();
            if (selectedTeamId) {
                fetchStrats(selectedTeamId as number);
            }
        };

        window.addEventListener('nxc-db-refresh', handleRefresh);
        return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
    }, [selectedTeamId, userId]);

    const handleSaveStrat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTeamId || !userId) return;
        setSaving(true);

        try {
            const payload = {
                title, game, map, side,
                role: role || undefined,
                content,
                videoUrl: videoUrl || undefined,
                authorId: userId,
                requesterId: userId
            };

            let res;
            if (editId) {
                res = await fetch(`${GET_API_BASE_URL()}/api/playbook/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch(`${GET_API_BASE_URL()}/api/teams/${selectedTeamId}/playbook`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            const result = await res.json();
            if (result.success) {
                showNotification({ message: editId ? 'Strategy Updated' : 'Strategy Uploaded', type: 'success' });
                setIsEditorOpen(false);
                fetchStrats(selectedTeamId as number);
            } else {
                showNotification({ message: result.error || 'Failed to save', type: 'error' });
            }
        } catch (err) {
            console.error(err);
            showNotification({ message: 'Upload Failed: Connection Error', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteStrat = async (id: number) => {
        if (!confirm('Are you sure you want to purge this strategy from the database?')) return;
        setSaving(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/playbook/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterId: userId })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({ message: 'Strategy Purged', type: 'success' });
                fetchStrats(selectedTeamId as number);
                setSelectedStrat(null);
            } else {
                showNotification({ message: result.error || 'Purge Denied', type: 'error' });
            }
        } catch (err) {
            console.error(err);
            showNotification({ message: 'Purge Failed: Protocol Error', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleCopyStrat = async (stratId: number) => {
        if (!copyTargetTeamId) {
            showNotification({ message: 'Select a target squad first', type: 'error' });
            return;
        }
        setSaving(true);

        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/playbook/${stratId}/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetTeamId: copyTargetTeamId,
                    requesterId: userId
                })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({ message: 'Stratagem Duplicated', type: 'success' });
                setIsCopying(false);
                setCopyTargetTeamId('');
            } else {
                showNotification({ message: result.error || 'Duplication Failed', type: 'error' });
            }
        } catch (err) {
            console.error(err);
            showNotification({ message: 'Sync Error: Target unreachable', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const openEditor = (strat?: Strat) => {
        if (strat) {
            setEditId(strat.id);
            setTitle(strat.title);
            setGame(strat.game);
            setMap(strat.map);
            setSide(strat.side);
            setRole(strat.role || '');
            setContent(strat.content);
            setVideoUrl(strat.videoUrl || '');
        } else {
            setEditId(null);
            setTitle('');
            setGame(teams.find(t => t.id === selectedTeamId)?.game || '');
            setMap('');
            setSide('');
            setRole('');
            setContent('');
            setVideoUrl('');
        }
        setIsEditorOpen(true);
    };

    const filteredStrats = strats.filter(s => {
        if (filterGame && s.game !== filterGame) return false;
        if (filterMap && s.map !== filterMap) return false;
        if (filterSide && s.side !== filterSide) return false;
        if (searchQuery && !s.title.toLowerCase().includes(searchQuery.toLowerCase()) && !s.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="min-h-screen bg-[var(--bg-color)] p-6 md:p-12 transition-colors relative overflow-hidden">
            {/* Background FX */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-fuchsia-500/5 blur-[120px]" />
                <div className="absolute bottom-1/4 right-1/4 w-[800px] h-[800px] rounded-full bg-amber-500/5 blur-[150px]" />
                <div
                    className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
                    style={{ backgroundImage: 'radial-gradient(circle at center, var(--text-color) 1px, transparent 1px)', backgroundSize: '48px 48px' }}
                />
            </div>

            <div className="max-w-7xl mx-auto relative z-10">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
                    <div className="flex items-center space-x-6">
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="p-3 md:p-4 bg-white/5 hover:bg-fuchsia-500/10 text-slate-400 hover:text-fuchsia-500 rounded-2xl transition-all border border-white/10 shadow-lg active:scale-95"
                            >
                                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                        )}
                        <div>
                            <h1 className="text-3xl md:text-5xl font-black text-[var(--text-color)] tracking-tighter uppercase italic leading-none flex items-center gap-4">
                                Strategy Playbook
                                <span className="px-3 py-1 bg-fuchsia-500/10 text-fuchsia-500 border border-fuchsia-500/20 text-xs rounded-xl tracking-widest font-black uppercase not-italic">Encrypted</span>
                            </h1>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-2 ml-1">Secure Tactical Repository // Level 4 Clearance</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto">
                        {!lockedTeamId && (
                            <div className="relative group w-full md:w-64">
                                <select
                                    value={selectedTeamId}
                                    onChange={e => setSelectedTeamId(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="w-full bg-black/40 glass border border-white/10 rounded-2xl px-6 py-4 text-[10px] font-black uppercase tracking-widest text-white focus:outline-none focus:border-fuchsia-500/50 transition-all appearance-none cursor-pointer shadow-xl"
                                >
                                    <option value="" disabled className="bg-white dark:bg-[#020617]">-- SELECT UNIT --</option>
                                    {teams.map(t => <option key={t.id} value={t.id} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">{t.name.toUpperCase()}</option>)}
                                </select>
                            </div>
                        )}

                        {isManagement && (
                            <button
                                onClick={() => openEditor()}
                                disabled={!selectedTeamId || saving}
                                className="whitespace-nowrap px-8 py-4 bg-fuchsia-500 hover:bg-fuchsia-400 text-black font-black uppercase tracking-widest text-[10px] md:text-xs rounded-2xl shadow-[0_0_30px_rgba(217,70,239,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                            >
                                {saving ? 'Processing...' : '+ New Strat'}
                            </button>
                        )}
                    </div>
                </div>

                {selectedTeamId ? (
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Sidebar Filters */}
                        <div className="w-full lg:w-64 shrink-0 space-y-6">
                            <div className="glass backdrop-blur-xl border border-white/5 rounded-[32px] p-6 shadow-2xl">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-200 dark:border-white/5 pb-4">Filter Protocols</h3>

                                <div className="space-y-6">
                                    <div>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Keyword Search..."
                                                value={searchQuery}
                                                onChange={e => setSearchQuery(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-[#020617]/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold tracking-wider text-[var(--text-color)] focus:outline-none focus:border-fuchsia-500/50 transition-all placeholder:text-slate-400"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Game</label>
                                        <select value={filterGame} onChange={e => setFilterGame(e.target.value)} className="w-full bg-slate-50 dark:bg-[#020617]/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold tracking-wider focus:outline-none focus:border-fuchsia-500/50 transition-all appearance-none cursor-pointer">
                                            <option value="">Any Simulator</option>
                                            {GAME_TITLES.map(g => <option key={g} value={g} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">{g}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Map</label>
                                        <select value={filterMap} onChange={e => setFilterMap(e.target.value)} className="w-full bg-slate-50 dark:bg-[#020617]/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold tracking-wider focus:outline-none focus:border-fuchsia-500/50 transition-all appearance-none cursor-pointer">
                                            {(filterGame ? GAME_MAPS[filterGame] || [] : Object.values(GAME_MAPS).flat().sort().filter((v, i, a) => a.indexOf(v) === i)).map(m => <option key={m} value={m} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">{m}</option>)}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Side</label>
                                        <div className="flex bg-slate-50 dark:bg-[#020617]/40 border border-slate-200 dark:border-white/10 rounded-xl p-1 overflow-hidden">
                                            <button onClick={() => setFilterSide('')} className={`flex-1 text-[8px] font-black uppercase tracking-widest py-2 rounded-lg transition-all ${filterSide === '' ? 'bg-white dark:bg-black shadow text-[var(--text-color)]' : 'text-slate-500 hover:text-white'}`}>All</button>
                                            <button onClick={() => setFilterSide('Attack')} className={`flex-1 text-[8px] font-black uppercase tracking-widest py-2 rounded-lg transition-all ${filterSide === 'Attack' ? 'bg-amber-500 text-black shadow' : 'text-slate-500 hover:text-white'}`}>ATK</button>
                                            <button onClick={() => setFilterSide('Defense')} className={`flex-1 text-[8px] font-black uppercase tracking-widest py-2 rounded-lg transition-all ${filterSide === 'Defense' ? 'bg-emerald-500 text-black shadow' : 'text-slate-500 hover:text-white'}`}>DEF</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                                    <div className="w-12 h-12 border-4 border-fuchsia-500/20 border-t-fuchsia-500 rounded-full animate-spin" />
                                    <p className="text-[10px] text-fuchsia-500 font-black uppercase tracking-widest animate-pulse">Decrypting Stratagem Data...</p>
                                </div>
                            ) : filteredStrats.length === 0 ? (
                                <div className="bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-[40px] p-20 flex flex-col items-center text-center shadow-2xl">
                                    <div className="w-24 h-24 mb-6 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-300 dark:text-slate-700">
                                        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    </div>
                                    <h3 className="text-xl font-black text-[var(--text-color)] tracking-tight uppercase mb-2">No Strategies Found</h3>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest max-w-sm">The playbook is currently empty or no data matches your filter parameters.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-h-[900px] overflow-y-auto pr-4 custom-scrollbar-fuchsia">
                                    {filteredStrats.map(strat => (
                                        <div
                                            key={strat.id}
                                            onClick={() => setSelectedStrat(strat)}
                                            className="group bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-[32px] p-6 hover:border-fuchsia-500/50 cursor-pointer transition-all shadow-xl hover:shadow-[0_20px_40px_-15px_rgba(217,70,239,0.2)] active:scale-[0.98] relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/5 blur-2xl group-hover:bg-fuchsia-500/20 transition-all rounded-full" />

                                            <div className="flex justify-between items-start mb-4 relative z-10">
                                                <h4 className="text-lg md:text-xl font-black uppercase tracking-tight text-[var(--text-color)] group-hover:text-fuchsia-500 transition-colors pr-4">{strat.title}</h4>
                                                <div className="flex items-center gap-2">
                                                    <div className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg shrink-0 ${strat.side === 'Attack' ? 'bg-amber-500/10 text-amber-500' : strat.side === 'Defense' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                                                        {strat.side || 'Neutral'}
                                                    </div>
                                                    {isManagement && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteStrat(strat.id);
                                                            }}
                                                            disabled={saving}
                                                            className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all border border-red-500/10 disabled:opacity-50"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-2 mb-6 relative z-10">
                                                <div className="flex items-center text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                                                    <svg className="w-3.5 h-3.5 mr-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                    {strat.map || 'Unknown Vector'}
                                                    {strat.role && <><span className="mx-2">•</span><span className="text-indigo-400">{strat.role}</span></>}
                                                </div>
                                            </div>

                                            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 md:line-clamp-3 mb-6 relative z-10 font-medium">
                                                {strat.content.substring(0, 120)}...
                                            </p>

                                            <div className="flex items-center justify-between text-[8px] text-slate-400 font-black uppercase tracking-widest border-t border-slate-200 dark:border-white/5 pt-4 relative z-10">
                                                <div className="flex items-center">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mr-2" />
                                                    {new Date(strat.createdAt).toLocaleDateString()}
                                                </div>
                                                {strat.videoUrl && (
                                                    <span className="flex items-center text-blue-400">
                                                        <svg className="w-3 h-3 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                        VOD Attached
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-[50vh] flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300 dark:text-slate-700">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Select a Unit to Access Playbook</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Editor Modal */}
            <Modal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} zIndex={100} backdropClassName="bg-black/80 backdrop-blur-md" className="w-[95%] max-w-4xl">
                <div className="glass backdrop-blur-3xl rounded-[40px] md:rounded-[48px] border border-white/10 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-fuchsia-500/0 via-fuchsia-500 to-fuchsia-500/0" />

                    <div className="p-6 md:p-10 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl md:text-3xl font-black text-[var(--text-color)] uppercase tracking-tight flex items-center">
                                <div className="w-3 h-3 bg-fuchsia-500 rounded-full mr-4 shadow-[0_0_15px_rgba(217,70,239,0.5)]" />
                                {editId ? 'Modify Stratagem' : 'Draft New Stratagem'}
                            </h2>
                        </div>
                        <button onClick={() => setIsEditorOpen(false)} className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-fuchsia-500 transition-all">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <form onSubmit={handleSaveStrat} className="p-6 md:p-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">
                            {/* Title */}
                            <div className="md:col-span-2">
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-fuchsia-500 mb-2">Operation Code Name</label>
                                <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Ascent A Split Execute" className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm font-black tracking-tight text-[var(--text-color)] focus:outline-none focus:border-fuchsia-500/50 transition-all placeholder:text-slate-400" />
                            </div>

                            <div>
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 mb-2">Simulator</label>
                                <select required value={game} onChange={e => setGame(e.target.value)} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-xs font-bold tracking-widest text-[var(--text-color)] focus:outline-none focus:border-fuchsia-500/50 transition-all appearance-none cursor-pointer">
                                    <option value="">-- Select Simulator --</option>
                                    {GAME_TITLES.map(g => <option key={g} value={g} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">{g}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 mb-2">Combat Sector</label>
                                <select required value={map} onChange={e => setMap(e.target.value)} className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-xs font-bold tracking-widest text-[var(--text-color)] focus:outline-none focus:border-fuchsia-500/50 transition-all appearance-none cursor-pointer">
                                    <option value="">-- Select SEC --</option>
                                    {(GAME_MAPS[game || "Valorant"] || []).map(m => <option key={m} value={m} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">{m}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 mb-2">Assigned Agent / Role</label>
                                {(game === 'Valorant' || game === 'Valorant Mobile') ? (
                                    <select
                                        value={role}
                                        onChange={e => setRole(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-xs font-bold tracking-widest text-[var(--text-color)] focus:outline-none focus:border-fuchsia-500/50 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="">-- Select Agent --</option>
                                        {VALORANT_AGENTS.map(a => <option key={a} value={a} className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">{a.toUpperCase()}</option>)}
                                    </select>
                                ) : (
                                    <input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Initiator / Sova" className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-xs font-bold tracking-widest text-[var(--text-color)] focus:outline-none focus:border-fuchsia-500/50 transition-all placeholder:text-slate-400" />
                                )}
                            </div>

                            <div>
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 mb-2">Engagement Side</label>
                                <select
                                    required
                                    value={side}
                                    onChange={e => setSide(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-xs font-bold tracking-widest text-[var(--text-color)] focus:outline-none focus:border-fuchsia-500/50 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="" className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">-- Assignment --</option>
                                    <option value="Attack" className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">Attack</option>
                                    <option value="Defense" className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">Defense</option>
                                    <option value="Neutral" className="bg-white dark:bg-[#020617] text-slate-900 dark:text-white">Neutral / Default</option>
                                </select>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 mb-2 flex justify-between">
                                    <span>Tactical Directives (Markdown Supported)</span>
                                </label>
                                <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-[24px] overflow-hidden focus-within:border-fuchsia-500/50 transition-all shadow-inner">
                                    <textarea
                                        required
                                        rows={10}
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        className="w-full bg-transparent p-6 text-sm font-medium leading-relaxed text-[var(--text-color)] focus:outline-none resize-y custom-scrollbar"
                                        placeholder="# Outline the protocol..."
                                        style={{ fontFamily: 'monospace' }} /* Monospace for Markdown feel */
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-blue-500 mb-2">VOD Reference URL (Optional)</label>
                                <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/..." className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 text-sm font-black tracking-tight text-[var(--text-color)] focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-400" />
                            </div>
                        </div>

                        <div className="flex gap-4 border-t border-slate-200 dark:border-white/5 pt-8">
                            <button type="submit" disabled={saving} className="flex-1 py-4 bg-fuchsia-500 hover:bg-fuchsia-400 text-black text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-fuchsia-500/20 disabled:opacity-50">
                                {saving ? 'Synchronizing...' : (editId ? 'Apply Update' : 'Deploy Stratagem')}
                            </button>
                            <button type="button" onClick={() => setIsEditorOpen(false)} className="px-8 py-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-[var(--text-color)] text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            {/* Detail Modal */}
            <Modal isOpen={!!selectedStrat} onClose={() => setSelectedStrat(null)} zIndex={90} backdropClassName="bg-black/40 backdrop-blur-sm" className="w-[95%] max-w-5xl">
                {selectedStrat && <div className="glass rounded-[40px] border border-white/10 shadow-[0_32px_128px_-10px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-300">

                    {/* Header */}
                    <div className={`p-8 md:p-12 relative overflow-hidden ${selectedStrat.side === 'Attack' ? 'bg-amber-500/10' : selectedStrat.side === 'Defense' ? 'bg-emerald-500/10' : 'bg-fuchsia-500/10'}`}>
                        {/* Visual Flair */}
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />

                        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <span className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg border ${selectedStrat.side === 'Attack' ? 'border-amber-500/30 text-amber-500' : selectedStrat.side === 'Defense' ? 'border-emerald-500/30 text-emerald-500' : 'border-fuchsia-500/30 text-fuchsia-500'}`}>
                                        {selectedStrat.side}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{selectedStrat.game}</span>
                                </div>
                                <h2 className="text-3xl md:text-5xl font-black text-[var(--text-color)] uppercase tracking-tighter leading-none">{selectedStrat.title}</h2>
                            </div>

                            <button onClick={() => setSelectedStrat(null)} className="absolute top-8 right-8 w-12 h-12 rounded-full bg-white dark:bg-black/40 flex items-center justify-center text-slate-500 hover:text-[var(--text-color)] transition-all shadow-xl">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Metadata Bar */}
                    <div className="px-8 md:px-12 py-4 bg-slate-50 dark:bg-white/[0.02] border-y border-slate-200 dark:border-white/5 flex flex-wrap gap-8 items-center text-[10px] uppercase font-black tracking-widest text-slate-500">
                        <div className="flex items-center"><svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> Sector: <span className="text-[var(--text-color)] ml-1">{selectedStrat.map}</span></div>
                        {selectedStrat.role && <div className="flex items-center"><svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" /></svg> Role: <span className="text-[var(--text-color)] ml-1">{selectedStrat.role}</span></div>}
                        <div className="flex items-center"><svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Authored: {new Date(selectedStrat.createdAt).toLocaleDateString()}</div>
                    </div>

                    {/* Content Area */}
                    <div className="p-8 md:p-12 max-h-[50vh] overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-transparent">
                        <div className="prose prose-slate dark:prose-invert max-w-none text-sm md:text-base leading-relaxed tracking-wide font-medium whitespace-pre-wrap">
                            {/* In a real scenario, use react-markdown here. For MVP, we use pre-wrap */}
                            {selectedStrat.content}
                        </div>

                        {selectedStrat.videoUrl && (
                            <div className="mt-12 p-6 bg-blue-500/5 border border-blue-500/20 rounded-3xl">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-4 flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    Linked Tactical VOD
                                </h4>
                                <a href={selectedStrat.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-6 py-3 bg-blue-500 hover:bg-blue-400 text-black text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95">
                                    Access Video Reference <svg className="w-3 h-3 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-8 md:px-12 py-6 bg-slate-50 dark:bg-[#020617] border-t border-slate-200 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            {isCopying ? (
                                <div className="flex items-center gap-4 w-full">
                                    <select
                                        value={copyTargetTeamId}
                                        onChange={e => setCopyTargetTeamId(Number(e.target.value))}
                                        className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-color)] focus:outline-none"
                                    >
                                        <option value="">-- Target Squad --</option>
                                        {teams.filter(t => t.id !== selectedTeamId).map(t => (
                                            <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => handleCopyStrat(selectedStrat.id)}
                                        disabled={saving}
                                        className="px-6 py-2 bg-fuchsia-500 text-black text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                    >
                                        {saving ? 'Copying...' : 'Confirm Copy'}
                                    </button>
                                    <button onClick={() => setIsCopying(false)} disabled={saving} className="px-6 py-2 bg-white dark:bg-white/5 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50">
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                isManagement && (
                                    <button onClick={() => setIsCopying(true)} className="w-full md:w-auto px-8 py-3 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-500 hover:text-white border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm">
                                        Copy Strat
                                    </button>
                                )
                            )}
                        </div>
                        {isManagement && (
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <button onClick={() => { setSelectedStrat(null); openEditor(selectedStrat); }} disabled={saving} className="flex-1 md:flex-none px-8 py-3 glass hover:bg-white/10 text-white border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm disabled:opacity-50">
                                    Edit Strat
                                </button>
                                <button onClick={() => handleDeleteStrat(selectedStrat.id)} disabled={saving} className="flex-1 md:flex-none px-8 py-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm disabled:opacity-50">
                                    {saving ? 'Purging...' : 'Purge Data'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>}
            </Modal>

        </div>
    );
};

export default Playbook;
