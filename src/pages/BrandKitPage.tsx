import React, { FC, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiRequest } from '../lib/api';
import { VIBE_STYLES } from '../constants';
import { ColorsState, LogoPosition } from '../types';

interface SavedFaceItem {
    id: string;
    label: string;
    data_url: string;
    mime_type: string;
}

interface SavedBrandKit {
    channel_name: string;
    face_images: SavedFaceItem[];
    logo_data_url: string;
    logo_position: LogoPosition;
    colors: ColorsState;
    preferred_style: string;
    updated_at?: string | null;
}

const DEFAULT_COLORS: ColorsState = {
    primary: '#571c86',
    secondary: '#9333ea',
    accent: '#facc15',
    background: '#140b24',
};

const LOGO_POSITIONS: Array<{ value: LogoPosition; label: string }> = [
    { value: 'top-left', label: 'Top Left' },
    { value: 'top-right', label: 'Top Right' },
    { value: 'bottom-left', label: 'Bottom Left' },
    { value: 'bottom-right', label: 'Bottom Right' },
];

function fileToCompressedDataUrl(
    file: File,
    maxDim: number,
    preservePng = false
): Promise<{ dataUrl: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read selected file.'));
        reader.onload = () => {
            const rawUrl = String(reader.result || '');
            const img = new Image();
            img.onerror = () => reject(new Error('Unsupported image format. Please use JPG, PNG, or WebP.'));
            img.onload = () => {
                let w = img.naturalWidth || img.width;
                let h = img.naturalHeight || img.height;
                if (w > maxDim || h > maxDim) {
                    const ratio = Math.min(maxDim / w, maxDim / h);
                    w = Math.max(1, Math.round(w * ratio));
                    h = Math.max(1, Math.round(h * ratio));
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve({ dataUrl: rawUrl, mimeType: preservePng ? 'image/png' : 'image/jpeg' });
                    return;
                }
                ctx.drawImage(img, 0, 0, w, h);
                const mimeType = preservePng ? 'image/png' : 'image/jpeg';
                const dataUrl = preservePng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.84);
                resolve({ dataUrl, mimeType });
            };
            img.src = rawUrl;
        };
        reader.readAsDataURL(file);
    });
}

