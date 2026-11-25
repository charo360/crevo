import React, { FC, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiRequest } from '../lib/api';
import { AdminInboxPanel } from '../components/admin/AdminInboxPanel';

interface AdminUserRow {
    id: string;
    email: string;
    signup_ip: string;
    created_at: string;
    balance: number;
    total_earned: number;
    total_spent: number;
    total_paid_cents: number;
    is_paid: boolean;
}

interface AdminPaymentRow {
    id: string;
    user_id: string;
    email: string;
    amount_cents: number;
    currency: string;
    credits_purchased: number;
    status: string;
    pack_name: string;
    created_at: string;
}

interface AdminTrialRow {
    id: string;
    tool: string;
    ip: string;
    fingerprint: string;
    created_at: string;
}

interface AdminSubscriberRow {
    id: string;
    email: string;
    created_at: string;
}

interface AdminOverviewData {
    summary: {
        total_users: number;
        paid_users: number;
        free_users: number;
        total_revenue_cents: number;
        total_credits_balance: number;
        total_credits_spent: number;
        total_repurposed_videos: number;
        total_viral_clips: number;
        total_free_trials: number;
        total_subscribers: number;
    };
    users: AdminUserRow[];
    payments: AdminPaymentRow[];
    free_trials: AdminTrialRow[];
    subscribers: AdminSubscriberRow[];
}

