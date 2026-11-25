/**
 * Hardware + Browser Device Fingerprint Utility
 * Distinguishes different physical devices on the same office/home Wi-Fi IP
 * while remaining stable on the same device (including across different emails & incognito).
 */

let cachedFingerprint: string | null = null;

function getWebGLSignature(): string {
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (!gl) return 'no-webgl';
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
            const vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '';
            const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
            return `${vendor}|${renderer}`;
        }
        return String(gl.getParameter(gl.RENDERER) || 'webgl');
    } catch {
        return 'webgl-err';
    }
}

function getCanvasSignature(): string {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-canvas';
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial, sans-serif';
        ctx.fillStyle = '#571c86';
        ctx.fillRect(2, 2, 60, 20);
        ctx.fillStyle = '#111827';
        ctx.fillText('Crevo-Device-FP-v2', 6, 8);
        return canvas.toDataURL().slice(-64);
    } catch {
        return 'canvas-err';
    }
}

function hashString(str: string): string {
    // Dual FNV-1a 32-bit hash -> compact 16-char hex device signature (synchronous, works in all browsers)
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
        const raw = [
            screen.width,
            screen.height,
            screen.colorDepth,
            window.devicePixelRatio || 1,
            nav.hardwareConcurrency || '',
            nav.deviceMemory || '',
            nav.maxTouchPoints || 0,
            nav.platform || '',
            nav.language || '',
            tz,
            getWebGLSignature(),
            getCanvasSignature(),
        ].join('||');

        cachedFingerprint = hashString(raw);
        return cachedFingerprint;
    } catch {
        return '';
    }
}