export const BrandKitPage: FC = () => {
    const faceInputRef = useRef<HTMLInputElement>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [channelName, setChannelName] = useState('');
    const [faces, setFaces] = useState<SavedFaceItem[]>([]);
    const [logoDataUrl, setLogoDataUrl] = useState('');
    const [logoPosition, setLogoPosition] = useState<LogoPosition>('top-right');
    const [colors, setColors] = useState<ColorsState>(DEFAULT_COLORS);
    const [preferredStyle, setPreferredStyle] = useState<string>(VIBE_STYLES[0] || '');
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        apiRequest<{ brandKit: Partial<SavedBrandKit> | null }>('/api/user/brand-kit')
            .then((res) => {
                if (cancelled) return;
                const bk = res?.brandKit;
                if (bk) {
                    setChannelName(bk.channel_name || '');
                    setFaces(Array.isArray(bk.face_images) ? bk.face_images : []);
                    setLogoDataUrl(bk.logo_data_url || '');
                    setLogoPosition((bk.logo_position as LogoPosition) || 'top-right');
                    if (bk.colors?.primary) {
                        setColors({
                            primary: bk.colors.primary || DEFAULT_COLORS.primary,
                            secondary: bk.colors.secondary || DEFAULT_COLORS.secondary,
                            accent: bk.colors.accent || DEFAULT_COLORS.accent,
                            background: bk.colors.background || DEFAULT_COLORS.background,
                        });
                    }
                    if (bk.preferred_style) {
                        setPreferredStyle(bk.preferred_style);
                    }
                    setLastSavedAt(bk.updated_at || null);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleFaceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;

        const remainingSlots = Math.max(0, 6 - faces.length);
        if (remainingSlots === 0) {
            toast.info('You can save up to 6 face photos. Remove one first to add another.');
            return;
        }

        const toAdd: SavedFaceItem[] = [];
        for (const file of files.slice(0, remainingSlots)) {
            try {
                const compressed = await fileToCompressedDataUrl(file, 640, false);
                toAdd.push({
                    id: `face_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    label: file.name.replace(/\.[^.]+$/, '').slice(0, 30) || `Face ${faces.length + toAdd.length + 1}`,
                    data_url: compressed.dataUrl,
                    mime_type: compressed.mimeType,
                });
            } catch (err: any) {
                toast.error(err?.message || 'Could not process selected photo.');
            }
        }
        if (toAdd.length > 0) {
            setFaces((prev) => [...prev, ...toAdd].slice(0, 6));
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const compressed = await fileToCompressedDataUrl(file, 400, true);
            setLogoDataUrl(compressed.dataUrl);
        } catch (err: any) {
            toast.error(err?.message || 'Could not process logo file.');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await apiRequest<{ brandKit: SavedBrandKit }>('/api/user/brand-kit', {
                method: 'PUT',
                body: JSON.stringify({
                    channel_name: channelName.trim(),
                    face_images: faces,
                    logo_data_url: logoDataUrl,
                    logo_position: logoPosition,
                    colors,
                    preferred_style: preferredStyle,
                }),
            });
            setLastSavedAt(res?.brandKit?.updated_at || new Date().toISOString());
            toast.success('Brand Kit saved! Studio will now automatically use your face, logo & brand colors.');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to save Brand Kit.');
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        try {
            await apiRequest('/api/user/brand-kit', { method: 'DELETE' });
            setChannelName('');
            setFaces([]);
            setLogoDataUrl('');
            setLogoPosition('top-right');
            setColors(DEFAULT_COLORS);
            setPreferredStyle(VIBE_STYLES[0] || '');
            setLastSavedAt(null);
            toast.info('Brand Kit cleared.');
        } catch {
            toast.error('Failed to clear Brand Kit.');
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #faf7ff 0%, #f5f3fa 100%)',
                padding: '24px 16px 96px',
            }}
        >
            <div style={{ maxWidth: '860px', margin: '0 auto' }}>
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '22px',
                    }}
                >
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span
                                style={{
                                    padding: '3px 10px',
                                    borderRadius: '999px',
                                    background: '#f3e8ff',
                                    color: '#571c86',
                                    fontSize: '11.5px',
                                    fontWeight: 800,
                                }}
                            >
                                SAVE ONCE · AUTO-APPLIES IN STUDIO
                            </span>
                        </div>
                        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, color: '#111827' }}>
                            ⭐ My Face &amp; Brand Kit
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#4b5563' }}>
                            Upload your face photo(s), channel logo, and brand colors once — Studio loads them automatically on every device.
                        </p>
                    </div>
                    <Link
                        to="/dashboard"
                        style={{
                            padding: '9px 16px',
                            borderRadius: '10px',
                            border: '1px solid #d8ccf0',
                            background: '#ffffff',
                            color: '#4c1d95',
                            fontWeight: 700,
                            fontSize: '13.5px',
                            textDecoration: 'none',
                        }}
                    >
                        ← Back to Studio
                    </Link>
                </div>

                {loading ? (
                    <div
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            border: '1px solid #e4dcf2',
                            padding: '48px',
                            textAlign: 'center',
                            color: '#6b7280',
                        }}
                    >
                        Loading your Brand Kit...
                    </div>
                ) : (
                    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        {/* Card 1: Face / Persona Photos */}
                        <section
                            style={{
                                background: '#ffffff',
                                borderRadius: '16px',
                                border: '1px solid #e4dcf2',
                                padding: '20px',
                                boxShadow: '0 4px 16px rgba(87, 28, 134, 0.04)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                                        1. My Face / Subject Photos (Up to 6)
                                    </h2>
                                    <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#6b7280' }}>
                                        Upload clear, well-lit photos of yourself or co-hosts (up to 6). Crevo automatically pre-loads them in Thumbnail Studio.
                                    </p>
                                </div>
                                <input
                                    ref={faceInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleFaceUpload}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => faceInputRef.current?.click()}
                                    disabled={faces.length >= 6}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: faces.length >= 6 ? '#d1d5db' : '#571c86',
                                        color: '#ffffff',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        cursor: faces.length >= 6 ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    + Upload Face Photo ({faces.length}/6)
                                </button>
                            </div>

                            {faces.length === 0 ? (
                                <div
                                    onClick={() => faceInputRef.current?.click()}
                                    style={{
                                        border: '2px dashed #d8ccf0',
                                        borderRadius: '12px',
                                        padding: '28px 16px',
                                        textAlign: 'center',
                                        background: '#faf7ff',
                                        cursor: 'pointer',
                                        color: '#5b5368',
                                        fontSize: '13.5px',
                                    }}
                                >
                                    <div style={{ fontSize: '26px', marginBottom: '6px' }}>📸</div>
                                    <strong>Click to upload 1–6 clear face photos</strong>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                        JPG, PNG, or WebP · Automatically compressed for fast syncing
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                                    {faces.map((face) => (
                                        <div
                                            key={face.id}
                                            style={{
                                                position: 'relative',
                                                borderRadius: '12px',
                                                overflow: 'hidden',
                                                border: '1.5px solid #d8ccf0',
                                                aspectRatio: '1 / 1',
                                                background: '#111827',
                                            }}
                                        >
                                            <img
                                                src={face.data_url}
                                                alt={face.label}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setFaces((prev) => prev.filter((f) => f.id !== face.id))}
                                                aria-label="Remove face photo"
                                                style={{
                                                    position: 'absolute',
                                                    top: '6px',
                                                    right: '6px',
                                                    width: '26px',
                                                    height: '26px',
                                                    borderRadius: '50%',
                                                    border: 'none',
                                                    background: 'rgba(0,0,0,0.75)',
                                                    color: '#ffffff',
                                                    fontSize: '16px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Card 2: Channel Name & Logo */}
                        <section
                            style={{
                                background: '#ffffff',
                                borderRadius: '16px',
                                border: '1px solid #e4dcf2',
                                padding: '20px',
                                boxShadow: '0 4px 16px rgba(87, 28, 134, 0.04)',
                            }}
                        >
                            <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                                2. Channel Name &amp; Logo
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', alignItems: 'start' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                                        Channel / Brand Name
                                    </label>
                                    <input
                                        type="text"
                                        value={channelName}
                                        onChange={(e) => setChannelName(e.target.value)}
                                        placeholder="e.g., Crevo AI"
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: '1px solid #d8ccf0',
                                            fontSize: '14px',
                                        }}
                                    />
                                    <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#6b7280' }}>
                                        Also pre-fills your channel name inside the YouTube Feed Preview.
                                    </p>

                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#374151', margin: '14px 0 6px' }}>
                                        Default Vibe &amp; Style
                                    </label>
                                    <select
                                        value={preferredStyle}
                                        onChange={(e) => setPreferredStyle(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: '1px solid #d8ccf0',
                                            fontSize: '14px',
                                            background: '#ffffff',
                                        }}
                                    >
                                        {VIBE_STYLES.map((style) => (
                                            <option key={style} value={style}>
                                                {style}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                                        Channel Logo (Optional PNG)
                                    </label>
                                    <input
                                        ref={logoInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        style={{ display: 'none' }}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div
                                            onClick={() => logoInputRef.current?.click()}
                                            style={{
                                                width: '74px',
                                                height: '74px',
                                                borderRadius: '12px',
                                                border: '1.5px dashed #d8ccf0',
                                                background: '#faf7ff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden',
                                                cursor: 'pointer',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {logoDataUrl ? (
                                                <img
                                                    src={logoDataUrl}
                                                    alt="Channel logo"
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
                                                />
                                            ) : (
                                                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 700 }}>+ Logo</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => logoInputRef.current?.click()}
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: '8px',
                                                        border: '1px solid #d8ccf0',
                                                        background: '#ffffff',
                                                        color: '#4c1d95',
                                                        fontSize: '12.5px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {logoDataUrl ? 'Change Logo' : 'Upload Logo'}
                                                </button>
                                                {logoDataUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setLogoDataUrl('')}
                                                        style={{
                                                            padding: '6px 10px',
                                                            borderRadius: '8px',
                                                            border: '1px solid #fecaca',
                                                            background: '#fff5f5',
                                                            color: '#dc2626',
                                                            fontSize: '12px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                            <select
                                                value={logoPosition}
                                                onChange={(e) => setLogoPosition(e.target.value as LogoPosition)}
                                                style={{
                                                    padding: '7px 10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #d8ccf0',
                                                    fontSize: '12.5px',
                                                    background: '#ffffff',
                                                }}
                                            >
                                                {LOGO_POSITIONS.map((pos) => (
                                                    <option key={pos.value} value={pos.value}>
                                                        Position: {pos.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Card 3: Brand Colors */}
                        <section
                            style={{
                                background: '#ffffff',
                                borderRadius: '16px',
                                border: '1px solid #e4dcf2',
                                padding: '20px',
                                boxShadow: '0 4px 16px rgba(87, 28, 134, 0.04)',
                            }}
                        >
                            <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                                3. Brand Color Palette
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                                {(
                                    [
                                        { key: 'primary', label: 'Primary' },
                                        { key: 'secondary', label: 'Secondary' },
                                        { key: 'accent', label: 'Accent' },
                                        { key: 'background', label: 'Background' },
                                    ] as Array<{ key: keyof ColorsState; label: string }>
                                ).map(({ key, label }) => (
                                    <label
                                        key={key}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: '1px solid #e4dcf2',
                                            background: '#faf8fd',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <input
                                            type="color"
                                            value={colors[key]}
                                            onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                                            style={{ width: '34px', height: '34px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                                        />
                                        <div>
                                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#111827' }}>{label}</div>
                                            <div style={{ fontSize: '11.5px', color: '#6b7280', fontFamily: 'monospace' }}>
                                                {colors[key].toUpperCase()}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </section>

                        {/* Save Footer */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                                padding: '16px 20px',
                                borderRadius: '16px',
                                background: '#ffffff',
                                border: '1px solid #e4dcf2',
                            }}
                        >
                            <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                {lastSavedAt ? (
                                    <span style={{ color: '#059669', fontWeight: 700 }}>
                                        ✓ Saved {new Date(lastSavedAt).toLocaleString()}
                                    </span>
                                ) : (
                                    'Not saved yet — upload your face/logo and click Save.'
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {lastSavedAt && (
                                    <button
                                        type="button"
                                        onClick={handleClear}
                                        style={{
                                            padding: '10px 16px',
                                            borderRadius: '10px',
                                            border: '1px solid #fecaca',
                                            background: '#fff5f5',
                                            color: '#dc2626',
                                            fontSize: '13.5px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Reset Kit
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        padding: '10px 24px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                        color: '#ffffff',
                                        fontSize: '14px',
                                        fontWeight: 800,
                                        cursor: saving ? 'wait' : 'pointer',
                                        boxShadow: '0 6px 18px rgba(87, 28, 134, 0.25)',
                                    }}
                                >
                                    {saving ? 'Saving Brand Kit...' : '💾 Save Brand Kit'}
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
