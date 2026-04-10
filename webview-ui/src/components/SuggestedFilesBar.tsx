/**
 * Phase 28 — Suggested Files Bar
 *
 * Shows auto-suggested relevant files as subtle chips below
 * the chat input. User can click to add as @file mention.
 */

import React, { memo } from 'react';
import { X } from 'lucide-react';

export interface SuggestedFile {
  relativePath: string;
  reason: 'import' | 'recent' | 'open' | 'related' | 'test';
  score: number;
}

interface Props {
  files: SuggestedFile[];
  onAddFile: (filePath: string) => void;
  onDismiss: () => void;
}

const reasonIcons: Record<string, string> = {
  import: '\u{1F4E6}',
  recent: '\u{1F552}',
  open: '\u{1F4C2}',
  related: '\u{1F517}',
  test: '\u{1F9EA}',
};

const reasonLabels: Record<string, string> = {
  import: 'Importiert',
  recent: 'Kürzlich',
  open: 'Offen',
  related: 'Verwandt',
  test: 'Test',
};

export const SuggestedFilesBar: React.FC<Props> = memo(({ files, onAddFile, onDismiss }) => {
  if (!files || files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 items-center px-3 py-1.5 border-t border-[var(--vscode-panel-border)]">
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-60 mr-1">Vorgeschlagen:</span>
      {files.map((file, i) => {
        const name = file.relativePath.split('/').pop() || file.relativePath;
        return (
          <button
            key={i}
            onClick={() => onAddFile(file.relativePath)}
            title={`${reasonLabels[file.reason] || file.reason}: ${file.relativePath} — Klicken zum Hinzufügen`}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border border-[var(--vscode-widget-border,rgba(255,255,255,0.12))] bg-[var(--vscode-badge-background,rgba(255,255,255,0.04))] text-[var(--vscode-badge-foreground)] hover:border-[var(--vscode-focusBorder)] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer transition-all"
          >
            <span>{reasonIcons[file.reason] || '\u{1F4C4}'}</span>
            <span className="max-w-[120px] truncate">{name}</span>
          </button>
        );
      })}
      <button
        onClick={onDismiss}
        title="Ausblenden"
        className="ml-auto p-0.5 text-[var(--vscode-descriptionForeground)] opacity-40 hover:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>
    </div>
  );
});

SuggestedFilesBar.displayName = 'SuggestedFilesBar';
