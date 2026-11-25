import React, { FC, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Navbar } from '../../components/landing/Navbar';
import { Footer } from '../../components/landing/Footer';
import { useAuth } from '../../contexts/AuthContext';

interface SizePreset {
    id: string;
    label: string;
    platform: string;
    width: number;
    height: number;
    ratio: string;
}

const PRESETS: SizePreset[] = [
    { id: 'yt_thumb', label: 'YouTube Thumbnail', platform: 'YouTube', width: 1280, height: 720, ratio: '16:9' },
    { id: 'vertical', label: 'Shorts / TikTok / Reels', platform: 'Short-Form Video', width: 1080, height: 1920, ratio: '9:16' },
    { id: 'ig_square', label: 'Instagram Square', platform: 'Instagram', width: 1080, height: 1080, ratio: '1:1' },
    { id: 'ig_portrait', label: 'Instagram Portrait', platform: 'Instagram', width: 1080, height: 1350, ratio: '4:5' },
    { id: 'twitter', label: 'X / Twitter Card', platform: 'X / Twitter', width: 1200, height: 628, ratio: '1.91:1' },
    { id: 'podcast', label: 'Podcast Cover Art', platform: 'Spotify / Apple', width: 1400, height: 1400, ratio: '1:1' },
];

const FREE_LIMIT = 1;
const STORAGE_KEY = 'crevo.free.resize_uses';

