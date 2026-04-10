import React from 'react';
import { Shield, Lock, Home, Ban, Check } from 'lucide-react';
import clsx from 'clsx';

interface PrivacyModeSelectorProps {
  currentMode: string;
  onSelect: (mode: string) => void;
}

const MODES = [
  { id: 'standard', label: 'Standard', icon: Shield, desc: 'Full features, data on your self-hosted server', features: ['All features', 'Server AI model', 'Memory extraction', 'Code indexing'] },
  { id: 'strict', label: 'Strict', icon: Lock, desc: 'Enhanced privacy: no memory extraction, no analytics', features: ['AI Chat', 'Inline Edit', 'Completion', 'No auto-memory'] },
  { id: 'local_only', label: 'Local Only', icon: Home, desc: 'No server communication. Local model only.', features: ['Local AI only', 'Offline search', 'Git/LSP local', 'No indexing'] },
  { id: 'air_gapped', label: 'Air Gapped', icon: Ban, desc: 'Absolute zero network. Complete isolation.', features: ['Local AI only', 'No network', 'No health checks', 'Maximum privacy'] },
];

export function PrivacyModeSelector({ currentMode, onSelect }: PrivacyModeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {MODES.map(m => {
        const Icon = m.icon;
        const isActive = currentMode === m.id;
        return (
          <button key={m.id} onClick={() => onSelect(m.id)}
            className={clsx('p-3 rounded-lg border text-left text-xs transition-colors',
              isActive ? 'border-[var(--ina-accent-primary,#3b82f6)] bg-[var(--ina-accent-primary,#3b82f6)]/10' : 'border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]')}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} />
              <span className="font-semibold">{m.label}</span>
              {isActive && <Check size={12} className="text-[var(--ina-accent-primary,#3b82f6)]" />}
            </div>
            <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-2">{m.desc}</div>
            <div className="space-y-0.5">
              {m.features.map((f, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px] text-[var(--vscode-descriptionForeground)]">
                  <span>{m.id === 'standard' || (m.id === 'strict' && i < 3) ? '✓' : i < 2 ? '✓' : '✗'}</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
