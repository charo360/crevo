/**
 * Video Processing Service using FFmpeg.wasm
 * 
 * This service handles:
 * - Video clipping/trimming
 * - Format conversion
 * - Aspect ratio conversion (9:16 for shorts, etc.)
 * - Resolution adjustment
 * - Audio extraction and processing
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { ClipMetadata } from '../../../types/repurpose';
import { getAuthToken } from '../../../lib/api';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// FFmpeg instance (singleton) + cached input file to avoid rewriting 100MB+ per clip
let ffmpegInstance: FFmpeg | null = null;
let isFFmpegLoaded = false;
let cachedInputFile: File | Blob | null = null;
const CACHED_INPUT_NAME = 'input.mp4';

// Server-side native FFmpeg upload cache (uploads once per video, cuts clips in ~1-2s each)
let serverFFmpegAvailable = true;
let serverUploadedFile: File | Blob | null = null;
let serverUploadId: string | null = null;

export async function clearCachedVideoInput(): Promise<void> {
    if (serverUploadId) {
        const idToDelete = serverUploadId;
        serverUploadId = null;
        serverUploadedFile = null;
        const token = getAuthToken();
        if (token) {
            fetch(`${API_BASE}/api/video/upload/${encodeURIComponent(idToDelete)}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
        }
    }
    if (ffmpegInstance && isFFmpegLoaded && cachedInputFile) {
        try {
            await ffmpegInstance.deleteFile(CACHED_INPUT_NAME);
        } catch {
            // ignore
        }
    }
    cachedInputFile = null;
}

async function processVideoClipOnServer(
    videoFile: File | Blob,
    startTime: number,
    endTime: number,
    options: {
        aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
        fps?: number;
        includeAudio?: boolean;
        includeTransitions?: boolean;
        includeCaptions?: boolean;
    }
): Promise<{ blob: Blob; metadata: ClipMetadata } | null> {
    if (!serverFFmpegAvailable) return null;
    const token = getAuthToken();
    if (!token) return null;

    if (serverUploadedFile !== videoFile || !serverUploadId) {
        const uploadRes = await fetch(`${API_BASE}/api/video/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
            },
            body: videoFile,
        });
        if (!uploadRes.ok) {
            const errData = await uploadRes.json().catch(() => ({}));
            throw new Error(errData?.error || `Video upload failed (${uploadRes.status})`);
        }
        const uploaded = await uploadRes.json();
        serverUploadId = uploaded.uploadId;
        serverUploadedFile = videoFile;
    }

    const duration = Math.max(1, endTime - startTime);
    const fps = options.fps || 30;
    const clipRes = await fetch(`${API_BASE}/api/video/clip`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            uploadId: serverUploadId,
            startTime,
            endTime,
            aspectRatio: options.aspectRatio || '9:16',
            fps,
            includeAudio: options.includeAudio !== false,
            includeTransitions: options.includeTransitions === true,
            includeCaptions: options.includeCaptions === true,
        }),
    });

    if (clipRes.status === 501) {
        serverFFmpegAvailable = false;
        return null;
    }

    if (!clipRes.ok) {
        const errData = await clipRes.json().catch(() => ({}));
        throw new Error(errData?.error || `Server clip failed (${clipRes.status})`);
    }

    const blob = await clipRes.blob();
    const width = clipRes.headers.get('X-Clip-Width') || '720';
    const height = clipRes.headers.get('X-Clip-Height') || '1280';
    const captionsApplied = clipRes.headers.get('X-Captions-Applied') === 'true';

    const metadata: ClipMetadata = {
        frame_count: Math.ceil(duration * fps),
        fps,
        resolution: `${width}x${height}`,
        file_size: blob.size,
        audio_enabled: options.includeAudio !== false,
        captions_enabled: captionsApplied,
    };

    return { blob, metadata };
}

/**
 * Initialize FFmpeg
 */
