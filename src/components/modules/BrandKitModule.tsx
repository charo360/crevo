import React, { FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ColorsState, ImageAsset, LogoState, PreferencesState } from '../../types';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface SavedFaceItem {
    id: string;
    label: string;
    data_url: string;
    mime_type: string;
}

interface SavedBrandKit {
    channel_name?: string;
    face_images?: SavedFaceItem[];
    logo_data_url?: string;
    logo_position?: string;
    colors?: Partial<ColorsState>;
    preferred_style?: string;
    updated_at?: string | null;
}

interface BrandKitModuleProps {
    images: ImageAsset[];
    onImagesChange: (i: ImageAsset[]) => void;
    logo: LogoState;
    onLogoChange: (l: LogoState) => void;
    colors: ColorsState;
    onColorsChange: (c: ColorsState) => void;
    preferences: PreferencesState;
    onPreferencesChange: (p: PreferencesState) => void;
}

function compressDataUrl(dataUrl: string, maxDim: number, preservePng = false): Promise<{ dataUrl: string; mimeType: string }> {
    return new Promise((resolve) => {
        const img = new Image();
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
                resolve({ dataUrl, mimeType: preservePng ? 'image/png' : 'image/jpeg' });
                return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            const mimeType = preservePng ? 'image/png' : 'image/jpeg';
            const out = preservePng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.82);
            resolve({ dataUrl: out, mimeType });
        };
        img.onerror = () => resolve({ dataUrl, mimeType: preservePng ? 'image/png' : 'image/jpeg' });
        img.src = dataUrl;
    });
}

function dataUrlToImageAsset(dataUrl: string, idPrefix: string): ImageAsset | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return null;
    return {
        id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        mimeType: match[1],
        base64: match[2],
        url: dataUrl,
    };
}

