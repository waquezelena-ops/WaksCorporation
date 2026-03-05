import React, { useState, useEffect, useMemo } from 'react';
import { useNotification } from '../hooks/useNotification';
import { GET_API_BASE_URL } from '../utils/apiUtils';
import { VALORANT_AGENTS } from './constants';
import { GAME_MAPS, GAME_CATEGORY, VALORANT_ROLES, VALORANT_AGENT_ROLE_MAP } from './constants';
import Modal from './Modal';
import QuotaManagementView from './QuotaManagementView';
import PlayerStatsModal, { PlayerStats } from './PlayerStatsModal';
import { calculateKDA, getKDAColor, getAgentImage } from '../utils/tactical';

interface Team {
    id: number;
    name: string;
    game: string;
    players: Array<{ id: number, userId?: number, name: string, image?: string }>;
}

interface Scrim {
    id: number;
    teamId: number;
    date: string;
    opponent: string;
    format: string;
    status: 'pending' | 'completed' | 'cancelled';
    results?: string; // JSON string of result metadata
    maps?: string; // JSON string of map names
}

interface PlayerStat {
    name: string;
    kills: number;
    deaths: number;
    assists: number;
    acs?: number;
    playerId?: number;
    isWin?: boolean;
    agent?: string;
    role?: string;
}


