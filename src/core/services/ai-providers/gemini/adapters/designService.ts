import { GoogleGenAI, Part, Modality, GenerateContentResponse } from "@google/genai";
import { 
    ImageAsset, LogoState, ColorsState, PreferencesState, Platform, 
    TextState, DesignResult, ThumbnailScore, ResizeOption 
} from '../../../../../types';
import { PLATFORM_CONFIGS } from '../../../../../constants';
import { imageGenRateLimiter } from '../../../../infrastructure/rate-limiting';
import { retryWithBackoff } from '../../../../infrastructure/retry-handlers';
import { optimizeImageForAI } from '../../../../processors/image';
import { errorTracker } from '../../../../infrastructure/error-tracking';
import { performanceMonitor } from '../../../../infrastructure/performance-monitoring';
import { getModelWithFallback, callWithFallback } from '../config';

interface ImprovementPlan {
    originalScore: number;
    weaknesses: string[];
    variationPlans: Array<{ label: string; hookText?: string; instructions: string }>;
}

const DEFAULT_IMPROVE_PLANS: Array<{ label: string; hookText?: string; instructions: string }> = [
    {
        label: 'Clean Upgrade',
        instructions:
            'Keep the same recognizable subject and topic, but noticeably brighten and sharpen the subject with studio rim lighting, clean up/soften background distractions, boost color vibrancy, and make the text much bolder and easier to read on mobile.',
    },
    {
        label: 'Bold Redesign',
        instructions:
            'Keep the exact same person/subject likeness and video topic, but noticeably upgrade the framing (tighter, more expressive rule-of-thirds crop), replace or dramatically re-light the background for strong foreground separation, and replace cluttered text with a punchy 2-4 word high-contrast headline.',
    },
    {
        label: 'Viral High-CTR',
        instructions:
            'Keep the exact same person/subject likeness and core video story, but push visual drama and curiosity to the max: cinematic high-contrast color grading, dramatic lighting/depth glow around the focal point, bold viral typography, and clean visual hierarchy.',
    },
    {
        label: 'Cinematic Spotlight',
        instructions:
            'Keep the exact same person/subject likeness and core story, but use moody cinematic lighting with a strong warm/cool split glow, dark atmospheric vignette around the edges, and ultra-clean hero typography placed for instant focal lock.',
    },
    {
        label: 'Curiosity Twist',
        instructions:
            'Keep the exact same person/subject likeness and video topic, but emphasize emotional tension and curiosity: zoom in closer on facial expressions, heighten contrast between foreground and background, and use a bold, minimal 2-3 word hook that creates an irresistible curiosity gap.',
    },
];

const DEFAULT_GENERATE_LABELS = [
    'Close-Up Impact',
    'Storytelling Split',
    'Minimalist Viral',
    'Cinematic Drama',
    'Bold Contrast',
];

function safeParseJson<T>(raw: string | undefined): T | null {
    if (!raw) return null;
    try {
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned) as T;
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]) as T;
            } catch {
                return null;
            }
        }
        return null;
    }
}

function sampleTranscriptArc(transcript: string | null, maxChars = 9000): string {
    if (!transcript) return '';
    const trimmed = transcript.trim();
    if (trimmed.length <= maxChars) return trimmed;
    const sliceLen = Math.floor(maxChars / 3);
    const midStart = Math.floor((trimmed.length - sliceLen) / 2);
    const opening = trimmed.slice(0, sliceLen);
    const middle = trimmed.slice(midStart, midStart + sliceLen);
    const ending = trimmed.slice(trimmed.length - sliceLen);
    return `[OPENING]: ${opening}\n\n[MIDDLE]: ${middle}\n\n[CLIMAX / ENDING]: ${ending}`;
}

async function analyzeThumbnailForImprovement(
    ai: GoogleGenAI,
    thumbnail: ImageAsset,
    originalTitle: string,
    transcript: string | null,
    variationCount: number
): Promise<ImprovementPlan> {
    const planSlots = DEFAULT_IMPROVE_PLANS.slice(0, variationCount)
        .map(
            (p) =>
                `    { "label": "${p.label}", "hookText": "<2-4 word viral, high-CTR thumbnail text hook in the video's language>", "instructions": "<specific visible improvements for ${p.label} while keeping the real subject likeness>" }`
        )
        .join(',\n');

    const sampledTranscript = sampleTranscriptArc(transcript, 9000);

    try {
        const prompt = `You are a Top 0.1% YouTube Viral Hook Copywriter & Thumbnail CTR Strategist.
Analyze the attached YouTube thumbnail, video title, and transcript critically.

Video Title: "${originalTitle || 'Unknown'}"
${sampledTranscript ? `Transcript (Opening, Middle & Climax):\n"${sampledTranscript}"` : ''}

VIRAL THUMBNAIL CAPTION (hookText) RULES:
- MUST be 2 to 4 words MAX (ultra-short, instant 0.5-second mobile scan).
- NEVER repeat the full video title word-for-word — complement the title to create a powerful curiosity gap.
- Pull the highest-stakes emotional, conflict, shock, or reveal angle from the transcript/title.
- Match the language of the video title / original thumbnail with 100% accurate spelling (use ALL CAPS or punchy title case).
- Give EACH variation a DIFFERENT psychological hook angle (e.g. Curiosity, Conflict/Drama, Bold Reveal, Shock Twist).

Return ONLY valid JSON with this exact schema (${variationCount} distinct variationPlans):
{
  "originalScore": <integer 30-85 representing current CTR strength>,
  "weaknesses": [<3 specific, concrete visual weaknesses in lighting, framing, contrast, background clutter, or text readability>],
  "variationPlans": [
${planSlots}
  ]
}`;

        const response = await ai.models.generateContent({
            model: getModelWithFallback('TEXT', false),
            contents: {
                parts: [
                    { inlineData: { data: thumbnail.base64, mimeType: thumbnail.mimeType } },
                    { text: prompt },
                ],
            },
            config: {
                responseMimeType: 'application/json',
                temperature: 0.4,
            } as any,
        });

        const parsed = safeParseJson<ImprovementPlan>(response.text);
        if (
            parsed &&
            typeof parsed.originalScore === 'number' &&
            Array.isArray(parsed.weaknesses) &&
            Array.isArray(parsed.variationPlans) &&
            parsed.variationPlans.length >= 1
        ) {
            // Pad with defaults if fewer plans were returned than requested
            const plans = [...parsed.variationPlans];
            while (plans.length < variationCount) {
                plans.push(DEFAULT_IMPROVE_PLANS[plans.length % DEFAULT_IMPROVE_PLANS.length]);
            }
            return {
                originalScore: Math.max(20, Math.min(95, Math.round(parsed.originalScore))),
                weaknesses: parsed.weaknesses.slice(0, 4),
                variationPlans: plans.slice(0, variationCount),
            };
        }
    } catch (err) {
        console.warn('Thumbnail pre-analysis failed, using default improvement plans:', err);
    }

    return {
        originalScore: 58,
        weaknesses: [
            'Subject needs stronger lighting and separation from the background',
            'Color contrast and visual hierarchy can be sharpened for small mobile screens',
            'Text readability and focal hook can be made bolder and cleaner',
        ],
        variationPlans: DEFAULT_IMPROVE_PLANS.slice(0, variationCount),
    };
}