export const BrandKitModule: FC<BrandKitModuleProps> = ({
    images,
    onImagesChange,
    logo,
    onLogoChange,
    colors,
    onColorsChange,
    preferences,
    onPreferencesChange,
}) => {
    const { user } = useAuth();
    const [kit, setKit] = useState<SavedBrandKit | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) {
            setKit(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        apiRequest<{ brandKit: SavedBrandKit | null }>('/api/user/brand-kit')
            .then((res) => {
                if (!cancelled && res?.brandKit) {
                    setKit(res.brandKit);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [user]);

    if (!user) return null;

    const hasSavedKit = Boolean(
        kit &&
            ((kit.face_images && kit.face_images.length > 0) ||
                kit.logo_data_url ||
                kit.colors?.primary ||
                kit.preferred_style)
    );

    const handleSaveCurrent = async () => {
        setSaving(true);
        try {
            const faceImages: SavedFaceItem[] = [];
            for (const img of images.slice(0, 3)) {
                if (!img?.url?.startsWith('data:image/')) continue;
                const compressed = await compressDataUrl(img.url, 640, false);
                faceImages.push({
                    id: img.id || `face_${faceImages.length + 1}`,
                    label: `Face ${faceImages.length + 1}`,
                    data_url: compressed.dataUrl,
                    mime_type: compressed.mimeType,
                });
            }

            let logoDataUrl = '';
            if (logo.image?.url?.startsWith('data:image/')) {
                const compressedLogo = await compressDataUrl(logo.image.url, 380, true);
                logoDataUrl = compressedLogo.dataUrl;
            }

            const res = await apiRequest<{ brandKit: SavedBrandKit }>('/api/user/brand-kit', {
                method: 'PUT',
                body: JSON.stringify({
                    face_images: faceImages,
                    logo_data_url: logoDataUrl,
                    logo_position: logo.position || 'top-right',
                    colors,
                    preferred_style: preferences.style || '',
                }),
            });
            setKit(res.brandKit);
            toast.success(
                `Brand Kit saved! (${faceImages.length} face${faceImages.length === 1 ? '' : 's'}${logoDataUrl ? ' + logo' : ''} + colors)`
            );
        } catch (err: any) {
            toast.error(err?.message || 'Failed to save Brand Kit');
        } finally {
            setSaving(false);
        }
    };

    const handleApplyKit = () => {
        if (!kit) return;
        let appliedParts: string[] = [];

        if (kit.face_images && kit.face_images.length > 0) {
            const restoredFaces = kit.face_images
                .map((f, idx) => dataUrlToImageAsset(f.data_url, `brand_face_${idx}`))
                .filter(Boolean) as ImageAsset[];
            if (restoredFaces.length > 0) {
                onImagesChange(restoredFaces);
                appliedParts.push(`${restoredFaces.length} face${restoredFaces.length === 1 ? '' : 's'}`);
            }
        }

        if (kit.logo_data_url) {
            const restoredLogo = dataUrlToImageAsset(kit.logo_data_url, 'brand_logo');
            if (restoredLogo) {
                onLogoChange({
                    ...logo,
                    image: restoredLogo,
                    position: (kit.logo_position as any) || logo.position,
                });
                appliedParts.push('logo');
            }
        }

        if (kit.colors?.primary && kit.colors?.secondary && kit.colors?.accent && kit.colors?.background) {
            onColorsChange({
                primary: kit.colors.primary,
                secondary: kit.colors.secondary,
                accent: kit.colors.accent,
                background: kit.colors.background,
            });
            appliedParts.push('colors');
        }

        if (kit.preferred_style) {
            onPreferencesChange({
                ...preferences,
                style: kit.preferred_style,
            });
            appliedParts.push('style');
        }

        toast.success(`Applied Brand Kit (${appliedParts.join(', ') || 'settings'})!`);
    };

    const handleClearKit = async () => {
        try {
            await apiRequest('/api/user/brand-kit', { method: 'DELETE' });
            setKit(null);
            toast.info('Saved Brand Kit cleared.');
        } catch {
            toast.error('Could not clear Brand Kit');
        }
    };

    return (
        <div
            style={{
                borderRadius: '12px',
                border: '1px solid var(--border-color, #e4dcf2)',
                background: 'linear-gradient(135deg, #faf7ff 0%, #ffffff 100%)',
                padding: '10px 12px',
                marginBottom: '10px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <button
                    type="button"
                    onClick={() => setIsOpen((v) => !v)}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px',
                        cursor: 'pointer',
                        color: '#1f1b24',
                        fontWeight: 700,
                        fontSize: '13px',
                        textAlign: 'left',
                    }}
                >
                    <span>⭐</span>
                    <span>My Face &amp; Brand Kit</span>
                    {hasSavedKit && (
                        <span
                            style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '999px',
                                background: '#f3e8ff',
                                color: '#571c86',
                            }}
                        >
                            SAVED
                        </span>
                    )}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {hasSavedKit ? (
                        <button
                            type="button"
                            onClick={handleApplyKit}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                color: '#ffffff',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            ⚡ Apply
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsOpen(true)}
                            style={{
                                padding: '4px 9px',
                                borderRadius: '8px',
                                border: '1px solid #d8ccf0',
                                background: '#ffffff',
                                color: '#571c86',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            + Set Up
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsOpen((v) => !v)}
                        aria-label="Toggle Brand Kit"
                        style={{
                            background: 'transparent',
                            border: '1px solid #e4dcf2',
                            borderRadius: '6px',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            color: '#5b5368',
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {isOpen ? '▲' : '▼'}
                    </button>
                </div>
            </div>

            {isOpen && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #efe8fa' }}>
                    {loading ? (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Loading Brand Kit...</div>
                    ) : hasSavedKit ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {(kit?.face_images || []).map((f) => (
                                    <img
                                        key={f.id}
                                        src={f.data_url}
                                        alt={f.label}
                                        title="Saved face photo"
                                        style={{
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            border: '2px solid #7e22ce',
                                        }}
                                    />
                                ))}
                                {kit?.logo_data_url && (
                                    <img
                                        src={kit.logo_data_url}
                                        alt="Saved logo"
                                        title="Saved channel logo"
                                        style={{
                                            width: '38px',
                                            height: '38px',
                                            borderRadius: '8px',
                                            objectFit: 'contain',
                                            background: '#f3f4f6',
                                            border: '1px solid #dfd5f0',
                                            padding: '3px',
                                        }}
                                    />
                                )}
                                {kit?.colors?.primary && (
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginLeft: '2px' }} title="Saved brand palette">
                                        {[kit.colors.primary, kit.colors.secondary, kit.colors.accent, kit.colors.background]
                                            .filter(Boolean)
                                            .map((hex, i) => (
                                                <span
                                                    key={i}
                                                    style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        borderRadius: '50%',
                                                        background: hex,
                                                        border: '1px solid rgba(0,0,0,0.18)',
                                                        display: 'inline-block',
                                                    }}
                                                />
                                            ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={handleApplyKit}
                                    style={{
                                        flex: 1,
                                        padding: '7px 10px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: '#571c86',
                                        color: '#ffffff',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ⚡ Load Into Studio
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveCurrent}
                                    disabled={saving}
                                    style={{
                                        flex: 1,
                                        padding: '7px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #d8ccf0',
                                        background: '#ffffff',
                                        color: '#4c1d95',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: saving ? 'wait' : 'pointer',
                                    }}
                                >
                                    {saving ? 'Saving...' : '💾 Update Kit'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearKit}
                                    title="Clear saved Brand Kit"
                                    style={{
                                        padding: '7px 9px',
                                        borderRadius: '8px',
                                        border: '1px solid #fecaca',
                                        background: '#fff5f5',
                                        color: '#dc2626',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <p style={{ margin: 0, fontSize: '12px', color: '#5b5368', lineHeight: 1.45 }}>
                                Save your uploaded <strong>face photo(s)</strong>, <strong>logo</strong>, <strong>colors</strong> &amp; <strong>style</strong> once — reuse them in 1 tap on every video across PC &amp; phone.
                            </p>
                            <button
                                type="button"
                                onClick={handleSaveCurrent}
                                disabled={saving}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                                    color: '#ffffff',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    cursor: saving ? 'wait' : 'pointer',
                                }}
                            >
                                {saving ? 'Saving Brand Kit...' : '💾 Save Current Face, Logo & Colors'}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
