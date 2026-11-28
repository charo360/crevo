import React, { FC } from 'react';
import {
    Platform, ImageAsset, SavedCharacter, VideoAsset, TextState, LogoState, ColorsState,
    PreferencesState, AnalysisResult, ImagenAspectRatio, VeoAspectRatio, ResizeOption
} from '../../types';
import { YouTubeModule } from './YouTubeModule';
import { ResizeModule } from './ResizeModule';
import { VideoModule } from './VideoModule';
import { ImageModule } from './ImageModule';
import { ReferenceThumbnailModule } from './ReferenceThumbnailModule';
import { TextContentModule } from './TextContentModule';
import { LogoModule } from './LogoModule';
import { ColorPaletteModule } from './ColorPaletteModule';
import { DesignPreferencesModule } from './DesignPreferencesModule';
import { GenerateButton } from './GenerateButton';

interface SidebarProps {
    platform: Platform;
    text: TextState;
    onTextChange: React.Dispatch<React.SetStateAction<TextState>>;
    images: ImageAsset[];
    onImagesChange: (i: ImageAsset[]) => void;
    referenceThumbnail: ImageAsset | null;
    onReferenceThumbnailChange: (img: ImageAsset | null) => void;
    videoAsset: VideoAsset | null;
    onVideoAssetChange: (v: VideoAsset | null) => void;
    trimTimes: { start: number; end: number };
    onTrimTimesChange: (t: { start: number; end: number }) => void;
    isAnalyzing: boolean;
    onAnalyzeVideo: () => void;
    analysisResult: AnalysisResult | null;
    onAnalysisResultChange: (r: AnalysisResult | null) => void;
    onExtractFaces: () => void;
    isExtractingFaces: boolean;
    logo: LogoState;
    onLogoChange: (l: LogoState) => void;
    colors: ColorsState;
    onColorsChange: (c: ColorsState) => void;
    preferences: PreferencesState;
    onPreferencesChange: (p: PreferencesState) => void;
    onGenerate: (improveMode?: 'improve' | 'reimagine') => void;
    isGenerating: boolean;
    onGenerateImage: (p: string, np: string, ar: ImagenAspectRatio) => Promise<ImageAsset | null>;
    isGeneratingImage: boolean;
    onGenerateVideo: (p: string, ar: VeoAspectRatio) => void;
    isGeneratingVideo: boolean;
    onTranscriptChange: (t: string | null) => void;
    onOriginalTitleChange: (t: string) => void;
    onBatchResize?: (sourceImage: ImageAsset, options: ResizeOption[]) => Promise<void>;
    isBatchResizing?: boolean;
    outputAspectRatio?: string;
    onOutputAspectRatioChange?: (ar: string) => void;
    savedCharacters?: SavedCharacter[];
    isOpen?: boolean;
    onClose?: () => void;
}

export const Sidebar: FC<SidebarProps> = (props) => {
    return (
        <aside className={`sidebar ${props.isOpen ? 'sidebar-open' : ''}`}>
            {props.onClose && (
                <button className="sidebar-close-btn" onClick={props.onClose} aria-label="Close sidebar">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            )}
            {props.platform === 'youtube_improve' ? (
                <YouTubeModule
                    onImagesChange={props.onImagesChange}
                    onTextChange={props.onTextChange}
                    images={props.images}
                    savedCharacters={props.savedCharacters}
                    onGenerate={props.onGenerate}
                    isGenerating={props.isGenerating}
                    onTranscriptChange={props.onTranscriptChange}
                    onOriginalTitleChange={props.onOriginalTitleChange}
                    preferences={props.preferences}
                    onPreferencesChange={props.onPreferencesChange}
                />
            ) : props.platform === 'resize' && props.onBatchResize ? (
                <ResizeModule
                    onBatchResize={props.onBatchResize}
                    isResizing={Boolean(props.isBatchResizing)}
                />
            ) : (
                <>
                    <VideoModule
                        videoAsset={props.videoAsset}
                        onVideoAssetChange={props.onVideoAssetChange}
                        trimTimes={props.trimTimes}
                        onTrimTimesChange={props.onTrimTimesChange}
                        isAnalyzing={props.isAnalyzing}
                        onAnalyzeVideo={props.onAnalyzeVideo}
                        analysisResult={props.analysisResult}
                        onAnalysisResultChange={props.onAnalysisResultChange}
                        onExtractFaces={props.onExtractFaces}
                        isExtractingFaces={props.isExtractingFaces}
                        isPrimary={['podcast', 'tiktok'].includes(props.platform)}
                        hideForImagePlatforms={false}
                        onGenerateVideo={props.onGenerateVideo}
                        isGeneratingVideo={props.isGeneratingVideo}
                        platform={props.platform}
                    />
                    <ImageModule
                        platform={props.platform}
                        images={props.images}
                        onImagesChange={props.onImagesChange}
                        savedCharacters={props.savedCharacters}
                        onGenerateImage={props.onGenerateImage}
                        isGeneratingImage={props.isGeneratingImage}
                        outputAspectRatio={props.outputAspectRatio}
                        onOutputAspectRatioChange={props.onOutputAspectRatioChange}
                    />
                    <ReferenceThumbnailModule
                        referenceThumbnail={props.referenceThumbnail}
                        onReferenceThumbnailChange={props.onReferenceThumbnailChange}
                    />
                    <TextContentModule
                        platform={props.platform}
                        text={props.text}
                        onTextChange={props.onTextChange}
                        suggestedHooks={props.analysisResult?.headlineVariations}
                    />
                    <LogoModule
                        logo={props.logo}
                        onLogoChange={props.onLogoChange}
                    />
                    <ColorPaletteModule
                        colors={props.colors}
                        onColorsChange={props.onColorsChange}
                    />
                    <DesignPreferencesModule
                        preferences={props.preferences}
                        onPreferencesChange={props.onPreferencesChange}
                    />
                    {props.savedCharacters && props.savedCharacters.length > 0 && (
                        <div
                            style={{
                                margin: '0 0 10px',
                                padding: '10px 12px',
                                borderRadius: '12px',
                                background: '#faf7ff',
                                border: '1px solid #e4dcf2',
                            }}
                        >
                            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#4c1d95', marginBottom: '6px' }}>
                                {props.savedCharacters.some((c) => props.images.some((img) => img.characterId === c.id))
                                    ? '✅ Character included in this thumbnail:'
                                    : '⭐ Tap a Character to include their face:'}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {props.savedCharacters.map((char) => {
                                    const selected = props.images.some((img) => img.characterId === char.id);
                                    const avatarUrl = char.photos[0]?.url;
                                    return (
                                        <button
                                            key={char.id}
                                            type="button"
                                            onClick={() => {
                                                if (selected) {
                                                    props.onImagesChange(props.images.filter((img) => img.characterId !== char.id));
                                                } else {
                                                    props.onImagesChange([...props.images, ...char.photos]);
                                                }
                                            }}
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
                                            }}
                                        >
                                            {avatarUrl && (
                                                <img
                                                    src={avatarUrl}
                                                    alt={char.name}
                                                    style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                                                />
                                            )}
                                            <span>{char.name}</span>
                                            <span style={{ fontSize: '10.5px', opacity: 0.8 }}>({char.photos.length})</span>
                                            {selected && <span>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <GenerateButton
                        onGenerate={() => props.onGenerate('improve')}
                        isGenerating={props.isGenerating}
                    />
                </>
            )}
        </aside>
    );
};