async function scoreGeneratedThumbnails(
    ai: GoogleGenAI,
    results: DesignResult[],
    variationLabels: string[],
    platform: Platform,
    originalScore?: number
): Promise<DesignResult[]> {
    const validEntries = results
        .map((result, idx) => ({ result, idx, label: variationLabels[idx] || `Variation ${idx + 1}` }))
        .filter((e) => Boolean(e.result.image));

    if (validEntries.length === 0) return results;

    try {
        const label =
            platform === 'youtube_improve' || platform === 'youtube' ? 'YouTube thumbnail' : `${platform} design`;

        const parts: Part[] = [];
        validEntries.forEach((entry, pos) => {
            parts.push({ text: `Image ${pos + 1} (${entry.label}):` });
            parts.push({
                inlineData: {
                    data: entry.result.image!.base64,
                    mimeType: entry.result.image!.mimeType,
                },
            });
        });

        parts.push({
            text: `Compare all ${validEntries.length} ${label} variation(s) side-by-side for mobile feed Click-Through Rate (CTR).
IMPORTANT:
- Evaluate each image critically and relatively against the others.
- Do NOT assign identical overall scores or identical sub-scores to different variations—clearly differentiate which variation has stronger readability, contrast, and emotional hook.
- Use a realistic spread (e.g. 68 to 95) based on actual visual differences.

Return ONLY valid JSON with this exact schema:
{
  "scores": [
    {
      "index": 0,
      "overall": <integer 55-98>,
      "readability": <integer 50-99>,
      "contrast": <integer 50-99>,
      "curiosity": <integer 50-99>,
      "summary": "<one short sentence (max 14 words) specific to THIS variation's unique strengths/tradeoffs>"
    }
  ]
}
Include exactly ${validEntries.length} items in "scores" ordered by index 0 to ${validEntries.length - 1}.`,
        });

        const response = await ai.models.generateContent({
            model: getModelWithFallback('TEXT', false),
            contents: { parts },
            config: {
                responseMimeType: 'application/json',
                temperature: 0.4,
            } as any,
        });

        const parsed = safeParseJson<{ scores: Array<Partial<ThumbnailScore> & { index?: number }> }>(response.text);
        if (parsed && Array.isArray(parsed.scores) && parsed.scores.length > 0) {
            const scored = [...results];
            validEntries.forEach((entry, pos) => {
                const item = parsed.scores.find((s) => s.index === pos) || parsed.scores[pos];
                if (item && typeof item.overall === 'number') {
                    const overall = Math.max(40, Math.min(99, Math.round(item.overall)));
                    const score: ThumbnailScore = {
                        overall,
                        readability: Math.max(40, Math.min(99, Math.round(item.readability ?? overall))),
                        contrast: Math.max(40, Math.min(99, Math.round(item.contrast ?? overall))),
                        curiosity: Math.max(40, Math.min(99, Math.round(item.curiosity ?? overall))),
                        summary: item.summary || 'Strong focal contrast and mobile readability.',
                        variationLabel: entry.label,
                        ...(originalScore !== undefined
                            ? { originalScore, delta: overall - originalScore }
                            : {}),
                    };
                    scored[entry.idx] = { ...scored[entry.idx], score };
                }
            });

            // Highlight the single highest-scoring variation as Top Pick when multiple variations exist
            if (scored.length > 1) {
                let bestIdx = -1;
                let bestScore = -1;
                scored.forEach((item, idx) => {
                    if (item.score && item.score.overall > bestScore) {
                        bestScore = item.score.overall;
                        bestIdx = idx;
                    }
                });
                if (bestIdx >= 0 && scored[bestIdx].score) {
                    scored[bestIdx] = {
                        ...scored[bestIdx],
                        score: { ...scored[bestIdx].score!, isTopPick: true },
                    };
                }
            }

            return scored;
        }
    } catch (err) {
        console.warn('Comparative thumbnail scoring failed:', err);
    }

    return results;
}

export type ImproveMode = 'improve' | 'reimagine';

