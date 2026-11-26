import { ImageAsset } from '../../types';

const MAX_FRAME_WIDTH = 1024;
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3g2|mpeg|mpg|ts|mts|m2ts|ogg|ogv|flv|wmv)$/i;
const NON_VIDEO_EXT_RE = /\.(jpg|jpeg|png|gif|webp|heic|heif|svg|pdf|txt|doc|docx|zip|mp3|wav|m4a)$/i;

/**
 * Mobile-safe video file check.
 * Android Gallery/Files and iOS Safari frequently report an empty MIME type ("")
 * or "application/octet-stream" for valid .mp4/.mov videos.
 */
export function isSupportedVideoFile(file: File): boolean {
    if (!file) return false;
    const type = (file.type || '').toLowerCase().trim();
    const name = (file.name || '').trim();
    if (type.startsWith('video/')) return true;
    if (VIDEO_EXT_RE.test(name)) return true;
    if ((!type || type === 'application/octet-stream') && !NON_VIDEO_EXT_RE.test(name)) {
        return true;
    }
    return false;
}

export const extractFramesFromVideo = (
    videoUrl: string,
    startTime: number,
    endTime: number,
    frameCount: number
): Promise<ImageAsset[]> => {
    return new Promise((resolve, reject) => {
        if (!videoUrl || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            reject(new Error('Please upload a local video file (.mp4, .mov, .webm) to extract frames.'));
            return;
        }

        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        if (!videoUrl.startsWith('blob:') && !videoUrl.startsWith('data:')) {
            video.crossOrigin = 'anonymous';
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const frames: ImageAsset[] = [];

        let loaded = false;
        let framesExtracted = 0;
        let errorOccurred = false;
        let effectiveStart = Math.max(0, startTime || 0);
        let effectiveEnd = endTime || 0;
        let interval = 0;

        const cleanup = () => {
            video.onloadedmetadata = null;
            video.onloadeddata = null;
            video.onseeked = null;
            video.onerror = null;
            video.src = '';
        };

        const captureCurrentFrame = () => {
            if (frames.length >= frameCount || errorOccurred) return;
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
                console.error('[Frame Extraction] Error drawing frame:', err);
                errorOccurred = true;
                cleanup();
                reject(new Error(`Error extracting frame: ${err}`));
            }
        };

        const seekNext = (index: number) => {
            if (index >= frameCount || errorOccurred) {
                cleanup();
                resolve(frames);
                return;
            }
            const rawTime = effectiveStart + index * interval;
            const maxSeek = Math.max(0, (video.duration || effectiveEnd) - 0.05);
            const seekTime = Math.min(Math.max(0, rawTime), maxSeek);

            // If video is already at seekTime (e.g. 0.00s), Chromium may not fire onseeked — capture immediately
            if (Math.abs(video.currentTime - seekTime) < 0.02) {
                captureCurrentFrame();
            } else {
                video.currentTime = seekTime;
            }
        };

        video.onloadeddata = () => {
            if (loaded || errorOccurred) return;
            loaded = true;

            const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
            effectiveStart = Math.max(0, Math.min(startTime || 0, duration));
            effectiveEnd = endTime && endTime > effectiveStart ? Math.min(endTime, duration) : duration;
            interval = frameCount > 1 ? (effectiveEnd - effectiveStart) / (frameCount - 1) : 0;

            const naturalWidth = video.videoWidth || 1280;
            const naturalHeight = video.videoHeight || 720;
            const scale = naturalWidth > MAX_FRAME_WIDTH ? MAX_FRAME_WIDTH / naturalWidth : 1;
            canvas.width = Math.round(naturalWidth * scale);
            canvas.height = Math.round(naturalHeight * scale);

            video.onseeked = captureCurrentFrame;
            seekNext(0);
        };

        video.onerror = () => {
            if (errorOccurred) return;
            errorOccurred = true;
            cleanup();
            if (frames.length > 0) {
                resolve(frames);
            } else {
                reject(new Error('Could not read video file for frame extraction. Please try an MP4 or WebM video.'));
            }
        };

        video.src = videoUrl;
        video.load();

        setTimeout(() => {
            if (!loaded && !errorOccurred) {
                errorOccurred = true;
                cleanup();
                reject(new Error('Video loading timed out. Please try a smaller video file.'));
            }
        }, 30000);
    });
};
