import { performanceMonitor } from '../../core/infrastructure/performance-monitoring';

export const fetchTranscript = async (videoUrl: string): Promise<string | null> => {
    return performanceMonitor.measureFunction('fetchTranscript', async () => {
        try {
            const response = await fetch(`/api/youtube/transcript?url=${encodeURIComponent(videoUrl)}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            if (data && typeof data.transcript === 'string' && data.transcript.trim().length > 0) {
                return data.transcript.trim();
            }

            return null;
        } catch (error) {
            console.warn('Transcript fetch failed (falling back to title + thumbnail):', error);
            return null;
        }
    });
};