async function getFFmpeg(): Promise<FFmpeg> {
    if (ffmpegInstance && isFFmpegLoaded) {
        return ffmpegInstance;
    }

    const candidates = [
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm',
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
    ];

    let lastError: unknown = null;
    for (const baseURL of candidates) {
        try {
            const ffmpeg = new FFmpeg();
            await ffmpeg.load({
                coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
            });
            ffmpegInstance = ffmpeg;
            isFFmpegLoaded = true;
            return ffmpeg;
        } catch (err) {
            console.warn(`FFmpeg load failed from ${baseURL}, trying fallback...`, err);
            lastError = err;
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error('Failed to load FFmpeg video processor in browser');
}

/**
 * Process video file: clip, resize, convert format (optimized for speed in WASM)
 */
export async function processVideoClip(
    videoFile: File | Blob,
    startTime: number,
    endTime: number,
    options: {
        outputFormat?: 'mp4' | 'webm';
        aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
        resolution?: { width: number; height: number };
        fps?: number;
        includeAudio?: boolean;
        includeTransitions?: boolean;
        includeCaptions?: boolean;
    } = {}
): Promise<{ blob: Blob; metadata: ClipMetadata }> {
    // 1. Prefer fast native server-side FFmpeg (works on HTTP & HTTPS, handles large videos cleanly)
    try {
        const serverResult = await processVideoClipOnServer(videoFile, startTime, endTime, options);
        if (serverResult) {
            return serverResult;
        }
    } catch (serverErr: any) {
        console.warn('Server-side FFmpeg failed, attempting browser FFmpeg fallback:', serverErr?.message || serverErr);
    }

    // 2. Fallback to browser FFmpeg.wasm (e.g., local dev without native ffmpeg installed)
    const ffmpeg = await getFFmpeg();
    const inputFileName = CACHED_INPUT_NAME;
    const outputFileName = `output_${Date.now()}.${options.outputFormat || 'mp4'}`;
    
    try {
        // Write input file to FFmpeg filesystem ONLY ONCE per video
        if (cachedInputFile !== videoFile) {
            const videoData = await fetchFile(videoFile);
            await ffmpeg.writeFile(inputFileName, videoData);
            cachedInputFile = videoFile;
        }
        
        const duration = Math.max(1, endTime - startTime);
        
        // Use crisp 720p dimensions in WASM (4x faster encoding than 1080p with sharp mobile playback)
        let outputWidth = 720;
        let outputHeight = 1280;
        
        if (options.aspectRatio === '9:16') {
            outputWidth = 720;
            outputHeight = 1280;
        } else if (options.aspectRatio === '16:9') {
            outputWidth = 1280;
            outputHeight = 720;
        } else if (options.aspectRatio === '1:1') {
            outputWidth = 720;
            outputHeight = 720;
        } else if (options.aspectRatio === '4:5') {
            outputWidth = 720;
            outputHeight = 900;
        }
        
        const fps = options.fps || 30;
        const filterComplex = `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight}[v]`;
        
        // Put -ss BEFORE -i for fast keyframe seeking (10x faster than post-input seeking)
        const args = [
            '-ss', Math.max(0, startTime).toString(),
            '-i', inputFileName,
            '-t', duration.toString(),
            '-filter_complex', filterComplex,
            '-map', '[v]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '24',
            '-r', fps.toString(),
        ];
        
        if (options.includeAudio !== false) {
            args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
        }
        
        args.push(
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
            outputFileName
        );
        
        // Execute FFmpeg
        await ffmpeg.exec(args);
        
        // Read output file
        const outputData = await ffmpeg.readFile(outputFileName);
        const blob = new Blob([outputData], { type: `video/${options.outputFormat || 'mp4'}` });
        
        // Clean up output file only (keep cached inputFileName for subsequent clips)
        await ffmpeg.deleteFile(outputFileName);
        
        // Get metadata
        const metadata: ClipMetadata = {
            frame_count: Math.ceil(duration * fps),
            fps,
            resolution: `${outputWidth}x${outputHeight}`,
            file_size: blob.size,
            audio_enabled: options.includeAudio !== false,
            captions_enabled: false,
        };
        
        return { blob, metadata };
    } catch (error: any) {
        console.error('Error processing video clip:', error);
        throw new Error(`Failed to process video clip: ${error.message}`);
    }
}

/**
 * Get video metadata (duration, resolution, etc.)
 */
export async function getVideoMetadata(videoFile: File | Blob): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    codec: string;
}> {
    const url = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.src = url;
    
    return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
                fps: 30, // Default, would need actual detection
                bitrate: 0, // Would need actual detection
                codec: 'h264' // Default
            });
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load video metadata'));
        };
    });
}