export const generateDesign = async (
    ai: GoogleGenAI, 
    images: ImageAsset[], 
    logo: LogoState, 
    colors: ColorsState, 
    preferences: PreferencesState, 
    platform: Platform, 
    transcript: string | null, 
    originalTitle: string, 
    currentText: TextState,
    improveMode: ImproveMode = 'improve',
    referenceThumbnail: ImageAsset | null = null,
    customAspectRatio?: string
): Promise<DesignResult[]> => {
    return performanceMonitor.measureFunction('generateDesign', async () => {
        let finalPrompt = '';
        try {
            // Rate limiting: Acquire permission before making API calls
            await imageGenRateLimiter.acquire(`generate-${platform}`);

            const platformConfig = PLATFORM_CONFIGS[platform];
            const effectiveAspectRatio = customAspectRatio || platformConfig.aspectRatio;
            const originalYouTubeThumbnail = images.find(img => img.id.startsWith('yt_'));
            const userImages = images.filter(img => !img.id.startsWith('yt_'));

            const allImageParts: Part[] = [];

            // Optimize images before sending to API (skip re-compressing saved Brand Kit character photos to preserve crisp facial & body details)
            const optimizedImages = await Promise.all(
                userImages.map(async (img) => {
                    if (img.characterId) {
                        return img;
                    }
                    try {
                        const optimized = await optimizeImageForAI(img.base64, img.mimeType);
                        return { ...img, base64: optimized.base64, mimeType: optimized.mimeType };
                    } catch (error) {
                        console.warn('Failed to optimize image, using original:', error);
                        return img;
                    }
                })
            );

            // Optimize logo if present
            let optimizedLogo: LogoState = logo;
            if (logo.base64 && logo.mimeType) {
                try {
                    const optimized = await optimizeImageForAI(logo.base64, logo.mimeType);
                    optimizedLogo = { ...logo, base64: optimized.base64, mimeType: optimized.mimeType };
                } catch (error) {
                    console.warn('Failed to optimize logo, using original:', error);
                }
            }

            const logoPart: Part | null = (optimizedLogo.base64 && optimizedLogo.mimeType)
                ? { inlineData: { data: optimizedLogo.base64, mimeType: optimizedLogo.mimeType } }
                : null;

            // ALWAYS place the user's REAL subject / character photos FIRST so the image model anchors 100% of identity, face, gender & body on them!
            const namedGroups = new Map<string, { name: string; photos: ImageAsset[] }>();
            const unnamedImages: ImageAsset[] = [];
            optimizedImages.forEach((img) => {
                const name = img.characterName?.trim();
                if (name) {
                    const key = (img.characterId || name).toLowerCase();
                    const existing = namedGroups.get(key);
                    if (existing) {
                        existing.photos.push(img);
                    } else {
                        namedGroups.set(key, { name, photos: [img] });
                    }
                } else {
                    unnamedImages.push(img);
                }
            });

            if (optimizedImages.length > 0 && referenceThumbnail) {
                allImageParts.push({
                    text: 'PRIMARY REAL SUBJECT (TOP PRIORITY — THIS IS THE ONLY REAL PERSON WHO MUST APPEAR IN THE FINAL IMAGE. Lock 100% of their exact real face, eyes, hair, skin tone, gender, and body build — NEVER replace or blend them with anyone from the style reference below):',
                });
            }

            let charGroupIdx = 0;
            namedGroups.forEach(({ name, photos }) => {
                charGroupIdx += 1;
                const countText =
                    photos.length > 1
                        ? `The following ${photos.length} reference photos ALL show the SAME exact real person ("${name}") from different angles/framing. Study ALL ${photos.length} photos together to lock 100% of "${name}"'s exact facial geometry (eyes, eyelids, eyebrows, nose bridge/tip, lips, teeth, jawline, cheeks, ears, hairline, hairstyle, facial hair, glasses, age, exact skin tone and natural pores/texture) AND their exact real body build (neck, shoulder width, torso proportions, arms, and posture)`
                        : `This reference photo shows the exact real person named "${name}". Preserve 100% of "${name}"'s exact facial geometry, skin texture, hair, and real body proportions`;
                allImageParts.push({
                    text: `NAMED CHARACTER #${charGroupIdx} — "${name}": ${countText}. Whenever "${name}" appears in the final image, they MUST look 100% identical to a real unretouched photograph of THIS exact person — NEVER alter their face, NEVER change their body size/shape, NEVER beautify or airbrush them, and NEVER blend them with anyone else:`,
                });
                photos.forEach((p) => {
                    allImageParts.push({ inlineData: { data: p.base64, mimeType: p.mimeType } });
                });
            });

            unnamedImages.forEach((img) => {
                allImageParts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
            });

            if (referenceThumbnail) {
                let optimizedRef = referenceThumbnail;
                try {
                    const optimized = await optimizeImageForAI(referenceThumbnail.base64, referenceThumbnail.mimeType);
                    optimizedRef = { ...referenceThumbnail, base64: optimized.base64, mimeType: optimized.mimeType };
                } catch (error) {
                    console.warn('Failed to optimize reference thumbnail, using original:', error);
                }
                allImageParts.push({
                    text: 'SECONDARY STYLE / COMPOSITION REFERENCE ONLY (DO NOT reprint this image directly! NEVER copy this person’s face, identity, gender, or body! Use ONLY as inspiration for the specific elements requested in the Reference Blueprint rules below, and generate a BRAND-NEW photograph of the PRIMARY REAL SUBJECT above):',
                });
                allImageParts.push({ inlineData: { data: optimizedRef.base64, mimeType: optimizedRef.mimeType } });
            }
            if (logoPart) {
                allImageParts.push({
                    text: `BRAND LOGO REFERENCE — Place this logo natively inside the design at the ${logo.position.replace('-', ' ')} corner. Extract ONLY the logo emblem/wordmark itself (completely remove any white or solid rectangular background box around it) so it blends seamlessly as an authentic part of the artwork, NEVER looking like a pasted sticker:`,
                });
                allImageParts.push(logoPart);
            }

            const namedCharacterSummary = Array.from(namedGroups.values()).map(
                ({ name, photos }) => `"${name}" (${photos.length} reference photo${photos.length > 1 ? 's' : ''})`
            );
            const namedCharactersDirective =
                namedCharacterSummary.length > 0
                    ? `\n\n[NAMED CHARACTERS PROVIDED — 100% REAL FACE & BODY IDENTITY LOCK]\nThe user attached labeled reference photos for: ${namedCharacterSummary.join(', ')}. Each character's reference photos show the SAME real person from multiple angles. Reproduce their exact real face AND exact real body build with photographic fidelity so anyone who knows them in real life immediately recognizes them as 100% real—zero face drift, zero body morphing, and never blend or swap faces between characters.`
                    : '';


            let improvementPlan: ImprovementPlan | null = null;

            if (originalYouTubeThumbnail && platform === 'youtube_improve') {
                // Optimize YouTube thumbnail first
                let optimizedThumbnail = originalYouTubeThumbnail;
                try {
                    const optimized = await optimizeImageForAI(originalYouTubeThumbnail.base64, originalYouTubeThumbnail.mimeType);
                    optimizedThumbnail = { ...originalYouTubeThumbnail, base64: optimized.base64, mimeType: optimized.mimeType };
                } catch (error) {
                    console.warn('Failed to optimize YouTube thumbnail, using original:', error);
                }

                const requestedVariations = Math.max(1, Math.min(5, preferences.variations || 1));

                // Step 1: Analyze the original thumbnail to diagnose real weaknesses & concrete changes
                improvementPlan = await analyzeThumbnailForImprovement(
                    ai,
                    optimizedThumbnail,
                    originalTitle,
                    transcript,
                    requestedVariations
                );

                const transcriptContext = transcript ? `\n- **Video Transcript Context:** "${transcript.substring(0, 2500)}"` : '';
                const originalTitleContext = originalTitle ? `\n- **Video Title:** "${originalTitle}"` : '';
                const referenceImageDirective =
                    optimizedImages.length > 0
                        ? `\n- **Additional User Reference Images (${optimizedImages.length} attached after the original thumbnail):** Naturally incorporate the subject, face, product, or visual elements from these extra reference image(s) into the final thumbnail.`
                        : '';
                const weaknessesList = improvementPlan.weaknesses.map((w, idx) => `  ${idx + 1}. ${w}`).join('\n');

                if (improveMode === 'reimagine') {
                    finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]
            1.  **COMPLETELY NEW CONCEPT FROM SCRATCH:** Do NOT copy the old thumbnail's layout, background, or composition. Invent a brand-new, scroll-stopping YouTube thumbnail concept based on the video's title and story!
            2.  **KEEP REAL SUBJECT LIKENESS (IF PRESENT):** If there is a real person/host in the attached reference thumbnail or user reference images, preserve their recognizable face/likeness, but place them in a totally new, high-drama pose, angle, lighting, and scene.
            3.  **CLEAN CORNERS (NO UI OVERLAYS):** Keep the bottom-right corner uncluttered with clean background only. NEVER draw any timestamp, video duration badge, clock, aspect ratio numbers, or YouTube UI elements anywhere on the image.
            [END OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]

            ---

            **Persona:** You are a world-class YouTube Creative Director for top 0.1% viral channels.

            **Mission:** Reimagine this video's thumbnail from the ground up with a fresh, unmistakable curiosity gap that makes viewers stop scrolling immediately.
            - **Completely New Visual Story:** Design a fresh scene, background, camera angle, and focal object that visually dramatizes the core hook of the video title and transcript.
            - **Punchy 2–4 Word Hook:** Create bold, ultra-readable mobile typography (thick dark outline / drop shadow, strong contrast) that complements—not repeats—the full video title.
            - **Cinematic Studio Quality:** Professional lighting, crisp foreground/background separation, natural skin tones, zero "AI plastic" look.

            **Context:**${originalTitleContext}${transcriptContext}${referenceImageDirective}
            - **Vibe & Style:** ${preferences.style}
            - **Color Palette Inspiration:** Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}
            - **Visual Drama Level:** ${preferences.drama}/5

            **Final Check:** Confirm this is a genuinely new, widescreen concept with zero UI overlays, timestamps, or ratio text on the image.
        `;
                } else {
                    finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]
            1.  **VISIBLE, REAL CTR UPGRADE REQUIRED (DO NOT RETURN AN UNCHANGED COPY):** You MUST make unmistakable, noticeable visual improvements to the attached original YouTube thumbnail so it performs dramatically better on mobile feeds. Returning a near-identical copy is a failure.
            2.  **PRESERVE SUBJECT IDENTITY & TOPIC:** Keep the same real person/face/likeness and core video topic from the original thumbnail so viewers recognize it, while boldly upgrading lighting, framing, background separation, color grading, and typography.
            3.  **CLEAN CORNERS (NO UI OVERLAYS):** Keep the bottom-right corner uncluttered with clean background only. NEVER draw any timestamp, video duration badge, clock, aspect ratio numbers, or YouTube UI elements anywhere on the image.
            [END OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]

            ---

            **Diagnosed Weaknesses in the Original Thumbnail (FIX ALL OF THESE):**
${weaknessesList}

            **Upgrade Directives:**
            - **Subject Pop:** Sharpen the primary subject, enhance facial expression/clarity, add crisp studio rim lighting, and separate them cleanly from the background.
            - **Background Upgrade:** Remove clutter, add cinematic depth-of-field blur or richer atmospheric lighting that makes the foreground jump out.
            - **Typography Upgrade:** Make any headline short (2-4 punchy words), massive, bold sans-serif with high-contrast outline/drop shadow—never small or muddy.
            - **Professional Finish:** High-end YouTube creator retouching (no plastic "AI look").

            **Context:**${originalTitleContext}${transcriptContext}${referenceImageDirective}
            - **Vibe & Style:** ${preferences.style}
            - **Color Palette Inspiration:** Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}
            - **Visual Drama Level:** ${preferences.drama}/5

            **Final Check:** Confirm the image is clearly upgraded compared to the original, with zero timestamps, duration badges, or ratio text drawn on the image.
        `;
                }

                allImageParts.unshift({ inlineData: { data: optimizedThumbnail.base64, mimeType: optimizedThumbnail.mimeType } });

            } else if (platform === 'podcast') {
                const podcastSubtitle = currentText.subheadline ? `\n            *   **Tagline/Subtitle:** "${currentText.subheadline}"` : '';

                finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]
            1.  **OUTPUT ASPECT RATIO:** The generated image's aspect ratio MUST BE EXACTLY 1:1 (SQUARE). This is the single most important rule. Failure to produce a 1:1 square image means the entire task has failed.
            2.  **TEXT RENDERING:** All text from the Creative Brief (Podcast Title, Host Name, Tagline) MUST be rendered directly and cleanly onto the final image.
            [END OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]

            ---

            **Persona:** You are an award-winning Art Director specializing in branding for top-charting podcasts. You have a deep understanding of what makes a cover successful in a crowded marketplace. Your design philosophy is built on clarity, balance, and impact.

            **Core Objective:** Your mission is to create a visually arresting, scroll-stopping podcast cover that is instantly understandable and highly legible, even as a tiny thumbnail, while strictly adhering to the technical requirements above.

            **Design Philosophy & Non-Negotiable Rules:**

            1.  **INTELLIGENT COLOR & CONTRAST:** The provided color palette is your inspiration.
                *   **Apply Expert Color Theory:** Don't just place colors; create a professional, harmonious mood that matches the podcast's vibe.
                *   **Maximize Contrast:** Use the palette to create extreme contrast for ALL text. Every word must be perfectly readable against its background. This is non-negotiable.

            2.  **SINGLE, POWERFUL FOCAL POINT:** Simplicity wins.
                *   Identify or create ONE strong central image. This could be a dramatic photo of the host, a key object, or a powerful abstract/symbolic graphic.
                *   **Avoid Clutter:** A busy background will kill the design's impact at small sizes. Ensure the background supports the foreground elements without distracting from them.

            3.  **MASTER VISUAL HIERARCHY & BALANCE:** Every element must have a clear purpose and place.
                *   **Primary (The Hook):** The Podcast Title ("${currentText.headline}") must be the undeniable hero. Make it large, bold, and instantly readable.
                *   **Secondary (The Context):** The Key Visual (from user images or generated) must be compelling but should *support* the title, not fight it.
                *   **Tertiary (The Credit):** The Host Name ("${currentText.author}") and/or Tagline ("${currentText.subheadline}") must be smaller and placed thoughtfully. **Crucially, they must still be perfectly legible.** Achieve this by placing them in areas of lower visual complexity or giving them a subtle background element (like a soft bar or contrasted area) of their own.
                *   **Compositional Balance:** Arrange these elements in a professional, balanced layout. The final design must feel stable and intentional. Avoid cramming everything into one corner. Consider classic layouts like a strong centered alignment or a clean top/bottom split to create order.

            4.  **THE THUMBNAIL TEST:** Before finalizing, mentally shrink your design to 50x50 pixels. Is every line of text readable? Is the focal point clear? If not, the design fails. AVOID thin fonts, intricate details, and low-contrast color combinations.

            **User-Provided Creative Brief:**
            *   **Podcast Title:** "${currentText.headline}"
            *   **Host/Author Name:** "${currentText.author || 'Not provided'}"${podcastSubtitle}
            *   **Core Theme/Vibe:** "${preferences.style}"
            *   **Inspirational Color Palette:** Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}.
            *   **Provided Visuals:** Use the attached images as the foundation for the key visual.
            *   **Logo:** If a logo is provided, integrate it subtly, perhaps in a corner (${logo.position}). Do not let it overpower the main title or visual.

            **Final Check:** Before outputting, verify again that the aspect ratio is exactly 1:1 (SQUARE).
        `;
            } else if (platform === 'tiktok') {
                const tiktokHeadline = currentText.headline ? `\n*   **Headline Hook:** "${currentText.headline}"` : '';

                finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]
            1.  **OUTPUT ASPECT RATIO:** The generated image's aspect ratio MUST BE EXACTLY 9:16 (VERTICAL). This is the single most important rule. Failure to produce a 9:16 image means the entire task has failed.
            2.  **TEXT RENDERING:** A headline MUST be rendered directly and cleanly onto the final image. The text must be bold, trendy, and instantly readable on a mobile device.
            [END OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]

            ---

            **Persona:** You are a top-tier TikTok/Shorts viral strategist and a brilliant motion graphic designer. You understand the psychology of the "For You" page and what makes a user stop scrolling in under a second.

            **Core Objective:** Your mission is to create a viral, scroll-stopping TikTok cover from the provided video frames or images. The cover must generate intense curiosity and promise high value, compelling users to watch the video. Strictly adhere to the technical requirements above.

            **Design Philosophy & Non-Negotiable Rules:**

            1.  **CURIOSITY GAP IS KING:** The design must not give everything away. It should pose a question, show the "before" of a transformation, or hint at a shocking outcome.
                *   **Analyze Frames/Images:** Identify the single most intriguing frame or image from the assets provided. This might be a frame with a peak emotional expression, a bizarre situation, or a moment right before a big reveal. This frame is your foundation.
                *   **Amplify the Hook:** Use text and graphic elements to amplify the hook of that single frame.

            2.  **TEXT IS A WEAPON:** TikTok text is not just information; it's a core visual element.
                *   **BIG, BOLD, NATIVE:** Use large, bold, sans-serif fonts that feel native to the TikTok app. Think fonts like TikTok Sans, or similar bold, clean styles. Use thick outlines or strong drop shadows for maximum readability against any background.
                *   **SHORT & PUNCHY:** The headline ("${currentText.headline}") should be very short (2-5 words is ideal). It must be emotionally charged and create urgency or curiosity.
                *   **SMART PLACEMENT:** Place text in the upper or lower thirds of the screen, avoiding the center where the user's thumb might be. Don't cover the main subject's face.

            3.  **VISUALS THAT POP:** The aesthetic must match the platform.
                *   **High Saturation & Contrast:** Colors should be vibrant and eye-catching. Increase saturation and contrast from the source frame to make it pop on a small screen.
                *   **Subtle, Trendy Graphics:** If appropriate, add minimal graphic elements like a simple arrow, a circle, or emoji to draw attention to the key subject, but do NOT over-clutter the design. The focus is the main image and the headline.

            4.  **THE 1-SECOND TEST:** Before finalizing, imagine seeing this cover for one second while scrolling. Does it make you stop? Does it make you curious? Is the text instantly readable? If not, the design fails. AVOID small text, complex layouts, and subtle color palettes.

            **User-Provided Creative Brief:**${tiktokHeadline}
            *   **Core Theme/Vibe:** "${preferences.style}"
            *   **Inspirational Color Palette:** Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}.
            *   **Provided Video Frames/Images:** Analyze these assets to find the most compelling moment to use as the base for the cover.
            *   **Logo:** If a logo is provided, place it very subtly in a corner (${logo.position}). It should be small and not distracting.

            **Final Check:** Before outputting, verify again that the aspect ratio is exactly 9:16 (VERTICAL).
        `;
            } else if (platform === 'youtube') {
                const subheadlineLine = currentText.subheadline
                    ? `\n            - **Subheadline / Secondary Tag:** "${currentText.subheadline}"`
                    : '';

                finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]
            1.  **WIDESCREEN COMPOSITION:** Compose cleanly for a widescreen YouTube thumbnail. NEVER draw any timestamp, duration badge, aspect ratio numbers, or UI elements anywhere on the image.
            2.  **CLEAN BOTTOM-RIGHT CORNER:** Keep the bottom-right corner uncluttered with clean background only (no critical text or logos there).
            3.  **TEXT RENDERING:** Render the Headline clearly and accurately directly onto the thumbnail with extreme mobile readability.
            [END OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]

            ---

            **Persona:** You are an elite YouTube Thumbnail Designer & CTR Strategist who designs thumbnails for top-performing channels.

            **Core Objective:** Create a scroll-stopping, high-CTR YouTube thumbnail that communicates the video's hook in under 1 second, even when viewed at tiny mobile feed size.

            **Non-Negotiable YouTube CTR Rules:**
            1.  **EXPRESSIVE FOCAL POINT:** Use the rule of thirds. Make the primary subject (person, face, or hero object from the provided images) large, crisp, and emotionally expressive with strong rim lighting or subtle edge separation from the background.
            2.  **TYPOGRAPHY:** ${
                currentText.headline?.trim()
                    ? `Render ONLY this exact Headline text cleanly with zero typos: "${currentText.headline.trim()}" in massive, bold sans-serif typography with high contrast (thick dark outline or clean drop shadow). Do NOT render any other words or layout labels.`
                    : 'No headline text was provided—create a clean, visual-first thumbnail with NO random text, NO placeholder words, and NO layout labels written on the image.'
            }
            3.  **HIGH-CONTRAST VISUAL HIERARCHY:** Use clean foreground/background separation (subtle depth-of-field blur on the background, vibrant color grading, intentional lighting). Avoid busy, noisy backgrounds.
            4.  **AVOID THE "AI LOOK":** Make lighting, skin tones, and edges look like a professionally lit studio photograph and retouched graphic—not plastic or over-processed.

            **User Creative Brief:**
            - **Headline:** ${currentText.headline?.trim() ? `"${currentText.headline.trim()}"` : 'NONE (do not add text)'}${subheadlineLine}
            - **Overall Vibe & Style:** ${preferences.style}
            - **Color Palette Inspiration:** Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}, Background: ${colors.background}
            - **Visual Drama Level:** ${preferences.drama}/5
            - **User-Provided Images:** Use the attached images as the primary subject/foundation and preserve the subject's likeness.
            - **Logo:** If a logo is provided, place it subtly in the ${logo.position === 'bottom-right' ? 'top-right or top-left (avoiding the YouTube timestamp in bottom-right)' : logo.position.replace('-', ' ')}.

            **Final Check:** Verify crisp readable text, an uncluttered bottom-right corner, and zero timestamps or ratio labels drawn on the image.
        `;
            } else if (platform === 'daily_post') {
                const hasHeadline = Boolean(currentText.headline && currentText.headline.trim());
                const hasBrandColors = Boolean(colors.primary && colors.primary.trim());
                const isRetouchMode = Boolean(currentText.body && currentText.body.startsWith('[RETOUCH_MY_PHOTO]'));
                const textStyleMatch = currentText.body?.match(/\[TEXT_DESIGN_STYLE:\s*([^\]]+)\]/);
                const customTextStyleDirection = textStyleMatch?.[1]?.trim() || '';
                const cleanBody = (currentText.body || '')
                    .replace('[RETOUCH_MY_PHOTO]', '')
                    .replace(/\[TEXT_DESIGN_STYLE:\s*[^\]]+\]/, '')
                    .replace(/\[REF_COPY_RULES:\s*[^\]]+\]/, '')
                    .trim();

                const textDesignRule = hasHeadline
                    ? `The user explicitly wants designed typography on this photo. Apply agency-grade editorial graphic-design rules:
                - Render ONLY this exact text with 100% spelling accuracy: "${currentText.headline.trim()}" (do NOT add extra words, labels, or watermarks).
                ${customTextStyleDirection ? `- CHOSEN TEXT DESIGN STYLE (MANDATORY): ${customTextStyleDirection}` : '- Match the typography weight, spacing, and visual hierarchy to the niche and mood of the photo.'}
                - Place the text cleanly in natural negative space (upper third, lower third, or clean side margin) — NEVER cover or overlap the person's face, eyes, or key focal area.
                - Ensure effortless mobile readability with strong figure-ground contrast — the text and photograph must feel professionally art-directed together, never like plain slapped-on default text.`
                    : 'STRICTLY ZERO TEXT on the image — pure, clean, authentic photography with NO captions, NO letters, NO graphics, and NO watermarks anywhere.';

                if (isRetouchMode) {
                    finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE PHOTO RETOUCH REQUIREMENTS]
            1.  **OUTPUT ASPECT RATIO:** Compose cleanly for ${effectiveAspectRatio}. Never draw borders, frames, split screens, UI chrome, or watermarks.
            2.  **PRO PHOTOGRAPHER RETOUCH OF THE EXACT UPLOADED PHOTO:** Act as an elite commercial photo retoucher editing the user's actual uploaded photograph in Lightroom/Capture One. Keep 100% of the person's EXACT face, expression, eyes, hair, skin tone, real pores, exact body shape, and EXACT pose from the uploaded photo. Do NOT turn them into a different person, do NOT airbrush/smooth their skin into plastic, and do NOT change their facial features or body proportions.
            3.  **REALISTIC LIGHTING & OPTICS:** Upgrade the exposure, dynamic range, crisp natural focus, rich true-to-life film color grading, and subtle natural 50mm lens depth-of-field so it looks like it was shot on a $5,000 full-frame camera. If a new location/background is requested, seamlessly relight the person's edges, hair, and clothing to match the new environment's real light direction and color temperature so it looks 100% photographed on location — never like a pasted cutout.
            4.  **TEXT & GRAPHIC DESIGN RULE:** ${textDesignRule}
            [END OF ABSOLUTE, NON-NEGOTIABLE PHOTO RETOUCH REQUIREMENTS]

            ---

            **Retouch Brief:**
            - ${cleanBody}

            **Final Check:** Does the person look 100% identical to themselves in the original photo, just photographed with pro lighting, clean background, and zero "AI plastic" artifacts?
        `;
                } else {
                    finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE PHOTOGRAPHY REQUIREMENTS]
            1.  **OUTPUT ASPECT RATIO:** Compose cleanly for ${effectiveAspectRatio}. Never draw borders, frames, UI chrome, watermarks, or aspect ratio labels.
            2.  **100% REAL CAMERA PHOTOGRAPH (ZERO "AI LOOK"):** Act as an elite real-world editorial & lifestyle photographer shooting on a full-frame mirrorless camera (35mm/50mm/85mm prime lens, f/1.8–f/2.8). The final image MUST look indistinguishable from a real photograph taken on location — genuine skin pores and micro-texture, natural hair strands, authentic real-world lighting, subtle natural lens depth-of-field, realistic clothing drape, and natural color science. STRICTLY FORBIDDEN: waxy/airbrushed plastic skin, fake HDR glow, CGI gloss, synthetic neon outlines, or stiff stock-photo poses.
            3.  **NATURAL POSE, CONFIDENCE & SWAG:** Direct the subject in a natural, confident, candid real-life pose and camera angle appropriate for the scene (relaxed shoulders, authentic body language, natural eye contact or candid off-camera gaze — like a friend or pro photographer captured them in the moment).
            4.  **TEXT & GRAPHIC DESIGN RULE:** ${textDesignRule}
            [END OF ABSOLUTE, NON-NEGOTIABLE PHOTOGRAPHY REQUIREMENTS]

            ---

            **Creative Brief:**
            - **Scene & Vibe:** ${cleanBody || 'Authentic everyday lifestyle photograph ready to share on Instagram or Facebook.'}
            ${hasBrandColors ? `- **Subtle Brand Color Harmony:** Gently harmonize wardrobe/environment accents with Primary ${colors.primary}, Secondary ${colors.secondary}, Accent ${colors.accent} while keeping skin tones and lighting 100% realistic and photographic.` : '- **Color Science:** 100% true-to-life natural photographic colors — do NOT apply artificial brand tints or color overlays.'}
            - **Subject Fidelity:** If person/character reference photos are attached, reproduce 100% of their exact real face AND exact real body build with total photographic authenticity so friends and followers immediately recognize them as real.

            **Final Check:** Would a friend scrolling Instagram or Facebook believe a real photographer took this picture today? If anything looks CGI, plastic, or overly processed, make it more natural and candid.
        `;
                }
            } else {
                // Fallback for other platforms (e.g. Twitter Card)
                finalPrompt = `
            [START OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]
            1.  **OUTPUT ASPECT RATIO:** The generated image's aspect ratio MUST BE EXACTLY ${platformConfig.aspectRatio}. This is the single most important rule. Failure to produce a ${platformConfig.aspectRatio} image means the entire task has failed.
            2.  **TEXT RENDERING:** All text from the Creative Brief (Headline, Subheadline) MUST be rendered directly and cleanly onto the final image.
            [END OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]

            ---

            **Objective:** Create a compelling and high-quality design for a ${platformConfig.title}, strictly adhering to the technical requirements above.
            
            **Platform Specifics:** ${platformConfig.promptSnippet}

            **Creative Brief:**
            - Headline: "${currentText.headline}"
            - Subheadline: "${currentText.subheadline}"
            - **User-Provided Images:** Use the attached images as the primary visual focus.
            - **Logo:** If a logo is provided, integrate it at the ${logo.position.replace('-', ' ')}.
            - **Overall Vibe:** ${preferences.style}.
            - **Color Palette:** Primary: ${colors.primary}, Secondary: ${colors.secondary}, Accent: ${colors.accent}, Background: ${colors.background}.
            - **Visual Drama:** ${preferences.drama} out of 5.
            
            **Final Check:** Before outputting, verify again that the aspect ratio is exactly ${platformConfig.aspectRatio}.
        `;
            }
            
            // Keep variation labels strictly in JS metadata (never include label names in prompt text so the model never renders them!)
            const GENERATE_VARIATION_DIRECTIONS = [
                'Composition Style: Use a tight, high-impact close-up photographic framing with natural directional lighting and crisp lens focus on the subject. (Internal layout cue only—do not write these words on the image.)',
                'Composition Style: Use a dynamic two-tone contrasting background split with realistic shallow depth-of-field and eye-leading photographic framing. (Internal layout cue only—do not write these words on the image.)',
                'Composition Style: Use a clean, uncluttered minimalist composition with generous negative space and punchy photographic contrast. (Internal layout cue only—do not write these words on the image.)',
                'Composition Style: Use natural cinematic film color grading with realistic directional lighting and atmospheric background depth. (Internal layout cue only—do not write these words on the image.)',
                'Composition Style: Use a vibrant high-contrast color-blocked background with clean natural separation behind the real subject. (Internal layout cue only—do not write these words on the image.)',
            ];

            const isImproveMode = Boolean(
                originalYouTubeThumbnail && platform === 'youtube_improve' && improveMode === 'improve'
            );
            const improvePlans = improvementPlan?.variationPlans || DEFAULT_IMPROVE_PLANS;

            const variationCount = Math.max(1, Math.min(5, preferences.variations || 1));
            // Run sequentially (MAX_CONCURRENT = 1) so OpenRouter's in-flight credit holds never reject parallel variations
            const MAX_CONCURRENT = 1;
            const responses: Array<{ response: GenerateContentResponse; label: string; hookText?: string }> = [];
            let lastError: any = null;

            const runVariation = async (
                i: number
            ): Promise<{ response: GenerateContentResponse; label: string; hookText?: string }> => {
                await imageGenRateLimiter.acquire(`generate-${platform}-variation-${i}`);

                let variationDirective = '';
                let variationLabel = `Variation ${i + 1}`;
                let variationHookText: string | undefined;

                if (platform === 'youtube_improve' && originalYouTubeThumbnail) {
                    const plan = improvePlans[i % improvePlans.length];
                    variationHookText = plan.hookText?.trim() || undefined;
                    const hookDirective = variationHookText
                        ? `\n- **EXACT THUMBNAIL TEXT TO RENDER (NON-NEGOTIABLE):** Render ONLY this short, ultra-readable viral hook text cleanly with zero spelling errors, thick outline, and high contrast: "${variationHookText}"`
                        : '';

                    if (isImproveMode) {
                        variationLabel = plan.label;
                        variationDirective = `Visual Upgrade Instructions (internal guidance only—never write instruction words on the image): ${plan.instructions}${hookDirective}`;
                    } else {
                        variationLabel = DEFAULT_GENERATE_LABELS[i % DEFAULT_GENERATE_LABELS.length];
                        variationDirective = `${GENERATE_VARIATION_DIRECTIONS[i % GENERATE_VARIATION_DIRECTIONS.length]}${hookDirective}`;
                    }
                } else {
                    variationLabel = DEFAULT_GENERATE_LABELS[i % DEFAULT_GENERATE_LABELS.length];
                    variationDirective = GENERATE_VARIATION_DIRECTIONS[i % GENERATE_VARIATION_DIRECTIONS.length];
                }

                const designerLikenessDirective =
                    images.length > 0
                        ? `\n\n[100% REAL PHOTOGRAPH — FACE, BODY & ANTI-AI-PLASTIC DIRECTIVE (TOP PRIORITY, INTERNAL GUIDANCE ONLY)]
