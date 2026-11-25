import React, { FC, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { ImageAsset } from '../../types';
import { apiRequest } from '../../lib/api';

interface ReferenceThumbnailModuleProps {
    referenceThumbnail: ImageAsset | null;
    onReferenceThumbnailChange: (img: ImageAsset | null) => void;
}

export const ReferenceThumbnailModule: FC<ReferenceThumbnailModuleProps> = ({
    referenceThumbnail,
    onReferenceThumbnailChange,
}) => {
    const [enabled, setEnabled] = useState(Boolean(referenceThumbnail));
    const [ytUrl, setYtUrl] = useState('');
    const [fetching, setFetching] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleToggle = (checked: boolean) => {
        setEnabled(checked);
        if (!checked) {
            onReferenceThumbnailChange(null);
            setYtUrl('');
        }
    };

    const handleFetchFromYouTube = async () => {
        const trimmed = ytUrl.trim();
        if (!trimmed) {
            toast.info('Paste a YouTube video link first.');
            return;
        }
        setFetching(true);
        try {
            const res = await apiRequest<{
                videoId: string;
                mimeType: string;
                base64: string;
                dataUrl: string;
            }>(`/api/youtube/thumbnail?url=${encodeURIComponent(trimmed)}`);

            onReferenceThumbnailChange({
                id: `ref_yt_${res.videoId}_${Date.now()}`,
                base64: res.base64,
                mimeType: res.mimeType,
                url: res.dataUrl,
            });
            toast.success('Reference thumbnail loaded from YouTube!');
        } catch (err: any) {
            toast.error(err?.message || 'Could not fetch thumbnail from that YouTube link.');
        } finally {
            setFetching(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file (PNG, JPG, WebP).');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const commaIdx = dataUrl.indexOf(',');
            const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
            if (!base64) {
                toast.error('Could not read reference image.');
                return;
            }
            onReferenceThumbnailChange({
                id: `ref_upload_${Date.now()}`,
                base64,
                mimeType: file.type || 'image/jpeg',
                url: dataUrl,
            });
            toast.success('Reference thumbnail uploaded!');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    return (
        <div
            className="sidebar-module"
            style={{
                border: enabled ? '1.5px solid #571c86' : undefined,
                background: enabled ? '#faf7ff' : undefined,
                transition: 'all 0.2s ease',
            }}
        >
            <label
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    userSelect: 'none',
                }}
            >
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => handleToggle(e.target.checked)}
                    style={{
                        width: '16px',
                        height: '16px',
                        marginTop: '2px',
                        accentColor: '#571c86',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#1f1b24', lineHeight: 1.3 }}>
                        Recreate a Reference Thumbnail
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#6b7280', marginTop: '2px' }}>
                        Clone a YouTube thumbnail&apos;s exact layout &amp; vibe with your people &amp; text
                    </div>
                </div>
            </label>

            {enabled && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Fetch from YouTube Link */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                            type="url"
                            value={ytUrl}
                            onChange={(e) => setYtUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleFetchFromYouTube();
                                }
                            }}
                            placeholder="Paste YouTube link..."
                            style={{
                                flex: 1,
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: '1px solid #d8ccf0',
                                fontSize: '12.5px',
                                background: '#ffffff',
                                color: '#111827',
                                minWidth: 0,
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleFetchFromYouTube}
                            disabled={fetching}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: '#571c86',
                                color: '#ffffff',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: fetching ? 'not-allowed' : 'pointer',
                                opacity: fetching ? 0.7 : 1,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {fetching ? 'Fetching...' : 'Fetch'}
                        </button>
                    </div>

                    {/* Or Upload Reference Image */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                flex: 1,
                                padding: '7px 10px',
                                borderRadius: '8px',
                                border: '1px dashed #c4b5fd',
                                background: '#ffffff',
                                color: '#571c86',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: 'pointer',
                            }}
                        >
                            ↑ Or upload thumbnail image
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />
                    </div>

                    {/* Preview */}
                    {referenceThumbnail && (
                        <div
                            style={{
                                position: 'relative',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                border: '1.5px solid #571c86',
                                background: '#111827',
                            }}
                        >
                            <img
                                src={referenceThumbnail.url}
                                alt="Reference thumbnail blueprint"
                                style={{ width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'cover' }}
                            />
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '6px 10px',
                                    background: '#ffffff',
                                    fontSize: '11.5px',
                                }}
                            >
                                <span style={{ fontWeight: 700, color: '#571c86' }}>✓ Blueprint Ready</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onReferenceThumbnailChange(null);
                                        setYtUrl('');
                                    }}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#dc2626',
                                        fontWeight: 600,
                                        fontSize: '11.5px',
                                        cursor: 'pointer',
                                        padding: 0,
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
