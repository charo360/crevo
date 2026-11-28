import React, { FC, useState } from 'react';
import { ImageAsset } from '../../types';

interface PreviewModalProps {
    image: ImageAsset;
    onCancel: () => void;
    defaultTitle?: string;
}

interface MockFeedCard {
    id: string;
    title: string;
    channel: string;
    meta: string;
    duration: string;
    bg: string;
    accent: string;
    label: string;
    avatarBg: string;
    avatarLetter: string;
}

const NEIGHBOR_CARDS: MockFeedCard[] = [
    {
        id: 'n1',
        title: 'I Tested Every Creator Camera in 2026 — Clear Winner',
        channel: 'Studio Lab',
        meta: '418K views • 1 day ago',
        duration: '14:22',
        bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)',
        accent: '#38bdf8',
        label: 'GEAR TEST',
        avatarBg: '#0284c7',
        avatarLetter: 'S',
    },
    {
        id: 'n2',
        title: 'Why 90% of Channels Stall at 10,000 Views (Algorithm Fix)',
        channel: 'Creator Playbook',
        meta: '1.2M views • 4 days ago',
        duration: '18:05',
        bg: 'linear-gradient(135deg, #1c1917 0%, #44403c 60%, #78350f 100%)',
        accent: '#fbbf24',
        label: 'THE FIX',
        avatarBg: '#d97706',
        avatarLetter: 'C',
    },
    {
        id: 'n3',
        title: '30 Days Building a One-Person Media Brand From Scratch',
        channel: 'Alex Rivera',
        meta: '264K views • 6 hours ago',
        duration: '11:48',
        bg: 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #0f766e 100%)',
        accent: '#6ee7b7',
        label: 'DAY 30',
        avatarBg: '#059669',
        avatarLetter: 'A',
    },
    {
        id: 'n4',
        title: 'This Simple Lighting Change Made My Videos Look Cinematic',
        channel: 'FrameCraft',
        meta: '89K views • 2 days ago',
        duration: '09:34',
        bg: 'linear-gradient(135deg, #312e81 0%, #4338ca 55%, #6366f1 100%)',
        accent: '#c7d2fe',
        label: 'PRO LOOK',
        avatarBg: '#4f46e5',
        avatarLetter: 'F',
    },
    {
        id: 'n5',
        title: 'How Top Podcasts Turn 1 Episode Into 30 Viral Clips',
        channel: 'Growth Daily',
        meta: '530K views • 1 week ago',
        duration: '16:12',
        bg: 'linear-gradient(135deg, #450a0a 0%, #991b1b 60%, #dc2626 100%)',
        accent: '#fecaca',
        label: '30X CLIPS',
        avatarBg: '#dc2626',
        avatarLetter: 'G',
    },
];

