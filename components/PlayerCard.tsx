import React from 'react';
import { getTacticalRole, getRankBadge } from '../utils/tactical';

export const PlayerCard: React.FC<{ player: any; onClick: () => void }> = ({ player, onClick }) => (
    <div
        onClick={onClick}
        className="nxc-player-card flex-shrink-0 w-[260px] md:w-[300px] group relative rounded-[30px] md:rounded-[40px] overflow-hidden glass shadow-soft transition-all duration-700 hover:border-amber-500/40 hover:shadow-amber-500/10 snap-center cursor-pointer"
    >
        <div className="aspect-[4/5] overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-1000 relative">
            <img src={player.image} alt={player.name} className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-1000" />
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-white via-white/80 dark:from-[#020617] dark:via-[#020617]/80 to-transparent opacity-95 group-hover:opacity-70 transition-opacity duration-700" />

            {/* Rank Badge */}
            <div className="absolute top-6 left-6">
                <span className="px-4 py-1.5 bg-white/60 dark:bg-black/60 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-lg text-[8px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-[0.3em]">
                    {getRankBadge(player.level, player.role)}
                </span>
            </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 space-y-4 md:space-y-6">
            <div className="space-y-1 transform translate-y-6 group-hover:translate-y-0 transition-transform duration-500">
                <div className="flex items-center space-x-2">
                    <div className="w-2 h-[2px] bg-amber-500 shadow-[0_0_10px_#fbbf24]" />
                    <p className="text-[8px] md:text-[9px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-[0.3em] md:tracking-[0.4em] leading-none">Tactical Role // {getTacticalRole(player.role)}</p>
                </div>
                <h3 className="text-2xl md:text-4xl font-black italic text-white tracking-tighter group-hover:text-amber-500 transition-colors uppercase leading-none">{player.name}</h3>
            </div>

            {!!player.teamId && (
                <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-200 dark:border-white/5 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                    {[
                        {
                            label: 'K/D',
                            value: player.kda || '0.00',
                            barClass: 'bg-amber-500',
                            width: `${Math.min(Math.max((parseFloat(String(player.kda || '0')) / 4) * 100, 0), 100)}%`
                        },
                        {
                            label: 'ACS',
                            value: player.acs || '0',
                            barClass: 'bg-purple-500',
                            width: `${Math.min(Math.max((parseInt(String(player.acs || '0'), 10) / 400) * 100, 0), 100)}%`
                        },
                        {
                            label: 'Win%',
                            value: player.winRate || '0%',
                            barClass: 'bg-emerald-500',
                            // Robustly parse winRate: handles "72%", "72", null, undefined
                            width: `${Math.min(Math.max(parseFloat(String(player.winRate || '0')), 0), 100)}%`
                        },
                    ].map(stat => (
                        <div key={stat.label} className="text-center space-y-1">
                            <p className="text-[8px] text-slate-500 dark:text-slate-600 font-black uppercase tracking-[0.3em]">{stat.label}</p>
                            <p className={`text-sm font-black italic tracking-tighter ${stat.barClass === 'bg-emerald-500' ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text-color)]'}`}>{stat.value}</p>
                            <div className="h-0.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full ${stat.barClass} transition-all duration-1000`} style={{ width: stat.width }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}


        </div>

        <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-black flex items-center justify-center shadow-2xl rotate-45 group-hover:rotate-0 transition-all duration-1000 scale-75 group-hover:scale-100 shadow-amber-500/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>
        </div>
    </div>
);
