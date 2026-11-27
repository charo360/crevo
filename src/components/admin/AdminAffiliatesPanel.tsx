import React, { FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { apiRequest } from '../../lib/api';

interface AdminAffiliateRow {
    userId: string;
    email: string;
    payoutName?: string;
    affiliateCode: string;
    payoutMethod: string;
    payoutEmail: string;
    clicks: number;
    signups: number;
    salesCount: number;
    pendingHoldCents: number;
    payableCents: number;
    paidCents: number;
    totalEarnedCents: number;
}

interface AdminAffiliatesResponse {
    affiliates: AdminAffiliateRow[];
    summary: {
        totalAffiliates: number;
        totalPayableCents: number;
        totalPendingHoldCents: number;
        totalPaidCents: number;
    };
}

const fmtUsd = (cents: number) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export const AdminAffiliatesPanel: FC = () => {
    const [data, setData] = useState<AdminAffiliatesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [payingUserId, setPayingUserId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await apiRequest<AdminAffiliatesResponse>('/api/admin/affiliates');
            setData(res);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load affiliates');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleMarkPaid = async (row: AdminAffiliateRow) => {
        const displayName = row.payoutName ? `${row.payoutName} (${row.email})` : row.email;
        if (!window.confirm(`Mark ${fmtUsd(row.payableCents)} as PAID for ${displayName} (${row.payoutMethod.toUpperCase()}: ${row.payoutEmail || 'not set'})?`)) {
            return;
        }
        setPayingUserId(row.userId);
        try {
            const res = await apiRequest<{ ok: boolean; markedPaidCount: number }>(
                `/api/admin/affiliates/${encodeURIComponent(row.userId)}/mark-paid`,
                {
                    method: 'POST',
                    body: JSON.stringify({ note: `Paid via ${row.payoutMethod || 'PayPal'} (${new Date().toLocaleDateString()})` }),
                }
            );
            toast.success(`Marked ${res.markedPaidCount} commission(s) as Paid!`);
            await load();
        } catch (err: any) {
            toast.error(err?.message || 'Could not mark commissions paid');
        } finally {
            setPayingUserId(null);
        }
    };

    if (loading && !data) {
        return (
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '28px', textAlign: 'center', color: '#6b7280' }}>
                Loading Affiliate Program &amp; Payouts...
            </div>
        );
    }

    const rows = data?.affiliates || [];
    const summary = data?.summary || {
        totalAffiliates: 0,
        totalPayableCents: 0,
        totalPendingHoldCents: 0,
        totalPaidCents: 0,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Summary Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
                {[
                    { label: 'Active Affiliates', value: String(summary.totalAffiliates), color: '#111827' },
                    { label: 'Owed (Ready to Pay)', value: fmtUsd(summary.totalPayableCents), color: '#059669' },
                    { label: 'In 14-Day Refund Hold', value: fmtUsd(summary.totalPendingHoldCents), color: '#b45309' },
                    { label: 'Total Paid Out', value: fmtUsd(summary.totalPaidCents), color: '#571c86' },
                ].map((card) => (
                    <div key={card.label} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '16px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280' }}>{card.label}</div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: card.color, marginTop: '4px' }}>{card.value}</div>
                    </div>
                ))}
            </div>

            {/* Affiliates Table */}
            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '18px', overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                        Affiliates &amp; Payouts (30% · 12-Month Cap · $25 Min)
                    </h3>
                    <button
                        type="button"
                        onClick={load}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
                    >
                        ↻ Refresh
                    </button>
                </div>

                {rows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '13.5px', color: '#6b7280' }}>
                        No affiliates have activated their link yet. Anyone who visits <strong>/affiliates</strong> while signed in automatically gets a referral link.
                    </p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left', color: '#6b7280' }}>
                                <th style={{ padding: '10px' }}>Affiliate</th>
                                <th style={{ padding: '10px' }}>Code</th>
                                <th style={{ padding: '10px' }}>Clicks / Signups / Sales</th>
                                <th style={{ padding: '10px' }}>Payout Method</th>
                                <th style={{ padding: '10px' }}>14d Hold</th>
                                <th style={{ padding: '10px' }}>Ready to Pay</th>
                                <th style={{ padding: '10px' }}>Paid</th>
                                <th style={{ padding: '10px' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const canPay = row.payableCents > 0;
                                return (
                                    <tr key={row.userId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '10px' }}>
                                            {row.payoutName ? (
                                                <>
                                                    <div style={{ fontWeight: 700, color: '#111827' }}>{row.payoutName}</div>
                                                    <div style={{ fontSize: '11.5px', color: '#6b7280' }}>{row.email}</div>
                                                </>
                                            ) : (
                                                <div style={{ fontWeight: 600 }}>{row.email}</div>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700, color: '#571c86' }}>{row.affiliateCode}</td>
                                        <td style={{ padding: '10px' }}>
                                            {row.clicks} / {row.signups} / <strong>{row.salesCount}</strong>
                                        </td>
                                        <td style={{ padding: '10px', fontSize: '12px' }}>
                                            {row.payoutEmail ? `${row.payoutMethod.toUpperCase()}: ${row.payoutEmail}` : <span style={{ color: '#9ca3af' }}>Not set</span>}
                                        </td>
                                        <td style={{ padding: '10px', color: '#b45309', fontWeight: 600 }}>{fmtUsd(row.pendingHoldCents)}</td>
                                        <td style={{ padding: '10px', color: '#059669', fontWeight: 800 }}>{fmtUsd(row.payableCents)}</td>
                                        <td style={{ padding: '10px', color: '#4b5563' }}>{fmtUsd(row.paidCents)}</td>
                                        <td style={{ padding: '10px' }}>
                                            <button
                                                type="button"
                                                disabled={!canPay || payingUserId === row.userId}
                                                onClick={() => handleMarkPaid(row)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: canPay ? '#059669' : '#e5e7eb',
                                                    color: canPay ? '#ffffff' : '#9ca3af',
                                                    fontWeight: 700,
                                                    fontSize: '12px',
                                                    cursor: canPay ? 'pointer' : 'not-allowed',
                                                }}
                                            >
                                                {payingUserId === row.userId ? 'Saving...' : 'Mark Paid'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