export const PreviewModal: FC<PreviewModalProps> = ({ image, onCancel, defaultTitle }) => {
    const [viewMode, setViewMode] = useState<'full' | 'yt_desktop' | 'yt_mobile'>('yt_desktop');
    const [ytTheme, setYtTheme] = useState<'dark' | 'light'>('dark');
    const [videoTitle, setVideoTitle] = useState(
        defaultTitle?.trim() || 'How I Tripled My Views With One Simple Change'
    );
    const [channelName, setChannelName] = useState('Your Channel');
    const [slotIndex, setSlotIndex] = useState(1);

    const isDark = ytTheme === 'dark';
    const feedBg = isDark ? '#0f0f0f' : '#ffffff';
    const textPrimary = isDark ? '#f1f1f1' : '#0f0f0f';
    const textSecondary = isDark ? '#aaaaaa' : '#606060';
    const chipBg = isDark ? '#272727' : '#f2f2f2';

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = image.url;
        link.download = `crevo-thumbnail-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const renderYourCard = (isMobile = false) => (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                borderRadius: '12px',
                outline: '2px solid rgba(147, 51, 234, 0.7)',
                outlineOffset: '4px',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16 / 9',
                    borderRadius: isMobile ? '10px' : '12px',
                    overflow: 'hidden',
                    background: '#000',
                }}
            >
                <img
                    src={image.url}
                    alt="Your thumbnail in YouTube feed"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <span
                    style={{
                        position: 'absolute',
                        bottom: '6px',
                        right: '6px',
                        background: 'rgba(0,0,0,0.82)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 5px',
                        borderRadius: '4px',
                    }}
                >
                    12:44
                </span>
                <span
                    style={{
                        position: 'absolute',
                        top: '6px',
                        left: '6px',
                        background: 'linear-gradient(135deg, #571c86, #9333ea)',
                        color: '#ffffff',
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: '999px',
                    }}
                >
                    YOUR THUMBNAIL
                </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '0 2px' }}>
                <div
                    style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #571c86, #9333ea)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {(channelName || 'Y').charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            color: textPrimary,
                            fontSize: isMobile ? '14px' : '14.5px',
                            fontWeight: 600,
                            lineHeight: 1.32,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {videoTitle || 'Your Video Title'}
                    </div>
                    <div style={{ color: textSecondary, fontSize: '12px', marginTop: '4px', lineHeight: 1.35 }}>
                        <div>{channelName || 'Your Channel'}</div>
                        <div>124K views • Just now</div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderNeighborCard = (card: MockFeedCard, isMobile = false) => (
        <div key={card.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: 0.92 }}>
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16 / 9',
                    borderRadius: isMobile ? '10px' : '12px',
                    overflow: 'hidden',
                    background: card.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <span
                    style={{
                        fontSize: isMobile ? '22px' : '24px',
                        fontWeight: 900,
                        color: card.accent,
                        letterSpacing: '0.03em',
                        textShadow: '0 4px 16px rgba(0,0,0,0.65)',
                    }}
                >
                    {card.label}
                </span>
                <span
                    style={{
                        position: 'absolute',
                        bottom: '6px',
                        right: '6px',
                        background: 'rgba(0,0,0,0.82)',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 5px',
                        borderRadius: '4px',
                    }}
                >
                    {card.duration}
                </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '0 2px' }}>
                <div
                    style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: card.avatarBg,
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {card.avatarLetter}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            color: textPrimary,
                            fontSize: isMobile ? '14px' : '14px',
                            fontWeight: 600,
                            lineHeight: 1.32,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {card.title}
                    </div>
                    <div style={{ color: textSecondary, fontSize: '12px', marginTop: '4px', lineHeight: 1.35 }}>
                        <div>{card.channel}</div>
                        <div>{card.meta}</div>
                    </div>
                </div>
            </div>
        </div>
    );

    const desktopItems: React.ReactNode[] = [];
    const cardsToShow = NEIGHBOR_CARDS.slice(0, 5);
    cardsToShow.forEach((c, idx) => {
        if (idx === slotIndex) desktopItems.push(<React.Fragment key="yours">{renderYourCard(false)}</React.Fragment>);
        desktopItems.push(renderNeighborCard(c, false));
    });
    if (slotIndex >= cardsToShow.length) {
        desktopItems.push(<React.Fragment key="yours">{renderYourCard(false)}</React.Fragment>);
    }

    return (
        <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 1300 }}>
            <div
                className="preview-modal"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'min(1040px, 96vw)',
                    maxHeight: '92vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderRadius: '18px',
                    background: '#ffffff',
                    color: '#111827',
                    boxShadow: '0 24px 64px rgba(15, 10, 30, 0.35)',
                }}
            >
                {/* Header & Mode Switcher */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        padding: '14px 18px',
                        borderBottom: '1px solid #e5ddf4',
                        background: '#faf8fd',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: '0 8px 0 0', fontSize: '16px', fontWeight: 800 }}>Preview &amp; Feed Test</h3>
                        {[
                            { id: 'yt_desktop', label: '📺 YouTube Desktop' },
                            { id: 'yt_mobile', label: '📱 YouTube Mobile' },
                            { id: 'full', label: '🖼️ Full Image' },
                        ].map((tab) => {
                            const active = viewMode === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setViewMode(tab.id as any)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '999px',
                                        border: active ? 'none' : '1px solid #dfd5f0',
                                        background: active ? 'linear-gradient(135deg, #571c86, #7e22ce)' : '#ffffff',
                                        color: active ? '#ffffff' : '#3b2d52',
                                        fontSize: '12.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {viewMode !== 'full' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setYtTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                                    style={{
                                        padding: '6px 11px',
                                        borderRadius: '8px',
                                        border: '1px solid #dfd5f0',
                                        background: '#ffffff',
                                        color: '#111827',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {isDark ? '☀️ Light' : '🌙 Dark'}
                                </button>
                                {viewMode === 'yt_desktop' && (
                                    <button
                                        type="button"
                                        onClick={() => setSlotIndex((prev) => (prev + 1) % 6)}
                                        style={{
                                            padding: '6px 11px',
                                            borderRadius: '8px',
                                            border: '1px solid #dfd5f0',
                                            background: '#ffffff',
                                            color: '#111827',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        🔀 Shuffle
                                    </button>
                                )}
                            </>
                        )}
                        <button
                            type="button"
                            onClick={handleDownload}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#571c86',
                                color: '#ffffff',
                                fontSize: '12.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            ⬇ Download
                        </button>
                        <button
                            type="button"
                            className="modal-close-btn"
                            onClick={onCancel}
                            aria-label="Close preview"
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: '1px solid #e5e7eb',
                                background: '#ffffff',
                                color: '#374151',
                                fontSize: '20px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            &times;
                        </button>
                    </div>
                </div>

                {/* Editable Title / Channel Test Bar (when in YouTube Feed mode) */}
                {viewMode !== 'full' && (
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '10px',
                            padding: '10px 18px',
                            background: '#ffffff',
                            borderBottom: '1px solid #efe8fa',
                            alignItems: 'center',
                        }}
                    >
                        <input
                            type="text"
                            value={videoTitle}
                            onChange={(e) => setVideoTitle(e.target.value)}
                            placeholder="Test your YouTube video title..."
                            style={{
                                flex: '2 1 240px',
                                padding: '7px 11px',
                                borderRadius: '8px',
                                border: '1px solid #dfd5f0',
                                fontSize: '13px',
                            }}
                        />
                        <input
                            type="text"
                            value={channelName}
                            onChange={(e) => setChannelName(e.target.value)}
                            placeholder="Channel name"
                            style={{
                                flex: '1 1 140px',
                                padding: '7px 11px',
                                borderRadius: '8px',
                                border: '1px solid #dfd5f0',
                                fontSize: '13px',
                            }}
                        />
                    </div>
                )}

                {/* Body */}
                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: viewMode === 'full' ? '18px' : '20px',
                        background: viewMode === 'full' ? '#130e1c' : feedBg,
                    }}
                >
                    {viewMode === 'full' ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
                            <img
                                src={image.url}
                                alt="Full Preview"
                                style={{ maxWidth: '100%', maxHeight: '72vh', borderRadius: '10px', objectFit: 'contain' }}
                            />
                        </div>
                    ) : viewMode === 'yt_desktop' ? (
                        <div>
                            {/* Mock YouTube Category Chips */}
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '18px', paddingBottom: '4px' }}>
                                {['All', 'YouTube Growth', 'Podcasts', 'Tech Reviews', 'Creator Economy', 'Editing'].map((chip, i) => (
                                    <span
                                        key={chip}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            fontSize: '12.5px',
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap',
                                            background: i === 0 ? textPrimary : chipBg,
                                            color: i === 0 ? feedBg : textPrimary,
                                        }}
                                    >
                                        {chip}
                                    </span>
                                ))}
                            </div>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                    gap: '20px 16px',
                                }}
                            >
                                {desktopItems}
                            </div>
                        </div>
                    ) : (
                        /* Mobile YouTube Feed Mockup */
                        <div
                            style={{
                                maxWidth: '375px',
                                margin: '0 auto',
                                borderRadius: '26px',
                                border: isDark ? '6px solid #2a2a2a' : '6px solid #e5e7eb',
                                background: feedBg,
                                overflow: 'hidden',
                                boxShadow: '0 14px 36px rgba(0,0,0,0.35)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 14px',
                                    borderBottom: isDark ? '1px solid #272727' : '1px solid #e5e7eb',
                                    color: textPrimary,
                                    fontWeight: 800,
                                    fontSize: '14px',
                                }}
                            >
                                <span>▶ YouTube Mobile</span>
                                <span style={{ fontSize: '11px', color: textSecondary }}>375px test</span>
                            </div>
                            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {renderYourCard(true)}
                                {renderNeighborCard(NEIGHBOR_CARDS[0], true)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
