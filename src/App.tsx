import React, { useState, FC, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { GoogleGenAI } from "@google/genai";
import { createAiClient } from './core/services/ai-providers/openrouterClient';
import { toast } from 'react-toastify';
import {
    Platform, ImageAsset, VideoAsset, LogoState, TextState, ColorsState, 
    PreferencesState, DesignResult, AnalysisResult, AssistantMessage, 
    EditorState, EditableElement, ImagenAspectRatio, VeoAspectRatio, ResizeOption
} from './types';
import { VIBE_STYLES, PLATFORM_CONFIGS } from './constants';
import { 
    generateDesign, resizeThumbnailForSize, generateImage, editImage, 
    upscaleImage, analyzeVideoAndSuggestStyles, extractBestFacesFromVideoFrames, 
    getAssistantResponse 
} from './core/services/ai-providers/gemini';
import { extractFramesFromVideo } from './shared/utils/video-utils';
import { loadPreferences, savePreferences, loadEditorState, saveEditorState, clearEditorState } from './shared/utils/storage-utils';
import { Header } from './components/layout/Header';
import { Canvas } from './components/layout/Canvas';
// Sidebar will be imported from components/modules/Sidebar
import { Sidebar } from './components/modules/Sidebar';
import { MagicStudioModal } from './components/modals/MagicStudioModal';
import { PreviewModal } from './components/modals/PreviewModal';
import { AssistantPanel } from './components/modals/AssistantPanel';
import { Editor } from './components/modals/Editor';
import { RepurposeModule } from './features/content-repurpose/components/RepurposeModule';
import { YouTubeToolsView } from './components/modules/YouTubeToolsView';
import { CreditManagement } from './components/dashboard/CreditManagement';
import { useAuth } from './contexts/AuthContext';
import { hasEnoughCredits, deductCredits, CREDIT_COSTS } from './services/payments/creditService';
import { saveImageToLibrary } from './services/libraryService';

declare global {
    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }
    interface Window {
        readonly aistudio: AIStudio;
    }
}

interface AppProps {
    initialPlatform?: Platform;
    onPlatformChange?: (platform: Platform) => void;
}

