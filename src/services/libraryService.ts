import { apiRequest, getAuthToken } from '../lib/api';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface LibraryItem {
    id: string;
    type: 'thumbnail' | 'resize' | 'clip';
    title: string;
    platform: string;
    aspect_ratio: string;
    mime_type: string;
    file_size: number;
    created_at: string;
    expires_at: string;
    days_left: number;
    file_url: string;
}

export async function saveImageToLibrary(params: {
    dataUrl: string;
    type?: 'thumbnail' | 'resize';
    title?: string;
    platform?: string;
    aspectRatio?: string;
}): Promise<void> {
    const token = getAuthToken();
    if (!token || !params.dataUrl?.startsWith('data:image/')) return;
    try {
        await apiRequest('/api/library/save-image', {
            method: 'POST',
            body: JSON.stringify(params),
        });
    } catch (err) {
        console.warn('Background library image save skipped:', err);
    }
}

export async function saveVideoClipToLibrary(
    blob: Blob,
    meta: { title?: string; platform?: string; aspectRatio?: string }
): Promise<void> {
    const token = getAuthToken();
    if (!token || !blob || blob.size === 0) return;
    try {
        const qs = new URLSearchParams({
            title: meta.title || 'Viral Short Clip',
            platform: meta.platform || '9:16',
            aspectRatio: meta.aspectRatio || '9:16',
        });
        await fetch(`${API_BASE}/api/library/save-video?${qs.toString()}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
            },
            body: blob,
        });
    } catch (err) {
        console.warn('Background library video save skipped:', err);
    }
}

export async function fetchLibrary(): Promise<{ retention_days: number; items: LibraryItem[] }> {
    return apiRequest('/api/library');
}

export async function deleteLibraryItem(id: string): Promise<void> {
    await apiRequest(`/api/library/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getAuthedLibraryFileUrl(fileUrl: string): string {
    const token = getAuthToken();
    if (!token) return `${API_BASE}${fileUrl}`;
    const sep = fileUrl.includes('?') ? '&' : '?';
    return `${API_BASE}${fileUrl}${sep}token=${encodeURIComponent(token)}`;
}
