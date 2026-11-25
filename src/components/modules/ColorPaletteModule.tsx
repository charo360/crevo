import React, { FC } from 'react';
import { ColorsState } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';

interface ColorPaletteModuleProps {
    colors: ColorsState;
    onColorsChange: (c: ColorsState) => void;
}

export const ColorPaletteModule: FC<ColorPaletteModuleProps> = ({ colors, onColorsChange }) => {
    const fields: Array<{ key: keyof ColorsState; label: string }> = [
        { key: 'primary', label: 'Primary' },
        { key: 'secondary', label: 'Secondary' },
        { key: 'accent', label: 'Accent' },
        { key: 'background', label: 'Background' },
    ];

    return (
        <Module icon={ICONS.COLOR} title="Color Palette">
            <div
                className="color-palette"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '10px',
                }}
            >
                {fields.map(({ key, label }) => (
                    <div
                        key={key}
                        className="color-input-group"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
                    >
                        <label style={{ fontSize: '12.5px', margin: 0 }}>{label}</label>
                        <input
                            type="color"
                            value={colors[key]}
                            onChange={(e) => onColorsChange({ ...colors, [key]: e.target.value })}
                            title={`${label}: ${colors[key]}`}
                        />
                    </div>
                ))}
            </div>
        </Module>
    );
};
