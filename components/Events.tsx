import React, { useEffect, useState, useMemo } from 'react';
import { GAME_TITLES } from './constants';
import Modal from './Modal';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface Event {
    id: number;
    title: string;
    game?: string;
    date: string;
    location: string;
    description: string;
    status: string;
    image: string;
}

const Events: React.FC = () => {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

    const fetchEvents = () => {
        setLoading(true);
        fetch(`${GET_API_BASE_URL()}/api/events`)
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    setEvents(result.data || []);
                }
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchEvents();

        const handleRefresh = () => {
            console.log("[EVENTS] Real-time sync triggered");
            fetchEvents();
        };

        window.addEventListener('nxc-db-refresh', handleRefresh);
        return () => window.removeEventListener('nxc-db-refresh', handleRefresh);
    }, []);

    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

    // Filter events based on active tab
    const filteredEvents = useMemo(() => {
        return events.filter(event => {
            const matchesTab = activeTab === 'upcoming'
                ? (event.status === 'upcoming' || event.status === 'on-going')
                : (event.status === 'completed');

            return matchesTab;
        }).sort((a, b) => {
            return activeTab === 'upcoming'
                ? new Date(a.date).getTime() - new Date(b.date).getTime()
                : new Date(b.date).getTime() - new Date(a.date).getTime();
        });
    }, [events, activeTab]);

    return (
        <div className="space-y-16 animate-in fade-in duration-700 pb-20">
            {/* Elite Header - Deployment Controls */}
            <div className="bg-[#020617]/40 backdrop-blur-3xl rounded-[30px] md:rounded-[40px] p-6 md:p-10 border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full pointer-events-none" />

                <div className="flex flex-col lg:flex-row items-center justify-between gap-8 md:gap-12 relative z-10 text-center lg:text-left">
                    <div>
                        <h2 className="text-3xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-none">Deployment Schedule</h2>
                        <div className="flex flex-col md:flex-row items-center md:space-x-4 mt-4 md:mt-2 space-y-2 md:space-y-0">
                            <p className="text-[8px] md:text-[10px] text-amber-500 font-black uppercase tracking-[0.3em] md:tracking-[0.4em]">Active Operations & Protocol</p>
                            <div className="hidden md:block h-[1px] w-12 bg-white/10" />
                            <p className="text-[8px] md:text-[10px] text-slate-500 font-black uppercase tracking-widest">{filteredEvents.length} Active Signals</p>
                        </div>
                    </div>

                    <div className="flex gap-2 p-1.5 bg-black/20 rounded-[22px] border border-white/5 w-full md:w-auto overflow-x-auto justify-center">
                        <button
                            onClick={() => setActiveTab('upcoming')}
                            className={`px-8 py-3 font-black text-[9px] uppercase tracking-[0.2em] rounded-2xl transition-all duration-500 ${activeTab === 'upcoming' ? 'bg-purple-600 text-white shadow-[0_10px_20px_rgba(147,51,234,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>
                            Upcoming
                        </button>
                        <button
                            onClick={() => setActiveTab('past')}
                            className={`px-8 py-3 font-black text-[9px] uppercase tracking-[0.2em] rounded-2xl transition-all duration-500 ${activeTab === 'past' ? 'bg-amber-600 text-white shadow-[0_10px_20px_rgba(217,119,6,0.3)]' : 'text-slate-500 hover:text-slate-300'}`}>
                            Records
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center p-20 space-y-4 opacity-50">
                    <div className="w-12 h-12 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.4em]">Syncing Calendar Stream...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Scrollable Container with Max Height approx 6 items */}
                    <div className={`grid grid-cols-1 gap-6 ${filteredEvents.length > 6 ? 'max-h-[1000px] overflow-y-auto pr-4 custom-scrollbar' : ''}`}>
                        {filteredEvents.length > 0 ? filteredEvents.map((event) => (
                            <div
                                key={event.id}
                                onClick={() => setSelectedEvent(event)}
                                className="flex flex-col md:flex-row bg-[#020617]/40 backdrop-blur-2xl border border-white/5 rounded-[40px] overflow-hidden shadow-2xl hover:border-amber-500/30 transition-all duration-500 group cursor-pointer hover:-translate-y-1 relative shrink-0"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                                <div className="md:w-56 bg-black/20 flex flex-row md:flex-col items-center justify-center p-6 md:p-10 border-b md:border-b-0 md:border-r border-white/5 group-hover:bg-amber-500/5 transition-colors gap-4 md:gap-0">
                                    <div className="flex flex-col items-center">
                                        <span className="text-3xl md:text-5xl font-black text-white italic tracking-tighter group-hover:scale-110 transition-transform duration-500">{new Date(event.date).getDate().toString().padStart(2, '0')}</span>
                                        <span className="text-[8px] md:text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mt-1 md:mt-2">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span>
                                    </div>
                                    <div className="hidden md:block mt-6 w-8 h-px bg-white/10" />
                                    <span className="text-[8px] md:text-[10px] text-slate-600 font-black md:mt-4 tracking-widest">{new Date(event.date).getFullYear()}</span>
                                    {/* Time Display */}
                                    <span className="text-[8px] md:text-[10px] text-purple-400 font-black md:mt-2 tracking-widest bg-purple-500/10 px-2 py-1 rounded-md border border-purple-500/20">
                                        {new Date(event.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                <div className="flex-1 p-6 md:p-10 flex flex-col justify-center relative z-10">
                                    <div className="flex items-center space-x-4 mb-4">
                                        <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] border shadow-lg ${event.status === 'upcoming' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' : event.status === 'on-going' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                                            {event.status === 'on-going' ? 'LIVE NOW' : event.status}
                                        </div>
                                        {event.location && (
                                            <div className="flex items-center space-x-2 text-slate-600">
                                                <div className="w-1 h-1 rounded-full bg-slate-800" />
                                                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest italic">{event.location}</span>
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="text-xl md:text-3xl font-black text-white italic uppercase tracking-tighter group-hover:text-amber-500 transition-colors mb-4">{event.title}</h3>
                                    <p className="text-slate-400 text-xs md:text-sm line-clamp-2 md:line-clamp-none font-medium leading-relaxed max-w-2xl">{event.description}</p>
                                </div>

                                <div className="p-6 md:p-10 flex items-center justify-center border-t md:border-t-0 md:border-l border-white/5 bg-black/10">
                                    <button className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-[24px] bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-amber-500 group-hover:border-amber-400 group-hover:text-black text-amber-500 transition-all duration-500 shadow-xl group-hover:shadow-amber-500/20 active:scale-90">
                                        <svg className="w-5 h-5 md:w-6 md:h-6 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                    </button>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-20 bg-[#020617]/40 rounded-[40px] border border-white/5">
                                <p className="text-slate-500 font-medium italic">No {activeTab} operations found.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Event Detail Modal */}
            <Modal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} zIndex={200} backdropClassName="bg-black/95 backdrop-blur-xl animate-in fade-in duration-500" className="w-full max-w-3xl">
                {selectedEvent && <div className="bg-[#020617] w-full rounded-[50px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 animate-in zoom-in-95 duration-500 relative group/modal">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/[0.03] blur-[100px] rounded-full pointer-events-none" />

                    <div className="relative h-64 bg-black flex items-center justify-center overflow-hidden border-b border-white/5">
                        {selectedEvent.image ? (
                            <img src={selectedEvent.image} className="w-full h-full object-cover opacity-60 scale-110 group-hover/modal:scale-100 transition-transform duration-1000 grayscale group-hover/modal:grayscale-0" alt={selectedEvent.title} />
                        ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-black to-purple-900/40 opacity-80" />
                        )}

                        <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 bg-gradient-to-t from-[#020617] via-[#020617]/80 to-transparent">
                            <div className="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-4 mb-4">
                                <div className={`w-fit px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] border shadow-lg ${selectedEvent.status === 'upcoming' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse' : selectedEvent.status === 'on-going' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}`}>
                                    {selectedEvent.status === 'on-going' ? 'LIVE NOW' : selectedEvent.status}
                                </div>
                                <span className="text-[8px] md:text-[10px] text-amber-500/60 font-black uppercase tracking-[0.4em] md:tracking-[0.5em]">Intel Retrieval Complete</span>
                            </div>
                            <h2 className="text-3xl md:text-5xl font-black text-white italic tracking-tighter uppercase leading-none">{selectedEvent.title}</h2>
                        </div>

                        <button
                            onClick={() => setSelectedEvent(null)}
                            className="absolute top-6 right-6 md:top-8 md:right-8 w-10 h-10 md:w-14 md:h-14 bg-white/5 hover:bg-amber-500 hover:text-black text-white rounded-xl md:rounded-[20px] flex items-center justify-center transition-all border border-white/10 backdrop-blur-md active:scale-95 shadow-2xl"
                        >
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div className="p-6 md:p-12 space-y-8 md:space-y-12">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="flex items-center space-x-6 p-6 glass rounded-[30px] border border-white/5">
                                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-xl">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-1">Deployment Date</div>
                                    <div className="font-black text-white italic tracking-tight">{new Date(selectedEvent.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-6 p-6 glass rounded-[30px] border border-white/5">
                                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20 shadow-xl">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase font-black text-slate-500 tracking-widest mb-1">Strategic Theater</div>
                                    <div className="font-black text-white italic tracking-tight uppercase">{selectedEvent.location || 'GLOBAL PROTOCOL'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.4em] ml-2">Mission Briefing</h3>
                            <div className="p-8 glass rounded-[30px] border border-white/5">
                                <p className="text-slate-400 leading-relaxed font-medium whitespace-pre-line text-lg">
                                    {selectedEvent.description}
                                </p>
                            </div>
                        </div>

                        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row gap-4">
                            <button
                                onClick={() => setSelectedEvent(null)}
                                className="px-10 py-5 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-[0.4em] rounded-2xl transition-all border border-white/10"
                            >
                                De-Authorize Detail Readout
                            </button>
                            {selectedEvent.status === 'upcoming' && (
                                <button className="flex-1 py-5 bg-gradient-to-r from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-black font-black text-[10px] uppercase tracking-[0.5em] rounded-2xl transition-all shadow-2xl shadow-amber-500/20 active:scale-[0.98] border-t border-white/20">
                                    Authorize Tactical Entry
                                </button>
                            )}
                        </div>
                    </div>
                </div>}
            </Modal>
        </div>
    );
};

export default Events;

