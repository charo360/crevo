const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_MODELS = {
    IMAGE_PRIMARY: 'google/gemini-nano-banana-2.1',
    IMAGE_FALLBACK: 'google/gemini-3.1-flash-image',
    TEXT_PRIMARY: 'google/gemini-2.5-flash',
    TEXT_FALLBACK: 'google/gemini-2.5-flash-lite',
    TEXT_NON_GOOGLE_FALLBACK: 'openai/gpt-4o-mini',
};

function resolveOpenRouterModel(requestedModel, isImageRequest) {
    const envImagePrimary = process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_MODELS.IMAGE_PRIMARY;
    const envImageFallback = process.env.OPENROUTER_IMAGE_FALLBACK_MODEL || DEFAULT_MODELS.IMAGE_FALLBACK;
    const envTextPrimary = process.env.OPENROUTER_TEXT_MODEL || DEFAULT_MODELS.TEXT_PRIMARY;
    const envTextFallback = process.env.OPENROUTER_TEXT_FALLBACK_MODEL || DEFAULT_MODELS.TEXT_FALLBACK;

    if (!requestedModel) {
        return isImageRequest ? envImagePrimary : envTextPrimary;
    }

    // Already an OpenRouter provider/model slug (e.g. "google/gemini-nano-banana-2.1")
    if (requestedModel.includes('/')) {
        if (requestedModel === DEFAULT_MODELS.IMAGE_PRIMARY && process.env.OPENROUTER_IMAGE_MODEL) {
            return envImagePrimary;
        }
        return requestedModel;
    }

    // Map legacy Gemini SDK model names to OpenRouter slugs
    const lower = requestedModel.toLowerCase();
    if (isImageRequest || lower.includes('image') || lower.includes('banana')) {
        if (lower.includes('flash') || lower.includes('2.5')) {
            return envImageFallback;
        }
        return envImagePrimary;
    }

    if (lower.includes('flash-lite')) {
        return envTextFallback;
    }
    return envTextPrimary;
}

function convertPartToOpenRouter(part) {
    if (!part) return null;
    if (typeof part === 'string') {
        return { type: 'text', text: part };
    }
    if (typeof part.text === 'string') {
        return { type: 'text', text: part.text };
    }
    if (part.inlineData?.data && part.inlineData?.mimeType) {
        return {
            type: 'image_url',
            image_url: {
                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            },
        };
    }
    return null;
}

function convertContentsToMessages(contents, systemInstruction) {
    const messages = [];

    if (systemInstruction) {
        const sysText =
            typeof systemInstruction === 'string'
                ? systemInstruction
                : Array.isArray(systemInstruction?.parts)
                  ? systemInstruction.parts.map((p) => p.text || '').join('\n')
                  : '';
        if (sysText) {
            messages.push({ role: 'system', content: sysText });
        }
    }

    if (typeof contents === 'string') {
        messages.push({ role: 'user', content: contents });
        return messages;
    }

    // Single { parts: [...] } object
    if (contents && !Array.isArray(contents) && Array.isArray(contents.parts)) {
        const contentItems = contents.parts.map(convertPartToOpenRouter).filter(Boolean);
        messages.push({
            role: contents.role === 'model' ? 'assistant' : contents.role || 'user',
            content: contentItems.length === 1 && contentItems[0].type === 'text' ? contentItems[0].text : contentItems,
        });
        return messages;
    }

    // Array of contents or parts
    if (Array.isArray(contents)) {
        const looseParts = [];
        for (const item of contents) {
            if (item && typeof item === 'object' && Array.isArray(item.parts)) {
                const contentItems = item.parts.map(convertPartToOpenRouter).filter(Boolean);
                messages.push({
                    role: item.role === 'model' ? 'assistant' : item.role || 'user',
                    content:
                        contentItems.length === 1 && contentItems[0].type === 'text'
                            ? contentItems[0].text
                            : contentItems,
                });
            } else {
                const converted = convertPartToOpenRouter(item);
                if (converted) looseParts.push(converted);
            }
        }
        if (looseParts.length > 0) {
            messages.push({
                role: 'user',
                content: looseParts.length === 1 && looseParts[0].type === 'text' ? looseParts[0].text : looseParts,
            });
        }
    }

    return messages;
}

async function imageUrlToInlineData(url) {
    if (!url || typeof url !== 'string') return null;

    if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/s);
        if (match) {
            return { mimeType: match[1], data: match[2] };
        }
        return null;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
        const res = await fetch(url);
        if (!res.ok) return null;
        const mimeType = res.headers.get('content-type') || 'image/png';
        const buffer = Buffer.from(await res.arrayBuffer());
        return { mimeType, data: buffer.toString('base64') };
    }

    return null;
}

