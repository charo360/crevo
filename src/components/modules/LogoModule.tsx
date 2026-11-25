import React, { FC, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { LogoState } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';
import { fileToBase64 } from '../../shared/utils/image-utils';

interface LogoModuleProps {
    logo: LogoState;
    onLogoChange: (l: LogoState) => void;
}

export const LogoModule: FC<LogoModuleProps> = ({ logo, onLogoChange }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const loadLogoFile = async (file: File) => {
        try {
            if (!file.type.startsWith('image/')) {
                toast.error('Please upload an image file for your logo');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                toast.error('Logo file size must be less than 5MB');
                return;
            }
            const { base64, mimeType } = await fileToBase64(file);
            onLogoChange({ ...logo, url: `data:${mimeType};base64,${base64}`, base64, mimeType });
            toast.success('Logo uploaded!');
        } catch (error: any) {
            toast.error(`Failed to upload logo: ${error.message || 'Unknown error'}`);
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) await loadLogoFile(file);
        event.target.value = '';
    };

    const handleRemoveLogo = () => {
        onLogoChange({ ...logo, url: null, base64: null, mimeType: null });
    };

    return (
        <Module icon={ICONS.LOGO} title="Brand Logo">
            {logo.url ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div
                        style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '10px',
                            borderRadius: '10px',
                            background: 'var(--background, #f8f5ed)',
                            border: '1px solid var(--border-color, #e4dcf2)',
                        }}
                    >
                        <img
                            src={logo.url}
                            alt="Logo preview"
                            style={{ maxHeight: '56px', maxWidth: '100%', objectFit: 'contain', opacity: logo.opacity }}
                        />
                        <button
                            type="button"
                            className="delete-image-btn"
                            onClick={handleRemoveLogo}
                            aria-label="Remove logo"
                        >
                            &times;
                        </button>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Position</label>
                        <select
                            value={logo.position}
                            onChange={(e) =>
                                onLogoChange({ ...logo, position: e.target.value as LogoState['position'] })
                            }
                        >
                            <option value="top-left">Top Left</option>
                            <option value="top-right">Top Right</option>
                            <option value="bottom-left">Bottom Left</option>
                            <option value="bottom-right">Bottom Right</option>
                            <option value="center">Center</option>
                        </select>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isDragging) setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(false);
                    }}
                    onDrop={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) await loadLogoFile(file);
                    }}
                    style={{
                        padding: '14px 12px',
                        borderRadius: '10px',
                        border: isDragging
                            ? '2px dashed var(--primary, #571c86)'
                            : '2px dashed var(--border-color, #e4dcf2)',
                        background: isDragging ? 'var(--surface-2, #f3ecfa)' : 'var(--background, #f8f5ed)',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                    }}
                >
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #111111)' }}>
                        <span style={{ color: 'var(--primary, #571c86)', textDecoration: 'underline' }}>
                            Click to upload
                        </span>{' '}
                        or drop logo
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary, #5e5a67)' }}>
                        PNG, SVG, JPG up to 5MB
                    </p>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        style={{ display: 'none' }}
                    />
                </div>
            )}
        </Module>
    );
};