/**
 * Generate thumbnail from video at specific timestamp using native HTML5 video + canvas
 * (instant, ~50ms, works on HTTP/HTTPS with zero FFmpeg.wasm overhead)
 */
export async function generateThumbnail(
    videoFile: File | Blob,
    timestamp: number,
    width: number = 640,
    height: number = 360
): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(videoFile);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = url;

        const cleanup = () => {
            video.onloadedmetadata = null;
            video.onseeked = null;
            video.onerror = null;
            URL.revokeObjectURL(url);
        };

        const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error('Thumbnail generation timed out'));
        }, 15000);

        video.onloadedmetadata = () => {
            const safeTime = Number.isFinite(video.duration) && video.duration > 0
                ? Math.min(Math.max(0, timestamp), Math.max(0, video.duration - 0.1))
                : 0;
            video.currentTime = safeTime;
        };

        video.onseeked = () => {
            window.clearTimeout(timeoutId);
            try {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    cleanup();
                    reject(new Error('Canvas 2D context unavailable'));
                    return;
                }

                const vw = video.videoWidth || width;
                const vh = video.videoHeight || height;
                const scale = Math.max(width / vw, height / vh);
                const drawW = vw * scale;
                const drawH = vh * scale;
                const dx = (width - drawW) / 2;
                const dy = (height - drawH) / 2;

                ctx.drawImage(video, dx, dy, drawW, drawH);
                canvas.toBlob(
                    (blob) => {
                        cleanup();
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to encode thumbnail JPEG'));
                        }
                    },
                    'image/jpeg',
                    0.85
                );
            } catch (err: any) {
                cleanup();
                reject(new Error(`Failed to draw video thumbnail: ${err?.message || err}`));
            }
        };

        video.onerror = () => {
            window.clearTimeout(timeoutId);
            cleanup();
            reject(new Error('Failed to load video for thumbnail'));
        };
    });
}

/**
 * Extract frames from video at specific timestamps
 */
export async function extractFramesAtTimes(
    videoFile: File | Blob,
    timestamps: number[]
): Promise<{ timestamp: number; blob: Blob }[]> {
    const ffmpeg = await getFFmpeg();
    const inputFileName = 'input.mp4';
    
    try {
        const videoData = await fetchFile(videoFile);
        await ffmpeg.writeFile(inputFileName, videoData);
        
        const frames: { timestamp: number; blob: Blob }[] = [];
        
        for (const timestamp of timestamps) {
            const outputFileName = `frame_${timestamp}.jpg`;
            
            await ffmpeg.exec([
                '-i', inputFileName,
                '-ss', timestamp.toString(),
                '-vframes', '1',
                '-q:v', '2', // High quality
                outputFileName
            ]);
            
            const frameData = await ffmpeg.readFile(outputFileName);
            const blob = new Blob([frameData], { type: 'image/jpeg' });
            frames.push({ timestamp, blob });
            
            await ffmpeg.deleteFile(outputFileName);
        }
        
        await ffmpeg.deleteFile(inputFileName);
        
        return frames;
    } catch (error: any) {
        console.error('Error extracting frames:', error);
        throw new Error(`Failed to extract frames: ${error.message}`);
    }
}

/**
 * Convert video URL to File/Blob
 */
export async function videoUrlToBlob(videoUrl: string): Promise<Blob> {
    try {
        const response = await fetch(videoUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch video: ${response.statusText}`);
        }
        return await response.blob();
    } catch (error: any) {
        console.error('Error converting video URL to blob:', error);
        throw new Error(`Failed to convert video URL to blob: ${error.message}`);
    }
}

