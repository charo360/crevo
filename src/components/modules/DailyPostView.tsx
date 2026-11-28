import React, { FC, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { GoogleGenAI } from '@google/genai';
import {
    ColorsState,
    ImageAsset,
    LogoState,
    PreferencesState,
    SavedCharacter,
    TextState,
} from '../../types';
import { generateDesign } from '../../core/services/ai-providers/gemini';
import { fileToBase64 } from '../../shared/utils/image-utils';
import { apiRequest } from '../../lib/api';
import { OutfitSelector } from './OutfitSelector';
import { useAuth } from '../../contexts/AuthContext';
import { CREDIT_COSTS, deductCredits, hasEnoughCredits } from '../../services/payments/creditService';
import { triggerOutOfCreditsModal } from '../modals/OutOfCreditsModal';
import { saveImageToLibrary } from '../../services/libraryService';

interface SocialTarget {
    id: string;
    label: string;
    shortLabel: string;
    aspectRatio: '4:5' | '1:1' | '16:9' | '9:16';
    captionStyle: string;
}

const SOCIAL_TARGETS: SocialTarget[] = [
    {
        id: 'instagram_portrait',
        label: 'Instagram Post (4:5)',
        shortLabel: 'Instagram 4:5',
        aspectRatio: '4:5',
        captionStyle: 'engaging Instagram caption with a strong hook line, short punchy paragraphs, a question CTA, and 5-8 relevant hashtags',
    },
    {
        id: 'instagram_square',
        label: 'Instagram / FB (1:1)',
        shortLabel: 'Square 1:1',
        aspectRatio: '1:1',
        captionStyle: 'conversational Instagram/Facebook caption with a clear hook, practical takeaway, and 5-7 hashtags',
    },
    {
        id: 'linkedin',
        label: 'LinkedIn (1:1)',
        shortLabel: 'LinkedIn 1:1',
        aspectRatio: '1:1',
        captionStyle: 'sharp, authentic LinkedIn post with short scannable lines, a strong opening insight, zero fluff, and 3-5 professional hashtags',
    },
    {
        id: 'x_twitter',
        label: 'X / Twitter (16:9)',
        shortLabel: 'X / Twitter 16:9',
        aspectRatio: '16:9',
        captionStyle: 'concise, high-punch X/Twitter post under 260 characters with 1-3 hashtags max',
    },
    {
        id: 'story_reels',
        label: 'Story / Reels (9:16)',
        shortLabel: 'Story 9:16',
        aspectRatio: '9:16',
        captionStyle: 'short punchy Reels/TikTok/Story caption with a curiosity hook and 4-6 hashtags',
    },
    {
        id: 'youtube_community',
        label: 'YT Community (1:1)',
        shortLabel: 'YT Community',
        aspectRatio: '1:1',
        captionStyle: 'warm YouTube Community post written directly to subscribers inviting comments, with 0-2 hashtags',
    },
];

interface PostTypeOption {
    id: string;
    label: string;
    visualGuidance: string;
}

const POST_TYPES: PostTypeOption[] = [
    {
        id: 'tip',
        label: '💡 Tip / Value',
        visualGuidance: 'Clean editorial value-post visual with crisp hierarchy, high readability, and modern creator polish.',
    },
    {
        id: 'quote',
        label: '💬 Quote / Hot Take',
        visualGuidance: 'Bold minimalist typographic social post with strong contrast and clean breathing room around the statement.',
    },
    {
        id: 'lifestyle',
        label: '📸 Lifestyle / Personal',
        visualGuidance: 'Authentic candid real-camera lifestyle photograph (50mm DSLR look, natural real-world lighting, zero AI plastic look).',
    },
    {
        id: 'promo',
        label: '🚀 Promo / Launch',
        visualGuidance: 'High-impact announcement/launch graphic with clear focal subject, clean modern badge/headline, and premium brand look.',
    },
    {
        id: 'story',
        label: '📖 Story / Lesson',
        visualGuidance: 'Relatable storytelling social post with authentic emotion, natural framing, and clean hook text.',
    },
];

interface DailyPostViewProps {
    ai: GoogleGenAI;
    savedCharacters: SavedCharacter[];
    logo: LogoState;
    colors: ColorsState;
    preferences: PreferencesState;
    onPreferencesChange: (p: PreferencesState) => void;
    brandChannelName?: string;
}

function extractTextFromAiResponse(res: any): string {
    const parts = res?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
        return parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('\n').trim();
    }
    return typeof res?.text === 'string' ? res.text.trim() : '';
}