- **100% Exact Face & Body Lock:** Every person from the attached reference photos MUST remain 100% identical to their real self — exact facial structure, eye shape, nose, mouth, jawline, ears, hairline/hairstyle, facial hair, glasses, age, exact skin tone, and exact body build (neck, shoulders, torso, arms, weight, and posture). NEVER slim, bulk up, de-age, beautify, or alter their facial or body proportions.
- **Indistinguishable From a Real Camera Photo (ZERO "AI Look"):** Render the person as a genuine candid photograph shot on a real 50mm DSLR camera — preserve natural human skin pores, subtle natural imperfections, realistic hair strands, real fabric folds, and true optical depth of field. STRICTLY AVOID waxy/plastic airbrushed skin, over-smoothed beauty filters, artificial CGI/3D gloss, fake HDR halos, or glowing neon edges on skin.
- **Natural Scene Integration:** Match the lighting direction, color temperature, and shadows on the person naturally to the real environment so it looks like they were physically photographed on location — never like an AI-generated illustration or pasted cutout.`
                        : '';

                const refCopyRulesMatch = currentText.body?.match(/\[REF_COPY_RULES:\s*([^\]]+)\]/);
                const refCopyRulesText = refCopyRulesMatch?.[1]?.trim() || '';
                const referenceBlueprintDirective = referenceThumbnail
                    ? `\n\n[SECONDARY REFERENCE INSPIRATION RULES — STRICT SUBJECT PROTECTION (NON-NEGOTIABLE)]
