import React from 'react';
import clsx from 'clsx';

interface AccentColorPickerProps {
  activeColor: string;
  presets: { name: string; color: string }[];
  onChange: (color: string) => void;
}

export function AccentColorPicker({ activeColor, presets, onChange }: AccentColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map(p => (
        <button key={p.name} onClick={() => onChange(p.color)}
          className={clsx('h-7 w-7 rounded-full border-2 transition-all hover:scale-110',
            activeColor === p.color ? 'border-white ring-2 ring-offset-1 ring-current scale-110' : 'border-transparent')}
          style={{ background: p.color }} title={p.name} />
      ))}
    </div>
  );
}
