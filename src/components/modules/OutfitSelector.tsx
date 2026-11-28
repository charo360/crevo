import React, { FC } from 'react';
import { OutfitMode, PreferencesState } from '../../types';

const QUICK_OUTFIT_PRESETS = [
    'Black Hoodie',
    'Tailored Suit',
    'Smart Casual Blazer',
    'Clean Streetwear',
    'Athletic / Gym',
];

interface OutfitSelectorProps {
    preferences: PreferencesState;
    onPreferencesChange: (p: PreferencesState) => void;
    disabled?: boolean;
    showTopDivider?: boolean;
}

export const OutfitSelector: FC<OutfitSelectorProps> = ({
    preferences,
    onPreferencesChange,
    disabled = false,
    showTopDivider = false,
}) => {
    const mode: OutfitMode = preferences.outfitMode || 'keep';
    const customOutfit = preferences.customOutfit || '';

    const setMode = (nextMode: OutfitMode) => {
        onPreferencesChange({
            ...preferences,
            outfitMode: nextMode,
        });
    };

    const setCustom = (val: string) => {
        onPreferencesChange({
            ...preferences,
            outfitMode: 'custom',
            customOutfit: val,
        });
    };

    return (
        <div
            style={
                showTopDivider
                    ? {
                          marginTop: '10px',
                          paddingTop: '10px',
                          borderTop: '1px solid #e4dcf2',
                      }
                    : undefined
            }
        >
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#4c1d95', marginBottom: '6px' }}>
                👕 Outfit (Optional)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {(
                    [
                        { id: 'keep', label: 'Keep Photo' },
                        { id: 'ai_auto', label: '✨ AI Different Outfit' },
                        { id: 'custom', label: 'Custom' },
                    ] as Array<{ id: OutfitMode; label: string }>
                ).map((opt) => {
                    const active = mode === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setMode(opt.id)}
                            style={{
                                padding: '5px 10px',
                                borderRadius: '999px',
                                border: active ? '1.5px solid #571c86' : '1px solid #d8ccf0',
                                background: active ? '#571c86' : '#ffffff',
                                color: active ? '#ffffff' : '#374151',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>

            {mode === 'ai_auto' && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#6b7280', lineHeight: 1.4 }}>
                    AI will design a fresh outfit that fits your topic — different from the clothes in your reference photos.
                </div>
            )}

            {mode === 'custom' && (
                <div style={{ marginTop: '8px' }}>
                    <input
                        type="text"
                        value={customOutfit}
                        disabled={disabled}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder="e.g. Navy blazer over white t-shirt, red varsity jacket..."
                        maxLength={120}
                        style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: '1.5px solid #d8ccf0',
                            background: '#ffffff',
                            color: '#111827',
                            fontSize: '12px',
                            fontWeight: 600,
                        }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                        {QUICK_OUTFIT_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                disabled={disabled}
                                onClick={() => setCustom(preset)}
                                style={{
                                    padding: '3px 8px',
                                    borderRadius: '999px',
                                    border: '1px solid #e4dcf2',
                                    background: customOutfit.toLowerCase() === preset.toLowerCase() ? '#f3e8ff' : '#ffffff',
                                    color: '#571c86',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
