import { apiRequest } from './api';

const REF_STORAGE_KEY = 'crevo_ref_code';
const REF_EXPIRES_KEY = 'crevo_ref_expires';
const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day referral cookie window

export function captureReferralFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = (params.get('ref') || params.get('via') || '').trim().toUpperCase();
        if (!raw || !/^[A-Z0-9_-]{3,32}$/.test(raw)) {
            return getStoredReferralCode();
        }
        const expiresAt = Date.now() + REF_TTL_MS;
        localStorage.setItem(REF_STORAGE_KEY, raw);
        localStorage.setItem(REF_EXPIRES_KEY, String(expiresAt));
        document.cookie = `crevo_ref=${encodeURIComponent(raw)}; max-age=${30 * 24 * 60 * 60}; path=/; SameSite=Lax`;

        // Fire-and-forget click tracking (deduplicated per IP/24h on server)
        apiRequest('/api/affiliates/track-click', {
            method: 'POST',
            body: JSON.stringify({ code: raw, landingPath: window.location.pathname }),
        }).catch(() => {});

        return raw;
    } catch {
        return null;
    }
}

export function getStoredReferralCode(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const code = localStorage.getItem(REF_STORAGE_KEY);
        const exp = Number(localStorage.getItem(REF_EXPIRES_KEY) || 0);
        if (code && (!exp || Date.now() <= exp)) {
            return code;
        }
        // Fallback to cookie if localStorage was cleared
        const cookieMatch = document.cookie.match(/(?:^|;\s*)crevo_ref=([^;]+)/);
        if (cookieMatch) {
            return decodeURIComponent(cookieMatch[1]).trim().toUpperCase();
        }
    } catch {
        // ignore
    }
    return null;
}

export function clearStoredReferralCode(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(REF_STORAGE_KEY);
        localStorage.removeItem(REF_EXPIRES_KEY);
        document.cookie = 'crevo_ref=; max-age=0; path=/; SameSite=Lax';
    } catch {
        // ignore
    }
}