function formatDate(d?: string): string {
    if (!d) return '-';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatMoney(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

export const AdminPage: FC = () => {
    const [data, setData] = useState<AdminOverviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'users' | 'payments' | 'trials' | 'leads' | 'inbox'>('users');
    const [search, setSearch] = useState('');
    const [userFilter, setUserFilter] = useState<'all' | 'paid' | 'free'>('all');
    const [grantModalUser, setGrantModalUser] = useState<AdminUserRow | null>(null);
    const [grantAmount, setGrantAmount] = useState('50');
    const [grantNote, setGrantNote] = useState('Admin bonus credits');
    const [submittingGrant, setSubmittingGrant] = useState(false);

    const loadOverview = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiRequest<AdminOverviewData>('/api/admin/overview');
            setData(res);
        } catch (err: any) {
            setError(err?.message || 'Unable to load admin dashboard');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    const handleGrantCredits = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!grantModalUser) return;
        const amount = Number(grantAmount);
        if (!Number.isFinite(amount) || amount === 0) {
            toast.error('Enter a valid non-zero credit amount');
            return;
        }
        setSubmittingGrant(true);
        try {
            await apiRequest(`/api/admin/users/${grantModalUser.id}/credits`, {
                method: 'POST',
                body: JSON.stringify({ amount, note: grantNote }),
            });
            toast.success(`Updated ${grantModalUser.email} by ${amount > 0 ? `+${amount}` : amount} credits`);
            setGrantModalUser(null);
            await loadOverview();
        } catch (err: any) {
            toast.error(err?.message || 'Failed to update credits');
        } finally {
            setSubmittingGrant(false);
        }
    };

    const filteredUsers = (data?.users || []).filter((u) => {
        if (userFilter === 'paid' && !u.is_paid) return false;
        if (userFilter === 'free' && u.is_paid) return false;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            return u.email.toLowerCase().includes(q) || u.signup_ip.toLowerCase().includes(q);
        }
        return true;
    });

    return (
        <div style={{ minHeight: '100vh', background: '#f8f6fc', color: '#111827', fontFamily: 'Inter, sans-serif' }}>
            {/* Top Bar */}
            <header
                style={{
                    background: '#ffffff',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '14px 24px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                        style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '13px',
                        }}
                    >
                        CREVO ADMIN
                    </span>
                    <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Platform Analytics &amp; Users</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={loadOverview}
                        disabled={loading}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '10px',
                            border: '1px solid #d8ccf0',
                            background: '#ffffff',
                            color: '#571c86',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        {loading ? 'Refreshing...' : '↻ Refresh'}
                    </button>
                    <Link
                        to="/dashboard"
                        style={{
                            padding: '8px 16px',
                            borderRadius: '10px',
                            background: '#571c86',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '13px',
                            textDecoration: 'none',
                        }}
                    >
                        ← Back to Studio
                    </Link>
                </div>
            </header>

            <main style={{ maxWidth: '1220px', margin: '0 auto', padding: '24px' }}>
                {error ? (
                    <div
                        style={{
                            background: '#ffffff',
                            border: '1px solid #fecaca',
                            borderRadius: '16px',
                            padding: '32px',
                            textAlign: 'center',
                            maxWidth: '520px',
                            margin: '3rem auto',
                        }}
                    >
                        <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔒</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>Admin Access Only</h2>
                        <p style={{ color: '#6b7280', margin: '0 0 20px', fontSize: '14px' }}>{error}</p>
                        <Link
                            to="/dashboard"
                            style={{
                                display: 'inline-block',
                                padding: '10px 20px',
                                borderRadius: '10px',
                                background: '#571c86',
                                color: '#ffffff',
                                fontWeight: 700,
                                textDecoration: 'none',
                            }}
                        >
                            Return to Studio
                        </Link>
                    </div>
                ) : loading && !data ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>Loading Crevo Admin metrics...</div>
                ) : data ? (
                    <>
                        {/* KPI Cards */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                                gap: '14px',
                                marginBottom: '24px',
                            }}
                        >
                            {[
                                { label: 'Total Users', value: String(data.summary.total_users), sub: `${data.summary.free_users} free` },
                                { label: 'Paid Users', value: String(data.summary.paid_users), sub: data.summary.total_users > 0 ? `${Math.round((data.summary.paid_users / data.summary.total_users) * 100)}% conversion` : '0%' },
                                { label: 'Total Revenue', value: formatMoney(data.summary.total_revenue_cents), sub: `${data.payments.length} payment records` },
                                { label: 'Credits Spent', value: String(data.summary.total_credits_spent), sub: `${data.summary.total_credits_balance} currently held` },
                                { label: 'Free AI Resizes', value: String(data.summary.total_free_trials), sub: 'Public trial tool uses' },
                                { label: 'Viral Clips Made', value: String(data.summary.total_viral_clips), sub: `${data.summary.total_repurposed_videos} videos processed` },
                            ].map((card) => (
                                <div
                                    key={card.label}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '14px',
                                        padding: '18px',
                                        boxShadow: '0 2px 10px rgba(87, 28, 134, 0.04)',
                                    }}
                                >
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {card.label}
                                    </div>
                                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#111827', margin: '6px 0 4px' }}>{card.value}</div>
                                    <div style={{ fontSize: '12px', color: '#571c86', fontWeight: 500 }}>{card.sub}</div>
                                </div>
                            ))}
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                            {[
                                { id: 'users', label: `Users (${data.users.length})` },
                                { id: 'payments', label: `Payments (${data.payments.length})` },
                                { id: 'inbox', label: '📬 Inbox (sam@crevo.app)' },
                                { id: 'trials', label: `Free Trials (${data.free_trials.length})` },
                                { id: 'leads', label: `Newsletter (${data.subscribers.length})` },
                            ].map((t) => {
                                const active = activeTab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setActiveTab(t.id as any)}
                                        style={{
                                            padding: '9px 16px',
                                            borderRadius: '10px',
                                            border: active ? 'none' : '1px solid #e5e7eb',
                                            background: active ? '#571c86' : '#ffffff',
                                            color: active ? '#ffffff' : '#374151',
                                            fontWeight: 700,
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {t.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Users Tab */}
                        {activeTab === 'users' && (
                            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '18px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search by email or IP..."
                                        style={{
                                            flex: 1,
                                            minWidth: '220px',
                                            maxWidth: '380px',
                                            padding: '9px 14px',
                                            borderRadius: '10px',
                                            border: '1px solid #d1d5db',
                                            fontSize: '14px',
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {(['all', 'paid', 'free'] as const).map((f) => (
                                            <button
                                                key={f}
                                                type="button"
                                                onClick={() => setUserFilter(f)}
                                                style={{
                                                    padding: '8px 14px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #e5e7eb',
                                                    background: userFilter === f ? '#f3e8ff' : '#ffffff',
                                                    color: userFilter === f ? '#571c86' : '#4b5563',
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                    textTransform: 'capitalize',
                                                }}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                                                <th style={{ padding: '10px' }}>Email</th>
                                                <th style={{ padding: '10px' }}>Plan</th>
                                                <th style={{ padding: '10px' }}>Total Paid</th>
                                                <th style={{ padding: '10px' }}>Credits</th>
                                                <th style={{ padding: '10px' }}>Spent</th>
                                                <th style={{ padding: '10px' }}>Signup IP</th>
                                                <th style={{ padding: '10px' }}>Joined</th>
                                                <th style={{ padding: '10px' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredUsers.map((u) => (
                                                <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '10px', fontWeight: 600 }}>{u.email}</td>
                                                    <td style={{ padding: '10px' }}>
                                                        <span
                                                            style={{
                                                                padding: '3px 9px',
                                                                borderRadius: '999px',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                background: u.is_paid ? '#dcfce7' : '#f3f4f6',
                                                                color: u.is_paid ? '#166534' : '#4b5563',
                                                            }}
                                                        >
                                                            {u.is_paid ? 'PAID' : 'FREE'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px', fontWeight: 700, color: u.is_paid ? '#166534' : '#6b7280' }}>
                                                        {formatMoney(u.total_paid_cents)}
                                                    </td>
                                                    <td style={{ padding: '10px', fontWeight: 700, color: '#571c86' }}>{u.balance}</td>
                                                    <td style={{ padding: '10px', color: '#4b5563' }}>{u.total_spent}</td>
                                                    <td style={{ padding: '10px', fontFamily: 'monospace', color: '#6b7280' }}>{u.signup_ip}</td>
                                                    <td style={{ padding: '10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(u.created_at)}</td>
                                                    <td style={{ padding: '10px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setGrantModalUser(u);
                                                                setGrantAmount('50');
                                                                setGrantNote('Admin bonus credits');
                                                            }}
                                                            style={{
                                                                padding: '5px 10px',
                                                                borderRadius: '8px',
                                                                border: '1px solid #d8ccf0',
                                                                background: '#faf8ff',
                                                                color: '#571c86',
                                                                fontWeight: 600,
                                                                fontSize: '12px',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            + Credits
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {filteredUsers.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                        No matching users found.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Payments Tab */}
                        {activeTab === 'payments' && (
                            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '18px', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                                            <th style={{ padding: '10px' }}>User Email</th>
                                            <th style={{ padding: '10px' }}>Pack</th>
                                            <th style={{ padding: '10px' }}>Credits</th>
                                            <th style={{ padding: '10px' }}>Amount</th>
                                            <th style={{ padding: '10px' }}>Status</th>
                                            <th style={{ padding: '10px' }}>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.payments.map((p) => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '10px', fontWeight: 600 }}>{p.email}</td>
                                                <td style={{ padding: '10px' }}>{p.pack_name || 'Credit Pack'}</td>
                                                <td style={{ padding: '10px', fontWeight: 700, color: '#571c86' }}>+{p.credits_purchased}</td>
                                                <td style={{ padding: '10px', fontWeight: 700 }}>{formatMoney(p.amount_cents)}</td>
                                                <td style={{ padding: '10px' }}>
                                                    <span
                                                        style={{
                                                            padding: '3px 9px',
                                                            borderRadius: '999px',
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            background: p.status === 'succeeded' || p.status === 'completed' ? '#dcfce7' : '#fef3c7',
                                                            color: p.status === 'succeeded' || p.status === 'completed' ? '#166534' : '#92400e',
                                                        }}
                                                    >
                                                        {p.status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px', color: '#6b7280' }}>{formatDate(p.created_at)}</td>
                                            </tr>
                                        ))}
                                        {data.payments.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                    No payments yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Inbox Tab (sam@crevo.app via Mailbux JMAP) */}
                        {activeTab === 'inbox' && <AdminInboxPanel />}

                        {/* Free Trials Tab */}
                        {activeTab === 'trials' && (
                            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '18px', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                                            <th style={{ padding: '10px' }}>Tool</th>
                                            <th style={{ padding: '10px' }}>IP Address</th>
                                            <th style={{ padding: '10px' }}>Device Fingerprint</th>
                                            <th style={{ padding: '10px' }}>Used At</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.free_trials.map((t) => (
                                            <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '10px', fontWeight: 600 }}>{t.tool}</td>
                                                <td style={{ padding: '10px', fontFamily: 'monospace' }}>{t.ip}</td>
                                                <td style={{ padding: '10px', fontFamily: 'monospace', color: '#6b7280' }}>{t.fingerprint}</td>
                                                <td style={{ padding: '10px', color: '#6b7280' }}>{formatDate(t.created_at)}</td>
                                            </tr>
                                        ))}
                                        {data.free_trials.length === 0 && (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                    No public free AI resize trials recorded yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Newsletter Leads Tab */}
                        {activeTab === 'leads' && (
                            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '18px', overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                                            <th style={{ padding: '10px' }}>Subscriber Email</th>
                                            <th style={{ padding: '10px' }}>Subscribed At</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.subscribers.map((s) => (
                                            <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '10px', fontWeight: 600 }}>{s.email}</td>
                                                <td style={{ padding: '10px', color: '#6b7280' }}>{formatDate(s.created_at)}</td>
                                            </tr>
                                        ))}
                                        {data.subscribers.length === 0 && (
                                            <tr>
                                                <td colSpan={2} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                                                    No newsletter subscribers yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                ) : null}
            </main>

            {/* Grant Credits Modal */}
            {grantModalUser && (
                <div
                    onClick={() => setGrantModalUser(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(17, 17, 27, 0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        zIndex: 10000,
                    }}
                >
                    <form
                        onSubmit={handleGrantCredits}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            maxWidth: '400px',
                            width: '100%',
                            padding: '24px',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
                        }}
                    >
                        <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800 }}>Update Credits</h3>
                        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
                            {grantModalUser.email} (current balance: <strong>{grantModalUser.balance}</strong>)
                        </p>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                            Credits to Add (use negative to deduct)
                        </label>
                        <input
                            type="number"
                            required
                            value={grantAmount}
                            onChange={(e) => setGrantAmount(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', marginBottom: '12px', fontSize: '14px' }}
                        />
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Note</label>
                        <input
                            type="text"
                            value={grantNote}
                            onChange={(e) => setGrantNote(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', marginBottom: '18px', fontSize: '14px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setGrantModalUser(null)}
                                style={{ padding: '9px 14px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submittingGrant}
                                style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: '#571c86', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
                            >
                                {submittingGrant ? 'Saving...' : 'Save Credits'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
