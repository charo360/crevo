import React, { FC, useState } from 'react';
import { toast } from 'react-toastify';
import { Platform } from '../../types';
import { apiRequest } from '../../lib/api';
import { getModelWithFallback } from '../../core/services/ai-providers/gemini/config';

interface YouTubeToolsViewProps {
    onSwitchPlatform: (platform: Platform) => void;
}

function extractVideoId(url: string): string | null {
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    try {
        const parsed = new URL(trimmed);
        if (parsed.hostname.includes('youtu.be')) {
            return parsed.pathname.split('/').filter(Boolean)[0] || null;
        }
        const v = parsed.searchParams.get('v');
        if (v) return v;
        const match = parsed.pathname.match(/\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
        if (match) return match[2];
    } catch {
        // fallback regex
    }
    const fallback = trimmed.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:[?&/]|$)/);
    return fallback ? fallback[1] : null;
}

interface ThumbnailQuality {
    id: string;
    label: string;
    size: string;
    filename: string;
}

const QUALITIES: ThumbnailQuality[] = [
    { id: 'maxres', label: 'HD Max Resolution', size: '1280 × 720', filename: 'maxresdefault.jpg' },
    { id: 'sd', label: 'Standard Definition', size: '640 × 480', filename: 'sddefault.jpg' },
    { id: 'hq', label: 'High Quality', size: '480 × 360', filename: 'hqdefault.jpg' },
];

interface TranscriptSegment {
    seconds: number;
    time: string;
    text: string;
}

interface AiVideoInsights {
    summary: string[];
    viralTitles: string[];
    thumbnailHooks: string[];
}

