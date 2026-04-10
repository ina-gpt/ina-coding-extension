import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

interface ChangelogEntryView {
  type: 'feature' | 'fix' | 'improvement';
  title: string;
  description: string;
}

interface WhatsNewDialogProps {
  changelog: ChangelogEntryView[];
  version: string;
  onDismiss: () => void;
}

const TYPE_BADGES: Record<string, { label: string; icon: string; cls: string }> = {
  feature: { label: 'New', icon: '🆕', cls: 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.15))] text-[var(--ina-status-success,#22c55e)]' },
  fix: { label: 'Fix', icon: '🔧', cls: 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.15))] text-[var(--ina-status-error,#ef4444)]' },
  improvement: { label: 'Better', icon: '⚡', cls: 'bg-[var(--ina-status-info-bg,rgba(59,130,246,0.15))] text-[var(--ina-status-info,#3b82f6)]' },
};

export function WhatsNewDialog({ changelog, version, onDismiss }: WhatsNewDialogProps) {
  const features = changelog.filter(e => e.type === 'feature');
  const improvements = changelog.filter(e => e.type === 'improvement');
  const fixes = changelog.filter(e => e.type === 'fix');
  const sorted = [...features, ...improvements, ...fixes];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div>
            <h3 className="font-semibold text-sm">What's New in INA Coding</h3>
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">v{version}</span>
          </div>
          <button onClick={onDismiss} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">
            <X size={16} />
          </button>
        </div>

        {/* Entries */}
        <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
          {sorted.map((entry, i) => {
            const badge = TYPE_BADGES[entry.type] || TYPE_BADGES.improvement;
            return (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-[var(--vscode-input-background)]">
                <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0', badge.cls)}>
                  {badge.icon} {badge.label}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-medium">{entry.title}</div>
                  <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">{entry.description}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--vscode-panel-border)] flex items-center justify-between">
          <button onClick={onDismiss}
            className="px-4 py-2 rounded-lg bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] text-xs font-medium hover:opacity-90 transition-opacity">
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
