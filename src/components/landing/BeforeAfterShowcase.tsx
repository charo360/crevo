import React, { FC, useState } from 'react';
import { Link } from 'react-router-dom';

interface ShowcasePair {
    id: string;
    mode: 'slider' | 'resize';
    label: string;
    niche: string;
    beforeImg: string;
    afterImg: string;
    beforeBadge: string;
    afterBadge: string;
    summary: string;
}

const SHOWCASE_PAIRS: ShowcasePair[] = [
    {
        id: 'improve',
        mode: 'slider',
        label: 'Improve Thumbnail',
        niche: 'Real Crevo AI Output · Improve Thumbnail (16:9)',
        beforeImg: '/showcase/before-improve-real.jpg',
        afterImg: '/showcase/after-improve-real.jpg',
        beforeBadge: 'BEFORE · Original',
        afterBadge: 'AFTER · Crevo AI',
        summary: 'Uploaded directly to Crevo Improve Thumbnail — upgraded contrast, added a glowing diagonal split, cinematic background depth, and bold viral hook text.',
    },
    {
        id: 'resize',
        mode: 'resize',
        label: 'Smart Resize (16:9 → 1:1)',
        niche: 'Real Crevo AI Output · AI Smart Resize (Zero Cropping)',
        beforeImg: '/showcase/resize-16x9.jpg',
        afterImg: '/showcase/resize-1x1.jpg',
        beforeBadge: 'ORIGINAL · 16:9 YouTube',
        afterBadge: 'AI EXPANDED · 1:1 Square',
        summary: 'Crevo AI naturally extends the room, ceiling, and window above the subjects to fit 1:1 Square / Podcast format without cropping a single face or letter.',
    },
    {
        id: 'tech',
        mode: 'slider',
        label: 'Tech Review',
        niche: 'YouTube 16:9 · Raw Webcam → Studio Thumbnail',
        beforeImg: '/showcase/before-tech.jpg',
        afterImg: '/showcase/after-tech.jpg',
        beforeBadge: 'BEFORE · 3.1% CTR',
        afterBadge: 'AFTER · 9.4% CTR',
        summary: 'Same real face & phone — upgraded with purple/cyan rim lighting, bokeh background, and bold hook text in ~25 seconds.',
    },
    {
        id: 'podcast',
        mode: 'slider',
        label: 'Podcast Studio',
        niche: 'YouTube 16:9 · Flat Office Frame → Cinematic Cover',
        beforeImg: '/showcase/before-podcast.jpg',
        afterImg: '/showcase/after-podcast.jpg',
        beforeBadge: 'BEFORE · 2.8% CTR',
        afterBadge: 'AFTER · 8.7% CTR',
        summary: 'Locks exact host identity and mic framing while replacing flat walls with warm studio glow and high-contrast typography.',
    },
];

