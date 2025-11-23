/**
 * Gemini AI Model Configuration
 * 
 * Centralized configuration for all Gemini models with fallback support
 */

export const GEMINI_MODELS = {
    // Primary models (Gemini 3 Pro)
    PRIMARY: {
        IMAGE: 'gemini-3-pro-image-preview',
        TEXT: 'gemini-3-pro-preview',
    },
    // Fallback models (Gemini 2.5 Flash)
    FALLBACK: {
        IMAGE: 'gemini-2.5-flash-image',
        TEXT: 'gemini-2.5-flash',
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
