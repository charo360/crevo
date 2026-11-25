import React, { FC } from 'react';
import { Link } from 'react-router-dom';

export const BeforeAfterShowcase: FC = () => {
    return (
        <section style={{ padding: '64px 20px', background: '#ffffff' }}>
            <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 36px' }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '999px',
                            background: '#fef3c7',
                            color: '#92400e',
                            fontSize: '12px',
                            fontWeight: 700,
                            marginBottom: '10px',
                        }}
                    >
                        REAL THUMBNAIL DESIGNER WORKFLOW
                    </span>
                    <h2 style={{ margin: '0 0 10px', fontSize: 'clamp(1.75rem, 3.2vw, 2.35rem)', fontWeight: 800, color: '#111827' }}>
                        From Raw Video or Reference Link to Click-Magnet Thumbnail
                    </h2>
                    <p style={{ margin: 0, fontSize: '1rem', color: '#4b5563', lineHeight: 1.6 }}>
                        Keep your real face 100% recognizable while Crevo AI recreates proven viral layouts, upgrades expressions &amp; rim lighting, and scores every variation for CTR.
                    </p>
                </div>

                {/* Before -> Process -> After Visual Flow */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '20px',
                        alignItems: 'stretch',
                    }}
                >
                    {/* Card 1: Before / Inputs */}
                    <div
                        style={{
                            borderRadius: '16px',
                            border: '1px solid #e5e7eb',
                            background: '#f9fafb',
                            padding: '22px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em' }}>
                                    BEFORE · YOUR INPUTS
                                </span>
                                <span style={{ padding: '3px 9px', borderRadius: '999px', background: '#e5e7eb', color: '#374151', fontSize: '11px', fontWeight: 700 }}>
                                    Raw Footage
                                </span>
                            </div>
                            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#111827' }}>
                                Drop a 10GB Video or Reference Link
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13.5px', color: '#4b5563', lineHeight: 1.7 }}>
                                <li>Scans 8 frames locally to capture <strong>every person</strong> &amp; peak reaction</li>
                                <li>Tick <strong>Recreate Reference Thumbnail</strong> to clone any YouTube layout</li>
                                <li>Zero waiting — big 4K videos stay local in your browser</li>
                            </ul>
                        </div>
                        <div style={{ marginTop: '16px', padding: '10px 12px', borderRadius: '10px', background: '#ffffff', border: '1px dashed #d1d5db', fontSize: '12px', color: '#6b7280' }}>
                            Avg raw frame CTR: <strong style={{ color: '#dc2626' }}>2.8% – 4.1%</strong>
                        </div>
                    </div>

                    {/* Card 2: AI Designer Engine */}
                    <div
                        style={{
                            borderRadius: '16px',
                            border: '1.5px solid #d8ccf0',
                            background: '#faf7ff',
                            padding: '22px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#571c86', letterSpacing: '0.05em' }}>
                                    CREVO AI DESIGNER
                                </span>
                                <span style={{ padding: '3px 9px', borderRadius: '999px', background: '#f3e8ff', color: '#571c86', fontSize: '11px', fontWeight: 700 }}>
                                    100% Likeness
                                </span>
                            </div>
                            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#111827' }}>
                                Real Identity + Studio Expression Polish
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13.5px', color: '#4b5563', lineHeight: 1.7 }}>
                                <li>Locks your real face, hair, skin tone &amp; glasses — never generic AI faces</li>
                                <li>Enhances eye contact, rim lighting &amp; readable 2–4 word hooks</li>
                                <li>Swaps in your people &amp; headline while keeping viral composition</li>
                            </ul>
                        </div>
                        <div style={{ marginTop: '16px', padding: '10px 12px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e9d5ff', fontSize: '12px', color: '#571c86', fontWeight: 600 }}>
                            ⚡ Generated in ~25 seconds · 1 to 4 variations per run
                        </div>
                    </div>

                    {/* Card 3: After / Result */}
                    <div
                        style={{
                            borderRadius: '16px',
                            border: '2px solid #571c86',
                            background: 'linear-gradient(135deg, #2b0f47 0%, #571c86 100%)',
                            color: '#ffffff',
                            padding: '22px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: '0 14px 36px rgba(87, 28, 134, 0.22)',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#e9d5ff', letterSpacing: '0.05em' }}>
                                    AFTER · READY TO PUBLISH
                                </span>
                                <span style={{ padding: '3px 10px', borderRadius: '999px', background: '#22c55e', color: '#052e16', fontSize: '11px', fontWeight: 800 }}>
                                    CTR Score 94/100
                                </span>
                            </div>
                            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>
                                Scroll-Stopping HD Thumbnail + Shorts
                            </h3>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13.5px', color: '#f3e8ff', lineHeight: 1.7 }}>
                                <li>Crisp 1280×720 YouTube export + instant 9:16 &amp; 4:5 Smart Resize</li>
                                <li>Auto-saved for 7 days in your private Cloud Work Library</li>
                                <li>Bonus: clip your 5GB video into captioned Shorts &amp; Reels</li>
                            </ul>
                        </div>
                        <div style={{ marginTop: '16px' }}>
                            <Link
                                to="/signup"
                                style={{
                                    display: 'block',
                                    textAlign: 'center',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    background: '#ffffff',
                                    color: '#571c86',
                                    fontWeight: 800,
                                    fontSize: '13.5px',
                                    textDecoration: 'none',
                                }}
                            >
                                Create Your First Thumbnail Free →
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