const TeamManagement: React.FC<{
    userId?: number;
    userRole?: string;
    lockedTeamId?: number;
    mode?: 'scrim' | 'tournament';
    onViewChange?: (view: 'list' | 'calendar' | 'add-scrim' | 'upload-result' | 'quota') => void;
    onBack?: () => void;
}> = ({ userId, userRole, lockedTeamId, mode = 'scrim', onViewChange, onBack }) => {
    const isTournament = mode === 'tournament';
    const [view, setView] = useState<'list' | 'calendar' | 'add-scrim' | 'upload-result' | 'quota'>('calendar');
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
    const [scrims, setScrims] = useState<Scrim[]>([]);
    const { showNotification } = useNotification();

    const [selectedPlayerForStats, setSelectedPlayerForStats] = useState<PlayerStats | null>(null);
    const [isPlayerStatsModalOpen, setIsPlayerStatsModalOpen] = useState(false);

    const getMondayISO = (d: Date) => {
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

    const [selectedWeek, setSelectedWeek] = useState(getMondayISO(new Date()));

    const currentTeam = teams.find(t => Number(t.id) === Number(selectedTeamId || lockedTeamId));
    const isValorantFamily = currentTeam?.game?.toLowerCase().includes('valorant') || false;

    // Add Scrim Form State
    const [scrimDate, setScrimDate] = useState('');
    const [scrimOpponent, setScrimOpponent] = useState('');
    const [scrimFormat, setScrimFormat] = useState('BO1');
    const [selectedMaps, setSelectedMaps] = useState<string[]>([]);

    // Upload Result State
    const [selectedScrimId, setSelectedScrimId] = useState<number | null>(null);
    const [scrimActionModal, setScrimActionModal] = useState<{ date: Date, scrims: Scrim[] } | null>(null);
    const [scrimDetailModal, setScrimDetailModal] = useState<Scrim & { stats?: any[] } | null>(null);
    const [selectedIntelImage, setSelectedIntelImage] = useState<string | null>(null);

    // Multi-Map Logic
    const [activeMapTab, setActiveMapTab] = useState(1);
    const [mapResults, setMapResults] = useState<Record<number, { image: string | null, results: { isVictory: boolean, score?: string, results: PlayerStat[] } | null }>>({
        1: { image: null, results: null }
    });
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
    const [viewDate, setViewDate] = useState(new Date());

    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const apiBase = isTournament ? 'tournaments' : 'scrims';
    const labelSingular = isTournament ? 'Tournament' : 'Scrim';
    const labelPlural = isTournament ? 'Tournaments' : 'Scrims';
    const labelAction = isTournament ? 'Operation' : 'Engagement';

    const filteredScrims = useMemo(() => {
        return [...scrims]
            .filter(s => statusFilter === 'all' || s.status === statusFilter)
            .sort((a, b) => {
                // Pending first, soonest first
                if (a.status === 'pending' && b.status !== 'pending') return -1;
                if (a.status !== 'pending' && b.status === 'pending') return 1;
                if (a.status === 'pending' && b.status === 'pending') {
                    return new Date(a.date).getTime() - new Date(b.date).getTime();
                }
                // Others, latest first
                return new Date(b.date).getTime() - new Date(a.date).getTime();
            });
    }, [scrims, statusFilter]);

    const groupedScrimsByDate = useMemo(() => {
        const groups: Record<string, Scrim[]> = {};
        scrims.forEach(s => {
            const dateStr = new Date(s.date).toDateString();
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(s);
        });
        return groups;
    }, [scrims]);

    const canSubmit = (scrim: Scrim) => {
        const roles = userRole?.split(',').map(r => r.trim().toLowerCase()) || [];
        if (roles.some(r => ['manager', 'admin', 'ceo', 'coach'].includes(r))) return true;
        // Check if user is a player in the team owning the scrim
        return currentTeam?.players.some(p => p.userId === userId) || false;
    };

    const canEdit = () => {
        const roles = userRole?.split(',').map(r => r.trim().toLowerCase()) || [];
        return roles.some(r => ['manager', 'admin', 'ceo', 'coach'].includes(r));
    };

    const safeJSONParse = (data: any, fallback: any = []) => {
        if (!data) return fallback;
        try {
            return typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
            console.warn("[JSON-PARSE-ERROR]", e, data);
            return fallback;
        }
    };

    const getMapCount = (format: string) => {
        if (format === '2 Maps') return 2;
        if (format === '3 Maps') return 3;
        if (format === 'BO3') return 3;
        if (format === 'BO5') return 5;
        return 1; // Unified BO1 / 1 Map
    };

    const calculateSeriesResult = (scrim: any) => {
        const results = safeJSONParse(scrim.results, []);
        if (results.length === 0) return { score: '-', result: 'PENDING', color: 'text-slate-500' };

        // Robustly determine wins and losses (handles both "WIN"/"LOSS" strings and numerical scores)
        const getMapStatus = (r: any) => {
            if (r.isVictory === true || (typeof r.score === 'string' && r.score.toUpperCase() === 'WIN')) return 1; // WIN
            if (r.isVictory === false && typeof r.score === 'string' && r.score.toUpperCase() === 'LOSS') return 0; // LOSS

            if (typeof r.score === 'string' && r.score.includes('-')) {
                const [s1, s2] = r.score.split('-').map(str => parseInt(str.trim()));
                if (!isNaN(s1) && !isNaN(s2)) {
                    if (s1 > s2) return 1;
                    if (s1 < s2) return 0;
                    return 2;
                }
            }
            return r.isVictory ? 1 : 0;
        };

        const wins = results.filter((r: any) => getMapStatus(r) === 1).length;
        const losses = results.filter((r: any) => getMapStatus(r) === 0).length;

        const score = `${wins}-${losses}`;

        if (wins > losses) return { score, result: 'WIN', color: 'text-emerald-400' };
        if (wins < losses) return { score, result: 'LOSS', color: 'text-red-400' };
        return { score, result: 'DRAW', color: 'text-amber-400' };
    };

    const handleDateClick = (date: Date) => {
        const dateStr = date.toDateString();
        const existingScrims = scrims.filter(s => new Date(s.date).toDateString() === dateStr);

        // Pre-fill date (noon default) to avoid timezone shifts on day click
        const d = new Date(date);
        d.setHours(12, 0, 0, 0);
        const offset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d.getTime() - offset)).toISOString().slice(0, 16);
        setScrimDate(localISOTime);

        if (existingScrims.length > 0) {
            setScrimActionModal({ date, scrims: existingScrims });
        } else {
            setScrimActionModal(null);
            setView('add-scrim');
        }
    };

    const fetchTeams = async () => {
        let url = `${GET_API_BASE_URL()}/api/teams?requesterId=${userId}`;
        if (lockedTeamId) {
            url += `&id=${lockedTeamId}`;
        }

        try {
            const res = await fetch(url);
            const result = await res.json();
            if (result.success) {
                const data = result.data;
                setTeams(data);
                if (lockedTeamId) {
                    setSelectedTeamId(lockedTeamId);
                } else if (data.length > 0 && !selectedTeamId) {
                    setSelectedTeamId(data[0].id);
                }
            } else {
                showNotification({ message: result.error || 'Failed to fetch teams', type: 'error' });
            }
        } catch (err) {
            console.error("Teams fetch error:", err);
            showNotification({ message: 'Network error while fetching teams', type: 'error' });
        }
    };

    const fetchScrims = async () => {
        if (!selectedTeamId) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/${apiBase}?teamId=${selectedTeamId}&requesterId=${userId}`);
            const result = await res.json();
            if (result.success) {
                setScrims(result.data);
            } else {
                showNotification({ message: result.error || `Failed to fetch ${labelPlural.toLowerCase()}`, type: 'error' });
            }
        } catch (err) {
            console.error(`${apiBase} fetch error:`, err);
            showNotification({ message: `Network error while fetching ${labelPlural.toLowerCase()}`, type: 'error' });
        }
    };

    useEffect(() => {
        fetchTeams();
    }, [userId, userRole, lockedTeamId]);

    useEffect(() => {
        fetchScrims();
    }, [selectedTeamId, apiBase, userId]); // apiBase added to handle mode changes

    useEffect(() => {
        const handleRefresh = () => {
            console.log(`[TEAM-MANAGEMENT] Real-time sync triggered (${mode})`);
            fetchTeams();
            fetchScrims();
        };

        window.addEventListener('nxc-db-refresh', handleRefresh);
        return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
    }, [selectedTeamId, mode]); // Depend on selectedTeamId to ensure closure has current ID

    const handleCreateScrim = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTeamId) return;

        const requiredCount = getMapCount(scrimFormat);
        const availableMaps = getAvailableMaps();

        let mapsToSubmit = [...selectedMaps];
        if (availableMaps.length === 1) {
            // If only one map exists, use it for all games in the series
            mapsToSubmit = Array(requiredCount).fill(availableMaps[0]);
        } else if (mapsToSubmit.length !== requiredCount || mapsToSubmit.some(m => !m)) {
            showNotification({
                message: `TACTICAL ERROR: Engagement protocol "${scrimFormat}" requires exactly ${requiredCount} unique theater(s) to be identified.`,
                type: 'error'
            });
            return;
        }

        // Check for duplicates only if multiple maps are available
        if (availableMaps.length > 1) {
            const uniqueMaps = new Set(mapsToSubmit);
            if (uniqueMaps.size !== mapsToSubmit.length) {
                showNotification({
                    message: 'TACTICAL ERROR: Duplicate theater designations identified. All engagement maps must be unique.',
                    type: 'error'
                });
                return;
            }
        }

        try {
            showNotification({
                message: `Scheduling engagement with ${scrimOpponent}...`,
                type: 'info'
            });
            const API_BASE_URL = GET_API_BASE_URL();
            const method = isEditingDetails ? 'PUT' : 'POST';
            const url = isEditingDetails
                ? `${API_BASE_URL}/api/${apiBase}/${selectedScrimId}`
                : `${API_BASE_URL}/api/${apiBase}`;

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teamId: selectedTeamId,
                    date: scrimDate,
                    opponent: scrimOpponent,
                    name: isTournament ? scrimOpponent : `Scrim vs ${scrimOpponent}`,
                    format: scrimFormat,
                    maps: selectedMaps,
                    requesterId: userId
                })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({
                    message: `${labelSingular} ${isEditingDetails ? 'updated' : 'scheduled'}!`,
                    type: 'success'
                });
                setView('calendar');
                setScrimDate(''); setScrimOpponent(''); setSelectedMaps([]);
                setIsEditingDetails(false);
                setSelectedScrimId(null);
            } else {
                showNotification({ message: result.error || `Failed to ${isEditingDetails ? 'update' : 'schedule'} ${labelSingular.toLowerCase()}`, type: 'error' });
            }
        } catch (err) {
            console.error(`${isEditingDetails ? 'Update' : 'Create'} ${apiBase} error:`, err);
            showNotification({ message: `Network error while ${isEditingDetails ? 'updating' : 'scheduling'} ${labelSingular.toLowerCase()}`, type: 'error' });
        }
    };

    const handleStatusUpdate = async (id: number, status: string) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/${apiBase}/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, requesterId: userId })
            });
            const result = await res.json();
            if (result.success) {
                // Refresh
                const updated = scrims.map(s => s.id === id ? { ...s, status: status as any } : s);
                setScrims(updated);
            } else {
                showNotification({ message: result.error || 'Failed to update status', type: 'error' });
            }
        } catch (e) {
            console.error("Status update error:", e);
            showNotification({ message: 'Network error while updating status', type: 'error' });
        }
    };

    const handleDeleteMatch = async (id: number) => {
        if (!window.confirm(`Are you sure you want to terminate this ${labelSingular.toLowerCase()} operation? This action is IRREVERSIBLE.`)) return;

        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/${apiBase}/${id}?requesterId=${userId}`, {
                method: 'DELETE'
            });
            const result = await res.json();
            if (result.success) {
                showNotification({ message: `${labelSingular} operation aborted.`, type: 'success' });
                // Refresh local state
                setScrims(prev => prev.filter(s => s.id !== id));
            } else {
                showNotification({ message: result.error || `Failed to abort ${labelSingular.toLowerCase()}`, type: 'error' });
            }
        } catch (e) {
            console.error("Delete error:", e);
            showNotification({ message: 'Network error during termination protocol', type: 'error' });
        }
    };

    const fetchScrimDetails = async (scrim: Scrim) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/${apiBase}/${scrim.id}/stats`);
            const result = await res.json();
            if (result.success) {
                // Enrich flat stats with Agent/Role from results JSON if available
                let enrichedStats = result.data.stats;
                if (scrim.results) {
                    try {
                        const parsedResults = JSON.parse(scrim.results);
                        if (Array.isArray(parsedResults)) {
                            enrichedStats = result.data.stats.map((stat: any) => {
                                // Find player in map results to grab agent/role
                                let playerMatch: any = null;
                                for (const mapData of parsedResults) {
                                    playerMatch = (mapData.results || []).find((r: any) =>
                                        r.playerId === stat.playerId || (r.id === stat.playerId)
                                    );
                                    if (playerMatch) break;
                                }

                                return {
                                    ...stat,
                                    agent: playerMatch?.agent || stat.agent,
                                    role: playerMatch?.role || stat.role,
                                    playerName: stat.playerName || stat.name || 'Unknown', // Prefer playerName, then name, then 'Unknown'
                                    playerImage: stat.playerImage || stat.image // Prefer playerImage, then image
                                };
                            });
                        }
                    } catch (e) {
                        console.error("Aggregation error in fetchScrimDetails:", e);
                    }
                }
                setScrimDetailModal({ ...scrim, stats: enrichedStats });
            } else {
                showNotification({ message: result.error || 'Failed to load details', type: 'error' });
                setScrimDetailModal({ ...scrim, stats: [] });
            }
        } catch (e) {
            console.error("Fetch details error:", e);
            showNotification({ message: 'Network error while loading details', type: 'error' });
            setScrimDetailModal({ ...scrim, stats: [] });
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setMapResults(prev => ({
                    ...prev,
                    [activeMapTab]: { ...(prev[activeMapTab] || { results: null }), image: ev.target?.result as string }
                }));
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleAnalyze = async () => {
        if (!activeMapTab || !mapResults[activeMapTab]?.image) return;
        setIsAnalyzing(true);
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/scrims/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: mapResults[activeMapTab].image,
                    roster: currentTeam?.players.map(p => p.name) || []
                })
            });
            const result = await res.json();
            if (result.success) {
                // result is already the outcome of analyzeScoreboardWithOCR
                setMapResults(prev => ({
                    ...prev,
                    [activeMapTab]: { ...(prev[activeMapTab] || { image: null }), results: result }
                }));
            } else {
                showNotification({ message: result.error || 'Analysis failed. Please fill manually.', type: 'warning' });
                setMapResults(prev => ({
                    ...prev,
                    [activeMapTab]: { ...prev[activeMapTab], results: { isVictory: false, results: [] } }
                }));
            }
        } catch (e) {
            console.error(e);
            showNotification({
                message: 'Analysis failed. Please fill manually.',
                type: 'warning'
            });
            // Fallback manual structure
            setMapResults(prev => ({
                ...prev,
                [activeMapTab]: { ...prev[activeMapTab], results: { isVictory: false, results: [] } }
            }));
        } finally {
            setIsAnalyzing(false);
        }
    };

    const addManualRow = () => {
        setMapResults(prev => {
            const currentTab = prev[activeMapTab] || { image: null, results: { isVictory: false, results: [] } };
            const currentResults = currentTab.results || { isVictory: false, results: [] };
            return {
                ...prev,
                [activeMapTab]: {
                    ...currentTab,
                    results: {
                        ...currentResults,
                        results: [...(currentResults.results || []), { name: 'Player', kills: 0, deaths: 0, assists: 0, acs: 0, agent: '', role: '' }]
                    }
                }
            };
        });
    };

    const handleConfirmResults = async () => {
        if (!selectedScrimId) return;

        // Fetch scrim format
        const scrim = scrims.find(s => s.id === selectedScrimId);
        if (!scrim) return;

        const maxMaps = getMapCount(scrim.format);
        const resultsArray = Object.keys(mapResults).map(k => Number(k)).sort((a, b) => a - b);

        let wins = 0;
        let losses = 0;
        let requiredMaps = 0;

        // Format-specific logic for required maps
        if (scrim.format === 'BO1' || scrim.format === '1 Map') requiredMaps = 1;
        else if (scrim.format === '2 Maps') requiredMaps = 2;
        else if (scrim.format === '3 Maps') requiredMaps = 3;
        else if (scrim.format === 'BO3' || scrim.format === 'BO5') {
            const targetWins = scrim.format === 'BO3' ? 2 : 3;
            const minMaps = scrim.format === 'BO3' ? 2 : 3;
            requiredMaps = minMaps;

            for (let i = 1; i <= maxMaps; i++) {
                const res = mapResults[i]?.results;
                // If this map is filled, see if we need more
                if (res && res.score && res.score !== '0-0' && res.score.trim() !== '') {
                    if (res.isVictory) wins++; else losses++;

                    // If series decided, this is the last required map
                    if (wins === targetWins || losses === targetWins) {
                        requiredMaps = i;
                        break;
                    }
                    // If series NOT decided, and we just filled what was currently required, increment requirement
                    if (i >= requiredMaps) {
                        requiredMaps = i + 1;
                    }
                } else {
                    // Stop checking once we hit an unfilled map
                    break;
                }
            }
        }

        // Validation Guard
        for (let i = 1; i <= requiredMaps; i++) {
            const data = mapResults[i];
            const res = data?.results;

            if (!data?.image) {
                showNotification({
                    message: `TACTICAL ERROR: Scoreboard screenshot required for Theater Phase ${i}.`,
                    type: 'error'
                });
                return;
            }
            if (!res?.score || res.score === '0-0' || res.score.trim() === '') {
                showNotification({
                    message: `TACTICAL ERROR: Match Score required for Theater Phase ${i}.`,
                    type: 'error'
                });
                return;
            }
            if (!res.results || res.results.length === 0) {
                showNotification({
                    message: `TACTICAL ERROR: Operator stats required for Theater Phase ${i}.`,
                    type: 'error'
                });
                return;
            }

            // Check for missing stats
            const hasEmptyStats = res.results.some(p =>
                (p.kills === undefined || p.kills === null || String(p.kills).trim() === '') ||
                (p.deaths === undefined || p.deaths === null || String(p.deaths).trim() === '') ||
                (p.assists === undefined || p.assists === null || String(p.assists).trim() === '') ||
                (p.acs === undefined || p.acs === null || String(p.acs).trim() === '') ||
                (isValorantFamily && (!p.agent || !p.role))
            );
            if (hasEmptyStats) {
                const extra = isValorantFamily ? " and Agent/Role selections" : "";
                showNotification({
                    message: `TACTICAL ERROR: Incomplete Operator analytics detected in Theater Phase ${i}. Ensure K/D/A, ACS${extra} are logged for all personnel (zero-values for stats are acceptable).`,
                    type: 'error'
                });
                return;
            }
        }

        const finalResults = Object.keys(mapResults).filter(k => Number(k) <= requiredMaps).map(k => {
            const mapId = Number(k);
            const data = mapResults[mapId];
            return {
                map: mapId,
                image: data.image,
                results: data.results?.results || [],
                score: data.results?.score || (data.results?.isVictory ? 'WIN' : 'LOSS'),
                isVictory: data.results?.isVictory ?? false
            };
        });

        // Send all individual performances to preserve agent, role, and map context
        const allPerformances: any[] = [];
        finalResults.forEach(mResult => {
            const m = safeJSONParse(scrim.maps);
            const mapName = m[mResult.map - 1] || `Map ${mResult.map}`;
            mResult.results.forEach((p: PlayerStat) => {
                if (p.playerId) {
                    allPerformances.push({
                        playerId: p.playerId,
                        kills: Number(p.kills),
                        deaths: Number(p.deaths),
                        assists: Number(p.assists),
                        acs: Number(p.acs || 0),
                        isWin: (() => {
                            if (mResult.isVictory === true) return 1;
                            if (typeof mResult.score === 'string' && mResult.score.includes('-')) {
                                const [s1, s2] = mResult.score.split('-').map(Number);
                                if (s1 > s2) return 1;
                                if (s1 < s2) return 0;
                                return 2;
                            }
                            return mResult.isVictory ? 1 : 0;
                        })(),
                        agent: p.agent,
                        role: p.role,
                        map: mapName
                    });
                }
            });
        });

        try {
            showNotification({
                message: 'Synchronizing battle records with command center...',
                type: 'info'
            });
            const res = await fetch(`${GET_API_BASE_URL()}/api/${apiBase}/${selectedScrimId}/results`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    results: finalResults,
                    playerStats: allPerformances,
                    requesterId: userId
                })
            });
            const result = await res.json();
            if (result.success) {
                showNotification({
                    message: `${labelSingular} results uploaded!`,
                    type: 'success'
                });
                setView('list');
                setMapResults({ 1: { image: null, results: null } });
            } else {
                showNotification({ message: result.error || 'Failed to upload results', type: 'error' });
            }
        } catch (e) {
            console.error("Result upload error:", e);
            showNotification({ message: 'Network error while uploading results', type: 'error' });
        }
    };

    const getAvailableMaps = () => {
        if (!currentTeam) {
            console.warn("TACTICAL ALERT: No active team designated for theater lookup.", { selectedTeamId, teamsCount: teams.length });
            return [];
        }
        const maps = GAME_MAPS[currentTeam.game] || [];
        if (maps.length === 0) {
            console.warn(`TACTICAL ALERT: No theaters identified for game: ${currentTeam.game}`);
        }
        return maps;
    };

    return (
        <div className="bg-[#020617]/40 backdrop-blur-3xl rounded-[32px] md:rounded-[40px] p-6 md:p-10 border border-white/5 shadow-soft mt-8 md:mt-12 transition-all relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 md:mb-12 gap-6 md:gap-8 relative z-10">
                <div className="flex items-center space-x-4 md:space-x-6">
                    {(view !== 'list' || !!onBack) && (
                        <button
                            onClick={() => view === 'list' ? (onBack && onBack()) : setView('list')}
                            className="p-3 md:p-4 bg-white/5 hover:bg-amber-500/10 text-slate-400 hover:text-amber-500 rounded-xl md:rounded-2xl transition-all border border-white/5 group/back active:scale-95 shadow-lg"
                        >
                            <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                    )}
                    <div>
                        <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tighter uppercase italic leading-tight">{isTournament ? 'Tournament' : 'Tactical'} Operations</h2>
                        <p className="text-[8px] md:text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] mt-1 md:mt-2">{isTournament ? 'Grand Slam' : 'Command & Control'} Interface</p>
                    </div>
                </div>
                <div className="flex flex-row flex-wrap lg:flex-nowrap gap-2 md:gap-3 w-full lg:w-auto">
                    <button
                        onClick={() => setView('calendar')}
                        className={`flex-1 lg:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] transition-all border whitespace-nowrap ${view === 'calendar' ? 'bg-purple-600 text-white border-white/20 shadow-xl shadow-purple-500/20' : 'bg-white/5 text-slate-400 border-white/5 hover:border-purple-500/30'}`}
                    >
                        Sector Calendar
                    </button>
                    <button
                        onClick={() => setView('list')}
                        className={`flex-1 lg:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] transition-all border whitespace-nowrap ${view === 'list' ? 'bg-purple-600 text-white border-white/20 shadow-xl shadow-purple-500/20' : 'bg-white/5 text-slate-400 border-white/5 hover:border-purple-500/30'}`}
                    >
                        Active Registry
                    </button>
                    {!isTournament && (
                        <button
                            onClick={() => setView('quota')}
                            className={`flex-1 lg:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] transition-all border whitespace-nowrap ${view === 'quota' ? 'bg-purple-600 text-white border-white/20 shadow-xl shadow-purple-500/20' : 'bg-white/5 text-slate-400 border-white/5 hover:border-purple-500/30'}`}
                        >
                            Quota Ops
                        </button>
                    )}
                    <button
                        onClick={() => setView('add-scrim')}
                        className="flex-1 lg:flex-none px-4 md:px-8 py-2.5 md:py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.3em] rounded-xl md:rounded-2xl transition-all shadow-2xl shadow-amber-500/20 active:scale-95 border-t border-white/20 whitespace-nowrap"
                    >
                        + Schedule {labelSingular}
                    </button>
                </div>
            </div>

            {/* Status Filters */}
            {view === 'list' && (
                <div className="flex space-x-3 mb-8 relative z-10 overflow-x-auto pb-2">
                    {(['all', 'pending', 'completed', 'cancelled'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setStatusFilter(f)}
                            className={`px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all border whitespace-nowrap ${statusFilter === f ? 'bg-amber-500 text-black border-amber-400 shadow-xl shadow-amber-500/20' : 'bg-white/5 text-slate-400 border-white/5 hover:border-white/10'}`}
                        >
                            {f} {labelPlural}
                        </button>
                    ))}
                </div>
            )}

            {/* Team Selector - Hide if locked OR if in upload/add view for context safety */}
            {!lockedTeamId && view !== 'upload-result' && view !== 'add-scrim' && (
                <div className="mb-8 md:mb-12 relative z-10">
                    <label className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] md:tracking-[0.4em] ml-2 mb-2 md:mb-3 block">Deployment Sector</label>
                    <div className="relative max-w-md group">
                        <select
                            value={selectedTeamId || ''}
                            onChange={e => setSelectedTeamId(Number(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-[10px] md:text-sm text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer shadow-soft backdrop-blur-xl"
                        >
                            {teams.map(t => <option key={t.id} value={t.id} className="bg-[#020617] text-white">{t.name} // {t.game.toUpperCase()}</option>)}
                        </select>
                        <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-amber-500/50 group-hover:text-amber-500 transition-colors">
                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                        </div>
                    </div>
                </div>
            )}

            {view === 'list' && (
                <div className="relative z-10 glass rounded-[24px] md:rounded-[30px] shadow-inner overflow-hidden flex flex-col">
                    <div className="px-6 py-6 md:px-8 border-b border-white/5 bg-black/10 flex justify-between items-center">
                        <div>
                            <h3 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter">Tactical Engagement Log</h3>
                            <p className="text-[8px] md:text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] mt-1 italic">Sequential Operation History</p>
                        </div>
                    </div>
                    <div className="overflow-auto max-h-[600px] custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[700px] md:min-w-full">
                            <thead className="sticky top-0 z-20 bg-[#020617] shadow-sm">
                                <tr className="border-b border-white/5 text-amber-500/60 text-[8px] md:text-[10px] uppercase font-black tracking-[0.2em] md:tracking-[0.3em]">
                                    <th className="px-6 md:px-8 py-5 md:py-8 whitespace-nowrap">Chronology</th>
                                    <th className="px-6 md:px-8 py-5 md:py-8 whitespace-nowrap">{isTournament ? 'Engagement' : 'Adversary'}</th>
                                    <th className="px-6 md:px-8 py-5 md:py-8 whitespace-nowrap">{labelAction}</th>
                                    <th className="px-6 md:px-8 py-5 md:py-8 whitespace-nowrap">Condition</th>
                                    <th className="px-6 md:px-8 py-5 md:py-8 text-right whitespace-nowrap">Operations</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredScrims.map(scrim => (
                                    <tr
                                        key={scrim.id}
                                        onClick={() => scrim.status === 'completed' && fetchScrimDetails(scrim)}
                                        className={`group hover:bg-white/[0.03] transition-all duration-300 ${scrim.status === 'completed' ? 'cursor-pointer active:scale-[0.99]' : ''} ${scrim.status !== 'pending' ? 'opacity-40 grayscale-[0.7] hover:opacity-60 transition-opacity' : ''}`}
                                    >
                                        <td className="px-6 md:px-8 py-5 md:py-8 font-black text-white italic tracking-tighter text-base md:text-lg whitespace-nowrap">
                                            <span className="text-amber-500/40 text-[8px] md:text-[10px] not-italic block mb-1 tracking-widest">{new Date(scrim.date).toLocaleDateString()}</span>
                                            {new Date(scrim.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 md:px-8 py-5 md:py-8">
                                            <div className="flex items-center space-x-3">
                                                <div className="font-black text-white uppercase tracking-tight group-hover:text-amber-500 transition-colors text-xs md:text-base">{scrim.opponent}</div>
                                                {scrim.status === 'completed' && (() => {
                                                    const { score, color } = calculateSeriesResult(scrim);
                                                    return (
                                                        <span className={`text-[10px] md:text-xs font-black px-2 py-0.5 rounded border border-white/5 bg-white/[0.03] ${color} italic`}>
                                                            {score}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                            <div className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">
                                                {(() => {
                                                    const m = safeJSONParse(scrim.maps);
                                                    if (m.length > 0) {
                                                        return m.map((mapName: string, i: number) => `Map ${i + 1}: ${mapName}`).join(' • ');
                                                    }
                                                    return isTournament ? 'Mission Progress' : 'Objective Secured';
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-6 md:px-8 py-5 md:py-8">
                                            <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[8px] md:text-[10px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(168,85,247,0.1)] whitespace-nowrap">{scrim.format}</span>
                                        </td>
                                        <td className="px-6 md:px-8 py-5 md:py-8">
                                            {scrim.status === 'completed' ? (() => {
                                                const { result, color } = calculateSeriesResult(scrim);
                                                return (
                                                    <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${color.replace('text-', 'bg-').replace('-400', '-500/10')} ${color.replace('text-', 'border-').replace('-400', '-500/30')} ${color} inline-block`}>
                                                        {result}
                                                    </div>
                                                );
                                            })() : (
                                                <div className="relative inline-block">
                                                    <select
                                                        value={scrim.status}
                                                        onChange={(e) => handleStatusUpdate(scrim.id, e.target.value)}
                                                        disabled={!canEdit() || (scrim.status !== 'pending' && scrim.status !== 'cancelled')}
                                                        className={`pl-4 pr-10 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest outline-none transition-all border appearance-none shadow-lg ${(!canEdit() || (scrim.status !== 'pending' && scrim.status !== 'cancelled')) ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'} ${scrim.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                                            scrim.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                                                                'bg-amber-500/10 text-amber-400 border-amber-500/30 ring-1 ring-amber-500/20 animate-pulse'
                                                            }`}
                                                    >
                                                        <option value="pending" className="bg-[#1e1e2d]">PENDING</option>
                                                        <option value="completed" className="bg-[#1e1e2d]">COMPLETED</option>
                                                        <option value="cancelled" className="bg-[#1e1e2d]">CANCELLED</option>
                                                    </select>
                                                    <div className={`absolute inset-y-0 right-3 flex items-center pointer-events-none transition-colors ${scrim.status === 'completed' ? 'text-emerald-400/50' : scrim.status === 'cancelled' ? 'text-red-400/50' : 'text-amber-400/50'}`}>
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 md:px-8 py-5 md:py-8 text-right">
                                            {scrim.status === 'completed' ? (
                                                <div className="flex justify-end space-x-2">
                                                    <button
                                                        onClick={() => fetchScrimDetails(scrim)}
                                                        className="px-4 md:px-6 py-2 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white border border-blue-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-blue-500/30 active:scale-95 whitespace-nowrap"
                                                    >
                                                        Analyze Intel
                                                    </button>
                                                    {canEdit() && (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedScrimId(scrim.id);
                                                                    setSelectedTeamId(scrim.teamId);
                                                                    const existingResultsArr = scrim.results ? JSON.parse(scrim.results) : [];
                                                                    const init: any = {};
                                                                    existingResultsArr.forEach((r: any) => {
                                                                        init[r.map] = {
                                                                            image: r.image,
                                                                            results: {
                                                                                isVictory: r.isVictory,
                                                                                score: r.score,
                                                                                results: r.results
                                                                            }
                                                                        };
                                                                    });
                                                                    const count = getMapCount(scrim.format);
                                                                    for (let i = 1; i <= count; i++) {
                                                                        if (!init[i]) init[i] = { image: null, results: { isVictory: false, score: '0-0', results: [] } };
                                                                    }
                                                                    setMapResults(init);
                                                                    setActiveMapTab(1);
                                                                    setView('upload-result');
                                                                }}
                                                                className="px-4 md:px-6 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black border border-amber-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-amber-500/30 active:scale-95 whitespace-nowrap"
                                                            >
                                                                Edit Stats
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteMatch(scrim.id);
                                                                }}
                                                                className="px-4 md:px-6 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-red-500/30 active:scale-95 whitespace-nowrap"
                                                            >
                                                                Term. Mission
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            ) : scrim.status === 'cancelled' ? (
                                                <div className="flex justify-end space-x-2 items-center">
                                                    <div className="px-4 md:px-6 py-2 bg-white/5 text-slate-600 border border-white/5 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl italic whitespace-nowrap">
                                                        Op Cancelled
                                                    </div>
                                                    {canEdit() && (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const d = new Date(scrim.date);
                                                                    const offset = d.getTimezoneOffset() * 60000;
                                                                    const localIso = new Date(d.getTime() - offset).toISOString().slice(0, 16);

                                                                    setScrimDate(localIso);
                                                                    setScrimOpponent(scrim.opponent);
                                                                    setScrimFormat(scrim.format);
                                                                    setSelectedMaps(safeJSONParse(scrim.maps));
                                                                    setSelectedScrimId(scrim.id);
                                                                    setIsEditingDetails(true);
                                                                    setView('add-scrim');
                                                                }}
                                                                className="px-4 md:px-6 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black border border-amber-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-amber-500/30 active:scale-95 whitespace-nowrap"
                                                            >
                                                                Edit Deployment
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteMatch(scrim.id);
                                                                }}
                                                                className="px-4 md:px-6 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-red-500/30 active:scale-95 whitespace-nowrap"
                                                            >
                                                                Term. Mission
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex justify-end space-x-2">
                                                    {canSubmit(scrim) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedScrimId(scrim.id);
                                                                setSelectedTeamId(scrim.teamId); // Hardlock sector to scrim owner
                                                                const count = getMapCount(scrim.format);
                                                                const init: any = {};
                                                                const rosterPlayers = currentTeam?.players.filter(p => p.id > 0).map(p => ({
                                                                    name: p.name,
                                                                    playerId: p.id,
                                                                    kills: 0,
                                                                    deaths: 0,
                                                                    assists: 0,
                                                                    acs: 0,
                                                                    agent: '',
                                                                    role: ''
                                                                })) || [];
                                                                for (let i = 1; i <= count; i++) {
                                                                    init[i] = {
                                                                        image: null,
                                                                        results: {
                                                                            isVictory: false,
                                                                            score: '0-0',
                                                                            results: [...rosterPlayers]
                                                                        }
                                                                    };
                                                                }
                                                                setMapResults(init);
                                                                setActiveMapTab(1);
                                                                setView('upload-result');
                                                            }}
                                                            className="px-4 md:px-6 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black border border-amber-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-amber-500/30 active:scale-95 whitespace-nowrap"
                                                        >
                                                            Upload Data
                                                        </button>
                                                    )}
                                                    {canEdit() && (
                                                        <>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const d = new Date(scrim.date);
                                                                    const offset = d.getTimezoneOffset() * 60000;
                                                                    const localIso = new Date(d.getTime() - offset).toISOString().slice(0, 16);

                                                                    setScrimDate(localIso);
                                                                    setScrimOpponent(scrim.opponent);
                                                                    setScrimFormat(scrim.format);
                                                                    setSelectedMaps(scrim.maps ? JSON.parse(scrim.maps) : []);
                                                                    setSelectedScrimId(scrim.id);
                                                                    setIsEditingDetails(true);
                                                                    setView('add-scrim');
                                                                }}
                                                                className="px-4 md:px-6 py-2 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black border border-amber-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-amber-500/30 active:scale-95 whitespace-nowrap"
                                                            >
                                                                Edit Deployment
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteMatch(scrim.id);
                                                                }}
                                                                className="px-4 md:px-6 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-lg md:rounded-xl transition-all shadow-xl hover:shadow-red-500/30 active:scale-95 whitespace-nowrap"
                                                            >
                                                                Term. Mission
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {scrims.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-16 text-center">
                                            <div className="flex flex-col items-center space-y-4 opacity-50">
                                                <svg className="w-16 h-16 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em]">No active {labelPlural.toLowerCase()} logged.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {view === 'calendar' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-700">
                    {/* Calendar Header / Navigation */}
                    <div className="flex flex-col md:flex-row justify-between items-center bg-white/[0.02] p-6 md:p-8 rounded-[32px] md:rounded-[40px] border border-white/5 backdrop-blur-3xl gap-6">
                        <div className="flex items-center space-x-4 md:space-x-6">
                            <button
                                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                                className="w-10 h-10 md:w-12 md:h-12 bg-white/5 hover:bg-amber-500 hover:text-black rounded-xl md:rounded-2xl flex items-center justify-center border border-white/10 transition-all active:scale-90"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <div className="text-center md:text-left">
                                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                                    {viewDate.toLocaleString('default', { month: 'long' })} <span className="text-amber-500">{viewDate.getFullYear()}</span>
                                </h2>
                                <p className="text-[8px] md:text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] mt-1 md:mt-2">{labelSingular} Deployment Feed</p>
                            </div>
                            <button
                                onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                                className="w-10 h-10 md:w-12 md:h-12 bg-white/5 hover:bg-amber-500 hover:text-black rounded-xl md:rounded-2xl flex items-center justify-center border border-white/10 transition-all active:scale-90"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>

                        <div className="flex items-center space-x-4">
                            <button
                                onClick={() => setViewDate(new Date())}
                                className="px-6 md:px-8 py-2.5 md:py-3 bg-white/5 hover:bg-white/10 text-white font-black text-[8px] md:text-[10px] uppercase tracking-[0.3em] md:tracking-[0.4em] rounded-xl border border-white/10 transition-all active:scale-95 whitespace-nowrap"
                            >
                                Present Time
                            </button>
                        </div>
                    </div>

                    {/* Weekday Labels + Grid wrapped for horizontal scroll on tiny screens */}
                    <div className="overflow-x-auto pb-4 custom-scrollbar">
                        <div className="min-w-[600px]">
                            <div className="grid grid-cols-7 gap-3 md:gap-4 px-4 mb-4">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                    <div key={day} className="text-[8px] md:text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] md:tracking-[0.4em] text-center">{day}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-3 md:gap-4 relative z-10">
                                {(() => {
                                    const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
                                    const startDay = firstDayOfMonth.getDay(); // 0-6
                                    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();

                                    // Create a 42-day grid (6 weeks)
                                    return Array.from({ length: 42 }).map((_, i) => {
                                        const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), i - startDay + 1);
                                        const isCurrentMonth = date.getMonth() === viewDate.getMonth();
                                        const dayScrims = groupedScrimsByDate[date.toDateString()] || [];
                                        const isToday = date.toDateString() === new Date().toDateString();

                                        return (
                                            <div
                                                key={i}
                                                onClick={() => handleDateClick(date)}
                                                className={`min-h-[120px] md:min-h-[160px] bg-white/[0.02] rounded-[24px] md:rounded-[30px] p-3 md:p-5 cursor-pointer hover:bg-white/[0.05] border transition-all duration-500 group/day backdrop-blur-sm relative overflow-hidden flex flex-col ${!isCurrentMonth ? 'opacity-20 grayscale scale-[0.98]' : ''
                                                    } ${isToday ? 'border-amber-500 shadow-[0_0_40px_rgba(251,191,36,0.1)] z-20' : 'border-white/5 hover:border-amber-500/30'}
                                        `}
                                            >
                                                <div className="flex justify-between items-start mb-2 md:mb-4">
                                                    <span className={`text-[10px] md:text-xs font-black tracking-widest ${isToday ? 'text-amber-500' : 'text-slate-500 group-hover/day:text-slate-300'}`}>
                                                        {date.getDate().toString().padStart(2, '0')}
                                                    </span>
                                                    {dayScrims.length > 0 && isCurrentMonth && (
                                                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
                                                    )}
                                                </div>

                                                <div className="flex-grow space-y-1.5 md:space-y-2 max-h-[60px] md:max-h-[80px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 group-hover/day:scrollbar-thumb-amber-500/30">
                                                    {dayScrims.map(s => (
                                                        <div
                                                            key={s.id}
                                                            className={`text-[7px] md:text-[9px] p-1.5 md:p-2 rounded-lg md:xl border border-white/5 font-black uppercase tracking-tighter transition-all cursor-pointer ${s.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                                s.status === 'cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                                                    'bg-black/40 text-slate-400 group-hover/day:border-amber-500/20 group-hover/day:text-white'
                                                                }`}
                                                        >
                                                            {new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {s.opponent}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {view === 'quota' && selectedTeamId && (
                <QuotaManagementView
                    teamId={selectedTeamId}
                    game={currentTeam?.game || ''}
                    canEdit={canEdit()}
                    selectedWeek={selectedWeek}
                    setSelectedWeek={setSelectedWeek}
                    userId={userId}
                />
            )}

            {view === 'add-scrim' && (
                <form onSubmit={handleCreateScrim} className="max-w-2xl mx-auto space-y-6 md:space-y-8 relative z-10 p-6 md:p-12 glass rounded-[32px] md:rounded-[40px] animate-in slide-in-from-bottom duration-500">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                        <div>
                            <h2 className="text-xl md:text-3xl font-black text-white uppercase italic tracking-tighter">
                                {isEditingDetails ? `Update ${labelSingular} Intel` : `Initialize New ${labelSingular}`}
                            </h2>
                            <p className="text-[8px] md:text-[10px] text-amber-500/60 font-black uppercase tracking-[0.3em] mt-1">
                                {isEditingDetails ? 'Re-aligning combat parameters' : 'New combat engagement sequence'}
                            </p>
                        </div>
                        {isEditingDetails && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditingDetails(false);
                                    setSelectedScrimId(null);
                                    setScrimDate('');
                                    setScrimOpponent('');
                                    setScrimFormat('BO1');
                                    setSelectedMaps([]);
                                    setView('calendar');
                                }}
                                className="px-4 py-2 bg-white/5 hover:bg-red-500 text-slate-400 hover:text-white border border-white/10 hover:border-red-500/50 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95"
                            >
                                Abort Update
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                        <div className="space-y-3 md:space-y-4">
                            <label className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] md:tracking-[0.4em] ml-2">Opponent Signature</label>
                            <input
                                type="text"
                                required
                                value={scrimOpponent}
                                onChange={e => setScrimOpponent(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-[10px] md:text-sm text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-slate-700 shadow-soft"
                                placeholder="E.G. LIQUID_CRYSTAL"
                            />
                        </div>
                        <div className="space-y-3 md:space-y-4">
                            <label className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] md:tracking-[0.4em] ml-2">Deployment Schedule</label>
                            <input
                                type="datetime-local"
                                required
                                value={scrimDate}
                                onChange={e => setScrimDate(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-[10px] md:text-sm text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all shadow-soft [color-scheme:dark]"
                            />
                        </div>
                        <div className="space-y-3 md:space-y-4">
                            <label className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] md:tracking-[0.4em] ml-2">Engagement Protocol</label>
                            <select
                                value={scrimFormat}
                                onChange={e => setScrimFormat(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-[10px] md:text-sm text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer shadow-soft"
                            >
                                <option className="bg-[#1e1e2d]">BO1</option>
                                <option className="bg-[#1e1e2d]">2 Maps</option>
                                <option className="bg-[#1e1e2d]">3 Maps</option>
                                <option className="bg-[#1e1e2d]">BO3</option>
                                <option className="bg-[#1e1e2d]">BO5</option>
                            </select>
                        </div>

                        {getAvailableMaps().length > 1 && (
                            <div className="col-span-full space-y-4 md:space-y-6">
                                <label className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] md:tracking-[0.4em] ml-2 block">Theater Deployment Sequence</label>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                    {Array.from({ length: getMapCount(scrimFormat) }).map((_, idx) => {
                                        const sequenceNum = idx + 1;
                                        let label = `Map ${sequenceNum}`;

                                        if (sequenceNum === 1) label = "First Map";
                                        else if (sequenceNum === 2) label = "Second Map";
                                        else if (sequenceNum === 3) label = (scrimFormat === 'BO3' || scrimFormat === '3 Maps') ? "Decider Map" : "Third Map";
                                        else if (sequenceNum === 4) label = "Fourth Map";
                                        else if (sequenceNum === 5) label = "Final Decider Map";

                                        return (
                                            <div key={idx} className="space-y-2 md:space-y-3">
                                                <label className="text-[8px] md:text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{label}</label>
                                                <div className="relative group/map">
                                                    <select
                                                        required
                                                        value={selectedMaps[idx] || ''}
                                                        onChange={e => {
                                                            const newMaps = [...selectedMaps];
                                                            newMaps[idx] = e.target.value;
                                                            setSelectedMaps(newMaps);
                                                        }}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl md:rounded-2xl px-4 md:px-5 py-3 md:py-4 text-[10px] md:text-sm text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer shadow-soft backdrop-blur-xl group-hover/map:border-white/20"
                                                    >
                                                        <option value="" className="text-slate-500 text-[10px]">SELECT THEATER...</option>
                                                        {getAvailableMaps().map(mapName => (
                                                            <option key={mapName} value={mapName} className="bg-[#020617] text-white">
                                                                {mapName.toUpperCase()}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-amber-500/40 group-hover/map:text-amber-500 transition-colors">
                                                        <svg className="w-3 h-3 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="w-full py-4 md:py-5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-[10px] rounded-xl md:rounded-2xl transition-all shadow-2xl shadow-amber-500/20 active:scale-[0.98] border-t border-white/20 mt-6 md:mt-8"
                    >
                        {isEditingDetails ? 'Finalize Tactical Update' : 'Authorize Deployment'}
                    </button>
                </form>
            )}

            {view === 'upload-result' && (
                <div className="max-w-4xl mx-auto space-y-8 relative z-10">
                    {/* Map Tabs */}
                    {(() => {
                        const scrim = scrims.find(s => s.id === selectedScrimId);
                        if (!scrim) return null;

                        const maxMaps = getMapCount(scrim.format);
                        let visibleCount = 1;

                        if (scrim.format === 'BO1' || scrim.format === '1 Map') visibleCount = 1;
                        else if (scrim.format === '2 Maps') visibleCount = 2;
                        else if (scrim.format === '3 Maps') visibleCount = 3;
                        else if (scrim.format === 'BO3' || scrim.format === 'BO5') {
                            const target = scrim.format === 'BO3' ? 2 : 3;
                            const min = scrim.format === 'BO3' ? 2 : 3;
                            let wins = 0;
                            let losses = 0;
                            visibleCount = min;

                            for (let i = 1; i <= maxMaps; i++) {
                                const res = mapResults[i]?.results;
                                if (res && res.score && res.score !== '0-0' && res.score.trim() !== '') {
                                    if (res.isVictory) wins++; else losses++;
                                    if (wins === target || losses === target) {
                                        visibleCount = i;
                                        break;
                                    }
                                    if (i >= visibleCount) visibleCount = i + 1;
                                } else {
                                    break;
                                }
                            }
                        }

                        if (visibleCount <= 1) return null; // Only show tabs if > 1 map is relevant

                        return (
                            <div className="flex space-x-2 md:space-x-3 mb-6 md:mb-8 overflow-x-auto pb-4 custom-scrollbar">
                                {Object.keys(mapResults)
                                    .map(k => Number(k))
                                    .filter(k => k <= visibleCount)
                                    .sort((a, b) => a - b)
                                    .map(k => {
                                        const hasData = !!mapResults[k]?.results?.score && mapResults[k]?.results?.score !== '0-0';
                                        return (
                                            <button
                                                key={k}
                                                onClick={() => setActiveMapTab(k)}
                                                className={`px-4 md:px-8 py-2.5 md:py-3 rounded-xl md:rounded-2xl font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] whitespace-nowrap transition-all border ${activeMapTab === k ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.2)]' : 'bg-white/5 text-slate-400 border-white/5 hover:border-white/10'}`}
                                            >
                                                {getAvailableMaps().length === 1 ? 'Game' : 'Theater'} {k} {hasData && '✓'}
                                            </button>
                                        );
                                    })}
                            </div>
                        );
                    })()}

                    <div className="relative group overflow-hidden rounded-[32px] md:rounded-[40px] border-2 border-dashed border-white/10 p-8 md:p-12 text-center bg-black/40 backdrop-blur-3xl hover:border-amber-500/30 transition-all">
                        {mapResults[activeMapTab]?.image ? (
                            <div className="relative inline-block group/preview">
                                <img src={mapResults[activeMapTab].image!} alt="Preview" className="max-h-80 mx-auto rounded-2xl mb-4 shadow-2xl border border-white/10 transition-transform group-hover/preview:scale-[1.02]" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Replace Source</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 py-8">
                                <div className="w-24 h-24 bg-white/5 rounded-[30px] flex items-center justify-center mx-auto border border-white/5 group-hover:scale-110 group-hover:bg-amber-500 transition-all group-hover:text-black shadow-xl">
                                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <div className="space-y-1 md:space-y-2">
                                    <p className="text-lg md:text-xl font-black text-white uppercase italic">Awaiting Visual Intelligence</p>
                                    <p className="text-[8px] md:text-[10px] text-amber-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em]">
                                        {(() => {
                                            const scrim = scrims.find(s => s.id === selectedScrimId);
                                            const m = safeJSONParse(scrim?.maps);
                                            const mapName = m[activeMapTab - 1] || 'Unknown Theater';
                                            return `TARGET: ${mapName.toUpperCase()}`;
                                        })()}
                                    </p>
                                    <p className="text-[8px] md:text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em]">Upload {getAvailableMaps().length === 1 ? 'Game' : 'Component'} {activeMapTab} Analytics Feed</p>
                                </div>
                            </div>
                        )}
                        <input
                            key={`upload-${activeMapTab}`}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            id={`scrim-upload-${activeMapTab}`}
                        />
                        <label htmlFor={`scrim-upload-${activeMapTab}`} className="mt-6 md:mt-8 inline-block px-8 md:px-10 py-3.5 md:py-4 bg-white/5 hover:bg-white/10 text-white font-black text-[8px] md:text-[10px] uppercase tracking-[0.3em] md:tracking-[0.4em] rounded-xl md:rounded-2xl cursor-pointer transition-all border border-white/10 active:scale-95 shadow-xl">Initialize Source</label>
                    </div>

                    {mapResults[activeMapTab]?.image && !mapResults[activeMapTab]?.results && (
                        <button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-[0.2em] text-[10px] rounded-xl md:rounded-2xl flex items-center justify-center space-x-3 shadow-lg shadow-purple-600/20 active:scale-95 transition-all">
                            {isAnalyzing ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Analyzing Map {activeMapTab} with AI...</span>
                                </>
                            ) : (
                                <span>Analyze Scoreboard</span>
                            )}
                        </button>
                    )}

                    {mapResults[activeMapTab]?.results && (
                        <div className="bg-white/[0.02] p-6 md:p-10 rounded-[32px] md:rounded-[40px] border border-amber-500/20 animate-in zoom-in duration-500 shadow-soft relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full pointer-events-none" />

                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                                <div>
                                    <h3 className="font-black text-2xl text-white uppercase italic tracking-tighter">{getAvailableMaps().length === 1 ? 'Game' : 'Component'} {activeMapTab} Intelligence</h3>
                                    <p className="text-[10px] text-amber-500/60 font-black uppercase tracking-[0.3em] mt-1">Manual Verification Required</p>
                                </div>

                                <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-8">
                                    <div className="flex flex-col items-end space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-2 text-right w-full">Tactical Score</label>
                                        <div className="flex items-center space-x-3 bg-black/60 border border-white/10 rounded-2xl p-2 px-4 shadow-inner">
                                            <div className="flex flex-col items-center">
                                                <label className="text-[7px] font-black text-amber-500/40 uppercase tracking-widest mb-1">Our Ops</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={
                                                        (() => {
                                                            const sc = mapResults[activeMapTab]?.results?.score;
                                                            if (!sc) return 0;
                                                            if (sc === 'WIN' || sc === 'LOSS') return 0;
                                                            return sc.includes('-') ? sc.split('-')[0] : sc;
                                                        })()
                                                    }
                                                    onChange={e => {
                                                        const currentResults = mapResults[activeMapTab]?.results;
                                                        if (!currentResults) return;
                                                        const scoreStr = currentResults.score || '0-0';
                                                        const opp = scoreStr.includes('-') ? scoreStr.split('-')[1] : '0';
                                                        const val = Math.max(0, parseInt(e.target.value) || 0);
                                                        const newScore = `${val}-${opp}`;
                                                        const newIsVictory = val > parseInt(opp);
                                                        setMapResults(prev => ({
                                                            ...prev,
                                                            [activeMapTab]: {
                                                                ...prev[activeMapTab],
                                                                results: { ...currentResults, score: newScore, isVictory: newIsVictory }
                                                            }
                                                        }));
                                                    }}
                                                    className="w-12 bg-transparent text-white font-black text-center focus:outline-none text-xl"
                                                />
                                            </div>
                                            <div className="text-amber-500 font-black text-xl">:</div>
                                            <div className="flex flex-col items-center">
                                                <label className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-1">Enemy</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={
                                                        (() => {
                                                            const sc = mapResults[activeMapTab]?.results?.score;
                                                            if (!sc) return 0;
                                                            if (sc === 'WIN' || sc === 'LOSS') return 0;
                                                            return sc.includes('-') ? sc.split('-')[1] : 0;
                                                        })()
                                                    }
                                                    onChange={e => {
                                                        const currentResults = mapResults[activeMapTab]?.results;
                                                        if (!currentResults) return;
                                                        const scoreStr = currentResults.score || '0-0';
                                                        const our = scoreStr.includes('-') ? scoreStr.split('-')[0] : '0';
                                                        const val = Math.max(0, parseInt(e.target.value) || 0);
                                                        const newScore = `${our}-${val}`;
                                                        const newIsVictory = parseInt(our) > val;
                                                        setMapResults(prev => ({
                                                            ...prev,
                                                            [activeMapTab]: {
                                                                ...prev[activeMapTab],
                                                                results: { ...currentResults, score: newScore, isVictory: newIsVictory }
                                                            }
                                                        }));
                                                    }}
                                                    className="w-12 bg-transparent text-white font-black text-center focus:outline-none text-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex space-x-2 md:space-x-3 bg-black/40 p-1 md:p-1.5 rounded-xl md:rounded-2xl border border-white/5">
                                        <button
                                            onClick={() => {
                                                const currentResults = mapResults[activeMapTab]?.results;
                                                if (!currentResults) return;
                                                const updated = { ...currentResults, isVictory: true };
                                                setMapResults(prev => ({ ...prev, [activeMapTab]: { ...prev[activeMapTab], results: updated } }));
                                            }}
                                            className={`px-4 md:px-6 py-2 rounded-lg md:rounded-xl font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] transition-all ${mapResults[activeMapTab]?.results?.isVictory ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'text-slate-600 hover:text-slate-400'}`}
                                        >VICTORY</button>
                                        <button
                                            onClick={() => {
                                                const currentResults = mapResults[activeMapTab]?.results;
                                                if (!currentResults) return;
                                                const updated = { ...currentResults, isVictory: false };
                                                setMapResults(prev => ({ ...prev, [activeMapTab]: { ...prev[activeMapTab], results: updated } }));
                                            }}
                                            className={`px-4 md:px-6 py-2 rounded-lg md:rounded-xl font-black text-[8px] md:text-[10px] uppercase tracking-[0.2em] transition-all ${mapResults[activeMapTab]?.results && !mapResults[activeMapTab].results.isVictory ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'text-slate-600 hover:text-slate-400'}`}
                                        >DEFEAT</button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 mb-10 overflow-x-auto custom-scrollbar">
                                <div className="min-w-[700px]">
                                    <div className="grid grid-cols-12 gap-4 px-6 mb-4 text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] md:tracking-[0.3em]">
                                        <div className={isValorantFamily ? "col-span-3" : "col-span-4"}>Operator</div>
                                        {isValorantFamily && <div className="col-span-2 text-center text-indigo-400">Agent</div>}
                                        {isValorantFamily && <div className="col-span-2 text-center text-fuchsia-400">Role</div>}
                                        <div className={`text-center ${isValorantFamily ? "col-span-1" : "col-span-2"}`}>Kills</div>
                                        <div className={`text-center ${isValorantFamily ? "col-span-1" : "col-span-2"}`}>Deaths</div>
                                        <div className={`text-center ${isValorantFamily ? "col-span-1" : "col-span-2"}`}>Assists</div>
                                        <div className={`text-center ${isValorantFamily ? "col-span-1" : "col-span-1"} text-amber-500/60`}>+/-</div>
                                        <div className={`text-center text-amber-500/60 "col-span-1"`}>ACS</div>
                                    </div>
                                    <div className="space-y-3">
                                        {mapResults[activeMapTab]?.results?.results?.map((stat, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-4 items-center bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all group/row">
                                                <div className={isValorantFamily ? "col-span-3" : "col-span-4"}>
                                                    <select
                                                        value={stat.playerId || ''}
                                                        onChange={e => {
                                                            const pid = Number(e.target.value);
                                                            const player = currentTeam?.players.find(p => p.id === pid);
                                                            const currentTab = mapResults[activeMapTab];
                                                            const currentResults = currentTab?.results;
                                                            if (player && currentResults) {
                                                                const updatedResultsArr = [...currentResults.results];
                                                                updatedResultsArr[idx] = { ...updatedResultsArr[idx], name: player.name, playerId: player.id };
                                                                setMapResults(prev => ({
                                                                    ...prev,
                                                                    [activeMapTab]: {
                                                                        ...currentTab,
                                                                        results: { ...currentResults, results: updatedResultsArr }
                                                                    }
                                                                }));
                                                            }
                                                        }}
                                                        className="bg-transparent text-white font-black uppercase tracking-tight outline-none w-full py-1 text-sm appearance-none cursor-pointer group-hover/row:text-amber-500 transition-colors"
                                                    >
                                                        <option value="" className="bg-[#020617] text-slate-500">IDENTIFY OPERATOR...</option>
                                                        {currentTeam?.players?.map(p => (
                                                            <option key={p.id} value={p.id} className="bg-[#020617] text-white">{p.name.toUpperCase()}</option>
                                                        ))}
                                                    </select>
                                                    <div className="h-px bg-gradient-to-r from-amber-500/20 to-transparent w-full mt-1" />
                                                </div>
                                                {isValorantFamily && (
                                                    <div className="col-span-2 relative group-agent-sel">
                                                        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10">
                                                            {stat.agent && (
                                                                <img
                                                                    src={getAgentImage(stat.agent || '')}
                                                                    className="w-full h-full object-contain drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]"
                                                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                                                />
                                                            )}
                                                        </div>
                                                        <select value={stat.agent || ''} onChange={e => {
                                                            const currentTab = mapResults[activeMapTab];
                                                            const currentResults = currentTab?.results;
                                                            if (!currentResults) return;
                                                            const updatedResultsArr = [...currentResults.results];
                                                            const newAgent = e.target.value;
                                                            const suggestedRole = VALORANT_AGENT_ROLE_MAP[newAgent] || updatedResultsArr[idx].role;
                                                            updatedResultsArr[idx] = { ...updatedResultsArr[idx], agent: newAgent, role: suggestedRole };
                                                            setMapResults(prev => ({ ...prev, [activeMapTab]: { ...currentTab, results: { ...currentResults, results: updatedResultsArr } } }));
                                                        }} className={`bg-black/40 border border-white/5 rounded-xl py-2 ${stat.agent ? 'pl-7 pr-1' : 'px-1'} text-center font-black text-indigo-400 focus:border-indigo-500/50 outline-none transition-all text-[9.5px] uppercase tracking-widest w-full cursor-pointer appearance-none`}>
                                                            <option value="" className="bg-[#020617] text-slate-500">AGENT</option>
                                                            {VALORANT_AGENTS.map(a => <option key={a} value={a} className="bg-[#020617] text-white">{a.toUpperCase()}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                                {isValorantFamily && (
                                                    <div className="col-span-2">
                                                        <select value={stat.role || ''} onChange={e => {
                                                            const currentTab = mapResults[activeMapTab];
                                                            const currentResults = currentTab?.results;
                                                            if (!currentResults) return;
                                                            const updatedResultsArr = [...currentResults.results];
                                                            updatedResultsArr[idx] = { ...updatedResultsArr[idx], role: e.target.value };
                                                            setMapResults(prev => ({ ...prev, [activeMapTab]: { ...currentTab, results: { ...currentResults, results: updatedResultsArr } } }));
                                                        }} className="bg-black/40 border border-white/5 rounded-xl py-2 px-1 text-center font-black text-fuchsia-400 focus:border-fuchsia-500/50 outline-none transition-all text-[9px] uppercase tracking-widest w-full cursor-pointer appearance-none">
                                                            <option value="" className="bg-[#020617] text-slate-500">ROLE</option>
                                                            {VALORANT_ROLES.map(r => <option key={r} value={r} className="bg-[#020617] text-white">{r.toUpperCase()}</option>)}
                                                        </select>
                                                    </div>
                                                )}
                                                <div className={isValorantFamily ? "col-span-1" : "col-span-2"}>
                                                    <input type="number" min="0" value={stat.kills} onChange={e => {
                                                        const currentTab = mapResults[activeMapTab];
                                                        const currentResults = currentTab?.results;
                                                        if (!currentResults) return;
                                                        const updatedResultsArr = [...currentResults.results];
                                                        updatedResultsArr[idx] = { ...updatedResultsArr[idx], kills: Math.max(0, Number(e.target.value)) };
                                                        setMapResults(prev => ({ ...prev, [activeMapTab]: { ...currentTab, results: { ...currentResults, results: updatedResultsArr } } }));
                                                    }} className="w-full bg-black/40 border border-white/5 rounded-xl py-2 text-center font-black text-emerald-400 focus:border-emerald-500/50 outline-none transition-all px-0" />
                                                </div>
                                                <div className={isValorantFamily ? "col-span-1" : "col-span-2"}>
                                                    <input type="number" min="0" value={stat.deaths} onChange={e => {
                                                        const currentTab = mapResults[activeMapTab];
                                                        const currentResults = currentTab?.results;
                                                        if (!currentResults) return;
                                                        const updatedResultsArr = [...currentResults.results];
                                                        updatedResultsArr[idx] = { ...updatedResultsArr[idx], deaths: Math.max(0, Number(e.target.value)) };
                                                        setMapResults(prev => ({ ...prev, [activeMapTab]: { ...currentTab, results: { ...currentResults, results: updatedResultsArr } } }));
                                                    }} className="w-full bg-black/40 border border-white/5 rounded-xl py-2 text-center font-black text-red-400 focus:border-red-500/50 outline-none transition-all px-0" />
                                                </div>
                                                <div className={isValorantFamily ? "col-span-1" : "col-span-2"}>
                                                    <input type="number" min="0" value={stat.assists} onChange={e => {
                                                        const currentTab = mapResults[activeMapTab];
                                                        const currentResults = currentTab?.results;
                                                        if (!currentResults) return;
                                                        const updatedResultsArr = [...currentResults.results];
                                                        updatedResultsArr[idx] = { ...updatedResultsArr[idx], assists: Math.max(0, Number(e.target.value)) };
                                                        setMapResults(prev => ({ ...prev, [activeMapTab]: { ...currentTab, results: { ...currentResults, results: updatedResultsArr } } }));
                                                    }} className="w-full bg-black/40 border border-white/5 rounded-xl py-2 text-center font-black text-blue-400 focus:border-blue-500/50 outline-none transition-all px-0" />
                                                </div>
                                                <div className={isValorantFamily ? "col-span-1" : "col-span-1"}>
                                                    <div className={`w-full bg-black/20 border border-white/5 rounded-xl py-2 text-center font-black transition-all ${(Number(stat.kills) - Number(stat.deaths)) > 0 ? 'text-emerald-500' : (Number(stat.kills) - Number(stat.deaths)) < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                                        {(Number(stat.kills) - Number(stat.deaths)) > 0 ? `+${Number(stat.kills) - Number(stat.deaths)}` : Number(stat.kills) - Number(stat.deaths)}
                                                    </div>
                                                </div>
                                                <div className={`col-span-1 relative flex items-center space-x-1 md:space-x-3`}>
                                                    <input type="number" min="0" value={stat.acs || 0} onChange={e => {
                                                        const currentTab = mapResults[activeMapTab];
                                                        const currentResults = currentTab?.results;
                                                        if (!currentResults) return;
                                                        const updatedResultsArr = [...currentResults.results];
                                                        updatedResultsArr[idx] = { ...updatedResultsArr[idx], acs: Math.max(0, Number(e.target.value)) };
                                                        setMapResults(prev => ({ ...prev, [activeMapTab]: { ...currentTab, results: { ...currentResults, results: updatedResultsArr } } }));
                                                    }} className="w-full bg-black/40 border border-white/5 rounded-xl py-2 text-center font-black text-amber-400 focus:border-amber-500/50 outline-none transition-all shadow-[0_0_15px_rgba(251,191,36,0.05)]" />
                                                    <button onClick={() => {
                                                        const currentTab = mapResults[activeMapTab];
                                                        const currentResults = currentTab?.results;
                                                        if (!currentResults) return;
                                                        const updatedResultsArr = currentResults.results.filter((_, i) => i !== idx);
                                                        setMapResults(prev => ({ ...prev, [activeMapTab]: { ...currentTab, results: { ...currentResults, results: updatedResultsArr } } }));
                                                    }} className="text-slate-600 hover:text-red-500 transition-colors p-1">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={addManualRow} className="w-full py-4 mt-4 border-2 border-dashed border-white/5 text-slate-500 hover:text-amber-500 hover:border-amber-500/20 rounded-[20px] hover:bg-white/[0.02] transition-all text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em]">
                                        + Insert Tactical Row
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={handleConfirmResults}
                                className="w-full py-5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black uppercase tracking-[0.4em] text-[10px] rounded-2xl shadow-2xl shadow-emerald-900/20 transition-all hover:scale-[1.01] active:scale-[0.98] border-t border-white/20"
                            >
                                Transmit Final Intel
                            </button>
                        </div>
                    )}
                </div>
            )}

            <Modal isOpen={!!scrimActionModal} onClose={() => setScrimActionModal(null)} zIndex={100} backdropClassName="bg-black/80 backdrop-blur-md animate-in fade-in duration-500" className="w-[calc(100%-2rem)] max-w-sm">
                {scrimActionModal && <div className="bg-[#020617] p-6 md:p-10 rounded-[32px] md:rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.5)] w-full border border-white/10 relative overflow-hidden group/modal">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full pointer-events-none" />

                    <div className="relative z-10 text-center space-y-6">
                        <div className="space-y-1 md:space-y-2">
                            <h3 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter">
                                {scrimActionModal.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                            </h3>
                            <div className="flex items-center justify-center space-x-2">
                                <div className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent w-full" />
                                <span className="text-[8px] md:text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] whitespace-nowrap">{scrimActionModal.scrims.length} Active Ops</span>
                                <div className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent w-full" />
                            </div>
                        </div>

                        <div className="space-y-3 pt-4">
                            <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-white/10 group-hover/modal:scrollbar-thumb-amber-500/30">
                                {scrimActionModal.scrims.map(s => (
                                    <div key={s.id} className="w-full bg-white/5 rounded-2xl border border-white/10 overflow-hidden group/scrim shadow-lg">
                                        <button
                                            onClick={() => {
                                                fetchScrimDetails(s);
                                                setScrimActionModal(null);
                                            }}
                                            className="w-full p-4 hover:bg-white/10 transition-all text-left active:scale-[0.98]"
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="space-y-1">
                                                    <div className="text-[10px] font-black text-white uppercase tracking-tighter">
                                                        vs <span className="text-amber-500">{s.opponent}</span>
                                                    </div>
                                                    <div className="text-[8px] text-amber-500/80 font-black uppercase tracking-widest mt-0.5">
                                                        {(() => {
                                                            const m = safeJSONParse(s.maps);
                                                            if (m.length > 0) {
                                                                return m.map((mapName: string, i: number) => `Map ${i + 1}: ${mapName}`).join(' • ');
                                                            }
                                                            return '';
                                                        })()}
                                                    </div>
                                                    <div className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-1">
                                                        {new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {s.format}
                                                    </div>
                                                </div>
                                                <div className={`w-2 h-2 rounded-full ${s.status === 'completed' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' :
                                                    s.status === 'cancelled' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                                                        'bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                                                    }`} />
                                            </div>
                                        </button>
                                        {canEdit() && s.status !== 'completed' && (
                                            <div className="flex border-t border-white/5">
                                                <button
                                                    onClick={() => {
                                                        const d = new Date(s.date);
                                                        const offset = d.getTimezoneOffset() * 60000;
                                                        const localIso = new Date(d.getTime() - offset).toISOString().slice(0, 16);
                                                        setScrimDate(localIso);
                                                        setScrimOpponent(s.opponent);
                                                        setScrimFormat(s.format);
                                                        setSelectedMaps(safeJSONParse(s.maps));
                                                        setSelectedScrimId(s.id);
                                                        setIsEditingDetails(true);
                                                        setView('add-scrim');
                                                        setScrimActionModal(null);
                                                    }}
                                                    className="flex-1 py-2 text-[7px] font-black uppercase tracking-widest text-amber-500/60 hover:text-amber-500 bg-amber-500/5 hover:bg-amber-500/10 transition-all border-r border-white/5"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        handleDeleteMatch(s.id);
                                                        setScrimActionModal(null);
                                                    }}
                                                    className="flex-1 py-2 text-[7px] font-black uppercase tracking-widest text-red-500/60 hover:text-red-500 bg-red-500/5 hover:bg-red-500/10 transition-all"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button onClick={() => {
                                setView('add-scrim');
                                setScrimActionModal(null);
                            }} className="w-full py-5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-2xl transition-all shadow-2xl shadow-amber-500/20 active:scale-95 border-t border-white/20">
                                + Schedule New {labelSingular}
                            </button>
                            <button onClick={() => setScrimActionModal(null)} className="w-full py-2 text-slate-600 hover:text-white font-black uppercase tracking-[0.4em] text-[9px] transition-colors">
                                De-Authorize
                            </button>
                        </div>
                    </div>
                </div>}
            </Modal>

            <Modal isOpen={!!scrimDetailModal} onClose={() => setScrimDetailModal(null)} zIndex={2000} backdropClassName="bg-black/95 backdrop-blur-3xl animate-in fade-in zoom-in duration-500" className="w-full max-w-6xl p-4 md:p-8">
                {scrimDetailModal && <div className="bg-[#020617]/90 backdrop-blur-3xl w-full max-h-[85vh] overflow-y-auto rounded-[40px] md:rounded-[60px] shadow-[0_0_150px_rgba(245,158,11,0.15)] border border-amber-500/20 flex flex-col relative group/detail custom-scrollbar">
                    <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/[0.05] blur-[180px] rounded-full pointer-events-none" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-40" />

                    <div className="p-6 md:p-10 border-b border-white/5 flex flex-col md:flex-row justify-between items-start sticky top-0 bg-[#020617]/95 backdrop-blur-2xl z-30 rounded-t-[40px] md:rounded-t-[60px] gap-6">
                        <div className="space-y-2">
                            <div className="flex items-center space-x-4">
                                <span className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.4em] md:tracking-[0.5em]">Tactical Review</span>
                                <div className="h-px bg-amber-500/30 w-8 md:w-12" />
                            </div>
                            <h2 className="text-2xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-tight">
                                vs <span className="text-amber-500">{scrimDetailModal.opponent}</span>
                            </h2>
                            <div className="text-slate-500 font-bold flex flex-wrap items-center gap-2 md:gap-4 text-[10px] md:text-xs uppercase tracking-[0.2em] pt-4">
                                <span className="bg-white/5 px-4 py-1.5 rounded-xl border border-white/5 whitespace-nowrap">{new Date(scrimDetailModal.date).toLocaleString()}</span>
                                <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-4 py-1.5 rounded-xl whitespace-nowrap">{scrimDetailModal.format}</span>
                                {scrimDetailModal.status === 'completed' && (() => {
                                    const { score, result, color } = calculateSeriesResult(scrimDetailModal);
                                    return (
                                        <div className={`flex items-center space-x-2 px-4 py-1.5 rounded-xl border ${color.replace('text-', 'bg-').replace('-400', '-500/10')} ${color.replace('text-', 'border-').replace('-400', '-500/30')} shadow-[0_0_20px_rgba(245,158,11,0.1)]`}>
                                            <span className="text-[8px] font-black text-slate-500 tracking-[0.2em]">MISSION STATUS:</span>
                                            <span className={`font-black tracking-widest ${color}`}>{result} ({score})</span>
                                        </div>
                                    );
                                })()}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {(() => {
                                    const m = safeJSONParse(scrimDetailModal.maps);
                                    return m.map((mapName: string, i: number) => (
                                        <span key={i} className="text-[8px] md:text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1 rounded-lg font-black uppercase tracking-widest">
                                            Map {i + 1}: {mapName}
                                        </span>
                                    ));
                                })()}
                            </div>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                            {canEdit() && scrimDetailModal.status === 'pending' && (
                                <button
                                    onClick={() => {
                                        // Set date in local ISO format for the datetime-local input
                                        const d = new Date(scrimDetailModal.date);
                                        const offset = d.getTimezoneOffset() * 60000;
                                        const localIso = new Date(d.getTime() - offset).toISOString().slice(0, 16);

                                        setScrimDate(localIso);
                                        setScrimOpponent(scrimDetailModal.opponent);
                                        setScrimFormat(scrimDetailModal.format);
                                        setSelectedMaps(scrimDetailModal.maps ? JSON.parse(scrimDetailModal.maps) : []);
                                        setSelectedScrimId(scrimDetailModal.id);
                                        setIsEditingDetails(true);
                                        setView('add-scrim');
                                        setScrimDetailModal(null);
                                    }}
                                    className="w-full md:w-auto px-6 py-3 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black border border-amber-500/20 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-xl active:scale-95 flex items-center justify-center space-x-2 group-hover/detail:border-amber-500/40"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    <span>Edit Deployment</span>
                                </button>
                            )}
                            <button
                                onClick={() => setScrimDetailModal(null)}
                                className="absolute md:relative top-6 md:top-0 right-6 md:right-0 w-10 h-10 md:w-12 md:h-12 bg-white/5 hover:bg-amber-500 hover:text-black text-white rounded-xl md:rounded-2xl flex items-center justify-center transition-all duration-700 border border-white/10 group/close active:scale-90 shadow-2xl rotate-0 hover:rotate-90 z-40"
                            >
                                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                    </div>

                    <div className="p-6 md:p-10 space-y-10 md:space-y-12">
                        {/* Map Results */}
                        {scrimDetailModal.results && (() => {
                            try {
                                const results = JSON.parse(scrimDetailModal.results);
                                if (!Array.isArray(results)) return null;
                                return (
                                    <div className="space-y-4 md:space-y-6">
                                        <h3 className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] md:tracking-[0.5em] ml-2">Theater Archives</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {results.map((res: any, idx: number) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => res.image && setSelectedIntelImage(res.image)}
                                                    className={`relative overflow-hidden rounded-[24px] md:rounded-[30px] border-2 transition-all duration-700 group/map shadow-2xl ${res.image ? 'cursor-pointer' : ''} ${res.isVictory ? 'border-emerald-500/30 hover:border-emerald-500' : 'border-red-500/30 hover:border-red-500'}`}
                                                >
                                                    <div className="absolute inset-0 bg-black/60 group-hover/map:bg-black/40 transition-colors z-10" />
                                                    {res.image && <img src={res.image} alt="Map Result" className="absolute inset-0 w-full h-full object-cover grayscale group-hover/map:grayscale-0 transition-all duration-700 scale-110 group-hover/map:scale-100" />}
                                                    <div className="relative z-20 p-6 md:p-8 flex flex-col items-center justify-center h-48 md:h-56 text-center space-y-3 md:space-y-4">
                                                        <div className="text-[8px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Engagement Component</div>
                                                        <h4 className="text-2xl md:text-3xl font-black text-white italic uppercase tracking-tighter">{getAvailableMaps().length === 1 ? 'GAME' : 'PHASE'} {res.map}</h4>
                                                        <div className={`px-5 md:px-6 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black tracking-[0.3em] uppercase shadow-2xl backdrop-blur-md border ${res.isVictory ? 'bg-emerald-500 text-white border-white/20' : 'bg-red-500 text-white border-white/20'}`}>
                                                            {res.score}
                                                        </div>
                                                        {res.image && (
                                                            <div className="absolute bottom-4 opacity-0 group-hover/map:opacity-100 transition-opacity">
                                                                <span className="text-[8px] font-black text-amber-500 uppercase tracking-[0.4em] bg-black/60 px-3 py-1 rounded-full border border-amber-500/20">Expand Visual</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            } catch (e) {
                                return <div className="p-10 bg-red-500/10 border border-red-500/20 text-red-500 rounded-3xl font-black uppercase tracking-widest text-[10px] text-center">Data Corruption Detected: Failed to Render Archives.</div>;
                            }
                        })()}

                        {/* Player Stats Grouped by Map */}
                        <div className="space-y-12 pb-12">
                            {(() => {
                                const stats = (scrimDetailModal as any).stats || [];
                                if (stats.length === 0) {
                                    return (
                                        <div className="p-24 text-center">
                                            <div className="flex flex-col items-center space-y-4 opacity-50">
                                                <svg className="w-12 h-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em]">No tactical data archived for this operation</p>
                                            </div>
                                        </div>
                                    );
                                }

                                // Group stats by map
                                const groupedStats: Record<string, any[]> = {};
                                stats.forEach((s: any) => {
                                    const mapName = s.map || 'Unknown Theater';
                                    if (!groupedStats[mapName]) groupedStats[mapName] = [];
                                    groupedStats[mapName].push(s);
                                });

                                return Object.entries(groupedStats).map(([mapName, mapStats], gIdx) => (
                                    <div key={mapName} className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: `${gIdx * 150}ms` }}>
                                        <div className="flex justify-between items-end px-6">
                                            <div className="space-y-1">
                                                <h3 className="text-[10px] md:text-xs font-black text-amber-500 uppercase tracking-[0.5em]">Theater Phase: {mapName}</h3>
                                                <div className="h-px bg-gradient-to-r from-amber-500/50 to-transparent w-32" />
                                            </div>
                                        </div>

                                        <div className="overflow-x-auto bg-white/[0.02] rounded-[32px] md:rounded-[40px] border border-white/5 shadow-inner custom-scrollbar mx-4">
                                            <table className="w-full text-left border-collapse min-w-[800px] md:min-w-full">
                                                <thead>
                                                    <tr className="border-b border-white/5 text-[8px] md:text-[10px] uppercase font-black tracking-[0.3em] md:tracking-[0.4em] text-slate-500">
                                                        <th className="p-4 md:p-6 whitespace-nowrap">Operator identity</th>
                                                        {isValorantFamily && <th className="p-4 md:p-6 text-center whitespace-nowrap text-indigo-400">Agent</th>}
                                                        {isValorantFamily && <th className="p-4 md:p-6 text-center whitespace-nowrap text-fuchsia-400">Role</th>}
                                                        <th className="p-4 md:p-6 text-center whitespace-nowrap">K / D / A</th>
                                                        <th className="p-4 md:p-6 text-center whitespace-nowrap">+/-</th>
                                                        <th className="p-4 md:p-6 text-center whitespace-nowrap">KDA Ratio</th>
                                                        <th className="p-4 md:p-6 text-center text-amber-500 whitespace-nowrap">ACS</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {mapStats.map((stat: any, idx: number) => (
                                                        <tr key={idx} onClick={() => {
                                                            setSelectedPlayerForStats({
                                                                id: stat.playerId,
                                                                name: stat.playerName || stat.name || 'Unknown',
                                                                role: stat.role,
                                                                image: stat.playerImage || stat.image,
                                                                acs: stat.acs?.toString(),
                                                                userId: stat.playerUserId,
                                                                kda: calculateKDA(stat.kills, stat.assists, stat.deaths)
                                                            });
                                                            setIsPlayerStatsModalOpen(true);
                                                        }} className="group/stat hover:bg-white/[0.02] transition-colors cursor-pointer text-sm">
                                                            <td className="p-4 md:p-6 whitespace-nowrap">
                                                                <div className="flex items-center space-x-4 md:space-x-6">
                                                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/5 border border-white/10 overflow-hidden shadow-2xl group-hover/stat:border-amber-500/50 transition-colors relative">
                                                                        {(stat.playerImage || stat.image) ? (
                                                                            <img src={stat.playerImage || stat.image} className="w-full h-full object-cover group-hover/stat:scale-110 transition-transform duration-700" />
                                                                        ) : (
                                                                            <div className="w-full h-full flex items-center justify-center text-slate-700 font-black">?</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-base md:text-lg font-black text-white italic uppercase tracking-tighter group-hover/stat:text-amber-500 transition-colors line-clamp-1">{stat.playerName || stat.name || 'REDACTED'}</span>
                                                                        <div className="text-[8px] md:text-[9px] text-slate-600 font-black uppercase tracking-widest line-clamp-1">Certified Combatant</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {isValorantFamily && (
                                                                <td className="p-4 md:p-6 text-center font-black text-lg md:text-xl text-indigo-400 italic tracking-tighter uppercase">
                                                                    <div className="flex items-center justify-center gap-3">
                                                                        <img
                                                                            src={getAgentImage(stat.agent || '')}
                                                                            className="w-8 h-8 object-contain drop-shadow-[0_0_8px_rgba(79,70,229,0.3)] group-hover/stat:scale-110 transition-transform duration-500"
                                                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                                                        />
                                                                        <span>{stat.agent || 'N/A'}</span>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            {isValorantFamily && (
                                                                <td className="p-4 md:p-6 text-center font-black text-lg md:text-xl text-fuchsia-400 italic tracking-tighter uppercase">{stat.role || 'N/A'}</td>
                                                            )}
                                                            <td className="p-4 md:p-6 text-center">
                                                                <div className="text-lg md:text-xl font-black text-white italic tracking-tighter tabular-nums">
                                                                    {stat.kills}/{stat.deaths}/{stat.assists}
                                                                </div>
                                                            </td>
                                                            <td className="p-4 md:p-6 text-center">
                                                                <div className={`text-lg md:text-xl font-black italic tracking-tighter tabular-nums ${(stat.kills - stat.deaths) > 0 ? 'text-emerald-500' : (stat.kills - stat.deaths) < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                                                    {(stat.kills - stat.deaths) > 0 ? `+${stat.kills - stat.deaths}` : stat.kills - stat.deaths}
                                                                </div>
                                                            </td>
                                                            <td className="p-4 md:p-6 text-center">
                                                                <div className={`text-lg md:text-xl font-black italic tracking-tighter tabular-nums ${getKDAColor(calculateKDA(stat.kills, stat.assists, stat.deaths))}`}>
                                                                    {calculateKDA(stat.kills, stat.assists, stat.deaths)}
                                                                </div>
                                                                <div className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-700 mt-1">KDA RATIO</div>
                                                            </td>
                                                            <td className="p-4 md:p-6 text-center">
                                                                <span className="text-xl md:text-2xl font-black italic tracking-tighter text-amber-500 tabular-nums shadow-amber-500/20">{stat.acs || '000'}</span>
                                                                <div className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-amber-500/40 mt-1">ACS</div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                    <div className="p-6 md:p-8 bg-[#020617]/95 backdrop-blur-2xl border-t border-white/5 flex justify-center sticky bottom-0 z-20 rounded-b-[40px] md:rounded-b-[60px]">
                        <button
                            onClick={() => setScrimDetailModal(null)}
                            className="w-full md:w-auto px-10 md:px-16 py-4 md:py-5 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black font-black uppercase tracking-[0.4em] md:tracking-[0.5em] text-[10px] md:text-[11px] rounded-2xl transition-all border border-amber-500/20 hover:border-amber-500 active:scale-95 shadow-[0_0_50px_rgba(245,158,11,0.1)] hover:shadow-[0_0_50px_rgba(245,158,11,0.3)]"
                        >
                            Close Command Interface
                        </button>
                    </div>

                </div>}
            </Modal>

            <Modal isOpen={!!selectedIntelImage} onClose={() => setSelectedIntelImage(null)} zIndex={5000} backdropClassName="bg-black/98 backdrop-blur-3xl animate-in fade-in zoom-in duration-500" className="w-full h-full flex items-center justify-center p-4 md:p-12">
                {selectedIntelImage && <div className="relative max-w-7xl max-h-full flex items-center justify-center group/visualizer" onClick={() => setSelectedIntelImage(null)}>
                    <div className="absolute -inset-4 bg-amber-500/10 rounded-[40px] blur-3xl opacity-0 group-hover/visualizer:opacity-100 transition-opacity duration-1000" />
                    <img
                        src={selectedIntelImage}
                        alt="Intel Visualizer"
                        className="max-w-full max-h-full object-contain rounded-[32px] md:rounded-[48px] shadow-[0_0_120px_rgba(245,158,11,0.2)] border-2 border-white/10 transition-all duration-700 group-hover/visualizer:border-amber-500/30 group-hover/visualizer:scale-[1.02]"
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); setSelectedIntelImage(null); }}
                        className="absolute -top-6 -right-6 w-16 h-16 bg-[#020617]/80 backdrop-blur-xl hover:bg-red-500 text-white rounded-[24px] flex items-center justify-center transition-all border border-white/10 active:scale-90 shadow-2xl group/close"
                    >
                        <svg className="w-8 h-8 group-hover/close:rotate-90 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 px-10 py-4 bg-[#020617]/80 backdrop-blur-2xl border border-amber-500/20 rounded-full text-amber-500 font-black text-[10px] md:text-xs uppercase tracking-[0.5em] opacity-0 group-hover/visualizer:opacity-100 transition-all duration-500 shadow-2xl">
                        High-Resolution Tactical Stream
                    </div>
                </div>}
            </Modal>

            <PlayerStatsModal
                player={selectedPlayerForStats}
                isOpen={isPlayerStatsModalOpen}
                onClose={() => setIsPlayerStatsModalOpen(false)}
                userRole={userRole}
                currentUserId={userId}
                showAdvancedIntel={true}
            />
        </div>
    );
};

export default TeamManagement;
