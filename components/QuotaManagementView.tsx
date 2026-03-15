import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';
import { GAME_CATEGORY } from './constants';
import { GET_API_BASE_URL } from '../utils/apiUtils';
import Modal from './Modal';

interface PlayerQuota {
    id: number;
    playerId: number;
    weekStart: string;
    aimStatus: 'pending' | 'completed' | 'failed';
    grindStatus: 'pending' | 'completed' | 'failed';
    totalAimKills: number;
    totalGrindRG: number;
    aimProof: string; // JSON
    grindProof: string; // JSON
    punishmentKills: number;
    punishmentRG: number;
    carryOverKills: number;
    carryOverRG: number;
}

interface TeamMember {
    id: number;
    name: string;
    image?: string;
    progress: PlayerQuota;
}

interface RosterQuota {
    id?: number;
    teamId: number;
    baseAimKills: number;
    baseGrindRG: number;
}

const ProofModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    player: TeamMember | null;
    isShootingGame: boolean;
    onReview: (routine: 'aim' | 'grind', status: 'approved' | 'rejected') => void;
    canEdit: boolean;
}> = ({ isOpen, onClose, player, isShootingGame, onReview, canEdit }) => {
    if (!isOpen || !player) return null;

    let aimProofs = [];
    let grindProofs = [];
    try { aimProofs = JSON.parse(player.progress.aimProof || '[]'); } catch { }
    try { grindProofs = JSON.parse(player.progress.grindProof || '[]'); } catch { }

    return (
        <Modal isOpen={isOpen} onClose={onClose} zIndex={100} backdropClassName="bg-black/90 backdrop-blur-xl">
            <div className="relative w-full max-w-5xl bg-[#020617] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-300">
                <div className="p-8 border-b border-white/5 flex justify-between items-center">
                    <div>
                        <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Tactical Intelligence Review</h3>
                        <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.4em] mt-1">Operative: {player.name}</p>
                    </div>
                    <button onClick={onClose} className="p-4 hover:bg-white/5 rounded-2xl transition-colors text-slate-500 hover:text-white">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-8 overflow-y-auto space-y-12">
                    {/* Aim Routine Section */}
                    {isShootingGame && (
                        <div className="space-y-6 p-6 bg-purple-500/5 rounded-[30px] border border-purple-500/10">
                            <div className="flex items-center space-x-4">
                                <span className="h-px flex-grow bg-purple-500/10" />
                                <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.4em]">Aim Routine Intelligence</h4>
                                <span className="h-px flex-grow bg-purple-500/10" />
                            </div>

                            {aimProofs.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {aimProofs.map((p: any, i: number) => (
                                        <div key={i} className="bg-white/5 rounded-[30px] overflow-hidden border border-white/5 group">
                                            <div className="aspect-video relative overflow-hidden">
                                                <img src={p.url} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                            </div>
                                            <div className="p-4 flex justify-between items-center">
                                                <span className="text-[9px] font-black text-slate-500 uppercase">Kills Documented:</span>
                                                <span className="text-lg font-black text-white">{p.kills}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-white/[0.02] rounded-[30px] border border-dashed border-white/10">
                                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest italic">No Aim Telemetry Provided</p>
                                </div>
                            )}

                            {player.progress.aimStatus === 'completed' && canEdit && (
                                <div className="flex justify-center space-x-4 pt-4 border-t border-white/5">
                                    <button onClick={() => onReview('aim', 'rejected')} className="px-8 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all shadow-lg active:scale-95">Reject Aim Routine</button>
                                    <button onClick={() => onReview('aim', 'approved')} className="px-8 py-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all shadow-lg active:scale-95">Approve Aim Routine</button>
                                </div>
                            )}
                            {player.progress.aimStatus === 'approved' && (
                                <div className="text-center pt-4 italic text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                    ✓ Aim Routine Verified by Command
                                </div>
                            )}
                        </div>
                    )}

                    {/* Grind Routine Section */}
                    <div className="space-y-6 p-6 bg-emerald-500/5 rounded-[30px] border border-emerald-500/10">
                        <div className="flex items-center space-x-4">
                            <span className="h-px flex-grow bg-emerald-500/10" />
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">Grind Routine Intelligence</h4>
                            <span className="h-px flex-grow bg-emerald-500/10" />
                        </div>

                        {grindProofs.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {grindProofs.map((p: any, i: number) => (
                                    <div key={i} className="bg-white/5 rounded-[30px] overflow-hidden border border-white/5 group">
                                        <div className="aspect-video relative overflow-hidden">
                                            <img src={p.url} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                        </div>
                                        <div className="p-4 flex justify-between items-center">
                                            <span className="text-[9px] font-black text-slate-500 uppercase">Games Documented:</span>
                                            <span className="text-lg font-black text-white">{p.games}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-white/[0.02] rounded-[30px] border border-dashed border-white/10">
                                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest italic">No Grind Telemetry Provided</p>
                            </div>
                        )}

                        {player.progress.grindStatus === 'completed' && canEdit && (
                            <div className="flex justify-center space-x-4 pt-4 border-t border-white/5">
                                <button onClick={() => onReview('grind', 'rejected')} className="px-8 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all shadow-lg active:scale-95">Reject Grind Routine</button>
                                <button onClick={() => onReview('grind', 'approved')} className="px-8 py-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all shadow-lg active:scale-95">Approve Grind Routine</button>
                            </div>
                        )}
                        {player.progress.grindStatus === 'approved' && (
                            <div className="text-center pt-4 italic text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                ✓ Grind Routine Verified by Command
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

const QuotaManagementView: React.FC<{
    teamId: number;
    game: string;
    canEdit: boolean;
    selectedWeek: string;
    setSelectedWeek: (week: string) => void;
    userId: number;
}> = ({ teamId, game, canEdit, selectedWeek, setSelectedWeek, userId }) => {
    const { showNotification } = useNotification();
    const [loading, setLoading] = useState(true);
    const [baseQuota, setBaseQuota] = useState<RosterQuota | null>(null);
    const [players, setPlayers] = useState<TeamMember[]>([]);
    const [selectedPlayerForProof, setSelectedPlayerForProof] = useState<TeamMember | null>(null);
    const [editingPlayerQuota, setEditingPlayerQuota] = useState<{ id: number, name: string, aim: number, grind: number } | null>(null);

    // Form states for base targets
    const [editBaseAim, setEditBaseAim] = useState(0);
    const [editBaseGrind, setEditBaseGrind] = useState(0);
    const [isEditingStandard, setIsEditingStandard] = useState(false);
    const [isSavingBase, setIsSavingBase] = useState(false);
    const isShootingGame = GAME_CATEGORY[game] === 'FPS' || GAME_CATEGORY[game] === 'BR' || GAME_CATEGORY[game] === 'VALORANT';

    const fetchData = async () => {
        setLoading(true);
        try {
            if (!teamId) return;

            const cleanWeek = selectedWeek ? selectedWeek.split(':')[0] : '';
            const url = `${GET_API_BASE_URL()}/api/teams/${teamId}/quotas${cleanWeek ? `?week=${cleanWeek}` : ''}`;
            const res = await fetch(url);
            const result = await res.json();

            if (result.success) {
                setBaseQuota(result.data.baseQuota);
                setPlayers(result.data.players);
                setEditBaseAim(result.data.baseQuota?.baseAimKills || 0);
                setEditBaseGrind(result.data.baseQuota?.baseGrindRG || 0);
            } else {
                console.error("Quota fetch error:", result.error);
                showNotification({ message: result.error || 'Failed to load quota data.', type: 'error' });
            }
        } catch (error: any) {
            console.error("Failed to fetch quotas:", error);
            showNotification({ message: 'Network error while loading quota data.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async (playerId: number, routine: 'aim' | 'grind', status: 'approved' | 'rejected') => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/players/${playerId}/quota/review`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weekStart: selectedWeek,
                    aimStatus: routine === 'aim' ? status : undefined,
                    grindStatus: routine === 'grind' ? status : undefined,
                    requesterId: userId
                })
            });
            const result = await res.json();

            if (result.success) {
                showNotification({ message: `Intelligence ${status === 'approved' ? 'verified' : 'rejected'}.`, type: status === 'approved' ? 'success' : 'warning' });
                fetchData();
                if (selectedPlayerForProof && selectedPlayerForProof.id === playerId) {
                    setSelectedPlayerForProof(prev => prev ? { ...prev, progress: { ...prev.progress, [routine === 'aim' ? 'aimStatus' : 'grindStatus']: status } } : null);
                }
            } else {
                showNotification({ message: result.error || 'Failed to submit review.', type: 'error' });
            }
        } catch (error) {
            console.error("Error reviewing quota:", error);
            showNotification({ message: 'Network error while submitting review.', type: 'error' });
        }
    };

    useEffect(() => {
        fetchData();
    }, [teamId, selectedWeek]);

    const handleSaveBaseTargets = async () => {
        setIsSavingBase(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams/${teamId}/settings/quota`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    baseAimKills: editBaseAim,
                    baseGrindRG: editBaseGrind,
                    requesterId: userId
                })
            });
            const result = await res.json();

            if (result.success) {
                showNotification({ message: 'Targets updated successfully!', type: 'success' });
                fetchData();
            } else {
                showNotification({ message: result.error || 'Failed to save targets.', type: 'error' });
            }
        } catch (error) {
            console.error("Error saving targets:", error);
            showNotification({ message: 'Network error while saving targets.', type: 'error' });
        } finally {
            setIsSavingBase(false);
        }
    };


    const handleSetCustomQuota = async (playerId: number, aim: number, grind: number) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/players/${playerId}/quota/custom`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weekStart: selectedWeek,
                    assignedBaseAim: aim,
                    assignedBaseGrind: grind,
                    requesterId: userId
                })
            });
            const result = await res.json();

            if (result.success) {
                showNotification({ message: 'Tactical override deployed successfully.', type: 'success' });
                setEditingPlayerQuota(null);
                fetchData();
            } else {
                showNotification({ message: result.error || 'Override failed to deploy.', type: 'error' });
                // We DON'T close the modal here so the user can see the error AND fix the value if needed.
                // However, they can still "Abort" (Close) manually.
            }
        } catch (error) {
            console.error("Error setting custom quota:", error);
            showNotification({ message: 'Network error during deployment.', type: 'error' });
        }
    };

    const handleWaiveQuota = async (playerId: number, type: 'all' | 'aim' | 'grind') => {
        if (!window.confirm(`Mark this unit's ${type === 'all' ? 'entire quota' : type + ' quota'} as complete and verified?`)) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/players/${playerId}/quota/waive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weekStart: selectedWeek, type, requesterId: userId })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({ message: 'Tactical quota waived successfully.', type: 'success' });
                fetchData();
            } else {
                showNotification({ message: result.error || 'Failed to waive quota.', type: 'error' });
            }
        } catch (error) {
            console.error("Error waiving quota:", error);
            showNotification({ message: 'Network error during waiver.', type: 'error' });
        }
    };

    const handleWaivePunishment = async (playerId: number) => {
        if (!window.confirm("Waive all penalty requirements and reset targets to standard protocol levels?")) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/players/${playerId}/quota/waive-punishment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weekStart: selectedWeek, requesterId: userId })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({ message: 'Penalties waived and targets synchronized.', type: 'success' });
                fetchData();
            } else {
                showNotification({ message: result.error || 'Failed to waive penalties.', type: 'error' });
            }
        } catch (error) {
            console.error("Error waiving punishment:", error);
            showNotification({ message: 'Network error during waiver.', type: 'error' });
        }
    };

    const handleSyncBase = async () => {
        if (!window.confirm("Synchronize current week targets for ALL players to the standard protocol levels? This will overwrite any custom tactical overrides for this cycle.")) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams/${teamId}/quotas/sync-base`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weekStart: selectedWeek, requesterId: userId })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({ message: 'Standard protocol synchronized to all units.', type: 'success' });
                fetchData();
            } else {
                showNotification({ message: result.error || 'Failed to synchronize base protocol.', type: 'error' });
            }
        } catch (error) {
            console.error("Error synchronizing base quota:", error);
            showNotification({ message: 'Network error during synchronization.', type: 'error' });
        }
    };

    const getLocalMondayISO = (d: Date) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const y = monday.getFullYear();
        const m = String(monday.getMonth() + 1).padStart(2, '0');
        const dayStr = String(monday.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayStr}`;
    };

    const weekOptions = [];
    const now = new Date();
    for (let i = 0; i < 8; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - (i * 7));
        const monday = getLocalMondayISO(d);
        weekOptions.push(monday);
    }

    if (loading && players.length === 0) {
        return (
            <div className="p-20 flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.4em]">Synchronizing Quota Data Stream...</p>
            </div>
        );
    }

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header / Week Selector */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/[0.02] p-8 rounded-[30px] border border-white/5">
                <div>
                    <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Operational Quotas</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-1">Personnel Compliance & Requirement Tracking</p>
                </div>
                <div className="flex items-center space-x-4">
                    <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest whitespace-nowrap">Target Week:</label>
                    <select
                        value={selectedWeek}
                        onChange={(e) => setSelectedWeek(e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white font-black text-[10px] tracking-tight focus:outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer"
                    >
                        {weekOptions.map(w => (
                            <option key={w} value={w} className="bg-[#020617] text-white">Week of {w}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Base Targets Manager View */}
            {canEdit && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Standard Quota Section */}
                    <div className="bg-gradient-to-br from-purple-500/10 to-transparent p-10 rounded-[35px] border border-purple-500/20 relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <svg className="w-16 h-16 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.4em] mb-8">Standard Weekly Protocol</h4>

                        <div className="space-y-8 relative z-10">
                            {isShootingGame && (
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Standard Aim Routine (Kills)</label>
                                    <input
                                        type="number"
                                        value={editBaseAim}
                                        onChange={(e) => setEditBaseAim(parseInt(e.target.value) || 0)}
                                        disabled={!isEditingStandard}
                                        className={`w-full bg-black/40 border ${isEditingStandard ? 'border-purple-500/50' : 'border-white/10 opacity-50'} rounded-2xl px-6 py-4 text-white font-black text-xl tracking-tight focus:outline-none transition-all`}
                                    />
                                </div>
                            )}
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Standard Grind Routine (RG)</label>
                                <input
                                    type="number"
                                    value={editBaseGrind}
                                    onChange={(e) => setEditBaseGrind(parseInt(e.target.value) || 0)}
                                    disabled={!isEditingStandard}
                                    className={`w-full bg-black/40 border ${isEditingStandard ? 'border-purple-500/50' : 'border-white/10 opacity-50'} rounded-2xl px-6 py-4 text-white font-black text-xl tracking-tight focus:outline-none transition-all`}
                                />
                            </div>
                        </div>

                        <div className="flex space-x-4 mt-10">
                            {isEditingStandard && (
                                <button
                                    onClick={() => {
                                        setIsEditingStandard(false);
                                        setEditBaseAim(baseQuota?.baseAimKills || 0);
                                        setEditBaseGrind(baseQuota?.baseGrindRG || 0);
                                    }}
                                    className="px-8 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl transition-all active:scale-95 border border-white/10"
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (isEditingStandard) {
                                        handleSaveBaseTargets();
                                        setIsEditingStandard(false);
                                    } else {
                                        setIsEditingStandard(true);
                                    }
                                }}
                                disabled={isSavingBase}
                                className={`px-8 py-4 flex-grow ${isEditingStandard ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-purple-600 hover:bg-purple-500'} disabled:bg-slate-800 text-white font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl transition-all shadow-xl shadow-purple-500/20 active:scale-95 border-t border-white/20`}
                            >
                                {isSavingBase ? 'Updating...' : (isEditingStandard ? 'Commit Standards' : 'Modify Standard Weekly')}
                            </button>
                        </div>
                    </div>

                </div>
            )}

            {/* Quick Stats / Summary Card */}
            {canEdit && (
                <div className="bg-white/[0.03] p-10 rounded-[35px] border border-white/5 flex flex-col justify-between">
                    <div>
                        <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.4em] mb-8">Personnel Status Overview</h4>
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Compliant Ops</span>
                                <span className="text-xl font-black text-white italic tracking-tighter">
                                    {players.filter(p =>
                                        (isShootingGame ? (p.progress.aimStatus === 'completed' || p.progress.aimStatus === 'approved') : true) &&
                                        (p.progress.grindStatus === 'completed' || p.progress.grindStatus === 'approved')
                                    ).length} / {players.length}
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pending Review</span>
                                <span className="text-xl font-black text-amber-500 italic tracking-tighter">
                                    {players.filter(p =>
                                        (isShootingGame ? (p.progress.aimStatus === 'pending' || p.progress.aimStatus === 'rejected') : false) ||
                                        (p.progress.grindStatus === 'pending' || p.progress.grindStatus === 'rejected')
                                    ).length}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 text-[8px] text-slate-600 font-black uppercase tracking-[0.2em] italic leading-loose text-center">
                        Note: Punishments are automatically calculated at the start of each week based on prior non-compliance.
                    </div>
                </div>
            )}

            {/* Personnel Compliance Table */}
            {/* Personnel Compliance Table */}
            <div className="bg-white/[0.02] rounded-[40px] border border-white/5 overflow-hidden shadow-soft">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[800px] md:min-w-0">
                        <thead>
                            <tr className="border-b border-white/5 text-[9px] uppercase font-black tracking-[0.3em] text-amber-500/60">
                                <th className="p-8">Personnel Identification</th>
                                {isShootingGame && <th className="p-8 text-center">Aim Routine</th>}
                                <th className="p-8 text-center">Grind Routine</th>
                                <th className="p-8 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {players.map(player => (
                                <tr key={player.id} className="group hover:bg-white/[0.03] transition-colors">
                                    <td className="p-8" onClick={() => setSelectedPlayerForProof(player)}>
                                        <div className="flex items-center space-x-4">
                                            <img src={(player as any).image || `https://ui-avatars.com/api/?name=${player.name}&background=random`} className="w-12 h-12 rounded-xl object-cover border border-white/10 group-hover:border-amber-500/30 transition-colors" />
                                            <div>
                                                <div className="text-lg font-black text-white italic uppercase tracking-tighter group-hover:text-amber-500 transition-colors">{player.name}</div>
                                                <div className="text-[8px] text-slate-600 font-bold uppercase tracking-widest italic">Registered Combatant</div>
                                            </div>
                                        </div>
                                    </td>
                                    {isShootingGame && (
                                        <td className="p-8 text-center">
                                            <div className="space-y-1">
                                                <div className="text-xl font-black text-white italic tracking-tighter tabular-nums">
                                                    {player.progress.totalAimKills} / {player.progress.aimStatus === 'approved' ? player.progress.totalAimKills : ((player.progress.assignedBaseAim || baseQuota?.baseAimKills || 0) + player.progress.punishmentKills + player.progress.carryOverKills)}
                                                </div>
                                                <div className="flex justify-center items-center space-x-2">
                                                    {player.progress.punishmentKills > 0 && <span className="text-[8px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-md font-black">+{player.progress.punishmentKills} PENALTY</span>}
                                                    {player.progress.carryOverKills > 0 && <span className="text-[8px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-md font-black">+{player.progress.carryOverKills} REMAINING</span>}
                                                </div>
                                            </div>
                                            {player.progress.aimStatus === 'completed' && canEdit && (
                                                <div className="flex justify-center space-x-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleReview(player.id, 'aim', 'rejected'); }}
                                                        className="p-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all"
                                                        title="Reject Aim"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleReview(player.id, 'aim', 'approved'); }}
                                                        className="p-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all"
                                                        title="Approve Aim"
                                                    >
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                            {player.progress.aimStatus === 'approved' && (
                                                <div className="text-[8px] text-emerald-500 font-black uppercase mt-2 tracking-tighter italic">✓ Aim Verified</div>
                                            )}
                                        </td>
                                    )}
                                    <td className="p-8 text-center">
                                        <div className="space-y-1">
                                            <div className="text-xl font-black text-white italic tracking-tighter tabular-nums">
                                                {player.progress.totalGrindRG} / {player.progress.grindStatus === 'approved' ? player.progress.totalGrindRG : ((player.progress.assignedBaseGrind || baseQuota?.baseGrindRG || 0) + player.progress.punishmentRG + player.progress.carryOverRG)}
                                            </div>
                                            <div className="flex justify-center items-center space-x-2">
                                                {player.progress.punishmentRG > 0 && <span className="text-[8px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-md font-black">+{player.progress.punishmentRG} PENALTY</span>}
                                                {player.progress.carryOverRG > 0 && <span className="text-[8px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-md font-black">+{player.progress.carryOverRG} REMAINING</span>}
                                            </div>
                                        </div>
                                        {player.progress.grindStatus === 'completed' && canEdit && (
                                            <div className="flex justify-center space-x-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleReview(player.id, 'grind', 'rejected'); }}
                                                    className="p-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all"
                                                    title="Reject Grind"
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleReview(player.id, 'grind', 'approved'); }}
                                                    className="p-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-all"
                                                    title="Approve Grind"
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                </button>
                                            </div>
                                        )}
                                        {player.progress.grindStatus === 'approved' && (
                                            <div className="text-[8px] text-emerald-500 font-black uppercase mt-2 tracking-tighter italic">✓ Grind Verified</div>
                                        )}
                                    </td>
                                    <td className="p-8" onClick={() => setSelectedPlayerForProof(player)}>
                                            <div className="flex flex-col items-end space-y-2">
                                                <span className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${(player.progress.aimStatus === 'completed' || player.progress.aimStatus === 'approved') && (player.progress.grindStatus === 'completed' || player.progress.grindStatus === 'approved')
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                                    : (player.progress.aimStatus === 'rejected' || player.progress.grindStatus === 'rejected')
                                                        ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                        : (player.progress.aimStatus === 'failed' || player.progress.grindStatus === 'failed')
                                                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                                                            : 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
                                                    }`}>
                                                    {(player.progress.aimStatus === 'approved' && player.progress.grindStatus === 'approved') ? 'COMMAND VERIFIED' : (player.progress.aimStatus === 'rejected' || player.progress.grindStatus === 'rejected') ? 'TELEMETRY REJECTED' : (player.progress.aimStatus === 'completed' && player.progress.grindStatus === 'completed') ? 'IDENTIFIED CLEAR' : 'UNDER REVIEW'}
                                                </span>
                                                <div className="flex items-center space-x-2">
                                                    {(player.progress.aimStatus === 'approved' && player.progress.grindStatus === 'approved') && (
                                                        <span className="text-[7px] bg-emerald-500/20 text-emerald-500 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">Done</span>
                                                    )}
                                                    <button onClick={() => setSelectedPlayerForProof(player)} className="text-[8px] text-amber-500 font-black uppercase tracking-[0.2em] hover:text-white transition-colors">
                                                        VIEW INTEL ACCESS
                                                    </button>
                                                </div>
                                            </div>
                                    </td>
                                    <td className="p-8 text-right">
                                        {canEdit ? (
                                            <div className="flex justify-end items-center space-x-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingPlayerQuota({ id: player.id, name: player.name, aim: (player.progress.assignedBaseAim || baseQuota?.baseAimKills || 0), grind: (player.progress.assignedBaseGrind || baseQuota?.baseGrindRG || 0) }); }}
                                                    className="p-3 bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 rounded-xl transition-all"
                                                    title="Tactical Override"
                                                >
                                                    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleWaiveQuota(player.id, 'all'); }}
                                                    className="p-3 bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 rounded-xl transition-all"
                                                    title="Waive Quota (Mark as Done)"
                                                >
                                                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleWaivePunishment(player.id); }}
                                                    className="p-3 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 rounded-xl transition-all"
                                                    title="Waive Penalties & Reset Targets"
                                                >
                                                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end items-center space-x-2 text-slate-700">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0-6V9m4.938 4h1.062a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4a2 2 0 012-2h1.062M9 11V9a3 3 0 016 0v2" /></svg>
                                                <span className="text-[8px] font-black uppercase tracking-widest">Read Only</span>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {players.length === 0 && (
                    <div className="p-24 text-center opacity-30">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em]">No Personnel Identified in this Sector</p>
                    </div>
                )}
            </div>

            <ProofModal
                isOpen={!!selectedPlayerForProof}
                onClose={() => setSelectedPlayerForProof(null)}
                player={selectedPlayerForProof}
                isShootingGame={isShootingGame}
                canEdit={canEdit}
                onReview={(routine, status) => {
                    if (selectedPlayerForProof) {
                        handleReview(selectedPlayerForProof.id, routine, status);
                    }
                }}
            />

            {/* Tactical Override Modal */}
            <Modal
                isOpen={!!editingPlayerQuota}
                onClose={() => setEditingPlayerQuota(null)}
                zIndex={100}
                backdropClassName="bg-black/80 backdrop-blur-md"
            >
                <div className="relative w-full max-w-lg bg-[#020617] border border-amber-500/20 rounded-[40px] shadow-2xl overflow-hidden p-10 animate-in fade-in zoom-in duration-300">
                    <div className="flex justify-between items-start mb-10">
                        <div>
                            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">Tactical Override</h3>
                            <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.4em] mt-2">Unit: {editingPlayerQuota?.name}</p>
                        </div>
                        <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                            <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                    </div>

                    <div className="space-y-8">
                        {isShootingGame && (
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1 italic">Override Aim Target (Kills)</label>
                                <input
                                    type="number"
                                    value={editingPlayerQuota?.aim || 0}
                                    onChange={(e) => setEditingPlayerQuota(prev => prev ? { ...prev, aim: parseInt(e.target.value) || 0 } : null)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-2xl tracking-tight focus:outline-none focus:border-amber-500/50 transition-all tabular-nums"
                                />
                            </div>
                        )}
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1 italic">Override Grind Target (RG)</label>
                            <input
                                type="number"
                                value={editingPlayerQuota?.grind || 0}
                                onChange={(e) => setEditingPlayerQuota(prev => prev ? { ...prev, grind: parseInt(e.target.value) || 0 } : null)}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-2xl tracking-tight focus:outline-none focus:border-amber-500/50 transition-all tabular-nums"
                            />
                        </div>

                        <div className="pt-6 border-t border-white/5 space-y-4">
                            <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex items-start space-x-3">
                                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                <p className="text-[9px] text-amber-500/80 font-bold uppercase tracking-widest leading-relaxed">Warning: Operational overrides immediately affect the operative's tactical goals for the current weekly cycle.</p>
                            </div>

                            <div className="flex space-x-4">
                                <button
                                    onClick={() => setEditingPlayerQuota(null)}
                                    className="flex-grow px-8 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl transition-all border border-white/10"
                                >
                                    Abort
                                </button>
                                <button
                                    onClick={() => editingPlayerQuota && handleSetCustomQuota(editingPlayerQuota.id, editingPlayerQuota.aim, editingPlayerQuota.grind)}
                                    className="flex-[2] px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-black text-[10px] uppercase tracking-[0.3em] rounded-2xl transition-all shadow-xl shadow-amber-500/20 active:scale-95 border-t border-white/20"
                                >
                                    Confirm Deployment
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default QuotaManagementView;
