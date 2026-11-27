import React, { FC, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../lib/api';

interface AffiliateDashboardData {
    affiliateCode: string;
    referralLink: string;
    commissionRatePercent: number;
    recurringMonths: number;
    holdDays: number;
    minPayoutCents: number;
    payoutMethod: 'paypal' | 'wise';
    payoutEmail: string;
    payoutName?: string;
    stats: {
        clicks: number;
        signups: number;
        paidConversions: number;
        pendingHoldCents: number;
        payableCents: number;
        paidCents: number;
        totalEarnedCents: number;
    };
    commissions: Array<{
        id: string;
        planName: string;
        saleAmountCents: number;
        commissionCents: number;
        status: 'pending_hold' | 'payable' | 'paid' | 'void';
        eligibleAt: string;
        paidAt: string | null;
        createdAt: string;
    }>;
}

const fmtUsd = (cents: number) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export const AffiliatesPage: FC = () => {
    const { user } = useAuth();
    const [calcReferrals, setCalcReferrals] = useState(25);
    const [data, setData] = useState<AffiliateDashboardData | null>(null);
    const [loading, setLoading] = useState(false);
    const [payoutMethod, setPayoutMethod] = useState<'paypal' | 'wise'>('paypal');
    const [payoutEmail, setPayoutEmail] = useState('');
    const [payoutName, setPayoutName] = useState('');
    const [customCode, setCustomCode] = useState('');
    const [editingCode, setEditingCode] = useState(false);
    const [savingCode, setSavingCode] = useState(false);
    const [savingPayout, setSavingPayout] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        apiRequest<AffiliateDashboardData>('/api/affiliates/me')
            .then((res) => {
                setData(res);
                setCustomCode(res.affiliateCode || '');
                setPayoutMethod(res.payoutMethod || 'paypal');
                setPayoutEmail(res.payoutEmail || user.email || '');
                setPayoutName(res.payoutName || '');
            })
            .catch((err) => {
                toast.error(err?.message || 'Could not load affiliate dashboard');
            })
            .finally(() => setLoading(false));
    }, [user]);

    const handleCopyLink = async () => {
        if (!data?.referralLink) return;
        try {
            await navigator.clipboard.writeText(data.referralLink);
            toast.success('Affiliate link copied! Share it anywhere to earn 30% recurring.');
        } catch {
            toast.info(data.referralLink);
        }
    };

    const handleSaveCustomCode = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned = customCode.trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,24}$/.test(cleaned)) {
            toast.error('Use 3–24 letters, numbers, hyphens, or underscores (no spaces).');
            return;
        }
        setSavingCode(true);
        try {
            const res = await apiRequest<{ ok: boolean; affiliateCode: string; referralLink: string }>(
                '/api/affiliates/code',
                {
                    method: 'PATCH',
                    body: JSON.stringify({ code: cleaned }),
                }
            );
            setData((prev) =>
                prev
                    ? { ...prev, affiliateCode: res.affiliateCode, referralLink: res.referralLink }
                    : prev
            );
            setCustomCode(res.affiliateCode);
            setEditingCode(false);
            toast.success(`Your referral link is now ${res.referralLink}!`);
        } catch (err: any) {
            toast.error(err?.message || 'Could not update referral code');
        } finally {
            setSavingCode(false);
        }
    };

    const handleSavePayout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payoutEmail.trim() || !payoutEmail.includes('@')) {
            toast.error('Please enter a valid PayPal or Wise email.');
            return;
        }
        setSavingPayout(true);
        try {
            await apiRequest('/api/affiliates/payout-settings', {
                method: 'PATCH',
                body: JSON.stringify({
                    payoutMethod,
                    payoutEmail: payoutEmail.trim(),
                    payoutName: payoutName.trim(),
                }),
            });
            toast.success('Payout settings saved!');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to save payout settings');
        } finally {
            setSavingPayout(false);
        }
    };

    const monthlyProEarnings = calcReferrals * 29 * 0.3;
    const yearlyProEarnings = monthlyProEarnings * 12;

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#faf8ff' }}>
            <Navbar />

            <main style={{ flex: 1, maxWidth: '1040px', width: '100%', margin: '0 auto', padding: '104px 20px 64px' }}>
                {/* Hero Header */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #4c1d95 0%, #7e22ce 100%)',
                        borderRadius: '20px',
                        padding: '36px 28px',
                        color: '#ffffff',
                        textAlign: 'center',
                        marginBottom: '28px',
                        boxShadow: '0 16px 40px rgba(87, 28, 134, 0.18)',
                    }}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            background: 'rgba(255,255,255,0.18)',
                            padding: '5px 14px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 800,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            marginBottom: '12px',
                        }}
                    >
                        🤝 Crevo AI Partner Program
                    </span>
                    <h1 style={{ margin: '0 0 10px', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, lineHeight: 1.15 }}>
                        Earn 30% Recurring Commission for 12 Months
                    </h1>
                    <p style={{ margin: '0 auto', maxWidth: '640px', fontSize: '16px', opacity: 0.92, lineHeight: 1.6 }}>
                        Share Crevo AI with YouTubers, podcasters, and short-form creators. Earn <strong>30%</strong> on every payment they make for their first 12 months — up to <strong>$104.40</strong> per Pro referral or <strong>$356.40</strong> per Enterprise referral.
                    </p>
                    {!user && (
                        <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <Link
                                to="/signup"
                                style={{
                                    background: '#ffffff',
                                    color: '#571c86',
                                    padding: '12px 24px',
                                    borderRadius: '10px',
                                    fontWeight: 800,
                                    textDecoration: 'none',
                                    fontSize: '15px',
                                }}
                            >
                                Join Free &amp; Get Your Link →
                            </Link>
                            <Link
                                to="/login"
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    color: '#ffffff',
                                    padding: '12px 22px',
                                    borderRadius: '10px',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                    fontSize: '15px',
                                    border: '1px solid rgba(255,255,255,0.35)',
                                }}
                            >
                                Sign In to Dashboard
                            </Link>
                        </div>
                    )}
                </div>

                {/* Logged-In Affiliate Dashboard */}
                {user && (
                    <section style={{ marginBottom: '36px' }}>
                        {loading && !data ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontWeight: 600 }}>
                                Loading your Affiliate Dashboard...
                            </div>
                        ) : data ? (
                            <>
                                {/* Referral Link Card */}
                                <div
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e4dcf2',
                                        borderRadius: '16px',
                                        padding: '22px',
                                        marginBottom: '20px',
                                        boxShadow: '0 4px 18px rgba(87, 28, 134, 0.05)',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#571c86', textTransform: 'uppercase' }}>
                                            Your Unique Referral Link (30-Day Cookie)
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCustomCode(data.affiliateCode);
                                                setEditingCode((v) => !v);
                                            }}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid #d8ccf0',
                                                color: '#571c86',
                                                borderRadius: '8px',
                                                padding: '4px 10px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {editingCode ? 'Cancel' : '✏️ Customize Code'}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        <input
                                            type="text"
                                            readOnly
                                            value={data.referralLink}
                                            style={{
                                                flex: '1 1 280px',
                                                padding: '11px 14px',
                                                borderRadius: '10px',
                                                border: '1px solid #d8ccf0',
                                                background: '#faf7ff',
                                                fontWeight: 700,
                                                fontSize: '15px',
                                                color: '#111827',
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCopyLink}
                                            style={{
                                                padding: '11px 22px',
                                                borderRadius: '10px',
                                                border: 'none',
                                                background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                                color: '#ffffff',
                                                fontWeight: 800,
                                                fontSize: '14px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            📋 Copy Link
                                        </button>
                                    </div>
                                    {editingCode && (
                                        <form
                                            onSubmit={handleSaveCustomCode}
                                            style={{
                                                marginTop: '12px',
                                                paddingTop: '12px',
                                                borderTop: '1px dashed #e4dcf2',
                                                display: 'flex',
                                                gap: '8px',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#6b7280' }}>
                                                crevo.app/?ref=
                                            </span>
                                            <input
                                                type="text"
                                                value={customCode}
                                                onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                                                placeholder="YOURNAME"
                                                maxLength={24}
                                                style={{
                                                    flex: '1 1 160px',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #571c86',
                                                    fontWeight: 800,
                                                    fontSize: '14px',
                                                    textTransform: 'uppercase',
                                                }}
                                            />
                                            <button
                                                type="submit"
                                                disabled={savingCode}
                                                style={{
                                                    padding: '8px 16px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: '#571c86',
                                                    color: '#ffffff',
                                                    fontWeight: 700,
                                                    fontSize: '13px',
                                                    cursor: savingCode ? 'wait' : 'pointer',
                                                }}
                                            >
                                                {savingCode ? 'Saving...' : 'Save Code'}
                                            </button>
                                        </form>
                                    )}
                                </div>

                                {/* Stats Grid */}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
                                        gap: '12px',
                                        marginBottom: '20px',
                                    }}
                                >
                                    {[
                                        { label: 'Link Clicks', value: String(data.stats.clicks), color: '#111827' },
                                        { label: 'Signups', value: String(data.stats.signups), color: '#111827' },
                                        { label: 'Paid Referrals', value: String(data.stats.paidConversions), color: '#571c86' },
                                        { label: 'Pending (14d Hold)', value: fmtUsd(data.stats.pendingHoldCents), color: '#b45309' },
                                        { label: 'Ready for Payout', value: fmtUsd(data.stats.payableCents), color: '#059669' },
                                        { label: 'Total Paid Out', value: fmtUsd(data.stats.paidCents), color: '#2563eb' },
                                    ].map((stat) => (
                                        <div
                                            key={stat.label}
                                            style={{
                                                background: '#ffffff',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '14px',
                                                padding: '16px',
                                            }}
                                        >
                                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>{stat.label}</div>
                                            <div style={{ fontSize: '24px', fontWeight: 900, color: stat.color, marginTop: '4px' }}>
                                                {stat.value}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Payout Settings */}
                                <form
                                    onSubmit={handleSavePayout}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '16px',
                                        padding: '20px',
                                        marginBottom: '20px',
                                    }}
                                >
                                    <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                                        Automatic Monthly Payouts ($25 Minimum)
                                    </h3>
                                    <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#6b7280', lineHeight: 1.5 }}>
                                        <strong>No need to click withdraw.</strong> Simply save your PayPal or Wise email below — once your cleared balance reaches <strong>$25</strong> (after the 14-day refund hold), we automatically send your payout at the end of every month.
                                    </p>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            value={payoutName}
                                            onChange={(e) => setPayoutName(e.target.value)}
                                            placeholder="Your full name"
                                            required
                                            style={{
                                                flex: '1 1 190px',
                                                padding: '10px 12px',
                                                borderRadius: '9px',
                                                border: '1px solid #d1d5db',
                                                fontSize: '14px',
                                            }}
                                        />
                                        <select
                                            value={payoutMethod}
                                            onChange={(e) => setPayoutMethod(e.target.value as 'paypal' | 'wise')}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '9px',
                                                border: '1px solid #d1d5db',
                                                fontWeight: 600,
                                                fontSize: '14px',
                                                background: '#ffffff',
                                            }}
                                        >
                                            <option value="paypal">PayPal</option>
                                            <option value="wise">Wise</option>
                                        </select>
                                        <input
                                            type="email"
                                            value={payoutEmail}
                                            onChange={(e) => setPayoutEmail(e.target.value)}
                                            placeholder="your-payout@email.com"
                                            required
                                            style={{
                                                flex: '1 1 240px',
                                                padding: '10px 12px',
                                                borderRadius: '9px',
                                                border: '1px solid #d1d5db',
                                                fontSize: '14px',
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            disabled={savingPayout}
                                            style={{
                                                padding: '10px 18px',
                                                borderRadius: '9px',
                                                border: 'none',
                                                background: '#111827',
                                                color: '#ffffff',
                                                fontWeight: 700,
                                                fontSize: '13.5px',
                                                cursor: savingPayout ? 'wait' : 'pointer',
                                            }}
                                        >
                                            {savingPayout ? 'Saving...' : 'Save Payout Info'}
                                        </button>
                                    </div>
                                </form>

                                {/* Recent Commissions */}
                                <div
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '16px',
                                        padding: '20px',
                                    }}
                                >
                                    <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                                        Recent Commissions ({data.commissions.length})
                                    </h3>
                                    {data.commissions.length === 0 ? (
                                        <p style={{ margin: 0, fontSize: '13.5px', color: '#6b7280' }}>
                                            No commissions yet — share your referral link in YouTube descriptions, TikTok bios, or newsletters to start earning 30% recurring!
                                        </p>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                                                        <th style={{ padding: '8px' }}>Date</th>
                                                        <th style={{ padding: '8px' }}>Plan</th>
                                                        <th style={{ padding: '8px' }}>Sale</th>
                                                        <th style={{ padding: '8px' }}>Your 30%</th>
                                                        <th style={{ padding: '8px' }}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.commissions.map((c) => (
                                                        <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                            <td style={{ padding: '10px 8px' }}>
                                                                {new Date(c.createdAt).toLocaleDateString()}
                                                            </td>
                                                            <td style={{ padding: '10px 8px', fontWeight: 600 }}>{c.planName}</td>
                                                            <td style={{ padding: '10px 8px' }}>{fmtUsd(c.saleAmountCents)}</td>
                                                            <td style={{ padding: '10px 8px', fontWeight: 800, color: '#571c86' }}>
                                                                +{fmtUsd(c.commissionCents)}
                                                            </td>
                                                            <td style={{ padding: '10px 8px' }}>
                                                                <span
                                                                    style={{
                                                                        padding: '3px 9px',
                                                                        borderRadius: '999px',
                                                                        fontSize: '11.5px',
                                                                        fontWeight: 700,
                                                                        background:
                                                                            c.status === 'paid'
                                                                                ? '#dcfce7'
                                                                                : c.status === 'payable'
                                                                                  ? '#e0e7ff'
                                                                                  : '#fef3c7',
                                                                        color:
                                                                            c.status === 'paid'
                                                                                ? '#166534'
                                                                                : c.status === 'payable'
                                                                                  ? '#3730a3'
                                                                                  : '#92400e',
                                                                    }}
                                                                >
                                                                    {c.status === 'paid'
                                                                        ? 'Paid'
                                                                        : c.status === 'payable'
                                                                          ? 'Ready for Payout'
                                                                          : '14-Day Hold'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : null}
                    </section>
                )}

                {/* Interactive Earnings Calculator */}
                <section
                    style={{
                        background: '#ffffff',
                        border: '1px solid #e4dcf2',
                        borderRadius: '18px',
                        padding: '28px',
                        marginBottom: '24px',
                    }}
                >
                    <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 800, color: '#111827' }}>
                        Estimate Your Recurring Earnings
                    </h2>
                    <p style={{ margin: '0 0 18px', fontSize: '14px', color: '#6b7280' }}>
                        Slide to see how much you earn referring creators to the <strong>$29/mo Pro Plan</strong> (30% = $8.70/mo per user for 12 months):
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '18px' }}>
                        <input
                            type="range"
                            min={5}
                            max={250}
                            step={5}
                            value={calcReferrals}
                            onChange={(e) => setCalcReferrals(Number(e.target.value))}
                            style={{ flex: '1 1 260px', accentColor: '#571c86' }}
                        />
                        <span style={{ fontWeight: 800, fontSize: '16px', color: '#571c86', minWidth: '150px' }}>
                            {calcReferrals} Pro Referrals
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                        <div style={{ background: '#faf7ff', border: '1px solid #e4dcf2', borderRadius: '14px', padding: '18px' }}>
                            <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: 600 }}>Monthly Recurring Income</div>
                            <div style={{ fontSize: '32px', fontWeight: 900, color: '#571c86', marginTop: '4px' }}>
                                ${monthlyProEarnings.toFixed(0)}/mo
                            </div>
                        </div>
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px', padding: '18px' }}>
                            <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>12-Month Total Earnings</div>
                            <div style={{ fontSize: '32px', fontWeight: 900, color: '#15803d', marginTop: '4px' }}>
                                ${yearlyProEarnings.toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr
                            </div>
                        </div>
                    </div>
                </section>

                {/* Program Rules */}
                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px',
                    }}
                >
                    {[
                        { title: '30% for 12 Months', desc: 'Earn 30% on every purchase and renewal a referred user makes during their first 12 months.' },
                        { title: '30-Day Cookie Window', desc: 'Anyone who clicks your link and signs up within 30 days is automatically attributed to you.' },
                        { title: 'Automatic End-of-Month Payouts', desc: 'No manual withdrawal needed — save your PayPal or Wise email and we pay out automatically at the end of every month once your cleared balance hits $25 (after a 14-day refund hold).' },
                    ].map((item) => (
                        <div
                            key={item.title}
                            style={{
                                background: '#ffffff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '14px',
                                padding: '18px',
                            }}
                        >
                            <div style={{ fontWeight: 800, fontSize: '15px', color: '#111827', marginBottom: '6px' }}>{item.title}</div>
                            <div style={{ fontSize: '13.5px', color: '#4b5563', lineHeight: 1.55 }}>{item.desc}</div>
                        </div>
                    ))}
                </section>
            </main>

            <Footer />
        </div>
    );
};
