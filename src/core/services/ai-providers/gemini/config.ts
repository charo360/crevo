/**
 * Gemini AI Model Configuration
 * 
 * Centralized configuration for all Gemini models with fallback support
 */

export const GEMINI_MODELS = {
    // Primary models via OpenRouter (Google Nano Banana 2.1 for image, Gemini 2.5 Flash for text)
    PRIMARY: {
        IMAGE: 'google/gemini-nano-banana-2.1',
        TEXT: 'google/gemini-2.5-flash',
    },
    // Fallback models via OpenRouter (Nano Banana 2 / Gemini 3.1 Flash Image + Flash Lite)
    FALLBACK: {
        IMAGE: 'google/gemini-3.1-flash-image',
        TEXT: 'google/gemini-2.5-flash-lite',
    }
} as const;

/**
 * Get the model to use with fallback support
 */
export function getModelWithFallback(type: 'IMAGE' | 'TEXT', useFallback: boolean = false): string {
    return useFallback ? GEMINI_MODELS.FALLBACK[type] : GEMINI_MODELS.PRIMARY[type];
}

/**
 * Wrapper for AI model calls with automatic fallback
 */
export async function callWithFallback<T>(
    primaryCall: () => Promise<T>,
    fallbackCall: () => Promise<T>,
    errorMessage: string = 'AI call failed'
): Promise<T> {
    try {
        return await primaryCall();
    } catch (primaryError: any) {
        console.warn(`Primary model failed: ${primaryError.message}. Attempting fallback...`);
        
        try {
            return await fallbackCall();
        } catch (fallbackError: any) {
            console.error(`Fallback model also failed: ${fallbackError.message}`);
            throw new Error(`${errorMessage}: ${fallbackError.message}`);
        }
    }
}
