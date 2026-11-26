/**
 * Repurpose Module Component
 * 
 * Main component for content repurposing functionality
 */

import React, { FC, useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { GoogleGenAI } from "@google/genai";
import { createAiClient } from '../../../core/services/ai-providers/openrouterClient';
import { repurposeVideo, recutViralClip } from '../services/repurposeService';
import { setServerUploadCache } from '../../../core/processors/video';
import { getAuthToken } from '../../../lib/api';
import { isSupportedVideoFile } from '../../../shared/utils/video-utils';
import { RepurposeResult, ClipGenerationOptions, CropMode, CaptionStyle, CaptionPosition, ViralClip } from '../../../types/repurpose';
import { useAuth } from '../../../contexts/AuthContext';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

interface RepurposeModuleProps {
    onResultsGenerated?: (results: RepurposeResult) => void;
    onCreateCoverThumbnail?: (payload: { imageDataUrl: string; title: string; platform?: string }) => void;
}

export const RepurposeModule: FC<RepurposeModuleProps> = ({ onResultsGenerated, onCreateCoverThumbnail }) => {
    const { user, refreshCredits } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);
    
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoUrl, setVideoUrl] = useState<string>('');
    const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
    const [youtubeInputUrl, setYoutubeInputUrl] = useState<string>('');
    const [isImportingYoutube, setIsImportingYoutube] = useState(false);
    const [importedMeta, setImportedMeta] = useState<{
        uploadId: string;
        title: string;
        duration: number;
        width: number;
        height: number;
        fileSize: number;
        frames: string[];
        sourceUrl: string;
    } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressStatus, setProgressStatus] = useState('Starting...');
    const [results, setResults] = useState<RepurposeResult | null>(null);
    const [recuttingClipId, setRecuttingClipId] = useState<string | null>(null);
    const [clipTrims, setClipTrims] = useState<Record<string, { start: number; end: number }>>({});
    
    const [options, setOptions] = useState<ClipGenerationOptions>({
        min_duration: 15,
        max_duration: 45,
        target_clip_count: 3,
        platforms: ['youtube_shorts'],
        include_captions: false,
        caption_style: 'hormozi',
        caption_position: 'bottom',
        crop_mode: 'center',
        include_transitions: true,
        virality_threshold: 65,
        overlap_prevention: true,
    });

    const handleCopySocialPack = async (clip: ViralClip) => {
        const title = clip.hook_title || clip.title || 'Viral Short';
        const tags = (clip.hashtags && clip.hashtags.length > 0 ? clip.hashtags : ['#shorts', '#viral']).join(' ');
        const text = `${title}\n\n${clip.description ? `${clip.description}\n\n` : ''}${tags}`;
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Copied title, caption & hashtags!');
        } catch {
            toast.info(text);
        }
    };

    const handleRecutClip = async (clip: ViralClip) => {
        if (!videoFile) {
            toast.info('Upload a local video file to re-cut clips.');
            return;
        }
        const trim = clipTrims[clip.id] || { start: clip.start_time, end: clip.end_time };
        if (trim.end - trim.start < 2) {
            toast.error('Clip must be at least 2 seconds long.');
            return;
        }
        setRecuttingClipId(clip.id);
        try {
            const updated = await recutViralClip(videoFile, clip, trim.start, trim.end, options);
            setResults((prev) =>
                prev
                    ? {
                          ...prev,
                          clips: prev.clips.map((c) => (c.id === clip.id ? updated : c)),
                      }
                    : prev
            );
            toast.success(`Clip re-cut (${updated.duration.toFixed(1)}s) and ready!`);
        } catch (err: any) {
            toast.error(err?.message || 'Could not re-cut clip.');
        } finally {
            setRecuttingClipId(null);
        }
    };

    const ai = useRef<GoogleGenAI>(createAiClient());

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            try {
                // Check file size (max 5GB for videos)
                if (file.size > 5 * 1024 * 1024 * 1024) {
                    toast.error('Video file size must be less than 5GB');
                    return;
                }
                
                // Check file type (mobile-safe for Android/iOS empty MIME types & .mov/.m4v/.3gp)
                if (!isSupportedVideoFile(file)) {
                    toast.error('Please upload a valid video file (MP4, MOV, WebM, M4V, 3GP)');
                    return;
                }
                
                setImportedMeta(null);
                setVideoFile(file);
                setVideoUrl(URL.createObjectURL(file));
                setVideoPreviewUrl(URL.createObjectURL(file));
                toast.success('Video uploaded successfully!');
            } catch (error: any) {
                toast.error(`Failed to upload video: ${error.message || 'Unknown error'}`);
            }
        }
    };

    const handleImportYoutubeUrl = async () => {
        const raw = youtubeInputUrl.trim();
        if (!raw) {
            toast.error('Please paste a YouTube video link first.');
            return;
        }
        const token = getAuthToken();
        if (!token) {
            toast.error('Please sign in to import a YouTube video.');
            return;
        }
        setIsImportingYoutube(true);
        try {
            const res = await fetch(`${API_BASE}/api/video/import-url`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: raw }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Could not import YouTube video');
            }
            const safeName = `${(data.title || 'youtube-video').replace(/[^a-z0-9-_ ]/gi, '').slice(0, 60) || 'youtube-video'}.mp4`;
            const markerFile = new File([], safeName, { type: 'video/mp4' });
            setServerUploadCache(markerFile, data.uploadId);
            setVideoFile(markerFile);
            setVideoUrl(raw);
            setVideoPreviewUrl(`${API_BASE}${data.previewUrl}?token=${encodeURIComponent(token)}`);
            setImportedMeta({
                uploadId: data.uploadId,
                title: data.title || 'YouTube Video',
                duration: Number(data.duration || 60),
                width: Number(data.width || 1280),
                height: Number(data.height || 720),
                fileSize: Number(data.size || 0),
                frames: Array.isArray(data.frames) ? data.frames : [],
                sourceUrl: raw,
            });
            toast.success(`Imported "${data.title || 'YouTube video'}"! Ready to generate viral clips.`);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to import YouTube video.');
        } finally {
            setIsImportingYoutube(false);
        }
    };

    const handleSendClipToThumbnail = async (clip: ViralClip) => {
        if (!onCreateCoverThumbnail) return;
        let imageDataUrl = clip.thumbnail_url && clip.thumbnail_url.startsWith('data:image/')
            ? clip.thumbnail_url
            : '';

        if (!imageDataUrl && clip.thumbnail_url && clip.thumbnail_url.startsWith('blob:')) {
            try {
                const resp = await fetch(clip.thumbnail_url);
                const thumbBlob = await resp.blob();
                imageDataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(thumbBlob);
                });
            } catch {
                // fallback below
            }
        }

        if (!imageDataUrl && clip.clip_url) {
            try {
                const videoEl = document.querySelector(`video[src="${clip.clip_url}"]`) as HTMLVideoElement | null;
                // Only capture directly from the <video> if the user has scrubbed/played past the fade-in (1s+)
                if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0 && videoEl.currentTime >= 1) {
                    const canvas = document.createElement('canvas');
                    canvas.width = videoEl.videoWidth;
                    canvas.height = videoEl.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                        imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    }
                }
            } catch {
                // fallback below
            }
        }

        if (!imageDataUrl && importedMeta?.frames?.length) {
            imageDataUrl = importedMeta.frames[Math.floor(importedMeta.frames.length / 2)] || importedMeta.frames[0];
        }

        onCreateCoverThumbnail({
            imageDataUrl,
            title: clip.hook_title || clip.title || 'Viral Short',
            platform: clip.platform_format,
        });
    };

    const handleUrlSubmit = () => {
        const url = urlInputRef.current?.value.trim();
        if (url) {
            setVideoUrl(url);
            setVideoPreviewUrl(url);
            toast.success('Video URL set!');
        }
    };

    const handleRepurpose = async () => {
        if (!user) {
            toast.error('Please sign in to repurpose videos');
            return;
        }

        // Check credits before repurposing (3 credits for <=5 clips, 5 credits for 6+ clips)
        const { hasEnoughCredits, CREDIT_COSTS } = await import('../../../services/payments/creditService');
        const requestedClipCount = Number(options.target_clip_count || 3);
        const repurposeCreditCost = requestedClipCount >= 6 ? CREDIT_COSTS.REPURPOSE_LARGE : CREDIT_COSTS.REPURPOSE_BASE;
        const hasCredits = await hasEnoughCredits(user.id, repurposeCreditCost);
        if (!hasCredits) {
            toast.error(`Insufficient credits. You need ${repurposeCreditCost} credits to generate ${requestedClipCount} clips. Please purchase credits to continue.`);
            return;
        }

        if (!videoFile && !videoUrl) {
            toast.error('Please upload a video or provide a video URL');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setResults(null);

        try {
            // Convert URL to blob if needed and create a valid video URL
            let videoBlob: File | Blob;
            let validVideoUrl: string;
            let shouldRevokeBlobUrl = false;
            
            if (importedMeta && videoFile) {
                videoBlob = videoFile;
                validVideoUrl = importedMeta.sourceUrl;
                shouldRevokeBlobUrl = false;
            } else if (videoFile) {
                videoBlob = videoFile;
                // Create blob URL for file uploads
                validVideoUrl = URL.createObjectURL(videoFile);
                shouldRevokeBlobUrl = true;
            } else if (videoUrl) {
                // Fetch video from URL
                toast.info('Downloading video...');
                const response = await fetch(videoUrl);
                if (!response.ok) {
                    throw new Error('Failed to fetch video from URL');
                }
                videoBlob = await response.blob();
                // Create blob URL from fetched blob
                validVideoUrl = URL.createObjectURL(videoBlob);
                shouldRevokeBlobUrl = true;
            } else {
                throw new Error('No video source provided');
            }

            // Update progress
            setProgress(2);
            setProgressStatus('Starting...');

            // Create progress callback
            const progressCallback = (current: number, total: number, statusText?: string) => {
                const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;
                setProgress(percent);
                if (statusText) {
                    setProgressStatus(statusText);
                }
            };

            // Run repurpose
            try {
                const result = await repurposeVideo(
                    ai.current,
                    videoBlob,
                    validVideoUrl, // Use the blob URL or YouTube URL
                    user.id,
                    options,
                    importedMeta?.title, // originalTitle
                    undefined, // transcript
                    progressCallback,
                    importedMeta
                        ? {
                              duration: importedMeta.duration,
                              width: importedMeta.width,
                              height: importedMeta.height,
                              frames: importedMeta.frames,
                              fileSize: importedMeta.fileSize,
                          }
                        : undefined
                );

                setProgress(100);
                setResults(result);
                onResultsGenerated?.(result);
                
                // Deduct credits after successful repurpose (based on actual clips generated)
                const { deductCredits, CREDIT_COSTS: POST_COSTS } = await import('../../../services/payments/creditService');
                const actualCreditCost = result.clips.length >= 6 ? POST_COSTS.REPURPOSE_LARGE : POST_COSTS.REPURPOSE_BASE;
                await deductCredits(user.id, 'Content Repurpose', actualCreditCost, { 
                    feature: 'content_repurpose', 
                    clipCount: result.clips.length 
                });
                await refreshCredits();
                
                toast.success(`Successfully generated ${result.clips.length} viral clips!`);
            } finally {
                // Clean up blob URL only after processing is complete
                if (shouldRevokeBlobUrl) {
                    URL.revokeObjectURL(validVideoUrl);
                }
            }
        } catch (error: any) {
            console.error('Error repurposing video:', error);
            toast.error(`Failed to repurpose video: ${error.message || 'Unknown error'}`);
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    };

    return (
        <div className="repurpose-module">
            <div className="repurpose-header">
                <h2>Content Repurpose</h2>
                <p>Turn long videos into viral shorts with AI</p>
            </div>

            {/* Video Upload/URL Section */}
            <div className="repurpose-upload-section">
                <div className="upload-content">
                    {/* File Upload with real drag-and-drop */}
                    {videoPreviewUrl ? (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '16px',
                                background: 'var(--surface-2, #f7f4fc)',
                                border: '1px solid var(--border-color, #e4dcf2)',
                                borderRadius: '14px',
                            }}
                        >
                            <video
                                src={videoPreviewUrl}
                                controls
                                preload="metadata"
                                style={{
                                    width: 'auto',
                                    maxWidth: '100%',
                                    maxHeight: '360px',
                                    margin: '0 auto',
                                    display: 'block',
                                    borderRadius: '10px',
                                    backgroundColor: '#000',
                                    boxShadow: '0 6px 20px rgba(17, 17, 27, 0.14)',
                                }}
                            />
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        color: 'var(--text-primary, #111)',
                                    }}
                                >
                                    {importedMeta?.title || videoFile?.name || 'Uploaded video'}
                                    {(importedMeta?.fileSize || (videoFile && videoFile.size > 0)) && (
                                        <span style={{ fontWeight: 400, color: 'var(--text-secondary, #6b7280)', marginLeft: '6px' }}>
                                            {(() => {
                                                const bytes = importedMeta?.fileSize || videoFile?.size || 0;
                                                return bytes >= 1024 * 1024 * 1024
                                                    ? `(${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB)`
                                                    : `(${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
                                            })()}
                                        </span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        padding: '0.45rem 0.9rem',
                                        background: 'var(--surface-1, #ffffff)',
                                        color: 'var(--primary, #571c86)',
                                        border: '1px solid var(--border-color, #d8ccf0)',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                    }}
                                >
                                    Change Video
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImportedMeta(null);
                                        setVideoFile(null);
                                        setVideoUrl('');
                                        setVideoPreviewUrl('');
                                        setYoutubeInputUrl('');
                                    }}
                                    className="remove-video-btn"
                                    style={{
                                        padding: '0.45rem 0.9rem',
                                        background: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                    }}
                                >
                                    Remove Video
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Direct YouTube URL Import */}
                            <div
                                style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    background: '#faf7ff',
                                    border: '1px solid #e4dcf2',
                                }}
                            >
                                <input
                                    ref={urlInputRef}
                                    type="url"
                                    value={youtubeInputUrl}
                                    onChange={(e) => setYoutubeInputUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isImportingYoutube) {
                                            e.preventDefault();
                                            handleImportYoutubeUrl();
                                        }
                                    }}
                                    placeholder="Paste a YouTube link (e.g. https://youtube.com/watch?v=...)"
                                    disabled={isImportingYoutube}
                                    style={{
                                        flex: '1 1 240px',
                                        minWidth: 0,
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #d8ccf0',
                                        background: '#ffffff',
                                        fontSize: '14px',
                                        color: '#111827',
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={handleImportYoutubeUrl}
                                    disabled={isImportingYoutube || !youtubeInputUrl.trim()}
                                    style={{
                                        padding: '9px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: '#571c86',
                                        color: '#ffffff',
                                        fontWeight: 700,
                                        fontSize: '13.5px',
                                        cursor: isImportingYoutube ? 'wait' : 'pointer',
                                        opacity: isImportingYoutube || !youtubeInputUrl.trim() ? 0.65 : 1,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {isImportingYoutube ? 'Importing YouTube...' : '▶ Import YouTube'}
                                </button>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    color: '#9ca3af',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                }}
                            >
                                <span style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                                <span>OR UPLOAD A VIDEO FILE</span>
                                <span style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                            </div>

                            <div
                                className="upload-area"
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) {
                                        handleFileChange({ target: { files: [file] } } as any);
                                    }
                                }}
                            >
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary, #571c86)" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                <p>Click to upload or drag &amp; drop a video</p>
                                <p className="upload-hint">MP4, MOV, WebM up to 5GB — AI finds top viral moments &amp; clips them in seconds</p>
                            </div>
                        </div>
                    )}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp,.avi" 
                        style={{ display: 'none' }} 
                    />
                </div>
            </div>

            {/* Options Section */}
            <div className="repurpose-options">
                <h3>Generation Options</h3>
                
                <div className="options-grid">
                    <div className="option-group">
                        <label>Target Clip Count</label>
                        <input 
                            type="number" 
                            min="1" 
                            max="20" 
                            value={options.target_clip_count}
                            onChange={(e) => setOptions({ ...options, target_clip_count: parseInt(e.target.value) })}
                        />
                    </div>

                    <div className="option-group">
                        <label>Min Duration (seconds)</label>
                        <input 
                            type="number" 
                            min="5" 
                            max="60" 
                            value={options.min_duration}
                            onChange={(e) => setOptions({ ...options, min_duration: parseInt(e.target.value) })}
                        />
                    </div>

                    <div className="option-group">
                        <label>Max Duration (seconds)</label>
                        <input 
                            type="number" 
                            min="15" 
                            max="120" 
                            value={options.max_duration}
                            onChange={(e) => setOptions({ ...options, max_duration: parseInt(e.target.value) })}
                        />
                    </div>

                    <div className="option-group">
                        <label>Virality Threshold</label>
                        <input 
                            type="number" 
                            min="0" 
                            max="100" 
                            value={options.virality_threshold}
                            onChange={(e) => setOptions({ ...options, virality_threshold: parseInt(e.target.value) })}
                        />
                    </div>
                </div>

                <div className="platform-selection">
                    <label>Platforms</label>
                    <div className="platform-checkboxes">
                        {['youtube_shorts', 'tiktok', 'instagram_reels', 'twitter'].map(platform => (
                            <label key={platform} className="platform-checkbox" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input 
                                    type="checkbox"
                                    checked={options.platforms.includes(platform as any)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setOptions({ ...options, platforms: [...options.platforms, platform as any] });
                                        } else {
                                            setOptions({ ...options, platforms: options.platforms.filter(p => p !== platform) });
                                        }
                                    }}
                                />
                                <span>{platform.replace('_', ' ').toUpperCase()}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Smart Framing / Layout Selector */}
                <div style={{ marginTop: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: '#1f2937' }}>
                        Smart Video Framing
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {(
                            [
                                { id: 'center', label: '🎯 Auto Center' },
                                { id: 'split_podcast', label: '🎙️ 2-Speaker Podcast Split-Screen' },
                                { id: 'left', label: '⬅️ Focus Left' },
                                { id: 'right', label: '➡️ Focus Right' },
                            ] as Array<{ id: CropMode; label: string }>
                        ).map((mode) => {
                            const active = (options.crop_mode || 'center') === mode.id;
                            return (
                                <button
                                    key={mode.id}
                                    type="button"
                                    onClick={() => setOptions({ ...options, crop_mode: mode.id })}
                                    style={{
                                        padding: '7px 12px',
                                        borderRadius: '9px',
                                        border: active ? '1.5px solid #571c86' : '1px solid #d8ccf0',
                                        background: active ? '#571c86' : '#ffffff',
                                        color: active ? '#ffffff' : '#374151',
                                        fontWeight: 600,
                                        fontSize: '12.5px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {mode.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="feature-toggles" style={{ marginTop: '14px' }}>
                    <label className="feature-toggle">
                        <input 
                            type="checkbox"
                            checked={options.include_captions}
                            onChange={(e) => setOptions({ ...options, include_captions: e.target.checked })}
                        />
                        <span>Include Captions (Word Highlight)</span>
                    </label>
                    <label className="feature-toggle">
                        <input 
                            type="checkbox"
                            checked={options.include_transitions}
                            onChange={(e) => setOptions({ ...options, include_transitions: e.target.checked })}
                        />
                        <span>Include Transitions</span>
                    </label>
                    <label className="feature-toggle">
                        <input 
                            type="checkbox"
                            checked={options.overlap_prevention}
                            onChange={(e) => setOptions({ ...options, overlap_prevention: e.target.checked })}
                        />
                        <span>Prevent Overlapping Clips</span>
                    </label>
                </div>

                {/* Caption Style & Position Presets (shown when Include Captions is checked) */}
                {options.include_captions && (
                    <div
                        style={{
                            marginTop: '12px',
                            padding: '12px 14px',
                            borderRadius: '12px',
                            background: '#faf7ff',
                            border: '1px solid #d8ccf0',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                        }}
                    >
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#571c86', marginBottom: '6px' }}>
                                Caption Style Preset
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {(
                                    [
                                        { id: 'hormozi', label: '🔥 Hormozi Yellow Pop' },
                                        { id: 'mrbeast', label: '⚡ MrBeast Bold' },
                                        { id: 'neon', label: '💜 Crevo Neon' },
                                        { id: 'minimal', label: '✨ Clean Minimal' },
                                    ] as Array<{ id: CaptionStyle; label: string }>
                                ).map((st) => {
                                    const active = (options.caption_style || 'hormozi') === st.id;
                                    return (
                                        <button
                                            key={st.id}
                                            type="button"
                                            onClick={() => setOptions({ ...options, caption_style: st.id })}
                                            style={{
                                                padding: '6px 11px',
                                                borderRadius: '8px',
                                                border: active ? '1.5px solid #571c86' : '1px solid #d8ccf0',
                                                background: active ? '#571c86' : '#ffffff',
                                                color: active ? '#ffffff' : '#374151',
                                                fontWeight: 600,
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {st.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#571c86' }}>Position:</span>
                            {(['bottom', 'middle', 'top'] as CaptionPosition[]).map((pos) => {
                                const active = (options.caption_position || 'bottom') === pos;
                                return (
                                    <button
                                        key={pos}
                                        type="button"
                                        onClick={() => setOptions({ ...options, caption_position: pos })}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '7px',
                                            border: active ? '1.5px solid #571c86' : '1px solid #d8ccf0',
                                            background: active ? '#571c86' : '#ffffff',
                                            color: active ? '#ffffff' : '#374151',
                                            fontWeight: 600,
                                            fontSize: '11.5px',
                                            textTransform: 'capitalize',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {pos}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Process Button */}
            <div className="repurpose-actions" style={{ flexDirection: 'column', gap: '12px' }}>
                <button 
                    onClick={handleRepurpose}
                    disabled={isProcessing || (!videoFile && !videoUrl)}
                    className="repurpose-btn primary"
                >
                    {isProcessing ? (
                        <>
                            <div className="spinner" style={{ width: '20px', height: '20px', marginRight: '8px' }}></div>
                            {progressStatus} ({progress}%)
                        </>
                    ) : (
                        'Generate Viral Clips'
                    )}
                </button>
                {isProcessing && (
                    <div style={{ width: '100%', maxWidth: '480px', margin: '0 auto' }}>
                        <div
                            style={{
                                width: '100%',
                                height: '8px',
                                background: 'var(--surface-3, #e9e4f5)',
                                borderRadius: '999px',
                                overflow: 'hidden',
                            }}
                        >
                            <div
                                style={{
                                    width: `${progress}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, var(--primary, #571c86), #9333ea)',
                                    transition: 'width 0.25s ease-out',
                                    borderRadius: '999px',
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Results Section */}
            {results && (
                <div className="repurpose-results">
                    <h3>Generated Clips ({results.clips.length})</h3>
                    <div className="results-stats">
                        <div className="stat">
                            <span className="stat-label">Average Virality Score</span>
                            <span className="stat-value">{results.statistics.average_virality_score.toFixed(1)}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Processing Time</span>
                            <span className="stat-value">{results.statistics.processing_time_seconds.toFixed(1)}s</span>
                        </div>
                    </div>

                    <div className="clips-grid">
                        {results.clips.map((clip) => (
                            <div key={clip.id} className="clip-card">
                                <div className="clip-thumbnail">
                                    {/* Show actual video player instead of thumbnail */}
                                    {clip.clip_url && (
                                        <video 
                                            src={clip.clip_url} 
                                            poster={clip.thumbnail_url || undefined}
                                            controls 
                                            preload={clip.thumbnail_url ? 'none' : 'metadata'}
                                            style={{ 
                                                width: '100%', 
                                                height: '100%', 
                                                display: 'block',
                                                objectFit: 'cover',
                                                backgroundColor: '#000'
                                            }}
                                        />
                                    )}
                                    <div className="clip-score">
                                        🔥 {clip.virality_score}
                                    </div>
                                </div>
                                <div className="clip-info">
                                    <h4>{clip.title}</h4>
                                    <p className="clip-duration">
                                        {clip.duration.toFixed(1)}s
                                        {clip.metadata?.resolution ? ` • ${clip.metadata.resolution}` : ''}
                                        {clip.aspect_ratio ? ` (${clip.aspect_ratio})` : ''}
                                    </p>
                                    <p className="clip-platform">
                                        {Array.isArray((clip.metadata as any)?.target_platforms) && (clip.metadata as any).target_platforms.length > 0
                                            ? (clip.metadata as any).target_platforms
                                                  .map((p: string) => p.replace('_', ' ').toUpperCase())
                                                  .join(' • ')
                                            : clip.platform_format.replace('_', ' ').toUpperCase()}
                                    </p>

                                    {/* Ready-to-Post Title & Hashtags Copy Pack */}
                                    <div
                                        style={{
                                            margin: '8px 0 10px',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            background: '#faf7ff',
                                            border: '1px solid #ede5fa',
                                            fontSize: '12px',
                                        }}
                                    >
                                        <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: '3px', lineHeight: 1.35 }}>
                                            {clip.hook_title || clip.title}
                                        </div>
                                        {clip.description && (
                                            <div style={{ color: '#4b5563', fontSize: '11.5px', marginBottom: '4px', lineHeight: 1.35 }}>
                                                {clip.description}
                                            </div>
                                        )}
                                        <div style={{ color: '#571c86', fontWeight: 600, fontSize: '11px', marginBottom: '6px' }}>
                                            {(clip.hashtags && clip.hashtags.length > 0 ? clip.hashtags : ['#shorts', '#viral']).join(' ')}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleCopySocialPack(clip)}
                                            style={{
                                                padding: '4px 9px',
                                                borderRadius: '6px',
                                                border: '1px solid #d8ccf0',
                                                background: '#ffffff',
                                                color: '#571c86',
                                                fontWeight: 700,
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            📋 Copy Title &amp; Hashtags
                                        </button>
                                    </div>

                                    {/* Quick Start / End Trim & Free Re-cut */}
                                    {videoFile && (
                                        <div
                                            style={{
                                                marginBottom: '10px',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: '#f9fafb',
                                                border: '1px solid #e5e7eb',
                                                fontSize: '11.5px',
                                            }}
                                        >
                                            {(() => {
                                                const trim = clipTrims[clip.id] || { start: clip.start_time, end: clip.end_time };
                                                const busy = recuttingClipId === clip.id;
                                                return (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 600, color: '#374151' }}>
                                                                Start: {trim.start.toFixed(1)}s
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setClipTrims((p) => ({ ...p, [clip.id]: { ...trim, start: Math.max(0, trim.start - 2) } }))}
                                                                    style={{ padding: '2px 7px', borderRadius: '5px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                                                                >
                                                                    -2s
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setClipTrims((p) => ({ ...p, [clip.id]: { ...trim, start: Math.min(trim.end - 2, trim.start + 2) } }))}
                                                                    style={{ padding: '2px 7px', borderRadius: '5px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                                                                >
                                                                    +2s
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: 600, color: '#374151' }}>
                                                                End: {trim.end.toFixed(1)}s
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setClipTrims((p) => ({ ...p, [clip.id]: { ...trim, end: Math.max(trim.start + 2, trim.end - 2) } }))}
                                                                    style={{ padding: '2px 7px', borderRadius: '5px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                                                                >
                                                                    -2s
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setClipTrims((p) => ({ ...p, [clip.id]: { ...trim, end: trim.end + 2 } }))}
                                                                    style={{ padding: '2px 7px', borderRadius: '5px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
                                                                >
                                                                    +2s
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => handleRecutClip(clip)}
                                                            style={{
                                                                marginTop: '2px',
                                                                padding: '5px 10px',
                                                                borderRadius: '6px',
                                                                border: 'none',
                                                                background: '#571c86',
                                                                color: '#ffffff',
                                                                fontWeight: 700,
                                                                fontSize: '11.5px',
                                                                cursor: busy ? 'wait' : 'pointer',
                                                                opacity: busy ? 0.7 : 1,
                                                            }}
                                                        >
                                                            {busy ? 'Re-cutting...' : '✂️ Apply Trim & Re-cut (Free)'}
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    <div className="clip-actions" style={{ flexWrap: 'wrap', gap: '6px' }}>
                                        <a 
                                            href={clip.clip_url} 
                                            download={`viral-clip-${clip.platform_format}-${clip.virality_score}.mp4`}
                                            className="clip-download-btn"
                                        >
                                            Download
                                        </a>
                                        <button 
                                            className="clip-preview-btn"
                                            onClick={() => {
                                                const video = document.querySelector(`video[src="${clip.clip_url}"]`) as HTMLVideoElement;
                                                if (video) {
                                                    if (video.paused) video.play();
                                                    else video.pause();
                                                }
                                            }}
                                        >
                                            Play/Pause
                                        </button>
                                        {onCreateCoverThumbnail && (
                                            <button
                                                type="button"
                                                onClick={() => handleSendClipToThumbnail(clip)}
                                                style={{
                                                    width: '100%',
                                                    marginTop: '4px',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #d8ccf0',
                                                    background: 'linear-gradient(135deg, #f5efff 0%, #ede3ff 100%)',
                                                    color: '#571c86',
                                                    fontWeight: 700,
                                                    fontSize: '12.5px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                🎨 Make Cover Thumbnail
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

