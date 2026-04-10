import React from 'react';
import clsx from 'clsx';

interface ProfileData {
  id: string;
  name: string;
  description: string;
}

interface ProfileSelectorProps {
  profiles: ProfileData[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ProfileSelector({ profiles, activeId, onSelect }: ProfileSelectorProps) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {profiles.map(p => (
        <button key={p.id} onClick={() => onSelect(p.id)}
          className={clsx('px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors border',
            activeId === p.id
              ? 'bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] border-[var(--ina-accent-primary,#3b82f6)]'
              : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]'
          )}
          title={p.description}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
