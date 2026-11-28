import React, { FC, useState } from 'react';
import { toast } from 'react-toastify';
import { ImageAsset, SavedCharacter, PreferencesState, TextState } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';
import { fileToBase64, imageUrlToBase64 } from '../../shared/utils/image-utils';
import { fetchTranscript } from '../../shared/utils/youtube-utils';

interface YouTubeModuleProps {
    onImagesChange: (i: ImageAsset[]) => void;
    onTextChange: React.Dispatch<React.SetStateAction<TextState>>;
    images: ImageAsset[];
    savedCharacters?: SavedCharacter[];
    onGenerate: (improveMode?: 'improve' | 'reimagine') => void;
    isGenerating: boolean;
    onTranscriptChange: (t: string | null) => void;
    onOriginalTitleChange: (t: string) => void;
    preferences: PreferencesState;
    onPreferencesChange: (p: PreferencesState) => void;
}

export const YouTubeModule: FC<YouTubeModuleProps> = ({ 
    onImagesChange, onTextChange, images, savedCharacters = [], onGenerate, isGenerating, 
    onTranscriptChange, onOriginalTitleChange, preferences, onPreferencesChange
}) => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [fetchedInfo, setFetchedInfo] = useState<{ title: string; thumbnailUrl: string } | null>(null);
    const [transcriptStatus, setTranscriptStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [activeMode, setActiveMode] = useState<'improve' | 'reimagine' | null>(null);

    React.useEffect(() => {
        if (!isGenerating) {
            setActiveMode(null);
        }
    }, [isGenerating]);

    // Auto-load video when sent over from YT Downloader ("Improve with AI →")
    React.useEffect(() => {
        try {
            const raw = sessionStorage.getItem('revo3.pendingImproveVideo');
            if (!raw) return;
            sessionStorage.removeItem('revo3.pendingImproveVideo');
            const pending = JSON.parse(raw) as {
                url?: string;
                videoId?: string;
                title?: string;
                thumbnailUrl?: string;
                transcript?: string | null;
            };
            if (!pending.thumbnailUrl) return;

            setIsLoading(true);
            setYoutubeUrl(pending.url || '');
            setFetchedInfo({
                title: pending.title || 'YouTube Video',
                thumbnailUrl: pending.thumbnailUrl,
            });
            if (pending.title) {
                onTextChange((prev) => ({ ...prev, headline: pending.title! }));
                onOriginalTitleChange(pending.title);
            }
            if (pending.transcript) {
                onTranscriptChange(pending.transcript);
                setTranscriptStatus('success');
            } else {
                setTranscriptStatus('error');
            }

            imageUrlToBase64(pending.thumbnailUrl)
                .catch(() =>
                    pending.videoId
                        ? imageUrlToBase64(`https://i.ytimg.com/vi/${pending.videoId}/hqdefault.jpg`)
                        : Promise.reject(new Error('Failed to load thumbnail'))
                )
                .then(({ base64, mimeType }) => {
                    const newImage: ImageAsset = {
                        id: `yt_${Date.now()}`,
                        url: pending.thumbnailUrl!,
                        base64,
                        mimeType,
                    };
                    onImagesChange([newImage]);
                    toast.success('Thumbnail & transcript loaded — ready to improve!');
                })
                .catch((err) => {
                    toast.error(err.message || 'Could not load thumbnail');
                })
                .finally(() => {
                    setIsLoading(false);
                });
        } catch {
            // Ignore malformed storage data
        }
    }, []);

    const handleTriggerGenerate = (mode: 'improve' | 'reimagine') => {
        setActiveMode(mode);
        onGenerate(mode);
    };

    const handleFetchInfo = async () => {
        if (!youtubeUrl) return;
        setIsLoading(true);
        setFetchedInfo(null);
        onTranscriptChange(null);
        onOriginalTitleChange('');
        setTranscriptStatus('idle');
        try {
            const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(youtubeUrl)}`);
            if (!response.ok) {
                throw new Error('Could not fetch video information. Please check the URL.');
            }
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            setFetchedInfo({ title: data.title, thumbnailUrl: data.thumbnail_url });
            onTextChange(prev => ({ ...prev, headline: data.title }));
            onOriginalTitleChange(data.title);

            const { base64, mimeType } = await imageUrlToBase64(data.thumbnail_url);
            const newImage: ImageAsset = {
                id: `yt_${Date.now()}`,
                url: data.thumbnail_url,
                base64,
                mimeType,
            };
            onImagesChange([...images.filter(img => !img.id.startsWith('yt_')), newImage]);
            toast.success('Video information loaded successfully!');

            setTranscriptStatus('loading');
            const transcript = await fetchTranscript(youtubeUrl);
            onTranscriptChange(transcript);
            setTranscriptStatus(transcript ? 'success' : 'error');
            if (transcript) {
                toast.success('Transcript loaded successfully!');
            }

        } catch (e: any) {
            toast.error(e.message || 'An unknown error occurred.');
            setTranscriptStatus('error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setYoutubeUrl('');
        setFetchedInfo(null);
        onImagesChange([]);
        onTranscriptChange(null);
        onOriginalTitleChange('');
        setTranscriptStatus('idle');
    };

    const referenceImages = images.filter((img) => !img.id.startsWith('yt_'));

    const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        try {
            const uploaded: ImageAsset[] = await Promise.all(
                files.map(async (file, idx) => {
                    const { base64, mimeType } = await fileToBase64(file);
                    return {
                        id: `ref_${Date.now()}_${idx}`,
                        url: `data:${mimeType};base64,${base64}`,
                        base64,
                        mimeType,
                    };
                })
            );
            onImagesChange([...images, ...uploaded]);
            toast.success(`Added ${uploaded.length} reference image${uploaded.length > 1 ? 's' : ''}!`);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load reference image');
        } finally {
            e.target.value = '';
        }
    };

    const handleRemoveReference = (id: string) => {
        onImagesChange(images.filter((img) => img.id !== id));
    };

    return (
        <Module icon={ICONS.YOUTUBE} title="Start with a YouTube Video">
            {fetchedInfo ? (
                <div className="youtube-preview-container">
                    <div className="image-preview-item">
                        <img src={fetchedInfo.thumbnailUrl} alt={fetchedInfo.title} />
                    </div>
                    <div className="youtube-info">
                        <strong>{fetchedInfo.title}</strong>
                        <span className="youtube-info-subtext">Original thumbnail loaded. Let's make a better one!</span>
                        {transcriptStatus === 'loading' && (
                            <div className="transcript-status loading">
                                <div className="spinner-small"></div>
                                <span>Fetching transcript...</span>
                            </div>
                        )}
                        {transcriptStatus === 'success' && (
                            <div className="transcript-status success">
                                ✅ Transcript loaded for context.
                            </div>
                        )}
                        {transcriptStatus === 'error' && (
                            <div className="transcript-status" style={{ fontSize: '12px', color: '#94a3b8' }}>
                                ℹ️ No captions found — using title &amp; thumbnail.
                            </div>
                        )}
                        <div className="form-group" style={{ marginTop: '12px', marginBottom: '12px' }}>
                            {savedCharacters.length > 0 && (
                                <div
                                    style={{
                                        marginBottom: '10px',
                                        padding: '9px 10px',
                                        borderRadius: '10px',
                                        background: '#faf7ff',
                                        border: '1px solid #e4dcf2',
                                    }}
                                >
                                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#4c1d95', marginBottom: '6px' }}>
                                        ⭐ Saved Characters (Tap to include face)
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {savedCharacters.map((char) => {
                                            const selected = referenceImages.some((img) => img.characterId === char.id);
                                            const avatarUrl = char.photos[0]?.url;
                                            return (
                                                <button
                                                    key={char.id}
                                                    type="button"
                                                    disabled={isGenerating}
                                                    onClick={() => {
                                                        if (selected) {
                                                            onImagesChange(
                                                                images.filter((img, idx) => idx === 0 || img.characterId !== char.id)
                                                            );
                                                        } else {
                                                            onImagesChange([...images, ...char.photos]);
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
                            <label htmlFor="improve-ref-upload">Reference Images (Optional)</label>
                            <input
                                id="improve-ref-upload"
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleReferenceUpload}
                                disabled={isGenerating}
                                style={{ fontSize: '12px' }}
                            />
                            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                                Upload a new face, product, or style reference to include in the new thumbnail.
                            </span>
                            {referenceImages.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                    {referenceImages.map((img) => (
                                        <div
                                            key={img.id}
                                            style={{
                                                position: 'relative',
                                                width: '56px',
                                                height: '56px',
                                                borderRadius: '8px',
                                                overflow: 'hidden',
                                                border: '1px solid rgba(255,255,255,0.18)',
                                            }}
                                        >
                                            <img
                                                src={img.url}
                                                alt="Reference"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveReference(img.id)}
                                                disabled={isGenerating}
                                                aria-label="Remove reference image"
                                                style={{
                                                    position: 'absolute',
                                                    top: '2px',
                                                    right: '2px',
                                                    width: '18px',
                                                    height: '18px',
                                                    borderRadius: '50%',
                                                    border: 'none',
                                                    background: 'rgba(0,0,0,0.75)',
                                                    color: '#fff',
                                                    fontSize: '12px',
                                                    lineHeight: 1,
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
                        </div>
                        <div className="form-group" style={{ marginTop: '12px', marginBottom: '12px' }}>
                            <label htmlFor="improve-variations">Number of Variations</label>
                            <select
                                id="improve-variations"
                                value={preferences.variations}
                                onChange={(e) =>
                                    onPreferencesChange({ ...preferences, variations: Number(e.target.value) })
                                }
                                disabled={isGenerating}
                            >
                                <option value={1}>1 Variation (Clean Upgrade)</option>
                                <option value={2}>2 Variations (Clean + Bold Redesign)</option>
                                <option value={3}>3 Variations (Clean + Bold + Viral)</option>
                                <option value={4}>4 Variations (+ Cinematic Spotlight)</option>
                                <option value={5}>5 Variations (+ Curiosity Twist)</option>
                            </select>
                        </div>
                        <div className="youtube-actions-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                                className="youtube-generate-btn"
                                onClick={() => handleTriggerGenerate('improve')}
                                disabled={isGenerating}
                                title="Upgrade lighting, readability, and contrast while keeping the original scene"
                                style={{ color: '#ffffff' }}
                            >
                                {isGenerating && activeMode === 'improve' ? <div className="spinner"></div> : ICONS.GENERATE}
                                {isGenerating && activeMode === 'improve' ? 'Improving...' : 'Improve Thumbnail'}
                            </button>
                            <button
                                className="youtube-generate-btn"
                                onClick={() => handleTriggerGenerate('reimagine')}
                                disabled={isGenerating}
                                title="Invent completely new viral thumbnail concepts from the video title and story"
                                style={{
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: '#ffffff',
                                }}
                            >
                                {isGenerating && activeMode === 'reimagine' ? <div className="spinner"></div> : ICONS.BRUSH}
                                {isGenerating && activeMode === 'reimagine' ? 'Reimagining...' : 'Fresh Concept (Reimagine)'}
                            </button>
                            <button className="youtube-reset-btn" onClick={handleReset} disabled={isGenerating}>
                                Start Over
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="youtube-input-group">
                        <input
                            type="text"
                            placeholder="Paste YouTube video URL here..."
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            disabled={isLoading}
                        />
                        <button className="generate-image-btn" onClick={handleFetchInfo} disabled={isLoading || !youtubeUrl}>
                            {isLoading ? <div className="spinner"></div> : 'Fetch Info'}
                        </button>
                    </div>
                </>
            )}
        </Module>
    );
};
