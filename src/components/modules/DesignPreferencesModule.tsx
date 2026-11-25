import React, { FC } from 'react';
import { PreferencesState } from '../../types';
import { Module } from './Module';
import { ICONS, VIBE_STYLES } from '../../constants';

interface DesignPreferencesModuleProps {
    preferences: PreferencesState;
    onPreferencesChange: (p: PreferencesState) => void;
}

export const DesignPreferencesModule: FC<DesignPreferencesModuleProps> = ({ preferences, onPreferencesChange }) => {
    return (
        <Module icon={ICONS.PREFERENCES} title="Design Preferences">
            <div className="form-group">
                <label>Style</label>
                <select
                    value={preferences.style}
                    onChange={(e) => onPreferencesChange({ ...preferences, style: e.target.value })}
                >
                    {VIBE_STYLES.map((style) => (
                        <option key={style} value={style}>
                            {style}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>Visual Drama ({preferences.drama}/5)</label>
                <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={preferences.drama}
                    onChange={(e) => onPreferencesChange({ ...preferences, drama: Number(e.target.value) })}
                />
            </div>

            <div className="form-group">
                <label>Variations</label>
                <select
                    value={preferences.variations}
                    onChange={(e) => onPreferencesChange({ ...preferences, variations: Number(e.target.value) })}
                >
                    <option value={1}>1 Variation (Fastest / Lowest Cost)</option>
                    <option value={2}>2 Variations</option>
                    <option value={3}>3 Variations</option>
                    <option value={4}>4 Variations</option>
                    <option value={5}>5 Variations</option>
                </select>
            </div>
        </Module>
    );
};
