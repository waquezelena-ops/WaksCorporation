
import React, { useState } from 'react';
import { useUser, logout } from '../services/authService';
import { useTheme } from '../hooks/useTheme';
import NotificationBell from './NotificationBell';

interface HeaderProps {
  onLoginClick: () => void;
  onProfileClick: () => void;
  onSettingsClick: () => void;
  onNavigate: (view: 'home' | 'roster' | 'achievements' | 'events' | 'sponsors' | 'admin' | 'manager' | 'sponsor-zone') => void;
  currentView: string;
  userRole?: string;
  sponsorTier?: string;
}

const Header: React.FC<HeaderProps> = ({ onLoginClick, onProfileClick, onSettingsClick, onNavigate, currentView, userRole, sponsorTier }) => {
  const { user, loading } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [showMenu, setShowMenu] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navClass = (view: string) => `transition-all duration-300 cursor-pointer relative py-2 ${currentView === view ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-200 font-bold'}`;

  const handleSubNavigate = (view: any, id: string) => {
    // If we are already in the view, we might want to refresh the content
    if (currentView === view) {
      // Force a re-fetch or reset by temporarily switching and switching back or signaling
      // For now, onNavigate(view) is called.
    }
    onNavigate(view);
    setIsMobileMenuOpen(false);
    setShowCommandMenu(false);
    // Use a short delay to ensure the component is mounted if we switch views
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showCommandMenu) {
        setShowCommandMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCommandMenu]);

  const getSponsorLevel = (tier?: string) => {
    switch (tier) {
      case 'Bronze': return '200,000';
      case 'Silver': return '400,000';
      case 'Gold': return '600,000';
      case 'Platinum': return '1,000,000';
      default: return null;
    }
  };

  const isSponsor = userRole?.includes('sponsor');
  const sponsorDisplayLevel = isSponsor ? getSponsorLevel(sponsorTier) : null;
  const displayLevel = sponsorDisplayLevel || user?.level;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 md:pt-6 px-4 md:px-6">
      <div
        className="max-w-[1500px] w-full glass rounded-[30px] md:rounded-[40px] px-6 md:px-12 py-3 md:py-5 flex items-center justify-between border-t-white/10 relative group"
      >
        <div className="absolute inset-0 overflow-hidden rounded-[30px] md:rounded-[40px] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-900/10 via-amber-500/5 to-purple-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
        </div>

        <div className="flex items-center space-x-3 cursor-pointer relative z-10" onClick={() => onNavigate('home')}>
          <img
            src="/logo.png"
            alt="Waks Logo"
            className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl object-cover shadow-[0_4px_20px_rgba(251,191,36,0.3)] hover:scale-110 transition-transform"
          />
          <div className="flex-col leading-[0.9] flex">
            <span className="font-black text-lg md:text-xl tracking-tighter text-[var(--text-color)]">
              {"Waks".split('').map((char, i) => (
                <span key={i} className="animate-letter inline-block" style={{ animationDelay: `${i * 0.1}s` }}>{char}</span>
              ))}
            </span>
            <span className="text-[7px] md:text-[9px] text-amber-500 font-black uppercase tracking-[0.4em]">
              {"Corporation".split('').map((char, i) => (
                <span key={i} className="animate-letter inline-block" style={{ animationDelay: `${0.5 + i * 0.1}s` }}>{char}</span>
              ))}
            </span>
          </div>
        </div>

        {/* Desktop Nav Items */}
        <div className="hidden lg:flex items-center gap-x-8 xl:gap-x-12 text-[10px] font-black uppercase tracking-[0.25em] relative z-10">
          <a onClick={() => onNavigate('home')} className={navClass('home')}>Home</a>
          <a onClick={() => onNavigate('roster')} className={navClass('roster')}>Roster</a>
          <a onClick={() => onNavigate('achievements')} className={navClass('achievements')}>Achievements</a>
          <a onClick={() => onNavigate('events')} className={navClass('events')}>Events</a>
          <a onClick={() => onNavigate('sponsors')} className={navClass('sponsors')}>Sponsors</a>

          {user && (userRole?.split(',').some(r => ['admin', 'ceo'].includes(r))) && (
            <div className="relative">
              <a
                onClick={(e) => { e.stopPropagation(); setShowCommandMenu(!showCommandMenu); }}
                className={`${navClass('admin')} text-amber-500 flex items-center select-none`}
              >
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-2.5 shadow-[0_0_12px_#fbbf24]" />
                Command
                <svg className={`w-3 h-3 ml-2 opacity-50 transition-transform ${showCommandMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
              </a>

              {/* Dropdown menu */}
              <div className={`absolute top-full left-1/2 -translate-x-1/2 pt-4 transition-all duration-300 transform z-50 ${showCommandMenu ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible translate-y-2'}`} onClick={(e) => e.stopPropagation()}>
                <div className="w-56 glass rounded-[28px] p-2 shadow-[0_30px_60px_rgba(0,0,0,0.8)] flex flex-col gap-1 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-purple-500/5 pointer-events-none" />
                  {[
                    { label: 'Personnel Authorization', id: 'personnel', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
                    { label: 'Squad Intelligence Registry', id: 'squads', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
                    { label: 'Manager Ops Overview', id: 'managers', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                    { label: 'Protocol Schedule', id: 'schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                    { label: 'Partner Network', id: 'partners', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                    { label: 'Tactical Analysis', id: 'tactical', icon: 'M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
                    { label: 'Intelligence Hub', id: 'intel', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                    { label: 'Partner Store Logistics', id: 'sponsor-zone', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSubNavigate('admin', item.id)}
                      className="w-full flex items-center px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-400 hover:bg-white/5 rounded-2xl transition-all group/item"
                    >
                      <svg className="w-3.5 h-3.5 mr-3 text-slate-600 group-hover/item:text-amber-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={item.icon} />
                      </svg>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {user && (userRole?.split(',').some(r => ['manager', 'admin', 'ceo', 'coach'].includes(r))) && (
            <a onClick={() => onNavigate('manager')} className={`${navClass('manager')} text-purple-400 flex items-center`}>
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2.5 shadow-[0_0_12px_#a855f7]" />
              {userRole?.toLowerCase() === 'coach' ? 'Coach Corner' : 'Manager'}
            </a>
          )}
          {user && (userRole?.split(',').some(r => ['player'].includes(r))) && (
            <a onClick={() => (onNavigate as any)('operations')} className={`${navClass('operations')} text-emerald-400 flex items-center`}>
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2.5 shadow-[0_0_12px_#10b981]" />
              Team View
            </a>
          )}
          {user && (userRole?.split(',').includes('sponsor') && !userRole?.split(',').some(r => ['admin', 'ceo'].includes(r))) && (
            <a onClick={() => onNavigate('sponsor-zone')} className={`${navClass('sponsor-zone')} text-indigo-400 flex items-center`}>
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-2.5 shadow-[0_0_12px_#6366f1]" />
              Sponsor Portal
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-6 relative z-10">
          <button
            onClick={toggleTheme}
            className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-amber-600 dark:text-amber-400/70 hover:text-amber-500 dark:hover:text-amber-400 transition-all border border-black/5 dark:border-white/5"
            title="Toggle Theme"
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            ) : (
              <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
            )}
          </button>

          <NotificationBell />

          {!loading && user ? (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center space-x-2 md:space-x-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 hover:border-amber-500/30 rounded-2xl md:rounded-3xl p-1 md:p-1.5 pr-2 md:pr-4 transition-all border border-black/10 dark:border-white/10 active:scale-95 group/profile"
              >
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-2xl bg-gradient-to-tr from-purple-600 to-amber-500 p-[2px] shadow-lg group-hover/profile:scale-105 transition-transform">
                  <img
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=fbbf24&color=000`}
                    alt="Profile"
                    className="w-full h-full rounded-lg md:rounded-[14px] border-2 border-slate-900 object-cover"
                  />
                </div>
                <div className="flex flex-col items-start leading-none hidden sm:flex">
                  <span className="text-[10px] md:text-xs font-black text-[var(--text-color)] tracking-tight mb-0.5">{user.displayName}</span>
                  <span className="text-[7px] md:text-[8px] text-amber-600 dark:text-amber-500 font-black uppercase tracking-[0.1em] opacity-80">{userRole || user.role}</span>
                </div>
                <svg className={`w-3 h-3 md:w-3.5 md:h-3.5 text-slate-500 transition-transform duration-300 ${showMenu ? 'rotate-180 text-amber-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </button>

              {showMenu && (
                <div
                  className="absolute top-full right-0 mt-4 w-64 glass rounded-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300"
                >
                  <div className="p-6 border-b border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                    <p className="text-[10px] text-amber-500/60 font-black uppercase tracking-[0.3em] mb-2">Personnel Clearances</p>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-lg font-black text-[var(--text-color)] leading-tight">{user.displayName}</p>
                        <p className="text-[11px] text-slate-400 font-bold mt-1 opacity-60">ID://{user.id || 'WC-PRO'}</p>
                      </div>
                      {displayLevel && (
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] text-amber-500 font-black uppercase tracking-[0.2em] mb-1">Rank</span>
                          <span className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-black text-amber-500">LVL {displayLevel}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-3">
                    <button
                      onClick={() => { onProfileClick(); setShowMenu(false); }}
                      className="w-full flex items-center space-x-4 px-4 py-3 text-sm font-bold text-slate-500 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl transition-all group"
                    >
                      <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:bg-amber-500/10 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <span>Command Profile</span>
                    </button>
                    <button
                      onClick={() => { onSettingsClick(); setShowMenu(false); }}
                      className="w-full flex items-center space-x-4 px-4 py-3 text-sm font-bold text-slate-500 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl transition-all group"
                    >
                      <div className="p-2 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 group-hover:bg-amber-500/10 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </div>
                      <span>System Settings</span>
                    </button>
                    <div className="h-px bg-black/5 dark:bg-white/5 my-2 mx-4" />
                    <button
                      onClick={async () => { await logout(); setShowMenu(false); }}
                      className="w-full flex items-center space-x-4 px-4 py-3 text-sm font-black text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-500/10 rounded-2xl transition-all group"
                    >
                      <div className="p-2 rounded-xl bg-red-500/10 text-red-500 group-hover:scale-110 transition-transform">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      </div>
                      <span className="uppercase tracking-[0.1em]">Logout / Terminate Deck</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="px-4 md:px-8 py-2 md:py-3.5 text-[9px] md:text-xs font-black uppercase tracking-[0.2em] rounded-xl md:rounded-2xl bg-gradient-to-r from-purple-600 to-amber-500 text-white hover:from-purple-500 hover:to-amber-400 transition-all shadow-[0_10px_30px_rgba(251,191,36,0.2)] active:scale-95 border border-white/20"
            >
              Access
            </button>
          )}

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl bg-black/5 dark:bg-white/5 text-amber-500 border border-amber-500/20"
          >
            {isMobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 top-[80px] md:top-[100px] z-40 p-4 animate-in fade-in slide-in-from-top-10 duration-500">
            <div
              className="w-full glass rounded-[32px] p-6 shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-y-auto max-h-[calc(100vh-120px)]"
            >
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Home', view: 'home' },
                  { label: 'Roster', view: 'roster' },
                  { label: 'Achievements', view: 'achievements' },
                  { label: 'Events', view: 'events' },
                  { label: 'Sponsors', view: 'sponsors' }
                ].map((item) => (
                  <button
                    key={item.view}
                    onClick={() => { onNavigate(item.view as any); setIsMobileMenuOpen(false); }}
                    className={`w-full text-left px-6 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all ${currentView === item.view ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-slate-400 hover:bg-white/5'}`}
                  >
                    {item.label}
                  </button>
                ))}

                {(user && userRole?.split(',').some(r => ['admin', 'ceo', 'manager', 'coach'].includes(r))) && (
                  <div className="h-px bg-white/5 my-4 mx-2" />
                )}

                {user && (userRole?.split(',').some(r => ['admin', 'ceo'].includes(r))) && (
                  <button
                    onClick={() => { onNavigate('admin'); setIsMobileMenuOpen(false); }}
                    className={`w-full text-left px-6 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all flex items-center ${currentView === 'admin' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-amber-500/60 hover:bg-amber-500/5'}`}
                  >
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full mr-3 shadow-[0_0_8px_#fbbf24]" />
                    Command Operations
                  </button>
                )}

                {user && (userRole?.split(',').some(r => ['manager', 'admin', 'ceo', 'coach'].includes(r))) && (
                  <button
                    onClick={() => { onNavigate('manager'); setIsMobileMenuOpen(false); }}
                    className={`w-full text-left px-6 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all flex items-center ${currentView === 'manager' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-purple-400/60 hover:bg-purple-500/5'}`}
                  >
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-3 shadow-[0_0_8px_#a855f7]" />
                    {userRole?.toLowerCase() === 'coach' ? 'Coach Corner' : 'Tactical Management'}
                  </button>
                )}

                {user && (userRole?.split(',').some(r => ['player'].includes(r))) && (
                  <button
                    onClick={() => { (onNavigate as any)('operations'); setIsMobileMenuOpen(false); }}
                    className={`w-full text-left px-6 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all flex items-center ${currentView === 'operations' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-emerald-400/60 hover:bg-emerald-500/5'}`}
                  >
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-3 shadow-[0_0_8px_#10b981]" />
                    Team View
                  </button>
                )}

                {user && (userRole?.split(',').some(r => ['sponsor', 'admin', 'ceo'].includes(r))) && (
                  <button
                    onClick={() => { onNavigate('sponsor-zone'); setIsMobileMenuOpen(false); }}
                    className={`w-full text-left px-6 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all flex items-center ${currentView === 'sponsor-zone' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-indigo-400/60 hover:bg-indigo-500/5'}`}
                  >
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mr-3 shadow-[0_0_8px_#6366f1]" />
                    Sponsor Portal
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav >
  );
};

export default Header;
