import React, { useEffect, useState } from 'react';
import { useNotification } from '../hooks/useNotification';
import { useUser } from '../services/authService';
import AddAchievementForm from './AddAchievementForm';
import AddEventForm from './AddEventForm';
import AddSponsorForm from './AddSponsorForm';
import TacticalIntelGraphs from './TacticalIntelGraphs';
import { GAME_TITLES } from './constants';
import Modal from './Modal';
import SponsorZone from './SponsorZone';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface User {
    id: number;
    name: string;
    username: string; // Added for search refinement
    email: string;
    role: string;
    avatar: string;
}

const ROLES = ['member', 'coach', 'manager', 'admin', 'ceo'];

interface AdminPanelProps {
    onViewProfile: (userId: number) => void;
}

interface Sponsor {
    id: number;
    name: string;
    tier: string;
    logo: string;
    website?: string;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onViewProfile }) => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const [users, setUsers] = useState<User[]>([]);
    const [teams, setTeams] = useState<any[]>([]);
    const [sponsors, setSponsors] = useState<Sponsor[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [managerSearchTerm, setManagerSearchTerm] = useState('');
    const [squadSearchTerm, setSquadSearchTerm] = useState(''); // New squad search
    const [assignSquadSearch, setAssignSquadSearch] = useState(''); // Search for assignment dropdown
    const [showAssignSquadList, setShowAssignSquadList] = useState(false); // Visibility toggle
    const [managerCurrentPage, setManagerCurrentPage] = useState(1);
    const MANAGERS_PER_PAGE = 6;

    const [selectedGame, setSelectedGame] = useState('All');
    const [seeding, setSeeding] = useState(false);
    const [weeklyReport, setWeeklyReport] = useState<any>(null);
    const [reportHistory, setReportHistory] = useState<any[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string>('live');

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [pushingTelemetry, setPushingTelemetry] = useState(false);
    const [selectedSquadForModal, setSelectedSquadForModal] = useState<any | null>(null);

    const fetchAllData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersRes, teamsRes, sponsorsRes, weeklyRes, historyRes] = await Promise.all([
                fetch(`${GET_API_BASE_URL()}/api/users`),
                fetch(`${GET_API_BASE_URL()}/api/teams`),
                fetch(`${GET_API_BASE_URL()}/api/sponsors`),
                fetch(`${GET_API_BASE_URL()}/api/reports/weekly`),
                fetch(`${GET_API_BASE_URL()}/api/reports/history`)
            ]);

            const [usersData, teamsData, sponsorsData, weeklyData, historyData] = await Promise.all([
                usersRes.json(),
                teamsRes.json(),
                sponsorsRes.json(),
                weeklyRes.json(),
                historyRes.json()
            ]);

            const rawUsers = Array.isArray(usersData) ? usersData : (usersData.data || []);
            if (Array.isArray(rawUsers)) {
                setUsers(rawUsers.map((u: any) => ({
                    id: u.id,
                    name: u.fullname || u.username,
                    username: u.username,
                    email: u.email,
                    role: u.role,
                    avatar: u.avatar
                })));
            }

            if (teamsData.success) setTeams(teamsData.data);
            if (sponsorsData.success) setSponsors(sponsorsData.data);
            if (weeklyData.success) setWeeklyReport(weeklyData.data);
            if (historyData.success) setReportHistory(historyData.data);

        } catch (err: any) {
            console.error("Failed to batch fetch Admin Panel data:", err);
            setError(err.message || "Failed to establish connection with secure servers.");
            showNotification({ message: 'Failed to synchronize admin dashboard', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();

        const handleRefresh = () => {
            console.log("[ADMIN] Real-time sync triggered");
            fetchAllData();
        };

        window.addEventListener('nxc-db-refresh', handleRefresh);
        return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
    }, []);

    const fetchUsers = async () => { /* Keep for targeted re-fetches */
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/users`);
            const result = await res.json();
            const rawUsers = Array.isArray(result) ? result : (result.data || []);
            setUsers(rawUsers.map((u: any) => ({
                id: u.id, name: u.fullname || u.username, username: u.username,
                email: u.email, role: u.role, avatar: u.avatar
            })));
        } catch (e) {
            console.error(e);
        }
    };

    const fetchTeams = async () => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams`);
            const result = await res.json();
            if (result.success) setTeams(result.data);
        } catch (e) { console.error(e); }
    };

    const fetchWeeklyReport = async () => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/reports/weekly`);
            const result = await res.json();
            if (result.success) setWeeklyReport(result.data);
        } catch (e) { console.error(e); }
    };

    const fetchHistoricalReport = async (id: string) => {
        if (id === 'live') {
            setSelectedReportId('live');
            fetchWeeklyReport();
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/reports/history/${id}`);
            const result = await res.json();
            if (result.success) {
                setWeeklyReport(result.data);
                setSelectedReportId(id);
            } else {
                showNotification({ message: result.error || 'Failed to fetch historical report', type: 'error' });
            }
        } catch (e: any) {
            console.error("Failed to fetch historical report", e);
        } finally {
            setLoading(false);
        }
    };

    const updateUserRole = async (userId: number, newRole: string) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/users/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole, requesterId: user?.id })
            });
            const result = await res.json();
            if (result.success) {
                setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
                showNotification({
                    message: `User role updated to ${newRole.toUpperCase()}`,
                    type: 'success'
                });
            } else {
                showNotification({
                    message: result.error || 'Failed to update role',
                    type: 'error'
                });
            }
        } catch (e) {
            console.error(e);
            showNotification({
                message: 'Error updating role',
                type: 'error'
            });
        }
    };

    const updateTeamManager = async (teamId: number, managerId: string) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/teams/${teamId}/manager`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ managerId: managerId === 'none' ? null : Number(managerId), requesterId: user?.id })
            });
            const result = await res.json();
            if (result.success) {
                setTeams(teams.map(t => t.id === teamId ? { ...t, managerId: managerId === 'none' ? null : Number(managerId) } : t));
                showNotification({
                    message: 'Team manager updated',
                    type: 'success'
                });
            } else {
                showNotification({
                    message: result.error || 'Failed to update team manager',
                    type: 'error'
                });
            }
        } catch (e) {
            console.error(e);
            showNotification({
                message: 'Error updating team manager',
                type: 'error'
            });
        }
    };

    const handleSeedData = async () => {
        if (!confirm('This will seed 3 managers and 6 test teams. Proceed?')) return;
        setSeeding(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/seed/managers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterId: user?.id })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({
                    message: 'Test data seeded successfully!',
                    type: 'success'
                });
                fetchUsers();
                fetchTeams();
            } else {
                showNotification({
                    message: result.error || 'Failed to seed data',
                    type: 'error'
                });
            }
        } catch (e) {
            console.error(e);
            showNotification({
                message: 'Error seeding data',
                type: 'error'
            });
        } finally {
            setSeeding(false);
        }
    };

    const handleRemoveSponsor = async (id: number) => {
        if (!confirm('Are you sure you want to remove this partner? This action cannot be undone.')) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/sponsors/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterId: user?.id })
            });
            const result = await res.json();
            if (result.success) {
                setSponsors(sponsors.filter(s => s.id !== id));
                showNotification({
                    message: 'Partner removed successfully',
                    type: 'success'
                });
            } else {
                showNotification({
                    message: result.error || 'Failed to remove sponsor',
                    type: 'error'
                });
            }
        } catch (e) {
            console.error("Error removing sponsor:", e);
            showNotification({
                message: 'Error removing sponsor',
                type: 'error'
            });
        }
    };

    const handleUpdateTier = async (id: number, newTier: string) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/sponsors/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier: newTier, requesterId: user?.id })
            });

            const result = await res.json();
            if (result.success) {
                setSponsors(sponsors.map(s => s.id === id ? { ...s, tier: newTier } : s));
                showNotification({
                    message: `Partner tier updated to ${newTier}`,
                    type: 'success'
                });
            } else {
                console.error("Update failed:", result);
                showNotification({
                    message: `Failed to update partner tier: ${result.error || result.details || 'Unknown error'}`,
                    type: 'error'
                });
            }
        } catch (e) {
            console.error("Error updating sponsor:", e);
            showNotification({
                message: `Error updating sponsor: ${e instanceof Error ? e.message : 'Unknown error'}`,
                type: 'error'
            });
        }
    };

    const handlePushTelemetry = async () => {
        setPushingTelemetry(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/reports/telemetry/push`, {
                method: 'POST'
            });
            const result = await res.json();
            if (result.success) {
                showNotification({
                    message: `SUCCESS: ${result.data?.message || result.message}. Royal Performance Edict dispatched.`,
                    type: 'success',
                    duration: 8000
                });
            } else {
                showNotification({
                    message: result.error || 'Telemetry push failed',
                    type: 'error'
                });
            }
        } catch (e) {
            console.error(e);
            showNotification({
                message: 'Error pushing telemetry',
                type: 'error'
            });
        } finally {
            setPushingTelemetry(false);
        }
    };

    const filteredUsers = users.filter(u =>
        (u.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (u.role && u.role.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const filteredTeamsList = teams.filter(t =>
        (t.name?.toLowerCase() || '').includes(squadSearchTerm.toLowerCase()) ||
        (t.game?.toLowerCase() || '').includes(squadSearchTerm.toLowerCase())
    );

    const filteredManagers = users
        .filter(u => u.role === 'manager' || u.role === 'admin' || u.role === 'ceo')
        .filter(m => (m.name?.toLowerCase() || '').includes(managerSearchTerm.toLowerCase()));

    const totalPages = Math.ceil(filteredManagers.length / MANAGERS_PER_PAGE);
    const currentManagers = filteredManagers.slice(
        (managerCurrentPage - 1) * MANAGERS_PER_PAGE,
        managerCurrentPage * MANAGERS_PER_PAGE
    );

    // Filtered Stats for Intelligence Hub
    const availableGames = GAME_TITLES;

    // Map team names/IDs to games for filtering teamSummaries
    const teamToGameMap: Record<string, string> = {};
    teams.forEach(t => {
        teamToGameMap[t.id] = t.game;
        teamToGameMap[t.name] = t.game; // Cover both name and ID lookups
    });

    const getFilteredWeeklyStats = (): { wins: number; losses: number; total: number; summaries: any[] } | null => {
        if (!weeklyReport) return null;

        let filteredSummaries: any[] = Object.values(weeklyReport.teamSummaries);
        if (selectedGame !== 'All') {
            filteredSummaries = filteredSummaries.filter((t: any) => teamToGameMap[t.name] === selectedGame);
        }

        const wins = filteredSummaries.reduce((acc: number, t: any) => acc + (t.wins || 0), 0);
        const losses = filteredSummaries.reduce((acc: number, t: any) => acc + (t.losses || 0), 0);
        const total = filteredSummaries.reduce((acc: number, t: any) => acc + (t.total || 0), 0);

        return {
            wins,
            losses,
            total,
            summaries: filteredSummaries
        };
    };

    const filteredStats = getFilteredWeeklyStats();

    return (
        <div className="grid grid-cols-1 gap-16">
            {error && (
                <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-500 text-sm font-bold text-center animate-pulse">
                    CRITICAL ERROR: {error}
                </div>
            )}

            {/* 1. Add Role / User Management */}
            <div
                id="personnel"
                className="p-10 glass rounded-[40px] relative overflow-hidden group"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 md:mb-12">
                    <div className="text-center md:text-left w-full md:w-auto">
                        <h3 className="text-xl md:text-2xl font-black text-[var(--text-color)] flex items-center justify-center md:justify-start tracking-tight">
                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 mr-4 border border-amber-500/20 shadow-[0_0_15px_rgba(251,191,36,0.1)]">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            Personnel Auth
                        </h3>
                        <p className="text-[8px] md:text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mt-2 md:ml-14">Identity Access Management</p>
                    </div>
                    <div className="relative w-full md:w-auto">
                        <input
                            type="text"
                            placeholder="Find Operative..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-72 pl-12 pr-6 py-3 md:py-4 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] md:text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner"
                        />
                        <svg className="w-4 h-4 text-amber-500/60 absolute left-4 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                </div>

                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-50/90 dark:bg-[#0d0d14]/90 backdrop-blur-md z-10">
                            <tr className="border-b border-black/5 dark:border-white/5 text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em]">
                                <th className="pb-6 pt-2 px-4 whitespace-nowrap">Operative</th>
                                <th className="pb-6 pt-2 whitespace-nowrap">Encrypted ID</th>
                                <th className="pb-6 pt-2 whitespace-nowrap">Clearance</th>
                                <th className="pb-6 pt-2 whitespace-nowrap">Auth Update</th>
                                <th className="pb-6 pt-2 text-right pr-4 whitespace-nowrap">Profile</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {filteredUsers.map((u) => (
                                <tr key={u.id} className="group hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                                    <td className="py-5 px-4 flex items-center space-x-4">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600/20 to-amber-500/20 p-[1px] group-hover:p-[1.5px] transition-all">
                                            <img src={u.avatar || `https://ui-avatars.com/api/?name=${u.name}`} className="w-full h-full rounded-[10px] object-cover" />
                                        </div>
                                        <span className="font-black text-[var(--text-color)] text-sm tracking-tight">{u.name}</span>
                                    </td>
                                    <td className="py-5 text-slate-500 dark:text-slate-400 font-mono text-[11px] opacity-60 group-hover:opacity-100 transition-opacity">{u.email}</td>
                                    <td className="py-5">
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${u.role === 'admin' || u.role === 'ceo' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
                                            u.role === 'manager' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-black/5 dark:border-white/5'
                                            }`}>
                                            {u.role}
                                        </span>
                                    </td>
                                    <td className="py-5">
                                        <select
                                            value={u.role}
                                            onChange={(e) => updateUserRole(u.id, e.target.value)}
                                            className="bg-white dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-color)] focus:outline-none focus:border-amber-500/50 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-black/80 transition-all"
                                        >
                                            {ROLES.map(role => (
                                                <option key={role} value={role}>{role.toUpperCase()}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="py-5 text-right pr-4">
                                        <button
                                            onClick={() => onViewProfile(u.id)}
                                            className="px-3 md:px-4 py-1.5 md:py-2 bg-black/5 dark:bg-white/5 text-amber-600 dark:text-amber-500 hover:bg-amber-500 hover:text-black text-[8px] md:text-[9px] font-black uppercase tracking-widest rounded-xl transition-all border border-amber-500/20"
                                        >
                                            Inquire
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-500">No users found matching "{searchTerm}"</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 1b. Squad Intelligence Registry */}
            <div
                id="squads"
                className="p-10 glass rounded-[40px] relative overflow-hidden group"
            >
                <div className="absolute top-0 right-0 w-1/3 h-1 bg-gradient-to-l from-transparent via-cyan-500/40 to-transparent" />
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 md:mb-12">
                    <div className="text-center md:text-left w-full md:w-auto">
                        <h3 className="text-xl md:text-2xl font-black text-[var(--text-color)] flex items-center justify-center md:justify-start tracking-tight">
                            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 mr-4 border border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.1)]">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                            </div>
                            Squad Registry
                        </h3>
                        <p className="text-[8px] md:text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mt-2 md:ml-14">Unit Roster & Game Allocation</p>
                    </div>
                    <div className="relative w-full md:w-auto">
                        <input
                            type="text"
                            placeholder="Find Squad..."
                            value={squadSearchTerm}
                            onChange={(e) => setSquadSearchTerm(e.target.value)}
                            className="w-full md:w-72 pl-12 pr-6 py-3 md:py-4 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] md:text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-inner"
                        />
                        <svg className="w-4 h-4 text-cyan-500/60 absolute left-4 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                </div>

                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-slate-50/90 dark:bg-[#0d0d14]/90 backdrop-blur-md z-10">
                            <tr className="border-b border-black/5 dark:border-white/5 text-slate-500 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em]">
                                <th className="pb-6 pt-2 px-4 whitespace-nowrap">Squad Name</th>
                                <th className="pb-6 pt-2 whitespace-nowrap">Theater (Game)</th>
                                <th className="pb-6 pt-2 whitespace-nowrap">Command (Manager)</th>
                                <th className="pb-6 pt-2 text-center whitespace-nowrap">Operatives</th>
                                <th className="pb-6 pt-2 text-right pr-4 whitespace-nowrap">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {filteredTeamsList.map((t) => {
                                const manager = users.find(u => u.id === t.managerId);
                                return (
                                    <tr
                                        key={t.id}
                                        onClick={() => setSelectedSquadForModal(t)}
                                        className="group hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
                                    >
                                        <td className="py-5 px-4">
                                            <span className="font-black text-[var(--text-color)] text-sm tracking-tight">{t.name}</span>
                                        </td>
                                        <td className="py-5">
                                            <span className="px-3 py-1 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 rounded-full text-[9px] font-black uppercase tracking-widest">
                                                {t.game}
                                            </span>
                                        </td>
                                        <td className="py-5 text-slate-500 dark:text-slate-400 text-xs font-bold italic">
                                            {manager ? manager.name : 'UNASSIGNED'}
                                        </td>
                                        <td className="py-5 flex justify-center">
                                            <div className="flex -space-x-2">
                                                {t.players?.slice(0, 3).map((p: any, i: number) => (
                                                    <img key={i} src={p.image || `https://ui-avatars.com/api/?name=${p.name}`} className="w-6 h-6 rounded-full border-2 border-[#0d0d14] object-cover" title={p.name} />
                                                ))}
                                                {t.players?.length > 3 && (
                                                    <div className="w-6 h-6 rounded-full bg-slate-800 border-2 border-[#0d0d14] flex items-center justify-center text-[7px] font-black text-white">
                                                        +{t.players.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-5 text-right pr-4">
                                            <span className="w-2 h-2 inline-block bg-emerald-500 rounded-full animate-pulse mr-2" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Active</span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredTeamsList.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-slate-500">No squads found matching "{squadSearchTerm}"</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 1c. Manager Handles Overview */}
            <div
                id="managers"
                className="p-10 glass rounded-[40px] relative overflow-hidden group"
            >
                <div className="absolute top-0 right-0 p-8">
                    <div className="w-32 h-32 bg-purple-500/5 blur-[80px] rounded-full group-hover:bg-purple-500/10 transition-all duration-1000" />
                </div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 md:mb-10 relative z-10">
                    <div className="text-center md:text-left w-full md:w-auto">
                        <h3 className="text-xl md:text-2xl font-black text-[var(--text-color)] flex items-center justify-center md:justify-start tracking-tight">
                            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 mr-4 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            </div>
                            Manager Ops
                        </h3>
                        <p className="text-[8px] md:text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mt-2 md:ml-14">Strategic Resource Allocation</p>
                    </div>
                    <div className="relative w-full md:w-auto">
                        <input
                            type="text"
                            placeholder="Search Manager..."
                            value={managerSearchTerm}
                            onChange={(e) => {
                                setManagerSearchTerm(e.target.value);
                                setManagerCurrentPage(1);
                            }}
                            className="w-full md:w-64 pl-10 pr-4 py-3 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-color)] focus:outline-none focus:border-purple-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-700 shadow-inner"
                        />
                        <svg className="w-3.5 h-3.5 text-purple-500/60 absolute left-4 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 relative z-10 px-4 md:px-0">
                    {currentManagers.map(manager => {
                        const managedTeams = teams.filter(t => t.managerId === manager.id);
                        return (
                            <div key={manager.id} className="bg-white dark:bg-black/40 backdrop-blur-xl p-6 md:p-8 rounded-[32px] border border-slate-200 dark:border-white/5 hover:border-amber-500/30 transition-all shadow-soft group/card">
                                <div className="flex items-center space-x-4 mb-8">
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-amber-500 p-[2px] shadow-lg">
                                            <img src={manager.avatar || `https://ui-avatars.com/api/?name=${manager.name}`} className="w-full h-full rounded-[14px] border-2 border-slate-900 object-cover" />
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-4 border-white dark:border-slate-900 shadow-lg" />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-[var(--text-color)] text-lg leading-tight tracking-tight">{manager.name}</h4>
                                        <span className="text-[9px] uppercase font-black text-amber-600 dark:text-amber-500 tracking-[0.2em]">{manager.role}</span>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Active Handles</p>
                                        <span className="text-[11px] px-3 py-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[var(--text-color)] rounded-full font-black">{managedTeams.length}</span>
                                    </div>
                                    <div className="space-y-3 max-h-[240px] overflow-y-auto custom-scrollbar pr-2">
                                        {managedTeams.length > 0 ? managedTeams.map(t => (
                                            <div key={t.id} className="group/team flex justify-between items-center p-4 bg-slate-50 dark:bg-white/[0.03] rounded-2xl border border-slate-200 dark:border-white/5 hover:border-purple-500/40 transition-all shadow-inner">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-black text-[var(--text-color)] tracking-tight">{t.name}</span>
                                                    <span className="text-[9px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest">{t.game}</span>
                                                </div>
                                                <button
                                                    onClick={() => updateTeamManager(t.id, 'none')}
                                                    className="opacity-0 group-hover/team:opacity-100 p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                                                    title="Revoke Assignment"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        )) : (
                                            <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-white/5 rounded-2xl">
                                                <p className="text-[10px] text-slate-400 dark:text-slate-600 font-black uppercase tracking-widest">No Active Units</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Quick Assign */}
                                    <div className="pt-6 border-t border-slate-200 dark:border-white/5 mt-6">
                                        <p className="text-[9px] uppercase font-black text-slate-500 mb-2 tracking-widest">Authorize Unit</p>
                                        <div className="space-y-2">
                                            <div className="relative group/search">
                                                <input
                                                    type="text"
                                                    placeholder="Filter teams..."
                                                    value={assignSquadSearch}
                                                    onChange={e => {
                                                        setAssignSquadSearch(e.target.value);
                                                        setShowAssignSquadList(true);
                                                    }}
                                                    className={`w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 ${(assignSquadSearch && showAssignSquadList) || showAssignSquadList ? 'rounded-t-lg border-b-0' : 'rounded-lg'} px-4 py-2 text-[9px] font-bold text-[var(--text-color)] focus:outline-none focus:border-purple-500 transition-all placeholder:text-slate-400 pr-10`}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAssignSquadList(!showAssignSquadList)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-purple-500 transition-colors"
                                                >
                                                    <svg className={`w-3.5 h-3.5 transform transition-transform ${showAssignSquadList ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                                </button>
                                            </div>
                                            {showAssignSquadList && (
                                                <select
                                                    value="none"
                                                    onChange={(e) => {
                                                        if (e.target.value !== 'none') {
                                                            const team = teams.find(t => t.id === Number(e.target.value));
                                                            updateTeamManager(Number(e.target.value), manager.id.toString());
                                                            setAssignSquadSearch(team?.name || '');
                                                            setShowAssignSquadList(false);
                                                        }
                                                    }}
                                                    className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-b-xl px-4 py-3 text-[10px] font-black tracking-widest text-amber-600 dark:text-amber-500 uppercase focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer hover:bg-slate-100 dark:hover:bg-black/60 transition-all"
                                                    size={Math.min(teams.filter(t => !t.managerId && t.name.toLowerCase().includes(assignSquadSearch.toLowerCase())).length + 1, 5)}
                                                >
                                                    <option value="none">-- Select Team --</option>
                                                    {teams.filter(t => !t.managerId && t.name.toLowerCase().includes(assignSquadSearch.toLowerCase())).map(t => (
                                                        <option key={t.id} value={t.id}>{t.name} ({t.game})</option>
                                                    ))}
                                                    {teams.filter(t => !t.managerId && t.name.toLowerCase().includes(assignSquadSearch.toLowerCase())).length === 0 && <option disabled>No units match</option>}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="mt-8 md:mt-12 flex items-center justify-center space-x-4 md:space-x-6 relative z-10">
                        <button
                            onClick={() => setManagerCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={managerCurrentPage === 1}
                            className="p-3 md:p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent shadow-xl"
                        >
                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div className="px-4 md:px-6 py-2 bg-purple-600/10 border border-purple-500/20 rounded-xl">
                            <span className="text-[8px] md:text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] md:tracking-[0.3em]">
                                Sector {managerCurrentPage} / {totalPages}
                            </span>
                        </div>
                        <button
                            onClick={() => setManagerCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={managerCurrentPage === totalPages}
                            className="p-3 md:p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent shadow-xl"
                        >
                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                )}

                {filteredManagers.length === 0 && (
                    <div className="text-center py-24 relative z-10">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5">
                            <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.4em]">No matching signals found in sector.</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-4 md:px-0">
                {/* Log Achievement */}
                <div
                    id="achievements"
                    className="p-6 md:p-10 glass rounded-[30px] md:rounded-[40px] relative group overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-8">
                        <div className="w-24 h-24 bg-amber-500/10 blur-[60px] rounded-full animate-pulse" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-black text-[var(--text-color)] mb-6 md:mb-10 flex items-center justify-center md:justify-start tracking-tight relative z-10">
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 mr-4 border border-amber-500/20 shadow-[0_0_15px_rgba(251,191,36,0.1)]">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        Add Achievement
                    </h3>
                    <div className="relative z-10">
                        <AddAchievementForm requesterId={user?.id} />
                    </div>
                </div>

                {/* Schedule Event */}
                <div
                    id="schedule"
                    className="p-6 md:p-10 glass rounded-[30px] md:rounded-[40px] relative group overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-8">
                        <div className="w-24 h-24 bg-blue-500/10 blur-[60px] rounded-full animate-pulse" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-black text-[var(--text-color)] mb-6 md:mb-10 flex items-center justify-center md:justify-start tracking-tight relative z-10">
                        <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 mr-4 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        Add Event
                    </h3>
                    <div className="relative z-10">
                        <AddEventForm requesterId={user?.id} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Onboard Partner */}
                <div
                    id="onboard"
                    className="p-10 glass rounded-[40px] relative group overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-8">
                        <div className="w-24 h-24 bg-emerald-500/10 blur-[60px] rounded-full animate-pulse" />
                    </div>
                    <h3 className="text-2xl font-black text-[var(--text-color)] mb-10 flex items-center tracking-tight relative z-10">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 mr-4 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </div>
                        Onboard Partner
                    </h3>
                    <div className="relative z-10">
                        <AddSponsorForm users={users} requesterId={user?.id} />
                    </div>
                </div>

                {/* Partner Report */}
                <div
                    id="partners"
                    className="p-10 glass rounded-[40px] relative group overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-8">
                        <div className="w-24 h-24 bg-pink-500/10 blur-[60px] rounded-full animate-pulse" />
                    </div>
                    <div className="flex justify-between items-center mb-10 relative z-10">
                        <h3 className="text-2xl font-black text-[var(--text-color)] flex items-center tracking-tight">
                            <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 mr-4 border border-pink-500/20 shadow-[0_0_15px_rgba(236,72,153,0.1)]">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </div>
                            Partner Report
                        </h3>
                    </div>

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-8 p-6 bg-white/5 rounded-2xl border border-white/10">
                            <div>
                                <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest">Total Active Partners</p>
                                <p className="text-3xl font-black text-[var(--text-color)] mt-1">{sponsors.length}</p>
                            </div>
                            <div className="w-12 h-12 rounded-full bg-pink-500/10 flex items-center justify-center border border-pink-500/20 text-pink-500">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                        </div>

                        <div className="space-y-3 max-h-[330px] overflow-y-auto custom-scrollbar pr-2">
                            {sponsors.length > 0 ? sponsors.map((s, idx) => (
                                <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 hover:border-pink-500/30 transition-all group/partner">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-10 h-10 rounded-lg bg-white p-1">
                                            <img src={s.logo} alt={s.name} className="w-full h-full object-contain mix-blend-multiply" />
                                        </div>
                                        <div>
                                            <p className="font-black text-sm text-[var(--text-color)]">{s.name}</p>
                                            <select
                                                value={s.tier}
                                                onChange={(e) => handleUpdateTier(s.id, e.target.value)}
                                                className="mt-1 bg-black/20 border border-white/10 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-wider focus:outline-none focus:border-cyan-500/50 cursor-pointer hover:bg-black/40 transition-all"
                                            >
                                                {['Bronze', 'Silver', 'Gold', 'Platinum'].map(tier => (
                                                    <option key={tier} value={tier} className="bg-[#0f172a] text-slate-300">{tier} Tier</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2 opacity-0 group-hover/partner:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleRemoveSponsor(s.id)}
                                            className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                            title="Remove Partner"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-8 opacity-50">
                                    <p className="text-xs font-bold text-slate-500">No partners initialized.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. Tactical Intelligence - Scrim & Tournament Analytics */}
            <div
                id="tactical"
                className="p-8 glass rounded-[40px] relative overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <div className="absolute top-0 right-0 p-8">
                    <div className="w-24 h-24 bg-amber-500/5 blur-[80px] rounded-full" />
                </div>
                <TacticalIntelGraphs availableTeams={teams} userRole={user?.role} />
            </div>

            {/* 6. Weekly Summary Reporting Hub - NEW */}
            <div
                id="intel"
                className="p-10 glass rounded-[48px] group overflow-hidden"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-600/50 via-amber-500/50 to-cyan-600/50" />
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
                    <div>
                        <h3 className="text-3xl font-black text-[var(--text-color)] flex items-center tracking-tighter">
                            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 mr-5 border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            Citadel Weekly Intelligence Hub
                        </h3>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-3 ml-16">High-Authority Performance Aggregation</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <select
                            value={selectedReportId}
                            onChange={(e) => fetchHistoricalReport(e.target.value)}
                            className="px-4 py-2.5 bg-white/5 rounded-2xl border border-white/10 text-[10px] font-black tracking-[0.2em] text-cyan-400 uppercase shadow-inner outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
                            style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                        >
                            <option value="live" className="bg-slate-900 text-cyan-400">
                                {(() => {
                                    const d = new Date();
                                    const day = d.getDay();
                                    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                                    const start = new Date(d.setDate(diff));
                                    const end = new Date(start);
                                    end.setDate(end.getDate() + 6);
                                    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
                                    return `Live Week: ${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}`;
                                })()}
                            </option>
                            {(() => {
                                const seenRanges = new Set<string>();
                                return reportHistory.filter(h => {
                                    const key = `${h.weekStart}-${h.weekEnd}`;
                                    if (seenRanges.has(key)) return false;
                                    seenRanges.add(key);
                                    return true;
                                }).map((h) => (
                                    <option key={h.id} value={h.id} className="bg-slate-900 text-slate-300">
                                        Archive: {new Date(h.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(h.weekEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </option>
                                ));
                            })()}
                        </select>
                        <div className="px-6 py-3 bg-white/5 rounded-2xl border border-white/10 text-[10px] font-black tracking-[0.2em] text-cyan-400 uppercase shadow-inner">
                            EPOCH: {selectedReportId === 'live' ? new Date().toLocaleDateString() : (reportHistory.find(h => String(h.id) === selectedReportId)?.weekStart || 'PAST')} // STATUS: {selectedReportId === 'live' ? 'SECURE' : 'ARCHIVED'}
                        </div>
                    </div>
                </div>

                {filteredStats ? (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Card 1: Org Velocity */}
                        <div className="bg-black/30 p-6 rounded-[28px] border border-white/5 hover:border-cyan-500/20 transition-all group/stat flex flex-col gap-4">
                            <p className="text-[9px] uppercase font-black text-slate-500 tracking-[0.3em] group-hover/stat:text-cyan-400 transition-colors">Org Velocity</p>
                            <div className="text-4xl font-black text-white tracking-tighter">{weeklyReport.summary?.orgVelocity || 0}</div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Ops This Week</p>
                            <div className="px-3 py-2 bg-cyan-500/5 border border-cyan-500/10 rounded-xl">
                                <p className="text-[8px] text-cyan-400 font-black uppercase tracking-widest">Pending: {weeklyReport.summary?.pendingScrims || 0}</p>
                            </div>
                            <div className="flex gap-3 mt-auto">
                                <span className="px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">Scrims</span>
                                <span className="px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">Tournaments</span>
                            </div>
                        </div>

                        {/* Card 2: Combat Outcome W/L */}
                        <div className="bg-black/30 p-6 rounded-[28px] border border-white/5 hover:border-amber-500/20 transition-all group/stat flex flex-col gap-4">
                            <p className="text-[9px] uppercase font-black text-slate-500 tracking-[0.3em] group-hover/stat:text-amber-500 transition-colors">Combat Outcome</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-amber-400 tracking-tighter">{weeklyReport.summary?.wins || 0}W</span>
                                <span className="text-slate-700 font-black">/</span>
                                <span className="text-3xl font-black text-red-400 tracking-tighter">{weeklyReport.summary?.losses || 0}L</span>
                                {weeklyReport.summary?.pendingScrims > 0 && (
                                    <span className="text-xs font-black text-slate-500 ml-1">({weeklyReport.summary?.pendingScrims}P)</span>
                                )}
                            </div>
                            {/* W/L progress bar */}
                            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-700"
                                    style={{ width: `${(weeklyReport.summary?.wins + weeklyReport.summary?.losses) > 0 ? Math.round((weeklyReport.summary?.wins / (weeklyReport.summary?.wins + weeklyReport.summary?.losses)) * 100) : 0}%` }}
                                />
                            </div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Victory Vector</p>
                        </div>

                        {/* Card 3: Win Rate Radial Ring */}
                        <div className="bg-black/30 p-6 rounded-[28px] border border-white/5 hover:border-emerald-500/20 transition-all group/stat flex flex-col items-center justify-center">
                            <p className="text-[9px] uppercase font-black text-slate-500 tracking-[0.3em] mb-4 self-start group-hover/stat:text-emerald-400 transition-colors">Win Rate</p>
                            {(() => {
                                const totalCompleted = (weeklyReport.summary?.wins || 0) + (weeklyReport.summary?.losses || 0);
                                const pct = totalCompleted > 0 ? Math.round((weeklyReport.summary?.wins / totalCompleted) * 100) : 0;
                                const r = 38; const circ = 2 * Math.PI * r;
                                const arc = (pct / 100) * circ;
                                return (
                                    <div className="relative w-28 h-28">
                                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                            <circle cx="50" cy="50" r={r} fill="none" stroke="#ffffff08" strokeWidth="10" />
                                            <circle cx="50" cy="50" r={r} fill="none"
                                                stroke="url(#wrGrad)" strokeWidth="10"
                                                strokeDasharray={`${arc} ${circ - arc}`}
                                                strokeLinecap="round"
                                                className="transition-all duration-700"
                                            />
                                            <defs>
                                                <linearGradient id="wrGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#10b981" />
                                                    <stop offset="100%" stopColor="#fbbf24" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-xl font-black text-white tracking-tighter">{pct}%</span>
                                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">WIN</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Card 4: Team Division Summaries (full row) */}
                        <div className="bg-black/30 p-6 rounded-[28px] border border-white/5 hover:border-purple-500/20 transition-all group/stat">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-[9px] uppercase font-black text-slate-500 tracking-[0.3em] group-hover/stat:text-purple-400 transition-colors">Division Summaries</p>
                                <select
                                    value={selectedGame}
                                    onChange={(e) => setSelectedGame(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-cyan-400 focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer hover:bg-black/60 transition-all"
                                >
                                    <option value="All">All Ops</option>
                                    {availableGames.map(game => (
                                        <option key={game} value={game}>{game.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                                {filteredStats.summaries.length > 0 ? filteredStats.summaries.map((t: any, idx: number) => {
                                    const wr = Math.round((t.wins / (t.total || 1)) * 100);
                                    return (
                                        <div key={idx} className="group/row">
                                            <div className="flex justify-between items-center mb-1">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-300 tracking-tight">{t.name}</span>
                                                    {selectedGame === 'All' && (
                                                        <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">{teamToGameMap[t.name] || 'Unknown'}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">{t.wins}W</span>
                                                    <span className="text-[9px] font-black px-2 py-0.5 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20">{t.losses}L</span>
                                                    <span className="font-black text-[10px] text-amber-400 w-12 text-right">{wr}%</span>
                                                </div>
                                            </div>
                                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${wr}%`, background: wr >= 60 ? '#10b981' : wr >= 40 ? '#fbbf24' : '#ef4444' }} />
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="py-8 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest opacity-50">
                                        Zero Intel in Sector
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-20 text-center border-2 border-dashed border-slate-200 dark:border-white/5 rounded-[40px] group-hover:border-amber-500/20 transition-all">
                        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-6" />
                        <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.5em] animate-pulse">Synchronizing Intelligence Streams...</p>
                    </div>
                )}

                <div className="mt-12 mb-12 flex justify-end">
                    <button
                        onClick={handlePushTelemetry}
                        disabled={pushingTelemetry}
                        className={`px-10 py-5 bg-gradient-to-r from-cyan-600 to-cyan-800 hover:from-cyan-500 hover:to-cyan-700 text-white font-black uppercase tracking-[0.3em] text-[10px] rounded-2xl transition-all shadow-[0_15px_40px_rgba(8,145,178,0.2)] active:scale-95 flex items-center group/btn border border-white/10 ${pushingTelemetry ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {pushingTelemetry ? (
                            <div className="flex items-center">
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-3" />
                                Transmitting...
                            </div>
                        ) : (
                            <>
                                <svg className="w-5 h-5 mr-3 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                Push Telemetry to CEO
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* 7. Partner Store Logistics - NEW */}
            <div
                id="sponsor-zone"
                className="mt-12 p-10 bg-[#0f091a] rounded-[48px] border-2 border-dashed border-purple-500/30 group overflow-hidden relative"
            >
                <div className="absolute top-0 right-0 p-8">
                    <div className="w-48 h-48 bg-purple-600/5 blur-[100px] rounded-full group-hover:bg-purple-600/10 transition-colors duration-1000" />
                </div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12 relative z-10">
                    <div>
                        <h3 className="text-3xl font-black text-white flex items-center tracking-tighter">
                            <div className="p-2.5 rounded-2xl bg-purple-500 text-black mr-5 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            </div>
                            Partner Store Logistics
                        </h3>
                        <p className="text-[10px] text-purple-400 font-black uppercase tracking-[0.4em] mt-3 ml-16">Global Supply Chain Management</p>
                    </div>
                </div>

                {/* Embed the SponsorZone component here */}
                <div className="mt-8">
                    <SponsorZone />
                </div>
            </div>

            <div className="mt-16 text-center opacity-40 hover:opacity-100 transition-opacity">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.5em]">
                    Royalty Aesthetic // Immutable // Protocol Secure
                </p>
            </div>
            {/* Squad Detail Modal */}
            <Modal isOpen={!!selectedSquadForModal} onClose={() => setSelectedSquadForModal(null)} zIndex={100} backdropClassName="bg-white/10 dark:bg-black/60 backdrop-blur-md animate-in fade-in duration-300" className="w-full max-w-4xl">
                {selectedSquadForModal && <div className="relative w-full max-w-4xl glass rounded-[48px] shadow-[0_64px_128px_-32px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 fade-in duration-300">
                    {/* Modal Header */}
                    <div className="p-10 border-b border-black/5 dark:border-white/5 flex justify-between items-center relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500 to-cyan-500/0" />
                        <div>
                            <h2 className="text-3xl font-black text-[var(--text-color)] dark:text-white uppercase tracking-tight flex items-center gap-4">
                                <span className="bg-cyan-500 text-black px-3 py-1 rounded-lg text-lg leading-none">UNIT</span>
                                {selectedSquadForModal.name}
                            </h2>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em] mt-3">{selectedSquadForModal.game} // Operational Roster Overview</p>
                        </div>
                        <button
                            onClick={() => setSelectedSquadForModal(null)}
                            className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:text-cyan-500 hover:scale-110 transition-all border border-black/5 dark:border-white/10"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Modal Content */}
                    <div className="p-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {selectedSquadForModal.players?.map((p: any) => (
                                <div key={p.id} className="group/player p-6 bg-black/5 dark:bg-white/5 rounded-[32px] border border-black/5 dark:border-white/5 hover:border-cyan-500/30 transition-all flex items-center justify-between">
                                    <div className="flex items-center space-x-5">
                                        <div className="relative">
                                            <img
                                                src={p.image || `https://ui-avatars.com/api/?name=${p.name}`}
                                                className="w-16 h-16 rounded-2xl object-cover ring-4 ring-cyan-500/10 shadow-xl group-hover/player:scale-105 transition-transform"
                                                alt={p.name}
                                            />
                                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-[#0d0d14]" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-black text-[var(--text-color)] dark:text-white uppercase tracking-tight leading-none mb-1">{p.name}</p>
                                            <p className="text-[10px] text-cyan-500 font-black uppercase tracking-widest">{p.role || 'Unassigned Role'}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!window.confirm('Are you sure you want to remove this operative?')) return;
                                            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/teams/${selectedSquadForModal.id}/players/${p.id}?requesterId=${user?.id}`, {
                                                method: 'DELETE'
                                            });
                                            const result = await res.json();
                                            if (result.success) {
                                                showNotification({ message: 'Operative removed.', type: 'success' });
                                                const resTeams = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/teams`);
                                                const resTeamsResult = await resTeams.json();
                                                if (resTeamsResult.success) {
                                                    setTeams(resTeamsResult.data);
                                                    const updatedSquad = resTeamsResult.data.find((t: any) => t.id === selectedSquadForModal.id);
                                                    if (updatedSquad) setSelectedSquadForModal(updatedSquad);
                                                }
                                            } else {
                                                showNotification({ message: result.error || 'Failed to remove operative', type: 'error' });
                                            }
                                        }}
                                        className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border border-red-500/20 group-hover/player:scale-105"
                                    >
                                        Decommission
                                    </button>
                                </div>
                            ))}
                            {(!selectedSquadForModal.players || selectedSquadForModal.players.length === 0) && (
                                <div className="col-span-full py-20 text-center border-2 border-dashed border-black/5 dark:border-white/5 rounded-[40px]">
                                    <p className="text-[12px] text-slate-500 font-black uppercase tracking-[0.5em]">Unit strength at zero capacity</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="p-10 bg-black/[0.02] dark:bg-white/[0.02] border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <div className="flex items-center gap-4">
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                                Total Strength: {selectedSquadForModal.players?.length || 0} Ops
                            </span>
                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                            <span>Status: Combat Ready</span>
                        </div>
                        <div className="text-cyan-500/60">
                            Global Tactical Oversight Dashboard
                        </div>
                    </div>
                </div>}
            </Modal>
        </div >
    );
};

export default AdminPanel;