export const YouTubeToolsView: FC<YouTubeToolsViewProps> = ({ onSwitchPlatform }) => {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [videoId, setVideoId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [previewSrc, setPreviewSrc] = useState('');
    const [transcript, setTranscript] = useState<string | null>(null);
    const [timestampedTranscript, setTimestampedTranscript] = useState<string | null>(null);
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);
    const [showTimestamps, setShowTimestamps] = useState(true);
    const [transcriptLang, setTranscriptLang] = useState<string>('');
    const [transcriptReason, setTranscriptReason] = useState<string>('');
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [insights, setInsights] = useState<AiVideoInsights | null>(null);
    const [loadingInsights, setLoadingInsights] = useState(false);

    const handleFetch = async (e: React.FormEvent) => {
        e.preventDefault();
        const id = extractVideoId(url);
        if (!id) {
            toast.error('Please enter a valid YouTube URL');
            return;
        }

        setLoading(true);
        setVideoId(id);
        setTitle('');
        setTranscript(null);
        setTimestampedTranscript(null);
        setSegments([]);
        setInsights(null);
        setTranscriptLang('');
        setTranscriptReason('');
        setPreviewSrc(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);

        try {
            const [metaRes, transRes] = await Promise.allSettled([
                fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`).then((r) =>
                    r.ok ? r.json() : null
                ),
                fetch(`/api/youtube/transcript?url=${encodeURIComponent(url)}`).then((r) =>
                    r.ok ? r.json() : null
                ),
            ]);

            if (metaRes.status === 'fulfilled' && metaRes.value?.title) {
                setTitle(metaRes.value.title);
            }

            if (transRes.status === 'fulfilled' && transRes.value) {
                if (transRes.value.transcript) {
                    setTranscript(transRes.value.transcript);
                    setTimestampedTranscript(transRes.value.timestampedTranscript || transRes.value.transcript);
                    setSegments(Array.isArray(transRes.value.segments) ? transRes.value.segments : []);
                    setTranscriptLang(transRes.value.language || '');
                } else {
                    setTranscriptReason(transRes.value.reason || 'no_captions');
                }
            } else {
                setTranscriptReason('error');
            }

            toast.success('Fetched thumbnail & transcript!');
        } catch (err: any) {
            toast.error(err.message || 'Failed to fetch YouTube data');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadThumbnail = async (quality: ThumbnailQuality) => {
        if (!videoId) return;
        setDownloadingId(quality.id);
        try {
            const targetUrl = `https://i.ytimg.com/vi/${videoId}/${quality.filename}`;
            let res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`);
            if (!res.ok && quality.id !== 'hq') {
                // Fallback to hqdefault if maxres/sd is unavailable for older videos
                res = await fetch(`/api/proxy?url=${encodeURIComponent(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`)}`);
                toast.info(`${quality.label} wasn't available for this video — downloaded HQ instead.`);
            }
            if (!res.ok) {
                throw new Error('Could not download thumbnail');
            }
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `youtube-thumbnail-${videoId}-${quality.id}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (err: any) {
            toast.error(err.message || 'Download failed');
        } finally {
            setDownloadingId(null);
        }
    };

    const activeTranscriptText = showTimestamps ? (timestampedTranscript || transcript) : transcript;

    const handleCopyTranscript = async () => {
        if (!activeTranscriptText) return;
        try {
            await navigator.clipboard.writeText(activeTranscriptText);
            toast.success('Transcript copied to clipboard!');
        } catch {
            toast.error('Failed to copy transcript');
        }
    };

    const handleDownloadTranscript = () => {
        if (!activeTranscriptText || !videoId) return;
        const blob = new Blob([`${title ? `${title}\n\n` : ''}${activeTranscriptText}`], {
            type: 'text/plain;charset=utf-8',
        });
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `youtube-transcript-${videoId}${showTimestamps ? '-timestamped' : ''}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
    };

    const handleGenerateInsights = async () => {
        if (!transcript && !title) {
            toast.error('Fetch a YouTube video first.');
            return;
        }
        setLoadingInsights(true);
        try {
            const sample = transcript
                ? transcript.length <= 9000
                    ? transcript
                    : `${transcript.slice(0, 3000)}\n...\n${transcript.slice(Math.floor(transcript.length / 2) - 1500, Math.floor(transcript.length / 2) + 1500)}\n...\n${transcript.slice(-3000)}`
                : '';

            const prompt = `You are a Top 0.1% YouTube Growth Strategist.
Analyze this YouTube video title and transcript and produce actionable creator insights in the SAME language as the video title.

Video Title: "${title || 'Unknown'}"
${sample ? `Transcript:\n"${sample}"` : ''}

Return ONLY valid JSON with this exact schema:
{
  "summary": ["<3 to 4 crisp bullet points summarizing the main story/takeaways>"],
  "viralTitles": ["<5 high-CTR alternative YouTube titles using curiosity gaps and emotional hooks>"],
  "thumbnailHooks": ["<5 punchy 2-4 word thumbnail text hooks that complement the title>"]
}`;

            const data = await apiRequest<{ text?: string }>('/api/ai/generate', {
                method: 'POST',
                body: JSON.stringify({
                    model: getModelWithFallback('TEXT', false),
                    contents: prompt,
                    config: { responseMimeType: 'application/json', temperature: 0.5 },
                }),
            });

            const raw = (data.text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsed = JSON.parse(raw) as AiVideoInsights;
            setInsights({
                summary: Array.isArray(parsed.summary) ? parsed.summary : [],
                viralTitles: Array.isArray(parsed.viralTitles) ? parsed.viralTitles : [],
                thumbnailHooks: Array.isArray(parsed.thumbnailHooks) ? parsed.thumbnailHooks : [],
            });
            toast.success('AI Summary & Viral Title Ideas ready!');
        } catch (err: any) {
            console.error('AI Insights error:', err);
            toast.error(err.message || 'Failed to generate AI insights');
        } finally {
            setLoadingInsights(false);
        }
    };

    const handleCopyText = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied!`);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const wordCount = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;

    return (
        <div
            style={{
                width: '100%',
                maxWidth: '1120px',
                margin: '0 auto',
                padding: '28px 24px 60px',
                display: 'flex',
                flexDirection: 'column',
                gap: '22px',
            }}
        >
            {/* Header + URL Input Card */}
            <div
                style={{
                    background: 'var(--surface-1, #ffffff)',
                    border: '1px solid var(--border-color, #e4dcf2)',
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 4px 18px rgba(87, 28, 134, 0.05)',
                }}
            >
                <h1 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary, #111111)' }}>
                    YouTube Thumbnail Downloader &amp; Transcript Extractor
                </h1>
                <p style={{ margin: '0 0 18px', fontSize: '14px', color: 'var(--text-secondary, #5e5a67)' }}>
                    Paste any YouTube video or Shorts URL to download HD thumbnails and extract the full transcript—100% free (uses 0 credits).
                </p>

                <form onSubmit={handleFetch} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        required
                        style={{
                            flex: '1 1 320px',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-color, #e4dcf2)',
                            background: 'var(--background, #f8f5ed)',
                            color: 'var(--text-primary, #111111)',
                            fontSize: '14px',
                        }}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '12px 22px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'var(--primary, #571c86)',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: loading ? 'wait' : 'pointer',
                        }}
                    >
                        {loading ? 'Fetching...' : 'Get Thumbnail & Transcript'}
                    </button>
                </form>
            </div>

            {videoId && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                        gap: '20px',
                        alignItems: 'start',
                    }}
                >
                    {/* Thumbnail Downloader Card */}
                    <div
                        style={{
                            background: 'var(--surface-1, #ffffff)',
                            border: '1px solid var(--border-color, #e4dcf2)',
                            borderRadius: '16px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #111111)' }}>
                                Thumbnail Downloader
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    try {
                                        sessionStorage.setItem(
                                            'revo3.pendingImproveVideo',
                                            JSON.stringify({
                                                url: url || `https://www.youtube.com/watch?v=${videoId}`,
                                                videoId,
                                                title,
                                                thumbnailUrl: previewSrc,
                                                transcript,
                                            })
                                        );
                                    } catch {
                                        // Ignore storage errors
                                    }
                                    onSwitchPlatform('youtube_improve');
                                }}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '999px',
                                    border: '1px solid var(--border-color, #e4dcf2)',
                                    background: 'var(--surface-2, #f3ecfa)',
                                    color: 'var(--primary, #571c86)',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Improve with AI →
                            </button>
                        </div>

                        {title && (
                            <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary, #111111)' }}>
                                {title}
                            </p>
                        )}

                        <div
                            style={{
                                borderRadius: '12px',
                                overflow: 'hidden',
                                border: '1px solid var(--border-color, #e4dcf2)',
                                background: '#000',
                            }}
                        >
                            <img
                                src={previewSrc}
                                alt={title || 'YouTube thumbnail'}
                                onError={() => {
                                    if (!previewSrc.includes('hqdefault.jpg')) {
                                        setPreviewSrc(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
                                    }
                                }}
                                style={{ width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'cover' }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {QUALITIES.map((q) => (
                                <button
                                    key={q.id}
                                    type="button"
                                    onClick={() => handleDownloadThumbnail(q)}
                                    disabled={downloadingId === q.id}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border-color, #e4dcf2)',
                                        background: q.id === 'maxres' ? 'var(--primary, #571c86)' : 'var(--surface-2, #f3ecfa)',
                                        color: q.id === 'maxres' ? '#ffffff' : 'var(--text-primary, #111111)',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <span>{downloadingId === q.id ? 'Downloading...' : `Download ${q.label}`}</span>
                                    <span style={{ opacity: 0.85, fontSize: '12px' }}>{q.size}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Transcript Extractor Card */}
                    <div
                        style={{
                            background: 'var(--surface-1, #ffffff)',
                            border: '1px solid var(--border-color, #e4dcf2)',
                            borderRadius: '16px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #111111)' }}>
                                    Video Transcript
                                </h2>
                                {transcript && (
                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary, #5e5a67)' }}>
                                        {wordCount.toLocaleString()} words{transcriptLang ? ` · Language: ${transcriptLang.toUpperCase()}` : ''}
                                    </span>
                                )}
                            </div>
                            {transcript && (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            fontSize: '12px',
                                            color: 'var(--text-secondary, #5e5a67)',
                                            cursor: 'pointer',
                                            marginRight: '4px',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={showTimestamps}
                                            onChange={(e) => setShowTimestamps(e.target.checked)}
                                            style={{ accentColor: '#571c86' }}
                                        />
                                        Timestamps
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleCopyTranscript}
                                        style={{
                                            padding: '7px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color, #e4dcf2)',
                                            background: 'var(--surface-2, #f3ecfa)',
                                            color: 'var(--primary, #571c86)',
                                            fontWeight: 600,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Copy Text
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDownloadTranscript}
                                        style={{
                                            padding: '7px 12px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: 'var(--primary, #571c86)',
                                            color: '#ffffff',
                                            fontWeight: 600,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Download .TXT
                                    </button>
                                </div>
                            )}
                        </div>

                        {loading ? (
                            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary, #5e5a67)' }}>
                                Extracting transcript...
                            </div>
                        ) : segments.length > 0 ? (
                            <div
                                style={{
                                    maxHeight: '420px',
                                    overflowY: 'auto',
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color, #e4dcf2)',
                                    background: 'var(--background, #f8f5ed)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px',
                                }}
                            >
                                {segments.map((seg, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                        {showTimestamps && (
                                            <span
                                                style={{
                                                    flexShrink: 0,
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    fontFamily: 'monospace',
                                                    color: 'var(--primary, #571c86)',
                                                    background: 'var(--surface-2, #f3ecfa)',
                                                    border: '1px solid var(--border-color, #e4dcf2)',
                                                    borderRadius: '6px',
                                                    padding: '2px 7px',
                                                    marginTop: '2px',
                                                }}
                                            >
                                                {seg.time}
                                            </span>
                                        )}
                                        <p
                                            style={{
                                                margin: 0,
                                                fontSize: '13.5px',
                                                lineHeight: 1.55,
                                                color: 'var(--text-primary, #111111)',
                                            }}
                                        >
                                            {seg.text}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : transcript ? (
                            <textarea
                                readOnly
                                value={activeTranscriptText || ''}
                                style={{
                                    width: '100%',
                                    minHeight: '340px',
                                    padding: '14px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color, #e4dcf2)',
                                    background: 'var(--background, #f8f5ed)',
                                    color: 'var(--text-primary, #111111)',
                                    fontSize: '13.5px',
                                    lineHeight: 1.6,
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    padding: '36px 16px',
                                    borderRadius: '10px',
                                    background: 'var(--background, #f8f5ed)',
                                    border: '1px dashed var(--border-color, #e4dcf2)',
                                    textAlign: 'center',
                                    color: 'var(--text-secondary, #5e5a67)',
                                    fontSize: '13.5px',
                                }}
                            >
                                {transcriptReason === 'no_captions'
                                    ? 'This YouTube video does not have captions/subtitles enabled.'
                                    : 'No transcript could be extracted for this video.'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* AI Summary & Viral Title Ideas Card */}
            {videoId && (transcript || title) && (
                <div
                    style={{
                        background: 'var(--surface-1, #ffffff)',
                        border: '1px solid var(--border-color, #e4dcf2)',
                        borderRadius: '16px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #111111)' }}>
                                AI Summary &amp; Viral Title Ideas
                            </h2>
                            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: 'var(--text-secondary, #5e5a67)' }}>
                                Generate key takeaways, 5 high-CTR titles, and 5 punchy thumbnail hooks from the transcript.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleGenerateInsights}
                            disabled={loadingInsights}
                            style={{
                                padding: '9px 16px',
                                borderRadius: '10px',
                                border: 'none',
                                background: 'var(--primary, #571c86)',
                                color: '#ffffff',
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: loadingInsights ? 'wait' : 'pointer',
                            }}
                        >
                            {loadingInsights ? 'Analyzing...' : insights ? 'Regenerate Ideas' : 'Generate Summary & Titles'}
                        </button>
                    </div>

                    {insights && (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '16px',
                            }}
                        >
                            {/* Key Takeaways */}
                            <div
                                style={{
                                    padding: '14px',
                                    borderRadius: '12px',
                                    background: 'var(--background, #f8f5ed)',
                                    border: '1px solid var(--border-color, #e4dcf2)',
                                }}
                            >
                                <h3 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: 700, color: 'var(--primary, #571c86)' }}>
                                    Key Takeaways
                                </h3>
                                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-primary, #111111)', lineHeight: 1.5 }}>
                                    {insights.summary.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </div>

                            {/* Viral Title Ideas */}
                            <div
                                style={{
                                    padding: '14px',
                                    borderRadius: '12px',
                                    background: 'var(--background, #f8f5ed)',
                                    border: '1px solid var(--border-color, #e4dcf2)',
                                }}
                            >
                                <h3 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: 700, color: 'var(--primary, #571c86)' }}>
                                    Viral Title Ideas (Click to Copy)
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                    {insights.viralTitles.map((t, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => handleCopyText(t, 'Title')}
                                            style={{
                                                textAlign: 'left',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color, #e4dcf2)',
                                                background: 'var(--surface-1, #ffffff)',
                                                color: 'var(--text-primary, #111111)',
                                                fontSize: '12.5px',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Thumbnail Hooks */}
                            <div
                                style={{
                                    padding: '14px',
                                    borderRadius: '12px',
                                    background: 'var(--background, #f8f5ed)',
                                    border: '1px solid var(--border-color, #e4dcf2)',
                                }}
                            >
                                <h3 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: 700, color: 'var(--primary, #571c86)' }}>
                                    Thumbnail Text Hooks (Click to Copy)
                                </h3>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {insights.thumbnailHooks.map((hook, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => handleCopyText(hook, 'Hook')}
                                            style={{
                                                padding: '7px 12px',
                                                borderRadius: '999px',
                                                border: '1px solid var(--border-color, #e4dcf2)',
                                                background: 'var(--surface-2, #f3ecfa)',
                                                color: 'var(--primary, #571c86)',
                                                fontSize: '12.5px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {hook}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
