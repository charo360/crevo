import React, { FC, useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ImageAsset, Platform, ImagenAspectRatio } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';
import { PLATFORM_CONFIGS } from '../../constants/platforms';
import { isImagenAspectRatio } from '../../constants/aspectRatios';
import { fileToBase64 } from '../../shared/utils/image-utils';

interface ImageModuleProps {
    platform: Platform;
    images: ImageAsset[];
    onImagesChange: (i: ImageAsset[]) => void;
    savedCharacters?: ImageAsset[];
    onGenerateImage: (p: string, np: string, ar: ImagenAspectRatio) => Promise<ImageAsset | null>;
    isGeneratingImage: boolean;
    outputAspectRatio?: string;
    onOutputAspectRatioChange?: (ar: string) => void;
}

export const ImageModule: FC<ImageModuleProps> = ({
    images,
    onImagesChange,
    savedCharacters = [],
    onGenerateImage,
    isGeneratingImage,
    platform,
    outputAspectRatio,
    onOutputAspectRatioChange,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [genPrompt, setGenPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [localAspectRatio, setLocalAspectRatio] = useState<ImagenAspectRatio>('16:9');
    const [isDragging, setIsDragging] = useState(false);

    const aspectRatio: ImagenAspectRatio =
        outputAspectRatio && isImagenAspectRatio(outputAspectRatio) ? outputAspectRatio : localAspectRatio;

    const handleSelectAspectRatio = (ar: ImagenAspectRatio) => {
        setLocalAspectRatio(ar);
        onOutputAspectRatioChange?.(ar);
    };

    useEffect(() => {
        const platformAspectRatio = PLATFORM_CONFIGS[platform].aspectRatio;
        if (isImagenAspectRatio(platformAspectRatio)) {
            setLocalAspectRatio(platformAspectRatio);
        }
    }, [platform]);

    const addImageFiles = async (files: File[]) => {
        const validFiles = files.filter((file) => {
            if (!file.type.startsWith('image/')) {
                toast.error(`Skipped "${file.name}": not an image`);
                return false;
            }
            if (file.size > 10 * 1024 * 1024) {
                toast.error(`Skipped "${file.name}": must be less than 10MB`);
                return false;
            }
            return true;
        });

        if (validFiles.length === 0) return;

        try {
            const added: ImageAsset[] = await Promise.all(
                validFiles.map(async (file, idx) => {
                    const { base64, mimeType } = await fileToBase64(file);
                    return {
                        id: `img_${Date.now()}_${idx}`,
                        url: `data:${mimeType};base64,${base64}`,
                        base64,
                        mimeType,
                    };
                })
            );
            onImagesChange([...images, ...added]);
            toast.success(`Uploaded ${added.length} image${added.length > 1 ? 's' : ''}!`);
        } catch (error: any) {
            toast.error(`Failed to upload image: ${error.message || 'Unknown error'}`);
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length > 0) {
            await addImageFiles(files);
        }
        event.target.value = '';
    };

    const handleGenClick = async () => {
        if (!genPrompt || isGeneratingImage) return;
        await onGenerateImage(genPrompt, negativePrompt, aspectRatio);
    };

    const toggleSavedCharacter = (char: ImageAsset) => {
        const exists = images.some((img) => img.id === char.id);
        if (exists) {
            onImagesChange(images.filter((img) => img.id !== char.id));
        } else {
            onImagesChange([...images, char]);
        }
    };

    return (
        <Module icon={ICONS.IMAGE} title="Images">
            {savedCharacters.length > 0 && (
                <div
                    style={{
                        marginBottom: '12px',
                        padding: '10px',
                        borderRadius: '10px',
                        background: '#faf7ff',
                        border: '1px solid #e4dcf2',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '8px',
                            gap: '8px',
                        }}
                    >
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#4c1d95' }}>
                            ⭐ Saved Characters (Tap to include)
                        </span>
                        <Link
                            to="/dashboard/brand-kit"
                            style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textDecoration: 'none' }}
                        >
                            Manage →
                        </Link>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {savedCharacters.map((char) => {
                            const selected = images.some((img) => img.id === char.id);
                            return (
                                <button
                                    key={char.id}
                                    type="button"
                                    onClick={() => toggleSavedCharacter(char)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px 4px 4px',
                                        borderRadius: '999px',
                                        border: selected ? '1.5px solid #571c86' : '1px solid #d8ccf0',
                                        background: selected ? 'linear-gradient(135deg, #571c86, #7e22ce)' : '#ffffff',
                                        color: selected ? '#ffffff' : '#2b2338',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <img
                                        src={char.url}
                                        alt={char.characterName || 'Character'}
                                        style={{
                                            width: '22px',
                                            height: '22px',
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            display: 'block',
                                        }}
                                    />
                                    <span>{char.characterName || 'Character'}</span>
                                    {selected && <span style={{ fontSize: '11px' }}>✓</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            <label className="sub-label">Upload Images (Optional)</label>
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
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length > 0) await addImageFiles(files);
                }}
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: isDragging
                        ? '1.5px dashed var(--primary, #571c86)'
                        : '1.5px dashed var(--border-color, #d8ccf0)',
                    background: isDragging ? 'var(--surface-2, #f3ecfa)' : 'var(--background, #f8f5ed)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                }}
            >
                <div
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: '#f3e8ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--primary, #571c86)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #111111)', lineHeight: 1.3 }}>
                        {isDragging ? 'Drop images here' : 'Drop images or click to browse'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary, #5e5a67)', lineHeight: 1.3 }}>
                        JPG, PNG, WEBP up to 10MB
                    </p>
                </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} multiple />
            {images.length > 0 && (
                <div className="image-preview-grid">
                    {images.map(image => (
                        <div key={image.id} className="image-preview-item" style={{ position: 'relative' }}>
                            <img src={image.url} alt={image.characterName || 'preview'} />
                            {image.characterName && (
                                <span
                                    style={{
                                        position: 'absolute',
                                        bottom: '4px',
                                        left: '4px',
                                        right: '4px',
                                        padding: '2px 5px',
                                        borderRadius: '6px',
                                        background: 'rgba(87, 28, 134, 0.88)',
                                        color: '#ffffff',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        textAlign: 'center',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {image.characterName}
                                </span>
                            )}
                            <button className="delete-image-btn" onClick={() => onImagesChange(images.filter(i => i.id !== image.id))}>&times;</button>
                        </div>
                    ))}
                </div>
            )}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    margin: '12px 0 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary, #5e5a67)',
                }}
            >
                <span style={{ flex: 1, height: '1px', background: 'var(--border-color, #e4dcf2)' }} />
                <span>OR GENERATE WITH AI</span>
                <span style={{ flex: 1, height: '1px', background: 'var(--border-color, #e4dcf2)' }} />
            </div>
            <div className="form-group">
                <label htmlFor="generate-image-prompt">Describe the image you want</label>
                <textarea id="generate-image-prompt" value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder="e.g., A robot holding a red skateboard" />
            </div>
            <div className="form-group">
                <label htmlFor="negative-prompt">Negative Prompt (what to avoid)</label>
                <input type="text" id="negative-prompt" value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} placeholder="e.g., text, watermarks, blurry" />
            </div>
            <div className="form-group">
                <label>Output Size / Aspect Ratio</label>
                <div className="aspect-ratio-group">
                    {(['1:1', '16:9', '9:16', '1.91:1'] as ImagenAspectRatio[]).map(ar => (
                        <button
                            key={ar}
                            type="button"
                            className={`aspect-ratio-btn ${aspectRatio === ar ? 'active' : ''}`}
                            onClick={() => handleSelectAspectRatio(ar)}
                        >
                            {ar}
                        </button>
                    ))}
                </div>
            </div>
            <button className="generate-image-btn" onClick={handleGenClick} disabled={isGeneratingImage || !genPrompt}>
                {isGeneratingImage ? <div className="spinner"></div> : ICONS.GENERATE}
                {isGeneratingImage ? 'Generating...' : 'Generate Image'}
            </button>
        </Module>
    );
};
