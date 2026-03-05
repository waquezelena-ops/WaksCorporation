
import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getTeamAnalysis } from '../services/geminiService';
import { useUser } from '../services/authService';
import { useNotification } from '../hooks/useNotification';
import { GET_API_BASE_URL } from '../utils/apiUtils';
import { animate, stagger } from 'animejs';

const EMPTY_STATS = (label1: string, label2: string, label3: string, label4: string) => [
  { label: label1, value: '—', color: 'bg-amber-500' },
  { label: label2, value: '—', color: 'bg-slate-200' },
  { label: label3, value: '—', color: 'bg-purple-600' },
  { label: label4, value: '—', color: 'bg-slate-500' },
];

interface DashboardProps {
  onProfileClick: () => void;
  userId?: number;
  userRole?: string;
}

interface TeamOption { id: number; name: string; game: string; }

type ActiveTab = 'command' | 'tactical';

const Dashboard: React.FC<DashboardProps> = ({ onProfileClick, userId, userRole }) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('command');

  // Scrim stats (Command tab)
  const [scrimStats, setScrimStats] = useState(EMPTY_STATS('Scrims Won', 'Total Scrims', 'Win Rate', 'Scrims Lost'));
  const [scrimLabel, setScrimLabel] = useState('Global · All-Time');
  const [isLoadingScrim, setIsLoadingScrim] = useState(true);

  // Tournament stats (Tactical tab)
  const [tourStats, setTourStats] = useState(EMPTY_STATS('Tournaments Won', 'Total Tournaments', 'Win Rate', 'Losses'));
  const [tourLabel, setTourLabel] = useState('Global · All-Time');
  const [isLoadingTour, setIsLoadingTour] = useState(false);

  // Team selector state
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  // Chart state
  const [chartPeriod, setChartPeriod] = useState<'yearly' | 'monthly'>('monthly');
  const [rawScrims, setRawScrims] = useState<any[]>([]);
  const [rawTournaments, setRawTournaments] = useState<any[]>([]);

  const roles = (userRole || '').split(',').map(r => r.trim());
  const isPlayer = roles.some(r => r === 'player');

  const API = GET_API_BASE_URL();

  // ── Load scrim stats from /api/reports/weekly ─────────────────────────────
  const loadScrimStats = async (teamId?: number) => {
    setIsLoadingScrim(true);
    try {
      // ── Parallelized API Fetching ──────────────────────────────────────────
      const statsUrl = teamId ? `${API}/api/reports/weekly?teamId=${teamId}&requesterId=${userId}` : `${API}/api/reports/weekly?requesterId=${userId}`;
      const rawUrl = teamId ? `${API}/api/scrims?teamId=${teamId}&requesterId=${userId}` : `${API}/api/scrims?requesterId=${userId}`;

      const [statsRes, rawRes] = await Promise.all([
        fetch(statsUrl),
        fetch(rawUrl)
      ]);

      const [result, rawResult] = await Promise.all([
        statsRes.json(),
        rawRes.json()
      ]);

      if (result?.success) {
        const at = result.data?.allTime || {};
        const wins = at.wins ?? 0;
        const losses = at.losses ?? 0;
        const total = at.total ?? (wins + losses);
        const wr = at.winRate ?? (total > 0 ? Math.round((wins / total) * 100) : 0);
        setScrimStats([
          { label: 'Scrims Won', value: `${wins}`, color: 'bg-amber-500' },
          { label: 'Total Scrims', value: `${total}`, color: 'bg-white' },
          { label: 'Win Rate', value: `${wr}%`, color: 'bg-purple-600' },
          { label: 'Scrims Lost', value: `${losses}`, color: 'bg-slate-500' },
        ]);
      }

      const scrimList = rawResult.success ? rawResult.data : (Array.isArray(rawResult) ? rawResult : []);
      setRawScrims(scrimList);
    } catch { /* keep defaults */ }
    setIsLoadingScrim(false);
  };

  // ── Load tournament stats from /api/tournaments ───────────────────────────
  const loadTourStats = async (teamId?: number) => {
    setIsLoadingTour(true);
    try {
      const url = teamId ? `${API}/api/tournaments?teamId=${teamId}&requesterId=${userId}` : `${API}/api/tournaments?requesterId=${userId}`;
      const r = await fetch(url);
      const result = await r.json();
      const list: any[] = result.success ? result.data : (Array.isArray(result) ? result : []);
      setRawTournaments(list); // store for chart
      const completed = list.filter((t: any) => t.status === 'completed' || t.placement);
      const total = completed.length;
      const wins = completed.filter((t: any) =>
        t.placement === '1st' || t.placement === '1' || t.placement === 1 || String(t.placement).includes('1st')
      ).length;
      const losses = total - wins;
      const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
      setTourStats([
        { label: 'Tournaments Won', value: `${wins}`, color: 'bg-amber-500' },
        { label: 'Total Tournaments', value: `${total}`, color: 'bg-white' },
        { label: 'Win Rate', value: `${wr}%`, color: 'bg-purple-600' },
        { label: 'Losses', value: `${losses}`, color: 'bg-slate-500' },
      ]);
    } catch { /* keep defaults */ }
    setIsLoadingTour(false);
  };

  // ── Initial load: global stats and teams in parallel ─────────────────────
  useEffect(() => {
    setScrimLabel('Global · All-Time');
    setTourLabel('Global · All-Time');

    // Fire off team loading simultaneously with scrim stats loading
    const initDashboard = async () => {
      loadScrimStats(); // Handles its own state
      try {
        const r = await fetch(`${API}/api/teams?requesterId=${userId}`);
        const result = await r.json();
        if (result.success && result.data?.length > 0) {
          setTeamOptions(result.data.map((t: any) => ({ id: t.id, name: t.name, game: t.game })));
        }
      } catch { }
    };

    initDashboard();

    // Staggered Entry Animation
    requestAnimationFrame(() => {
      // Heading
      animate('.dash-heading', {
        opacity: [0, 1],
        translateX: [-20, 0],
        duration: 800,
        easing: 'easeOutQuart'
      });

      // Stat Cards
      animate('.stat-card', {
        opacity: [0, 1],
        translateY: [20, 0],
        delay: stagger(100, { start: 200 }),
        duration: 800,
        easing: 'easeOutQuart'
      });

      // Chart Container
      animate('.chart-container', {
        opacity: [0, 1],
        scale: [0.98, 1],
        delay: 500,
        duration: 1000,
        easing: 'easeOutQuart'
      });
    });

    const handleRefresh = () => {
      console.log("[DASHBOARD] Real-time sync triggered");
      loadScrimStats(selectedTeamId ?? undefined);
      if (activeTab === 'tactical') loadTourStats(selectedTeamId ?? undefined);
    };

    window.addEventListener('nxc-db-refresh', handleRefresh);
    return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
  }, [userId, selectedTeamId, activeTab]);

  // ── Load tournament stats when Tactical tab is first opened ───────────────
  useEffect(() => {
    if (activeTab === 'tactical' && tourStats[1].value === '—') {
      loadTourStats(selectedTeamId ?? undefined);
    }
  }, [activeTab]);

  // ── React to team selection ───────────────────────────────────────────────
  useEffect(() => {
    const teamObj = teamOptions.find(t => t.id === selectedTeamId);
    const label = selectedTeamId ? `${teamObj?.name} · All-Time` : 'Global · All-Time';
    setScrimLabel(label);
    setTourLabel(label);
    loadScrimStats(selectedTeamId ?? undefined);
    if (activeTab === 'tactical') loadTourStats(selectedTeamId ?? undefined);
  }, [selectedTeamId]);

  const handleAnalyze = async () => {
    showNotification({ message: 'Feature not available as of the moment', type: 'info' });
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const currentStats = activeTab === 'command' ? scrimStats : tourStats;
      const result = await getTeamAnalysis({
        winRate: currentStats[2]?.value || '—',
        practiceHours: '14h daily',
        rosterHealth: 'Optimal',
        tournamentStatus: activeTab === 'command' ? 'Scrim Season' : 'Tournament Circuit'
      });
      setAiAnalysis(result || "Strategic optimization complete. Citadel protocols active.");
    } catch {
      setAiAnalysis("Unable to reach the Tactical AI core. Re-establishing link...");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const activeStats = activeTab === 'command' ? scrimStats : tourStats;
  const activeLabel = activeTab === 'command' ? scrimLabel : tourLabel;
  const isLoading = activeTab === 'command' ? isLoadingScrim : isLoadingTour;
  const selectedTeamName = teamOptions.find(t => t.id === selectedTeamId)?.name || 'All Sectors';

  // ── Compute chart data from raw scrims or tournaments grouped by period ───
  const computedChartData = useMemo(() => {
    const rawData = activeTab === 'command' ? rawScrims : rawTournaments;
    if (!rawData || rawData.length === 0) return [];

    const groups: Record<string, { wins: number; total: number }> = {};
    rawData.forEach((item: any) => {
      const dateStr = item.date || item.scheduledAt || item.createdAt || '';
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const key = chartPeriod === 'yearly'
        ? `${d.getFullYear()}`
        : `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
      if (!groups[key]) groups[key] = { wins: 0, total: 0 };
      groups[key].total += 1;

      // Detect win: results is a JSON array of map results, each with score: 'WIN' | 'LOSS'
      let isWin = false;
      try {
        const results = typeof item.results === 'string' ? JSON.parse(item.results) : item.results;
        if (Array.isArray(results) && results.length > 0) {
          const mapWins = results.filter((m: any) => m.score === 'WIN').length;
          isWin = mapWins > results.length / 2;
        }
      } catch { }
      if (isWin) groups[key].wins += 1;
    });

    return Object.entries(groups)
      .sort(([a], [b]) => new Date(a + ' 1').getTime() - new Date(b + ' 1').getTime())
      .map(([key, v]) => ({
        date: key,
        winRate: v.total > 0 ? Math.round((v.wins / v.total) * 100) : 0,
        wins: v.wins,
        total: v.total,
      }));
  }, [rawScrims, rawTournaments, activeTab, chartPeriod]);


  return (
    <div className="w-full glass rounded-[48px] overflow-hidden transition-all duration-700">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row items-center justify-between p-6 md:p-8 bg-white/5 border-b border-white/5 gap-6 md:gap-0">
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="flex flex-col leading-none text-center md:text-left">
            <span className="font-black text-lg md:text-xl tracking-tighter text-[var(--text-color)] dark:text-white">Citadel Deck</span>
            <span className="text-[10px] text-amber-600 dark:text-amber-500 font-black uppercase tracking-[0.2em] mt-1 opacity-80 dark:opacity-60">Control Terminal</span>
          </div>
          <div className="flex bg-black/40 rounded-2xl p-1.5 border border-white/5 w-full md:w-auto overflow-x-auto justify-center">
            <button
              onClick={() => setActiveTab('command')}
              className={`px-4 md:px-6 py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${activeTab === 'command' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-slate-500 hover:text-white'}`}
            >Command</button>
            <button
              onClick={() => setActiveTab('tactical')}
              className={`px-4 md:px-6 py-2 text-[8px] md:text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${activeTab === 'tactical' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-slate-500 hover:text-white'}`}
            >Tactical</button>
          </div>
        </div>
        <div className="flex items-center space-x-6">

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-amber-500 p-[2px] shadow-xl hover:scale-105 transition-all active:scale-95"
            >
              <img src={user?.photoURL || "https://picsum.photos/seed/admin/100"} alt="Profile" className="w-full h-full rounded-[14px] border-2 border-slate-900 object-cover" />
            </button>

            {showProfileMenu && (
              <div className="absolute top-full right-0 mt-4 w-56 bg-[#020617]/90 backdrop-blur-3xl border border-amber-500/20 rounded-[32px] shadow-2xl overflow-hidden z-30 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="p-5 border-b border-white/5 bg-white/5">
                  <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.2em]">{user?.displayName || 'Commander'}</p>
                </div>
                <div className="p-2">
                  <button
                    onClick={() => { onProfileClick(); setShowProfileMenu(false); }}
                    className="w-full flex items-center space-x-4 px-4 py-3 text-sm font-bold text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-2xl transition-all"
                  >
                    <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    <span>Profile Deck</span>
                  </button>
                  <button
                    onClick={() => setShowProfileMenu(false)}
                    className="w-full flex items-center space-x-4 px-4 py-3 text-sm font-bold text-slate-300 hover:text-amber-400 hover:bg-white/5 rounded-2xl transition-all"
                  >
                    <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span>Protocol</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab label indicator */}
      <div className="px-6 md:px-10 pt-6 flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full animate-pulse ${activeTab === 'command' ? 'bg-amber-500 shadow-[0_0_8px_#fbbf24]' : 'bg-purple-500 shadow-[0_0_8px_#a855f7]'}`} />
        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-slate-600 dark:text-slate-500">
          {activeTab === 'command' ? 'Scrim Intelligence — Command View' : 'Tournament Intelligence — Tactical View'}
        </span>
      </div>

      {/* Main Content */}
      <div className="p-6 md:p-10 space-y-12 md:space-y-24 text-center md:text-left">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 md:gap-12">
          <div className="space-y-6 md:space-y-8">
            <div className="space-y-2">
              <div className="flex items-center justify-center md:justify-start space-x-3">
                <span className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_10px_#fbbf24] animate-pulse" />
                <p className="text-[10px] text-amber-600 dark:text-amber-500 font-black uppercase tracking-[0.4em]">Signal Established // Secure</p>
              </div>
              <h2 className="text-3xl md:text-5xl font-black text-[var(--text-color)] dark:text-white tracking-tight dash-heading" style={{ opacity: 0 }}>
                Welcome, <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-600 to-amber-700 dark:from-amber-200 dark:via-amber-400 dark:to-amber-600 drop-shadow-[0_0_20px_rgba(251,191,36,0.1)]">{user?.displayName || 'Commander'}</span>
              </h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                <span className="px-4 py-1.5 rounded-full bg-purple-600/20 border border-purple-500/30 text-[8px] md:text-[10px] font-black text-purple-400 uppercase tracking-[0.3em]">
                  Rank: {(user as any)?.role || 'Elite Member'}
                </span>
                <span className="px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[8px] md:text-[10px] font-black text-amber-400 uppercase tracking-[0.3em]">
                  {isLoading ? 'Loading...' : `📊 ${activeLabel}`}
                </span>

                {/* Universal Team Filter — visible to all */}
                <div className="relative">
                  <button
                    onClick={() => setShowTeamDropdown(!showTeamDropdown)}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 border border-white/10 text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] hover:border-amber-500/40 hover:text-amber-400 transition-all"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    {selectedTeamId ? selectedTeamName : 'All Sectors'}
                    <svg className={`w-3 h-3 transition-transform ${showTeamDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showTeamDropdown && (
                    <div className="absolute top-full left-1/2 md:left-0 -translate-x-1/2 md:translate-x-0 mt-2 w-72 bg-[#020617]/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setSelectedTeamId(null); setShowTeamDropdown(false); }}
                        className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${selectedTeamId === null ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                      >🌐 All Sectors (Global)</button>
                      {teamOptions.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTeamId(t.id); setShowTeamDropdown(false); }}
                          className={`w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-t border-white/5 ${selectedTeamId === t.id ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                        >
                          <span className="block">{t.name}</span>
                          <span className="text-slate-600 normal-case font-normal tracking-normal">{t.game}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap gap-4 md:gap-6">
              {activeStats.map((stat, idx) => (
                <div key={idx} className="glass rounded-[24px] md:rounded-3xl p-5 md:p-6 min-w-0 md:min-w-[180px] hover:border-amber-500/40 transition-all group cursor-default stat-card" style={{ opacity: 0 }}>
                  <p className="text-[8px] md:text-[9px] text-slate-400/70 dark:text-slate-500 font-black uppercase tracking-[0.2em] md:tracking-[0.3em] mb-3 md:mb-4 group-hover:text-amber-500 transition-colors">{stat.label}</p>
                  <div className="flex items-end justify-between">
                    <span className={`text-2xl md:text-3xl font-black text-[var(--text-color)] dark:text-white tracking-tighter ${isLoading ? 'animate-pulse opacity-50' : ''}`}>{stat.value}</span>
                    <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${stat.color} shadow-[0_0_15px_rgba(251,191,36,0.4)] group-hover:scale-125 transition-transform`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 bg-black/30 p-6 md:p-8 rounded-[30px] md:rounded-[40px] border border-white/5">
            <div className="text-center min-w-[80px]">
              <div className="flex items-baseline justify-center space-x-1 group">
                <span className="text-3xl md:text-5xl font-black text-[var(--text-color)] dark:text-white group-hover:text-amber-500 transition-colors tracking-tighter">{Number(activeStats[1]?.value) || '—'}</span>
                <span className="text-emerald-500 text-[8px] md:text-[10px] font-black group-hover:translate-y-[-2px] transition-transform">▲</span>
              </div>
              <p className="text-[8px] md:text-[9px] text-slate-400/60 dark:text-slate-500 font-black uppercase tracking-widest mt-1 md:mt-2 whitespace-nowrap">
                {activeTab === 'command' ? 'Deployments' : 'Tournaments'}
              </p>
            </div>
            <div className="text-center min-w-[80px]">
              <div className="flex items-baseline justify-center space-x-1 group">
                <span className="text-3xl md:text-5xl font-black text-[var(--text-color)] dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors tracking-tighter">{Number(activeStats[0]?.value) || '—'}</span>
                <span className="text-blue-400 text-[8px] md:text-[10px] font-black group-hover:translate-y-[-2px] transition-transform">▲</span>
              </div>
              <p className="text-[8px] md:text-[9px] text-slate-600 dark:text-slate-500 font-black uppercase tracking-widest mt-1 md:mt-2 whitespace-nowrap">Wins</p>
            </div>
            <div className="text-center min-w-[80px]">
              <div className="flex items-baseline justify-center space-x-1 group">
                <span className="text-3xl md:text-5xl font-black text-[var(--text-color)] dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-200 transition-colors tracking-tighter">{activeStats[2]?.value || '—'}</span>
                <span className="text-amber-500 text-[8px] md:text-[10px] font-black group-hover:translate-y-[-2px] transition-transform animate-pulse">▲</span>
              </div>
              <p className="text-[8px] md:text-[9px] text-slate-600 dark:text-slate-500 font-black uppercase tracking-widest mt-1 md:mt-2 whitespace-nowrap">Win Rate</p>
            </div>
          </div>
        </div>

        {/* Charts & Cards Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 md:gap-10">
          <div className="xl:col-span-2 glass rounded-[30px] md:rounded-[40px] p-6 md:p-10 relative overflow-hidden group chart-container" style={{ opacity: 0 }}>
            <div className="absolute top-0 right-0 p-4 md:p-8">
              <div className="w-24 h-24 md:w-32 md:h-32 bg-amber-500/5 blur-[80px] rounded-full group-hover:bg-amber-500/10 transition-all duration-1000" />
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between mb-8 md:mb-12 relative z-10 gap-6 md:gap-0">
              <div className="flex items-center space-x-4">
                <div className="w-1 h-6 md:h-8 bg-amber-500 rounded-full" />
                <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.3em] md:tracking-[0.4em]">Performance Matrix</h3>
              </div>
              <div className="flex bg-black/60 rounded-2xl p-1.5 border border-white/5 text-[8px] md:text-[9px] font-black uppercase tracking-widest w-full md:w-auto justify-center md:justify-start">
                <button
                  onClick={() => setChartPeriod('yearly')}
                  className={`px-4 md:px-5 py-2 rounded-xl transition-all ${chartPeriod === 'yearly' ? 'bg-white/5 text-amber-500 shadow-xl border border-white/10' : 'text-slate-600 hover:text-white'}`}
                >Yearly</button>
                <button
                  onClick={() => setChartPeriod('monthly')}
                  className={`px-4 md:px-5 py-2 transition-all ${chartPeriod === 'monthly' ? 'bg-white/5 text-amber-500 shadow-xl border border-white/10 rounded-xl' : 'text-slate-600 hover:text-white'}`}
                >Monthly</button>
              </div>
            </div>

            <div className="h-[320px] min-h-[320px] w-full relative z-10">
              {computedChartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <p className="text-[10px] font-black uppercase tracking-[0.5em] text-amber-500">No Data Available</p>
                  <p className="text-[9px] text-slate-500 mt-2">Stats will appear once scrims are logged</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={computedChartData}>
                    <defs>
                      <linearGradient id="colorWinRoyalty" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorWinsRoyalty" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4c1d95" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#4c1d95" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="10 10" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10, fontWeight: '900' }} dy={15} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '24px', color: '#fff', padding: '20px' }}
                      itemStyle={{ fontSize: '11px', fontWeight: '900', color: '#fbbf24', textTransform: 'uppercase' }}
                      formatter={(value: any, name: string) => [
                        name === 'winRate' ? `${value}%` : value,
                        name === 'winRate' ? 'Win Rate' : 'Wins'
                      ]}
                    />
                    <Area type="monotone" dataKey="winRate" stroke="#fbbf24" strokeWidth={4} fillOpacity={1} fill="url(#colorWinRoyalty)" name="winRate" />
                    <Area type="monotone" dataKey="wins" stroke="#4c1d95" strokeWidth={4} fillOpacity={1} fill="url(#colorWinsRoyalty)" name="wins" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-10">
            <div className="bg-gradient-to-br from-[#1e1b4b] to-[#4c1d95] rounded-[30px] md:rounded-[40px] p-8 md:p-10 relative overflow-hidden group cursor-pointer shadow-2xl border border-white/5">
              <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-amber-500/10 blur-[90px] rounded-full animate-pulse" />
              <div className="absolute bottom-0 right-0 p-6 md:p-8 opacity-20 group-hover:opacity-100 group-hover:translate-y-[-5px] transition-all duration-500">
                <svg className="w-8 h-8 md:w-10 md:h-10 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm4.59-12.42L10 14.17l-2.59-2.58L6 13l4 4 8-8z" /></svg>
              </div>
              <h3 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] md:tracking-[0.5em] mb-4 md:mb-6 text-amber-400/80">
                {activeTab === 'command' ? 'Intelligence Core' : 'Tactical Core'}
              </h3>
              <p className="text-sm leading-relaxed text-slate-200 mb-10 font-bold opacity-80">
                {activeTab === 'command'
                  ? (isPlayer ? "Scrim telemetry synchronized. Analyzing match patterns for tactical dominance."
                    : "Scrim analytics active. Reviewing all deployment results and team performance vectors.")
                  : (isPlayer ? "Tournament data synchronized. Analyzing bracket performance and competitive outcomes."
                    : "Tournament telemetry active. Reviewing event placements and competitive intelligence.")
                }
              </p>
              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full py-5 bg-black/40 hover:bg-black/60 text-amber-400 rounded-3xl font-black uppercase tracking-[0.2em] text-[10px] backdrop-blur-xl active:scale-95 transition-all disabled:opacity-50 border border-white/10 shadow-2xl"
              >
                {isAnalyzing ? "Processing Signal..." : "Initialize Tactical AI"}
              </button>
            </div>

            <div className="glass rounded-[30px] md:rounded-[40px] p-8 md:p-10 flex-grow relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/10 to-transparent" />
              {aiAnalysis ? (
                <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 relative z-10">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_#fbbf24]" />
                    <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] md:tracking-[0.4em]">Intelligence Signal</span>
                  </div>
                  <p className="text-sm md:text-base text-white font-medium italic leading-relaxed first-letter:text-2xl md:first-letter:text-3xl first-letter:font-black first-letter:text-amber-500 first-letter:mr-1">
                    "{aiAnalysis}"
                  </p>
                </div>
              ) : (
                <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center opacity-30 relative z-10">
                  <div className="w-12 h-12 md:w-16 md:h-16 mb-4 md:mb-6 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
                    <svg className="w-6 h-6 md:w-8 md:h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.5em] text-amber-500">Standby</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
