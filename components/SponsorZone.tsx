import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useUser } from '../services/authService';
import { useNotification } from '../hooks/useNotification';
import { GET_API_BASE_URL } from '../utils/apiUtils';

interface Product {
    id: number;
    name: string;
    description: string;
    price: number;
    stock: number;
    sponsorId: number | null;
    imageUrl: string;
    status: string;
}

interface Order {
    id: number;
    userId: number;
    productId: number;
    recipientName: string;
    deliveryAddress: string;
    contactNumber: string;
    paymentMethod: string;
    paymentProofUrl: string;
    status: string;
    createdAt: string;
}

const SponsorZone: React.FC = () => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'settings'>('products');

    const [formProduct, setFormProduct] = useState({ name: '', description: '', price: 0, stock: 0, imageUrl: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sponsors, setSponsors] = useState<any[]>([]);
    const [selectedSponsorId, setSelectedSponsorId] = useState<number | 'waks'>('waks'); // 'waks' = Waks Corporation Internal

    // Advanced Filters
    const [orderSearch, setOrderSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [selectedWeekFilter, setSelectedWeekFilter] = useState('All');
    const [siteQr, setSiteQr] = useState({ waksQrEWallet: '', waksQrBank: '' });
    const [sponsorQr, setSponsorQr] = useState({ qrEWallet: '', qrBank: '' });
    const [selectedProofOrder, setSelectedProofOrder] = useState<Order | null>(null);

    const isAdmin = user?.role === 'admin' || user?.role === 'ceo';

    useEffect(() => {
        if (!user) return;
        fetchDashboardData();
        if (isAdmin || user.role?.includes('sponsor')) {
            fetchSponsors();
        }
    }, [user, isAdmin]);

    const fetchSponsors = async () => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/sponsors`);
            const data = await res.json();
            if (data.success) {
                setSponsors(data.data);
                if (user?.role?.includes('sponsor')) {
                    const me = data.data.find((s: any) => s.userId === user.id);
                    if (me) {
                        setSponsorQr({ qrEWallet: me.qrEWallet || '', qrBank: me.qrBank || '' });
                    }
                }
            }

            // Also fetch site settings for admins
            if (isAdmin) {
                const sRes = await fetch(`${GET_API_BASE_URL()}/api/site-settings`);
                const sData = await sRes.json();
                if (sData.success) {
                    setSiteQr({
                        waksQrEWallet: sData.data.waksQrEWallet || '',
                        waksQrBank: sData.data.waksQrBank || ''
                    });
                }
            }
        } catch (error) {
            console.error("Failed to fetch sponsors", error);
        }
    };
    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const [prodRes, orderRes] = await Promise.all([
                fetch(`${GET_API_BASE_URL()}/api/products`),
                fetch(`${GET_API_BASE_URL()}/api/orders`)
            ]);

            const [prodData, orderData] = await Promise.all([
                prodRes.json(),
                orderRes.json()
            ]);

            if (prodData.success) {
                // Initial load: don't filter here if admin; we'll filter on render based on selectedSponsorId
                let availableProducts = prodData.data;
                if (!isAdmin) {
                    // For sponsors or others, we need to filter.
                    // If we're a sponsor, we need to find our own sponsorId first.
                    // But wait, the 'sponsors' state might not be loaded yet.
                    // We'll filter in the render/computed property instead for better consistency,
                    // but for the initial 'products' state, we can just store all and let displayProducts handle it.
                }
                setProducts(availableProducts);
            }

            if (orderData.success) {
                // Store all orders in state; let useMemo handle filtering by userSponsorId safely
                setOrders(orderData.data);
            }
        } catch (error) {
            console.error("Dashboard data fetch failed", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        if (isNaN(formProduct.price) || formProduct.price < 0) {
            showNotification({ message: 'Please enter a valid asset value.', type: 'error' });
            setIsSubmitting(false);
            return;
        }

        try {
            let finalSponsorId: number | null = null;
            if (user?.role?.includes('sponsor')) {
                const linkedSponsor = sponsors.find(s => s.userId === user.id);
                finalSponsorId = linkedSponsor ? linkedSponsor.id : null;
            } else {
                finalSponsorId = selectedSponsorId === 'waks' ? null : Number(selectedSponsorId);
            }

            const res = await fetch(`${GET_API_BASE_URL()}/api/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formProduct,
                    price: Math.round(formProduct.price * 100), // convert to cents
                    sponsorId: finalSponsorId,
                    requesterId: user?.id
                })
            });
            const data = await res.json();
            if (data.success) {
                setProducts([data.data, ...products]);
                setFormProduct({ name: '', description: '', price: 0, stock: 0, imageUrl: '' });
                showNotification({ message: 'Asset successfully added to Supply Depot.', type: 'success' });
            } else {
                showNotification({ message: data.error || 'Failed to add asset.', type: 'error' });
            }
        } catch (err) {
            console.error(err);
            showNotification({ message: 'Network error while adding asset.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const updateOrderStatus = async (orderId: number, status: string) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/orders/${orderId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, requesterId: user?.id })
            });
            const data = await res.json();
            if (data.success) {
                setOrders(orders.map(o => o.id === orderId ? { ...o, status } : o));
                showNotification({ message: `Order status updated to ${status}.`, type: 'success' });
            } else {
                showNotification({ message: data.error || 'Failed to update order status.', type: 'error' });
                // If it failed because of stock, or other business reasons, show alert
                if (data.error && data.error.includes("Asset Unavailable")) {
                    showNotification({ message: "ORDER AUTH FAILED: Product is out of stock.", type: 'error' });
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpdateQR = async () => {
        setIsSubmitting(true);
        try {
            if (user?.role?.includes('sponsor') && userSponsorId) {
                const res = await fetch(`${GET_API_BASE_URL()}/api/sponsors/${userSponsorId}/qr`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...sponsorQr, requesterId: user?.id })
                });
                if ((await res.json()).success) {
                    showNotification({ message: 'Sponsor QR Codes updated.', type: 'success' });
                }
            } else if (isAdmin && selectedSponsorId === 'waks') {
                const res = await fetch(`${GET_API_BASE_URL()}/api/site-settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        waksQrEWallet: siteQr.waksQrEWallet,
                        waksQrBank: siteQr.waksQrBank,
                        requesterId: user?.id
                    })
                });
                if ((await res.json()).success) {
                    showNotification({ message: 'Waks Corp QR Codes updated.', type: 'success' });
                }
            } else if (isAdmin && typeof selectedSponsorId === 'number') {
                // Admin updating a sponsor's QR
                const res = await fetch(`${GET_API_BASE_URL()}/api/sponsors/${selectedSponsorId}/qr`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        qrEWallet: sponsorQr.qrEWallet,
                        qrBank: sponsorQr.qrBank,
                        requesterId: user?.id
                    })
                });
                if ((await res.json()).success) {
                    showNotification({ message: 'Partner QR Codes updated by Admin.', type: 'success' });
                }
            }
        } catch (err) {
            console.error(err);
            showNotification({ message: 'Failed to update QR codes.', type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleQRFileChange = (type: 'ewallet' | 'bank', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (user?.role?.includes('sponsor') || (isAdmin && typeof selectedSponsorId === 'number')) {
                    setSponsorQr(prev => ({ ...prev, [type === 'ewallet' ? 'qrEWallet' : 'qrBank']: result }));
                } else if (isAdmin && selectedSponsorId === 'waks') {
                    setSiteQr(prev => ({ ...prev, [type === 'ewallet' ? 'waksQrEWallet' : 'waksQrBank']: result }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const updateProductStock = async (productId: number, stock: number) => {
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/products/${productId}/stock`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stock, requesterId: user?.id })
            });
            const data = await res.json();
            if (data.success) {
                setProducts(products.map(p => p.id === productId ? { ...p, stock } : p));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const deleteProduct = async (productId: number) => {
        if (!confirm("Are you sure you want to decommission this asset? This action is irreversible.")) return;
        try {
            const res = await fetch(`${GET_API_BASE_URL()}/api/products/${productId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requesterId: user?.id })
            });
            const data = await res.json();
            if (data.success) {
                setProducts(products.filter(p => p.id !== productId));
                showNotification({ message: 'Asset decommissioned from inventory.', type: 'success' });
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Unified Sponsor Recognition
    const userSponsor = sponsors.find(s => s.userId === user?.id);
    const userSponsorId = userSponsor ? userSponsor.id : null;

    // ── DATA PROCESSING: ANALYTICS ──────────────────────────────────────────
    const analyticsData = useMemo(() => {
        const relevantOrders = isAdmin
            ? orders.filter(o => {
                const p = products.find(prod => prod.id === o.productId);
                const prodSponsorId = p?.sponsorId || null;
                return selectedSponsorId === 'waks' ? prodSponsorId === null : prodSponsorId === selectedSponsorId;
            })
            : orders.filter(o => {
                const p = products.find(prod => prod.id === o.productId);
                return p?.sponsorId === userSponsorId;
            });

        // Group by day for the last 7 days
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d.toISOString().split('T')[0];
        });

        return days.map(date => {
            const entries = relevantOrders.filter(o => o.createdAt.startsWith(date));
            const revenue = entries.reduce((acc, o) => {
                const p = products.find(prod => prod.id === o.productId);
                return acc + (p ? p.price : 0);
            }, 0);
            return {
                name: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
                sales: entries.length,
                revenue: revenue / 100
            };
        });
    }, [orders, products, isAdmin, userSponsorId, selectedSponsorId]);

    const filteredOrders = useMemo(() => {
        let base = isAdmin ? orders.filter(o => {
            const prod = products.find(p => p.id === o.productId);
            const prodSponsorId = prod?.sponsorId || null;
            return selectedSponsorId === 'waks' ? prodSponsorId === null : prodSponsorId === selectedSponsorId;
        }) : orders.filter(o => {
            const prod = products.find(p => p.id === o.productId);
            return (prod?.sponsorId || null) === userSponsorId;
        });

        // Apply advanced filters
        if (selectedWeekFilter !== 'All') {
            const filterObj = JSON.parse(selectedWeekFilter);
            base = base.filter(o => {
                const t = new Date(o.createdAt).getTime();
                return t >= filterObj.start && t <= filterObj.end;
            });
        }

        if (statusFilter !== 'All') {
            base = base.filter(o => o.status === statusFilter);
        }

        if (orderSearch) {
            const q = orderSearch.toLowerCase();
            base = base.filter(o =>
                o.recipientName.toLowerCase().includes(q) ||
                o.id.toString().includes(q)
            );
        }

        return base;
    }, [orders, products, isAdmin, selectedSponsorId, userSponsorId, selectedWeekFilter, statusFilter, orderSearch]);

    const availableWeeks = useMemo(() => {
        const weeks = new Set<string>();

        // Find visible orders based on the current sponsor view only
        const baseFilteredForSponsor = isAdmin ? orders.filter(o => {
            const prod = products.find(p => p.id === o.productId);
            const prodSponsorId = prod?.sponsorId || null;
            return selectedSponsorId === 'waks' ? prodSponsorId === null : prodSponsorId === selectedSponsorId;
        }) : orders.filter(o => {
            const prod = products.find(p => p.id === o.productId);
            return (prod?.sponsorId || null) === userSponsorId;
        });

        baseFilteredForSponsor.forEach(o => {
            const d = new Date(o.createdAt);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const start = new Date(d);
            start.setDate(diff);
            start.setHours(0, 0, 0, 0);

            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            end.setHours(23, 59, 59, 999);

            const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
            weeks.add(JSON.stringify({
                label: `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}`,
                start: start.getTime(),
                end: end.getTime()
            }));
        });

        // Sort descending by start time
        return Array.from(weeks)
            .map(w => JSON.parse(w))
            .sort((a, b) => b.start - a.start);
    }, [orders, products, isAdmin, selectedSponsorId, userSponsorId]);

    const archiveOrders = useMemo(() => {
        return filteredOrders.filter(o => o.status === 'Completed' || o.status === 'Refunded');
    }, [filteredOrders]);

    const activeOrders = useMemo(() => {
        return filteredOrders.filter(o => o.status !== 'Completed' && o.status !== 'Refunded');
    }, [filteredOrders]);

    if (loading) {
        return (
            <div className="flex justify-center py-20">
                <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    // ── DATA PROCESSING: FILTERING ──────────────────────────────────────────
    const displayProducts = isAdmin
        ? products.filter(p => selectedSponsorId === 'waks' ? p.sponsorId === null : p.sponsorId === (selectedSponsorId as number))
        : products.filter(p => p.sponsorId === userSponsorId);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Header */}
            <div className="bg-[#0f172a] rounded-[32px] p-8 border border-white/5 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                <div className="flex flex-col md:flex-row md:items-center justify-between relative z-10 space-y-4 md:space-y-0">
                    <div>
                        <div className="flex items-center space-x-3 mb-2">
                            <span className="w-2 h-2 bg-purple-500 animate-pulse rounded-full shadow-[0_0_10px_#a855f7]" />
                            <span className="text-purple-500 text-[10px] uppercase font-black tracking-[0.4em]">Partner Network</span>
                        </div>
                        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">Sponsor Zone</h2>
                    </div>
                    <div className="flex flex-col md:flex-row p-1 gap-2 self-start md:self-auto items-center">
                        {isAdmin && (
                            <select
                                value={selectedSponsorId}
                                onChange={(e) => setSelectedSponsorId(e.target.value === 'waks' ? 'waks' : Number(e.target.value))}
                                className="px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black uppercase text-purple-400 focus:outline-none focus:border-purple-500 appearance-none cursor-pointer hover:bg-black/60 transition-all shadow-inner"
                            >
                                <option value="waks" className="bg-[#0f172a] text-purple-400">Waks Corporation (Internal)</option>
                                {sponsors.map(s => (
                                    <option key={s.id} value={s.id} className="bg-[#0f172a] text-slate-300">
                                        Partner: {s.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <div className="flex bg-black/40 rounded-2xl border border-white/5 backdrop-blur-md">
                            <button
                                onClick={() => setActiveTab('products')}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'products' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                Logistics
                            </button>
                            <button
                                onClick={() => setActiveTab('orders')}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'orders' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                Fulfillment
                            </button>
                            <button
                                onClick={() => setActiveTab('settings')}
                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'settings' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                            >
                                Brand Settings
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Analytics Dashboard */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-[#0f172a] rounded-3xl p-6 border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:bg-purple-500/20 transition-all" />
                    <h3 className="text-purple-400 font-black uppercase tracking-widest text-[10px] mb-6 flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        Supply Revenue (Last 7 Days)
                    </h3>
                    <div className="h-[200px] w-full" style={{ minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <AreaChart data={analyticsData}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px' }}
                                    itemStyle={{ color: '#a855f7', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-[#0f172a] rounded-3xl p-6 border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[60px] rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/20 transition-all" />
                    <h3 className="text-blue-400 font-black uppercase tracking-widest text-[10px] mb-6 flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        Asset Requests (Last 7 Days)
                    </h3>
                    <div className="h-[200px] w-full" style={{ minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={analyticsData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px' }}
                                    itemStyle={{ color: '#3b82f6', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Content */}
            {activeTab === 'products' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Product Creation Form */}
                    <div className="lg:col-span-1 border border-purple-500/20 bg-[#0f172a]/50 p-6 rounded-3xl h-fit">
                        <h3 className="text-purple-400 font-black uppercase tracking-widest text-xs mb-6 flex items-center">
                            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            Register New Asset
                        </h3>
                        <form onSubmit={handleCreateProduct} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Designation (Name)</label>
                                <input required type="text" value={formProduct.name} onChange={(e) => setFormProduct({ ...formProduct, name: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-purple-500 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Specs (Description)</label>
                                <textarea required value={formProduct.description} onChange={(e) => setFormProduct({ ...formProduct, description: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-purple-500 focus:outline-none h-24 resize-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Value (₱)</label>
                                    <input required type="number" step="0.01" min="0" value={formProduct.price || ''} onChange={(e) => setFormProduct({ ...formProduct, price: parseFloat(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-purple-500 focus:outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Initial Stock</label>
                                    <input required type="number" min="0" value={formProduct.stock || ''} onChange={(e) => setFormProduct({ ...formProduct, stock: parseInt(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-purple-500 focus:outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Visual Asset (URL or File)</label>
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={formProduct.imageUrl}
                                        onChange={(e) => setFormProduct({ ...formProduct, imageUrl: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-bold focus:border-purple-500 focus:outline-none"
                                        placeholder="HTTPS://..."
                                    />
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setFormProduct({ ...formProduct, imageUrl: reader.result as string });
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                            className="hidden"
                                            id="product-file-upload"
                                        />
                                        <label
                                            htmlFor="product-file-upload"
                                            className="flex-1 cursor-pointer bg-white/5 border border-dashed border-white/10 rounded-xl py-3 px-4 text-[10px] font-black uppercase text-slate-400 hover:bg-white/10 hover:border-purple-500/50 transition-all text-center"
                                        >
                                            {formProduct.imageUrl.startsWith('data:') ? '✓ LOCAL FILE SELECTED' : 'OR SHIP LOCAL FILE'}
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <button disabled={isSubmitting} type="submit" className="w-full mt-4 py-4 bg-purple-500 hover:bg-purple-400 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50">
                                {isSubmitting ? 'Uploading...' : 'Submit Asset Data'}
                            </button>
                        </form>
                    </div>

                    {/* Product List */}
                    <div className="lg:col-span-2 space-y-4 max-h-[850px] overflow-y-auto custom-scrollbar pr-2 pb-2">
                        {displayProducts.length === 0 ? (
                            <div className="bg-[#0f172a]/50 border border-white/5 rounded-3xl p-12 text-center">
                                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No registered assets found.</p>
                            </div>
                        ) : (
                            displayProducts.map(product => (
                                <div key={product.id} className="bg-[#0f172a] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row gap-6 relative group overflow-hidden hover:border-purple-500/30 transition-colors">
                                    <div className="w-full sm:w-32 h-32 rounded-xl border border-white/10 overflow-hidden shrink-0 bg-black">
                                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="flex-1 flex flex-col justify-between py-1">
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center space-x-3">
                                                    <h4 className="text-white font-black italic uppercase tracking-wider text-lg">{product.name}</h4>
                                                    <button
                                                        onClick={() => deleteProduct(product.id)}
                                                        className="p-1.5 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                        title="Decommission Asset"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                                <span className="text-purple-400 font-black tracking-widest text-xs">₱{(product.price / 100).toFixed(2)}</span>
                                            </div>
                                            <p className="text-slate-400 text-xs line-clamp-2">{product.description}</p>
                                        </div>
                                        <div className="flex items-center justify-between mt-4">
                                            <div className="flex items-center space-x-3 bg-black/40 p-1 px-3 rounded-lg border border-white/5">
                                                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Stock:</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={product.stock}
                                                    onChange={(e) => updateProductStock(product.id, parseInt(e.target.value) || 0)}
                                                    className="w-16 bg-transparent text-white font-bold text-sm focus:outline-none"
                                                />
                                            </div>
                                            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest hidden sm:block">
                                                ID: {product.id}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : activeTab === 'orders' ? (
                <div className="bg-[#0f172a] rounded-[32px] border border-white/5 p-8 shadow-xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                        <h3 className="text-purple-400 font-black uppercase tracking-widest text-xs">Active Operations (Orders)</h3>

                        <div className="flex flex-wrap gap-4 items-center">
                            {/* Search */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="SEARCH RECIPIENT..."
                                    value={orderSearch}
                                    onChange={(e) => setOrderSearch(e.target.value)}
                                    className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 pl-10 text-[10px] font-black uppercase focus:border-purple-500 focus:outline-none w-48"
                                />
                                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>

                            {/* Status Filter */}
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                            >
                                <option value="All">ALL STATUS</option>
                                <option value="For Payment Verification">VERIFICATION</option>
                                <option value="Pending">PENDING</option>
                                <option value="For Shipping">SHIPPING</option>
                                <option value="Completed">COMPLETED</option>
                                <option value="Refunded">REFUNDED</option>
                            </select>

                            {/* Weekly Dropdown */}
                            <select
                                value={selectedWeekFilter}
                                onChange={(e) => setSelectedWeekFilter(e.target.value)}
                                className={`bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase appearance-none cursor-pointer focus:outline-none focus:border-purple-500 transition-all ${selectedWeekFilter !== 'All' ? 'text-purple-400 border-purple-500/50' : 'text-slate-500'}`}
                            >
                                <option value="All">ALL TIMEFRAMES</option>
                                {availableWeeks.map((w, i) => (
                                    <option key={i} value={JSON.stringify(w)}>
                                        WEEK: {w.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-12">
                        {/* Active Operations */}
                        <div>
                            <div className="flex items-center space-x-3 mb-6">
                                <span className="w-2 h-2 bg-amber-500 animate-pulse rounded-full" />
                                <h4 className="text-white font-black uppercase tracking-widest text-[10px]">Active Fulfillment Requests</h4>
                            </div>
                            <div className="overflow-y-auto max-h-[400px] custom-scrollbar pr-2">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <th className="px-4 py-4 min-w-[100px]">Order ID</th>
                                            <th className="px-4 py-4 min-w-[150px]">Recipient</th>
                                            <th className="px-4 py-4 min-w-[150px]">Product / Spec</th>
                                            <th className="px-4 py-4 min-w-[80px]">Qty</th>
                                            <th className="px-4 py-4 min-w-[120px]">Payment Proof</th>
                                            <th className="px-4 py-4 min-w-[160px]">Status Control</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 text-sm">
                                        {activeOrders.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-12 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No active orders in this sector.</td>
                                            </tr>
                                        ) : (
                                            activeOrders.map(order => (
                                                <tr key={order.id} className="hover:bg-amber-500/5 transition-colors">
                                                    <td className="px-4 py-4 font-mono text-xs text-slate-400">#{order.id.toString().padStart(4, '0')}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="font-bold text-white text-xs">{order.recipientName}</div>
                                                        <div className="text-[10px] text-slate-500 mt-1">{order.contactNumber}</div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="text-xs text-slate-300">Prod ID: {order.productId}</div>
                                                        <div className="truncate text-[10px] text-slate-500 max-w-[200px]" title={order.deliveryAddress}>{order.deliveryAddress}</div>
                                                    </td>
                                                    <td className="px-4 py-4 font-black text-amber-500 text-xs">
                                                        x{(order as any).quantity || 1}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <button
                                                            onClick={() => setSelectedProofOrder(order)}
                                                            className="bg-purple-500/10 text-purple-400 py-1 px-3 rounded-md text-[10px] font-black tracking-widest uppercase border border-purple-500/20 hover:bg-purple-500/20 transition-all"
                                                        >
                                                            View Intel
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <select
                                                            value={order.status}
                                                            onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                                                            className={`text-[10px] font-black uppercase tracking-widest py-2 px-4 rounded-xl border appearance-none cursor-pointer focus:outline-none ${order.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                order.status === 'For Shipping' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                                                    order.status === 'Pending' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                                        'bg-slate-800 text-slate-400 border-white/10'
                                                                }`}
                                                        >
                                                            <option className="bg-slate-900 text-slate-400" value="For Payment Verification">Verification</option>
                                                            <option className="bg-slate-900 text-blue-400" value="Pending">Pending</option>
                                                            <option className="bg-slate-900 text-amber-400" value="For Shipping">For Shipping</option>
                                                            <option className="bg-slate-900 text-emerald-400" value="Completed">Completed</option>
                                                            <option className="bg-slate-900 text-red-400" value="Refunded">Refunded</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Archived Operations */}
                        {archiveOrders.length > 0 && (
                            <div className="pt-8 border-t border-white/5">
                                <div className="flex items-center space-x-3 mb-6 opacity-60">
                                    <span className="w-2 h-2 bg-slate-500 rounded-full" />
                                    <h4 className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Fulfillment History (Archive)</h4>
                                </div>
                                <div className="overflow-y-auto max-h-[400px] custom-scrollbar pr-2">
                                    <table className="w-full text-left border-collapse opacity-70">
                                        <thead>
                                            <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-600">
                                                <th className="px-4 py-4">ID</th>
                                                <th className="px-4 py-4">Recipient</th>
                                                <th className="px-4 py-4">Status</th>
                                                <th className="px-4 py-4 text-right">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5 text-xs">
                                            {archiveOrders.map(order => (
                                                <tr key={order.id} className="hover:bg-amber-500/5">
                                                    <td className="px-4 py-4 font-mono text-slate-500">#{order.id}</td>
                                                    <td className="px-4 py-4">
                                                        <div className="text-slate-300 font-bold">{order.recipientName}</div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border ${order.status === 'Completed' ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5' : 'text-red-500 border-red-500/20 bg-red-500/5'}`}>
                                                            {order.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 text-right text-slate-600 font-mono">
                                                        {new Date(order.createdAt).toLocaleDateString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="bg-[#0f172a] rounded-[32px] border border-white/5 p-8 shadow-xl animate-in fade-in zoom-in-95 duration-300">
                    <div className="mb-8">
                        <h3 className="text-purple-400 font-black uppercase tracking-widest text-xs mb-2">QR Settlement Settings</h3>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Upload your tactical payment coordinates for customers.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* E-Wallet QR */}
                        <div className="bg-black/20 p-6 rounded-3xl border border-white/5 flex flex-col items-center">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 w-full text-center italic">E-Wallet / GCash Endpoint</label>
                            <div className="w-48 h-48 bg-black/40 rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden mb-6 group relative">
                                {(user?.role === 'sponsor' ? sponsorQr.qrEWallet : siteQr.waksQrEWallet) ? (
                                    <img src={user?.role === 'sponsor' ? sponsorQr.qrEWallet : siteQr.waksQrEWallet} alt="E-Wallet QR" className="w-full h-full object-contain" />
                                ) : (
                                    <svg className="w-12 h-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4v1m6 11h2m-6 0h-2m-4 0H5m3-4a3 3 0 116 0h.01m-6.01 0H7m10 0h-1M7 8a4 4 0 018 0v0M7 8H6a5 5 0 00-5 5v1h11m12-1v-1a5 5 0 00-5-5h-1M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>
                                )}
                                <input type="file" accept="image/*" className="hidden" id="qr-ewallet-upload" onChange={(e) => handleQRFileChange('ewallet', e)} />
                                <label htmlFor="qr-ewallet-upload" className="absolute inset-0 bg-purple-500/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                    <span className="text-white text-[10px] font-black uppercase tracking-tighter">Replace Asset</span>
                                </label>
                            </div>
                        </div>

                        {/* Bank QR */}
                        <div className="bg-black/20 p-6 rounded-3xl border border-white/5 flex flex-col items-center">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 w-full text-center italic">Bank Transfer Endpoint</label>
                            <div className="w-48 h-48 bg-black/40 rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden mb-6 group relative">
                                {(user?.role === 'sponsor' ? sponsorQr.qrBank : siteQr.waksQrBank) ? (
                                    <img src={user?.role === 'sponsor' ? sponsorQr.qrBank : siteQr.waksQrBank} alt="Bank QR" className="w-full h-full object-contain" />
                                ) : (
                                    <svg className="w-12 h-12 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 10h18M7 15h1m4 0h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                )}
                                <input type="file" accept="image/*" className="hidden" id="qr-bank-upload" onChange={(e) => handleQRFileChange('bank', e)} />
                                <label htmlFor="qr-bank-upload" className="absolute inset-0 bg-purple-500/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                    <span className="text-white text-[10px] font-black uppercase tracking-tighter">Replace Asset</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleUpdateQR}
                        disabled={isSubmitting}
                        className="w-full mt-12 py-4 bg-purple-500 hover:bg-purple-400 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50"
                    >
                        {isSubmitting ? 'Syncing...' : 'Authorize QR Sync'}
                    </button>
                </div>
            )}

            {/* Proof Modal */}
            {
                selectedProofOrder && (
                    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-[#0f172a] border border-amber-500/30 rounded-[32px] max-w-2xl w-full overflow-hidden shadow-2xl">
                            <div className="p-8 border-b border-white/5 flex justify-between items-center">
                                <div>
                                    <h3 className="text-white font-black uppercase italic tracking-tighter text-xl">Tactical Payment Verification</h3>
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Order #{selectedProofOrder.id} | {selectedProofOrder.recipientName}</p>
                                </div>
                                <button onClick={() => setSelectedProofOrder(null)} className="p-2 text-slate-400 hover:text-white transition-colors">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="p-8 flex flex-col items-center">
                                <div className="w-full max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/40 mb-8 p-2">
                                    <img src={selectedProofOrder.paymentProofUrl} alt="Payment Proof" className="w-full h-auto rounded-lg" />
                                </div>
                                <div className="flex gap-4 w-full">
                                    {selectedProofOrder.status === 'For Payment Verification' && (
                                        <button
                                            onClick={() => {
                                                updateOrderStatus(selectedProofOrder.id, 'Pending');
                                                setSelectedProofOrder(null);
                                            }}
                                            className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                                        >
                                            Approve & Start Pending
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setSelectedProofOrder(null)}
                                        className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default SponsorZone;
