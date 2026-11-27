/**
 * Content Repurposing Service
 * 
 * Orchestrates the entire repurposing pipeline:
 * 1. Upload/process video
 * 2. Run ML analysis for viral moments
 * 3. Generate clips from viral moments
 * 4. Save to database
 * 5. Return results
 */

import { GoogleGenAI } from "@google/genai";
import { 
    RepurposedVideo, 
    ViralClip, 
    MLAnalysis, 
    RepurposeResult,
    ClipGenerationOptions,
    RepurposeMetadata 
} from '../../../types/repurpose';
import { analyzeVideoForViralMoments } from '../../../core/algorithms/content-analysis/viral-detection';
import { processVideoClip, getVideoMetadata, generateThumbnail, clearCachedVideoInput, ensureServerVideoUpload } from '../../../core/processors/video';
import { getAuthToken } from '../../../lib/api';
import { saveRepurposedVideo, saveViralClips, saveMLAnalysis } from './repurposeDatabase';
import { saveVideoClipToLibrary } from '../../../services/libraryService';
import { extractFramesFromVideo } from '../../../shared/utils/video-utils';
import { fetchTranscript } from '../../../shared/utils/youtube-utils';
import { imageGenRateLimiter } from '../../../core/infrastructure/rate-limiting';
import { toast } from 'react-toastify';

const DEFAULT_OPTIONS: ClipGenerationOptions = {
    min_duration: 15,
    max_duration: 45,
    target_clip_count: 3,
    platforms: ['youtube_shorts', 'tiktok', 'instagram_reels'],
    include_captions: true,
    include_transitions: true,
    virality_threshold: 65,
    overlap_prevention: true,
};

/**
 * Main repurpose function - processes video and generates clips
 */
