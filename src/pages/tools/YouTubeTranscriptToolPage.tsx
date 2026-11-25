import React, { FC, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Navbar } from '../../components/landing/Navbar';
import { Footer } from '../../components/landing/Footer';
import { useAuth } from '../../contexts/AuthContext';

interface TranscriptSegment {
    seconds: number;
    time: string;
    text: string;
}

const FREE_LIMIT = 1;
const STORAGE_KEY = 'crevo.free.yt_uses';

function extractVideoId(input: string): string | null {
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /[?&]v=([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
        const m = trimmed.match(p);
        if (m) return m[1];
    }
    return null;
}

export const YouTubeTranscriptToolPage: FC = () => {
    const { user } = useAuth();
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [videoId, setVideoId] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<string>('');
    const [timestamped, setTimestamped] = useState<string>('');
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [showTimestamps, setShowTimestamps] = useState(true);
    const [gateReason, setGateReason] = useState<string | null>(null);

    // Inject FAQPage + WebApplication JSON-LD for Google & AI Search engines
    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'crevo-yt-tool-schema';
        script.text = JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
                {
                    '@type': 'WebApplication',
                    name: 'Crevo AI Free YouTube Transcript & Thumbnail Downloader',
                    url: 'https://crevo.app/tools/youtube-transcript',
                    applicationCategory: 'MultimediaApplication',
                    operatingSystem: 'Web',
                    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                    description:
                        'Extract timestamped YouTube video transcripts and download HD 1280x720 YouTube thumbnails for free online.',
                },
                {
                    '@type': 'FAQPage',
                    mainEntity: [
                        {
                            '@type': 'Question',
                            name: 'How do I get a YouTube video transcript for free?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Paste any YouTube video or Shorts URL into Crevo AI at crevo.app/tools/youtube-transcript and click Extract. You instantly get the full timestamped transcript and HD thumbnail.',
                            },
                        },
                        {
                            '@type': 'Question',
                            name: 'Can I download YouTube thumbnails in full HD?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Yes. Crevo extracts the highest available thumbnail resolution (up to 1280x720 maxresdefault) and lets you download it or upgrade it with AI.',
                            },
                        },
                        {
                            '@type': 'Question',
                            name: 'Can Crevo summarize a YouTube transcript or generate viral titles?',
                            acceptedAnswer: {
                                '@type': 'Answer',
                                text: 'Yes. Sign in free to Crevo Studio to generate AI video summaries, viral hook titles, and high-CTR thumbnail redesigns from any YouTube transcript.',
                            },
                        },
                    ],
                },
            ],
        });
        document.head.appendChild(script);
        return () => {
            document.getElementById('crevo-yt-tool-schema')?.remove();
        };
    }, []);

    const getFreeUses = () => {
        try {
            return Number(localStorage.getItem(STORAGE_KEY) || '0');
        } catch {
            return 0;
        }
    };

    const incrementFreeUses = () => {
        try {
            localStorage.setItem(STORAGE_KEY, String(getFreeUses() + 1));
        } catch {
            // ignore
        }
    };

    const requireFreeGateOrRun = (reason: string, action: () => void) => {
        if (user) {
            action();
            return;
        }
        if (getFreeUses() >= FREE_LIMIT) {
            setGateReason(reason);
            return;
        }
        incrementFreeUses();
        action();
    };

    const handleExtract = async (e: React.FormEvent) => {
        e.preventDefault();
        const id = extractVideoId(url);
        if (!id) {
            toast.error('Please enter a valid YouTube video or Shorts URL.');
            return;
        }
        setLoading(true);
        setVideoId(id);
        setTranscript('');
        setTimestamped('');
        setSegments([]);
        try {
            const res = await fetch(`/api/youtube/transcript?url=${encodeURIComponent(url.trim())}`);
            const data = await res.json();
            if (data?.transcript) {
                setTranscript(data.transcript);
                setTimestamped(data.timestampedTranscript || data.transcript);
                setSegments(Array.isArray(data.segments) ? data.segments : []);
                toast.success('Transcript & HD thumbnail loaded!');
            } else {
                toast.info('Thumbnail loaded! This video does not have public captions available.');
            }
        } catch {
            toast.error('Could not fetch transcript. Please try another YouTube link.');
        } finally {
            setLoading(false);
        }
    };

    const activeText = showTimestamps ? timestamped || transcript : transcript;

    const handleCopy = () => {
        if (!activeText) return;
        requireFreeGateOrRun('You used your free trial copy. Create a free Crevo AI account for unlimited transcripts, AI summaries, and viral titles.', () => {
            navigator.clipboard.writeText(activeText);
            toast.success('Transcript copied to clipboard!');
        });
    };

    const handleDownloadTxt = () => {
        if (!activeText || !videoId) return;
        requireFreeGateOrRun('You used your free trial download. Create a free Crevo AI account for unlimited transcript downloads and AI summaries.', () => {
            const blob = new Blob([activeText], { type: 'text/plain;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `crevo-transcript-${videoId}.txt`;
            link.click();
            URL.revokeObjectURL(link.href);
        });
    };

    const handleDownloadThumb = async () => {
        if (!videoId) return;
        requireFreeGateOrRun('Create a free Crevo AI account for unlimited HD thumbnail downloads and AI CTR improvements.', async () => {
            try {
                const target = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
                const res = await fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
                const blob = await res.blob();
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `youtube-thumbnail-${videoId}.jpg`;
                link.click();
                URL.revokeObjectURL(link.href);
            } catch {
                toast.error('Failed to download thumbnail.');
            }
        });
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
                        Free Creator Tool — No Login Needed to Try
                    </span>
                    <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, color: '#111827', margin: '0 0 12px', lineHeight: 1.15 }}>
                        Free YouTube Transcript &amp; Thumbnail Downloader
                    </h1>
                    <p style={{ fontSize: '1.05rem', color: '#4b5563', maxWidth: '680px', margin: '0 auto' }}>
                        Paste any YouTube video or Shorts URL to instantly extract the timestamped transcript and full HD thumbnail.
                    </p>
                </div>

                {/* Live Tool Card */}
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
                    <form onSubmit={handleExtract} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                        <input
                            type="url"
                            required
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            style={{
                                flex: 1,
                                minWidth: '240px',
                                padding: '14px 16px',
                                borderRadius: '12px',
                                border: '1px solid #d1d5db',
                                fontSize: '15px',
                                outline: 'none',
                            }}
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                padding: '14px 26px',
                                borderRadius: '12px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '15px',
                                cursor: loading ? 'wait' : 'pointer',
                            }}
                        >
                            {loading ? 'Extracting...' : 'Extract Free'}
                        </button>
                    </form>

                    {videoId && (
                        <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '20px' }}>
                            {/* Thumbnail Panel */}
                            <div style={{ background: '#faf8ff', border: '1px solid #e9e0f7', borderRadius: '14px', padding: '16px' }}>
                                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 12px', color: '#111827' }}>HD Thumbnail (1280×720)</h2>
                                <img
                                    src={`/api/proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`)}`}
                                    onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = `/api/proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)}`;
                                    }}
                                    alt="YouTube video thumbnail"
                                    style={{ width: '100%', borderRadius: '10px', aspectRatio: '16/9', objectFit: 'cover', background: '#111' }}
                                />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={handleDownloadThumb}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: '1px solid #d8ccf0',
                                            background: '#ffffff',
                                            color: '#571c86',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Download HD
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            user
                                                ? (window.location.href = '/dashboard/youtube-improve')
                                                : setGateReason('Create a free Crevo AI account to analyze and upgrade this thumbnail with AI CTR scoring.')
                                        }
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: '#571c86',
                                            color: '#ffffff',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Improve with AI ✨
                                    </button>
                                </div>
                            </div>

                            {/* Transcript Panel */}
                            <div style={{ background: '#faf8ff', border: '1px solid #e9e0f7', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
                                    <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#111827' }}>
                                        Transcript {segments.length > 0 ? `(${segments.length} lines)` : ''}
                                    </h2>
                                    <label style={{ fontSize: '13px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={showTimestamps} onChange={(e) => setShowTimestamps(e.target.checked)} />
                                        Timestamps
                                    </label>
                                </div>
                                <textarea
                                    readOnly
                                    value={activeText || 'No public captions found for this video.'}
                                    style={{
                                        width: '100%',
                                        minHeight: '200px',
                                        flex: 1,
                                        padding: '12px',
                                        borderRadius: '10px',
                                        border: '1px solid #e5e7eb',
                                        background: '#ffffff',
                                        fontSize: '13px',
                                        lineHeight: 1.55,
                                        resize: 'vertical',
                                    }}
                                />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        disabled={!activeText}
                                        style={{
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: '1px solid #d8ccf0',
                                            background: '#ffffff',
                                            color: '#571c86',
                                            fontWeight: 600,
                                            cursor: activeText ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        Copy Text
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDownloadTxt}
                                        disabled={!activeText}
                                        style={{
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: '1px solid #d8ccf0',
                                            background: '#ffffff',
                                            color: '#571c86',
                                            fontWeight: 600,
                                            cursor: activeText ? 'pointer' : 'not-allowed',
                                        }}
                                    >
                                        Download .TXT
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            user
                                                ? (window.location.href = '/dashboard/youtube-tools')
                                                : setGateReason('Sign up free to unlock AI Video Summaries, Key Takeaways, and Viral YouTube Title ideas!')
                                        }
                                        style={{
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: '#571c86',
                                            color: '#ffffff',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        AI Summary &amp; Viral Titles ✨
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* SEO & AI-Citable Guide Section */}
                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '2.5rem' }}>
                    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '20px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>1. Paste Any YouTube Link</h2>
                        <p style={{ color: '#4b5563', fontSize: '14px', margin: 0 }}>
                            Works with standard YouTube videos, Shorts, and livestreams. No browser extension or software install needed.
                        </p>
                    </div>
                    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '20px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>2. Copy Timestamped Text</h2>
                        <p style={{ color: '#4b5563', fontSize: '14px', margin: 0 }}>
                            Toggle `[MM:SS]` timestamps on or off, copy clean text in one click, or export a `.TXT` file for blogs and scripts.
                        </p>
                    </div>
                    <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '20px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>3. Upgrade with Crevo AI</h2>
                        <p style={{ color: '#4b5563', fontSize: '14px', margin: 0 }}>
                            Turn the transcript into viral title ideas, upgrade the thumbnail for higher CTR, or cut viral Shorts inside Crevo Studio.
                        </p>
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