export const ImageResizerToolPage: FC = () => {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [sourceUrl, setSourceUrl] = useState<string>('');
    const [sourceName, setSourceName] = useState<string>('image');
    const [selectedPreset, setSelectedPreset] = useState<SizePreset>(PRESETS[0]);
    const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
    const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
    const [gateReason, setGateReason] = useState<string | null>(null);

    // Inject WebApplication + FAQPage JSON-LD for Google & AI Search Engines
    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'crevo-resizer-tool-schema';
        script.text = JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'WebApplication',
                    name: 'Crevo AI Free Social Media Image Resizer',
                    url: 'https://crevo.app/tools/image-resizer',
                    applicationCategory: 'DesignApplication',
                    operatingSystem: 'Web',
                    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                    description:
                        'Resize images instantly for YouTube thumbnails (1280x720), TikTok & Shorts (1080x1920), Instagram (1080x1080, 1080x1350), Twitter/X, and Podcast covers.',
                },
                {
                    '@type': 'FAQPage',
                    mainEntity: [
                        {
                            '@type': 'Question',
                            name: 'What is the best size for a YouTube thumbnail?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'The recommended YouTube thumbnail size is 1280x720 pixels (16:9 aspect ratio) in JPG or PNG format under 2MB.',
                            },
                        },
                        {
                            '@type': 'Question',
                            name: 'What size should I use for TikTok, YouTube Shorts, and Instagram Reels covers?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Use 1080x1920 pixels (9:16 vertical aspect ratio) for crisp full-screen TikTok, YouTube Shorts, and Instagram Reels covers.',
                            },
                        },
                        {
                            '@type': 'Question',
                            name: 'Can Crevo resize images without cropping out important parts?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Yes. Use Contain mode in the free resizer or sign in free to Crevo Studio to use AI Smart Resize, which intelligently extends backgrounds to fit any aspect ratio.',
                            },
                        },
                    ],
                },
            ],
        });
        document.head.appendChild(script);
        return () => {
            document.getElementById('crevo-resizer-tool-schema')?.remove();
        };
    }, []);

    // Render live resized preview on an offscreen canvas whenever image/preset/fit changes
    useEffect(() => {
        if (!sourceUrl) {
            setPreviewDataUrl('');
            return;
        }
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = selectedPreset.width;
            canvas.height = selectedPreset.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            ctx.fillStyle = '#0f0f17';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const scale =
                fitMode === 'cover'
                    ? Math.max(canvas.width / img.width, canvas.height / img.height)
                    : Math.min(canvas.width / img.width, canvas.height / img.height);
            const drawW = img.width * scale;
            const drawH = img.height * scale;
            const dx = (canvas.width - drawW) / 2;
            const dy = (canvas.height - drawH) / 2;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, dx, dy, drawW, drawH);

            setPreviewDataUrl(canvas.toDataURL('image/png'));
        };
        img.src = sourceUrl;
    }, [sourceUrl, selectedPreset, fitMode]);

    const handleFile = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please upload a PNG, JPG, or WebP image.');
            return;
        }
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        setSourceUrl(URL.createObjectURL(file));
        setSourceName(file.name.replace(/\.[^.]+$/, ''));
    };

    const getFreeUses = () => {
        try {
            return Number(localStorage.getItem(STORAGE_KEY) || '0');
        } catch {
            return 0;
        }
    };

    const handleDownload = () => {
        if (!previewDataUrl) return;
        if (!user && getFreeUses() >= FREE_LIMIT) {
            setGateReason('You used your free trial resize. Create a free Crevo AI account for unlimited resizing, batch exports, and AI Smart Expand!');
            return;
        }
        if (!user) {
            try {
                localStorage.setItem(STORAGE_KEY, String(getFreeUses() + 1));
            } catch {
                // ignore
            }
        }
        const link = document.createElement('a');
        link.href = previewDataUrl;
        link.download = `${sourceName}-${selectedPreset.width}x${selectedPreset.height}.png`;
        link.click();
        toast.success(`Downloaded ${selectedPreset.width}×${selectedPreset.height} PNG!`);
    };

    return (
        <div className="landing-page">
            <Navbar />
            <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '6.5rem 1.5rem 4rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '6px 14px',
                            borderRadius: '999px',
                            background: '#f3e8ff',
                            color: '#571c86',
                            fontWeight: 700,
                            fontSize: '12px',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            marginBottom: '12px',
                        }}
                    >
                        Free Creator Tool — Instant Browser Resize
                    </span>
                    <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: '#111827', margin: '0 0 12px', lineHeight: 1.15 }}>
                        Free Image Resizer for YouTube, TikTok &amp; Instagram
                    </h1>
                    <p style={{ fontSize: '1.05rem', color: '#4b5563', maxWidth: '680px', margin: '0 auto' }}>
                        Resize any image to exact creator dimensions in seconds — 1280×720 YouTube thumbnails, 1080×1920 Shorts &amp; Reels, Instagram 1:1 &amp; 4:5, and more.
                    </p>
                </div>

                {/* Live Resizer Card */}
                <div
                    style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '18px',
                        padding: '24px',
                        boxShadow: '0 12px 32px rgba(87, 28, 134, 0.08)',
                        marginBottom: '3rem',
                    }}
                >
                    {!sourceUrl ? (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                handleFile(e.dataTransfer.files?.[0]);
                            }}
                            style={{
                                border: '2px dashed #d8ccf0',
                                borderRadius: '14px',
                                padding: '3rem 1.5rem',
                                textAlign: 'center',
                                background: '#faf8ff',
                                cursor: 'pointer',
                            }}
                        >
                            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🖼️</div>
                            <p style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
                                Click to upload or drag &amp; drop an image
                            </p>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                                PNG, JPG, or WebP — resized instantly right in your browser
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '24px', alignItems: 'start' }}>
                            {/* Left: Preset Picker */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: '#111827' }}>1. Choose Platform Size</h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        {PRESETS.map((p) => {
                                            const active = p.id === selectedPreset.id;
                                            return (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => setSelectedPreset(p)}
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '10px 12px',
                                                        borderRadius: '10px',
                                                        border: active ? '2px solid #571c86' : '1px solid #e5e7eb',
                                                        background: active ? '#f5eeff' : '#ffffff',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827' }}>{p.label}</div>
                                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                                        {p.width}×{p.height} ({p.ratio})
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>2. Fit Mode</h2>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setFitMode('cover')}
                                            style={{
                                                flex: 1,
                                                padding: '9px 12px',
                                                borderRadius: '10px',
                                                border: fitMode === 'cover' ? '2px solid #571c86' : '1px solid #e5e7eb',
                                                background: fitMode === 'cover' ? '#f5eeff' : '#ffffff',
                                                fontWeight: 600,
                                                fontSize: '13px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Fill &amp; Center Crop
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFitMode('contain')}
                                            style={{
                                                flex: 1,
                                                padding: '9px 12px',
                                                borderRadius: '10px',
                                                border: fitMode === 'contain' ? '2px solid #571c86' : '1px solid #e5e7eb',
                                                background: fitMode === 'contain' ? '#f5eeff' : '#ffffff',
                                                fontWeight: 600,
                                                fontSize: '13px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Fit Whole Image
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={handleDownload}
                                        style={{
                                            padding: '13px 18px',
                                            borderRadius: '12px',
                                            border: 'none',
                                            background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                            color: '#ffffff',
                                            fontWeight: 700,
                                            fontSize: '15px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Download {selectedPreset.width}×{selectedPreset.height} PNG
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            user
                                                ? (window.location.href = '/dashboard/resize')
                                                : setGateReason('Sign up free to use AI Smart Resize — intelligently expands your background to any ratio without cropping!')
                                        }
                                        style={{
                                            padding: '11px 18px',
                                            borderRadius: '12px',
                                            border: '1px solid #d8ccf0',
                                            background: '#faf8ff',
                                            color: '#571c86',
                                            fontWeight: 700,
                                            fontSize: '14px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        AI Smart Expand (No Cropping) ✨
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            padding: '9px 14px',
                                            borderRadius: '10px',
                                            border: '1px solid #e5e7eb',
                                            background: '#ffffff',
                                            color: '#4b5563',
                                            fontWeight: 600,
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Upload Different Image
                                    </button>
                                </div>
                            </div>

                            {/* Right: Live Preview */}
                            <div
                                style={{
                                    background: '#0f0f17',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '10px',
                                }}
                            >
                                <span style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: 600 }}>
                                    Live Preview — {selectedPreset.label} ({selectedPreset.width}×{selectedPreset.height})
                                </span>
                                {previewDataUrl && (
                                    <img
                                        src={previewDataUrl}
                                        alt="Resized preview"
                                        style={{ maxWidth: '100%', maxHeight: '380px', borderRadius: '8px', display: 'block' }}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFile(e.target.files?.[0])}
                        style={{ display: 'none' }}
                    />
                </div>

                {/* AI-Citable 2026 Social Media Size Guide */}
                <section style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '24px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 14px', color: '#111827' }}>
                        2026 Social Media &amp; Creator Image Size Guide
                    </h2>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={{ padding: '10px 12px' }}>Format</th>
                                    <th style={{ padding: '10px 12px' }}>Platform</th>
                                    <th style={{ padding: '10px 12px' }}>Dimensions (px)</th>
                                    <th style={{ padding: '10px 12px' }}>Aspect Ratio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PRESETS.map((p) => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.label}</td>
                                        <td style={{ padding: '10px 12px', color: '#4b5563' }}>{p.platform}</td>
                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{p.width} × {p.height}</td>
                                        <td style={{ padding: '10px 12px', color: '#571c86', fontWeight: 600 }}>{p.ratio}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>

            {/* Conversion Gate Modal */}
            {gateReason && (
                <div
                    onClick={() => setGateReason(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(17, 17, 27, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        zIndex: 10000,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#ffffff',
                            borderRadius: '18px',
                            maxWidth: '440px',
                            width: '100%',
                            padding: '28px',
                            textAlign: 'center',
                            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
                        }}
                    >
                        <div style={{ fontSize: '32px', marginBottom: '10px' }}>✨</div>
                        <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 10px', color: '#111827' }}>Unlock Unlimited Crevo AI</h3>
                        <p style={{ fontSize: '14px', color: '#4b5563', margin: '0 0 22px', lineHeight: 1.5 }}>{gateReason}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <Link
                                to="/signup"
                                style={{
                                    padding: '13px 20px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                }}
                            >
                                Create Free Account →
                            </Link>
                            <Link
                                to="/login"
                                style={{
                                    padding: '11px 20px',
                                    borderRadius: '12px',
                                    border: '1px solid #d8ccf0',
                                    color: '#571c86',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                }}
                            >
                                Already have an account? Sign In
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
};
