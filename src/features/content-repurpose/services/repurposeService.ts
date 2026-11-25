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
import { processVideoClip, getVideoMetadata, generateThumbnail, clearCachedVideoInput } from '../../../core/processors/video';
import { saveRepurposedVideo, saveViralClips, saveMLAnalysis } from './repurposeDatabase';
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
    onProgress?: (current: number, total: number) => void
): Promise<RepurposeResult> {
    const jobStartTime = Date.now();
    const finalOptions = { ...DEFAULT_OPTIONS, ...options };
    
    try {
        // Step 1: Get video metadata
        toast.info('Analyzing video...');
        const metadata = await getVideoMetadata(videoFile);
        
        // Step 2: Extract 8-14 evenly spaced frames for fast single-pass AI analysis
        onProgress?.(1, 6);
        const targetFrames = Math.min(14, Math.max(6, Math.ceil(metadata.duration / 10)));
        const frames = await extractFramesFromVideo(
            videoUrl,
            0,
            metadata.duration,
            targetFrames
        );
        onProgress?.(2, 6);
        
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
        onProgress?.(3, 6);
        toast.info('Identifying viral moments...');
        const mlAnalysis = await analyzeVideoForViralMoments(
            ai,
            videoUrl,
            metadata.duration,
            videoTranscript,
            frames,
            repurposedVideo.id
        );
        onProgress?.(4, 6);
        
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
        
        // Step 7: Generate clips — deduplicate by aspect ratio so identical 9:16 platforms only encode ONCE!
        const clips: ViralClip[] = [];
        const selectedRanges: Array<{ start: number; end: number }> = [];
        const uniqueAspectPlatforms: string[] = [];
        const seenAspects = new Set<string>();
        for (const p of finalOptions.platforms) {
            const aspect = getPlatformSettings(p).aspectRatio;
            if (!seenAspects.has(aspect)) {
                seenAspects.add(aspect);
                uniqueAspectPlatforms.push(p);
            }
        }
        const totalClips = filteredMoments.length * uniqueAspectPlatforms.length;
        let processedClips = 0;

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

            for (const platform of uniqueAspectPlatforms) {
                try {
                    const clip = await generateClipFromMoment(
                        videoFile,
                        moment,
                        platform,
                        finalOptions,
                        repurposedVideo.id
                    );
                    clips.push(clip);
                    processedClips++;
                    if (totalClips > 0) {
                        onProgress?.(4 + Math.round((processedClips / totalClips) * 1), 6);
                    }
                } catch (error: any) {
                    console.error(`Error generating clip for platform ${platform}:`, error);
                    toast.warning(`Failed to generate clip for ${platform}: ${error?.message || 'processing error'}`);
                }
            }
        }
        
        // Step 8: Update ML analysis with repurposed video ID
        mlAnalysis.repurposed_video_id = repurposedVideo.id;
        onProgress?.(5, 6);
        
        // Step 9: Save to database
        toast.info('Saving results...');
        await saveRepurposedVideo(repurposedVideo);
        await saveMLAnalysis(mlAnalysis);
        await saveViralClips(clips);
        onProgress?.(6, 6);
        
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
        await clearCachedVideoInput();
    }
}

/**
 * Generate a clip from a viral moment
 */
async function generateClipFromMoment(
    videoFile: File | Blob,
    moment: any,
    platform: string,
    options: ClipGenerationOptions,
    repurposedVideoId: string
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
        }
    );
    
    // Generate thumbnail
    const thumbnailBlob = await generateThumbnail(videoFile, startTime + (clipDuration / 2));
    const thumbnailUrl = URL.createObjectURL(thumbnailBlob);
    
    // Create clip URL (in production, upload to storage)
    const clipUrl = URL.createObjectURL(blob);
    
    // Get transcript snippet if available
    const transcriptSnippet = moment.reasoning || '';
    
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
        title: `Viral Clip - ${platform}`,
        description: transcriptSnippet,
        thumbnail_url: thumbnailUrl,
        transcript_snippet: transcriptSnippet,
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

