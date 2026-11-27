import React, { FC } from 'react';
import { Link } from 'react-router-dom';

interface ComparisonRow {
    feature: string;
    crevo: string;
    opus: string;
    canva: string;
}

const COMPARISON_ROWS: ComparisonRow[] = [
    {
        feature: 'YouTube Link → 1080p Viral Clips + Captions',
        crevo: 'Included (1080p HD)',
        opus: 'Paid plan',
        canva: 'Manual editing',
    },
    {
        feature: '1-Click "Make Cover Thumbnail" From Any Clip',
        crevo: 'Built-in AI face picker',
        opus: 'Not included',
        canva: 'Manual screenshots',
    },
    {
        feature: 'AI YouTube Thumbnails + CTR Scorecards',
        crevo: 'Included (All sizes)',
        opus: 'Not included',
        canva: 'Manual templates',
    },
    {
        feature: 'AI Smart Resize (No Cropping Faces or Text)',
        crevo: '1-click AI expand',
        opus: 'Not included',
        canva: 'Manual crop/resize',
    },
    {
        feature: 'Background Video Queue + "Clips Ready" Email',
        crevo: 'Close tab anytime',
        opus: 'Included',
        canva: 'Must stay open',
    },
    {
        feature: 'Pay-As-You-Go Entry (No Monthly Lock-In)',
        crevo: '$9 one-time (never expires)',
        opus: '$15–$29/mo sub',
        canva: '$15–$23/mo sub',
    },
];

export const Testimonials: FC = () => {
    return (
        <section
            style={{
                padding: '72px 20px',
                background: 'linear-gradient(180deg, #faf7ff 0%, #ffffff 100%)',
                borderTop: '1px solid #efe8fa',
                borderBottom: '1px solid #efe8fa',
            }}
        >
            <div style={{ maxWidth: '1060px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 36px' }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '5px 13px',
                            borderRadius: '999px',
                            background: '#f3e8ff',
                            color: '#571c86',
                            fontSize: '12px',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            marginBottom: '12px',
                        }}
                    >
                        WHY CREATORS SWITCH TO CREVO AI
                    </span>
                    <h2
                        style={{
                            margin: '0 0 12px',
                            fontSize: 'clamp(1.7rem, 3.2vw, 2.35rem)',
                            fontWeight: 800,
                            color: '#111827',
                            lineHeight: 1.2,
                        }}
                    >
                        Replace 3 Separate Tools With One Creator Studio
                    </h2>
                    <p style={{ margin: 0, fontSize: '1rem', color: '#4b5563', lineHeight: 1.6 }}>
                        Instead of paying $45+/month for separate clipping, thumbnail, and resizing subscriptions, Crevo connects your entire YouTube-to-Shorts workflow in one fast app.
                    </p>
                </div>

                {/* Responsive Comparison Card */}
                <div
                    style={{
                        borderRadius: '18px',
                        border: '1px solid #e4dcf2',
                        background: '#ffffff',
                        boxShadow: '0 12px 34px rgba(87, 28, 134, 0.07)',
                        overflowX: 'auto',
                    }}
                >
                    <table
                        style={{
                            width: '100%',
                            minWidth: '640px',
                            borderCollapse: 'collapse',
                            textAlign: 'left',
                        }}
                    >
                        <thead>
                            <tr style={{ borderBottom: '1px solid #ece5f7' }}>
                                <th
                                    style={{
                                        padding: '16px 20px',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        color: '#4b5563',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em',
                                    }}
                                >
                                    Creator Workflow
                                </th>
                                <th
                                    style={{
                                        padding: '16px 20px',
                                        fontSize: '14px',
                                        fontWeight: 800,
                                        color: '#ffffff',
                                        background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                    }}
                                >
                                    Crevo AI
                                </th>
                                <th
                                    style={{
                                        padding: '16px 20px',
                                        fontSize: '13.5px',
                                        fontWeight: 700,
                                        color: '#4b5563',
                                        background: '#faf8fd',
                                    }}
                                >
                                    OpusClip
                                </th>
                                <th
                                    style={{
                                        padding: '16px 20px',
                                        fontSize: '13.5px',
                                        fontWeight: 700,
                                        color: '#4b5563',
                                        background: '#faf8fd',
                                    }}
                                >
                                    Canva / Photoshop
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {COMPARISON_ROWS.map((row, idx) => (
                                <tr
                                    key={row.feature}
                                    style={{
                                        borderBottom: idx === COMPARISON_ROWS.length - 1 ? 'none' : '1px solid #f1ebf9',
                                    }}
                                >
                                    <td
                                        style={{
                                            padding: '15px 20px',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: '#111827',
                                        }}
                                    >
                                        {row.feature}
                                    </td>
                                    <td
                                        style={{
                                            padding: '15px 20px',
                                            fontSize: '13.5px',
                                            fontWeight: 700,
                                            color: '#4c1d95',
                                            background: '#faf5ff',
                                        }}
                                    >
                                        ✓ {row.crevo}
                                    </td>
                                    <td
                                        style={{
                                            padding: '15px 20px',
                                            fontSize: '13.5px',
                                            color: '#6b7280',
                                        }}
                                    >
                                        {row.opus}
                                    </td>
                                    <td
                                        style={{
                                            padding: '15px 20px',
                                            fontSize: '13.5px',
                                            color: '#6b7280',
                                        }}
                                    >
                                        {row.canva}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Bottom CTA Strip */}
                <div
                    style={{
                        marginTop: '24px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '14px',
                        padding: '18px 22px',
                        borderRadius: '14px',
                        background: '#ffffff',
                        border: '1px solid #e4dcf2',
                    }}
                >
                    <div>
                        <strong style={{ display: 'block', fontSize: '15px', color: '#111827' }}>
                            Try the complete workflow free — 6 starter credits included
                        </strong>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                            1-click Google Sign-In · No credit card required · Upgrade anytime from $9
                        </span>
                    </div>
                    <Link
                        to="/signup"
                        style={{
                            padding: '10px 20px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                            color: '#ffffff',
                            fontSize: '14px',
                            fontWeight: 700,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Start Free Now →
                    </Link>
                </div>
            </div>
        </section>
    );
};
