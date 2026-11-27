import React, { FC, useState } from 'react';
import { Link } from 'react-router-dom';

interface DemoVideo {
    id: string;
    tabLabel: string;
    badge: string;
    caption: string;
}

const DEMO_VIDEOS: DemoVideo[] = [
    {
        id: 'LEIiq84GFk4',
        tabLabel: 'Live Demo 1',
        badge: 'Crevo Studio Walkthrough',
        caption: 'Watch how Crevo AI upgrades thumbnails and creates high-CTR designs in seconds.',
    },
    {
        id: 'jT35GKkwts0',
        tabLabel: 'Live Demo 2',
        badge: 'Second Live Example',
        caption: 'See a second real walkthrough using the same studio workflow from start to finish.',
    },
];

export const ProductDemo: FC = () => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    const activeVideo = DEMO_VIDEOS[activeIndex] || DEMO_VIDEOS[0];

    const handleSelectVideo = (index: number) => {
        setActiveIndex(index);
        setIsPlaying(true);
    };

    return (
        <section
            id="demo"
            style={{
                padding: '28px 20px 64px',
                background: 'linear-gradient(180deg, #ffffff 0%, #faf7ff 100%)',
            }}
        >
            <div style={{ maxWidth: '960px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '22px' }}>
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
                            marginBottom: '10px',
                        }}
                    >
                        WATCH CREVO AI IN ACTION
                    </span>
                    <h2
                        style={{
                            margin: '0 0 8px',
                            fontSize: 'clamp(1.45rem, 3vw, 2.05rem)',
                            fontWeight: 800,
                            color: '#111827',
                        }}
                    >
                        See How Fast It Works — Real Live Demos
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.98rem', color: '#4b5563' }}>
                        {activeVideo.caption}
                    </p>
                </div>

                {/* Demo Switcher Pills */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
                    {DEMO_VIDEOS.map((video, idx) => {
                        const active = idx === activeIndex;
                        return (
                            <button
                                key={video.id}
                                type="button"
                                onClick={() => handleSelectVideo(idx)}
                                style={{
                                    padding: '8px 18px',
                                    borderRadius: '999px',
                                    border: active ? '1.5px solid #571c86' : '1px solid #dfd5f0',
                                    background: active ? 'linear-gradient(135deg, #571c86, #7e22ce)' : '#ffffff',
                                    color: active ? '#ffffff' : '#3b2d52',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                ▶ {video.tabLabel}
                            </button>
                        );
                    })}
                </div>

                {/* Sleek Browser Window Mockup Frame */}
                <div
                    style={{
                        borderRadius: '20px',
                        padding: '10px',
                        background: 'linear-gradient(135deg, rgba(87, 28, 134, 0.18), rgba(147, 51, 234, 0.14), rgba(250, 204, 21, 0.14))',
                        boxShadow: '0 24px 60px rgba(45, 16, 84, 0.16)',
                    }}
                >
                    <div
                        style={{
                            borderRadius: '14px',
                            overflow: 'hidden',
                            background: '#0f0a1a',
                            border: '1px solid rgba(255, 255, 255, 0.14)',
                        }}
                    >
                        {/* Browser Top Bar */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                background: '#191228',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                gap: '10px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                            </div>
                            <div
                                style={{
                                    padding: '3px 14px',
                                    borderRadius: '999px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    color: '#d8ccf0',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                }}
                            >
                                crevo.app/dashboard
                            </div>
                            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#facc15' }}>
                                {activeVideo.badge}
                            </span>
                        </div>

                        {/* 16:9 Responsive Video Area */}
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#090610' }}>
                            {isPlaying ? (
                                <iframe
                                    key={activeVideo.id}
                                    src={`https://www.youtube-nocookie.com/embed/${activeVideo.id}?autoplay=1&rel=0&modestbranding=1`}
                                    title={`Crevo AI ${activeVideo.tabLabel}`}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: '100%',
                                        height: '100%',
                                        border: 'none',
                                    }}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsPlaying(true)}
                                    aria-label={`Play ${activeVideo.tabLabel}`}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: '100%',
                                        height: '100%',
                                        padding: 0,
                                        border: 'none',
                                        background: '#0f0a1a',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <img
                                        src={`https://i.ytimg.com/vi/${activeVideo.id}/hqdefault.jpg`}
                                        alt={`Crevo AI ${activeVideo.tabLabel} preview`}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            opacity: 0.88,
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'linear-gradient(180deg, rgba(15,10,26,0.18) 0%, rgba(15,10,26,0.52) 100%)',
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: 'relative',
                                            zIndex: 2,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '12px',
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '74px',
                                                height: '74px',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #571c86, #9333ea)',
                                                color: '#ffffff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 10px 30px rgba(147, 51, 234, 0.55)',
                                                border: '3px solid rgba(255, 255, 255, 0.85)',
                                            }}
                                        >
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}>
                                                <path d="M8 5v14l11-7z" />
                                            </svg>
                                        </div>
                                        <span
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '999px',
                                                background: 'rgba(15, 10, 26, 0.82)',
                                                color: '#ffffff',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                border: '1px solid rgba(255,255,255,0.2)',
                                            }}
                                        >
                                            Watch {activeVideo.tabLabel}
                                        </span>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Quick Bottom CTA */}
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <Link
                        to="/signup"
                        style={{
                            display: 'inline-block',
                            padding: '10px 22px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                            color: '#ffffff',
                            fontSize: '14px',
                            fontWeight: 700,
                            textDecoration: 'none',
                            boxShadow: '0 6px 18px rgba(87, 28, 134, 0.25)',
                        }}
                    >
                        Try It Yourself Free (6 Credits) →
                    </Link>
                </div>
            </div>
        </section>
    );
};
