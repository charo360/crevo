import { GoogleGenAI, Part, Type, Modality } from "@google/genai";
import { ImageAsset, AnalysisResult } from '../../../../../types';
import { VIBE_STYLES } from '../../../../../constants';
import { getModelWithFallback, callWithFallback } from '../config';

export const extractFacesFromImage = async (
    ai: GoogleGenAI, 
    sourceImage: ImageAsset
): Promise<ImageAsset[]> => {
    const prompt = "Detect all distinct human subjects in the provided image. For each person found, create a clean, studio-sharp head-and-shoulders cutout with the background completely removed and transparent. CRITICAL: Preserve each person's exact real facial features, skin tone, hair, glasses, and identity 100% faithfully—never alter or replace their face. Only clean up edges and subtle studio clarity. Output each cutout as a separate PNG image.";

    const response = await callWithFallback(
        // Primary: Try Gemini 3 Pro first
        () => ai.models.generateContent({
            model: getModelWithFallback('IMAGE', false),
            contents: { parts: [
                { inlineData: { data: sourceImage.base64, mimeType: sourceImage.mimeType } },
                { text: prompt }
            ]},
            config: {
                responseModalities: [Modality.IMAGE],
            },
        }),
        // Fallback: Use Gemini 2.5 Flash if primary fails
        () => ai.models.generateContent({
            model: getModelWithFallback('IMAGE', true),
            contents: { parts: [
                { inlineData: { data: sourceImage.base64, mimeType: sourceImage.mimeType } },
                { text: prompt }
            ]},
            config: {
                responseModalities: [Modality.IMAGE],
            },
        }),
        'Failed to extract faces'
    );

    const results: ImageAsset[] = [];
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                const base64 = part.inlineData.data;
                const mimeType = part.inlineData.mimeType;
                results.push({
                    id: `face_${Date.now()}_${results.length}`,
                    base64,
                    mimeType,
                    url: `data:${mimeType};base64,${base64}`
                });
            }
        }
    }
    
    if (results.length === 0) {
        throw new Error("The model did not find any faces or failed to return cutouts.");
    }
    return results;
};

/**
 * Scans multiple frames across a video clip to find:
 * 1. The sharpest, eyes-open, most expressive face frame for a clean studio cutout.
 * 2. Up to 2 additional distinct, high-impact real frames (different angle, person, or moment)
 *    so the thumbnail generator has authentic, realistic visual references from across the video.
 */
