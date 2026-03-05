import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';
import { useUser } from '../services/authService';
import { GET_API_BASE_URL } from '../utils/apiUtils';
import { getRankBadge } from '../utils/tactical';

interface ProfileProps {
    onBack: () => void;
    targetUserId?: number; // Optional: If provided, view this user's profile
    userRole?: string;
    backTitle?: string;
}

interface Achievement {
    id: string;
    title: string;
    description: string;
    iconType: 'trophy' | 'medal' | 'star' | 'crown';
    date: string;
}

const AVAILABLE_GAMES = [
    "League of Legends", "Valorant", "Dota 2", "CS2",
    "Overwatch 2", "Apex Legends", "Fortnite", "Call of Duty",
    "Rocket League", "Street Fighter 6"
];

const Profile: React.FC<ProfileProps> = ({ onBack, targetUserId, userRole, backTitle = 'Return to Citadel' }) => {
    const { user, loading: authLoading } = useUser();
    const { showNotification } = useNotification();
    const [error, setError] = useState<string | null>(null);
    const [profile, setProfile] = useState<any>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Check if the viewer has permission to edit
    const [canEdit, setCanEdit] = useState(false);

    // Form States
    const [fullname, setFullname] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [bio, setBio] = useState('');
    const [birthday, setBirthday] = useState('');
    const [games, setGames] = useState<string[]>([]);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [avatar, setAvatar] = useState<string | null>(null);

    // Achievement Form
    const [achTitle, setAchTitle] = useState('');
    const [achType, setAchType] = useState<'trophy' | 'medal' | 'star' | 'crown'>('trophy');

    useEffect(() => {
        if (targetUserId) {
            fetchProfile(targetUserId);
        } else if (!authLoading && user && user.email) {
            fetchProfile();
        } else if (!authLoading && !user) {
            console.warn("Profile: No user logged in");
            setError("You must be logged in to view your profile.");
        }
    }, [user, authLoading, targetUserId]);

    const fetchProfile = async (id?: number) => {
        setIsLoadingProfile(true);
        try {
            setError(null);
            const res = await fetch(`${GET_API_BASE_URL()}/api/users`);
            if (!res.ok) throw new Error('Failed to connect to server');

            // /api/users returns a plain array (no wrapper)
            const result = await res.json();
            const data: any[] = Array.isArray(result) ? result : (result.data || result);

            let me;
            if (id) {
                me = data.find((u: any) => u.id === id);
            } else {
                me = data.find((u: any) => u.email?.toLowerCase() === user?.email?.toLowerCase());
            }

            if (me) {
                setProfile(me);
                setFullname(me.fullname || '');
                setUsername(me.username || '');
                setEmail(me.email || '');
                setBio(me.bio || '');
                setBirthday(me.birthday || '');
                setAvatar(me.avatar || null);
                setGames(me.gamesPlayed ? JSON.parse(me.gamesPlayed) : []);

                const loadedAchievements = me.achievements ? JSON.parse(me.achievements) : [];
                const formattedAch = loadedAchievements.map((a: any) =>
                    typeof a === 'string'
                        ? { id: Math.random().toString(), title: a, description: 'Legacy achievement', iconType: 'trophy', date: new Date().toISOString() }
                        : a
                );
                setAchievements(formattedAch);

                // Permissions Check
                if (user && user.email?.toLowerCase() === me.email?.toLowerCase()) {
                    setCanEdit(true);
                } else if (user) {
                    const currentUserDb = data.find((u: any) => u.email?.toLowerCase() === user.email?.toLowerCase());
                    if (currentUserDb && (currentUserDb.role === 'admin' || currentUserDb.role === 'ceo')) {
                        setCanEdit(true);
                    } else {
                        setCanEdit(false);
                    }
                } else {
                    setCanEdit(false);
                }
            } else {
                if (id) {
                    setError("User profile not found.");
                } else {
                    setProfile({
                        fullname: user?.displayName,
                        email: user?.email,
                        avatar: user?.photoURL,
                        role: 'member'
                    });
                    setCanEdit(true);
                }
            }
        } catch (e) {
            console.error("Failed to fetch profile", e);
            setError('Failed to load profile. Is the backend server running?');
        } finally {
            setIsLoadingProfile(false);
        }
    };

    const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const aspect = width / height;

                    if (width > height) {
                        if (width > maxWidth) {
                            width = maxWidth;
                            height = width / aspect;
                        }
                    } else {
                        if (height > maxHeight) {
                            height = maxHeight;
                            width = height * aspect;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
            };
        });
    };

    const handleAvatarPreview = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const resized = await resizeImage(file, 800, 800);
                setAvatar(resized);
            } catch (err) {
                console.error("Failed to resize image:", err);
                const reader = new FileReader();
                reader.onloadend = () => setAvatar(reader.result as string);
                reader.readAsDataURL(file);
            }
        }
    };

    const handleSave = async () => {
        if (!profile?.id) {
            setError("Cannot save: User record not found in database.");
            return;
        }

        const payload = {
            fullname,
            username,
            email,
            bio,
            birthday,
            gamesPlayed: games,
            achievements,
            avatar,
            ign: profile.ign,
            requesterId: user?.id
        };

        setIsSaving(true);
        try {
            const response = await fetch(`${GET_API_BASE_URL()}/api/users/${profile.id}/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to update profile');
            }

            const updatedData = result.data;

            // Sync session
            const rawDevUser = localStorage.getItem('dev_user');
            if (rawDevUser && user) {
                const parsed = JSON.parse(rawDevUser);
                if (parsed.email?.toLowerCase() === profile.email?.toLowerCase()) {
                    const newSession = {
                        ...parsed,
                        displayName: updatedData.fullname || parsed.displayName,
                        photoURL: updatedData.avatar || parsed.photoURL,
                    };
                    localStorage.setItem('dev_user', JSON.stringify(newSession));
                    window.dispatchEvent(new Event('wc-auth-changed'));
                }
            }

            setProfile(updatedData);
            setIsEditing(false);
            await fetchProfile(profile.id);
            showNotification({
                message: "Profile updated successfully!",
                type: 'success'
            });
        } catch (e: any) {
            console.error("Save error:", e);
            showNotification({
                message: `Save failed: ${e.message}`,
                type: 'error'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const toggleGame = (game: string) => {
        if (games.includes(game)) {
            setGames(games.filter(g => g !== game));
        } else {
            setGames([...games, game]);
        }
    };

    const addAchievement = () => {
        if (achTitle.trim()) {
            const newAch: Achievement = {
                id: Date.now().toString(),
                title: achTitle,
                description: 'Awarded for excellence',
                iconType: achType,
                date: new Date().toLocaleDateString()
            };
            setAchievements([...achievements, newAch]);
            setAchTitle('');
        }
    };

    const removeAchievement = (id: string) => {
        setAchievements(achievements.filter(a => a.id !== id));
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'trophy': return <svg className="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" /><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>;
            case 'medal': return <span className="text-3xl">🥇</span>;
            case 'star': return <span className="text-3xl">⭐</span>;
            case 'crown': return <span className="text-3xl">👑</span>;
            default: return <span className="text-3xl">🏆</span>;
        }
    };

    if (authLoading || isLoadingProfile) return (
        <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
        </div>
    );

    if (error) {
        return (
            <div className="p-8 text-white bg-red-900/20 rounded-2xl border border-red-500/50">
                <h3 className="text-lg font-bold mb-2">Error</h3>
                <p className="text-red-300">{error}</p>
                <button onClick={() => fetchProfile()} className="mt-4 px-4 py-2 bg-red-600 rounded-lg text-sm font-bold">Retry</button>
            </div>
        );
    }

    if (!profile) return null;

    return (
        <div className="animate-in fade-in zoom-in duration-700 pb-32">
            <button
                onClick={onBack}
                className="mb-12 flex items-center space-x-3 text-slate-500 hover:text-amber-500 transition-all group px-4 py-2 bg-white/5 rounded-2xl border border-white/5 hover:border-amber-500/20 shadow-lg active:scale-95"
            >
                <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{backTitle}</span>
            </button>

            <div className="bg-[#020617]/40 backdrop-blur-3xl rounded-[48px] border border-white/5 shadow-2xl overflow-hidden relative group">
                {/* Profile Header / Cover */}
                <div className="relative h-80 bg-gradient-to-br from-purple-900/40 via-[#020617] to-amber-900/20 flex flex-col items-center justify-center text-center p-12 transition-all duration-1000">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none" />
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="relative group/avatar mb-8">
                            <div className="w-40 h-40 rounded-[40px] p-[3px] bg-gradient-to-tr from-purple-600 via-amber-500 to-amber-600 shadow-2xl shadow-amber-500/10">
                                <img
                                    src={avatar || profile.avatar || `https://ui-avatars.com/api/?name=${profile.fullname}`}
                                    alt={profile.fullname}
                                    className="w-full h-full rounded-[37px] border-4 border-slate-900 object-cover bg-black"
                                />
                                {isEditing && (
                                    <label className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-[40px] cursor-pointer opacity-0 group-hover/avatar:opacity-100 transition-opacity backdrop-blur-sm border-2 border-amber-500/50">
                                        <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarPreview} />
                                    </label>
                                )}
                            </div>
                            <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 rounded-2xl border-4 border-slate-900 shadow-xl flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                            </div>
                        </div>
                        <h1 className="text-5xl font-black text-white tracking-tighter mb-4 italic uppercase">{profile.fullname}</h1>
                        <div className="flex flex-col items-center space-y-6">
                            <div className="flex items-center space-x-8">
                                <div className="flex flex-col items-center px-8 py-3 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
                                    <span className="text-[8px] text-amber-500/60 font-black uppercase tracking-[0.4em] mb-1">Operative Rank</span>
                                    <span className="text-2xl font-black text-amber-400 italic tracking-tighter uppercase">
                                        {getRankBadge(profile.level, profile.role)}
                                    </span>
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-amber-500 font-black uppercase text-[10px] tracking-[0.5em] mb-1 px-4 py-1.5 bg-amber-500/10 rounded-full border border-amber-500/20">{profile.role}</span>
                                    <span className="text-slate-500 font-black text-[9px] uppercase tracking-[0.3em] ml-4">ID://{profile.id || 'WC-PRO'}</span>
                                </div>
                            </div>

                            {/* XP Progress Bar */}
                            <div className="w-80 space-y-2">
                                <div className="flex justify-between items-end px-2">
                                    <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.3em]">Synapse Progress</span>
                                    <span className="text-[10px] text-amber-500 font-black tracking-tighter">{(profile.xp || 0) % 100} / 100 XP</span>
                                </div>
                                <div className="h-2 w-full bg-white/5 rounded-full border border-white/10 overflow-hidden p-[1px]">
                                    <div
                                        className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-500 rounded-full shadow-[0_0_15px_#fbbf24] transition-all duration-1000"
                                        style={{ width: `${(profile.xp || 0) % 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {!isEditing && canEdit && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="absolute top-8 right-8 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black text-amber-500 uppercase tracking-widest border border-white/10 transition-all backdrop-blur-xl shadow-2xl active:scale-95"
                        >
                            Update Profile
                        </button>
                    )}
                </div>

                <div className="p-12 space-y-20 relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
                        <section className="space-y-10">
                            <div className="flex items-center space-x-4 border-l-4 border-amber-500 pl-6 h-8">
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Personnel Authentication</h3>
                            </div>
                            <div className="space-y-8 glass p-8 rounded-[32px] shadow-inner">
                                {isEditing ? (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Legal Identity</label>
                                            <input type="text" value={fullname} onChange={(e) => setFullname(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Waks Codename</label>
                                            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all font-mono" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Combat Handle (IGN)</label>
                                            <input type="text" value={profile.ign || ''} onChange={(e) => setProfile({ ...profile, ign: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all italic" placeholder="OPERATIVE-X" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-2">Secure Signal (Email)</label>
                                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 transition-all" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                        <div><p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">Combat Handle</p><p className="text-amber-500 font-black text-xl italic tracking-tighter uppercase">{profile.ign || 'UNASSIGNED'}</p></div>
                                        <div><p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">Legal Identity</p><p className="text-white font-black text-lg tracking-tight uppercase">{profile.fullname || '—'}</p></div>
                                        <div><p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">Waks Codename</p><p className="text-slate-400 font-black text-sm font-mono italic">@{(profile.username || '').toUpperCase()}</p></div>
                                        <div><p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">Secure Signal</p><p className="text-white font-black text-sm">{(profile.email || '').toUpperCase()}</p></div>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="space-y-10">
                            <div className="flex items-center space-x-4 border-l-4 border-purple-500 pl-6 h-8">
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Tactical Briefing</h3>
                            </div>
                            <div className="bg-black/40 p-10 rounded-[40px] border border-white/5 shadow-inner min-h-[300px] flex flex-col justify-center relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 transition-opacity">
                                    <svg className="w-20 h-20 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                </div>
                                {isEditing ? (
                                    <textarea value={bio} onChange={(e) => setBio(e.target.value)} className="w-full bg-transparent border-none p-0 text-white font-bold leading-relaxed focus:outline-none resize-none min-h-[220px]" placeholder="DESCRIBE MISSION PARAMETERS..." />
                                ) : (
                                    <p className="text-slate-400 font-black text-lg leading-relaxed italic uppercase tracking-tighter relative z-10">
                                        " {bio || "NO DATA ENCODED IN BIOMETRIC LOG."} "
                                    </p>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                        <section className="space-y-8">
                            <div className="flex items-center space-x-4 border-l-4 border-cyan-500 pl-6 h-8">
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter h-full">Temporal Epoch</h3>
                            </div>
                            <div className="glass p-8 rounded-[32px] shadow-inner">
                                {isEditing ? (
                                    <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-black tracking-[0.2em] focus:outline-none focus:border-cyan-500/50 transition-all [color-scheme:dark]" />
                                ) : (
                                    <div className="flex items-center space-x-6">
                                        <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 text-cyan-400">
                                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-1">Standard Cycle Date</p>
                                            <p className="text-white font-black text-2xl tracking-tighter uppercase">
                                                {birthday ? new Date(birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : "UNDEFINED"}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    <section className="space-y-12">
                        <div className="flex items-center space-x-4 border-l-4 border-purple-500 pl-6 h-8">
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Tactical Specializations</h3>
                        </div>
                        {isEditing ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 bg-black/40 p-10 rounded-[48px] border border-white/5 shadow-2xl">
                                {AVAILABLE_GAMES.map(game => (
                                    <button
                                        key={game}
                                        onClick={() => toggleGame(game)}
                                        className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${games.includes(game) ? 'bg-purple-600 text-white border-white/20 shadow-xl shadow-purple-500/20 scale-105' : 'bg-white/5 text-slate-500 border-white/5 hover:border-purple-500/40'}`}
                                    >
                                        {game}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-8">
                                {games.length > 0 ? games.map((game, idx) => (
                                    <div key={idx} className="px-8 py-5 bg-gradient-to-br from-white/5 to-transparent rounded-[32px] border border-white/5 shadow-xl flex items-center space-x-6 group hover:border-purple-500/30 transition-all">
                                        <div className="w-1.5 h-10 bg-purple-500 rounded-full shadow-[0_0_15px_#a855f7] group-hover:h-12 transition-all" />
                                        <span className="text-white font-black text-lg tracking-tight uppercase italic">{game}</span>
                                    </div>
                                )) : <div className="text-slate-600 font-black uppercase tracking-[0.3em] italic p-12 bg-white/5 border border-dashed border-white/10 rounded-[40px] w-full text-center">No Specialized Training Logged.</div>}
                            </div>
                        )}
                    </section>

                    <section className="space-y-12">
                        <div className="flex items-center space-x-4 border-l-4 border-amber-500 pl-6 h-8">
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Combat Commendations</h3>
                        </div>
                        {isEditing && (
                            <div className="bg-black/40 p-10 rounded-[48px] border border-white/5 mb-12 flex flex-col md:flex-row gap-8 items-end shadow-2xl">
                                <div className="flex-1 w-full space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-2">Award Designation</label>
                                    <input type="text" value={achTitle} onChange={(e) => setAchTitle(e.target.value)} className="w-full bg-[#020617]/60 border border-white/10 rounded-2xl px-6 py-4 text-white font-black tracking-tight focus:outline-none focus:border-amber-500/50 placeholder:text-slate-700" placeholder="E.G. CITADEL MVP" />
                                </div>
                                <div className="w-full md:w-64 space-y-3">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-2">Token Type</label>
                                    <select value={achType} onChange={(e: any) => setAchType(e.target.value)} className="w-full bg-[#020617]/60 border border-white/10 rounded-2xl px-6 py-4 text-white font-black tracking-tight focus:outline-none appearance-none cursor-pointer">
                                        <option value="trophy">🏆 SUPREME TROPHY</option>
                                        <option value="medal">🥇 ELITE MEDAL</option>
                                        <option value="star">⭐ TACTICAL STAR</option>
                                        <option value="crown">👑 ROYAL CROWN</option>
                                    </select>
                                </div>
                                <button onClick={addAchievement} className="w-full md:w-auto px-10 py-5 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-[0.3em] text-[10px] rounded-2xl transition-all shadow-xl shadow-amber-500/20 active:scale-95 border-t border-white/20">Authorize Badge</button>
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {achievements.map((ach) => (
                                <div key={ach.id} className="relative group p-[2px] bg-gradient-to-b from-white/10 to-transparent rounded-[40px] shadow-2xl transition-all hover:from-amber-500/30">
                                    <div className="relative bg-[#020617] h-full rounded-[38px] p-10 flex flex-col items-center text-center space-y-6 border border-white/5 group-hover:border-amber-500/20 transition-all overflow-hidden">
                                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/5 blur-[40px] rounded-full group-hover:bg-amber-500/10 transition-all" />
                                        <div className="w-24 h-24 bg-white/5 rounded-[32px] flex items-center justify-center border border-white/5 text-5xl shadow-inner group-hover:scale-110 transition-transform duration-700">
                                            {getIcon(ach.iconType)}
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-white font-black text-xl tracking-tighter uppercase italic">{ach.title}</h4>
                                            <p className="text-amber-500/60 text-[10px] font-black uppercase tracking-[0.3em]">{ach.date}</p>
                                        </div>
                                        {isEditing && (
                                            <button
                                                onClick={() => removeAchievement(ach.id)}
                                                className="absolute top-4 right-4 text-slate-600 hover:text-red-500 p-2 transition-colors"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {achievements.length === 0 && !isEditing && (
                                <div className="col-span-full py-20 bg-white/5 border border-dashed border-white/10 rounded-[48px] text-center">
                                    <p className="text-slate-600 font-black uppercase tracking-[0.4em] italic">Commendation Vault Empty.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="p-12 border-t border-white/5 flex justify-end gap-6 bg-white/[0.01]">
                    {isEditing ? (
                        <>
                            <button onClick={() => setIsEditing(false)} className="px-8 py-3 text-slate-500 hover:text-white font-black uppercase tracking-[0.3em] text-[10px] transition-all active:scale-95">De-Authorize Changes</button>
                            <button onClick={handleSave} disabled={isSaving} className="px-12 py-5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black uppercase tracking-[0.4em] text-[10px] rounded-2xl transition-all shadow-2xl shadow-amber-500/20 active:scale-95 border-t border-white/20">
                                {isSaving ? "ENCODING DATA..." : "COMMIT TO WAKS CORPORATION"}
                            </button>
                        </>
                    ) : (
                        canEdit && <button onClick={() => setIsEditing(true)} className="px-10 py-4 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] border border-white/10 transition-all shadow-xl active:scale-95">Re-Synchronize Profile</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Profile;
