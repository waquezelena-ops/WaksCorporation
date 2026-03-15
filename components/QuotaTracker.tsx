import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';
import { GAME_CATEGORY } from './constants';
import { GET_API_BASE_URL } from '../utils/apiUtils';

const scrollbarStyle = `
.custom-scrollbar::-webkit-scrollbar {
    width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}
`;

interface PlayerQuota {
    id: number;
    playerId: number;
    weekStart: string;
    aimStatus: 'pending' | 'completed' | 'failed';
    grindStatus: 'pending' | 'completed' | 'failed';
    totalAimKills: number;
    totalGrindRG: number;
    aimProof: string; // JSON string of [{url, kills}]
    grindProof: string; // JSON string of [{url, games}]
    punishmentKills: number;
    punishmentRG: number;
    carryOverKills: number;
    carryOverRG: number;
}

interface AimProofItem {
    url: string;
    kills: number;
}

interface GrindProofItem {
    url: string;
    games: number;
}

const QuotaTracker: React.FC<{
    playerId: number;
    teamId: number;
    game: string;
}> = ({ playerId, teamId, game }) => {
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = scrollbarStyle;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const { showNotification } = useNotification();
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState<PlayerQuota | null>(null);
    const [baseQuota, setBaseQuota] = useState<{ baseAimKills: number, baseGrindRG: number } | null>(null);
    const [aimProofs, setAimProofs] = useState<AimProofItem[]>([]);
    const [grindProofs, setGrindProofs] = useState<GrindProofItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const isShootingGame = GAME_CATEGORY[game] === 'FPS' || GAME_CATEGORY[game] === 'BR' || GAME_CATEGORY[game] === 'VALORANT';

    function getMondayISO(d: Date) {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date.setDate(diff));
        monday.setHours(0, 0, 0, 0);

        const y = monday.getFullYear();
        const m = String(monday.getMonth() + 1).padStart(2, '0');
        const dayStr = String(monday.getDate()).padStart(2, '0');
        return `${y}-${m}-${dayStr}`;
    }

    const currentWeek = getMondayISO(new Date());

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams/${teamId}/quotas?week=${currentWeek}`);
            const result = await res.json();
            if (result.success) {
                const data = result.data;
                const myData = data.players.find((p: any) => p.id === playerId);
                if (myData) {
                    setProgress(myData.progress);
                    
                    // Fetch proofs separately since they are excluded from the main roster payload
                    try {
                        const proofsRes = await fetch(`${GET_API_BASE_URL()}/api/players/${playerId}/quota/proofs?weekStart=${currentWeek}`);
                        const proofsResult = await proofsRes.json();
                        if (proofsResult.success) {
                            if (myData.progress.aimStatus === 'pending' || myData.progress.aimStatus === 'rejected') {
                                setAimProofs(JSON.parse(proofsResult.data.aimProof || '[]'));
                            } else {
                                setAimProofs([]);
                            }
                            if (myData.progress.grindStatus === 'pending' || myData.progress.grindStatus === 'rejected') {
                                setGrindProofs(JSON.parse(proofsResult.data.grindProof || '[]'));
                            } else {
                                setGrindProofs([]);
                            }
                        }
                    } catch (err) {
                        console.error("Error fetching own proofs:", err);
                    }

                    setBaseQuota({
                        baseAimKills: data.baseQuota.baseAimKills,
                        baseGrindRG: data.baseQuota.baseGrindRG
                    });
                }
            } else {
                showNotification({ message: result.error || 'Failed to load quota targets', type: 'error' });
            }
        } catch (error) {
            console.error("Failed to fetch quota tracker data:", error);
            showNotification({ message: 'Network error while loading quota tracker.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        const handleRefresh = () => {
            console.log("[QUOTA-TRACKER] Real-time sync triggered");
            fetchData();
        };

        window.addEventListener('nxc-db-refresh', handleRefresh);
        return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
    }, [playerId, teamId]);

    const handleUploadAimScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files).slice(0, 50); // Hard cap at 50 for safety
            
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    setAimProofs(prev => [...prev, {
                        url: ev.target?.result as string,
                        kills: 0
                    }]);
                };
                reader.readAsDataURL(file as File);
            });
        }
    };

    const handleUploadGrindScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files).slice(0, 50);
            
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    setGrindProofs(prev => [...prev, {
                        url: ev.target?.result as string,
                        games: 0
                    }]);
                };
                reader.readAsDataURL(file as File);
            });
        }
    };

    const handleRemoveAimProof = (idx: number) => {
        setAimProofs(aimProofs.filter((_, i) => i !== idx));
    };

    const handleRemoveGrindProof = (idx: number) => {
        setGrindProofs(grindProofs.filter((_, i) => i !== idx));
    };

    const handleUpdateAimProofKills = (idx: number, kills: number) => {
        const updated = [...aimProofs];
        updated[idx].kills = kills;
        setAimProofs(updated);
    };

    const handleUpdateGrindProofGames = (idx: number, games: number) => {
        const updated = [...grindProofs];
        updated[idx].games = games;
        setGrindProofs(updated);
    };

    const handleSaveProgress = async () => {
        setIsSaving(true);
        try {
            const aimKillsTotal = aimProofs.reduce((sum, p) => sum + p.kills, 0);
            const grindRGTotal = grindProofs.reduce((sum, p) => sum + p.games, 0);
            const aimGoal = (baseQuota?.baseAimKills || 0) + (progress?.punishmentKills || 0) + (progress?.carryOverKills || 0);
            const grindGoal = (baseQuota?.baseGrindRG || 0) + (progress?.punishmentRG || 0) + (progress?.carryOverRG || 0);

            const res = await fetch(`${GET_API_BASE_URL()}/api/players/${playerId}/quota/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    weekStart: currentWeek,
                    aimProof: JSON.stringify(aimProofs),
                    grindProof: JSON.stringify(grindProofs),
                    aimStatus: aimKillsTotal >= aimGoal ? 'completed' : 'pending',
                    grindStatus: grindRGTotal >= grindGoal ? 'completed' : 'pending'
                })
            });

            const result = await res.json();
            if (result.success) {
                showNotification({ message: 'Operational intelligence transmitted successfully.', type: 'success' });
                fetchData();
            } else {
                showNotification({ message: result.error || 'Update failed.', type: 'error' });
            }
        } catch (error) {
            console.error("Save Progress Error:", error);
            showNotification({ message: 'Telemetry transmission failed.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    if (loading && !progress) {
        return <div className="p-10 text-center opacity-50 uppercase tracking-[0.4em] text-[10px] animate-pulse">Syncing Tactical Goals...</div>;
    }

    if (!progress || !baseQuota) return null;

    const currentAimKills = (progress.aimStatus === 'completed' || progress.aimStatus === 'approved')
        ? progress.totalAimKills
        : aimProofs.reduce((sum, p) => sum + p.kills, 0);
    const currentGrindRG = (progress.grindStatus === 'completed' || progress.grindStatus === 'approved')
        ? progress.totalGrindRG
        : grindProofs.reduce((sum, p) => sum + p.games, 0);

    const aimGoal = (progress.aimStatus === 'approved' && progress.punishmentKills === 0 && progress.carryOverKills === 0)
        ? (progress.assignedBaseAim || baseQuota.baseAimKills)
        : progress.aimStatus === 'approved'
            ? currentAimKills
            : ((progress.assignedBaseAim || baseQuota.baseAimKills) + progress.punishmentKills + progress.carryOverKills);

    const grindGoal = (progress.grindStatus === 'approved' && progress.punishmentRG === 0 && progress.carryOverRG === 0)
        ? (progress.assignedBaseGrind || baseQuota.baseGrindRG)
        : progress.grindStatus === 'approved'
            ? currentGrindRG
            : ((progress.assignedBaseGrind || baseQuota.baseGrindRG) + progress.punishmentRG + progress.carryOverRG);

    const isDutyFulfilled = (isShootingGame ? progress.aimStatus === 'approved' : true) && progress.grindStatus === 'approved';

    return (
        <div className="bg-[#020617]/60 backdrop-blur-3xl rounded-[40px] p-10 border border-white/5 shadow-2xl space-y-12">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">Quota Tracker</h3>
                    <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.4em] mt-1">Personnel Requirement Monitoring</p>
                </div>
                <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                    <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest block">Current Phase</span>
                    <span className="text-sm font-black text-white italic tracking-tighter uppercase tabular-nums">Week of {currentWeek}</span>
                </div>
            </div>

            {isDutyFulfilled && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[35px] p-12 text-center space-y-6 animate-in fade-in zoom-in duration-700 shadow-[0_0_50px_rgba(16,185,129,0.1)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                    <div className="w-24 h-24 bg-emerald-500/20 rounded-[30px] flex items-center justify-center mx-auto border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                        <svg className="w-12 h-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-4xl font-black text-white italic uppercase tracking-tighter">Duty Fulfilled</h4>
                        <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.5em]">Command has verified all routine operational requirements.</p>
                    </div>
                    <div className="max-w-md mx-auto">
                        <p className="text-xs text-slate-400 font-medium leading-relaxed italic">
                            Congratulations, Operative. Your tactical standards for the current phase have been met and verified.
                            Stand by for new sector objectives in the next operational cycle.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Aim Routine Section */}
                {isShootingGame && (
                    <div className="space-y-8 bg-white/[0.02] p-8 rounded-[35px] border border-white/5 relative group h-full flex flex-col">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.4em]">Aim Routine Operations</h4>
                                <div className="text-3xl font-black text-white italic tracking-tighter tabular-nums">
                                    {currentAimKills} <span className="text-slate-700">/ {aimGoal}</span>
                                </div>
                            </div>
                            <div className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${progress.aimStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : progress.aimStatus === 'completed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : progress.aimStatus === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'}`}>
                                {progress.aimStatus === 'approved' ? 'VERIFIED' : progress.aimStatus === 'completed' ? 'UNDER REVIEW' : progress.aimStatus === 'rejected' ? 'REJECTED' : 'PENDING TARGET'}
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-1000 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                                style={{ width: `${Math.min(100, (currentAimKills / aimGoal) * 100)}%` }}
                            />
                        </div>

                        {progress.aimStatus === 'rejected' && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <p className="text-[8px] text-red-500 font-black uppercase tracking-widest italic text-center">Tactical Evidence Rejected. Please correct and resubmit.</p>
                            </div>
                        )}

                        {/* Penalties */}
                        <div className="flex space-x-3">
                            {progress.punishmentKills > 0 && <span className="text-[8px] bg-red-500/20 text-red-400 px-3 py-1 rounded-md font-black">+{progress.punishmentKills} PENALTY</span>}
                            {progress.carryOverKills > 0 && <span className="text-[8px] bg-amber-500/20 text-amber-500 px-3 py-1 rounded-md font-black">+{progress.carryOverKills} REMAINING</span>}
                        </div>

                        {/* Proof Gallery */}
                        <div className="space-y-4 flex-grow">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Intelligence Proofs (Screenshots)</label>
                            <div className="max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    {aimProofs.map((proof, idx) => (
                                        <div key={idx} className="relative group/proof aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                                            <img src={proof.url} className="w-full h-full object-cover transition-transform group-hover/proof:scale-110" />
                                            <div className="absolute inset-x-0 bottom-0 p-3 bg-black/60 backdrop-blur-md flex items-center justify-between border-t border-white/10">
                                                <div className="flex items-center space-x-2 w-full pr-8">
                                                    <span className="text-[8px] font-black text-white/40 uppercase">KILLS:</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        placeholder="0"
                                                        value={proof.kills === 0 ? '' : proof.kills}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                                            handleUpdateAimProofKills(idx, parseInt(val) || 0);
                                                        }}
                                                        className="bg-white/5 text-white font-black text-lg w-full outline-none focus:bg-purple-500/20 focus:text-purple-400 transition-all rounded-lg px-3 py-2 border border-white/5 focus:border-purple-500/50"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveAimProof(idx)}
                                                    className="absolute right-2 text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <label className="flex flex-col items-center justify-center p-6 bg-white/5 hover:bg-white/[0.08] border-2 border-dashed border-white/10 rounded-2xl cursor-pointer transition-all group/upload relative aspect-video">
                                        <input type="file" accept="image/*" multiple onChange={handleUploadAimScreenshot} className="hidden" />
                                        <svg className="w-8 h-8 text-slate-600 group-hover/upload:text-purple-400 transition-colors mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4" /></svg>
                                        <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Add Aim Intel</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Grind Routine Section */}
                <div className="space-y-8 bg-white/[0.02] p-8 rounded-[35px] border border-white/5 relative group flex flex-col h-full">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em]">Grind Routine Engagement</h4>
                            <div className="text-3xl font-black text-white italic tracking-tighter tabular-nums">
                                {currentGrindRG} <span className="text-slate-700">/ {grindGoal}</span>
                            </div>
                        </div>
                        <div className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${progress.grindStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : progress.grindStatus === 'completed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : progress.grindStatus === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'}`}>
                            {progress.grindStatus === 'approved' ? 'VERIFIED' : progress.grindStatus === 'completed' ? 'UNDER REVIEW' : progress.grindStatus === 'rejected' ? 'REJECTED' : 'OPERATIONAL DEFICIT'}
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                            style={{ width: `${Math.min(100, (currentGrindRG / grindGoal) * 100)}%` }}
                        />
                    </div>

                    {progress.grindStatus === 'rejected' && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <p className="text-[8px] text-red-500 font-black uppercase tracking-widest italic text-center">Engagement Proof Rejected. Personnel must verify match telemetery.</p>
                        </div>
                    )}

                    {/* Penalties */}
                    <div className="flex space-x-3">
                        {progress.punishmentRG > 0 && <span className="text-[8px] bg-red-500/20 text-red-400 px-3 py-1 rounded-md font-black">+{progress.punishmentRG} PENALTY RG</span>}
                        {progress.carryOverRG > 0 && <span className="text-[8px] bg-amber-500/20 text-amber-500 px-3 py-1 rounded-md font-black">+{progress.carryOverRG} REMAINING RG</span>}
                    </div>

                    <div className="space-y-6 flex-grow">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block ml-1">Engagement Analysis (Ranked Proofs)</label>

                        {/* Grind Proof Gallery */}
                        <div className="max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                                {grindProofs.map((proof, idx) => (
                                    <div key={idx} className="relative group/proof aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                                        <img src={proof.url} className="w-full h-full object-cover transition-transform group-hover/proof:scale-110" />
                                        <div className="absolute inset-x-0 bottom-0 p-3 bg-black/60 backdrop-blur-md flex items-center justify-between border-t border-white/10">
                                                <div className="flex items-center space-x-2 w-full pr-8">
                                                    <span className="text-[8px] font-black text-white/40 uppercase">GAMES:</span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        placeholder="0"
                                                        value={proof.games === 0 ? '' : proof.games}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                                            handleUpdateGrindProofGames(idx, parseInt(val) || 0);
                                                        }}
                                                        className="bg-white/5 text-white font-black text-lg w-full outline-none focus:bg-emerald-500/20 focus:text-emerald-400 transition-all rounded-lg px-3 py-2 border border-white/5 focus:border-emerald-500/50"
                                                    />
                                                </div>
                                            <button
                                                onClick={() => handleRemoveGrindProof(idx)}
                                                className="absolute right-2 text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <label className="flex flex-col items-center justify-center p-6 bg-white/5 hover:bg-white/[0.08] border-2 border-dashed border-white/10 rounded-2xl cursor-pointer transition-all group/upload relative aspect-video">
                                    <input type="file" accept="image/*" multiple onChange={handleUploadGrindScreenshot} className="hidden" />
                                    <svg className="w-8 h-8 text-slate-600 group-hover/upload:text-emerald-400 transition-colors mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4" /></svg>
                                    <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">Add Grind Intel</span>
                                </label>
                            </div>
                        </div>

                        <p className="text-[10px] text-slate-600 italic font-medium leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">
                            Submit screenshots of your ranked matches. Each image should clearly show the match result and engagement volume.
                        </p>
                    </div>
                </div>
            </div>

            <button
                onClick={handleSaveProgress}
                disabled={isSaving}
                className="w-full py-6 bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white font-black uppercase tracking-[0.5em] text-[12px] rounded-3xl transition-all shadow-2xl shadow-emerald-500/20 active:scale-[0.98] border-t border-white/20"
            >
                {isSaving ? 'Synching Uplink...' : 'Commit Tactical Achievements'}
            </button>
        </div>
    );
};

export default QuotaTracker;
