import { GoogleGenAI, Part, Type, Modality } from "@google/genai";
import { ImageAsset, AnalysisResult } from '../../../../../types';
import { VIBE_STYLES } from '../../../../../constants';
import { getModelWithFallback, callWithFallback } from '../config';

export const extractFacesFromImage = async (
    ai: GoogleGenAI, 
    sourceImage: ImageAsset
): Promise<ImageAsset[]> => {
    const prompt = "Detect all human faces in the provided image. For each face found, create a new image that is a clean cutout of just the head and shoulders, with the background completely removed and transparent. Output each cutout as a separate PNG image.";

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
                text: `You are selecting the BEST thumbnail reference photos from ${frames.length} frames of a video (indexed 0 to ${frames.length - 1}).
Choose up to 3 frame indices in priority order:
- Index #1 MUST be the sharpest, clearest, well-lit, eyes-open, most expressive human face / main subject (avoid motion blur, blinking, half-closed mouth, or backs of heads).
- Indices #2 and #3 (optional, only if visually distinct) should show a different person, different strong expression, or a compelling real scene/object from another part of the video so the final thumbnail looks realistic and authentic to the video.

Return ONLY valid JSON: { "bestFrameIndices": [0, 2, 4] }`,
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
                    bestIndices = valid.slice(0, 3);
                }
            }
        } catch (pickErr) {
            console.warn('Smart multi-frame face selector fell back to middle frame:', pickErr);
            bestIndices = [Math.floor(frames.length / 2)];
        }
    }

    const primaryFrame = frames[bestIndices[0]] || frames[0];
    const cutouts = await extractFacesFromImage(ai, primaryFrame);

    // Include up to 2 distinct secondary real frames from across the video for realistic thumbnail context
    const selectedMoments: ImageAsset[] = bestIndices
        .slice(1, 3)
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
