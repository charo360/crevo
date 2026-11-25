import React, { FC, useRef, useState, useEffect } from 'react';
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
    onGenerateImage: (p: string, np: string, ar: ImagenAspectRatio) => Promise<ImageAsset | null>;
    isGeneratingImage: boolean;
}

export const ImageModule: FC<ImageModuleProps> = ({ images, onImagesChange, onGenerateImage, isGeneratingImage, platform }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [genPrompt, setGenPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<ImagenAspectRatio>('16:9');
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        const platformAspectRatio = PLATFORM_CONFIGS[platform].aspectRatio;
        if (isImagenAspectRatio(platformAspectRatio)) {
            setAspectRatio(platformAspectRatio);
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

    return (
        <Module icon={ICONS.IMAGE} title="Images">
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
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '16px 12px',
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
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--primary, #571c86)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ opacity: 0.8 }}
                >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #111111)' }}>
                    {isDragging ? 'Drop images here' : 'Drop images or click to browse'}
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary, #5e5a67)' }}>
                    JPG, PNG, WEBP up to 10MB
                </p>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} multiple />
            {images.length > 0 && (
                <div className="image-preview-grid">
                    {images.map(image => (
                        <div key={image.id} className="image-preview-item">
                            <img src={image.url} alt="preview" />
                            <button className="delete-image-btn" onClick={() => onImagesChange(images.filter(i => i.id !== image.id))}>&times;</button>
                        </div>
                    ))}
                </div>
            )}
            <div className="section-divider">OR GENERATE WITH AI</div>
            <div className="form-group">
                <label htmlFor="generate-image-prompt">Describe the image you want</label>
                <textarea id="generate-image-prompt" value={genPrompt} onChange={e => setGenPrompt(e.target.value)} placeholder="e.g., A robot holding a red skateboard" />
            </div>
            <div className="form-group">
                <label htmlFor="negative-prompt">Negative Prompt (what to avoid)</label>
                <input type="text" id="negative-prompt" value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} placeholder="e.g., text, watermarks, blurry" />
            </div>
            <div className="form-group">
                <label>Aspect Ratio</label>
                <div className="aspect-ratio-group">
                    {(['1:1', '16:9', '9:16', '1.91:1'] as ImagenAspectRatio[]).map(ar => (
                        <button key={ar} className={`aspect-ratio-btn ${aspectRatio === ar ? 'active' : ''}`} onClick={() => setAspectRatio(ar)}>
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