export const DailyPostView: FC<DailyPostViewProps> = ({
    ai,
    savedCharacters,
    logo,
    colors,
    preferences,
    onPreferencesChange,
    brandChannelName = '',
}) => {
    const { user, refreshCredits } = useAuth();
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const [targetId, setTargetId] = useState<string>('instagram_portrait');
    const [postTypeId, setPostTypeId] = useState<string>('tip');
    const [topic, setTopic] = useState<string>('');
    const [headlineOnImage, setHeadlineOnImage] = useState<string>('');
    const [useBrandKit, setUseBrandKit] = useState<boolean>(true);
    const [attachedImages, setAttachedImages] = useState<ImageAsset[]>([]);
    const autoSelectedRef = useRef<boolean>(false);

    const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [isRegeneratingCaption, setIsRegeneratingCaption] = useState<boolean>(false);

    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [caption, setCaption] = useState<string>('');
    const [hashtags, setHashtags] = useState<string[]>([]);

    const selectedTarget = SOCIAL_TARGETS.find((t) => t.id === targetId) || SOCIAL_TARGETS[0];
    const selectedPostType = POST_TYPES.find((p) => p.id === postTypeId) || POST_TYPES[0];

    // Auto-select single saved character once
    useEffect(() => {
        if (savedCharacters.length === 1 && !autoSelectedRef.current) {
            autoSelectedRef.current = true;
            setAttachedImages((prev) => (prev.length === 0 ? savedCharacters[0].photos : prev));
        }
    }, [savedCharacters]);

    const toggleCharacter = (char: SavedCharacter) => {
        const exists = attachedImages.some((img) => img.characterId === char.id);
        if (exists) {
            setAttachedImages((prev) => prev.filter((img) => img.characterId !== char.id));
        } else {
            setAttachedImages((prev) => [...prev, ...char.photos]);
        }
    };

    const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;
        try {
            const added: ImageAsset[] = [];
            for (const file of files.slice(0, 3)) {
                if (!file.type.startsWith('image/')) continue;
                const { base64, mimeType } = await fileToBase64(file);
                added.push({
                    id: `dp_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    url: `data:${mimeType};base64,${base64}`,
                    base64,
                    mimeType,
                });
            }
            if (added.length > 0) {
                setAttachedImages((prev) => [...prev, ...added]);
            }
        } catch (err: any) {
            toast.error(err?.message || 'Could not read selected photo.');
        }
    };

    const generateSocialCaption = async (postTopic: string, onImageText: string) => {
        const prompt = `Write a ready-to-paste social media post for ${selectedTarget.label}.
- Post Type: ${selectedPostType.label}
- Creator / Brand: ${brandChannelName || 'Creator'}
- Topic: ${postTopic}
- Text shown on the visual: ${onImageText || '(none / photo-only)'}
- Style requirement: ${selectedTarget.captionStyle}

Return STRICT JSON only (no markdown fences) with this exact shape:
{"caption":"...","hashtags":["#tag1","#tag2"]}`;

        const res = await apiRequest<any>('/api/ai/generate', {
            method: 'POST',
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                contents: { parts: [{ text: prompt }] },
            }),
        });
        const raw = extractTextFromAiResponse(res);
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            setCaption(typeof parsed.caption === 'string' ? parsed.caption.trim() : raw);
            setHashtags(
                Array.isArray(parsed.hashtags)
                    ? parsed.hashtags
                          .map((h: any) => String(h || '').trim())
                          .filter(Boolean)
                          .map((h: string) => (h.startsWith('#') ? h : `#${h}`))
                    : []
            );
        } catch {
            setCaption(raw);
            setHashtags([]);
        }
    };

    const handleSuggestIdea = async () => {
        if (isSuggesting) return;
        setIsSuggesting(true);
        try {
            const prompt = `Suggest 1 fresh, high-engagement daily social media post idea for ${selectedTarget.label}.
- Post Type: ${selectedPostType.label}
- Creator / Brand Name: ${brandChannelName || 'Content Creator / Entrepreneur'}
- Current rough topic (if any): ${topic.trim() || '(none — pick a timely, relatable creator/growth topic)'}

Return STRICT JSON only (no markdown fences):
{"topic":"1-2 sentence post idea","headline":"Short 3-6 word punchy on-image hook"}`;

            const res = await apiRequest<any>('/api/ai/generate', {
                method: 'POST',
                body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    contents: { parts: [{ text: prompt }] },
                }),
            });
            const raw = extractTextFromAiResponse(res);
            const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.topic) setTopic(String(parsed.topic).trim());
            if (parsed.headline) setHeadlineOnImage(String(parsed.headline).trim());
            toast.success('Fresh post idea ready!');
        } catch (err: any) {
            toast.error(err?.message || 'Could not suggest an idea right now.');
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleGenerateDailyPost = async () => {
        if (isGenerating) return;
        const cleanTopic = topic.trim();
        const cleanHeadline = headlineOnImage.trim();
        if (!cleanTopic && !cleanHeadline) {
            toast.error('Enter a topic or click "Suggest Idea" first.');
            return;
        }

        const requiredCredits = CREDIT_COSTS.DESIGN_PER_VARIATION;
        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, requiredCredits);
            if (!hasCredits) {
                triggerOutOfCreditsModal({
                    requiredCredits,
                    actionLabel: 'Generating a Daily Social Post',
                });
                toast.error(`You need ${requiredCredits} credits to generate a Daily Post.`);
                return;
            }
        }

        setIsGenerating(true);
        try {
            // Auto-attach any saved character mentioned by name in topic/headline
            const combinedText = `${cleanTopic} ${cleanHeadline}`;
            const autoMatched: ImageAsset[] = [];
            for (const char of savedCharacters) {
                if (attachedImages.some((img) => img.characterId === char.id)) continue;
                const escaped = char.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (escaped && new RegExp(`\\b${escaped}\\b`, 'i').test(combinedText)) {
                    autoMatched.push(...char.photos);
                }
            }
            const imagesForGen = [...attachedImages, ...autoMatched];

            const effectiveColors: ColorsState = useBrandKit
                ? colors
                : { primary: '#571c86', secondary: '#7e22ce', accent: '#facc15', background: '#111827' };
            const effectiveLogo: LogoState = useBrandKit
                ? logo
                : { url: null, base64: null, mimeType: null, size: 15, opacity: 100, position: 'top-right' };

            const postTextState: TextState = {
                headline: cleanHeadline,
                headlineFont: 'Montserrat',
                headlineSize: 64,
                headlineWeight: 'bold',
                headlineItalic: false,
                headlineColor: '#ffffff',
                subheadline: '',
                subheadlineFont: 'Inter',
                subheadlineSize: 28,
                subheadlineWeight: 'normal',
                subheadlineItalic: false,
                subheadlineColor: '#f3f4f6',
                body: `DAILY SOCIAL POST FOR ${selectedTarget.label}. Post Type: ${selectedPostType.label}. Visual direction: ${selectedPostType.visualGuidance} Topic & scene: ${cleanTopic || cleanHeadline}. ${
                    cleanHeadline
                        ? `Render ONLY this clean, readable headline on the graphic: "${cleanHeadline}".`
                        : 'Do NOT render any text overlay on the image — make it a clean, authentic, photo-only social post.'
                }`,
                author: brandChannelName || '',
            };

            const dailyPrefs: PreferencesState = {
                ...preferences,
                variations: 1,
            };

            // Generate visual + caption in parallel
            const [designResults] = await Promise.all([
                generateDesign(
                    ai,
                    imagesForGen,
                    effectiveLogo,
                    effectiveColors,
                    dailyPrefs,
                    'daily_post',
                    null,
                    '',
                    postTextState,
                    'improve',
                    null,
                    selectedTarget.aspectRatio
                ),
                generateSocialCaption(cleanTopic || cleanHeadline, cleanHeadline).catch(() => {}),
            ]);

            const first = designResults?.[0];
            if (!first?.image?.url) {
                throw new Error('No image was returned. Please try again.');
            }
            setGeneratedImageUrl(first.image.url);

            if (user) {
                await deductCredits(user.id, `Daily Post (${selectedTarget.shortLabel})`, requiredCredits, {
                    platform: 'daily_post',
                    socialTarget: selectedTarget.id,
                    aspectRatio: selectedTarget.aspectRatio,
                });
                await refreshCredits();
                saveImageToLibrary({
                    dataUrl: first.image.url,
                    type: 'thumbnail',
                    platform: 'daily_post',
                    title: cleanHeadline || cleanTopic.slice(0, 60) || `Daily Post (${selectedTarget.shortLabel})`,
                    aspectRatio: selectedTarget.aspectRatio,
                }).catch(() => {});
            }

            toast.success('Daily Post ready! Download the image & copy your caption.');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to generate Daily Post.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRegenerateCaption = async () => {
        if (isRegeneratingCaption) return;
        const cleanTopic = topic.trim() || headlineOnImage.trim();
        if (!cleanTopic) return;
        setIsRegeneratingCaption(true);
        try {
            await generateSocialCaption(cleanTopic, headlineOnImage.trim());
            toast.success('Caption refreshed!');
        } catch {
            toast.error('Could not refresh caption.');
        } finally {
            setIsRegeneratingCaption(false);
        }
    };

    const handleCopyCaption = async () => {
        const fullText = [caption.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n');
        if (!fullText) return;
        try {
            await navigator.clipboard.writeText(fullText);
            toast.success('Caption & hashtags copied!');
        } catch {
            toast.error('Could not copy to clipboard.');
        }
    };

    const handleDownloadImage = () => {
        if (!generatedImageUrl) return;
        const link = document.createElement('a');
        link.href = generatedImageUrl;
        link.download = `crevo-daily-post-${selectedTarget.id}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const nonCharacterUploads = attachedImages.filter((img) => !img.characterId);

    return (
        <div
            style={{
                flex: 1,
                overflow: 'auto',
                background: 'linear-gradient(180deg, #faf7ff 0%, #f5f3fa 100%)',
                padding: '20px 16px 80px',
            }}
        >
            <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', background: '#f3e8ff', color: '#571c86', fontSize: '11px', fontWeight: 800, marginBottom: '4px' }}>
                            📅 DAILY SOCIAL POST CREATOR
                        </div>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#111827' }}>
                            Create Today&apos;s Social Post in 15 Seconds
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#6b7280' }}>
                            Branded visual + ready-to-paste caption &amp; hashtags — using your real face, outfit, and Brand Kit.
                        </p>
                    </div>
                    <Link
                        to="/dashboard/brand-kit"
                        style={{
                            padding: '8px 14px',
                            borderRadius: '10px',
                            border: '1px solid #d8ccf0',
                            background: '#ffffff',
                            color: '#571c86',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            textDecoration: 'none',
                        }}
                    >
                        ⭐ Manage Characters &amp; Brand Kit
                    </Link>
                </div>

                {/* Main 2-column grid */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
                        gap: '20px',
                        alignItems: 'start',
                    }}
                >
                    {/* LEFT: Controls */}
                    <div
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            border: '1px solid #e4dcf2',
                            padding: '18px',
                            boxShadow: '0 4px 18px rgba(87, 28, 134, 0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                        }}
                    >
                        {/* 1. Platform & Size */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '8px' }}>
                                1. Platform &amp; Format
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {SOCIAL_TARGETS.map((t) => {
                                    const active = targetId === t.id;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setTargetId(t.id)}
                                            style={{
                                                padding: '6px 11px',
                                                borderRadius: '999px',
                                                border: active ? '1.5px solid #571c86' : '1px solid #e5e7eb',
                                                background: active ? '#571c86' : '#f9fafb',
                                                color: active ? '#ffffff' : '#374151',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {t.shortLabel}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Post Type */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '8px' }}>
                                2. Post Style
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {POST_TYPES.map((pt) => {
                                    const active = postTypeId === pt.id;
                                    return (
                                        <button
                                            key={pt.id}
                                            type="button"
                                            onClick={() => setPostTypeId(pt.id)}
                                            style={{
                                                padding: '6px 11px',
                                                borderRadius: '999px',
                                                border: active ? '1.5px solid #7e22ce' : '1px solid #e5e7eb',
                                                background: active ? '#f3e8ff' : '#ffffff',
                                                color: active ? '#571c86' : '#374151',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {pt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 3. Topic + Suggest Idea */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                                    3. What&apos;s today&apos;s post about?
                                </label>
                                <button
                                    type="button"
                                    onClick={handleSuggestIdea}
                                    disabled={isSuggesting || isGenerating}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid #d8ccf0',
                                        background: '#faf7ff',
                                        color: '#571c86',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: isSuggesting ? 'wait' : 'pointer',
                                    }}
                                >
                                    {isSuggesting ? 'Thinking...' : '✨ Suggest Idea'}
                                </button>
                            </div>
                            <textarea
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                                rows={3}
                                placeholder="e.g., 3 mistakes new YouTubers make with thumbnails, or behind-the-scenes working on my new video..."
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #d8ccf0',
                                    fontSize: '13.5px',
                                    color: '#111827',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                }}
                            />
                        </div>

                        {/* 4. Optional On-Image Headline */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '6px' }}>
                                4. Text on Image <span style={{ fontWeight: 500, color: '#9ca3af' }}>(optional — leave blank for photo-only)</span>
                            </label>
                            <input
                                type="text"
                                value={headlineOnImage}
                                onChange={(e) => setHeadlineOnImage(e.target.value)}
                                placeholder="e.g., STOP DOING THIS IN 2026"
                                maxLength={90}
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #e5e7eb',
                                    fontSize: '13.5px',
                                    fontWeight: 600,
                                    color: '#111827',
                                }}
                            />
                        </div>

                        {/* 5. Character / Photo + Outfit */}
                        <div
                            style={{
                                padding: '12px',
                                borderRadius: '12px',
                                background: '#faf7ff',
                                border: '1px solid #e4dcf2',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#4c1d95' }}>
                                    5. Character / Photo
                                </span>
                                <input
                                    ref={uploadInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleUploadPhotos}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => uploadInputRef.current?.click()}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #d8ccf0',
                                        background: '#ffffff',
                                        color: '#571c86',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    + Upload Photo
                                </button>
                            </div>

                            {savedCharacters.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {savedCharacters.map((char) => {
                                        const selected = attachedImages.some((img) => img.characterId === char.id);
                                        const avatarUrl = char.photos[0]?.url;
                                        return (
                                            <button
                                                key={char.id}
                                                type="button"
                                                onClick={() => toggleCharacter(char)}
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
                            ) : (
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                    Upload a photo above or{' '}
                                    <Link to="/dashboard/brand-kit" style={{ color: '#571c86', fontWeight: 700 }}>
                                        save a Named Character
                                    </Link>{' '}
                                    for 1-tap reuse.
                                </div>
                            )}

                            {nonCharacterUploads.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                    {nonCharacterUploads.map((img) => (
                                        <div
                                            key={img.id}
                                            style={{
                                                position: 'relative',
                                                width: '48px',
                                                height: '48px',
                                                borderRadius: '8px',
                                                overflow: 'hidden',
                                                border: '1px solid #d8ccf0',
                                            }}
                                        >
                                            <img src={img.url} alt="Uploaded" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <button
                                                type="button"
                                                onClick={() => setAttachedImages((prev) => prev.filter((i) => i.id !== img.id))}
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
                                                    cursor: 'pointer',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {attachedImages.length > 0 && (
                                <OutfitSelector
                                    preferences={preferences}
                                    onPreferencesChange={onPreferencesChange}
                                    disabled={isGenerating}
                                    showTopDivider
                                />
                            )}
                        </div>

                        {/* Brand Kit toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={useBrandKit}
                                onChange={(e) => setUseBrandKit(e.target.checked)}
                            />
                            Apply my Brand Kit colors &amp; logo automatically
                        </label>

                        {/* Generate CTA */}
                        <button
                            type="button"
                            onClick={handleGenerateDailyPost}
                            disabled={isGenerating}
                            style={{
                                width: '100%',
                                padding: '13px 18px',
                                borderRadius: '12px',
                                border: 'none',
                                background: isGenerating
                                    ? '#9ca3af'
                                    : 'linear-gradient(135deg, #571c86 0%, #7e22ce 100%)',
                                color: '#ffffff',
                                fontSize: '15px',
                                fontWeight: 800,
                                cursor: isGenerating ? 'wait' : 'pointer',
                                boxShadow: '0 8px 20px rgba(87, 28, 134, 0.25)',
                            }}
                        >
                            {isGenerating ? 'Creating Your Daily Post...' : '✨ Generate Daily Post (2 Credits)'}
                        </button>
                    </div>

                    {/* RIGHT: Generated Post + Ready-to-Paste Caption */}
                    <div
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            border: '1px solid #e4dcf2',
                            padding: '18px',
                            boxShadow: '0 4px 18px rgba(87, 28, 134, 0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                                Ready-to-Post Pack ({selectedTarget.shortLabel})
                            </h2>
                            {generatedImageUrl && (
                                <button
                                    type="button"
                                    onClick={handleDownloadImage}
                                    style={{
                                        padding: '7px 14px',
                                        borderRadius: '9px',
                                        border: 'none',
                                        background: '#571c86',
                                        color: '#ffffff',
                                        fontSize: '12.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ⬇️ Download Image
                                </button>
                            )}
                        </div>

                        {isGenerating ? (
                            <div
                                style={{
                                    minHeight: '340px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #faf7ff 0%, #f3e8ff 100%)',
                                    border: '1px dashed #c4b5fd',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '24px',
                                    textAlign: 'center',
                                    color: '#571c86',
                                }}
                            >
                                <div className="spinner" style={{ marginBottom: '12px' }} />
                                <strong style={{ fontSize: '15px' }}>Designing your {selectedTarget.shortLabel} post...</strong>
                                <span style={{ fontSize: '12.5px', color: '#6b7280', marginTop: '4px' }}>
                                    Generating visual + writing your platform caption &amp; hashtags
                                </span>
                            </div>
                        ) : generatedImageUrl ? (
                            <>
                                <div
                                    style={{
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        background: '#0f172a',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        maxHeight: '520px',
                                    }}
                                >
                                    <img
                                        src={generatedImageUrl}
                                        alt="Generated Daily Social Post"
                                        style={{ maxWidth: '100%', maxHeight: '520px', objectFit: 'contain', display: 'block' }}
                                    />
                                </div>

                                {/* Caption & Hashtags Box */}
                                <div
                                    style={{
                                        padding: '14px',
                                        borderRadius: '12px',
                                        background: '#faf7ff',
                                        border: '1px solid #e4dcf2',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#4c1d95' }}>
                                            ✍️ Ready-to-Paste Caption
                                        </span>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={handleRegenerateCaption}
                                                disabled={isRegeneratingCaption}
                                                style={{
                                                    padding: '5px 10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #d8ccf0',
                                                    background: '#ffffff',
                                                    color: '#571c86',
                                                    fontSize: '11.5px',
                                                    fontWeight: 700,
                                                    cursor: isRegeneratingCaption ? 'wait' : 'pointer',
                                                }}
                                            >
                                                {isRegeneratingCaption ? 'Writing...' : '🔄 New Caption'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleCopyCaption}
                                                style={{
                                                    padding: '5px 12px',
                                                    borderRadius: '8px',
                                                    border: 'none',
                                                    background: '#571c86',
                                                    color: '#ffffff',
                                                    fontSize: '11.5px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                📋 Copy Caption &amp; Tags
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                        rows={5}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid #d8ccf0',
                                            background: '#ffffff',
                                            fontSize: '13px',
                                            color: '#111827',
                                            lineHeight: 1.5,
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                    {hashtags.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                            {hashtags.map((tag, i) => (
                                                <span
                                                    key={`${tag}_${i}`}
                                                    style={{
                                                        padding: '3px 8px',
                                                        borderRadius: '999px',
                                                        background: '#f3e8ff',
                                                        color: '#571c86',
                                                        fontSize: '11.5px',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div
                                style={{
                                    minHeight: '340px',
                                    borderRadius: '12px',
                                    background: '#faf8fd',
                                    border: '2px dashed #e4dcf2',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '28px',
                                    textAlign: 'center',
                                    color: '#6b7280',
                                }}
                            >
                                <div style={{ fontSize: '36px', marginBottom: '10px' }}>📱</div>
                                <strong style={{ fontSize: '15px', color: '#111827' }}>
                                    Your Daily Post &amp; Caption will appear here
                                </strong>
                                <p style={{ fontSize: '13px', maxWidth: '340px', marginTop: '6px', lineHeight: 1.5 }}>
                                    Pick a platform, enter a topic (or tap <strong>✨ Suggest Idea</strong>), and click <strong>Generate Daily Post</strong>.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
