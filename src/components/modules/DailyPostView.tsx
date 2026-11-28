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
        captionStyle: 'authentic, natural first-person Instagram caption with real personality, relaxed confidence, a casual question or vibe line, and 4-6 natural hashtags',
    },
    {
        id: 'facebook_post',
        label: 'Facebook Post (4:5)',
        shortLabel: 'Facebook',
        aspectRatio: '4:5',
        captionStyle: 'warm, relatable, real-person Facebook post written like talking to friends and followers — natural, conversational, zero corporate buzzwords, 0-3 light hashtags',
    },
    {
        id: 'instagram_square',
        label: 'Square Post (1:1)',
        shortLabel: 'Square 1:1',
        aspectRatio: '1:1',
        captionStyle: 'natural, engaging social caption with a genuine human voice, short readable lines, and 4-6 relevant hashtags',
    },
    {
        id: 'linkedin',
        label: 'LinkedIn (1:1)',
        shortLabel: 'LinkedIn 1:1',
        aspectRatio: '1:1',
        captionStyle: 'sharp, authentic first-person LinkedIn post with short scannable lines, a real insight, zero fluff, and 3-4 hashtags',
    },
    {
        id: 'x_twitter',
        label: 'X / Twitter (16:9)',
        shortLabel: 'X / Twitter 16:9',
        aspectRatio: '16:9',
        captionStyle: 'concise, natural, high-punch X/Twitter post under 250 characters with 0-2 hashtags max',
    },
    {
        id: 'story_reels',
        label: 'Story / Reels (9:16)',
        shortLabel: 'Story 9:16',
        aspectRatio: '9:16',
        captionStyle: 'short, punchy, effortless Story/Reels/TikTok caption with 3-5 natural hashtags',
    },
    {
        id: 'youtube_community',
        label: 'YT Community (1:1)',
        shortLabel: 'YT Community',
        aspectRatio: '1:1',
        captionStyle: 'warm YouTube Community post written directly to subscribers inviting real comments, with 0-2 hashtags',
    },
];

interface PostTypeOption {
    id: string;
    label: string;
    isPhotoFirst: boolean;
    visualGuidance: string;
}