export const extractBestFacesFromVideoFrames = async (
    ai: GoogleGenAI,
    frames: ImageAsset[]
): Promise<{ cutouts: ImageAsset[]; selectedMoments: ImageAsset[]; scannedCount: number }> => {
    if (!frames || frames.length === 0) {
        throw new Error("No video frames available to extract faces from.");
    }

    let bestIndices: number[] = [0];

    if (frames.length > 1) {
        try {
            const parts: Part[] = [];
            frames.forEach((frame, idx) => {
                parts.push({ text: `Frame ${idx}:` });
                parts.push({ inlineData: { data: frame.base64, mimeType: frame.mimeType } });
            });
            parts.push({
                text: `You are a veteran YouTube Thumbnail Designer selecting the BEST real reference shots from ${frames.length} frames of a video (indexed 0 to ${frames.length - 1}).
Choose up to 4 frame indices in priority order:
1. Index #1 MUST be the sharpest, clearest, well-lit, eyes-open, most expressive shot of the MAIN speaker/subject at the right emotional moment (strictly avoid motion blur, blinking, awkward mid-word mouths, or backs of heads).
2. If MULTIPLE DIFFERENT PEOPLE appear across the video (e.g. guest, co-host, interviewee, friend), you MUST prioritize picking the sharpest, best-lit frame of EACH distinct person so the final thumbnail can feature everyone accurately.
3. For any remaining slots (up to 4 total), pick the single most compelling real story moment / reaction / hero object from another part of the video so the final thumbnail looks 100% authentic and realistic.

Return ONLY valid JSON: { "bestFrameIndices": [0, 3, 5, 7] }`,
            });

            const pickResponse = await callWithFallback(
                () =>
                    ai.models.generateContent({
                        model: getModelWithFallback('TEXT', false),
                        contents: { parts },
                        config: { responseMimeType: 'application/json' },
                    }),
                () =>
                    ai.models.generateContent({
                        model: getModelWithFallback('TEXT', true),
                        contents: { parts },
                        config: { responseMimeType: 'application/json' },
                    }),
                'Frame selection fallback'
            );

            const raw = (pickResponse.text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
            if (Array.isArray(parsed?.bestFrameIndices)) {
                const valid = Array.from(
                    new Set(
                        parsed.bestFrameIndices
                            .map((n: any) => Number(n))
                            .filter((n: number) => Number.isInteger(n) && n >= 0 && n < frames.length)
                    )
                ) as number[];
                if (valid.length > 0) {
                    bestIndices = valid.slice(0, 4);
                }
            }
        } catch (pickErr) {
            console.warn('Smart multi-frame face selector fell back to middle frame:', pickErr);
            bestIndices = [Math.floor(frames.length / 2)];
        }
    }

    const primaryFrame = frames[bestIndices[0]] || frames[0];
    const cutouts = await extractFacesFromImage(ai, primaryFrame);

    // Include up to 3 distinct secondary real frames (other people / peak moments) from across the video
    const selectedMoments: ImageAsset[] = bestIndices
        .slice(1, 4)
        .map((idx, pos) => ({
            ...frames[idx],
            id: `video_moment_${Date.now()}_${pos}`,
        }));

    return {
        cutouts,
        selectedMoments,
        scannedCount: frames.length,
    };
};

export const analyzeVideoAndSuggestStyles = async (
    ai: GoogleGenAI, 
    frames: ImageAsset[]
): Promise<AnalysisResult> => {
    const imageParts: Part[] = frames.map(frame => ({
        inlineData: { data: frame.base64, mimeType: frame.mimeType }
    }));
    
    const prompt = `
        Analyze the following video frames as a YouTube/Social Media CTR Strategist. Based on the visual content, mood, expressions, and subject matter, provide:
        1. A suggested "Vibe & Style" from this list: ${VIBE_STYLES.join(', ')}.
        2. A cohesive 4-color palette (primary, secondary, accent, background) in hex format.
        3. "suggestedHeadline": One ultra-punchy, viral 2-4 word thumbnail headline hook that captures the emotion/story in the frames.
        4. "suggestedSubheadline": A short optional 2-5 word supporting tagline (or empty string if not needed).
        5. "headlineVariations": An array of 5 distinct, high-CTR 2-4 word headline hook variations (curiosity, shock, emotion, bold claim, story twist) so the creator can pick their favorite.

        Your response MUST be a valid JSON object in the following format, and nothing else:
        {
          "suggestedStyle": "Style Name",
          "suggestedColors": {
            "primary": "#XXXXXX",
            "secondary": "#XXXXXX",
            "accent": "#XXXXXX",
            "background": "#XXXXXX"
          },
          "suggestedHeadline": "PUNCHY 2-4 WORD HOOK",
          "suggestedSubheadline": "Short supporting line",
          "headlineVariations": [
            "HOOK OPTION 1",
            "HOOK OPTION 2",
            "HOOK OPTION 3",
            "HOOK OPTION 4",
            "HOOK OPTION 5"
          ]
        }
    `;

    const response = await callWithFallback(
        // Primary: Try Gemini 3 Pro first
        () => ai.models.generateContent({
            model: getModelWithFallback('TEXT', false),
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggestedStyle: { type: Type.STRING },
                        suggestedColors: {
                            type: Type.OBJECT,
                            properties: {
                                primary: { type: Type.STRING },
                                secondary: { type: Type.STRING },
                                accent: { type: Type.STRING },
                                background: { type: Type.STRING },
                            },
                            required: ["primary", "secondary", "accent", "background"]
                        }
                    },
                    required: ["suggestedStyle", "suggestedColors"]
                }
            }
        }),
        // Fallback: Use Gemini 2.5 Flash if primary fails
        () => ai.models.generateContent({
            model: getModelWithFallback('TEXT', true),
            contents: { parts: [{ text: prompt }, ...imageParts] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggestedStyle: { type: Type.STRING },
                        suggestedColors: {
                            type: Type.OBJECT,
                            properties: {
                                primary: { type: Type.STRING },
                                secondary: { type: Type.STRING },
                                accent: { type: Type.STRING },
                                background: { type: Type.STRING },
                            },
                            required: ["primary", "secondary", "accent", "background"]
                        }
                    },
                    required: ["suggestedStyle", "suggestedColors"]
                }
            }
        }),
        'Failed to analyze video and suggest styles'
    );
    
    try {
        const raw = (response.text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsedJson = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        
        if (!VIBE_STYLES.includes(parsedJson.suggestedStyle)) {
            parsedJson.suggestedStyle = VIBE_STYLES[0];
        }

        if (!Array.isArray(parsedJson.headlineVariations)) {
            parsedJson.headlineVariations = parsedJson.suggestedHeadline ? [parsedJson.suggestedHeadline] : [];
        }

        return parsedJson as AnalysisResult;

    } catch(e) {
        console.error("Failed to parse analysis from AI:", e);
        throw new Error("The AI returned an invalid format for style analysis.");
    }
};
