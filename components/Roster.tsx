import React, { useEffect, useState, useMemo, useRef } from 'react';
import { GAME_TITLES } from './constants';
import Modal from './Modal';
import PlayerStatsModal from './PlayerStatsModal';
import { getTacticalRole, getRankBadge } from '../utils/tactical'
import { GET_API_BASE_URL } from '../utils/apiUtils';
import { PlayerCard } from './PlayerCard';

// ─── Player Marquee ────────────────────────────────────────────────────────────
// Duplicates the player list for a seamless infinite scroll loop.
const PlayerMarquee: React.FC<{ players: any[]; onPlayerClick: (p: any) => void }> = ({ players, onPlayerClick }) => {
  const trackRef = useRef<HTMLDivElement>(null);

  if (players.length === 0) return null;

  // Ensure at least 5 visible copies for a seamless loop regardless of player count.
  // With 1-2 players the duplicated set (2x) is too short; we pad to 5 repetitions.
  const minCopies = Math.ceil(5 / players.length);
  const copies = Math.max(minCopies, 2); // always at least 2 for the seamless -50% trick
  const items = Array.from({ length: copies }, () => players).flat();

  // Speed: ~8s per card, minimum 30s so it never looks janky with few players.
  // We divide by 2 so the visible half always appears to scroll at the same rate.
  const duration = Math.max(players.length * 8, 30);

  return (
    <div
      className="overflow-hidden relative w-full select-none group/marquee"
      style={{ '--marquee-duration': `${duration}s` } as React.CSSProperties}
    >
      <style>{`
                @keyframes nxc-marquee {
                    0%   { transform: translateX(0); }
                    100% { transform: translateX(-${100 / copies}%); }
                }
                .nxc-marquee-track {
                    display: flex;
                    width: max-content;
                    animation: nxc-marquee var(--marquee-duration, 30s) linear infinite;
                    will-change: transform;
                }
                .nxc-marquee-track:hover {
                    animation-play-state: paused;
                }
            `}</style>

      {/* Edge gradient fades */}
      <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-white dark:from-[#020617] to-transparent" />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-white dark:from-[#020617] to-transparent" />

      <div ref={trackRef} className="nxc-marquee-track gap-4 md:gap-6 px-4">
        {items.map((player, idx) => (
          <PlayerCard key={`${player.id}-${idx}`} player={player} onClick={() => onPlayerClick(player)} />
        ))}
      </div>
    </div>
  );
};


interface Player {
  id: number;
  name: string;
  role: string;
  kda: string;
  winRate: string;
  acs: string;
  image: string;
  userId?: number;
  level?: number;
  xp?: number;
}

interface Team {
  id: number;
  name: string;
  game: string;
  description: string;
  players: Player[];
}


// Animated Title Component
const AnimatedTitle = ({ text1, text2, className }: { text1: string, text2: string, className: string }) => {
  return (
    <h2 className={className}>
      <span className="text-white inline-block">
        {text1.split('').map((char, i) => (char === ' ' ? <span key={i}>&nbsp;</span> : <span key={i} className="animate-letter" style={{ animationDelay: `${i * 0.05}s` }}>{char}</span>))}
      </span>
      <span className="inline-block">&nbsp;</span>
      <span className="text-amber-500 inline-block">
        {text2.split('').map((char, i) => (char === ' ' ? <span key={i}>&nbsp;</span> : <span key={i} className="animate-letter" style={{ animationDelay: `${(text1.length + i) * 0.05}s` }}>{char}</span>))}
      </span>
    </h2>
  );
};




const Roster: React.FC<{ userRole?: string; userId?: number }> = ({ userRole, userId }) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameFilter, setGameFilter] = useState('All Games');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const fetchTeams = () => {
    setLoading(true);
    const API_BASE_URL = GET_API_BASE_URL();
    fetch(`${API_BASE_URL}/api/teams`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then(result => {
        if (result.success) {
          setTeams(result.data || []);
        } else {
          throw new Error(result.error || "Link failed");
        }
      })
      .catch(err => {
        console.error("Roster fetch failed:", err);
        setError("Failed to initialize roster data. Tactical link offline.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTeams();

    const handleRefresh = (e: any) => {
      console.log("[ROSTER] Real-time sync triggered");
      fetchTeams();
    };

    window.addEventListener('nxc-db-refresh', handleRefresh);
    return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
  }, []);

  const games = useMemo(() => ['All Games', ...GAME_TITLES], []);

  const filteredTeams = useMemo(() => {
    let result = teams;
    if (gameFilter !== 'All Games') {
      result = result.filter(t => t.game === gameFilter);
    }

    // Ensure coaches are always at the end of the roster and filter out management roles
    result = result.map(team => ({
      ...team,
      players: team.players
        .filter(p => {
          const role = p.role?.toLowerCase() || '';
          return !role.includes('manager') && !role.includes('admin') && !role.includes('ceo');
        })
        .sort((a, b) => {
          const aIsCoach = a.role?.toLowerCase().includes('coach');
          const bIsCoach = b.role?.toLowerCase().includes('coach');
          if (aIsCoach && !bIsCoach) return 1;
          if (!aIsCoach && bIsCoach) return -1;
          return 0;
        })
    }));

    if (searchQuery) {
      result = result.map(team => ({
        ...team,
        players: team.players.filter(p => (p.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()))
      })).filter(team => team.players.length > 0);
    }
    return result;
  }, [teams, gameFilter, searchQuery]);

  return (
    <div className="space-y-16 animate-in fade-in zoom-in duration-700 max-w-[1600px] mx-auto">
      {/* Modal */}
      {(() => {
        const roles = userRole?.split(',').map(r => r.trim().toLowerCase()) || [];
        const isManagement = roles.some(r => ['manager', 'coach', 'admin', 'ceo'].includes(r));
        const isSelf = selectedPlayer && userId === selectedPlayer.userId;
        const canSeeAdvanced = isManagement || isSelf;

        return (
          <PlayerStatsModal
            player={selectedPlayer}
            isOpen={!!selectedPlayer}
            onClose={() => setSelectedPlayer(null)}
            userRole={userRole}
            currentUserId={userId}
            showAdvancedIntel={canSeeAdvanced}
          />
        );
      })()}

      {/* Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-12 border-b border-gray-200 dark:border-white/5 pb-16 px-6 md:px-0">
        <div className="space-y-4 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start space-x-3">
            <span className="w-2 h-2 bg-amber-500 rounded-full shadow-[0_0_10px_#fbbf24] animate-pulse" />
            <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.4em]">Active Operatives // Tactical Roster</p>
          </div>
          <AnimatedTitle
            text1="Corporation"
            text2="Roster"
            className="text-4xl md:text-5xl lg:text-6xl font-black text-[var(--text-color)] tracking-tight italic uppercase"
          />
          <p className="text-slate-600 dark:text-slate-500 font-bold max-w-xl leading-relaxed text-xs md:text-sm uppercase tracking-wide mx-auto lg:mx-0">
            Elite competitors synchronized through our Command Deck. Real-time performance metrics pulled from scrimmage analytics.
          </p>
        </div>

        <div
          className="flex flex-col sm:flex-row gap-4 md:gap-6 p-6 md:p-8 glass rounded-[30px] md:rounded-[40px] mx-6 md:mx-0"
        >
          <div className="relative group w-full sm:w-80">
            <input
              type="text"
              placeholder="SEARCH OPERATIVE..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-12 py-4 text-[var(--text-color)] dark:text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-700 w-full uppercase text-[10px]"
            />
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-700 group-hover:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          <div className="relative group w-full sm:w-64">
            <select
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-2xl px-8 py-4 text-[var(--text-color)] dark:text-white font-black tracking-widest focus:outline-none focus:border-amber-500/50 transition-all appearance-none cursor-pointer w-full uppercase text-[10px]"
            >
              {games.map(g => <option key={g} value={g} className="bg-white dark:bg-[#020617]">{g.toUpperCase()}</option>)}
            </select>
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-700 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-500 flex flex-col items-center space-y-8 py-48 glass rounded-[60px]">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-amber-500/10 border-t-amber-500 rounded-full animate-spin" />
            <div className="absolute inset-0 w-20 h-20 border-4 border-purple-500/10 border-b-purple-500 rounded-full animate-spin-slow" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-amber-500 animate-pulse">Scanning Bio-Signatures...</p>
        </div>
      ) : error ? (
        <div className="text-center p-24 bg-red-500/5 rounded-[60px] border border-red-500/20 shadow-soft">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <p className="text-red-400 font-black text-xl mb-10 uppercase tracking-tighter italic">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-12 py-5 bg-red-500 hover:bg-red-400 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-2xl shadow-red-500/20 active:scale-95"
          >
            Re-Establish Link
          </button>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="relative group overflow-hidden rounded-[60px] border-2 border-dashed border-white/10 p-32 text-center bg-black/40 backdrop-blur-3xl shadow-soft">
          <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

          <div className="relative z-10 space-y-8">
            <div className="w-32 h-32 glass rounded-[40px] flex items-center justify-center mx-auto border border-slate-200 dark:border-white/10 group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 shadow-horizontal relative">
              <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <svg className="w-16 h-16 text-slate-400 dark:text-slate-600 group-hover:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>

            <div className="space-y-3">
              <h3 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter italic">No Tactical Operatives Deployed</h3>
              <p className="text-[10px] text-amber-600 dark:text-amber-500 font-black uppercase tracking-[0.4em]">Sector {gameFilter === 'All Games' ? 'Global' : gameFilter.toUpperCase()} // Status: Pending Assignment</p>
            </div>

            <div className="flex items-center justify-center space-x-4 opacity-50 group-hover:opacity-100 transition-opacity">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Scanning for active signal signatures...</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-h-[1200px] overflow-y-auto pr-6 space-y-24 scroll-smooth scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-white/5 hover:scrollbar-thumb-amber-500/20 transition-all roster-scroll-container">
          {filteredTeams.map((team) => (
            <div key={team.id} className="space-y-8 md:space-y-12 animate-in slide-in-from-bottom-8 duration-1000">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-l-4 md:border-l-8 border-amber-500 pl-6 md:pl-10 h-auto md:h-16 gap-6 md:gap-0">
                <div className="flex flex-col">
                  <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tighter text-[var(--text-color)] leading-none italic">{team.name}</h3>
                  <p className="text-[8px] md:text-[10px] text-amber-600 dark:text-amber-500/60 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] mt-2 italic">{team.description || "Active Combat Division"}</p>
                </div>
                <div className="flex items-center space-x-4 md:space-x-6">
                  <span className="text-[8px] md:text-[9px] text-slate-500 dark:text-slate-600 font-black uppercase tracking-[0.2em] md:tracking-[0.3em]">Division Code: {team.id}</span>
                  <span className="px-5 md:px-8 py-2 md:py-3 glass text-amber-600 dark:text-amber-500 rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] border border-slate-200 dark:border-white/10 shadow-xl">
                    {team.game}
                  </span>
                </div>
              </div>

              {/* Animated Marquee for Players */}
              <PlayerMarquee
                players={team.players}
                onPlayerClick={(p) => setSelectedPlayer({
                  ...p,
                  teamId: p.teamId || team.id,
                  team: team.name
                })}
              />

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Roster;
