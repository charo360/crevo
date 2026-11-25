/**
 * Database Service for Content Repurposing (MongoDB + Express API)
 */

import { apiRequest } from '../../../lib/api';
import {
    RepurposedVideo,
    ViralClip,
    MLAnalysis,
    RepurposeJob,
} from '../../../types/repurpose';

export async function saveRepurposedVideo(video: RepurposedVideo): Promise<void> {
    try {
        await apiRequest(`/api/repurpose/videos/${encodeURIComponent(video.id)}`, {
            method: 'PUT',
            body: JSON.stringify(video),
        });
    } catch (error: any) {
        console.error('Error saving repurposed video:', error);
        throw new Error(`Failed to save repurposed video: ${error.message}`);
    }
}

export async function saveViralClips(clips: ViralClip[]): Promise<void> {
    try {
        await apiRequest('/api/repurpose/clips', {
            method: 'PUT',
            body: JSON.stringify({ clips }),
        });
    } catch (error: any) {
        console.error('Error saving viral clips:', error);
        throw new Error(`Failed to save viral clips: ${error.message}`);
    }
}

export async function saveMLAnalysis(analysis: MLAnalysis): Promise<void> {
    try {
        await apiRequest(`/api/repurpose/analyses/${encodeURIComponent(analysis.id)}`, {
            method: 'PUT',
            body: JSON.stringify(analysis),
        });
    } catch (error: any) {
        console.error('Error saving ML analysis:', error);
        throw new Error(`Failed to save ML analysis: ${error.message}`);
    }
}

export async function getRepurposedVideo(id: string): Promise<RepurposedVideo | null> {
    try {
        return await apiRequest<RepurposedVideo | null>(`/api/repurpose/videos/${encodeURIComponent(id)}`);
    } catch (error: any) {
        console.error('Error getting repurposed video:', error);
        throw new Error(`Failed to get repurposed video: ${error.message}`);
    }
}

export async function getViralClips(repurposedVideoId: string): Promise<ViralClip[]> {
    try {
        const data = await apiRequest<ViralClip[]>(
            `/api/repurpose/clips/${encodeURIComponent(repurposedVideoId)}`
        );
        return data || [];
    } catch (error: any) {
        console.error('Error getting viral clips:', error);
        throw new Error(`Failed to get viral clips: ${error.message}`);
    }
}

export async function getMLAnalysis(repurposedVideoId: string): Promise<MLAnalysis | null> {
    try {
        return await apiRequest<MLAnalysis | null>(
            `/api/repurpose/analyses/${encodeURIComponent(repurposedVideoId)}`
        );
    } catch (error: any) {
        console.error('Error getting ML analysis:', error);
        throw new Error(`Failed to get ML analysis: ${error.message}`);
    }
}

export async function getUserRepurposedVideos(_userId: string): Promise<RepurposedVideo[]> {
    try {
        const data = await apiRequest<RepurposedVideo[]>('/api/repurpose/videos');
        return data || [];
    } catch (error: any) {
        console.error('Error getting user repurposed videos:', error);
        throw new Error(`Failed to get user repurposed videos: ${error.message}`);
    }
}

export async function createRepurposeJob(job: RepurposeJob): Promise<void> {
    try {
        await apiRequest('/api/repurpose/jobs', {
            method: 'POST',
            body: JSON.stringify(job),
        });
    } catch (error: any) {
        console.error('Error creating repurpose job:', error);
        throw new Error(`Failed to create repurpose job: ${error.message}`);
    }
}

export async function updateRepurposeJob(jobId: string, updates: Partial<RepurposeJob>): Promise<void> {
    try {
        await apiRequest(`/api/repurpose/jobs/${encodeURIComponent(jobId)}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    } catch (error: any) {
        console.error('Error updating repurpose job:', error);
        throw new Error(`Failed to update repurpose job: ${error.message}`);
    }
}