- **NEVER Reprint the Reference Image:** Generate a BRAND-NEW photograph/design. NEVER return or lightly filter the reference image itself.
- **100% Primary Subject Identity Lock:** Completely DISCARD the person, face, gender, hair, and body from the secondary reference image. The person in the final image MUST be 100% the PRIMARY REAL SUBJECT from the first attached user photos (exact face, exact skin tone, exact hair, exact gender, exact body proportions).
${refCopyRulesText ? `- **EXACT ELEMENTS TO COPY / IGNORE FROM REFERENCE:** ${refCopyRulesText}` : '- **Elements to Inspire From Reference:** Adapt the pose, camera framing, composition, background mood, lighting, and layout style naturally to the Primary Real Subject.'}
- **100% Text & Branding Swap:** Completely REMOVE any original text, logos, or watermarks from the reference image.${currentText.headline?.trim() ? ` Render ONLY the user's text: "${currentText.headline.trim()}".` : ' Do NOT copy any text from the reference image.'}`
                    : '';

                const aspectOverrideDirective =
                    effectiveAspectRatio !== platformConfig.aspectRatio
                        ? `\n\n[USER OUTPUT ASPECT RATIO OVERRIDE — MANDATORY]\nThe user explicitly selected output aspect ratio ${effectiveAspectRatio} (${
                              effectiveAspectRatio === '9:16'
                                  ? 'VERTICAL 9:16 portrait'
                                  : effectiveAspectRatio === '1:1'
                                    ? 'SQUARE 1:1'
                                    : effectiveAspectRatio === '4:5'
                                      ? 'PORTRAIT 4:5'
                                      : 'WIDESCREEN 16:9 horizontal'
                          }). Compose the entire design strictly for ${effectiveAspectRatio} and ignore any conflicting orientation note above.`
                        : '';

                const outfitMode = preferences.outfitMode || 'keep';
                const customOutfitText = (preferences.customOutfit || '').trim();
                const outfitDirective =
                    images.length > 0 && outfitMode === 'ai_auto'
                        ? `\n\n[OUTFIT DIRECTION — FRESH AI-DESIGNED OUTFIT (MANDATORY)]
