import React, { FC, useState, useRef, useEffect } from 'react';
import { DesignResult, Platform, ImageAsset, ResizeOption, RESIZE_OPTIONS } from '../../types';
import { ICONS } from '../../constants';

interface DesignCardProps {
    design: DesignResult;
    platform: Platform;
    onEdit: (result: DesignResult) => void;
    onAiEdit: (image: ImageAsset) => void;
    onUpscale: (image: ImageAsset) => void;
    onDownload: (image: ImageAsset) => void;
    onPreview: (image: ImageAsset) => void;
    onAdapt: (image: ImageAsset, option: ResizeOption) => void;
}

export const DesignCard: FC<DesignCardProps> = ({ 
    design, 
    platform, 
    onEdit, 
    onAiEdit, 
    onUpscale, 
    onDownload, 
    onPreview, 
    onAdapt 
}) => {
    const [isAdaptMenuOpen, setIsAdaptMenuOpen] = useState(false);
    const adaptButtonRef = useRef<HTMLDivElement>(null);
    
    const handleEdit = () => onEdit(design);
    const handleAiEdit = () => design.image && onAiEdit(design.image);
    const handleUpscale = () => design.image && onUpscale(design.image);
    const handleDownload = () => design.image && onDownload(design.image);
    const handlePreview = () => design.image && onPreview(design.image);
    
    const handleAdaptSelect = (option: ResizeOption) => {
        if (design.image) {
            onAdapt(design.image, option);
            setIsAdaptMenuOpen(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (adaptButtonRef.current && !adaptButtonRef.current.contains(event.target as Node)) {
                setIsAdaptMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="design-card">
                {design.image && !(design.isEditing || design.isUpscaling || design.isResizing) && (
                     <div className="design-card-actions">
                        <button className="card-action-btn" title="Download" onClick={handleDownload}>
                            {ICONS.DOWNLOAD}
                        </button>
                        <button className="card-action-btn" title="Preview" onClick={handlePreview}>
                            {ICONS.GENERATE}
                        </button>
                        <button className="card-action-btn" title="AI Edit" onClick={handleAiEdit}>
                            {ICONS.BRUSH}
                        </button>
                        <button className="card-action-btn" title="Upscale" onClick={handleUpscale}>
                            {ICONS.UPSCALE}
                        </button>
                        <div className="adapt-btn-container" ref={adaptButtonRef}>
                             <button className="card-action-btn" title="Resize for another size" onClick={() => setIsAdaptMenuOpen(prev => !prev)}>
                                {ICONS.ADAPT}
                            </button>
                            {isAdaptMenuOpen && (
                                 <div className="adapt-popover">
                                    {RESIZE_OPTIONS.map(option => (
                                        <button
                                            key={option.id}
                                            className="adapt-popover-option"
                                            onClick={() => handleAdaptSelect(option)}
                                        >
                                            <span>{option.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div className="design-card-image-wrapper">
                    {design.image && (
                        <img
                            className="design-card-image"
                            src={design.image.url}
                            alt={design.description || design.score?.variationLabel || 'Generated thumbnail'}
                        />
                    )}
                </div>
                {design.description && <p className="design-card-description">{design.description}</p>}
                 {(design.isEditing || design.isUpscaling || design.isResizing) && (
                    <div
                        className="card-overlay"
                        style={{
                            backgroundColor: 'rgba(17, 17, 24, 0.78)',
                            backdropFilter: 'blur(4px)',
                        }}
                    >
                        <div
                            className="spinner"
                            style={{
                                borderColor: 'rgba(255, 255, 255, 0.28)',
                                borderTopColor: '#ffffff',
                            }}
                        ></div>
                        <p
                            style={{
                                color: '#ffffff',
                                fontWeight: 600,
                                fontSize: '14px',
                                margin: 0,
                                padding: '6px 14px',
                                borderRadius: '999px',
                                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                                letterSpacing: '0.01em',
                            }}
                        >
                            {design.isEditing
                                ? 'AI Editing thumbnail...'
                                : design.isResizing
                                  ? `Resizing to ${design.resizingLabel || 'new size'}...`
                                  : 'Upscaling to HD...'}
                        </p>
                    </div>
                )}
            </div>

            {design.score && (
                <div
                    style={{
                        padding: '12px 14px',
                        borderRadius: 'var(--border-radius, 12px)',
                        background: 'var(--surface-1, #ffffff)',
                        border: design.score.isTopPick
                            ? '1.5px solid var(--primary, #571c86)'
                            : '1px solid var(--border-color, #e4dcf2)',
                        boxShadow: '0 2px 10px rgba(87, 28, 134, 0.06)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '7px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {design.score.isTopPick && (
                                <span
                                    style={{
                                        background: 'var(--primary, #571c86)',
                                        color: '#ffffff',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        padding: '3px 8px',
                                        borderRadius: '999px',
                                        letterSpacing: '0.04em',
                                    }}
                                >
                                    ★ TOP PICK
                                </span>
                            )}
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #111111)' }}>
                                {design.score.variationLabel || 'CTR Analysis'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                                style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    padding: '2px 9px',
                                    borderRadius: '999px',
                                    background: 'var(--surface-2, #f3ecfa)',
                                    color: 'var(--primary, #571c86)',
                                    border: '1px solid var(--border-color, #e4dcf2)',
                                }}
                            >
                                CTR {design.score.overall}/100
                            </span>
                            {typeof design.score.delta === 'number' && (
                                <span
                                    style={{
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        color: design.score.delta >= 0 ? '#15803d' : '#b91c1c',
                                    }}
                                >
                                    {design.score.delta >= 0 ? `+${design.score.delta}` : design.score.delta} vs Original ({design.score.originalScore})
                                </span>
                            )}
                        </div>
                    </div>
                    {design.suggestedHeadline && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary, #5e5a67)' }}>
                            Hook: <strong style={{ color: 'var(--text-primary, #111111)' }}>"{design.suggestedHeadline}"</strong>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px', color: 'var(--text-secondary, #5e5a67)' }}>
                        <span>Readability: <strong style={{ color: 'var(--text-primary, #111111)' }}>{design.score.readability}</strong></span>
                        <span>Contrast: <strong style={{ color: 'var(--text-primary, #111111)' }}>{design.score.contrast}</strong></span>
                        <span>Hook: <strong style={{ color: 'var(--text-primary, #111111)' }}>{design.score.curiosity}</strong></span>
                    </div>
                    {design.score.summary && (
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #5e5a67)', lineHeight: 1.4 }}>
                            {design.score.summary}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
