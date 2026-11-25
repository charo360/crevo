import React, { FC, useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Platform, TextState } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';
import { apiRequest } from '../../lib/api';
import { getModelWithFallback } from '../../core/services/ai-providers/gemini/config';

interface TextContentModuleProps {
    platform: Platform;
    text: TextState;
    onTextChange: React.Dispatch<React.SetStateAction<TextState>>;
    suggestedHooks?: string[];
}

export const TextContentModule: FC<TextContentModuleProps> = ({
    platform,
    text,
    onTextChange,
    suggestedHooks,
}) => {
    const [hooks, setHooks] = useState<string[]>([]);
    const [loadingHooks, setLoadingHooks] = useState(false);

    useEffect(() => {
        if (suggestedHooks && suggestedHooks.length > 0) {
            setHooks(suggestedHooks);
        } else {
            setHooks([]);
        }
    }, [suggestedHooks]);

    const headlineLabel = platform === 'podcast' ? 'Podcast Title' : 'Headline';
    const headlinePlaceholder =
        platform === 'podcast'
            ? 'Enter podcast title'
            : platform === 'tiktok'
              ? 'Short 2–5 word hook'
              : 'Short punchy headline (2–5 words)';

    const subheadlineLabel = platform === 'podcast' ? 'Tagline / Subtitle (Optional)' : 'Subheadline (Optional)';

    const handleGenerateHooks = async () => {
        if (!text.headline.trim() && !text.subheadline.trim()) {
            toast.info('Type a rough topic/headline first (or click Analyze Style on a video) to generate hook variations.');
            return;
        }

        setLoadingHooks(true);
        try {
            const prompt = `You are a Top 0.1% ${platform} Viral Hook Copywriter.
Given the creator's rough headline/topic below, write 5 distinct, ultra-clickable 2-4 word thumbnail hook variations in the SAME language.
Topic / Current Headline: "${text.headline.trim()}"
${text.subheadline.trim() ? `Supporting context: "${text.subheadline.trim()}"` : ''}

Return ONLY valid JSON:
{ "hooks": ["HOOK 1", "HOOK 2", "HOOK 3", "HOOK 4", "HOOK 5"] }`;

            const data = await apiRequest<{ text?: string }>('/api/ai/generate', {
                method: 'POST',
                body: JSON.stringify({
                    model: getModelWithFallback('TEXT', false),
                    contents: prompt,
                    config: { responseMimeType: 'application/json', temperature: 0.7 },
                }),
            });

            const raw = (data.text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            const match = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(match ? match[0] : raw);
            if (Array.isArray(parsed.hooks) && parsed.hooks.length > 0) {
                setHooks(parsed.hooks.slice(0, 5));
                toast.success('Generated 5 hook variations!');
            }
        } catch (err: any) {
            toast.error(err.message || 'Failed to generate hook variations');
        } finally {
            setLoadingHooks(false);
        }
    };

    return (
        <Module icon={ICONS.TEXT} title="Text Content">
            <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>{headlineLabel}</label>
                    <button
                        type="button"
                        onClick={handleGenerateHooks}
                        disabled={loadingHooks}
                        style={{
                            padding: '3px 9px',
                            borderRadius: '999px',
                            border: '1px solid var(--border-color, #e4dcf2)',
                            background: 'var(--surface-2, #f3ecfa)',
                            color: 'var(--primary, #571c86)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: loadingHooks ? 'wait' : 'pointer',
                        }}
                    >
                        {loadingHooks ? 'Generating...' : '✨ Hook Ideas'}
                    </button>
                </div>
                <input
                    type="text"
                    value={text.headline}
                    onChange={(e) => onTextChange((prev) => ({ ...prev, headline: e.target.value }))}
                    placeholder={headlinePlaceholder}
                />
            </div>

            {hooks.length > 0 && (
                <div style={{ marginTop: '-4px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary, #5e5a67)', display: 'block', marginBottom: '6px' }}>
                        Click a hook variation to use it:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {hooks.map((hook, idx) => {
                            const active = text.headline.trim().toLowerCase() === hook.trim().toLowerCase();
                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => onTextChange((prev) => ({ ...prev, headline: hook }))}
                                    style={{
                                        padding: '4px 9px',
                                        borderRadius: '999px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        border: active
                                            ? '1px solid var(--primary, #571c86)'
                                            : '1px solid var(--border-color, #e4dcf2)',
                                        background: active
                                            ? 'var(--primary, #571c86)'
                                            : 'var(--surface-2, #f3ecfa)',
                                        color: active ? '#ffffff' : 'var(--primary, #571c86)',
                                    }}
                                >
                                    {hook}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {platform !== 'tiktok' && (
                <div className="form-group">
                    <label>{subheadlineLabel}</label>
                    <input
                        type="text"
                        value={text.subheadline}
                        onChange={(e) => onTextChange((prev) => ({ ...prev, subheadline: e.target.value }))}
                        placeholder="Add supporting text (optional)"
                    />
                </div>
            )}

            {platform === 'podcast' && (
                <div className="form-group">
                    <label>Host / Author Name</label>
                    <input
                        type="text"
                        value={text.author}
                        onChange={(e) => onTextChange((prev) => ({ ...prev, author: e.target.value }))}
                        placeholder="e.g., Hosted by Alex Morgan"
                    />
                </div>
            )}
        </Module>
    );
};
