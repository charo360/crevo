import { getDeviceFingerprint } from './deviceFingerprint';

export const AUTH_TOKEN_KEY = 'revo3.auth.token';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
    if (typeof window === 'undefined') return;
    if (token) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}

export interface ApiError extends Error {
    status?: number;
}

export async function apiRequest<T = any>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getAuthToken();
    const headers = new Headers(options.headers || {});

    if (!headers.has('Content-Type') && options.body !== undefined) {
        headers.set('Content-Type', 'application/json');
    }

    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const deviceFp = getDeviceFingerprint();
    if (deviceFp && !headers.has('X-Client-FP')) {
        headers.set('X-Client-FP', deviceFp);
    }

    let response: Response;
    let lastFetchErr: any = null;
    const maxAttempts = path === '/api/ai/generate' || !options.method || options.method.toUpperCase() === 'GET' ? 3 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            response = await fetch(`${API_BASE}${path}`, {
                ...options,
                headers,
            });
            lastFetchErr = null;
            break;
        } catch (fetchErr: any) {
            lastFetchErr = fetchErr;
            if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, attempt * 900));
                continue;
            }
        }
    }

    if (lastFetchErr) {
        const err: ApiError = new Error(
            'Network connection interrupted while reaching Crevo AI. Please check your signal and try again.'
        );
        throw err;
    }

    const contentType = response!.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response!.json().catch(() => null) : await response!.text().catch(() => '');

    if (!response!.ok) {
        const message =
            (data && typeof data === 'object' && (data.error || data.message)) ||
            (typeof data === 'string' && data) ||
            `Request failed with status ${response!.status}`;
        const err: ApiError = new Error(message);
        err.status = response!.status;
        throw err;
    }

    return data as T;
}
