import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';
import { animate, stagger } from 'animejs';
import { GET_API_BASE_URL } from '../utils/apiUtils';
import PerformanceTracker from './PerformanceTracker';
import AddAchievementForm from './AddAchievementForm';
import TacticalIntelGraphs from './TacticalIntelGraphs';
import PlayerStatsModal from './PlayerStatsModal';
import { PlayerCard } from './PlayerCard';
import { GAME_TITLES, GAME_ROLES, GAME_CATEGORY } from './constants';
import Modal from './Modal';

interface Team {
    id: number;
    name: string;
    game: string;
}

const ManagerDashboard: React.FC<{
    userId?: number,
    userRole?: string,
    onNavigate?: (view: string) => void
}> = ({ userId, userRole, onNavigate }) => {
    const [view, setView] = useState<'menu' | 'operative-matrix' | 'log-achievement' | 'performance-tracker' | 'tournament-network' | 'decommissioned'>('menu');
    const [teams, setTeams] = useState<Team[]>([]);
    const [inactivePlayers, setInactivePlayers] = useState<any[]>([]);
    const { showNotification } = useNotification();

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [view]);

    // Form States
    const [teamName, setTeamName] = useState('');
    const [teamGame, setTeamGame] = useState('');
    const [teamDesc, setTeamDesc] = useState('');

    const [selectedTeam, setSelectedTeam] = useState<string>('');
    const [selectedRosterUserId, setSelectedRosterUserId] = useState(''); // New state for selected user to add to roster
    const [usersList, setUsersList] = useState<any[]>([]); // New state for users list
    const [playerName, setPlayerName] = useState('');
    const [playerRole, setPlayerRole] = useState('');

    // Search states
    const [personnelSearch, setPersonnelSearch] = useState('');
    const [squadSearch, setSquadSearch] = useState('');
    const [showPersonnelResults, setShowPersonnelResults] = useState(false);
    const [showSquadResults, setShowSquadResults] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedSquadForModal, setSelectedSquadForModal] = useState<any | null>(null);
    const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<any | null>(null);

    const handleRemovePlayer = async (teamId: number, playerId: number) => {
        if (!window.confirm('Are you sure you want to remove this operative from the active registry?')) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams/${teamId}/players/${playerId}?requesterId=${userId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await res.json();
            if (result.success) {
                showNotification({
                    message: 'Operative removed from active duty.',
                    type: 'success'
                });
                // Refresh teams to update player list
                const url = (userRole === 'manager' || userRole === 'coach') && userId
                    ? `${GET_API_BASE_URL()}/api/teams?managerId=${userId}`
                    : `${GET_API_BASE_URL()}/api/teams`;
                const resTeams = await fetch(url);
                const resTeamsResult = await resTeams.json();
                if (resTeamsResult.success) {
                    setTeams(resTeamsResult.data);
                }
            } else {
                showNotification({
                    message: result.error || 'Failed to remove operative.',
                    type: 'error'
                });
            }
        } catch (err) {
            console.error(err);
            showNotification({
                message: 'Error removing operative.',
                type: 'error'
            });
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.dropdown-container')) {
                setShowSquadResults(false);
                setShowPersonnelResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchManagerData = async () => {
        if (view === 'menu') return;
        setLoading(true);
        setError(null);
        try {
            // Fetch Inactive/Decommissioned Operatives
            const playersUrl = view === 'decommissioned'
                ? `${GET_API_BASE_URL()}/api/players?decommissioned=true`
                : `${GET_API_BASE_URL()}/api/players`;
            const playersRes = await fetch(playersUrl);
            const playersResult = await playersRes.json();
            if (playersResult.success) {
                const inactive = view === 'decommissioned'
                    ? playersResult.data
                    : playersResult.data.filter((p: any) => p.teamId === null);
                setInactivePlayers(inactive);
            }
            // Teams
            if (view === 'operative-matrix' || view === 'performance-tracker' || view === 'tournament-network' || view === 'decommissioned') {
                const url = ((userRole === 'manager' || userRole === 'coach') && userId)
                    ? `${GET_API_BASE_URL()}/api/teams?managerId=${userId}`
                    : `${GET_API_BASE_URL()}/api/teams`;
                const res = await fetch(url);
                const result = await res.json();
                if (result.success) {
                    setTeams(result.data);
                } else {
                    throw new Error(result.error || 'Failed to fetch teams');
                }
            }

            // Users
            if (view === 'operative-matrix') {
                const res = await fetch(`${GET_API_BASE_URL()}/api/users`);
                const result = await res.json();
                // /api/users returns a plain array (no success wrapper)
                const userArray = Array.isArray(result) ? result : (result.data || []);
                if (userArray.length >= 0) {
                    setUsersList(userArray);
                } else {
                    throw new Error(result.error || 'Failed to fetch user directory');
                }
            }
        } catch (err: any) {
            console.error("Manager fetch failed:", err);
            setError(err.message || "Connection to Identity API severed.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (view === 'menu' && !loading) {
            // Use requestAnimationFrame to ensure DOM is painted
            requestAnimationFrame(() => {
                const targets = document.querySelectorAll('.menu-card');
                if (targets.length > 0) {
                    animate('.menu-card', {
                        translateY: [20, 0],
                        opacity: [0, 1],
                        delay: stagger(100),
                        easing: 'easeOutQuart',
                        duration: 800
                    });
                }
            });
        }
    }, [view, loading]);

    useEffect(() => {
        if (view === 'operative-matrix' && !loading) {
            requestAnimationFrame(() => {
                animate('.squad-row', {
                    opacity: [0, 1],
                    translateX: [-10, 0],
                    delay: stagger(50),
                    easing: 'easeOutQuart',
                    duration: 600
                });
            });
        }
    }, [view, loading, teams]);

    useEffect(() => {
        fetchManagerData();

        const handleReset = (e: any) => {
            if (e.detail?.view === 'manager') {
                setView('menu');
            }
        };

        const handleRefresh = () => {
            console.log("[MANAGER-DASHBOARD] Real-time sync triggered");
            fetchManagerData();
        };

        window.addEventListener('nxc-reset-view', handleReset);
        window.addEventListener('nxc-db-refresh', handleRefresh);

        return () => {
            window.removeEventListener('nxc-reset-view', handleReset);
            window.removeEventListener('nxc-db-refresh', handleRefresh);
        };
    }, [view]);

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: teamName, game: teamGame, description: teamDesc, managerId: userId, requesterId: userId })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({
                    message: 'Team created!',
                    type: 'success'
                });
                setView('menu');
                setTeamName(''); setTeamGame(''); setTeamDesc('');
            } else {
                showNotification({
                    message: result.error || 'Failed to create team.',
                    type: 'error'
                });
            }
        } catch (err) {
            console.error(err);
            showNotification({
                message: 'Error creating team.',
                type: 'error'
            });
        }
    };

    const handleAddPlayer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTeam) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams/${selectedTeam}/players`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedRosterUserId,
                    name: playerName,
                    role: playerRole,
                    kda: "0.00",
                    winRate: "0%",
                    acs: "0",
                    requesterId: userId
                })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({
                    message: 'Player added! Stats initialized to zero protocol.',
                    type: 'success'
                });
                setSelectedRosterUserId(''); setPlayerName(''); setPlayerRole('');
                // Refresh teams for better UX
                const isTacticalRole = ['manager', 'coach'].includes(userRole || '');
                const resTeams = await fetch(isTacticalRole && userId
                    ? `${GET_API_BASE_URL()}/api/teams?managerId=${userId}`
                    : `${GET_API_BASE_URL()}/api/teams`);
                const resTeamsResult = await resTeams.json();
                if (resTeamsResult.success) {
                    setTeams(resTeamsResult.data);
                }
            } else {
                showNotification({
                    message: result.error || 'Failed to add player.',
                    type: 'error'
                });
            }
        } catch (err) {
            console.error(err);
            showNotification({
                message: 'Error adding player.',
                type: 'error'
            });
        }
    };


    return (
        <div
            className="glass rounded-[32px] md:rounded-[48px] p-6 md:p-12 mt-8 md:mt-12 transition-all relative overflow-hidden group"
        >
            <div className="absolute top-0 right-0 p-6 md:p-12">
                <div className="w-32 h-32 md:w-64 md:h-64 bg-purple-500/5 blur-[80px] md:blur-[120px] rounded-full group-hover:bg-purple-500/10 transition-all duration-1000" />
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 md:mb-16 relative z-10 gap-6 md:gap-8">
                <div className="flex items-center space-x-4 md:space-x-6">
                    {(view !== 'menu' || !!onNavigate) && (
                        <button
                            onClick={() => view === 'menu' ? (onNavigate && onNavigate('home')) : setView('menu')}
                            className="p-3 md:p-4 bg-white/5 hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 rounded-2xl transition-all border border-white/10 group/back shadow-lg active:scale-95"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                    )}
                    <div>
                        <h2 className="text-2xl md:text-4xl font-black text-[var(--text-color)] tracking-tighter uppercase italic leading-tight">
                            {view === 'menu'
                                ? (userRole?.toLowerCase() === 'coach' ? 'Coach Corner' : 'Command Matrix')
                                : view === 'operative-matrix' ? 'Operative Matrix Initialization'
                                    : view === 'performance-tracker' ? 'Tactical Intel'
                                        : view === 'tournament-network' ? 'Tournament Network'
                                            : 'Victory Log'}
                        </h2>
                        <p className="text-[8px] md:text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] mt-1 md:mt-2 md:ml-1">Secure Tactical Terminal</p>
                    </div>
                </div>
                <div className="flex items-center">
                    <div className="px-4 md:px-5 py-1.5 md:py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl md:rounded-2xl">
                        <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 whitespace-nowrap">
                            Auth: Level 4 {userRole?.toLowerCase() === 'coach' ? 'Coach' : 'Manager'}
                        </span>
                    </div>
                </div>
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-24 space-y-6">
                    <div className="relative">
                        <div className="w-12 h-12 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
                        <div className="absolute inset-0 w-12 h-12 border-4 border-purple-500/10 border-b-purple-500 rounded-full animate-spin-slow" />
                    </div>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] animate-pulse">Syncing Tactical Streams...</p>
                </div>
            )}

            {error && (
                <div className="mb-12 p-6 bg-red-500/5 border border-red-500/20 rounded-[32px] text-red-500 text-sm font-black uppercase tracking-widest text-center shadow-lg animate-in fade-in slide-in-from-top-4">
                    <span className="flex items-center justify-center">
                        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        {error}
                    </span>
                </div>
            )}

            {view === 'menu' && !loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
                    {[
                        { id: 'operative-matrix', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', title: 'Operative Matrix Initialization', desc: 'Initialize rosters and assign tactical assets.', color: 'amber', restricted: true },
                        { id: 'tournament-network', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', title: 'Tournament Network', desc: 'Track and manage tournament operations.', color: 'indigo' },
                        { id: 'playbook', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', title: 'Strategy Playbook', desc: 'Secure data repository for tactical plans.', color: 'fuchsia' },
                        { id: 'log-achievement', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z', title: 'Victory Protocol', desc: 'Record a new tournament win.', color: 'yellow' },
                        { id: 'performance-tracker', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', title: 'Tactical Analytics', desc: 'Track Win Rates, K/D, and Maps.', color: 'cyan' },
                        { id: 'scrim-ops', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', title: 'Scrim Network', desc: 'Schedule matches and analyze results.', color: 'emerald' },
                        { id: 'decommissioned', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', title: 'Decommissioned Registry', desc: 'Access historical records of inactive personnel.', color: 'slate' }
                    ].filter(item => !item.restricted || userRole?.toLowerCase() !== 'coach').map((item) => (
                        <div
                            key={item.id}
                            onClick={() => {
                                if (item.id === 'scrim-ops') {
                                    onNavigate && onNavigate('team-management');
                                } else if (item.id === 'tournament-network') {
                                    // Navigate to TeamManagement with tournament mode
                                    onNavigate && onNavigate('tournament-management');
                                } else if (item.id === 'playbook') {
                                    onNavigate && onNavigate('playbook');
                                } else {
                                    setView(item.id as any);
                                }
                            }}
                            className="menu-card glass p-6 md:p-8 rounded-[32px] md:rounded-[40px] hover:border-amber-500/30 transition-all cursor-pointer group shadow-xl relative overflow-hidden active:scale-95"
                            style={{ opacity: 0 }}
                        >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-slate-100 dark:bg-white/5 blur-[40px] rounded-full group-hover:bg-amber-500/10 transition-colors" />
                            <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-black transition-all shadow-xl">
                                <svg className="w-8 h-8 text-slate-800 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} /></svg>
                            </div>
                            <h3 className="text-xl font-black text-[var(--text-color)] mb-2 tracking-tight group-hover:text-amber-500 transition-colors uppercase">{item.title}</h3>
                            <p className="text-sm text-slate-500 font-bold leading-relaxed">{item.desc}</p>
                            <div className="mt-8 flex items-center text-[10px] font-black uppercase tracking-widest text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                Initialize Shell <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {view === 'performance-tracker' && (
                <div className="space-y-12 animate-in fade-in duration-700">
                    <TacticalIntelGraphs availableTeams={teams} userRole={userRole} dbUserId={userId} />
                </div>
            )}

            {view === 'operative-matrix' && (
                <div className="space-y-12 animate-in fade-in duration-700">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                        {/* Unit Initialization Form */}
                        <form onSubmit={handleCreateTeam} className="glass p-8 md:p-10 rounded-[32px] relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500/0 via-purple-500 to-purple-500/0" />
                            <h3 className="text-xl font-black text-[var(--text-color)] mb-6 uppercase tracking-tight flex items-center">
                                <span className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mr-3 text-purple-500">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                                </span>
                                Unit Initialization
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2 ml-2">Unit Designation</label>
                                    <input type="text" required value={teamName} onChange={e => setTeamName(e.target.value)} className="w-full bg-slate-200/50 dark:bg-[#020617]/60 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-[10px] font-black tracking-tight focus:outline-none focus:border-amber-600 dark:focus:border-amber-500/50 transition-all placeholder:text-slate-500 dark:placeholder:text-slate-700 text-[var(--text-color)] dark:text-white" placeholder="e.g. VALORANT ALPHA" />
                                </div>
                                <div>
                                    <label className="block text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2 ml-2">Combat Simulator</label>
                                    <div className="relative">
                                        <select required value={teamGame} onChange={e => setTeamGame(e.target.value)} className="w-full bg-slate-200/50 dark:bg-[#020617]/60 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-[10px] font-black tracking-tight focus:outline-none focus:border-amber-600 dark:focus:border-amber-500/50 transition-all appearance-none cursor-pointer text-[var(--text-color)] dark:text-white">
                                            <option value="" className="bg-white dark:bg-[#020617]">-- SELECT TITLE --</option>
                                            {GAME_TITLES.map(title => (
                                                <option key={title} value={title} className="bg-white dark:bg-[#020617]">{title.toUpperCase()}</option>
                                            ))}
                                        </select>
                                        <svg className="w-3 h-3 text-amber-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-2 ml-2">Mission Parameters</label>
                                    <textarea value={teamDesc} onChange={e => setTeamDesc(e.target.value)} className="w-full bg-slate-200/50 dark:bg-[#020617]/60 border border-slate-300 dark:border-white/10 rounded-xl px-4 py-3 text-[10px] font-black tracking-tight focus:outline-none focus:border-amber-600 dark:focus:border-amber-500/50 transition-all placeholder:text-slate-500 dark:placeholder:text-slate-700 text-[var(--text-color)] dark:text-white" rows={3} placeholder="DEFINE OBJECTIVES..." />
                                </div>
                            </div>
                            <button type="submit" className="w-full py-4 mt-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white font-black uppercase tracking-[0.3em] text-[10px] rounded-xl transition-all shadow-xl shadow-purple-500/20 active:scale-95 border-t border-white/20">
                                Authorize Deployment
                            </button>
                        </form>

                        {/* Operative Matrix Form */}
                        <form onSubmit={handleAddPlayer} className="glass p-8 md:p-10 rounded-[32px] relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0" />
                            <h3 className="text-xl font-black text-[var(--text-color)] mb-6 uppercase tracking-tight flex items-center">
                                <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mr-3 text-amber-500">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                </span>
                                Roster Management
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-2 ml-2">Strategic Squad</label>
                                    <div className="relative dropdown-container">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="SEARCH SQUAD..."
                                                value={squadSearch}
                                                onFocus={() => setShowSquadResults(true)}
                                                onChange={e => {
                                                    setSquadSearch(e.target.value);
                                                    setShowSquadResults(true);
                                                }}
                                                className={`w-full bg-slate-50/50 dark:bg-[#020617]/40 border border-slate-200 dark:border-white/10 ${showSquadResults ? 'rounded-t-2xl' : 'rounded-xl'} px-4 py-3 text-[10px] font-black tracking-widest text-[var(--text-color)] focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-700`}
                                            />
                                            <div
                                                onClick={(e) => { e.stopPropagation(); setShowSquadResults(!showSquadResults); }}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer z-10"
                                            >
                                                <svg className={`w-3 h-3 text-amber-500 transition-transform duration-300 ${showSquadResults ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                        {showSquadResults && (
                                            <div className="absolute top-full left-0 w-full bg-white dark:bg-[#0d0d14] border border-t-0 border-slate-200 dark:border-white/10 rounded-b-xl z-[60] shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                                                {teams.filter(t => t.name.toLowerCase().includes(squadSearch.toLowerCase())).map(t => (
                                                    <div
                                                        key={t.id}
                                                        onClick={() => {
                                                            setSelectedTeam(t.id.toString());
                                                            setSquadSearch(t.name);
                                                            setShowSquadResults(false);
                                                        }}
                                                        className="px-4 py-3 hover:bg-amber-500/10 cursor-pointer text-[10px] font-black uppercase text-[var(--text-color)] dark:text-white border-b border-slate-100 dark:border-white/5 last:border-0"
                                                    >
                                                        {t.name}
                                                    </div>
                                                ))}
                                                {teams.filter(t => t.name.toLowerCase().includes(squadSearch.toLowerCase())).length === 0 && (
                                                    <div className="px-4 py-3 text-[8px] text-slate-500 font-bold uppercase italic">No Squads Found</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative dropdown-container">
                                        <label className="block text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-2 ml-2">Personnel</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="NAME..."
                                                value={personnelSearch}
                                                onFocus={() => setShowPersonnelResults(true)}
                                                onChange={e => {
                                                    setPersonnelSearch(e.target.value);
                                                    setShowPersonnelResults(true);
                                                }}
                                                className={`w-full bg-slate-50/50 dark:bg-[#020617]/40 border border-slate-200 dark:border-white/10 ${showPersonnelResults ? 'rounded-t-2xl' : 'rounded-xl'} px-4 py-3 text-[10px] font-black tracking-widest text-[var(--text-color)] focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-700`}
                                            />
                                            <div
                                                onClick={(e) => { e.stopPropagation(); setShowPersonnelResults(!showPersonnelResults); }}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer z-10"
                                            >
                                                <svg className={`w-3 h-3 text-amber-500 transition-transform duration-300 ${showPersonnelResults ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                        {showPersonnelResults && (
                                            <div className="absolute top-full left-0 w-full bg-white dark:bg-[#0d0d14] border border-t-0 border-slate-200 dark:border-white/10 rounded-b-xl z-[60] shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                                                {usersList.filter(u =>
                                                    u.username.toLowerCase().includes(personnelSearch.toLowerCase()) ||
                                                    (u.fullname && u.fullname.toLowerCase().includes(personnelSearch.toLowerCase())) ||
                                                    (u.ign && u.ign.toLowerCase().includes(personnelSearch.toLowerCase())) ||
                                                    (u.role && u.role.toLowerCase().includes(personnelSearch.toLowerCase()))
                                                ).map((u: any) => (
                                                    <div
                                                        key={u.id}
                                                        onClick={() => {
                                                            setSelectedRosterUserId(u.id.toString());
                                                            setPlayerName(u.ign || u.username);
                                                            setPersonnelSearch(u.username);
                                                            setShowPersonnelResults(false);
                                                        }}
                                                        className="px-4 py-3 hover:bg-amber-500/10 cursor-pointer text-[10px] font-black uppercase text-[var(--text-color)] dark:text-white border-b border-slate-100 dark:border-white/5 last:border-0"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span>{u.ign ? `${u.ign.toUpperCase()} (@${u.username.toUpperCase()})` : `@${u.username.toUpperCase()}`}</span>
                                                            <span className="text-[7px] text-amber-500/70 ml-2">{u.role?.toUpperCase()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-2 ml-2">Tactical Role</label>
                                        <input
                                            type="text"
                                            required
                                            value={playerRole}
                                            onChange={e => setPlayerRole(e.target.value)}
                                            placeholder="ROLE..."
                                            className="w-full bg-slate-50/50 dark:bg-[#020617]/40 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-[10px] font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-700"
                                        />
                                    </div>
                                </div>
                            </div>
                            <button type="submit" className="w-full py-4 mt-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-xl transition-all shadow-xl shadow-amber-500/20 active:scale-95 border-t border-white/20">
                                Authorize Assignment
                            </button>
                        </form>
                    </div>

                    {/* Integrated Squad Intelligence Registry */}
                    <div className="space-y-8 mt-12">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                            <div>
                                <h3 className="text-2xl font-black text-[var(--text-color)] tracking-tight uppercase flex items-center">
                                    <span className="bg-amber-500 text-black px-3 py-1 rounded-lg mr-4 text-sm font-black italic">DATABASE</span>
                                    Squad Intelligence Registry
                                </h3>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-2 leading-relaxed">Cross-referenced unit data snapshot</p>
                            </div>
                            <div className="relative group w-full md:w-auto">
                                <input
                                    type="text"
                                    placeholder="FILTER UNITS..."
                                    value={squadSearch}
                                    onChange={e => setSquadSearch(e.target.value)}
                                    className="w-full md:w-64 pl-12 pr-6 py-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-color)] focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-700 shadow-xl"
                                />
                                <svg className="w-4 h-4 text-amber-500/60 absolute left-4 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                        </div>

                        <div className="glass rounded-[32px] overflow-hidden">
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-white/80 dark:bg-[#0d0d14]/80 backdrop-blur-md z-10">
                                        <tr className="border-b border-slate-200 dark:border-white/5">
                                            <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Designation</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Simulator</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Operatives</th>
                                            <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                                        {teams.filter(t => t.name.toLowerCase().includes(squadSearch.toLowerCase())).map((team) => (
                                            <tr
                                                key={team.id}
                                                onClick={() => setSelectedSquadForModal(team)}
                                                className="group hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all cursor-pointer squad-row"
                                                style={{ opacity: 0 }}
                                            >
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center space-x-4">
                                                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/10 flex items-center justify-center text-amber-700 dark:text-amber-500 font-black text-xs border border-amber-500/20 group-hover:scale-110 transition-transform">
                                                            {team.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-[var(--text-color)] dark:text-white uppercase tracking-tight">{team.name}</p>
                                                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Unit ID: {team.id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-full text-[9px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest border border-slate-200 dark:border-white/10">
                                                        {team.game}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex justify-center -space-x-3">
                                                        {(team as any).players?.slice(0, 3).map((p: any, i: number) => (
                                                            <img
                                                                key={i}
                                                                src={p.image || `https://ui-avatars.com/api/?name=${p.name}`}
                                                                className="w-10 h-10 rounded-full border-2 border-white dark:border-[#0d0d14] object-cover ring-2 ring-amber-500/10"
                                                                title={p.name}
                                                                alt={p.name}
                                                            />
                                                        ))}
                                                        {(team as any).players?.length > 3 && (
                                                            <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-white dark:border-[#0d0d14] flex items-center justify-center text-[10px] font-black text-white ring-2 ring-amber-500/10">
                                                                +{(team as any).players.length - 3}
                                                            </div>
                                                        )}
                                                        {(!(team as any).players || (team as any).players?.length === 0) && (
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Empty</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="flex items-center justify-end space-x-2">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Active</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {view === 'decommissioned' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                        <div>
                            <h3 className="text-2xl font-black text-[var(--text-color)] tracking-tight uppercase flex items-center">
                                <span className="bg-slate-500 text-white px-3 py-1 rounded-lg mr-4 text-sm font-black italic">ARCHIVE</span>
                                Decommissioned Registry
                            </h3>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Historical personnel records and combat data</p>
                        </div>
                    </div>

                    <div className="bg-white/40 dark:bg-black/40 backdrop-blur-3xl rounded-[32px] border border-slate-200 dark:border-white/5 overflow-hidden shadow-xl">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-white/80 dark:bg-[#0d0d14]/80 backdrop-blur-md z-10">
                                    <tr className="border-b border-slate-200 dark:border-white/5">
                                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest">Operative</th>
                                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Last Assignment</th>
                                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Division</th>
                                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                                    {(() => {
                                        if (inactivePlayers.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={5} className="px-8 py-24 text-center">
                                                        <p className="text-[12px] text-slate-500 font-black uppercase tracking-[0.5em] italic">No archived operatives found in registry.</p>
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return (inactivePlayers as any[]).map((p: any) => (
                                            <tr key={p.id} className="group hover:bg-slate-50/50 dark:hover:bg-white/5 transition-all">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center space-x-4">
                                                        <img
                                                            src={p.image || `https://ui-avatars.com/api/?name=${p.name}`}
                                                            className="w-10 h-10 rounded-xl object-cover ring-2 ring-slate-500/10 group-hover:scale-110 transition-transform"
                                                            alt={p.name}
                                                        />
                                                        <div>
                                                            <p className="text-sm font-black text-[var(--text-color)] dark:text-white uppercase tracking-tight">{p.name}</p>
                                                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Asset ID: {p.id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <span className="px-3 py-1 bg-slate-100 dark:bg-white/10 rounded-full text-[9px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest border border-slate-200 dark:border-white/10">
                                                        {p.role || 'UNASSIGNED'}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest">
                                                        {p.teamGame || 'UNSET'}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <div className="flex items-center justify-center space-x-2">
                                                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Inactive</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <button
                                                        onClick={() => setSelectedPlayerForStats(p)}
                                                        className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border border-amber-500/20"
                                                    >
                                                        Review Files
                                                    </button>
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {view === 'log-achievement' && (
                <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 mb-8 md:mb-10">
                        <div className="text-center md:text-left w-full md:w-auto">
                            <h2 className="text-2xl md:text-4xl font-black text-[var(--text-color)] tracking-tight uppercase flex items-center justify-center md:justify-start">
                                <span className="bg-amber-500 text-black px-3 md:px-4 py-1 rounded-lg md:xl mr-3 md:mr-4 text-lg md:text-2xl font-black">NQ-01</span>
                                Victory Log
                            </h2>
                            <p className="text-[8px] md:text-[10px] text-slate-600 dark:text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.4em] mt-2 md:mt-3 md:ml-1 leading-relaxed">Live Tournament Results & Achievement Logging</p>
                        </div>
                    </div>

                    <div className="max-w-3xl mx-auto bg-white/40 dark:bg-black/40 backdrop-blur-3xl p-6 md:p-12 rounded-[32px] md:rounded-[48px] border border-slate-200 dark:border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0" />
                        <AddAchievementForm requesterId={userId} />
                    </div>
                </div>
            )}


            {/* Squad Detail Modal */}
            <Modal isOpen={!!selectedSquadForModal} onClose={() => setSelectedSquadForModal(null)} zIndex={200} backdropClassName="bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500" className="w-full max-w-4xl p-4 md:p-8">
                {selectedSquadForModal && <div className="relative w-full bg-[#020617]/90 backdrop-blur-3xl rounded-[40px] md:rounded-[60px] border border-amber-500/20 shadow-[0_0_120px_rgba(245,158,11,0.15)] overflow-hidden animate-in zoom-in-95 duration-500">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/[0.03] blur-[150px] rounded-full pointer-events-none" />
                    {/* Modal Header */}
                    <div className="p-8 md:p-14 border-b border-white/5 flex justify-between items-center relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-40" />
                        <div className="text-left space-y-2">
                            <h2 className="text-2xl md:text-5xl font-black text-white uppercase tracking-tighter italic leading-none flex items-center gap-4">
                                <span className="bg-amber-500 text-black px-3 py-1 rounded-xl text-xs md:text-lg leading-none font-black not-italic tracking-normal">UNIT</span>
                                {selectedSquadForModal.name}
                            </h2>
                            <p className="text-[9px] md:text-xs text-amber-500/50 font-black uppercase tracking-[0.4em] leading-relaxed ml-1">{selectedSquadForModal.game} // Operational Roster Overview</p>
                        </div>
                        <button
                            onClick={() => setSelectedSquadForModal(null)}
                            className="w-12 h-12 md:w-16 md:h-16 rounded-[20px] md:rounded-[24px] bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-amber-500 hover:text-black hover:rotate-90 transition-all duration-500 border border-white/10 shadow-2xl group/close"
                        >
                            <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Modal Content */}
                    <div className="p-6 md:p-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                            {selectedSquadForModal.players?.map((p: any) => (
                                <div key={p.id} className="group/player p-4 md:p-6 bg-slate-50 dark:bg-white/5 rounded-[24px] md:rounded-[32px] border border-slate-200 dark:border-white/5 hover:border-amber-500/30 transition-all flex items-center justify-between gap-4">
                                    <div className="flex items-center space-x-3 md:space-x-5 min-w-0">
                                        <div className="relative shrink-0">
                                            <img
                                                src={p.image || `https://ui-avatars.com/api/?name=${p.name}`}
                                                className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl object-cover ring-2 md:ring-4 ring-amber-500/10 shadow-xl group-hover/player:scale-105 transition-transform"
                                                alt={p.name}
                                            />
                                            <div className="absolute -bottom-1 -right-1 w-3 h-3 md:w-4 md:h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0d0d14]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm md:text-lg font-black text-[var(--text-color)] dark:text-white uppercase tracking-tight leading-none mb-1 truncate">{p.name}</p>
                                            <p className="text-[8px] md:text-[10px] text-amber-500 font-black uppercase tracking-widest truncate">{p.role || 'Unassigned Role'}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            await handleRemovePlayer(selectedSquadForModal.id, p.id);
                                            // Update local modal state after removal
                                            const res = await fetch((userRole === 'manager' || userRole === 'coach') && userId
                                                ? `${GET_API_BASE_URL()}/api/teams?managerId=${userId}`
                                                : `${GET_API_BASE_URL()}/api/teams`);
                                            const result = await res.json();
                                            if (result.success) {
                                                setTeams(result.data);
                                                const updatedSquad = result.data.find((t: any) => t.id === selectedSquadForModal.id);
                                                if (updatedSquad) setSelectedSquadForModal(updatedSquad);
                                            }
                                        }}
                                        className="px-3 md:px-5 py-1.5 md:py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg md:xl text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all border border-red-500/20 group-hover/player:scale-105 shrink-0"
                                    >
                                        Out
                                    </button>
                                </div>
                            ))}
                            {(!selectedSquadForModal.players || selectedSquadForModal.players.length === 0) && (
                                <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 dark:border-white/5 rounded-[40px]">
                                    <p className="text-[12px] text-slate-500 font-black uppercase tracking-[0.5em]">Unit strength at zero capacity</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-8 md:p-12 bg-white/[0.02] backdrop-blur-2xl border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                        <div className="flex items-center gap-6">
                            <span className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse" />
                                <span className="text-white">Strength: {selectedSquadForModal.players?.length || 0} Ops</span>
                            </span>
                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                            <span>Status: Combat Ready</span>
                        </div>
                        <div className="text-amber-500/60 font-black tracking-[0.5em] italic">
                            Tactical Unit Deployment Dashboard
                        </div>
                    </div>
                </div>}
            </Modal>
            {selectedPlayerForStats && (
                <PlayerStatsModal
                    isOpen={!!selectedPlayerForStats}
                    onClose={() => setSelectedPlayerForStats(null)}
                    player={selectedPlayerForStats}
                    userRole={userRole}
                    showAdvancedIntel={true}
                />
            )}
        </div>
    );
};

export default ManagerDashboard;