export async function repurposeVideo(
    ai: GoogleGenAI,
    videoFile: File | Blob,
    videoUrl: string,
    userId: string,
    options: Partial<ClipGenerationOptions> = {},
    originalTitle?: string,
    transcript?: string | null,
    onProgress?: (current: number, total: number, statusText?: string) => void,
    preloaded?: {
        duration: number;
        width: number;
        height: number;
        frames: string[];
        fileSize?: number;
    }
): Promise<RepurposeResult> {
    const jobStartTime = Date.now();
    const finalOptions = { ...DEFAULT_OPTIONS, ...options };
    
    try {
        // Step 1: Get video metadata (reuse server-probed metadata for YouTube imports)
        onProgress?.(5, 100, 'Reading video metadata...');
        toast.info('Analyzing video...');
        const metadata = preloaded
            ? { duration: preloaded.duration, width: preloaded.width, height: preloaded.height }
            : await getVideoMetadata(videoFile);
        
        // Step 2: Extract 8-14 evenly spaced frames for fast single-pass AI analysis
        onProgress?.(12, 100, 'Extracting preview frames...');
        const targetFrames = Math.min(14, Math.max(6, Math.ceil(metadata.duration / 10)));
        const frames =
            preloaded && Array.isArray(preloaded.frames) && preloaded.frames.length > 0
                ? preloaded.frames
                : await extractFramesFromVideo(
                      videoUrl,
                      0,
                      metadata.duration,
                      targetFrames,
                      videoFile
                  );
        onProgress?.(20, 100, 'AI detecting top viral moments...');
        
        // Step 3: Fetch transcript if not provided and URL is YouTube
        let videoTranscript = transcript;
        if (!videoTranscript && (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be'))) {
            try {
                videoTranscript = await fetchTranscript(videoUrl);
            } catch (error) {
                console.warn('Failed to fetch transcript:', error);
            }
        }
        
        // Step 4: Create repurposed video record first to get ID
        const repurposeMetadata: RepurposeMetadata = {
            video_format: videoFile.type || 'video/mp4',
            resolution: `${metadata.width}x${metadata.height}`,
            file_size: videoFile.size,
            source_platform: detectSourcePlatform(videoUrl),
            source_url: videoUrl,
        };
        
        const repurposedVideo: RepurposedVideo = {
            id: `repurpose_${Date.now()}_${userId}`,
            user_id: userId,
            original_video_id: `original_${Date.now()}`,
            original_video_url: videoUrl,
            original_video_title: originalTitle,
            original_video_duration: metadata.duration,
            status: 'processing',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: repurposeMetadata,
        };
        
        // Step 5: Run ML analysis to find viral moments
        onProgress?.(22, 100, 'AI detecting top viral moments...');
        toast.info('Identifying viral moments...');
        const mlAnalysis = await analyzeVideoForViralMoments(
            ai,
            videoUrl,
            metadata.duration,
            videoTranscript,
            frames,
            repurposedVideo.id,
            originalTitle
        );
        onProgress?.(30, 100, 'Uploading video (0%)...');
        
        // Step 6: Filter viral moments by threshold and generate clips
        toast.info('Generating clips...');
        const filteredMoments = mlAnalysis.viral_moments
            .filter(m => m.virality_score >= finalOptions.virality_threshold)
            .slice(0, finalOptions.target_clip_count);
        
        if (filteredMoments.length === 0) {
            toast.warning('No viral moments found above threshold. Generating clips from top moments...');
            // Fallback to top moments even if below threshold
            const topMoments = mlAnalysis.viral_moments
                .sort((a, b) => b.virality_score - a.virality_score)
                .slice(0, finalOptions.target_clip_count);
            filteredMoments.push(...topMoments);
        }
        
        // Step 7: Generate clips — group platforms by aspect ratio so identical 9:16 platforms only encode ONCE!
        const clips: ViralClip[] = [];
        const selectedRanges: Array<{ start: number; end: number }> = [];
        const aspectGroups = new Map<string, string[]>();
        for (const p of finalOptions.platforms) {
            const aspect = getPlatformSettings(p).aspectRatio;
            if (!aspectGroups.has(aspect)) {
                aspectGroups.set(aspect, []);
            }
            aspectGroups.get(aspect)!.push(p);
        }
        const uniqueAspectGroups = Array.from(aspectGroups.entries()).map(([aspect, platforms]) => ({
            aspect,
            primaryPlatform: platforms[0],
            platforms,
        }));
        const totalClips = filteredMoments.length * uniqueAspectGroups.length;
        let processedClips = 0;

        const clipVerb = finalOptions.include_captions ? 'Cutting & captioning' : 'Cutting';
        let clipIndex = 0;

        for (const moment of filteredMoments) {
            if (finalOptions.overlap_prevention) {
                const start = Number(moment.start_time) || 0;
                const end = Number(moment.end_time) || start + 1;
                const overlaps = selectedRanges.some((r) => start < r.end - 0.5 && end > r.start + 0.5);
                if (overlaps) {
                    continue;
                }
                selectedRanges.push({ start, end });
            }

            for (const group of uniqueAspectGroups) {
                const platform = group.primaryPlatform;
                clipIndex++;
                const currentClipNum = clipIndex;
                const clipStartPct = 62 + Math.round(((currentClipNum - 1) / Math.max(1, totalClips)) * 32);
                const clipEndPct = 62 + Math.round((currentClipNum / Math.max(1, totalClips)) * 32);

                if (currentClipNum > 1) {
                    onProgress?.(clipStartPct, 100, `${clipVerb} clip ${currentClipNum} of ${totalClips}...`);
                }

                try {
                    const clip = await generateClipFromMoment(
                        videoFile,
                        moment,
                        platform,
                        finalOptions,
                        repurposedVideo.id,
                        (uploadPct) => {
                            const mapped = 30 + Math.round((uploadPct / 100) * 32); // 30% -> 62%
                            if (uploadPct < 100) {
                                onProgress?.(mapped, 100, `Uploading video (${uploadPct}%)...`);
                            } else {
                                onProgress?.(62, 100, `${clipVerb} clip ${currentClipNum} of ${totalClips}...`);
                            }
                        }
                    );
                    (clip.metadata as any).target_platforms = group.platforms;
                    clips.push(clip);
                    processedClips++;
                    onProgress?.(clipEndPct, 100, `Finished clip ${processedClips} of ${totalClips}`);
                } catch (error: any) {
                    console.error(`Error generating clip for platform ${platform}:`, error);
                    toast.warning(`Failed to generate clip for ${platform}: ${error?.message || 'processing error'}`);
                }
            }
        }
        
        // Step 8: Update ML analysis with repurposed video ID
        mlAnalysis.repurposed_video_id = repurposedVideo.id;
        onProgress?.(95, 100, 'Saving clips...');
        
        // Step 9: Save to database
        toast.info('Saving results...');
        await saveRepurposedVideo(repurposedVideo);
        await saveMLAnalysis(mlAnalysis);
        await saveViralClips(clips);
        onProgress?.(100, 100, 'Done!');
        
        // Step 10: Update status to completed
        repurposedVideo.status = 'completed';
        repurposedVideo.ml_analysis_id = mlAnalysis.id;
        repurposedVideo.updated_at = new Date().toISOString();
        await saveRepurposedVideo(repurposedVideo);
        
        // Step 11: Calculate statistics
        const averageVirality = clips.length > 0
            ? clips.reduce((sum, c) => sum + c.virality_score, 0) / clips.length
            : 0;
        
        const totalOutputSize = clips.reduce((sum, c) => sum + (c.metadata?.file_size || 0), 0);
        
        const statistics = {
            total_clips_generated: clips.length,
            average_virality_score: averageVirality,
            processing_time_seconds: (Date.now() - jobStartTime) / 1000,
            total_output_size: totalOutputSize,
        };
        
        toast.success(`Successfully generated ${clips.length} viral clips!`);
        
        return {
            repurposed_video: repurposedVideo,
            clips,
            ml_analysis: mlAnalysis,
            statistics,
        };
    } catch (error: any) {
        console.error('Error in repurposeVideo:', error);
        toast.error(`Failed to repurpose video: ${error.message}`);
        throw error;
    } finally {
        // Keep server upload cached briefly so the user can nudge Start/End and Re-cut any clip in ~2s
    }
}

/**
 * Re-cut an existing clip with adjusted Start/End timestamps (fast ~2s server FFmpeg re-cut)
 */
export async function recutViralClip(
    videoFile: File | Blob,
    clip: ViralClip,
    newStart: number,
    newEnd: number,
    options: ClipGenerationOptions
): Promise<ViralClip> {
    const startTime = Math.max(0, Number(newStart) || 0);
    const endTime = Math.max(startTime + 2, Number(newEnd) || startTime + 15);
    const clipDuration = endTime - startTime;
    const platformSettings = getPlatformSettings(clip.platform_format);

    const { blob, metadata } = await processVideoClip(videoFile, startTime, endTime, {
        outputFormat: 'mp4',
        aspectRatio: clip.aspect_ratio || platformSettings.aspectRatio,
        resolution: platformSettings.resolution,
        fps: 30,
        includeAudio: true,
        includeTransitions: options.include_transitions,
        includeCaptions: options.include_captions,
        captionStyle: options.caption_style || 'hormozi',
        captionPosition: options.caption_position || 'bottom',
        cropMode: options.crop_mode || 'center',
    });

    let thumbnailUrl = '';
    try {
        const thumbnailBlob = await generateThumbnail(blob, Math.max(2, clipDuration * 0.35));
        thumbnailUrl = URL.createObjectURL(thumbnailBlob);
    } catch (thumbErr) {
        console.warn('Re-cut thumbnail generation skipped:', thumbErr);
    }
    const clipUrl = URL.createObjectURL(blob);

    saveVideoClipToLibrary(blob, {
        title: `Re-cut Clip (${Math.round(startTime)}s-${Math.round(endTime)}s)`,
        platform: clip.platform_format.replace('_', ' '),
        aspectRatio: clip.aspect_ratio || platformSettings.aspectRatio,
    });

    return {
        ...clip,
        clip_url: clipUrl,
        thumbnail_url: thumbnailUrl,
        start_time: startTime,
        end_time: endTime,
        duration: clipDuration,
        metadata,
    };
}

/**
 * Generate a clip from a viral moment
 */
async function generateClipFromMoment(
    videoFile: File | Blob,
    moment: any,
    platform: string,
    options: ClipGenerationOptions,
    repurposedVideoId: string,
    onUploadProgress?: (percent: number) => void
): Promise<ViralClip> {
    // Determine platform-specific settings
    const platformSettings = getPlatformSettings(platform);
    
    // Use the clip suggestion from ML analysis if available
    const suggestion = moment.clip_suggestions?.[0] || {
        start_time: moment.start_time,
        end_time: moment.end_time,
        optimal_duration: moment.duration,
    };
    
    // Ensure duration is within bounds
    const clipDuration = Math.min(
        options.max_duration,
        Math.max(options.min_duration, suggestion.optimal_duration)
    );
    
    const startTime = suggestion.start_time;
    const endTime = Math.min(startTime + clipDuration, moment.end_time);
    
    // Process video clip
    const { blob, metadata } = await processVideoClip(
        videoFile,
        startTime,
        endTime,
        {
            outputFormat: 'mp4',
            aspectRatio: platformSettings.aspectRatio,
            resolution: platformSettings.resolution,
            fps: 30,
            includeAudio: true,
            includeTransitions: options.include_transitions,
            includeCaptions: options.include_captions,
            captionStyle: options.caption_style || 'hormozi',
            captionPosition: options.caption_position || 'bottom',
            cropMode: options.crop_mode || 'center',
            onUploadProgress,
        }
    );
    
    // Generate thumbnail from the actual generated clip blob (works for both local uploads and YouTube imports)
    let thumbnailUrl = '';
    try {
        const thumbnailBlob = await generateThumbnail(blob, Math.max(2, clipDuration * 0.35));
        thumbnailUrl = URL.createObjectURL(thumbnailBlob);
    } catch (thumbErr) {
        console.warn('Clip thumbnail generation skipped:', thumbErr);
    }
    
    // Create clip URL (in production, upload to storage)
    const clipUrl = URL.createObjectURL(blob);

    // Fire-and-forget save to user's 7-day temporary cloud library
    saveVideoClipToLibrary(blob, {
        title: `Viral Clip (${Math.round(startTime)}s-${Math.round(endTime)}s)`,
        platform: platform.replace('_', ' '),
        aspectRatio: platformSettings.aspectRatio,
    });
    
    // Use AI-generated human creator hook title, casual caption, and topic-specific hashtags
    const platformPrimaryTag: Record<string, string> = {
        youtube_shorts: '#shorts',
        tiktok: '#fyp',
        instagram_reels: '#reels',
        twitter: '#video',
    };
    const fallbackTagsMap: Record<string, string[]> = {
        youtube_shorts: ['#shorts', '#youtubeshorts', '#viral'],
        tiktok: ['#fyp', '#tiktok', '#viral'],
        instagram_reels: ['#reels', '#instagramreels', '#explore'],
        twitter: ['#video', '#highlights', '#trending'],
    };
    const aiTags: string[] = Array.isArray(moment.hashtags) && moment.hashtags.length > 0 ? moment.hashtags : [];
    const primaryTag = platformPrimaryTag[platform] || '#shorts';
    const mergedTags = aiTags.length > 0
        ? Array.from(new Set([...aiTags, primaryTag])).slice(0, 6)
        : (fallbackTagsMap[platform] || ['#shorts', '#viral']);

    const hookTitle =
        (moment.hook_title && String(moment.hook_title).trim()) ||
        `Don't Miss This Moment (${Math.round(startTime)}s)`;
    const socialCaption =
        (moment.social_caption && String(moment.social_caption).trim()) ||
        '';
    
    const clip: ViralClip = {
        id: `clip_${Date.now()}_${platform}_${Math.random().toString(36).substr(2, 9)}`,
        repurposed_video_id: repurposedVideoId,
        clip_url: clipUrl,
        clip_storage_path: '', // Would be set after uploading to storage
        start_time: startTime,
        end_time: endTime,
        duration: clipDuration,
        virality_score: moment.virality_score,
        engagement_score: Math.round(moment.confidence * 100),
        title: hookTitle,
        hook_title: hookTitle,
        description: socialCaption,
        hashtags: mergedTags,
        thumbnail_url: thumbnailUrl,
        transcript_snippet: socialCaption || moment.reasoning || '',
        platform_format: platform as any,
        aspect_ratio: platformSettings.aspectRatio,
        created_at: new Date().toISOString(),
        metadata: {
            ...metadata,
            captions_enabled: options.include_captions,
            transitions: options.include_transitions ? ['fade'] : undefined,
        },
    };
    
    return clip;
}

/**
 * Get platform-specific settings
 */
function getPlatformSettings(platform: string): {
    aspectRatio: '9:16' | '16:9' | '1:1' | '4:5';
    resolution: { width: number; height: number };
} {
    switch (platform) {
        case 'youtube_shorts':
        case 'tiktok':
        case 'instagram_reels':
            return {
                aspectRatio: '9:16',
                resolution: { width: 1080, height: 1920 },
            };
        case 'twitter':
            return {
                aspectRatio: '16:9',
                resolution: { width: 1280, height: 720 },
            };
        default:
            return {
                aspectRatio: '16:9',
                resolution: { width: 1920, height: 1080 },
            };
    }
}

/**
 * Detect source platform from URL
 */
function detectSourcePlatform(url: string): RepurposeMetadata['source_platform'] {
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return 'youtube';
    } else if (url.includes('vimeo.com')) {
        return 'vimeo';
    } else if (url.includes('zoom.us')) {
        return 'zoom';
    } else if (url.includes('drive.google.com')) {
        return 'google_drive';
    } else {
        return 'direct_upload';
    }
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function attachTokenToLibraryClipUrls(clips: any[]): ViralClip[] {
    const token = getAuthToken();
    return (clips || []).map((c) => {
        let clipUrl = String(c.clip_url || '');
        if (clipUrl.startsWith('/api/library/file/') && token && !clipUrl.includes('token=')) {
            clipUrl = `${API_BASE}${clipUrl}?token=${encodeURIComponent(token)}`;
        }
        return {
            ...c,
            clip_url: clipUrl,
        };
    });
}

export interface BackgroundJobSubmission {
    jobId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    queuePosition: number;
    notifyEmail: string;
    originalTitle: string;
    clipCount: number;
}

export interface BackgroundJobStatus {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    queue_position: number;
    progress: number;
    status_text: string;
    original_title?: string;
    user_email?: string;
    notify_email?: boolean;
    email_sent?: boolean;
    clips: ViralClip[];
    error_message?: string;
    created_at?: string;
    completed_at?: string;
}

/**
 * Analyze video for viral moments, upload once, and submit a server-side background encoding job.
 * Users can safely close their browser tab — clips are saved to My Library and an email is sent when done!
 */
export async function submitBackgroundRepurposeJob(
    ai: GoogleGenAI,
    videoFile: File | Blob,
    videoUrl: string,
    userId: string,
    options: Partial<ClipGenerationOptions> = {},
    originalTitle?: string,
    notifyByEmail: boolean = true,
    onProgress?: (current: number, total: number, statusText?: string) => void,
    preloaded?: {
        duration: number;
        width: number;
        height: number;
        frames: string[];
        fileSize?: number;
    }
): Promise<BackgroundJobSubmission> {
    const token = getAuthToken();
    if (!token) {
        throw new Error('Please sign in to repurpose videos.');
    }

    const finalOptions = { ...DEFAULT_OPTIONS, ...options };

    // 1. Metadata & preview frames
    onProgress?.(5, 100, 'Reading video metadata...');
    const metadata = preloaded
        ? { duration: preloaded.duration, width: preloaded.width, height: preloaded.height }
        : await getVideoMetadata(videoFile);

    onProgress?.(12, 100, 'Extracting preview frames...');
    const targetFrames = Math.min(14, Math.max(6, Math.ceil(metadata.duration / 10)));
    const frames =
        preloaded && Array.isArray(preloaded.frames) && preloaded.frames.length > 0
            ? preloaded.frames
            : await extractFramesFromVideo(videoUrl, 0, metadata.duration, targetFrames, videoFile);

    // 2. YouTube transcript if applicable
    let videoTranscript: string | null = null;
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        try {
            videoTranscript = await fetchTranscript(videoUrl);
        } catch {
            // optional
        }
    }

    // 3. AI viral moment detection + human titles & hashtags
    onProgress?.(22, 100, 'AI finding top viral moments & writing titles...');
    const mlAnalysis = await analyzeVideoForViralMoments(
        ai,
        videoUrl,
        metadata.duration,
        videoTranscript,
        frames,
        `repurpose_${Date.now()}_${userId}`,
        originalTitle
    );

    const filteredMoments = mlAnalysis.viral_moments
        .filter((m) => m.virality_score >= finalOptions.virality_threshold)
        .slice(0, finalOptions.target_clip_count);

    if (filteredMoments.length === 0) {
        filteredMoments.push(
            ...mlAnalysis.viral_moments
                .sort((a, b) => b.virality_score - a.virality_score)
                .slice(0, finalOptions.target_clip_count)
        );
    }

    // Group platforms by aspect ratio so identical 9:16 platforms only encode ONCE
    const aspectGroups = new Map<string, string[]>();
    for (const p of finalOptions.platforms) {
        const aspect = getPlatformSettings(p).aspectRatio;
        const list = aspectGroups.get(aspect) || [];
        list.push(p);
        aspectGroups.set(aspect, list);
    }
    if (aspectGroups.size === 0) {
        aspectGroups.set('9:16', ['youtube_shorts']);
    }

    const selectedRanges: Array<{ start: number; end: number }> = [];
    const clipSpecs: Array<any> = [];

    for (const moment of filteredMoments) {
        if (finalOptions.overlap_prevention) {
            const overlaps = selectedRanges.some(
                (r) =>
                    (moment.start_time >= r.start && moment.start_time <= r.end) ||
                    (moment.end_time >= r.start && moment.end_time <= r.end) ||
                    (moment.start_time <= r.start && moment.end_time >= r.end)
            );
            if (overlaps) continue;
        }
        selectedRanges.push({ start: moment.start_time, end: moment.end_time });

        const suggestion = moment.clip_suggestions?.[0] || {
            start_time: moment.start_time,
            end_time: moment.end_time,
            optimal_duration: moment.duration,
        };
        const clipDuration = Math.min(
            finalOptions.max_duration,
            Math.max(finalOptions.min_duration, suggestion.optimal_duration)
        );
        const startTime = suggestion.start_time;
        const endTime = Math.min(startTime + clipDuration, moment.end_time);

        for (const [aspectRatio, groupPlatforms] of aspectGroups.entries()) {
            const primaryPlatform = groupPlatforms[0];
            clipSpecs.push({
                startTime,
                endTime,
                aspectRatio,
                platform: primaryPlatform,
                targetPlatforms: groupPlatforms,
                viralityScore: moment.virality_score,
                hookTitle: moment.hook_title || `Don't Miss This Moment (${Math.round(startTime)}s)`,
                socialCaption: moment.social_caption || '',
                hashtags: Array.isArray(moment.hashtags) ? moment.hashtags : ['#shorts', '#viral'],
            });
        }
    }

    // 4. Upload video to server once (instant 100% if already imported via YouTube URL!)
    onProgress?.(35, 100, 'Uploading video to server (0%)...');
    const uploadId = await ensureServerVideoUpload(videoFile, (pct) => {
        onProgress?.(35 + Math.round(pct * 0.25), 100, `Uploading video (${pct}%)...`);
    });
    if (!uploadId) {
        throw new Error('Could not upload video to server for background processing.');
    }

    // 5. Submit background job to server queue
    onProgress?.(62, 100, 'Adding video to 1080p HD encoding queue...');
    const res = await fetch(`${API_BASE}/api/repurpose/jobs`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            uploadId,
            originalTitle: originalTitle || (videoFile instanceof File ? videoFile.name : 'Video Repurpose'),
            clipSpecs,
            includeCaptions: Boolean(finalOptions.include_captions),
            captionStyle: finalOptions.caption_style || 'hormozi',
            captionPosition: finalOptions.caption_position || 'bottom',
            cropMode: finalOptions.crop_mode || 'center',
            includeTransitions: finalOptions.include_transitions !== false,
            notifyByEmail,
        }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || `Failed to queue repurpose job (${res.status})`);
    }

    return {
        jobId: data.jobId,
        status: data.status || 'queued',
        queuePosition: Number(data.queuePosition || 0),
        notifyEmail: data.notifyEmail || '',
        originalTitle: originalTitle || 'Your Video',
        clipCount: clipSpecs.length,
    };
}

export async function pollRepurposeJob(jobId: string): Promise<{
    job: BackgroundJobStatus;
    queue: { active: number; queued: number; maxConcurrent: number };
} | null> {
    const token = getAuthToken();
    if (!token) return null;
    const res = await fetch(`${API_BASE}/api/repurpose/jobs/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.job) {
        data.job.clips = attachTokenToLibraryClipUrls(data.job.clips || []);
    }
    return data;
}

export async function fetchActiveRepurposeJobs(): Promise<{
    jobs: BackgroundJobStatus[];
    queue: { active: number; queued: number; maxConcurrent: number };
} | null> {
    const token = getAuthToken();
    if (!token) return null;
    const res = await fetch(`${API_BASE}/api/repurpose/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data?.jobs)) {
        data.jobs = data.jobs.map((j: any) => ({
            ...j,
            clips: attachTokenToLibraryClipUrls(j.clips || []),
        }));
    }
    return data;
}