const POST_TYPES: PostTypeOption[] = [
    {
        id: 'lifestyle',
        label: '📸 Real Photo / Swag',
        isPhotoFirst: true,
        visualGuidance: 'Candid, high-engagement real-camera portrait with natural confident pose, authentic swag, flattering camera angle, real lens depth-of-field, and zero graphic overlays.',
    },
    {
        id: 'editorial',
        label: '✨ Luxury / Editorial',
        isPhotoFirst: true,
        visualGuidance: 'High-end magazine-style real DSLR portrait with clean architectural or studio backdrop, refined natural lighting, confident relaxed posture, and authentic film-grade realism.',
    },
    {
        id: 'fitness',
        label: '💪 Fitness / Active',
        isPhotoFirst: true,
        visualGuidance: 'Authentic real-camera gym, outdoor run, or athletic lifestyle photograph with natural sweat/lighting realism, dynamic posture, and true-to-life body build.',
    },
    {
        id: 'tip',
        label: '💡 Tip / Value Card',
        isPhotoFirst: false,
        visualGuidance: 'Clean, modern creator value-post combining a real candid photograph of the person with crisp, readable editorial typography.',
    },
    {
        id: 'quote',
        label: '💬 Quote / Hot Take',
        isPhotoFirst: false,
        visualGuidance: 'Bold minimalist social statement post with strong contrast, authentic photographic atmosphere, and clean typography.',
    },
    {
        id: 'promo',
        label: '🚀 Promo / Launch',
        isPhotoFirst: false,
        visualGuidance: 'Clean, premium announcement post with natural photography of the person and crisp modern headline layout.',
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
    brandNicheBio?: string;
}

const CREATIVE_SCENE_SEEDS = [
    'rooftop terrace at dusk with warm city skyline lights',
    'luxury hotel balcony or resort poolside in soft natural daylight',
    'confident full-length mirror outfit-check in a stylish modern room',
    'candid night city street with warm neon bokeh and streetlights',
    'sleek car interior or stepping out of a car with relaxed confidence',
    'sunlit modern bedroom or loft with soft morning window light',
    'high-fashion studio flash editorial portrait with crisp shadows',
    'upscale evening lounge or moody restaurant candlelight ambiance',
    'urban street-style crosswalk stride shot candidly on a 50mm lens',
    'beachfront or waterfront breeze in crisp late-afternoon light',
    'behind-the-scenes creator setup with natural candid laugh or glance',
    'stylish minimalist architectural staircase or marble lobby',
    'cozy late-night home aesthetic with warm lamp light',
    'post-workout athletic shot in natural daylight or sleek modern gym',
];

const CAPTION_TONE_STYLES = [
    'Ultra-short confident 1-liner (4 to 9 words total, casual, minimal emojis)',
    'Casual everyday check-in or relatable thought about today (1-2 natural sentences)',
    'Playful, direct question to followers that invites real replies in the comments',
    'Real, grounded mini-story or honest personal observation (2 short lines)',
    'Witty, understated, cool one-sentence caption with dry charm',
    'Warm, personal note written directly to friends and followers',
];

const RETOUCH_LOCATION_PRESETS = [
    'City Night Street',
    'Luxury Hotel Lobby',
    'Sunny Beachfront',
    'Clean Photo Studio',
    'Upscale Evening Lounge',
    'Modern Rooftop Terrace',
];

const RETOUCH_EXTRA_TOUCHES = [
    { id: 'soft_makeup', label: '💄 Soft Natural Makeup', prompt: 'subtle, realistic soft natural makeup (even tone, natural lip tint, defined lashes — zero heavy filter look)' },
    { id: 'glam_makeup', label: '✨ Glam Makeup', prompt: 'tasteful editorial glam makeup (clean defined eyes, natural highlight, polished lip — realistic texture, never airbrushed plastic)' },
    { id: 'neat_hair', label: '💇 Polished Hair', prompt: 'neatly styled, clean flyaway-free hair keeping their exact natural hairstyle and hairline' },
    { id: 'sunglasses', label: '🕶️ Sunglasses', prompt: 'stylish modern sunglasses naturally fitted to their face with realistic reflections' },
    { id: 'jewelry', label: '💎 Subtle Jewelry', prompt: 'tasteful subtle jewelry (minimal earrings, delicate necklace, or sleek watch) matching their style' },
    { id: 'clean_bg', label: '🧹 Declutter Background', prompt: 'cleanly remove messy background objects/clutter while keeping the scene authentic' },
];

interface TextDesignStyleOption {
    id: string;
    label: string;
    directive: string;
}

const TEXT_DESIGN_STYLES: TextDesignStyleOption[] = [
    {
        id: 'auto',
        label: '✨ Auto Design',
        directive:
            'Art-direct the typography to match the photo mood and niche — clean editorial hierarchy, crisp mobile readability, subtle natural gradient or soft drop shadow for contrast, placed in open negative space away from the face.',
    },
    {
        id: 'magazine',
        label: '📰 Magazine Cover',
        directive:
            'Style the text like a high-fashion Vogue/GQ editorial magazine cover: refined high-contrast serif or tall condensed editorial display type, generous letter-spacing, subtle depth integration (e.g., clean upper-third masthead placement), never obscuring the subject’s face.',
    },
    {
        id: 'bold_viral',
        label: '🔥 Bold Viral Hook',
        directive:
            'Style the text as a scroll-stopping stacked bold display headline: heavy modern geometric sans-serif, tight line-height, key word highlighted in a clean accent color, crisp legibility over a subtle natural dark vignette/gradient in the lower or upper third.',
    },
    {
        id: 'luxury_minimal',
        label: '💎 Luxury Minimal',
        directive:
            'Style the text with understated luxury restraint: thin-to-medium tracked-out modern sans-serif or refined serif, clean small-to-medium scale with generous breathing room, crisp white or warm cream tone with delicate natural shadow — effortless high-end aesthetic.',
    },
    {
        id: 'editorial_quote',
        label: '💬 Editorial Quote',
        directive:
            'Style the text as an art-directed quote layout: clean balanced multi-line typography with a tasteful vertical accent bar or subtle quotation styling, set over a soft natural darkened gradient area so every word reads effortlessly on mobile.',
    },
    {
        id: 'frosted_glass',
        label: '🏷️ Frosted Glass Bar',
        directive:
            'Style the text inside a sleek, modern translucent frosted-glass pill/bar (subtle blur, soft light border, clean crisp sans-serif text) positioned cleanly near the bottom or top margin without touching the person’s face.',
    },
];

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
    brandNicheBio = '',
}) => {
    const { user, refreshCredits } = useAuth();
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const retouchInputRef = useRef<HTMLInputElement>(null);

    const [dailyMode, setDailyMode] = useState<'create' | 'retouch'>('create');
    const [targetId, setTargetId] = useState<string>('instagram_portrait');
    const [postTypeId, setPostTypeId] = useState<string>('lifestyle');
    const [nicheText, setNicheText] = useState<string>(brandNicheBio);
    const [topic, setTopic] = useState<string>('');
    const [headlineOnImage, setHeadlineOnImage] = useState<string>('');
    const [textDesignStyleId, setTextDesignStyleId] = useState<string>('auto');
    const [includeLogo, setIncludeLogo] = useState<boolean>(false);
    const [useBrandColors, setUseBrandColors] = useState<boolean>(false);
    const [attachedImages, setAttachedImages] = useState<ImageAsset[]>([]);
    const [retouchPhoto, setRetouchPhoto] = useState<ImageAsset | null>(null);
    const [retouchStyle, setRetouchStyle] = useState<'keep_bg' | 'change_bg'>('keep_bg');
    const [retouchLocation, setRetouchLocation] = useState<string>('');
    const [retouchTouches, setRetouchTouches] = useState<string[]>([]);
    const [retouchCustomNote, setRetouchCustomNote] = useState<string>('');
    const [showOriginalBefore, setShowOriginalBefore] = useState<boolean>(false);
    const autoSelectedRef = useRef<boolean>(false);
    const recentIdeasRef = useRef<string[]>([]);
    const recentCaptionsRef = useRef<string[]>([]);
    const lastSuggestedTopicRef = useRef<string>('');
    const sceneSeedCursorRef = useRef<number>(Math.floor(Math.random() * CREATIVE_SCENE_SEEDS.length));
    const captionToneCursorRef = useRef<number>(Math.floor(Math.random() * CAPTION_TONE_STYLES.length));

    useEffect(() => {
        if (brandNicheBio && !nicheText) {
            setNicheText(brandNicheBio);
        }
    }, [brandNicheBio]);

    const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [isRegeneratingCaption, setIsRegeneratingCaption] = useState<boolean>(false);

    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const [caption, setCaption] = useState<string>('');
    const [hashtags, setHashtags] = useState<string[]>([]);

    const selectedTarget = SOCIAL_TARGETS.find((t) => t.id === targetId) || SOCIAL_TARGETS[0];
    const selectedPostType = POST_TYPES.find((p) => p.id === postTypeId) || POST_TYPES[0];
    const selectedTextDesignStyle =
        TEXT_DESIGN_STYLES.find((s) => s.id === textDesignStyleId) || TEXT_DESIGN_STYLES[0];

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

    const toggleRetouchTouch = (touchId: string) => {
        setRetouchTouches((prev) => {
            if (prev.includes(touchId)) {
                return prev.filter((id) => id !== touchId);
            }
            // Keep soft_makeup and glam_makeup mutually exclusive
            const filtered =
                touchId === 'soft_makeup'
                    ? prev.filter((id) => id !== 'glam_makeup')
                    : touchId === 'glam_makeup'
                      ? prev.filter((id) => id !== 'soft_makeup')
                      : prev;
            return [...filtered, touchId];
        });
    };

    const handleRetouchPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !file.type.startsWith('image/')) return;
        try {
            const { base64, mimeType } = await fileToBase64(file);
            setRetouchPhoto({
                id: `retouch_src_${Date.now()}`,
                url: `data:${mimeType};base64,${base64}`,
                base64,
                mimeType,
            });
            setShowOriginalBefore(false);
        } catch (err: any) {
            toast.error(err?.message || 'Could not read selected photo.');
        }
    };

    const generateSocialCaption = async (postTopic: string, onImageText: string) => {
        captionToneCursorRef.current =
            (captionToneCursorRef.current + 1 + Math.floor(Math.random() * 2)) % CAPTION_TONE_STYLES.length;
        const toneDirection = CAPTION_TONE_STYLES[captionToneCursorRef.current];
        const avoidCaptions =
            recentCaptionsRef.current.length > 0
                ? `\n- DO NOT repeat wording or themes from these previous captions:\n  ${recentCaptionsRef.current.map((c, i) => `${i + 1}. ${c}`).join('\n  ')}`
                : '';

        const prompt = `Write a genuine, real-human, ready-to-paste social media caption for ${selectedTarget.label}.
- Caption Tone for THIS post: ${toneDirection}
- About the Person / What They Do: ${nicheText.trim() || '(everyday personal social media user)'}
- Context of the photo/post: ${postTopic}
- Text on image (if any): ${onImageText || '(none — clean real photo)'}
- Platform style: ${selectedTarget.captionStyle}${avoidCaptions}

CRITICAL ANTI-CLICHÉ RULES:
- Write like a REAL person posting to their own friends/followers — natural, effortless, varied every single time.
- STRICTLY BANNED OVERUSED PHRASES: NEVER use "golden hour", "chasing sunsets", "main character", "good vibes", "vibes only", "living my best life", "soaking it in", "glow up", "elevate", "unleash", "game-changer", "Crevo", or "AI".
- Do NOT describe the camera lighting unless the user asked you to — talk about the moment, mood, or thought like a real human would.

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
            const nextCaption = typeof parsed.caption === 'string' ? parsed.caption.trim() : raw;
            setCaption(nextCaption);
            if (nextCaption) {
                recentCaptionsRef.current = [nextCaption, ...recentCaptionsRef.current].slice(0, 5);
            }
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
            // Rotate to a fresh, non-repeating scene direction on every click
            sceneSeedCursorRef.current =
                (sceneSeedCursorRef.current + 1 + Math.floor(Math.random() * 3)) % CREATIVE_SCENE_SEEDS.length;
            const freshSceneSeed = CREATIVE_SCENE_SEEDS[sceneSeedCursorRef.current];

            // Only treat topic as user input if the user actually typed something different from our last auto-suggestion
            const userTypedSeed =
                topic.trim() && topic.trim() !== lastSuggestedTopicRef.current ? topic.trim() : '';

            const avoidList =
                recentIdeasRef.current.length > 0
                    ? `\n- DO NOT repeat, rephrase, or reuse the setting/theme of any of these recent suggestions:\n  ${recentIdeasRef.current.map((idea, i) => `${i + 1}. ${idea}`).join('\n  ')}`
                    : '';

            const prompt = `You are a viral social media creative director helping a real creator get maximum likes, saves, and comments on ${selectedTarget.label}.

First, deeply analyze this creator's niche and audience:
- About the Creator / Niche: ${nicheText.trim() || '(personal lifestyle & social creator)'}
- Selected Post Vibe: ${selectedPostType.label}
- Fresh Visual Direction Seed (use or adapt specifically to their niche): ${freshSceneSeed}
- User's own rough idea (if any): ${userTypedSeed || '(none — invent a completely fresh, scroll-stopping, high-engagement idea tailored to their exact niche)'}${avoidList}

CRITICAL RULES:
1. Make the idea 100% tailored to what THEIR specific audience loves to interact with (glamorous, confident, relatable, bold, or high-value depending on their niche — always Instagram/Facebook safe and tasteful).
2. Be specific about the exact real-world setting, confident pose/body language, camera angle, and lighting so the photo looks like a real photographer shot it.
3. STRICTLY BANNED CLICHÉS: NEVER default to "coffee", "coffee shop", "holding a latte", or "café" unless the user explicitly wrote coffee in their niche or idea.
4. NEVER mention "Crevo", "AI", or any app/tool name unless it's in their niche.
5. If Post Vibe is photo-first (${selectedPostType.isPhotoFirst ? 'YES' : 'NO'}), leave "headline" as an empty string "" so it stays a pure, real photograph. Otherwise write a punchy 3-6 word scroll-stopping hook for "headline".

Return STRICT JSON only (no markdown fences):
{"topic":"1-2 sentence vivid, specific real-life photo scene, pose, angle, and high-engagement concept","headline":"${selectedPostType.isPhotoFirst ? '' : 'Short 3-6 word punchy hook'}"}`;

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
            if (parsed.topic) {
                const nextTopic = String(parsed.topic).trim();
                setTopic(nextTopic);
                lastSuggestedTopicRef.current = nextTopic;
                recentIdeasRef.current = [nextTopic, ...recentIdeasRef.current].slice(0, 8);
            }
            setHeadlineOnImage(typeof parsed.headline === 'string' ? parsed.headline.trim() : '');
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

        if (dailyMode === 'retouch') {
            if (!retouchPhoto) {
                toast.error('Please upload the photo you want to retouch first.');
                return;
            }
            if (retouchStyle === 'change_bg' && !retouchLocation.trim()) {
                toast.error('Pick or type the new location/background you want.');
                return;
            }
        } else if (!cleanTopic && !cleanHeadline) {
            toast.error('Enter a topic or click "Suggest Idea" first.');
            return;
        }

        const requiredCredits = CREDIT_COSTS.DESIGN_PER_VARIATION;
        if (user) {
            const hasCredits = await hasEnoughCredits(user.id, requiredCredits);
            if (!hasCredits) {
                triggerOutOfCreditsModal({
                    requiredCredits,
                    actionLabel: dailyMode === 'retouch' ? 'Retouching Your Photo' : 'Generating a Daily Social Post',
                });
                toast.error(`You need ${requiredCredits} credits to continue.`);
                return;
            }
        }

        setIsGenerating(true);
        setShowOriginalBefore(false);
        try {
            let imagesForGen: ImageAsset[] = [];
            let bodyPrompt = '';
            let captionContext = '';

            if (dailyMode === 'retouch' && retouchPhoto) {
                imagesForGen = [retouchPhoto];
                const loc = retouchLocation.trim();
                const selectedTouchPrompts = RETOUCH_EXTRA_TOUCHES
                    .filter((t) => retouchTouches.includes(t.id))
                    .map((t) => t.prompt);
                if (retouchCustomNote.trim()) {
                    selectedTouchPrompts.push(retouchCustomNote.trim());
                }
                const extraTouchesText =
                    selectedTouchPrompts.length > 0
                        ? ` Extra requested touches (apply realistically while keeping 100% of their exact real facial structure, identity, and body unchanged): ${selectedTouchPrompts.join('; ')}.`
                        : '';
                bodyPrompt =
                    retouchStyle === 'change_bg'
                        ? `[RETOUCH_MY_PHOTO] Keep 100% of this person's exact face, expression, hair, body build, and pose from their uploaded photo, and seamlessly place them in a realistic, natural "${loc}" setting with matching lighting, shadows, and crisp 50mm DSLR photo quality.${extraTouchesText}`
                        : `[RETOUCH_MY_PHOTO] Keep 100% of this person's exact face, expression, hair, body build, pose, AND their real background from the uploaded photo, but professionally retouch the photo like an elite photographer: balance lighting and exposure, clean up distracting clutter, enrich true-to-life film colors, sharpen focus on the subject, and add subtle natural lens depth-of-field.${extraTouchesText}`;
                captionContext =
                    retouchStyle === 'change_bg'
                        ? `Personal social photo at ${loc}`
                        : retouchCustomNote.trim() || cleanTopic || 'Personal everyday photo shared with friends & followers';
            } else {
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
                imagesForGen = [...attachedImages, ...autoMatched];
                bodyPrompt = `DAILY SOCIAL POST FOR ${selectedTarget.label}. ${nicheText.trim() ? `Creator Niche / Identity: ${nicheText.trim()}. ` : ''}Post Vibe: ${selectedPostType.label}. Visual direction: ${selectedPostType.visualGuidance} Topic & scene: ${cleanTopic || cleanHeadline}. ${
                    cleanHeadline
                        ? `Render ONLY this clean, readable headline on the graphic: "${cleanHeadline}".`
                        : 'Do NOT render any text overlay on the image — make it a clean, authentic, photo-only social post.'
                }`;
                captionContext = cleanTopic || cleanHeadline;
            }

            const effectiveColors: ColorsState =
                dailyMode === 'create' && useBrandColors
                    ? colors
                    : { primary: '', secondary: '', accent: '', background: '' };
            const effectiveLogo: LogoState = includeLogo
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
                body: `${bodyPrompt}${cleanHeadline ? ` [TEXT_DESIGN_STYLE: ${selectedTextDesignStyle.directive}]` : ''}`,
                author: '',
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
                generateSocialCaption(captionContext, cleanHeadline).catch(() => {}),
            ]);

            const first = designResults?.[0];
            if (!first?.image?.url) {
                throw new Error('No image was returned. Please try again.');
            }
            setGeneratedImageUrl(first.image.url);

            if (user) {
                const actionTitle =
                    dailyMode === 'retouch'
                        ? `Photo Retouch (${selectedTarget.shortLabel})`
                        : `Daily Post (${selectedTarget.shortLabel})`;
                await deductCredits(user.id, actionTitle, requiredCredits, {
                    platform: 'daily_post',
                    mode: dailyMode,
                    socialTarget: selectedTarget.id,
                    aspectRatio: selectedTarget.aspectRatio,
                });
                await refreshCredits();
                saveImageToLibrary({
                    dataUrl: first.image.url,
                    type: 'thumbnail',
                    platform: 'daily_post',
                    title: cleanHeadline || captionContext.slice(0, 60) || actionTitle,
                    aspectRatio: selectedTarget.aspectRatio,
                }).catch(() => {});
            }

            toast.success(
                dailyMode === 'retouch'
                    ? 'Photo retouched! Toggle Before/After or download & copy your caption.'
                    : 'Daily Post ready! Download the image & copy your caption.'
            );
        } catch (err: any) {
            toast.error(err?.message || 'Failed to generate Daily Post.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRegenerateCaption = async () => {
        if (isRegeneratingCaption) return;
        const captionCtx =
            dailyMode === 'retouch'
                ? retouchStyle === 'change_bg' && retouchLocation.trim()
                    ? `Personal social photo at ${retouchLocation.trim()}`
                    : topic.trim() || 'Personal everyday photo shared with friends & followers'
                : topic.trim() || headlineOnImage.trim();
        if (!captionCtx) return;
        setIsRegeneratingCaption(true);
        try {
            await generateSocialCaption(captionCtx, headlineOnImage.trim());
            toast.success('Fresh caption ready!');
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
                        {/* Mode Switcher: Create New Shot vs Retouch My Photo */}
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '6px',
                                padding: '4px',
                                borderRadius: '12px',
                                background: '#f3effa',
                                border: '1px solid #e4dcf2',
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setDailyMode('create')}
                                style={{
                                    padding: '9px 10px',
                                    borderRadius: '9px',
                                    border: 'none',
                                    background: dailyMode === 'create' ? '#571c86' : 'transparent',
                                    color: dailyMode === 'create' ? '#ffffff' : '#4c1d95',
                                    fontSize: '12.5px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                ✨ Create New Shot
                            </button>
                            <button
                                type="button"
                                onClick={() => setDailyMode('retouch')}
                                style={{
                                    padding: '9px 10px',
                                    borderRadius: '9px',
                                    border: 'none',
                                    background: dailyMode === 'retouch' ? '#571c86' : 'transparent',
                                    color: dailyMode === 'retouch' ? '#ffffff' : '#4c1d95',
                                    fontSize: '12.5px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                🪄 Retouch My Photo
                            </button>
                        </div>

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

                        {dailyMode === 'retouch' ? (
                            <>
                                {/* Retouch Step 2: Upload Your Real Photo */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '8px' }}>
                                        2. Upload the Photo You Took
                                    </label>
                                    <input
                                        ref={retouchInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleRetouchPhotoUpload}
                                        style={{ display: 'none' }}
                                    />
                                    {retouchPhoto ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '12px', background: '#faf7ff', border: '1.5px solid #c4b5fd' }}>
                                            <img
                                                src={retouchPhoto.url}
                                                alt="Original photo to retouch"
                                                style={{ width: '68px', height: '68px', borderRadius: '10px', objectFit: 'cover', display: 'block' }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '13px', fontWeight: 800, color: '#111827' }}>Photo ready for pro retouch</div>
                                                <div style={{ fontSize: '11.5px', color: '#6b7280', marginTop: '2px' }}>
                                                    AI keeps your exact face, body &amp; pose — just upgrades lighting, quality &amp; optional location.
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => retouchInputRef.current?.click()}
                                                    style={{
                                                        marginTop: '6px',
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
                                                    Change Photo
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => retouchInputRef.current?.click()}
                                            style={{
                                                width: '100%',
                                                padding: '22px 14px',
                                                borderRadius: '12px',
                                                border: '2px dashed #c4b5fd',
                                                background: '#faf7ff',
                                                color: '#4c1d95',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                            }}
                                        >
                                            <div style={{ fontSize: '24px', marginBottom: '4px' }}>📷</div>
                                            <div style={{ fontSize: '13.5px', fontWeight: 800 }}>Click to upload your photo</div>
                                            <div style={{ fontSize: '11.5px', color: '#6b7280', marginTop: '3px' }}>
                                                Phone selfie, portrait, or full-body shot — AI makes it look pro-photographer edited
                                            </div>
                                        </button>
                                    )}
                                </div>

                                {/* Retouch Step 3: Keep Background vs Change Location */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '8px' }}>
                                        3. What Should AI Upgrade?
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setRetouchStyle('keep_bg')}
                                            style={{
                                                padding: '10px',
                                                borderRadius: '10px',
                                                border: retouchStyle === 'keep_bg' ? '1.5px solid #571c86' : '1px solid #e5e7eb',
                                                background: retouchStyle === 'keep_bg' ? '#f3e8ff' : '#ffffff',
                                                color: retouchStyle === 'keep_bg' ? '#4c1d95' : '#374151',
                                                fontSize: '12px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            ✨ Pro Edit Only
                                            <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginTop: '2px' }}>
                                                Keep real background, fix lighting &amp; quality
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRetouchStyle('change_bg')}
                                            style={{
                                                padding: '10px',
                                                borderRadius: '10px',
                                                border: retouchStyle === 'change_bg' ? '1.5px solid #571c86' : '1px solid #e5e7eb',
                                                background: retouchStyle === 'change_bg' ? '#f3e8ff' : '#ffffff',
                                                color: retouchStyle === 'change_bg' ? '#4c1d95' : '#374151',
                                                fontSize: '12px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                            }}
                                        >
                                            🌍 Change Place
                                            <div style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', marginTop: '2px' }}>
                                                Same face &amp; pose in a new real location
                                            </div>
                                        </button>
                                    </div>

                                    {retouchStyle === 'change_bg' && (
                                        <div style={{ marginTop: '10px' }}>
                                            <input
                                                type="text"
                                                value={retouchLocation}
                                                onChange={(e) => setRetouchLocation(e.target.value)}
                                                placeholder="Type any place (e.g., Paris street at dusk, luxury yacht, sleek gym)..."
                                                maxLength={140}
                                                style={{
                                                    width: '100%',
                                                    padding: '9px 12px',
                                                    borderRadius: '10px',
                                                    border: '1.5px solid #d8ccf0',
                                                    fontSize: '13px',
                                                    color: '#111827',
                                                }}
                                            />
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '7px' }}>
                                                {RETOUCH_LOCATION_PRESETS.map((place) => (
                                                    <button
                                                        key={place}
                                                        type="button"
                                                        onClick={() => setRetouchLocation(place)}
                                                        style={{
                                                            padding: '4px 9px',
                                                            borderRadius: '999px',
                                                            border: '1px solid #e4dcf2',
                                                            background: retouchLocation.toLowerCase() === place.toLowerCase() ? '#f3e8ff' : '#ffffff',
                                                            color: '#571c86',
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        {place}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Optional Extra Touches: Makeup, Accessories, Custom Edits */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '6px' }}>
                                        4. Extra Touches <span style={{ fontWeight: 500, color: '#9ca3af' }}>(optional — makeup, accessories, or anything to add/fix)</span>
                                    </label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                                        {RETOUCH_EXTRA_TOUCHES.map((touch) => {
                                            const active = retouchTouches.includes(touch.id);
                                            return (
                                                <button
                                                    key={touch.id}
                                                    type="button"
                                                    onClick={() => toggleRetouchTouch(touch.id)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        borderRadius: '999px',
                                                        border: active ? '1.5px solid #571c86' : '1px solid #e4dcf2',
                                                        background: active ? '#571c86' : '#ffffff',
                                                        color: active ? '#ffffff' : '#374151',
                                                        fontSize: '11.5px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {touch.label} {active ? '✓' : ''}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <input
                                        type="text"
                                        value={retouchCustomNote}
                                        onChange={(e) => setRetouchCustomNote(e.target.value)}
                                        placeholder="Or type anything custom (e.g., soft red lipstick, gold watch, remove bag behind me)..."
                                        maxLength={160}
                                        style={{
                                            width: '100%',
                                            padding: '9px 12px',
                                            borderRadius: '10px',
                                            border: '1.5px solid #e5e7eb',
                                            fontSize: '13px',
                                            color: '#111827',
                                        }}
                                    />
                                </div>

                                {/* Optional Outfit tweak for Retouch */}
                                {retouchPhoto && (
                                    <div style={{ padding: '10px 12px', borderRadius: '12px', background: '#faf7ff', border: '1px solid #e4dcf2' }}>
                                        <OutfitSelector
                                            preferences={preferences}
                                            onPreferencesChange={onPreferencesChange}
                                            disabled={isGenerating}
                                        />
                                    </div>
                                )}

                                {/* Optional Text on Image */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '6px' }}>
                                        5. Text on Image <span style={{ fontWeight: 500, color: '#9ca3af' }}>(optional — leave blank for clean photo)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={headlineOnImage}
                                        onChange={(e) => setHeadlineOnImage(e.target.value)}
                                        placeholder="Optional short headline..."
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
                                    {headlineOnImage.trim().length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#571c86', marginBottom: '5px' }}>
                                                🎨 Text Design Style
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                {TEXT_DESIGN_STYLES.map((st) => {
                                                    const active = textDesignStyleId === st.id;
                                                    return (
                                                        <button
                                                            key={st.id}
                                                            type="button"
                                                            onClick={() => setTextDesignStyleId(st.id)}
                                                            style={{
                                                                padding: '4px 9px',
                                                                borderRadius: '999px',
                                                                border: active ? '1.5px solid #571c86' : '1px solid #e4dcf2',
                                                                background: active ? '#571c86' : '#ffffff',
                                                                color: active ? '#ffffff' : '#374151',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            {st.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
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

                        {/* 3. About You / Niche (for AI Idea Suggestions) */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                                    3. About You / Your Niche <span style={{ fontWeight: 500, color: '#9ca3af' }}>(so AI knows what to suggest)</span>
                                </label>
                                <Link to="/dashboard/brand-kit" style={{ fontSize: '11px', fontWeight: 700, color: '#7e22ce', textDecoration: 'none' }}>
                                    Save in Brand Kit →
                                </Link>
                            </div>
                            <input
                                type="text"
                                value={nicheText}
                                onChange={(e) => setNicheText(e.target.value)}
                                maxLength={300}
                                placeholder="e.g., Fitness coach for busy parents, Tech YouTuber, Real estate agent..."
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '10px',
                                    border: '1.5px solid #e5e7eb',
                                    fontSize: '13px',
                                    color: '#111827',
                                }}
                            />
                        </div>

                        {/* 4. Topic + Suggest Idea */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                                    4. What&apos;s today&apos;s post about?
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

                        {/* 5. Optional On-Image Headline */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#374151', marginBottom: '6px' }}>
                                5. Text on Image <span style={{ fontWeight: 500, color: '#9ca3af' }}>(optional — leave blank for photo-only)</span>
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
                            {headlineOnImage.trim().length > 0 && (
                                <div style={{ marginTop: '8px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#571c86', marginBottom: '5px' }}>
                                        🎨 Text Design Style
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                        {TEXT_DESIGN_STYLES.map((st) => {
                                            const active = textDesignStyleId === st.id;
                                            return (
                                                <button
                                                    key={st.id}
                                                    type="button"
                                                    onClick={() => setTextDesignStyleId(st.id)}
                                                    style={{
                                                        padding: '4px 9px',
                                                        borderRadius: '999px',
                                                        border: active ? '1.5px solid #571c86' : '1px solid #e4dcf2',
                                                        background: active ? '#571c86' : '#ffffff',
                                                        color: active ? '#ffffff' : '#374151',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {st.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
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
                                    6. Character / Photo
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

                        {/* Brand Kit independent ON/OFF switches */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', padding: '10px 12px', borderRadius: '10px', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 700, color: '#374151', cursor: logo.url ? 'pointer' : 'not-allowed', opacity: logo.url ? 1 : 0.55 }}>
                                <input
                                    type="checkbox"
                                    checked={includeLogo && Boolean(logo.url)}
                                    disabled={!logo.url}
                                    onChange={(e) => setIncludeLogo(e.target.checked)}
                                />
                                Include Brand Logo {logo.url ? '(Optional)' : '(Add in Brand Kit)'}
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', fontWeight: 700, color: '#374151', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={useBrandColors}
                                    onChange={(e) => setUseBrandColors(e.target.checked)}
                                />
                                Use Brand Colors
                            </label>
                        </div>
                            </>
                        )}

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
                            {isGenerating
                                ? dailyMode === 'retouch'
                                    ? 'Retouching Your Photo...'
                                    : 'Creating Your Daily Post...'
                                : dailyMode === 'retouch'
                                  ? '🪄 Retouch My Photo (2 Credits)'
                                  : '✨ Generate Daily Post (2 Credits)'}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#111827' }}>
                                Ready-to-Post Pack ({selectedTarget.shortLabel})
                            </h2>
                            {generatedImageUrl && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {dailyMode === 'retouch' && retouchPhoto && (
                                        <button
                                            type="button"
                                            onClick={() => setShowOriginalBefore((prev) => !prev)}
                                            style={{
                                                padding: '7px 11px',
                                                borderRadius: '9px',
                                                border: '1px solid #d8ccf0',
                                                background: showOriginalBefore ? '#f3e8ff' : '#ffffff',
                                                color: '#571c86',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {showOriginalBefore ? '👁️ Viewing Original' : '↔️ Compare Original'}
                                        </button>
                                    )}
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
                                </div>
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
                                        src={showOriginalBefore && retouchPhoto ? retouchPhoto.url : generatedImageUrl}
                                        alt={showOriginalBefore ? 'Original Uploaded Photo' : 'Generated Daily Social Post'}
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