- DO NOT reuse or copy the clothing worn in the character's reference photos.
- Dress the character in a completely DIFFERENT, fresh, real-world outfit that naturally fits the video's topic, mood, and setting (for example: tailored blazer or sharp shirt for business/finance, clean streetwear or hoodie for tech/creator vlogs, athletic wear for fitness, etc.).
- Keep 100% of their exact real face, hair, skin tone, and exact real body proportions — ONLY change the clothing, rendered with realistic fabric texture, natural folds, seams, and matching scene lighting.`
                        : images.length > 0 && outfitMode === 'custom' && customOutfitText
                          ? `\n\n[OUTFIT DIRECTION — CUSTOM USER OUTFIT (MANDATORY)]
- Ignore the clothing worn in the character's reference photos.
- Dress the character specifically in: "${customOutfitText}".
- Fit this outfit naturally onto their exact real shoulders, torso, and body proportions with realistic fabric texture, folds, and lighting while keeping 100% of their exact real face, hair, skin tone, and body build.`
                          : '';

                const logoIntegrationDirective = logoPart
                    ? `\n\n[BRAND LOGO INTEGRATION — SEAMLESS DESIGN ELEMENT (MANDATORY)]
- Integrate the attached BRAND LOGO naturally into the composition at the ${logo.position.replace('-', ' ')} with clean breathing room from the edges.
- NEVER paste the logo as a harsh opaque white/colored square box or slapped-on sticker. Completely remove any rectangular background behind the logo so ONLY the clean logo mark/wordmark sits naturally in the layout.
- Harmonize its scale (tasteful, balanced, never oversized), lighting, and subtle shadow/contrast with the surrounding artwork so it looks professionally designed into the scene from the start. Keep it crisp and never overlapping any person's face or main headline.`
                    : '';

                const variationPrompt = `${finalPrompt}${referenceBlueprintDirective}${namedCharactersDirective}${outfitDirective}${logoIntegrationDirective}${designerLikenessDirective}${aspectOverrideDirective}\n\n${variationDirective}`;

                const imageConfig = {
                    responseModalities: [Modality.IMAGE],
                    aspectRatio: effectiveAspectRatio,
                };

                const generateOnce = (promptText: string) =>
                    callWithFallback(
                        () =>
                            retryWithBackoff(
                                () =>
                                    ai.models.generateContent({
                                        model: getModelWithFallback('IMAGE', false),
                                        contents: { parts: [...allImageParts, { text: promptText }] },
                                        config: imageConfig as any,
                                    }),
                                {
                                    maxRetries: 2,
                                    initialDelayMs: 2000,
                                    retryableErrors: (error: any) =>
                                        !error?.status || error.status === 429 || (error.status >= 500 && error.status < 600),
                                }
                            ),
                        () =>
                            retryWithBackoff(
                                () =>
                                    ai.models.generateContent({
                                        model: getModelWithFallback('IMAGE', true),
                                        contents: { parts: [...allImageParts, { text: promptText }] },
                                        config: imageConfig as any,
                                    }),
                                {
                                    maxRetries: 2,
                                    initialDelayMs: 2000,
                                    retryableErrors: (error: any) =>
                                        !error?.status || error.status === 429 || (error.status >= 500 && error.status < 600),
                                }
                            ),
                        'Failed to generate design variation'
                    );

                let response = await generateOnce(variationPrompt);

                // Pre-delivery Vision Quality & Face-Likeness Audit for Thumbnail Studio modes (Daily Post runs its own dedicated audit)
                if (platform !== 'daily_post' && optimizedImages.length > 0) {
                    try {
                        const genPart = response?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
                        const primarySubject = optimizedImages[0];
                        if (genPart?.inlineData?.data && primarySubject?.base64) {
                            const expectedText = (variationHookText || currentText.headline || '').trim();
                            const auditRes = await ai.models.generateContent({
                                model: getModelWithFallback('TEXT', false),
                                contents: {
                                    parts: [
                                        { text: 'IMAGE A — REAL PERSON REFERENCE PHOTO (Ground Truth Identity):' },
                                        { inlineData: { data: primarySubject.base64, mimeType: primarySubject.mimeType } },
                                        { text: 'IMAGE B — GENERATED THUMBNAIL TO AUDIT:' },
                                        {
                                            inlineData: {
                                                data: genPart.inlineData.data,
                                                mimeType: genPart.inlineData.mimeType || 'image/png',
                                            },
                                        },
                                        {
                                            text: `Audit IMAGE B before showing it to the user.
Check these 3 critical gates:
1. Face & Body Match: Does the person in IMAGE B unmistakably look like the EXACT same real person from IMAGE A (same face, eyes, skin tone, hair, gender, body build — NOT a different person or plastic AI face)?
2. Anatomy & Quality: No warped hands/eyes or glaring AI artifacts.
3. Text Accuracy: ${expectedText ? `If text is rendered, "${expectedText}" must be spelled cleanly without gibberish.` : 'No random gibberish words.'}

Only fail (passed: false) if there is a clear, noticeable identity drift or glaring defect.
Return STRICT JSON only (no markdown fences):
{"passed":true,"fixInstructions":""} or {"passed":false,"fixInstructions":"1-2 concrete sentences telling the image generator exactly what to fix"}`,
                                        },
                                    ],
                                },
                            });
                            const rawAudit =
                                auditRes?.candidates?.[0]?.content?.parts
                                    ?.map((p: any) => p?.text || '')
                                    .join('\n')
                                    .trim() || '';
                            const cleanedAudit = rawAudit.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
                            const parsedAudit = JSON.parse(cleanedAudit);
                            if (parsedAudit?.passed === false && parsedAudit?.fixInstructions) {
                                const correctedPrompt = `${variationPrompt}\n\n[MANDATORY LIKENESS & QUALITY AUDIT FIX — CORRECT THESE ISSUES]: ${String(parsedAudit.fixInstructions).trim()}`;
                                const retried = await generateOnce(correctedPrompt);
                                if (retried?.candidates?.[0]?.content?.parts?.some((p: any) => p?.inlineData?.data)) {
                                    response = retried;
                                }
                            }
                        }
                    } catch (auditErr) {
                        console.warn('Thumbnail pre-delivery likeness audit skipped:', auditErr);
                    }
                }

                return { response, label: variationLabel, hookText: variationHookText };
            };

            // True concurrency-limited batching + Promise.allSettled so successful variations aren't lost
            for (let i = 0; i < variationCount; i += MAX_CONCURRENT) {
                const batchIndices: number[] = [];
                for (let j = i; j < Math.min(i + MAX_CONCURRENT, variationCount); j++) {
                    batchIndices.push(j);
                }
                const settled = await Promise.allSettled(batchIndices.map((idx) => runVariation(idx)));
                for (const outcome of settled) {
                    if (outcome.status === 'fulfilled') {
                        responses.push(outcome.value);
                    } else {
                        lastError = outcome.reason;
                        console.warn('A design variation failed:', outcome.reason);
                    }
                }
            }

            if (responses.length === 0 && lastError) {
                throw lastError;
            }

            const results: DesignResult[] = [];
            const resultLabels: string[] = [];
            for (const { response, label, hookText } of responses) {
                const candidate = response.candidates?.[0];
                if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                            results.push({
                                image: {
                                    id: `gen_${Date.now()}_${results.length}`,
                                    base64: part.inlineData.data,
                                    mimeType: part.inlineData.mimeType,
                                    url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                                },
                                ...(hookText ? { suggestedHeadline: hookText } : {}),
                            });
                            resultLabels.push(label);
                            break;
                        }
                    }
                }
            }

            if (results.length === 0) {
                throw new Error("The model did not return any images. Please try adjusting your prompt or inputs.");
            }

            // Score each generated thumbnail for CTR readability, contrast, and curiosity
            const scoredResults = await scoreGeneratedThumbnails(
                ai,
                results,
                resultLabels,
                platform,
                improvementPlan?.originalScore
            );

            return scoredResults;
        } catch (error: any) {
            errorTracker.trackAiError('generateDesign', error, finalPrompt);
            throw error;
        }
    });
};

