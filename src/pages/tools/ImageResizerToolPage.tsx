import React, { FC, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Navbar } from '../../components/landing/Navbar';
import { Footer } from '../../components/landing/Footer';
import { useAuth } from '../../contexts/AuthContext';
import { getDeviceFingerprint } from '../../lib/deviceFingerprint';

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

function fileToCompressedBase64(file: File): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const maxDim = 1536;
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas unavailable'));
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const base64 = dataUrl.split(',')[1] || '';
            resolve({ base64, mimeType: 'image/jpeg' });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read image file'));
        };
        img.src = url;
    });
}

interface ImageResizerToolPageProps {
    defaultPresetId?: string;
    heading?: string;
    subheading?: string;
}

export const ImageResizerToolPage: FC<ImageResizerToolPageProps> = ({
    defaultPresetId = 'yt_thumb',
    heading = 'AI Smart Image Resizer for YouTube, TikTok & Instagram',
    subheading = 'Resize any thumbnail or photo to 16:9, 9:16, 1:1, or 4:5 — Crevo AI automatically recomposes and extends the background so nothing gets awkwardly cropped.',
}) => {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fingerprint] = useState<string>(() => getDeviceFingerprint());

    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string>('');
    const [sourceName, setSourceName] = useState<string>('image');
    const [selectedPreset, setSelectedPreset] = useState<SizePreset>(
        () => PRESETS.find((p) => p.id === defaultPresetId) || PRESETS[0]
    );

    useEffect(() => {
        const match = PRESETS.find((p) => p.id === defaultPresetId);
        if (match) setSelectedPreset(match);
    }, [defaultPresetId]);

    const [isResizing, setIsResizing] = useState(false);
    const [aiResultUrl, setAiResultUrl] = useState<string>('');
    const [remainingFree, setRemainingFree] = useState<number>(2);
    const [freeLimit, setFreeLimit] = useState<number>(2);
    const [gateReason, setGateReason] = useState<string | null>(null);

    // Fetch real server-side remaining free tries (IP + Fingerprint enforced)
    useEffect(() => {
        fetch('/api/public/trial-status?tool=ai_resize', {
            headers: fingerprint ? { 'X-Client-FP': fingerprint } : undefined,
        })
            .then((r) => r.json())
            .then((data) => {
                if (typeof data?.remaining === 'number') setRemainingFree(data.remaining);
                if (typeof data?.limit === 'number') setFreeLimit(data.limit);
            })
            .catch(() => {});
    }, [fingerprint]);

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
                    name: 'Crevo AI Smart Image Resizer',
                    url: 'https://crevo.app/tools/image-resizer',
                    applicationCategory: 'DesignApplication',
                    operatingSystem: 'Web',
                    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                    description:
                        'AI Smart Image Resizer that recomposes and extends backgrounds to fit YouTube (16:9), Shorts/TikTok/Reels (9:16), Instagram (1:1 & 4:5), X/Twitter, and Podcast covers without cropping subjects.',
                },
                {
                    '@type': 'FAQPage',
                    mainEntity: [
                        {
                            '@type': 'Question',
                            name: 'How does Crevo AI Smart Resize work?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Unlike standard crop tools that cut off faces or text, Crevo AI Smart Resize intelligently recomposes your image and extends the background naturally to fit 16:9, 9:16, 1:1, or 4:5 frames.',
                            },
                        },
                        {
                            '@type': 'Question',
                            name: 'Can I test Crevo AI Image Resizer for free?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Yes. Every visitor can test 2 free AI Smart Resizes directly at crevo.app/tools/image-resizer with no signup required, then create an account for full studio access.',
                            },
                        },
                        {
                            '@type': 'Question',
                            name: 'What is the best size for YouTube thumbnails and TikTok/Shorts covers?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Use 1280x720 (16:9) for YouTube thumbnails and 1080x1920 (9:16) for TikTok, YouTube Shorts, and Instagram Reels covers.',
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

    const handleFile = (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please upload a PNG, JPG, or WebP image.');
            return;
        }
        if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
        setSourceFile(file);
        setSourcePreviewUrl(URL.createObjectURL(file));
        setSourceName(file.name.replace(/\.[^.]+$/, ''));
        setAiResultUrl('');
    };

    const handleAiSmartResize = async () => {
        if (!sourceFile) {
            toast.error('Please upload an image first.');
            return;
        }

        if (remainingFree <= 0) {
            setGateReason('You have used your 2 free AI Smart Resizes on this device/network. Sign in or create a Crevo account to keep resizing in Crevo Studio!');
            return;
        }

        setIsResizing(true);
        setAiResultUrl('');
        try {
            const { base64, mimeType } = await fileToCompressedBase64(sourceFile);
            const res = await fetch('/api/public/ai-resize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(fingerprint ? { 'X-Client-FP': fingerprint } : {}),
                },
                body: JSON.stringify({
                    imageBase64: base64,
                    mimeType,
                    aspectRatio: selectedPreset.ratio,
                    targetLabel: `${selectedPreset.label} (${selectedPreset.width}x${selectedPreset.height})`,
                }),
            });

            const data = await res.json();
            if (res.status === 429 || data?.code === 'FREE_TRIAL_LIMIT_REACHED') {
                setRemainingFree(0);
                setGateReason(
                    data?.error ||
                        'You have used your 2 free AI Smart Resizes. Sign in or create a Crevo account to continue!'
                );
                return;
            }
            if (!res.ok) {
                throw new Error(data?.error || 'AI Smart Resize failed');
            }

            setAiResultUrl(data.imageDataUrl);
            if (typeof data.remaining === 'number') setRemainingFree(data.remaining);
            toast.success(`AI Smart Resized to ${selectedPreset.label} (${selectedPreset.ratio})!`);
        } catch (err: any) {
            toast.error(err?.message || 'Could not resize image. Please try again.');
        } finally {
            setIsResizing(false);
        }
    };

    const handleDownloadResult = () => {
        if (!aiResultUrl) return;
        const link = document.createElement('a');
        link.href = aiResultUrl;
        link.download = `crevo-ai-${sourceName}-${selectedPreset.ratio.replace(':', 'x')}.png`;
        link.click();
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
                            background: remainingFree > 0 ? '#f3e8ff' : '#fee2e2',
                            color: remainingFree > 0 ? '#571c86' : '#b91c1c',
                            fontWeight: 700,
                            fontSize: '12px',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            marginBottom: '12px',
                        }}
                    >
                        {remainingFree > 0
                            ? `${remainingFree} of ${freeLimit} Free AI Smart Resizes Left — No Login Needed`
                            : 'Free Trial Complete — Sign In for Crevo Studio'}
                    </span>
                    <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: '#111827', margin: '0 0 12px', lineHeight: 1.15 }}>
                        {heading}
                    </h1>
                    <p style={{ fontSize: '1.05rem', color: '#4b5563', maxWidth: '700px', margin: '0 auto' }}>
                        {subheading}
                    </p>
                </div>

                {/* Live AI Smart Resizer Card */}
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
                    {!sourcePreviewUrl ? (
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
                            <div style={{ fontSize: '38px', marginBottom: '10px' }}>✨</div>
                            <p style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
                                Click to upload or drag &amp; drop an image
                            </p>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                                PNG, JPG, or WebP — try {freeLimit} real AI Smart Resizes free before signing up
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
                            {/* Left: Controls */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: '#faf8ff', borderRadius: '12px', border: '1px solid #e9e0f7' }}>
                                    <img
                                        src={sourcePreviewUrl}
                                        alt="Uploaded source"
                                        style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', background: '#111' }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {sourceFile?.name}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            style={{ marginTop: '4px', background: 'none', border: 'none', padding: 0, color: '#571c86', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                                        >
                                            Change Image
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 10px', color: '#111827' }}>Choose Target Platform Size</h2>
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

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button
                                        type="button"
                                        disabled={isResizing}
                                        onClick={handleAiSmartResize}
                                        style={{
                                            padding: '14px 18px',
                                            borderRadius: '12px',
                                            border: 'none',
                                            background: remainingFree > 0 ? 'linear-gradient(135deg, #571c86, #7e22ce)' : '#374151',
                                            color: '#ffffff',
                                            fontWeight: 700,
                                            fontSize: '15px',
                                            cursor: isResizing ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {isResizing
                                            ? `AI Smart Resizing to ${selectedPreset.ratio}...`
                                            : remainingFree > 0
                                              ? `AI Smart Resize to ${selectedPreset.ratio} (${remainingFree} Free Left)`
                                              : 'Free Limit Reached — Sign In to Continue'}
                                    </button>
                                    {user && (
                                        <Link
                                            to="/dashboard/resize"
                                            style={{
                                                textAlign: 'center',
                                                padding: '11px 16px',
                                                borderRadius: '12px',
                                                border: '1px solid #d8ccf0',
                                                background: '#faf8ff',
                                                color: '#571c86',
                                                fontWeight: 700,
                                                fontSize: '13px',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            Open Full Smart Resize in Crevo Studio →
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {/* Right: Result Preview */}
                            <div
                                style={{
                                    background: '#0f0f17',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    minHeight: '300px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                }}
                            >
                                {isResizing ? (
                                    <div style={{ textAlign: 'center', color: '#e9d5ff' }}>
                                        <div className="spinner" style={{ width: '36px', height: '36px', margin: '0 auto 12px', borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#a855f7' }} />
                                        <div style={{ fontWeight: 700, fontSize: '15px' }}>AI is recomposing your image...</div>
                                        <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>
                                            Extending background naturally to {selectedPreset.label} ({selectedPreset.ratio})
                                        </div>
                                    </div>
                                ) : aiResultUrl ? (
                                    <>
                                        <span style={{ color: '#e5e7eb', fontSize: '12px', fontWeight: 600 }}>
                                            AI Smart Resized — {selectedPreset.label} ({selectedPreset.ratio})
                                        </span>
                                        <img
                                            src={aiResultUrl}
                                            alt="AI Smart Resized result"
                                            style={{ maxWidth: '100%', maxHeight: '380px', borderRadius: '8px', display: 'block' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleDownloadResult}
                                            style={{
                                                padding: '10px 20px',
                                                borderRadius: '10px',
                                                border: 'none',
                                                background: '#ffffff',
                                                color: '#4c1d95',
                                                fontWeight: 700,
                                                fontSize: '14px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Download HD PNG
                                        </button>
                                    </>
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#9ca3af', padding: '16px' }}>
                                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🪄</div>
                                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e5e7eb' }}>Ready for AI Smart Resize</div>
                                        <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                            Pick a platform size on the left and click <strong>AI Smart Resize</strong> to see your full-frame result.
                                        </div>
                                    </div>
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
                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f3f4f6', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#4b5563' }}>More Free Creator Tools:</span>
                        <Link to="/tools/youtube-thumbnail-resizer" style={{ fontSize: '13px', color: '#571c86', fontWeight: 600 }}>YouTube Thumbnail Resizer (1280×720)</Link>
                        <Link to="/tools/tiktok-image-resizer" style={{ fontSize: '13px', color: '#571c86', fontWeight: 600 }}>TikTok &amp; Shorts 9:16 Resizer</Link>
                        <Link to="/tools/instagram-image-resizer" style={{ fontSize: '13px', color: '#571c86', fontWeight: 600 }}>Instagram 4:5 &amp; 1:1 Resizer</Link>
                        <Link to="/tools/youtube-transcript" style={{ fontSize: '13px', color: '#571c86', fontWeight: 600 }}>Free YouTube Transcript &amp; Thumb Downloader</Link>
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
                        <div style={{ fontSize: '32px', marginBottom: '10px' }}>🔒</div>
                        <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 10px', color: '#111827' }}>Free Trial Complete</h3>
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
                                Create Crevo Account →
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
