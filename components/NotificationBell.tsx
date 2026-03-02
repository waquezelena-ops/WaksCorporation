
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '../services/authService';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface Notification {
    id: number;
    userId: number;
    title: string;
    message: string;
    type: 'scrim' | 'tournament';
    isRead: boolean;
    createdAt: string;
}

const NotificationBell: React.FC = () => {
    const { user } = useUser();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    // Note: API_BASE_URL is resolved inside each fetch call (not at mount) so Capacitor
    // env changes and late-initialization are always picked up correctly.

    const fetchNotifications = useCallback(async () => {
        if (!user?.id) return;
        const API_BASE_URL = GET_API_BASE_URL();
        setLoading(true);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/notifications?userId=${user.id}&requesterId=${user.id}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            if (result.success) {
                setNotifications(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);


    // Initial fetch
    useEffect(() => {
        if (user?.id) fetchNotifications();
    }, [user?.id, fetchNotifications]);

    // Real-time refresh on DB events (e.g. when a scrim/tournament result is posted)
    useEffect(() => {
        const handleRefresh = () => {
            if (user?.id) fetchNotifications();
        };
        window.addEventListener('nxc-db-refresh', handleRefresh);
        return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
    }, [fetchNotifications, user?.id]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const markAsRead = async (id: number) => {
        if (!user?.id) return;
        const API_BASE_URL = GET_API_BASE_URL();
        try {
            const resp = await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterId: user.id })
            });
            if (resp.ok) {
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
            }
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const markAllAsRead = async () => {
        if (!user?.id) return;
        const API_BASE_URL = GET_API_BASE_URL();
        const unread = notifications.filter(n => !n.isRead);
        // Fire all mark-as-read calls in parallel, inspect results for failures
        const results = await Promise.allSettled(
            unread.map(n =>
                fetch(`${API_BASE_URL}/api/notifications/${n.id}/read`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requesterId: user.id })
                })
            )
        );
        // Only mark as read in state if the request actually succeeded
        const succeededIds = new Set(
            unread
                .filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<Response>).value.ok)
                .map(n => n.id)
        );
        setNotifications(prev => prev.map(n => succeededIds.has(n.id) ? { ...n, isRead: true } : n));
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => {
                    setShowDropdown(prev => !prev);
                    if (!showDropdown) fetchNotifications();
                }}
                className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-slate-500 hover:text-amber-500 transition-all border border-black/5 dark:border-white/5 relative active:scale-95"
            >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 text-[8px] items-center justify-center font-black text-slate-900">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    </span>
                )}
            </button>

            {showDropdown && (
                <div
                    className="absolute top-full right-0 mt-4 w-80 backdrop-blur-3xl border rounded-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 z-50"
                    style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
                >
                    <div className="p-5 border-b border-white/5 bg-gradient-to-br from-white/5 to-transparent flex justify-between items-center gap-2">
                        <h3 className="text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] shrink-0">Directives & Alerts</h3>
                        <div className="flex items-center gap-3">
                            {loading && <div className="animate-spin h-3 w-3 border-2 border-amber-500 border-t-transparent rounded-full" />}
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-[7px] font-black uppercase tracking-widest text-slate-500 hover:text-amber-500 transition-colors whitespace-nowrap"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-[350px] overflow-y-auto scrollbar-hide py-2">
                        {notifications.length === 0 ? (
                            <div className="px-6 py-10 text-center">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-40">No incoming transmissions</p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => !notification.isRead && markAsRead(notification.id)}
                                    className={`px-5 py-4 hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0 relative group ${notification.isRead ? 'opacity-50' : ''}`}
                                >
                                    {!notification.isRead && (
                                        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-8 bg-amber-500 rounded-full" />
                                    )}
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${notification.type === 'tournament' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-500'}`}>
                                            {notification.type}
                                        </span>
                                        <span className="text-[7px] text-slate-500 font-bold uppercase">{new Date(notification.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <h4 className="text-[11px] font-black text-[var(--text-color)] leading-tight mb-1 group-hover:text-amber-400 transition-colors uppercase tracking-tighter">
                                        {notification.title}
                                    </h4>
                                    <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                                        {notification.message}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-3 bg-white/5 text-center">
                        <button
                            className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-amber-500 transition-colors"
                            onClick={() => setShowDropdown(false)}
                        >
                            Dismiss Interface
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