export const adaptImageForPlatform = async (
    ai: GoogleGenAI, 
    sourceImage: ImageAsset, 
    targetPlatform: Platform, 
    text: TextState, 
    logo: LogoState, 
    colors: ColorsState, 
    preferences: PreferencesState
): Promise<DesignResult[]> => {
    return performanceMonitor.measureFunction('adaptImageForPlatform', async () => {
        try {
            // Rate limiting
            await imageGenRateLimiter.acquire(`adapt-${targetPlatform}`);
    
            // Optimize source image
            let optimizedImage = sourceImage;
            try {
                const optimized = await optimizeImageForAI(sourceImage.base64, sourceImage.mimeType);
                optimizedImage = { ...sourceImage, base64: optimized.base64, mimeType: optimized.mimeType };
            } catch (error) {
                console.warn('Failed to optimize source image, using original:', error);
            }
            
            const targetConfig = PLATFORM_CONFIGS[targetPlatform];
            const prompt = `
        [START OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]
        1.  **OUTPUT ASPECT RATIO:** The generated image's aspect ratio MUST BE EXACTLY ${targetConfig.aspectRatio}. This is the single most important rule. Failure to produce a ${targetConfig.aspectRatio} image means the entire task has failed.
        2.  **NO TEXT:** DO NOT render any text on the image. This is a background adaptation task only.
        [END OF ABSOLUTE, NON-NEGOTIABLE TECHNICAL REQUIREMENTS]

        ---

        **Objective:** Adapt the provided source image into a new background suitable for a ${targetConfig.title}, strictly adhering to the technical requirements above.
        
        **Adaptation Instructions:**
        1.  **Recompose, Do Not Recreate:** Maintain the original image's style, colors, and overall aesthetic. The goal is to rearrange the existing elements to fit the new aspect ratio, not to generate a new concept.
        2.  **Composition for Text:** Ensure the new composition has clear, visually balanced areas where text *could* be overlaid later.
        3.  **Platform Specifics:** ${targetConfig.promptSnippet}.
        
            **Final Check:** Before outputting, verify again that the aspect ratio is exactly ${targetConfig.aspectRatio}.
        `;

            const response = await callWithFallback(
                // Primary: Try Gemini 3 Pro first
                () => retryWithBackoff(
                    () => ai.models.generateContent({
                        model: getModelWithFallback('IMAGE', false),
                        contents: { parts: [
                            { inlineData: { data: optimizedImage.base64, mimeType: optimizedImage.mimeType } },
                            { text: prompt }
                        ]},
                        config: {
                            responseModalities: [Modality.IMAGE],
                            aspectRatio: targetConfig.aspectRatio,
                        } as any,
                    }),
                    {
                        maxRetries: 2,
                        initialDelayMs: 2000,
                        retryableErrors: (error: any) => {
                            return error.status === 429 || (error.status >= 500 && error.status < 600);
                        },
                    }
                ),
                // Fallback: Use Gemini 2.5 Flash if primary fails
                () => retryWithBackoff(
                    () => ai.models.generateContent({
                        model: getModelWithFallback('IMAGE', true),
                        contents: { parts: [
                            { inlineData: { data: optimizedImage.base64, mimeType: optimizedImage.mimeType } },
                            { text: prompt }
                        ]},
                        config: {
                            responseModalities: [Modality.IMAGE],
                            aspectRatio: targetConfig.aspectRatio,
                        } as any,
                    }),
                    {
                        maxRetries: 2,
                        initialDelayMs: 2000,
                        retryableErrors: (error: any) => {
                            return error.status === 429 || (error.status >= 500 && error.status < 600);
                        },
                    }
                ),
                'Failed to adapt design'
            );

            const results: DesignResult[] = [];
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        const base64 = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType;
                        results.push({
                            image: {
                                id: `adapt_${Date.now()}`,
                                base64,
                                mimeType,
                                url: `data:${mimeType};base64,${base64}`
                            }
                        });
                    }
                }
            }

            if (results.length === 0) {
                throw new Error("Adaptation failed: The model did not return an image.");
            }
            return results;
        } catch (error: any) {
            errorTracker.trackAiError('adaptImageForPlatform', error);
            throw error;
        }
    });
};