export const BeforeAfterShowcase: FC = () => {
    const [activePairId, setActivePairId] = useState<string>(SHOWCASE_PAIRS[0].id);
    const [sliderPos, setSliderPos] = useState<number>(48);

    const activePair = SHOWCASE_PAIRS.find((p) => p.id === activePairId) || SHOWCASE_PAIRS[0];

    return (
        <section style={{ padding: '72px 20px', background: '#ffffff' }}>
            <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', maxWidth: '740px', margin: '0 auto 32px' }}>
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
                        DRAG TO COMPARE · REAL BEFORE &amp; AFTER
                    </span>
                    <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(1.75rem, 3.4vw, 2.5rem)', fontWeight: 800, color: '#111827', lineHeight: 1.18 }}>
                        Turn Raw Frames Into Click-Magnet Thumbnails &amp; Resizes
                    </h2>
                    <p style={{ margin: 0, fontSize: '1.02rem', color: '#4b5563', lineHeight: 1.6 }}>
                        Keep your real faces 100% recognizable while Crevo AI upgrades lighting, viral hook typography, and aspect ratios for every platform.
                    </p>
                </div>

                {/* Pair Switcher Pills */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '22px' }}>
                    {SHOWCASE_PAIRS.map((pair) => {
                        const isActive = pair.id === activePair.id;
                        return (
                            <button
                                key={pair.id}
                                type="button"
                                onClick={() => {
                                    setActivePairId(pair.id);
                                    setSliderPos(48);
                                }}
                                style={{
                                    padding: '9px 16px',
                                    borderRadius: '999px',
                                    border: isActive ? '1.5px solid #571c86' : '1px solid #dfd5f0',
                                    background: isActive ? 'linear-gradient(135deg, #571c86, #7e22ce)' : '#faf7ff',
                                    color: isActive ? '#ffffff' : '#3b2d52',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {pair.label}
                            </button>
                        );
                    })}
                </div>

                {/* Main Showcase Grid: Interactive Showcase + Real 9:16 Shorts Covers */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '24px',
                        alignItems: 'stretch',
                    }}
                >
                    {/* Left/Main: Interactive Before & After Slider OR Smart Resize Side-by-Side */}
                    <div
                        style={{
                            borderRadius: '20px',
                            border: '1px solid #e5ddf4',
                            background: '#faf8fd',
                            padding: '16px',
                            boxShadow: '0 14px 36px rgba(45, 16, 84, 0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div>
                            {activePair.mode === 'resize' ? (
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1.15fr 0.85fr',
                                        gap: '12px',
                                        alignItems: 'center',
                                        background: '#130d1e',
                                        borderRadius: '14px',
                                        padding: '14px',
                                    }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <span
                                            style={{
                                                alignSelf: 'flex-start',
                                                padding: '3px 9px',
                                                borderRadius: '999px',
                                                background: 'rgba(255,255,255,0.14)',
                                                color: '#f3f4f6',
                                                fontSize: '10.5px',
                                                fontWeight: 800,
                                            }}
                                        >
                                            {activePair.beforeBadge}
                                        </span>
                                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)', aspectRatio: '16 / 9' }}>
                                            <img
                                                src={activePair.beforeImg}
                                                alt="Original 16:9 YouTube thumbnail"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <span
                                            style={{
                                                alignSelf: 'flex-start',
                                                padding: '3px 9px',
                                                borderRadius: '999px',
                                                background: 'linear-gradient(135deg, #571c86, #9333ea)',
                                                color: '#ffffff',
                                                fontSize: '10.5px',
                                                fontWeight: 800,
                                            }}
                                        >
                                            {activePair.afterBadge}
                                        </span>
                                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #a855f7', aspectRatio: '1 / 1' }}>
                                            <img
                                                src={activePair.afterImg}
                                                alt="AI Smart Resized 1:1 square design"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    style={{
                                        position: 'relative',
                                        width: '100%',
                                        aspectRatio: '16 / 9',
                                        borderRadius: '14px',
                                        overflow: 'hidden',
                                        background: '#0f0d14',
                                        userSelect: 'none',
                                        touchAction: 'pan-y',
                                    }}
                                >
                                    {/* AFTER image (full base layer) */}
                                    <img
                                        src={activePair.afterImg}
                                        alt={`${activePair.label} — After Crevo AI`}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            display: 'block',
                                            pointerEvents: 'none',
                                        }}
                                    />

                                    {/* BEFORE image (clipped dynamically from right) */}
                                    <img
                                        src={activePair.beforeImg}
                                        alt={`${activePair.label} — Before`}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            display: 'block',
                                            clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
                                            pointerEvents: 'none',
                                        }}
                                    />

                                    {/* Divider Line & Drag Knob */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            bottom: 0,
                                            left: `${sliderPos}%`,
                                            width: '3px',
                                            background: '#ffffff',
                                            boxShadow: '0 0 12px rgba(0,0,0,0.45)',
                                            transform: 'translateX(-50%)',
                                            pointerEvents: 'none',
                                            zIndex: 3,
                                        }}
                                    >
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '50%',
                                                background: '#ffffff',
                                                color: '#571c86',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 900,
                                                fontSize: '15px',
                                                boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
                                                border: '2px solid #571c86',
                                            }}
                                        >
                                            ⇄
                                        </div>
                                    </div>

                                    {/* Corner Badges */}
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: '12px',
                                            left: '12px',
                                            padding: '4px 10px',
                                            borderRadius: '999px',
                                            background: 'rgba(15, 13, 20, 0.78)',
                                            color: '#f3f4f6',
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            letterSpacing: '0.04em',
                                            pointerEvents: 'none',
                                            zIndex: 2,
                                        }}
                                    >
                                        {activePair.beforeBadge}
                                    </span>
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: '12px',
                                            right: '12px',
                                            padding: '4px 10px',
                                            borderRadius: '999px',
                                            background: 'linear-gradient(135deg, #571c86, #9333ea)',
                                            color: '#ffffff',
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            letterSpacing: '0.04em',
                                            boxShadow: '0 2px 10px rgba(87,28,134,0.4)',
                                            pointerEvents: 'none',
                                            zIndex: 2,
                                        }}
                                    >
                                        {activePair.afterBadge}
                                    </span>

                                    {/* Full-area accessible range input for effortless mouse + touch drag */}
                                    <input
                                        type="range"
                                        min={5}
                                        max={95}
                                        value={sliderPos}
                                        onChange={(e) => setSliderPos(Number(e.target.value))}
                                        aria-label={`Compare before and after ${activePair.label}`}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: '100%',
                                            height: '100%',
                                            opacity: 0,
                                            cursor: 'ew-resize',
                                            margin: 0,
                                            zIndex: 5,
                                        }}
                                    />
                                </div>
                            )}

                            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#571c86' }}>
                                    {activePair.niche}
                                </span>
                                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>
                                    {activePair.mode === 'resize' ? 'Zero cropping · AI background expand' : '← Drag slider to compare →'}
                                </span>
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '13.5px', color: '#4b5563', lineHeight: 1.55 }}>
                                {activePair.summary}
                            </p>
                        </div>
                    </div>

                    {/* Right Card: Real Crevo 9:16 Shorts & Reels Covers */}
                    <div
                        style={{
                            borderRadius: '20px',
                            border: '1.5px solid #d8ccf0',
                            background: 'linear-gradient(160deg, #210b3b 0%, #4c1d95 55%, #6d28d9 100%)',
                            color: '#ffffff',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: '0 14px 36px rgba(76, 29, 149, 0.22)',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
                                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#facc15', letterSpacing: '0.05em' }}>
                                    MADE WITH CREVO CLIPS → COVER
                                </span>
                                <span style={{ padding: '3px 9px', borderRadius: '999px', background: 'rgba(255,255,255,0.16)', color: '#ffffff', fontSize: '11px', fontWeight: 700 }}>
                                    9:16 HD
                                </span>
                            </div>
                            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                                1-Click Vertical Covers for Shorts, TikTok &amp; Reels
                            </h3>
                            <p style={{ margin: '0 0 16px', fontSize: '13.5px', color: '#e9d5ff', lineHeight: 1.5 }}>
                                Paste a YouTube link to cut 1080p viral clips, then tap <strong>Make Cover Thumbnail</strong> to auto-extract the sharpest face frames and render a matching 9:16 cover.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.22)', aspectRatio: '9 / 16', background: '#0f0d14' }}>
                                    <img
                                        src="/showcase/shorts-cover-1.jpg"
                                        alt="Crevo AI 9:16 vertical Shorts cover example 1"
                                        loading="lazy"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    />
                                </div>
                                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.22)', aspectRatio: '9 / 16', background: '#0f0d14' }}>
                                    <img
                                        src="/showcase/shorts-cover-2.jpg"
                                        alt="Crevo AI 9:16 vertical Shorts cover example 2"
                                        loading="lazy"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <span style={{ fontSize: '12px', color: '#e9d5ff', fontWeight: 600 }}>
                                ✓ 6 free credits · No credit card
                            </span>
                            <Link
                                to="/signup"
                                style={{
                                    padding: '9px 16px',
                                    borderRadius: '10px',
                                    background: '#ffffff',
                                    color: '#4c1d95',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    textDecoration: 'none',
                                }}
                            >
                                Try Studio Free →
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
