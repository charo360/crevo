import React, { FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../contexts/AuthContext';
import { redirectToCheckout } from '../../services/payments/stripeService';

const EVENT_NAME = 'crevo:out-of-credits';

export interface OutOfCreditsDetail {
    requiredCredits?: number;
    actionLabel?: string;
}

export function triggerOutOfCreditsModal(detail: OutOfCreditsDetail = {}): void {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<OutOfCreditsDetail>(EVENT_NAME, { detail }));
    }
}

const PLANS = [
    {
        id: 'payg',
        name: 'Pay As You Go',
        price: '$9',
        period: 'one-time',
        credits: '35 credits',
        priceId: 'price_1UfkBAELJu3kIHjxxWOcwsh0',
        perks: ['Never expires', '~17 thumbnails or 11 clip runs', 'Instant access'],
        popular: false,
    },
    {
        id: 'pro',
        name: 'Pro Plan',
        price: '$29',
        period: '/ month',
        credits: '200 credits / mo',
        priceId: 'price_1UfkBBELJu3kIHjxvfZceTS4',
        perks: ['Best value for creators', '1080p HD clips + AI captions', 'Cancel anytime in 1 click'],
        popular: true,
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: '$99',
        period: '/ month',
        credits: '1,000 credits / mo',
        priceId: 'price_1UfkBCELJu3kIHjxPeUkdZJp',
        perks: ['Lowest cost per credit', 'Built for agencies & channels', 'Priority queue'],
        popular: false,
    },
];

export const OutOfCreditsModal: FC = () => {
    const { credits } = useAuth();
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<OutOfCreditsDetail>({});
    const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);

    useEffect(() => {
        const handler = (e: Event) => {
            const custom = e as CustomEvent<OutOfCreditsDetail>;
            setDetail(custom.detail || {});
            setOpen(true);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener(EVENT_NAME, handler);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener(EVENT_NAME, handler);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);

    if (!open) return null;

    const handleSelectPlan = async (priceId: string) => {
        setLoadingPriceId(priceId);
        try {
            await redirectToCheckout(priceId);
        } catch (err: any) {
            toast.error(err?.message || 'Could not start Stripe Checkout.');
            setLoadingPriceId(null);
        }
    };

    const currentBalance = typeof credits === 'number' ? credits : 0;

    return (
        <div
            onClick={() => setOpen(false)}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(15, 11, 26, 0.72)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                overflowY: 'auto',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: '760px',
                    background: '#ffffff',
                    borderRadius: '20px',
                    boxShadow: '0 24px 64px rgba(17, 12, 34, 0.35)',
                    overflow: 'hidden',
                    border: '1px solid #e9e2f8',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #4c1d95 0%, #7e22ce 100%)',
                        padding: '22px 26px',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '12px',
                    }}
                >
                    <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.88 }}>
                            ⚡ Top Up Credits
                        </div>
                        <h3 style={{ margin: '4px 0 6px', fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>
                            You need more credits to continue
                        </h3>
                        <p style={{ margin: 0, fontSize: '14px', opacity: 0.92 }}>
                            Current balance: <strong>{currentBalance} credit{currentBalance === 1 ? '' : 's'}</strong>
                            {detail.requiredCredits ? (
                                <>
                                    {' '}· {detail.actionLabel ? `${detail.actionLabel} requires ` : 'This action requires '}
                                    <strong>{detail.requiredCredits} credit{detail.requiredCredits === 1 ? '' : 's'}</strong>
                                </>
                            ) : null}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Close upgrade modal"
                        style={{
                            background: 'rgba(255,255,255,0.16)',
                            border: 'none',
                            color: '#ffffff',
                            width: '32px',
                            height: '32px',
                            borderRadius: '999px',
                            fontSize: '18px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Plans Grid */}
                <div
                    style={{
                        padding: '22px 24px 18px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: '14px',
                    }}
                >
                    {PLANS.map((plan) => {
                        const busy = loadingPriceId === plan.priceId;
                        return (
                            <div
                                key={plan.id}
                                style={{
                                    position: 'relative',
                                    borderRadius: '14px',
                                    padding: '18px 16px',
                                    border: plan.popular ? '2px solid #7e22ce' : '1px solid #e5e7eb',
                                    background: plan.popular ? '#faf6ff' : '#ffffff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                }}
                            >
                                {plan.popular && (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: '-11px',
                                            left: '14px',
                                            background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                            color: '#ffffff',
                                            fontSize: '10.5px',
                                            fontWeight: 800,
                                            padding: '3px 9px',
                                            borderRadius: '999px',
                                            letterSpacing: '0.04em',
                                        }}
                                    >
                                        MOST POPULAR
                                    </span>
                                )}
                                <div>
                                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827' }}>{plan.name}</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '6px' }}>
                                        <span style={{ fontSize: '28px', fontWeight: 900, color: '#111827' }}>{plan.price}</span>
                                        <span style={{ fontSize: '12.5px', color: '#6b7280', fontWeight: 600 }}>{plan.period}</span>
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#571c86', marginTop: '4px' }}>
                                        {plan.credits}
                                    </div>
                                    <ul style={{ margin: '12px 0 0', paddingLeft: '16px', fontSize: '12.5px', color: '#4b5563', lineHeight: 1.65 }}>
                                        {plan.perks.map((perk) => (
                                            <li key={perk}>{perk}</li>
                                        ))}
                                    </ul>
                                </div>

                                <button
                                    type="button"
                                    disabled={Boolean(loadingPriceId)}
                                    onClick={() => handleSelectPlan(plan.priceId)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: plan.popular
                                            ? 'linear-gradient(135deg, #571c86, #7e22ce)'
                                            : '#111827',
                                        color: '#ffffff',
                                        fontWeight: 700,
                                        fontSize: '13.5px',
                                        cursor: busy ? 'wait' : 'pointer',
                                        opacity: loadingPriceId && !busy ? 0.6 : 1,
                                    }}
                                >
                                    {busy ? 'Opening Stripe...' : `Get ${plan.name}`}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '0 24px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        fontSize: '12px',
                        color: '#6b7280',
                    }}
                >
                    <span>🔒 Secure checkout powered by Stripe · Credits added instantly</span>
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#6b7280',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '12.5px',
                        }}
                    >
                        Maybe later
                    </button>
                </div>
            </div>
        </div>
    );
};
