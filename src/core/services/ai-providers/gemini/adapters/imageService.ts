import { GoogleGenAI, Part, Modality } from "@google/genai";
import { ImageAsset, ImagenAspectRatio } from '../../../../../types';
import { imageGenRateLimiter } from '../../../../infrastructure/rate-limiting';
import { retryWithBackoff } from '../../../../infrastructure/retry-handlers';
import { optimizeImageForAI } from '../../../../processors/image';
import { errorTracker } from '../../../../infrastructure/error-tracking';
import { performanceMonitor } from '../../../../infrastructure/performance-monitoring';
import { getModelWithFallback, callWithFallback } from '../config';

export const generateImage = async (
    ai: GoogleGenAI, 
    prompt: string, 
    negativePrompt: string, 
    aspectRatio: ImagenAspectRatio
): Promise<ImageAsset | null> => {
    return performanceMonitor.measureFunction('generateImage', async () => {
        try {
            // Rate limiting
            await imageGenRateLimiter.acquire('generate-image');

            const fullPrompt = negativePrompt?.trim()
                ? `${prompt}\n\nAvoid: ${negativePrompt.trim()}`
                : prompt;

            const imageConfig = {
                responseModalities: [Modality.IMAGE],
                aspectRatio,
            };

            const response = await callWithFallback(
                () =>
                    retryWithBackoff(
                        () =>
                            ai.models.generateContent({
                                model: getModelWithFallback('IMAGE', false),
                                contents: { parts: [{ text: fullPrompt }] },
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
                                contents: { parts: [{ text: fullPrompt }] },
                                config: imageConfig as any,
                            }),
                        {
                            maxRetries: 2,
                            initialDelayMs: 2000,
                            retryableErrors: (error: any) =>
                                error.status === 429 || (error.status >= 500 && error.status < 600),
                        }
                    ),
                'Failed to generate image'
            );

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                        const base64 = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType;
                        const url = `data:${mimeType};base64,${base64}`;
                        return { id: `gen_img_${Date.now()}`, url, base64, mimeType };
                    }
                }
            }
            return null;
        } catch (error: any) {
            errorTracker.trackAiError('generateImage', error, prompt);
            throw error;
        }
    });
};

export const editImage = async (
    ai: GoogleGenAI, 
    originalImage: ImageAsset, 
    prompt: string, 
    mask: ImageAsset | null
): Promise<ImageAsset> => {
    return performanceMonitor.measureFunction('editImage', async () => {
        try {
            // Rate limiting
            await imageGenRateLimiter.acquire('edit-image');

            // Optimize images before sending
            let optimizedOriginal = originalImage;
            try {
                const optimized = await optimizeImageForAI(originalImage.base64, originalImage.mimeType);
                optimizedOriginal = { ...originalImage, base64: optimized.base64, mimeType: optimized.mimeType };
            } catch (error) {
                console.warn('Failed to optimize original image, using original:', error);
            }

            const parts: Part[] = [
                { inlineData: { data: optimizedOriginal.base64, mimeType: optimizedOriginal.mimeType } },
            ];
            
            let finalPrompt = prompt;

            if (mask) {
                // Optimize mask
                let optimizedMask = mask;
                try {
                    const optimized = await optimizeImageForAI(mask.base64, mask.mimeType);
                    optimizedMask = { ...mask, base64: optimized.base64, mimeType: optimized.mimeType };
                } catch (error) {
                    console.warn('Failed to optimize mask, using original:', error);
                }
                parts.push({ inlineData: { data: optimizedMask.base64, mimeType: optimizedMask.mimeType } });
                finalPrompt = `Using the provided mask (the second image) where the white area indicates the region to modify, apply the following instruction: "${prompt}". Only change the content within the white masked area and seamlessly blend it with the rest of the image. The black area of the mask should remain completely unchanged.`;
            }
            
            parts.push({ text: finalPrompt });

            const response = await callWithFallback(
                // Primary: Try Gemini 3 Pro first
                () => retryWithBackoff(
                    () => ai.models.generateContent({
                        model: getModelWithFallback('IMAGE', false),
                        contents: { parts },
                        config: {
                            responseModalities: [Modality.IMAGE],
                        },
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
                        contents: { parts },
                        config: {
                            responseModalities: [Modality.IMAGE],
                        },
                    }),
                    {
                        maxRetries: 2,
                        initialDelayMs: 2000,
                        retryableErrors: (error: any) => {
                            return error.status === 429 || (error.status >= 500 && error.status < 600);
                        },
                    }
                ),
                'Failed to edit image'
            );
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                        const base64 = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType;
                        const url = `data:${mimeType};base64,${base64}`;
                        return { ...originalImage, base64, url, id: `edit_${originalImage.id}` };
                    }
                }
            }
            throw new Error("Image editing failed to return an image.");
        } catch (error: any) {
            errorTracker.trackAiError('editImage', error, prompt);
            throw error;
        }
    });
};

export const upscaleImage = async (ai: GoogleGenAI, image: ImageAsset): Promise<ImageAsset> => {
    return performanceMonitor.measureFunction('upscaleImage', async () => {
        try {
            await imageGenRateLimiter.acquire('upscale-image');

            let optimizedOriginal = image;
            try {
                const optimized = await optimizeImageForAI(image.base64, image.mimeType);
                optimizedOriginal = { ...image, base64: optimized.base64, mimeType: optimized.mimeType };
            } catch (error) {
                console.warn('Failed to optimize image before upscale, using original:', error);
            }

            const upscalePrompt =
                'Upscale and enhance this image to ultra-crisp, high-definition studio clarity. Preserve the EXACT same subjects, faces, text, colors, and composition—do not add, remove, or alter any elements. Only sharpen fine details, clean up compression artifacts/noise, and make edges and typography razor sharp.';

            const parts: Part[] = [
                { inlineData: { data: optimizedOriginal.base64, mimeType: optimizedOriginal.mimeType } },
                { text: upscalePrompt },
            ];

            const response = await callWithFallback(
                () =>
                    retryWithBackoff(
                        () =>
                            ai.models.generateContent({
                                model: getModelWithFallback('IMAGE', false),
                                contents: { parts },
                                config: { responseModalities: [Modality.IMAGE] } as any,
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
                                config: { responseModalities: [Modality.IMAGE] } as any,
                            }),
                        {
                            maxRetries: 2,
                            initialDelayMs: 2000,
                            retryableErrors: (error: any) =>
                                error.status === 429 || (error.status >= 500 && error.status < 600),
                        }
                    ),
                'Failed to upscale image'
            );

            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData && part.inlineData.mimeType.startsWith('image/')) {
                        const base64 = part.inlineData.data;
                        const mimeType = part.inlineData.mimeType;
                        const url = `data:${mimeType};base64,${base64}`;
                        return { ...image, base64, mimeType, url, id: `upscale_${image.id}` };
                    }
                }
            }
            throw new Error('Upscaling failed to return an enhanced image.');
        } catch (error: any) {
            errorTracker.trackAiError('upscaleImage', error, 'upscale');
            throw error;
        }
    });
};
