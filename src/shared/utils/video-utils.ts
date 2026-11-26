import { ImageAsset } from '../../types';
import { getAuthToken } from '../../lib/api';

const MAX_FRAME_WIDTH = 1024;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3g2|mpeg|mpg|ts|mts|m2ts|ogg|ogv|flv|wmv|hevc)$/i;
const NON_VIDEO_EXT_RE = /\.(jpg|jpeg|png|gif|webp|heic|heif|svg|pdf|txt|doc|docx|zip|mp3|wav|m4a)$/i;

/**
 * Mobile-safe video file check.
 * Android Gallery/Files and iOS Safari frequently report an empty MIME type ("")
 * or "application/octet-stream" or generic content names for valid phone videos.
 */
export function isSupportedVideoFile(file: File): boolean {
    if (!file) return false;
    const type = (file.type || '').toLowerCase().trim();
    const name = (file.name || '').trim();
    if (type.startsWith('video/')) return true;
    if (VIDEO_EXT_RE.test(name)) return true;
    if (type.startsWith('image/') || type.startsWith('text/') || type === 'application/pdf') return false;
    if (!NON_VIDEO_EXT_RE.test(name)) return true;
    return false;
}

async function extractFramesViaServerFFmpeg(
    sourceFile: File | Blob,
    startTime: number,
    endTime: number,
    frameCount: number
): Promise<ImageAsset[]> {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Please sign in to process this video format.');
    }
    const params = new URLSearchParams({
        start: String(Math.max(0, startTime || 0)),
        end: String(Math.max(0, endTime || 0)),
        count: String(Math.min(8, Math.max(1, frameCount || 5))),
    });
    const res = await fetch(`/api/video/extract-frames?${params.toString()}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
        },
        body: sourceFile,
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Could not extract frames from this video.');
    }
    const data = await res.json();
    if (!Array.isArray(data?.frames) || data.frames.length === 0) {
        throw new Error('Could not extract any frames from this video.');
    }
    return data.frames as ImageAsset[];
}

function extractFramesInBrowser(
    videoUrl: string,
    startTime: number,
    endTime: number,
    frameCount: number
): Promise<ImageAsset[]> {
    return new Promise((resolve, reject) => {
        if (!videoUrl || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            reject(new Error('Please upload a local video file (.mp4, .mov, .webm) to extract frames.'));
            return;
        }

        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.style.position = 'fixed';
        video.style.opacity = '0';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.pointerEvents = 'none';
        video.style.left = '-9999px';
        document.body.appendChild(video);

        if (!videoUrl.startsWith('blob:') && !videoUrl.startsWith('data:')) {
            video.crossOrigin = 'anonymous';
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const frames: ImageAsset[] = [];

        let started = false;
        let framesExtracted = 0;
        let settled = false;
        let effectiveStart = Math.max(0, startTime || 0);
        let effectiveEnd = endTime || 0;
        let interval = 0;

        const cleanup = () => {
            video.onloadedmetadata = null;
            video.onloadeddata = null;
            video.onseeked = null;
            video.onerror = null;
            try {
                video.pause();
                video.removeAttribute('src');
                video.load();
                if (video.parentNode) video.parentNode.removeChild(video);
            } catch {
                // ignore
            }
        };

        const finishOk = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(frames);
        };

        const finishErr = (msg: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (frames.length > 0) {
                resolve(frames);
            } else {
                reject(new Error(msg));
            }
        };

        const captureCurrentFrame = () => {
            if (frames.length >= frameCount || settled) return;
            try {
                context?.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                frames.push({
                    id: `frame_${Date.now()}_${framesExtracted}`,
                    url: dataUrl,
                    base64: dataUrl.split(',')[1],
                    mimeType: 'image/jpeg',
                });
                framesExtracted++;
                seekNext(framesExtracted);
            } catch (err) {
                finishErr(`Error extracting frame: ${err}`);
            }
        };

        const seekNext = (index: number) => {
            if (index >= frameCount || settled) {
                finishOk();
                return;
            }
            const rawTime = effectiveStart + index * interval;
            const maxSeek = Math.max(0, (video.duration || effectiveEnd) - 0.05);
            const seekTime = Math.min(Math.max(0, rawTime), maxSeek);

            if (Math.abs(video.currentTime - seekTime) < 0.02 && video.readyState >= 2) {
                captureCurrentFrame();
            } else {
                try {
                    video.currentTime = seekTime;
                } catch {
                    finishErr('Browser could not seek this mobile video.');
                }
            }
        };

        const beginExtraction = () => {
            if (started || settled) return;
            started = true;

            const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
            effectiveStart = Math.max(0, Math.min(startTime || 0, duration));
            effectiveEnd = endTime && endTime > effectiveStart ? Math.min(endTime, duration) : duration;
            interval = frameCount > 1 ? (effectiveEnd - effectiveStart) / (frameCount - 1) : 0;

            const naturalWidth = video.videoWidth || 1280;
            const naturalHeight = video.videoHeight || 720;
            const scale = naturalWidth > MAX_FRAME_WIDTH ? MAX_FRAME_WIDTH / naturalWidth : 1;
            canvas.width = Math.max(1, Math.round(naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(naturalHeight * scale));

            video.onseeked = captureCurrentFrame;
            // On iOS Safari, nudging currentTime slightly forces first frame decode
            const firstSeek = Math.min(Math.max(0.05, effectiveStart), Math.max(0, duration - 0.05));
            try {
                video.currentTime = firstSeek;
            } catch {
                seekNext(0);
            }
        };

        video.onloadedmetadata = beginExtraction;
        video.onloadeddata = beginExtraction;
        video.onerror = () => {
            finishErr('Browser could not decode this video format.');
        };

        video.src = videoUrl;
        video.load();

        setTimeout(() => {
            if (!settled) {
                finishErr('Browser video decoding timed out.');
            }
        }, 12000);
    });
}

export const extractFramesFromVideo = async (
    videoUrl: string,
    startTime: number,
    endTime: number,
    frameCount: number,
    sourceFile?: File | Blob
): Promise<ImageAsset[]> => {
    try {
        return await extractFramesInBrowser(videoUrl, startTime, endTime, frameCount);
    } catch (browserErr: any) {
        console.warn('[Frame Extraction] Browser decoder failed, trying server FFmpeg fallback:', browserErr?.message);
        if (sourceFile) {
            return await extractFramesViaServerFFmpeg(sourceFile, startTime, endTime, frameCount);
        }
        throw new Error('Could not decode this video in your mobile browser. Please try again.');
    }
};
