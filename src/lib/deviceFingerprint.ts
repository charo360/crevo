/**
 * Cross-Browser Hardware Device Fingerprint Utility
 * Uses ONLY pure hardware & OS properties that stay IDENTICAL across
 * Chrome, Edge, Firefox, Safari, and Incognito on the SAME physical device,
 * while remaining distinct across different phones/laptops on the same office Wi-Fi.
 */

let cachedFingerprint: string | null = null;

function getOsFamily(): string {
    const ua = (navigator.userAgent || '').toLowerCase();
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
    if (ua.includes('android')) return 'android';
    if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
    if (ua.includes('windows')) return 'windows';
    if (ua.includes('linux')) return 'linux';
    return 'other';
}

function getNormalizedGpu(): string {
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return '';
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const raw = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
        // Extract core GPU model token (e.g. "RTX 3060", "Intel Iris", "Apple M2", "Adreno 740")
        // so Chrome ANGLE / Firefox / Safari wrappers normalize to the same hardware string
        const cleaned = raw
            .replace(/^ANGLE\s*\([^,]+,\s*/i, '')
            .replace(/\s*\(0x[0-9a-f]+\).*$/i, '')
            .replace(/Direct3D\d+.*$/i, '')
            .replace(/vs_\d+_\d+.*$/i, '')
            .replace(/[^a-z0-9]+/gi, ' ')
            .trim()
            .toLowerCase();
        return cleaned.slice(0, 40);
    } catch {
        return '';
    }
}

function hashString(str: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= c + i;
        h2 = Math.imul(h2, 0x85ebca6b);
    }
    return `dev_${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export function getDeviceFingerprint(): string {
    if (cachedFingerprint) return cachedFingerprint;
    if (typeof window === 'undefined') return '';

    try {
        const nav = navigator as any;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const lang = (nav.language || '').split('-')[0].toLowerCase();
        const raw = [
            getOsFamily(),
            Math.max(screen.width, screen.height),
            Math.min(screen.width, screen.height),
            screen.colorDepth || 24,
            Math.round((window.devicePixelRatio || 1) * 100),
            nav.hardwareConcurrency || '',
            nav.maxTouchPoints > 0 ? 1 : 0,
            tz,
            lang,
            getNormalizedGpu(),
        ].join('||');

        cachedFingerprint = hashString(raw);
        return cachedFingerprint;
    } catch {
        return '';
    }
}
