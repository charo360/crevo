import React, { FC } from 'react';
import { Link } from 'react-router-dom';

const FREE_TOOLS = [
    {
        icon: '🪄',
        badge: '2 Free Tries',
        title: 'AI Smart Image Resizer',
        desc: 'Expand any photo to 16:9, 9:16, 1:1, or 4:5 with AI background extension — zero cropping or black bars.',
        to: '/tools/image-resizer',
        cta: 'Resize Free →',
    },
    {
        icon: '📝',
        badge: '100% Free',
        title: 'YouTube Transcript & HD Thumbnail',
        desc: 'Extract timestamped transcripts and download full 1280×720 thumbnails from any YouTube video or Short.',
        to: '/tools/youtube-transcript',
        cta: 'Open Tool →',
    },
    {
        icon: '🖼️',
        badge: 'No Signup',
        title: 'YouTube & TikTok Format Resizer',
        desc: 'Convert vertical clips to 1280×720 YouTube thumbnails or wide thumbnails to 9:16 Shorts covers instantly.',
        to: '/tools/youtube-thumbnail-resizer',
        cta: 'Try Resizer →',
    },
];

export const FreeToolsStrip: FC = () => {
    return (
        <section
            style={{
                padding: '48px 20px',
                background: 'linear-gradient(180deg, #faf7ff 0%, #ffffff 100%)',
                borderTop: '1px solid #efe8fa',
                borderBottom: '1px solid #efe8fa',
            }}
        >
            <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '999px',
                            background: '#f3e8ff',
                            color: '#571c86',
                            fontSize: '12px',
                            fontWeight: 700,
                            marginBottom: '8px',
                        }}
                    >
                        TRY INSTANTLY — NO ACCOUNT NEEDED
                    </span>
                    <h2 style={{ margin: 0, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, color: '#111827' }}>
                        Free Creator Tools You Can Use Right Now
                    </h2>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
                        gap: '18px',
                    }}
                >
                    {FREE_TOOLS.map((tool) => (
                        <Link
                            key={tool.to}
                            to={tool.to}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                padding: '20px',
                                borderRadius: '14px',
                                background: '#ffffff',
                                border: '1px solid #e5ddf4',
                                textDecoration: 'none',
                                color: 'inherit',
                                boxShadow: '0 4px 18px rgba(87, 28, 134, 0.05)',
                                transition: 'transform 0.15s ease, border-color 0.15s ease',
                            }}
                        >
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '24px' }}>{tool.icon}</span>
                                    <span
                                        style={{
                                            padding: '3px 10px',
                                            borderRadius: '999px',
                                            background: '#f3e8ff',
                                            color: '#571c86',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {tool.badge}
                                    </span>
                                </div>
                                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                                    {tool.title}
                                </h3>
                                <p style={{ margin: '0 0 14px', fontSize: '13.5px', color: '#4b5563', lineHeight: 1.5 }}>
                                    {tool.desc}
                                </p>
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#571c86' }}>{tool.cta}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
};
