import React, { FC } from 'react';
import { DesignResult, Platform, ImageAsset, ResizeOption } from '../../types';
import { ICONS } from '../../constants';
import { DesignResults } from '../design/DesignResults';

interface CanvasProps {
    results: DesignResult[];
    isGenerating: boolean;
    platform: Platform;
    onEdit: (result: DesignResult) => void;
    onAiEdit: (image: ImageAsset) => void;
    onUpscale: (image: ImageAsset) => void;
    onDownload: (image: ImageAsset) => void;
    onPreview: (image: ImageAsset) => void;
    onAdapt: (image: ImageAsset, option: ResizeOption) => void;
    onClearCanvas?: () => void;
}

export const Canvas: FC<CanvasProps> = ({ 
    results, 
    isGenerating, 
    platform, 
    onEdit, 
    onAiEdit, 
    onUpscale, 
    onDownload, 
    onPreview, 
    onAdapt, 
    onClearCanvas
}) => (
    <main className="canvas-area">
        {isGenerating ? (
            <div className="canvas-placeholder">
                <div className="spinner-container">
                    <div className="spinner"></div>
                    <p>Generating designs... this may take a moment.</p>
                </div>
            </div>
        ) : results.length > 0 ? (
            <div style={{ width: '100%' }}>
                {onClearCanvas && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #5e5a67)' }}>
                            {results.length} {results.length === 1 ? 'Design' : 'Designs'} on Canvas
                        </span>
                        <button
                            type="button"
                            onClick={onClearCanvas}
                            style={{
                                padding: '6px 13px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color, #e4dcf2)',
                                background: 'var(--surface-1, #ffffff)',
                                color: 'var(--text-secondary, #5e5a67)',
                                fontSize: '12.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Clear Canvas
                        </button>
                    </div>
                )}
                <DesignResults 
                    results={results} 
                    platform={platform} 
                    onEdit={onEdit} 
                    onAiEdit={onAiEdit} 
                    onUpscale={onUpscale} 
                    onDownload={onDownload} 
                    onPreview={onPreview} 
                    onAdapt={onAdapt} 
                />
            </div>
        ) : (
            <div className="canvas-placeholder">
                {ICONS.GENERATE}
                <h2>AI Design Studio</h2>
                <p>Your generated designs will appear here. Configure your options in the sidebar and click "Generate".</p>
            </div>
        )}
    </main>
);