async function extractPartsFromOpenRouterResponse(data) {
    const message = data?.choices?.[0]?.message;
    if (!message) {
        return { text: '', parts: [] };
    }

    const parts = [];
    let text = '';

    // 1. Check OpenRouter's message.images array (standard for Gemini/Nano Banana image outputs)
    if (Array.isArray(message.images)) {
        for (const img of message.images) {
            const url = img?.image_url?.url || img?.url || (img?.b64_json ? `data:image/png;base64,${img.b64_json}` : null);
            const inlineData = await imageUrlToInlineData(url);
            if (inlineData) {
                parts.push({ inlineData });
            }
        }
    }

    // 2. Check message.content (string or array of blocks)
    if (typeof message.content === 'string') {
        const dataUrlMatch = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
        if (dataUrlMatch) {
            const inlineData = await imageUrlToInlineData(dataUrlMatch[0]);
            if (inlineData) {
                parts.push({ inlineData });
            }
        }
        text = message.content;
        if (text) {
            parts.push({ text });
        }
    } else if (Array.isArray(message.content)) {
        const textChunks = [];
        for (const block of message.content) {
            if (block?.type === 'text' && typeof block.text === 'string') {
                textChunks.push(block.text);
                parts.push({ text: block.text });
            } else if (block?.type === 'image_url' && block?.image_url?.url) {
                const inlineData = await imageUrlToInlineData(block.image_url.url);
                if (inlineData) {
                    parts.push({ inlineData });
                }
            }
        }
        text = textChunks.join('\n');
    }

    return { text, parts };
}

export async function generateWithOpenRouter({ model, contents, config = {} }) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        const err = new Error(
            'OPENROUTER_API_KEY is not set in .env.local. Add your key from https://openrouter.ai/keys and restart the server.'
        );
        err.status = 500;
        throw err;
    }

    const modalitiesConfig = Array.isArray(config?.responseModalities)
        ? config.responseModalities.map((m) => String(m).toUpperCase())
        : [];
    const isImageRequest =
        modalitiesConfig.includes('IMAGE') ||
        String(model || '').toLowerCase().includes('image') ||
        String(model || '').toLowerCase().includes('banana');

    const resolvedModel = resolveOpenRouterModel(model, isImageRequest);
    const messages = convertContentsToMessages(contents, config?.systemInstruction);

    const payload = {
        model: resolvedModel,
        messages,
    };

    if (isImageRequest) {
        payload.modalities = ['image', 'text'];
        const rawAspectRatio = config?.aspectRatio || config?.imageConfig?.aspectRatio;
        if (rawAspectRatio) {
            const normalizedRatio = String(rawAspectRatio).trim() === '1.91:1' ? '16:9' : String(rawAspectRatio).trim();
            payload.image_config = {
                aspect_ratio: normalizedRatio,
            };
        }
    }

    if (config?.responseMimeType === 'application/json') {
        payload.response_format = { type: 'json_object' };
    }

    if (typeof config?.temperature === 'number') {
        payload.temperature = config.temperature;
    }

    const sendOpenRouterRequest = async (targetModel) => {
        const reqPayload = { ...payload, model: targetModel };
        const resp = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.APP_URL || 'https://crevo.app',
                'X-Title': 'Crevo AI',
            },
            body: JSON.stringify(reqPayload),
        });
        const raw = await resp.text();
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = null;
        }
        return { resp, raw, parsed };
    };

    const isProviderBlockOrTransient = (resp, parsed, raw) => {
        if (!resp.ok) {
            const msg = String(parsed?.error?.message || parsed?.message || raw || '').toLowerCase();
            return (
                msg.includes('blocked') ||
                msg.includes('other') ||
                msg.includes('safety') ||
                msg.includes('prohibited') ||
                msg.includes('recitation') ||
                msg.includes('content_filter') ||
                resp.status === 429 ||
                resp.status >= 500
            );
        }
        const finishReason = String(parsed?.choices?.[0]?.finish_reason || parsed?.choices?.[0]?.native_finish_reason || '').toLowerCase();
        if (finishReason.includes('content_filter') || finishReason.includes('safety') || finishReason === 'other' || finishReason.includes('prohibited')) {
            return true;
        }
        return false;
    };

    let activeModel = resolvedModel;
    let { resp: response, raw: rawText, parsed: data } = await sendOpenRouterRequest(activeModel);

    // If a Google Gemini vision/text request is false-positive blocked (e.g. "Gemini blocked the request: OTHER"),
    // transparently fall back to a non-Google vision/JSON model (openai/gpt-4o-mini) so Analyze Style & Clips keep working.
    if (!isImageRequest && isProviderBlockOrTransient(response, data, rawText)) {
        const nonGoogleFallback = process.env.OPENROUTER_TEXT_ALT_FALLBACK_MODEL || DEFAULT_MODELS.TEXT_NON_GOOGLE_FALLBACK;
        if (activeModel !== nonGoogleFallback) {
            console.warn(`OpenRouter ${activeModel} blocked/failed (${data?.error?.message || response.status}); retrying with ${nonGoogleFallback}...`);
            activeModel = nonGoogleFallback;
            ({ resp: response, raw: rawText, parsed: data } = await sendOpenRouterRequest(activeModel));
        }
    }

    if (!response.ok) {
        const message =
            data?.error?.message ||
            data?.message ||
            rawText ||
            `OpenRouter request failed with status ${response.status}`;
        const err = new Error(message);
        err.status = response.status;
        throw err;
    }

    const { text, parts } = await extractPartsFromOpenRouterResponse(data);

    return {
        text,
        model: activeModel,
        candidates: [
            {
                content: {
                    role: 'model',
                    parts,
                },
            },
        ],
    };
}
