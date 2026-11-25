import React, { FC, useState } from 'react';
import { toast } from 'react-toastify';
import { ImageAsset, ResizeOption, RESIZE_OPTIONS } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';
import { fileToBase64 } from '../../shared/utils/image-utils';

interface ResizeModuleProps {
    onBatchResize: (sourceImage: ImageAsset, options: ResizeOption[]) => Promise<void>;
    isResizing: boolean;
}

export const ResizeModule: FC<ResizeModuleProps> = ({ onBatchResize, isResizing }) => {
    const [sourceImage, setSourceImage] = useState<ImageAsset | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>(['tiktok_9_16', 'instagram_4_5']);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const { base64, mimeType } = await fileToBase64(file);
            setSourceImage({
                id: `resize_src_${Date.now()}`,
                url: `data:${mimeType};base64,${base64}`,
                base64,
                mimeType,
            });
            toast.success('Image uploaded! Choose target sizes below.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to read image file');
        } finally {
            e.target.value = '';
        }
    };

    const toggleSize = (id: string) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    const handleRunResize = async () => {
        if (!sourceImage) {
            toast.error('Please upload an image or thumbnail first.');
            return;
        }
        const chosenOptions = RESIZE_OPTIONS.filter((opt) => selectedIds.includes(opt.id));
        if (chosenOptions.length === 0) {
            toast.error('Please select at least one target size.');
            return;
        }
        await onBatchResize(sourceImage, chosenOptions);
    };

    return (
        <Module icon={ICONS.ADAPT} title="Smart Image & Thumbnail Resize">
            <div className="form-group">
                <label htmlFor="smart-resize-upload">1. Upload Image or Thumbnail</label>
                <input
                    id="smart-resize-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    disabled={isResizing}
                    style={{ fontSize: '12px' }}
                />
                {sourceImage && (
                    <div
                        style={{
                            marginTop: '10px',
                            position: 'relative',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color, #e4dcf2)',
                            background: 'var(--surface-1, #ffffff)',
                        }}
                    >
                        <img
                            src={sourceImage.url}
                            alt="Source to resize"
                            style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', display: 'block' }}
                        />
                        <button
                            type="button"
                            onClick={() => setSourceImage(null)}
                            disabled={isResizing}
                            style={{
                                position: 'absolute',
                                top: '6px',
                                right: '6px',
                                background: 'rgba(0,0,0,0.72)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '999px',
                                padding: '3px 9px',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Remove
                        </button>
                    </div>
                )}
            </div>

            <div className="form-group" style={{ marginTop: '14px' }}>
                <label>2. Choose Target Sizes ({selectedIds.length} selected)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                    {RESIZE_OPTIONS.map((option) => {
                        const checked = selectedIds.includes(option.id);
                        return (
                            <label
                                key={option.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '9px 11px',
                                    borderRadius: '10px',
                                    cursor: isResizing ? 'not-allowed' : 'pointer',
                                    background: checked
                                        ? 'var(--surface-2, #f3ecfa)'
                                        : 'var(--surface-1, #ffffff)',
                                    border: checked
                                        ? '1.5px solid var(--primary, #571c86)'
                                        : '1px solid var(--border-color, #e4dcf2)',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleSize(option.id)}
                                        disabled={isResizing}
                                        style={{ accentColor: '#571c86', width: '15px', height: '15px' }}
                                    />
                                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary, #111111)' }}>
                                        {option.label}
                                    </span>
                                </div>
                                <span
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        color: 'var(--primary, #571c86)',
                                        background: 'rgba(87, 28, 134, 0.08)',
                                        padding: '2px 7px',
                                        borderRadius: '999px',
                                    }}
                                >
                                    {option.aspectRatio}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>

            <button
                type="button"
                className="youtube-generate-btn"
                onClick={handleRunResize}
                disabled={isResizing || !sourceImage || selectedIds.length === 0}
                style={{ width: '100%', marginTop: '14px', color: '#ffffff' }}
            >
                {isResizing ? <div className="spinner"></div> : ICONS.ADAPT}
                {isResizing
                    ? 'Resizing...'
                    : `Resize Image (${selectedIds.length} ${selectedIds.length === 1 ? 'size' : 'sizes'})`}
            </button>
        </Module>
    );
};
