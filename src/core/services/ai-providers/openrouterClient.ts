import type { GoogleGenAI } from '@google/genai';
import { apiRequest } from '../../../lib/api';

/**
 * Drop-in replacement for GoogleGenAI that routes all generateContent calls
 * through our Express backend -> OpenRouter (keeping OPENROUTER_API_KEY hidden on the server).
 */
export function createAiClient(): GoogleGenAI {
    const client = {
        models: {
            generateContent: async (params: {
                model?: string;
                contents: any;
                config?: Record<string, any>;
            }) => {
                return apiRequest('/api/ai/generate', {
                    method: 'POST',
                    body: JSON.stringify(params),
                });
            },
        },
    };

    return client as unknown as GoogleGenAI;
}
