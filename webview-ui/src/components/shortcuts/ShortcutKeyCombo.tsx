import React from 'react';
import { KeyboardKey } from './KeyboardKey';
import clsx from 'clsx';

interface ShortcutKeyComboProps {
  keys: string;
  platform?: string;
  isChord?: boolean;
  size?: 'sm' | 'md' | 'lg';
  isCustomized?: boolean;
  isDisabled?: boolean;
}

export function ShortcutKeyCombo({ keys, platform = 'mac', isChord = false, size = 'md', isCustomized = false, isDisabled = false }: ShortcutKeyComboProps) {
  // Platform-aware display
  let displayKeys = keys;
  if (platform !== 'mac') {
    displayKeys = displayKeys.replace(/Cmd/g, 'Ctrl');
  }

  // Split chord sequences: "Cmd+K Cmd+E" → ["Cmd+K", "Cmd+E"]
  const parts = displayKeys.split(/\s+/);

  return (
    <span className={clsx('inline-flex items-center gap-0.5 flex-shrink-0', isDisabled && 'opacity-40 line-through')}>
      {parts.map((part, pi) => {
        const keyParts = part.split('+');
        return (
          <React.Fragment key={pi}>
            {pi > 0 && <span className="text-[9px] text-[var(--vscode-descriptionForeground)] mx-0.5 italic">then</span>}
            {keyParts.map((k, ki) => (
              <React.Fragment key={ki}>
                {ki > 0 && <span className="text-[8px] text-[var(--vscode-descriptionForeground)]">+</span>}
                <KeyboardKey keyLabel={k} size={size} />
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      })}
      {isCustomized && (
        <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--ina-accent-primary,#3b82f6)]/10 text-[var(--ina-accent-primary,#3b82f6)] ml-1">
          custom
        </span>
      )}
    </span>
  );
}
