/**
 * Repurpose Module Component
 * 
 * Main component for content repurposing functionality
 */

import React, { FC, useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import { GoogleGenAI } from "@google/genai";
import { createAiClient } from '../../../core/services/ai-providers/openrouterClient';
import {
    repurposeVideo,
    recutViralClip,
    submitBackgroundRepurposeJob,
    pollRepurposeJob,
    fetchActiveRepurposeJobs,
    BackgroundJobStatus,
} from '../services/repurposeService';
import { setServerUploadCache } from '../../../core/processors/video';
import { pickBestThumbnailShotsFromFrames } from '../../../core/services/ai-providers/gemini/adapters/analysisService';
import { getAuthToken } from '../../../lib/api';
import { isSupportedVideoFile, extractFramesFromVideo } from '../../../shared/utils/video-utils';
import { RepurposeResult, ClipGenerationOptions, CropMode, CaptionStyle, CaptionPosition, ViralClip } from '../../../types/repurpose';
import { useAuth } from '../../../contexts/AuthContext';
import { triggerOutOfCreditsModal } from '../../../components/modals/OutOfCreditsModal';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

interface RepurposeModuleProps {
    onResultsGenerated?: (results: RepurposeResult) => void;
    onCreateCoverThumbnail?: (payload: { imageDataUrl: string; images?: string[]; title: string; platform?: string }) => void;
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
    const [notifyByEmail, setNotifyByEmail] = useState(true);
    const [activeJob, setActiveJob] = useState<BackgroundJobStatus | null>(null);
    const [queueInfo, setQueueInfo] = useState<{ active: number; queued: number; maxConcurrent: number } | null>(null);
    const [results, setResults] = useState<RepurposeResult | null>(null);
    const [recuttingClipId, setRecuttingClipId] = useState<string | null>(null);
    const [recutCounts, setRecutCounts] = useState<Record<string, number>>({});
    const [analyzingThumbClipId, setAnalyzingThumbClipId] = useState<string | null>(null);
    const [clipTrims, setClipTrims] = useState<Record<string, { start: number; end: number }>>({});
    const MAX_FREE_RECUTS_PER_CLIP = 3;
    
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

        const usedRecuts = recutCounts[clip.id] || 0;
        const requiresCredit = usedRecuts >= MAX_FREE_RECUTS_PER_CLIP;
        if (requiresCredit) {
            if (!user) {
                toast.error('Please sign in to continue re-cutting clips.');
                return;
            }
            const { hasEnoughCredits } = await import('../../../services/payments/creditService');
            const ok = await hasEnoughCredits(user.id, 1);
            if (!ok) {
                triggerOutOfCreditsModal({ requiredCredits: 1, actionLabel: 'Additional Clip Re-cut' });
                toast.error('You used all 3 free re-cuts for this clip. You need 1 credit for additional re-cuts.');
                return;
            }
        }

        setRecuttingClipId(clip.id);
        try {
            const updated = await recutViralClip(videoFile, clip, trim.start, trim.end, options);
            setRecutCounts((prev) => ({ ...prev, [clip.id]: (prev[clip.id] || 0) + 1 }));
            if (requiresCredit && user) {
                const { deductCredits } = await import('../../../services/payments/creditService');
                await deductCredits(user.id, 'Clip Re-cut', 1, { feature: 'content_repurpose_recut' });
                await refreshCredits();
            }
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

    // Helper to convert a completed server background job into RepurposeResult
    const hydrateCompletedJob = (job: BackgroundJobStatus) => {
        const clips = Array.isArray(job.clips) ? job.clips : [];
        const avgScore =
            clips.length > 0
                ? clips.reduce((acc, c) => acc + (Number(c.virality_score) || 80), 0) / clips.length
                : 0;
        const startMs = job.created_at ? new Date(job.created_at).getTime() : Date.now();
        const endMs = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
        const elapsedSec = Math.max(1, (endMs - startMs) / 1000);
        const built: RepurposeResult = {
            repurposed_video: {
                id: job.id,
                user_id: user?.id || '',
                original_video_id: job.id,
                original_video_url: '',
                original_video_title: job.original_title || 'Video Repurpose',
                original_video_duration: clips.reduce((acc, c) => acc + (Number(c.duration) || 0), 0),
                status: 'completed',
                created_at: job.created_at || new Date().toISOString(),
                updated_at: job.completed_at || new Date().toISOString(),
            },
            clips,
            ml_analysis: {
                id: `ml_${job.id}`,
                repurposed_video_id: job.id,
                analysis_version: '2.0',
                scene_segments: [],
                viral_moments: [],
                processing_time_ms: elapsedSec * 1000,
                created_at: job.created_at || new Date().toISOString(),
            },
            statistics: {
                total_clips_generated: clips.length,
                average_virality_score: avgScore,
                processing_time_seconds: elapsedSec,
                storage_used_mb: clips.reduce((acc, c) => acc + ((c.metadata?.file_size || 0) / (1024 * 1024)), 0),
            },
        };
        setResults(built);
        onResultsGenerated?.(built);
    };

    // On mount, check if user has an active queued/processing background job (e.g. after closing & reopening tab)
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        fetchActiveRepurposeJobs()
            .then((data) => {
                if (cancelled || !data) return;
                if (data.queue) setQueueInfo(data.queue);
                const running = (data.jobs || []).find((j) => j.status === 'queued' || j.status === 'processing');
                if (running) {
                    setActiveJob(running);
                    setIsProcessing(true);
                    setProgress(running.progress || 10);
                    setProgressStatus(running.status_text || 'Processing in background...');
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [user]);

    // Poll active background job every 2.5 seconds while user keeps the page open
    useEffect(() => {
        if (!activeJob || (activeJob.status !== 'queued' && activeJob.status !== 'processing')) return;
        const jobId = activeJob.id;
        let stopped = false;

        const timer = window.setInterval(async () => {
            if (stopped) return;
            try {
                const polled = await pollRepurposeJob(jobId);
                if (stopped || !polled?.job) return;
                if (polled.queue) setQueueInfo(polled.queue);
                const updated = polled.job;
                setActiveJob(updated);
                setProgress(updated.progress || 15);
                setProgressStatus(updated.status_text || 'Encoding clips...');

                if (updated.status === 'completed') {
                    window.clearInterval(timer);
                    setIsProcessing(false);
                    setProgress(100);
                    hydrateCompletedJob(updated);
                    await refreshCredits();
                    toast.success(
                        `🎬 ${updated.clips.length} Full HD clips are ready & saved to My Library!`
                    );
                } else if (updated.status === 'failed') {
                    window.clearInterval(timer);
                    setIsProcessing(false);
                    toast.error(updated.error_message || 'Background clip processing failed.');
                }
            } catch {
                // keep polling on brief network hiccup
            }
        }, 2500);

        return () => {
            stopped = true;
            window.clearInterval(timer);
        };
    }, [activeJob?.id, activeJob?.status]);

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
        setAnalyzingThumbClipId(clip.id);
        try {
            let pickedImages: string[] = [];

            // 1. Only run AI best-shot vision scan if user has enough credits to generate a thumbnail (prevents 0-credit API abuse)
            let canRunAiScan = false;
            if (user) {
                try {
                    const { hasEnoughCredits, CREDIT_COSTS } = await import('../../../services/payments/creditService');
                    canRunAiScan = await hasEnoughCredits(user.id, CREDIT_COSTS.DESIGN_PER_VARIATION);
                } catch {
                    canRunAiScan = false;
                }
            }

            if (canRunAiScan && clip.clip_url) {
                try {
                    const dur = Math.max(2, Number(clip.duration) || 15);
                    const safeStart = dur > 3 ? 1.0 : 0.2;
                    const safeEnd = Math.max(safeStart + 0.8, dur - (dur > 3 ? 1.0 : 0.2));
                    const candidateFrames = await extractFramesFromVideo(clip.clip_url, safeStart, safeEnd, 6);
                    if (candidateFrames.length > 0) {
                        const bestFrames = await pickBestThumbnailShotsFromFrames(ai.current, candidateFrames, 3);
                        pickedImages = bestFrames.map((f) => f.url).filter(Boolean);
                    }
                } catch (scanErr) {
                    console.warn('Smart clip frame scan fallback:', scanErr);
                }
            }

            // 2. Fallback to clip thumbnail if scan didn't return frames
            if (pickedImages.length === 0) {
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
                        // ignore
                    }
                }

                if (!imageDataUrl && importedMeta?.frames?.length) {
                    imageDataUrl = importedMeta.frames[Math.floor(importedMeta.frames.length / 2)] || importedMeta.frames[0];
                }

                if (imageDataUrl) {
                    pickedImages = [imageDataUrl];
                }
            }

            onCreateCoverThumbnail({
                imageDataUrl: pickedImages[0] || '',
                images: pickedImages,
                title: clip.hook_title || clip.title || 'Viral Short',
                platform: clip.platform_format,
            });
        } finally {
            setAnalyzingThumbClipId(null);
        }
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
            triggerOutOfCreditsModal({
                requiredCredits: repurposeCreditCost,
                actionLabel: `Generating ${requestedClipCount} viral clips`,
            });
            toast.error(`Insufficient credits. You need ${repurposeCreditCost} credits to generate ${requestedClipCount} clips.`);
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

            // Submit to server-side background queue (safe to close tab + email notification when ready!)
            try {
                const submission = await submitBackgroundRepurposeJob(
                    ai.current,
                    videoBlob,
                    validVideoUrl,
                    user.id,
                    options,
                    importedMeta?.title || videoFile?.name,
                    notifyByEmail,
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

                setActiveJob({
                    id: submission.jobId,
                    status: submission.status,
                    queue_position: submission.queuePosition,
                    progress: submission.status === 'queued' ? 65 : 70,
                    status_text:
                        submission.queuePosition > 0
                            ? `In queue (position #${submission.queuePosition}) — safe to close this tab, we'll email you when ready!`
                            : `Encoding ${submission.clipCount} Full HD 1080p clip${submission.clipCount === 1 ? '' : 's'}...`,
                    original_title: submission.originalTitle,
                    user_email: submission.notifyEmail || user.email,
                    notify_email: notifyByEmail,
                    clips: [],
                });

                if (submission.queuePosition > 0) {
                    toast.info(
                        `Your video is in queue (#${submission.queuePosition}). You can close this tab — we'll email ${submission.notifyEmail || user.email} when ready!`
                    );
                } else {
                    toast.info(
                        notifyByEmail
                            ? `Encoding in background! Safe to close this tab — we'll email ${submission.notifyEmail || user.email} when ready.`
                            : 'Encoding your clips in Full HD 1080p...'
                    );
                }
            } finally {
                if (shouldRevokeBlobUrl) {
                    URL.revokeObjectURL(validVideoUrl);
                }
            }
        } catch (error: any) {
            console.error('Error repurposing video:', error);
            toast.error(`Failed to repurpose video: ${error.message || 'Unknown error'}`);
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

            {/* Email Notification Option */}
            <div
                style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#f8f5ff',
                    border: '1px solid #e4dcf2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                }}
            >
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                    <input
                        type="checkbox"
                        checked={notifyByEmail}
                        onChange={(e) => setNotifyByEmail(e.target.checked)}
                    />
                    <span>📧 Email me when clips are ready (safe to close this tab)</span>
                </label>
                {queueInfo && queueInfo.queued > 0 && (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '3px 9px', borderRadius: '999px' }}>
                        ⏳ High demand · {queueInfo.queued} video{queueInfo.queued === 1 ? '' : 's'} in queue
                    </span>
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
                {isProcessing && activeJob && (activeJob.status === 'queued' || activeJob.status === 'processing') && (
                    <div
                        style={{
                            width: '100%',
                            maxWidth: '560px',
                            margin: '0 auto',
                            padding: '14px 16px',
                            borderRadius: '12px',
                            background: activeJob.status === 'queued' ? '#fffbeb' : '#faf7ff',
                            border: activeJob.status === 'queued' ? '1px solid #fcd34d' : '1px solid #d8ccf0',
                            textAlign: 'left',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            <strong style={{ fontSize: '14px', color: activeJob.status === 'queued' ? '#92400e' : '#571c86' }}>
                                {activeJob.status === 'queued'
                                    ? `⏳ Your video is in queue${activeJob.queue_position > 0 ? ` (Position #${activeJob.queue_position})` : ''}`
                                    : '⚡ Processing your clips in Full HD 1080p'}
                            </strong>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#571c86' }}>{progress}%</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#374151', marginBottom: '6px' }}>
                            {progressStatus}
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#4b5563', lineHeight: 1.45 }}>
                            ✅ <strong>You can safely close this tab or keep working.</strong> Your finished clips will be saved in{' '}
                            <strong>My Library</strong>
                            {notifyByEmail && (activeJob.user_email || user?.email) ? (
                                <>
                                    {' '}and we&apos;ll send an email notification to <strong>{activeJob.user_email || user?.email}</strong> the moment they&apos;re ready.
                                </>
                            ) : (
                                '.'
                            )}
                        </div>
                    </div>
                )}
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
                                                            {busy
                                                                ? 'Re-cutting...'
                                                                : (recutCounts[clip.id] || 0) < MAX_FREE_RECUTS_PER_CLIP
                                                                  ? `✂️ Apply Trim & Re-cut (Free · ${MAX_FREE_RECUTS_PER_CLIP - (recutCounts[clip.id] || 0)} left)`
                                                                  : '✂️ Apply Trim & Re-cut (1 Credit)'}
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
                                                disabled={analyzingThumbClipId === clip.id}
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
                                                    cursor: analyzingThumbClipId === clip.id ? 'wait' : 'pointer',
                                                    opacity: analyzingThumbClipId === clip.id ? 0.75 : 1,
                                                }}
                                            >
                                                {analyzingThumbClipId === clip.id
                                                    ? '🔍 Finding sharpest face shots...'
                                                    : '🎨 Make Cover Thumbnail'}
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