export const resizeThumbnailForSize = async (
    ai: GoogleGenAI,
    sourceImage: ImageAsset,
    option: ResizeOption
): Promise<DesignResult> => {
    return performanceMonitor.measureFunction('resizeThumbnailForSize', async () => {
        try {
            await imageGenRateLimiter.acquire(`resize-${option.id}`);

            let optimizedImage = sourceImage;
            try {
                const optimized = await optimizeImageForAI(sourceImage.base64, sourceImage.mimeType);
                optimizedImage = { ...sourceImage, base64: optimized.base64, mimeType: optimized.mimeType };
            } catch (error) {
                console.warn('Failed to optimize image for resize, using original:', error);
            }

            const prompt = `Recompose and resize this EXACT thumbnail to fit a ${option.description} layout.
Rules:
1. KEEP THE EXACT SAME THUMBNAIL DESIGN: Preserve the exact same people/faces, clothing, headline text, typography style, colors, lighting, and overall aesthetic from the attached thumbnail. Do NOT invent a new concept.
2. SMART RECOMPOSITION: Reframe and naturally extend the background and reposition the text cleanly so nothing is awkwardly cropped or cut off in the new shape.
3. CLEAN OUTPUT: Never draw any aspect ratio numbers, dimensions, timestamps, or UI overlays anywhere on the image.`;

            const parts: Part[] = [
                { inlineData: { data: optimizedImage.base64, mimeType: optimizedImage.mimeType } },
                { text: prompt },
            ];

            const imageConfig = {
                responseModalities: [Modality.IMAGE],
                aspectRatio: option.aspectRatio,
            };

            const response = await callWithFallback(
                () =>
                    retryWithBackoff(
                        () =>
                            ai.models.generateContent({
                                model: getModelWithFallback('IMAGE', false),
                                contents: { parts },
                                config: imageConfig as any,
                            }),
                        {
                            maxRetries: 2,
                            initialDelayMs: 2000,
                            retryableErrors: (error: any) =>
                                error.status === 429 || (error.status >= 500 && error.status < 600),
                        }
                    ),
                () =>
                    retryWithBackoff(
                        () =>
                            ai.models.generateContent({
                                model: getModelWithFallback('IMAGE', true),
                                contents: { parts },
                                config: imageConfig as any,
                            }),
                        {
                            maxRetries: 2,
                            initialDelayMs: 2000,
                            retryableErrors: (error: any) =>
                                error.status === 429 || (error.status >= 500 && error.status < 600),
                        }
                    ),
                'Failed to resize thumbnail'
            );

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                        const base64 = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType;
                        return {
                            image: {
                                id: `resized_${option.id}_${Date.now()}`,
                                base64,
                                mimeType,
                                url: `data:${mimeType};base64,${base64}`,
                            },
                            description: `Resized · ${option.label}`,
                        };
                    }
                }
            }

            throw new Error('Resize failed to return an image.');
        } catch (error: any) {
            errorTracker.trackAiError('resizeThumbnailForSize', error, option.label);
            throw error;
        }
    });
};