export const App: FC<AppProps> = ({ initialPlatform = 'youtube_improve', onPlatformChange }) => {
    const { user, refreshCredits } = useAuth();
    // Input state
    const [platform, setPlatform] = useState<Platform>(initialPlatform);
    
    // Update platform when initialPlatform prop changes
    useEffect(() => {
        setPlatform(initialPlatform);
    }, [initialPlatform]);
    
    // Handle platform change
    const handlePlatformChange = (newPlatform: Platform) => {
        setPlatform(newPlatform);
        if (onPlatformChange) {
            onPlatformChange(newPlatform);
        }
    };
    
    const [images, setImages] = useState<ImageAsset[]>([]);
    const [referenceThumbnail, setReferenceThumbnail] = useState<ImageAsset | null>(null);
    const [videoAsset, setVideoAsset] = useState<VideoAsset | null>(null);
    const [trimTimes, setTrimTimes] = useState({ start: 0, end: 1 });
    const [cutoutAssets, setCutoutAssets] = useState<ImageAsset[]>([]);
    const [isExtractingFaces, setIsExtractingFaces] = useState(false);

    const createDefaultText = (): TextState => ({
        headline: '', headlineFont: 'Inter', headlineSize: 48, headlineWeight: 'bold', headlineItalic: false, headlineColor: '#FFFFFF',
        subheadline: '', subheadlineFont: 'Inter', subheadlineSize: 24, subheadlineWeight: 'normal', subheadlineItalic: false, subheadlineColor: '#FFFFFF',
        author: ''
    });

    const [textByPlatform, setTextByPlatform] = useState<Partial<Record<Platform, TextState>>>({});
    const text: TextState = textByPlatform[platform] ?? createDefaultText();
    const setText: React.Dispatch<React.SetStateAction<TextState>> = (updater) => {
        setTextByPlatform(prev => {
            const current = prev[platform] ?? createDefaultText();
            const next = typeof updater === 'function' ? updater(current) : updater;
            return { ...prev, [platform]: next };
        });
    };
    const [logo, setLogo] = useState<LogoState>({
        url: null, base64: null, mimeType: null,
        size: 10, position: 'bottom-right', opacity: 1,
    });
    const [youtubeTranscript, setYoutubeTranscript] = useState<string | null>(null);
    const [originalYoutubeTitle, setOriginalYoutubeTitle] = useState<string>('');

    // Load preferences from localStorage
    const prefs = loadPreferences();
    const [colors, setColors] = useState<ColorsState>(prefs.colors);
    const [preferences, setPreferences] = useState<PreferencesState>(prefs.preferences);
    
    // App status state (persist finished results in sessionStorage; never persist in-progress loading overlays)
    const [results, setResults] = useState<DesignResult[]>(() => {
        try {
            const saved = sessionStorage.getItem('revo3.latestResults');
            if (!saved) return [];
            const parsed: DesignResult[] = JSON.parse(saved);
            return parsed
                .filter((r) => !r.isResizing && !r.image?.id?.startsWith('batch_resize_') && !r.image?.id?.startsWith('resizing_'))
                .map((r) => ({ ...r, isEditing: false, isUpscaling: false, isResizing: false }));
        } catch {
            return [];
        }
    });

    const savedLibraryIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        try {
            const finishedResults = results.filter(
                (r) => !r.isResizing && !r.isEditing && !r.isUpscaling
            );
            if (finishedResults.length > 0) {
                sessionStorage.setItem('revo3.latestResults', JSON.stringify(finishedResults));
                if (user) {
                    for (const item of finishedResults) {
                        const key = item.image?.id || item.image?.url?.slice(0, 80);
                        if (key && item.image?.url?.startsWith('data:image/') && !savedLibraryIdsRef.current.has(key)) {
                            savedLibraryIdsRef.current.add(key);
                            saveImageToLibrary({
                                dataUrl: item.image.url,
                                type: platform === 'resize' || item.resizedFrom ? 'resize' : 'thumbnail',
                                title: item.variationName || PLATFORM_CONFIGS[platform]?.title || 'Generated Design',
                                platform,
                                aspectRatio: item.resizeSpec?.aspectRatio || PLATFORM_CONFIGS[platform]?.aspectRatio || '',
                            });
                        }
                    }
                }
            } else {
                sessionStorage.removeItem('revo3.latestResults');
            }
        } catch {
            // If finished images exceed sessionStorage quota, remove stale entry so old loading states never reappear
            try {
                sessionStorage.removeItem('revo3.latestResults');
            } catch {
                // Ignore
            }
        }
    }, [results]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isBatchResizing, setIsBatchResizing] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [editingImage, setEditingImage] = useState<ImageAsset | null>(null);
    const [editorState, setEditorState] = useState<EditorState | null>(null);
    const [previewingImage, setPreviewingImage] = useState<ImageAsset | null>(null);

    // AI Assistant State
    const [isAssistantOpen, setIsAssistantOpen] = useState(false);
    const [isAssistantProcessing, setIsAssistantProcessing] = useState(false);
    const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
        { id: 1, sender: 'ai', text: "Hello! I'm your AI design assistant. How can I help you? You can ask me to change text, colors, or even suggest ideas." }
    ]);

    // Mobile Sidebar State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const ai = useRef<GoogleGenAI>(createAiClient());
    
    // Save preferences to localStorage on change
    useEffect(() => {
        savePreferences(colors, preferences);
    }, [preferences, colors]);

    // Check for a saved editor session on initial load
    useEffect(() => {
        const savedState = loadEditorState();
        if (savedState) {
            if (window.confirm("You have a saved editor project. Would you like to restore it?")) {
                setEditorState(savedState);
            } else {
                clearEditorState();
            }
        }
    }, []);

    const handleGenerate = async (improveMode: 'improve' | 'reimagine' = 'improve') => {
        if (isGenerating) return;

        const requestedVariations = Math.max(1, Number(preferences.variations || 1));
        const requiredCredits = requestedVariations * CREDIT_COSTS.DESIGN_PER_VARIATION;

        // Check credits before generating (2 credits per generated image variation)
        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, requiredCredits);
            if (!hasCredits) {
                toast.error(`Insufficient credits. Generating ${requestedVariations} image${requestedVariations > 1 ? 's' : ''} requires ${requiredCredits} credits. Please purchase credits to continue.`);
                return;
            }
        }

        setIsGenerating(true);
        setResults([]);
        // Close sidebar on mobile after starting generation
        setIsSidebarOpen(false);

        try {
            let videoFrames: ImageAsset[] = [];
            if (videoAsset) {
                videoFrames = await extractFramesFromVideo(videoAsset.url, trimTimes.start, trimTimes.end, 3, videoAsset.file);
            }
            const allImages = [...images, ...videoFrames];
            const results = await generateDesign(
                ai.current,
                allImages,
                logo,
                colors,
                preferences,
                platform,
                youtubeTranscript,
                originalYoutubeTitle,
                text,
                improveMode,
                referenceThumbnail
            );
            
            // Deduct credits based on actual generated images (2 credits per image) and refresh navbar balance
            if (user) {
                const platformName = PLATFORM_CONFIGS[platform].title;
                const actualCount = Math.max(1, results.length);
                const actualCredits = actualCount * CREDIT_COSTS.DESIGN_PER_VARIATION;
                await deductCredits(user.id, `Generate ${platformName} (${actualCount}x)`, actualCredits, { platform, count: actualCount });
                await refreshCredits();
            }
            
            setResults(results);
            toast.success('Designs generated successfully!');
        } catch (e: any) {
            console.error(e);
            toast.error(`An error occurred: ${e.message || 'Failed to generate designs'}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleVideoAssetChange = (nextVideo: VideoAsset | null) => {
        setVideoAsset(nextVideo);
        setAnalysisResult(null);
        setTrimTimes({ start: 0, end: 1 });
        setCutoutAssets([]);
        setImages(prev => prev.filter(img => !img.id.startsWith('face_')));
        setText(createDefaultText());
        setResults([]);
    };

    const handleAnalyzeVideo = async () => {
        if (!videoAsset || isAnalyzing) return;

        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, CREDIT_COSTS.ANALYZE_VIDEO);
            if (!hasCredits) {
                toast.error(`Insufficient credits. Analyzing video requires ${CREDIT_COSTS.ANALYZE_VIDEO} credit.`);
                return;
            }
        }

        setIsAnalyzing(true);
        setAnalysisResult(null);

        try {
            const frames = await extractFramesFromVideo(videoAsset.url, trimTimes.start, trimTimes.end, 5, videoAsset.file);
            const result = await analyzeVideoAndSuggestStyles(ai.current, frames);
            if (user) {
                await deductCredits(user.id, 'Analyze Video', CREDIT_COSTS.ANALYZE_VIDEO, { feature: 'analyze_video' });
                await refreshCredits();
            }
            setAnalysisResult(result);
            setColors(result.suggestedColors);
            setPreferences(prev => ({ ...prev, style: result.suggestedStyle }));
            if (result.suggestedHeadline || result.suggestedSubheadline) {
                setText(prev => ({
                    ...prev,
                    headline: result.suggestedHeadline || prev.headline,
                    subheadline: result.suggestedSubheadline ?? prev.subheadline,
                }));
            }
            toast.success('Video analyzed — style, colors & headline hooks suggested!');
        } catch (e: any) {
            console.error(e);
            toast.error(`Failed to analyze video: ${e.message || 'Unknown error'}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleExtractFaces = async () => {
        if (!videoAsset || isExtractingFaces) return;

        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, CREDIT_COSTS.EXTRACT_FACES);
            if (!hasCredits) {
                toast.error(`Insufficient credits. Extracting faces requires ${CREDIT_COSTS.EXTRACT_FACES} credit.`);
                return;
            }
        }

        setIsExtractingFaces(true);
        try {
            // Scan 8 evenly spaced frames across the selected clip range to capture different people & peak moments
            const frames = await extractFramesFromVideo(videoAsset.url, trimTimes.start, trimTimes.end, 8, videoAsset.file);
            if (!frames || frames.length === 0) {
                throw new Error("Could not extract frames from the video.");
            }
            const { cutouts, selectedMoments, scannedCount } = await extractBestFacesFromVideoFrames(ai.current, frames);
            const allExtracted = [...cutouts, ...selectedMoments];
            if (user) {
                await deductCredits(user.id, 'Extract Faces', CREDIT_COSTS.EXTRACT_FACES, {
                    feature: 'extract_faces',
                    count: allExtracted.length,
                    scannedFrames: scannedCount,
                });
                await refreshCredits();
            }
            setCutoutAssets(prev => [...prev, ...allExtracted]);
            setImages(prev => [...prev, ...allExtracted]);
            toast.success(
                selectedMoments.length > 0
                    ? `Scanned ${scannedCount} frames — added ${cutouts.length} face cutout + ${selectedMoments.length} best video shot(s) for a realistic thumbnail!`
                    : `Scanned ${scannedCount} frames — extracted ${cutouts.length} sharpest face cutout and added to your Images!`
            );
        } catch (e: any) {
            console.error(e);
            toast.error(`Failed to extract faces: ${e.message || 'Unknown error'}`);
        } finally {
            setIsExtractingFaces(false);
        }
    };

    const handleOpenEditor = (result: DesignResult) => {
        if (!result.image) return;

        const platformConfig = PLATFORM_CONFIGS[platform];
        const [width, height] = platformConfig.aspectRatio.split(':').map(Number);
        const canvasHeight = 720;
        const canvasWidth = (canvasHeight / height) * width;

        const headlineContent = result.suggestedHeadline || text.headline;
        const subheadlineContent = result.suggestedSubheadline || text.subheadline;

        const headlineElement: EditableElement = {
            id: `text_${Date.now()}`, type: 'text',
            x: canvasWidth * 0.1, y: canvasHeight * 0.65,
            width: canvasWidth * 0.8, height: 100, rotation: 0,
            content: headlineContent, fontFamily: text.headlineFont, fontSize: text.headlineSize,
            fontWeight: text.headlineWeight, fontStyle: text.headlineItalic ? 'italic' : 'normal', color: text.headlineColor,
        };
        const subheadlineElement: EditableElement = {
            id: `text_${Date.now()+1}`, type: 'text',
            x: canvasWidth * 0.1, y: canvasHeight * 0.8,
            width: canvasWidth * 0.8, height: 50, rotation: 0,
            content: subheadlineContent, fontFamily: text.subheadlineFont, fontSize: text.subheadlineSize,
            fontWeight: text.subheadlineWeight, fontStyle: text.subheadlineItalic ? 'italic' : 'normal', color: text.subheadlineColor,
        };

        const newEditorState: EditorState = {
            background: result.image,
            elements: [headlineElement, subheadlineElement].filter(el => el.content),
            aspectRatio: platformConfig.aspectRatio,
        };
        setEditorState(newEditorState);
        saveEditorState(newEditorState);
    };
    
    const handleCloseEditor = () => {
        setEditorState(null);
        clearEditorState();
    };

    const handleAdaptDesign = async (sourceImage: ImageAsset, option: ResizeOption) => {
        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, CREDIT_COSTS.RESIZE_PER_SIZE);
            if (!hasCredits) {
                toast.error(`Insufficient credits. Resizing requires ${CREDIT_COSTS.RESIZE_PER_SIZE} credit per size.`);
                return;
            }
        }

        const tempId = `resizing_${option.id}_${Date.now()}`;
        const placeholderCard: DesignResult = {
            image: { ...sourceImage, id: tempId },
            isResizing: true,
            resizingLabel: option.label,
            description: `Resizing · ${option.label}`,
        };

        // Drop a loading card right onto the current canvas without wiping existing thumbnails or switching tabs
        setResults(prev => [...prev, placeholderCard]);

        try {
            const resizedResult = await resizeThumbnailForSize(ai.current, sourceImage, option);
            if (user) {
                await deductCredits(user.id, `Smart Resize (${option.label})`, CREDIT_COSTS.RESIZE_PER_SIZE, { platform: 'resize', count: 1 });
                await refreshCredits();
            }
            setResults(prev => prev.map(item => (item.image?.id === tempId ? resizedResult : item)));
            toast.success(`Resized to ${option.label} and added to canvas!`);
        } catch (e: any) {
            console.error(e);
            setResults(prev => prev.filter(item => item.image?.id !== tempId));
            toast.error(`Resize failed: ${e.message || 'Unknown error'}`);
        }
    };

    const handleBatchResize = async (sourceImage: ImageAsset, options: ResizeOption[]) => {
        if (isBatchResizing || options.length === 0) return;

        const requiredCredits = options.length * CREDIT_COSTS.RESIZE_PER_SIZE;
        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, requiredCredits);
            if (!hasCredits) {
                toast.error(`Insufficient credits. Resizing ${options.length} size${options.length > 1 ? 's' : ''} requires ${requiredCredits} credit${requiredCredits > 1 ? 's' : ''}.`);
                return;
            }
        }

        setIsBatchResizing(true);
        setIsSidebarOpen(false);

        const now = Date.now();
        const placeholders = options.map((opt, idx) => {
            const tempId = `batch_resize_${opt.id}_${now}_${idx}`;
            return {
                tempId,
                option: opt,
                card: {
                    image: { ...sourceImage, id: tempId },
                    isResizing: true,
                    resizingLabel: opt.label,
                    description: `Resizing · ${opt.label}`,
                } as DesignResult,
            };
        });

        // Drop loading cards for all selected sizes onto the canvas
        setResults(prev => [...prev, ...placeholders.map(p => p.card)]);

        let successCount = 0;
        await Promise.allSettled(
            placeholders.map(async ({ tempId, option }) => {
                try {
                    const resized = await resizeThumbnailForSize(ai.current, sourceImage, option);
                    successCount++;
                    setResults(prev => prev.map(item => (item.image?.id === tempId ? resized : item)));
                } catch (err: any) {
                    console.error(`Resize failed for ${option.label}:`, err);
                    setResults(prev => prev.filter(item => item.image?.id !== tempId));
                    toast.error(`Failed to resize to ${option.label}`);
                }
            })
        );

        if (successCount > 0) {
            if (user) {
                const actualCredits = successCount * CREDIT_COSTS.RESIZE_PER_SIZE;
                await deductCredits(user.id, `Smart Resize (${successCount}x)`, actualCredits, { platform: 'resize', count: successCount });
                await refreshCredits();
            }
            toast.success(`Resized into ${successCount} size${successCount > 1 ? 's' : ''}!`);
        }

        setIsBatchResizing(false);
    };

    const handleGenerateImage = async (prompt: string, negativePrompt: string, aspectRatio: ImagenAspectRatio): Promise<ImageAsset | null> => {
        // Check credits before generating
        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, CREDIT_COSTS.AI_IMAGE);
            if (!hasCredits) {
                toast.error(`Insufficient credits. You need ${CREDIT_COSTS.AI_IMAGE} credits to generate images. Please purchase credits to continue.`);
                return null;
            }
        }

        setIsGeneratingImage(true);
        try {
            const image = await generateImage(ai.current, prompt, negativePrompt, aspectRatio);
            if (image) {
                // Deduct credits after successful generation
                if (user) {
                    await deductCredits(user.id, 'Generate AI Image', CREDIT_COSTS.AI_IMAGE, { feature: 'image_generation', aspectRatio });
                    await refreshCredits();
                }
                setImages(prev => [...prev, image]);
                toast.success('Image generated successfully!');
            }
            return image;
        } catch (e: any) {
            console.error(e);
            toast.error(`Image generation failed: ${e.message || 'Unknown error'}`);
            return null;
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleGenerateVideo = async (prompt: string, aspectRatio: VeoAspectRatio) => {
        // Check credits before generating video (10 credits)
        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, CREDIT_COSTS.AI_VIDEO);
            if (!hasCredits) {
                toast.error(`Insufficient credits. You need ${CREDIT_COSTS.AI_VIDEO} credits to generate videos. Please purchase credits to continue.`);
                return;
            }
        }

        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
            await window.aistudio.openSelectKey();
        }

        setIsGeneratingVideo(true);
        setVideoAsset(null);

        try {
            const localAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            let operation = await localAi.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt,
                config: {
                    numberOfVideos: 1,
                    resolution: '720p',
                    aspectRatio: aspectRatio,
                }
            });
            
            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                operation = await localAi.operations.getVideosOperation({ operation: operation });
            }
            
            if (operation.error) {
                throw new Error(`Video generation failed: ${operation.error.message}`);
            }
    
            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (!downloadLink) {
                throw new Error("Video generation succeeded but no download link was provided.");
            }
            
            const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
            if (!videoResponse.ok) {
                const errorText = await videoResponse.text();
                if (errorText.includes("Requested entity was not found")) {
                    await window.aistudio.openSelectKey();
                    throw new Error("API Key issue. Please select your key and try generating again.");
                }
                throw new Error(`Failed to download the generated video. Status: ${videoResponse.status}`);
            }
            
            const videoBlob = await videoResponse.blob();
            const videoFile = new File([videoBlob], `generated-video-${Date.now()}.mp4`, { type: 'video/mp4' });
            const videoUrl = URL.createObjectURL(videoFile);
            
            // Deduct credits after successful generation
            if (user) {
                await deductCredits(user.id, 'Generate AI Video', CREDIT_COSTS.AI_VIDEO, { feature: 'video_generation', aspectRatio });
                await refreshCredits();
            }
            
            setVideoAsset({
                id: `gen_vid_${Date.now()}`,
                file: videoFile,
                url: videoUrl
            });
            toast.success('Video generated successfully!');
    
        } catch (e: any) {
            console.error(e);
            toast.error(`An error occurred during video generation: ${e.message || 'Unknown error'}`);
        } finally {
            setIsGeneratingVideo(false);
        }
    };

    const handleConfirmEdit = async (originalImage: ImageAsset, prompt: string, mask: ImageAsset | null) => {
        const originalId = originalImage.id;
        const resultIndex = results.findIndex(r => r.image?.id === originalId);
        if (resultIndex === -1) return;

        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, CREDIT_COSTS.AI_EDIT);
            if (!hasCredits) {
                toast.error(`Insufficient credits. Editing an image requires ${CREDIT_COSTS.AI_EDIT} credits.`);
                return;
            }
        }

        setResults(prev => prev.map((r, i) => i === resultIndex ? { ...r, isEditing: true } : r));
        setEditingImage(null);

        try {
            const editedImage = await editImage(ai.current, originalImage, prompt, mask);
            if (user) {
                await deductCredits(user.id, 'AI Image Edit', CREDIT_COSTS.AI_EDIT, { feature: 'image_edit' });
                await refreshCredits();
            }
            const newResults = results.map(r => r.image?.id === originalId ? { ...r, image: editedImage } : r);
            setResults(newResults);
            toast.success('Image edited successfully!');
        } catch(e: any) {
            console.error(e);
            toast.error(`Failed to edit image: ${e.message || 'Unknown error'}`);
        } finally {
            setResults(prev => prev.map((r, i) => i === resultIndex ? { ...r, isEditing: false } : r));
        }
    };
    
    const handleUpscaleImage = async (imageToUpscale: ImageAsset) => {
        const originalId = imageToUpscale.id;
        const resultIndex = results.findIndex(r => r.image?.id === originalId);
        if (resultIndex === -1) return;

        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, CREDIT_COSTS.AI_UPSCALE);
            if (!hasCredits) {
                toast.error(`Insufficient credits. Upscaling an image requires ${CREDIT_COSTS.AI_UPSCALE} credits.`);
                return;
            }
        }
        
        setResults(prev => prev.map((r, i) => i === resultIndex ? { ...r, isUpscaling: true } : r));

        try {
            const upscaledImage = await upscaleImage(ai.current, imageToUpscale);
            if (user) {
                await deductCredits(user.id, 'AI Image Upscale', CREDIT_COSTS.AI_UPSCALE, { feature: 'image_upscale' });
                await refreshCredits();
            }
            const newResults = results.map(r => r.image?.id === originalId ? { ...r, image: upscaledImage } : r);
            setResults(newResults);
            toast.success('Image upscaled successfully!');
        } catch(e: any) {
            console.error(e);
            toast.error(`Failed to upscale image: ${e.message || 'Unknown error'}`);
        } finally {
            setResults(prev => prev.map((r, i) => i === resultIndex ? { ...r, isUpscaling: false } : r));
        }
    };

    const handleDownloadImage = (imageToDownload: ImageAsset) => {
        const link = document.createElement('a');
        link.href = imageToDownload.url;
        link.download = `ai-design-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleAssistantSubmit = async (message: string) => {
        const newUserMessage: AssistantMessage = { id: Date.now(), sender: 'user', text: message };
        setAssistantMessages(prev => [...prev, newUserMessage]);
        setIsAssistantProcessing(true);
    
        try {
            const response = await getAssistantResponse(ai.current, message, { text, colors, preferences });
            
            let newColors = colors;
            let shouldRecolor = false;
    
            // Apply state changes from AI response
            if (response.action) {
                switch (response.action) {
                    case 'update_text':
                        setText(prev => ({...prev, [response.payload.field]: response.payload.value}));
                        break;
                    case 'update_color':
                        const updatedSingle = { ...colors, [response.payload.color]: response.payload.value };
                        setColors(updatedSingle);
                        newColors = updatedSingle;
                        shouldRecolor = true;
                        break;
                    case 'suggest_colors':
                        setColors(response.payload.colors);
                        newColors = response.payload.colors;
                        shouldRecolor = true;
                        break;
                    case 'update_preference':
                        setPreferences(prev => ({...prev, [response.payload.field]: response.payload.value}));
                        break;
                }
            }
            
            const newAiMessage: AssistantMessage = {
                id: Date.now() + 1,
                sender: 'ai',
                text: response.responseMessage,
                isActionableSuggestion: response.action?.startsWith('suggest_')
            };
            setAssistantMessages(prev => [...prev, newAiMessage]);
    
            // If a color change was requested and there are designs on screen, recolor them live.
            if (shouldRecolor && results.length > 0) {
                setResults(prev => prev.map(r => ({ ...r, isEditing: true })));
    
                const recolorPromises = results.map(result => {
                    if (!result.image) return Promise.resolve(result);
                    const prompt = `Recolor this entire image to match a new color palette. The new palette is: Primary: ${newColors.primary}, Secondary: ${newColors.secondary}, Accent: ${newColors.accent}, Background: ${newColors.background}. IMPORTANT: Do NOT change the content, subjects, or composition of the image. Only alter the existing colors to match the new palette harmoniously.`;
                    
                    return editImage(ai.current, result.image, prompt, null).then(recoloredImage => ({
                        ...result,
                        image: recoloredImage,
                    })).catch(err => {
                        console.error("Recoloring failed for one image:", err);
                        toast.warning(`Failed to recolor one image: ${err.message || 'Unknown error'}`);
                        return { ...result };
                    });
                });
    
                const newResults = await Promise.all(recolorPromises);
                setResults(newResults.map(r => ({ ...r, isEditing: false })));
                toast.success('Designs recolored successfully!');
    
                const completionMessage: AssistantMessage = {
                    id: Date.now() + 2,
                    sender: 'ai',
                    text: "All done! How do the new colors look?"
                };
                setAssistantMessages(prev => [...prev, completionMessage]);
            }
    
        } catch (e: any) {
            console.error("Assistant Error:", e);
            toast.error(`Assistant error: ${e.message || 'Unknown error'}`);
            const errorAiMessage: AssistantMessage = {
                id: Date.now() + 1,
                sender: 'ai',
                text: "Sorry, I encountered an error. Please try again."
            };
            setAssistantMessages(prev => [...prev, errorAiMessage]);
        } finally {
            setIsAssistantProcessing(false);
        }
    };

    return (
        <div className="app-container">
            <Header 
                platform={platform} 
                onPlatformChange={handlePlatformChange}
                onSidebarToggle={() => setIsSidebarOpen(prev => !prev)}
                isSidebarOpen={isSidebarOpen}
            />
            {platform === 'repurpose' ? (
                /* Content Repurpose Module - generates short viral videos */
                <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                    <RepurposeModule
                        onCreateCoverThumbnail={({ imageDataUrl, images: pickedImages, title }) => {
                            const rawUrls = (pickedImages && pickedImages.length > 0 ? pickedImages : [imageDataUrl]).filter(Boolean);
                            const assets: ImageAsset[] = [];
                            rawUrls.forEach((dataUrl, idx) => {
                                const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
                                if (match) {
                                    assets.push({
                                        id: `clip_cover_${Date.now()}_${idx}`,
                                        url: dataUrl,
                                        base64: match[2],
                                        mimeType: match[1],
                                    });
                                }
                            });
                            if (assets.length > 0) {
                                setImages(assets);
                            }
                            const shortHeadline = (title || '')
                                .replace(/[#*_`]/g, '')
                                .trim()
                                .split(/\s+/)
                                .slice(0, 6)
                                .join(' ');
                            if (shortHeadline) {
                                setTextByPlatform((prev) => ({
                                    ...prev,
                                    youtube: {
                                        ...(prev.youtube ?? createDefaultText()),
                                        headline: shortHeadline,
                                    },
                                }));
                            }
                            handlePlatformChange('youtube');
                            toast.success(
                                assets.length > 1
                                    ? `Picked the ${assets.length} sharpest face shots from your clip! Click Generate to design your cover.`
                                    : 'Sharpest clip frame sent to Thumbnail Studio! Click Generate to design your cover.'
                            );
                        }}
                    />
                </div>
            ) : platform === 'youtube_tools' ? (
                /* YouTube Thumbnail Downloader & Transcript Extractor */
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <YouTubeToolsView onSwitchPlatform={handlePlatformChange} />
                </div>
            ) : (
                /* Design Studio - generates thumbnails and images */
                <main className="main-content">
                    {/* Credit Management - shown after Twitter Card */}
                    {platform === 'twitter_card' && (
                        <div style={{ padding: '2rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
                            <CreditManagement />
                        </div>
                    )}
                    {/* Mobile Sidebar Overlay */}
                    {isSidebarOpen && (
                        <div 
                            className="sidebar-overlay"
                            onClick={() => setIsSidebarOpen(false)}
                        />
                    )}
                    <Sidebar
                        platform={platform}
                        text={text} onTextChange={setText}
                        images={images} onImagesChange={setImages}
                        referenceThumbnail={referenceThumbnail} onReferenceThumbnailChange={setReferenceThumbnail}
                        videoAsset={videoAsset} onVideoAssetChange={handleVideoAssetChange}
                        trimTimes={trimTimes} onTrimTimesChange={setTrimTimes}
                        isAnalyzing={isAnalyzing} onAnalyzeVideo={handleAnalyzeVideo}
                        analysisResult={analysisResult} onAnalysisResultChange={setAnalysisResult}
                        onExtractFaces={handleExtractFaces} isExtractingFaces={isExtractingFaces}
                        logo={logo} onLogoChange={setLogo}
                        colors={colors} onColorsChange={setColors}
                        preferences={preferences} onPreferencesChange={setPreferences}
                        onGenerate={handleGenerate}
                        isGenerating={isGenerating}
                        onGenerateImage={handleGenerateImage}
                        isGeneratingImage={isGeneratingImage}
                        onGenerateVideo={handleGenerateVideo}
                        isGeneratingVideo={isGeneratingVideo}
                        onTranscriptChange={setYoutubeTranscript}
                        onOriginalTitleChange={setOriginalYoutubeTitle}
                        onBatchResize={handleBatchResize}
                        isBatchResizing={isBatchResizing}
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                    />
                    <Canvas
                        results={results}
                        isGenerating={isGenerating}
                        platform={platform}
                        onEdit={handleOpenEditor}
                        onAiEdit={(image) => setEditingImage(image)}
                        onUpscale={handleUpscaleImage}
                        onDownload={handleDownloadImage}
                        onPreview={(image) => setPreviewingImage(image)}
                        onAdapt={handleAdaptDesign}
                        onClearCanvas={() => setResults([])}
                        onAssistantToggle={() => setIsAssistantOpen(prev => !prev)}
                    />
                </main>
            )}
            {editorState && (
                <Editor
                    initialState={editorState}
                    onClose={handleCloseEditor}
                    assets={cutoutAssets}
                />
            )}
            {editingImage && (
                <MagicStudioModal
                    image={editingImage}
                    onConfirm={handleConfirmEdit}
                    onCancel={() => setEditingImage(null)}
                />
            )}
            {previewingImage && (
                <PreviewModal
                    image={previewingImage}
                    onCancel={() => setPreviewingImage(null)}
                />
            )}
            {isAssistantOpen && (
                <AssistantPanel
                    messages={assistantMessages}
                    isProcessing={isAssistantProcessing}
                    onSubmit={handleAssistantSubmit}
                    onClose={() => setIsAssistantOpen(false)}
                />
            )}
        </div>
    );
};
