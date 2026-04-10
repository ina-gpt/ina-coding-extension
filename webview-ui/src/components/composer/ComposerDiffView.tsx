import React, { useMemo } from 'react';
import { Check, X, ExternalLink, Edit3 } from 'lucide-react';
import clsx from 'clsx';
import type { ComposerFileChange, DiffHunk, DiffLine } from '@/types';

interface ComposerDiffViewProps {
  fileChange: ComposerFileChange;
  mode: 'inline' | 'side-by-side';
  onAcceptHunk: (hunkIndex: number) => void;
  onRejectHunk: (hunkIndex: number) => void;
  onAcceptFile: () => void;
  onRejectFile: () => void;
  onEditContent?: () => void;
  onOpenInEditor?: () => void;
}

const RISK_LABEL: Record<string, string> = {
  low: '🟢 Low',
  medium: '🟡 Medium',
  high: '🔴 High',
};

const formatHunkHeader = (hunk: DiffHunk): string => {
  const o = hunk.endLineOriginal - hunk.startLineOriginal;
  const m = hunk.endLineModified - hunk.startLineModified;
  return `@@ -${hunk.startLineOriginal + 1},${o} +${hunk.startLineModified + 1},${m} @@`;
};

/** Build a side-by-side line list from hunks (mirrors ComposerDiffEngine.formatSideBySide) */
const buildSideBySide = (hunks: DiffHunk[]): { left: DiffLine[]; right: DiffLine[] } => {
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  hunks.forEach((hunk, hunkIndex) => {
    const removed = hunk.originalContent ? hunk.originalContent.split('\n') : [];
    const added = hunk.modifiedContent ? hunk.modifiedContent.split('\n') : [];
    const max = Math.max(removed.length, added.length);
    for (let i = 0; i < max; i++) {
      const r = removed[i];
      const a = added[i];
      if (r !== undefined && a !== undefined) {
        left.push({
          lineNumber: hunk.startLineOriginal + i + 1,
          content: r,
          type: 'modified',
          hunkIndex,
        });
        right.push({
          lineNumber: hunk.startLineModified + i + 1,
          content: a,
          type: 'modified',
          hunkIndex,
        });
      } else if (r !== undefined) {
        left.push({
          lineNumber: hunk.startLineOriginal + i + 1,
          content: r,
          type: 'removed',
          hunkIndex,
        });
        right.push({ lineNumber: 0, content: '', type: 'unchanged', hunkIndex });
      } else if (a !== undefined) {
        left.push({ lineNumber: 0, content: '', type: 'unchanged', hunkIndex });
        right.push({
          lineNumber: hunk.startLineModified + i + 1,
          content: a,
          type: 'added',
          hunkIndex,
        });
      }
    }
  });
  return { left, right };
};

const lineTypeBg = (t: DiffLine['type'], side: 'left' | 'right'): string => {
  if (t === 'added' && side === 'right') return 'bg-green-500/15';
  if (t === 'removed' && side === 'left') return 'bg-red-500/15';
  if (t === 'modified') return side === 'left' ? 'bg-red-500/10' : 'bg-green-500/10';
  return '';
};

export const ComposerDiffView: React.FC<ComposerDiffViewProps> = ({
  fileChange,
  mode,
  onAcceptHunk,
  onRejectHunk,
  onAcceptFile,
  onRejectFile,
  onEditContent,
  onOpenInEditor,
}) => {
  const { hunks } = fileChange.diff;
  const sideBySide = useMemo(() => buildSideBySide(hunks), [hunks]);

  return (
    <div className="flex flex-col h-full text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[var(--vscode-foreground)] font-sans">
            {fileChange.filePath}
          </span>
          {fileChange.risk && (
            <span className="text-[10px] flex-shrink-0">{RISK_LABEL[fileChange.risk]}</span>
          )}
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)] flex-shrink-0">
            <span className="text-green-400">+{fileChange.diff.linesAdded}</span>{' '}
            <span className="text-red-400">-{fileChange.diff.linesRemoved}</span>
          </span>
        </div>
      </div>

      {/* Diff body */}
      <div className="flex-1 overflow-auto">
        {hunks.length === 0 && (
          <div className="px-3 py-6 text-center text-[var(--vscode-descriptionForeground)]">
            No changes
          </div>
        )}

        {mode === 'side-by-side' && hunks.length > 0 && (
          <div className="grid grid-cols-2 gap-0">
            {/* LEFT (original) */}
            <div className="border-r border-[var(--vscode-panel-border)]">
              {sideBySide.left.map((line, i) => (
                <div
                  key={`l-${i}`}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-px whitespace-pre min-h-[18px]',
                    lineTypeBg(line.type, 'left'),
                    line.hunkIndex !== null &&
                      fileChange.hunkAccepted &&
                      fileChange.hunkAccepted[line.hunkIndex] === false &&
                      'opacity-40'
                  )}
                >
                  <span className="text-[10px] text-[var(--vscode-descriptionForeground)] w-8 text-right flex-shrink-0">
                    {line.lineNumber || ''}
                  </span>
                  <span className="flex-1">{line.content}</span>
                </div>
              ))}
            </div>
            {/* RIGHT (modified) */}
            <div>
              {sideBySide.right.map((line, i) => (
                <div
                  key={`r-${i}`}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-px whitespace-pre min-h-[18px]',
                    lineTypeBg(line.type, 'right'),
                    line.hunkIndex !== null &&
                      fileChange.hunkAccepted &&
                      fileChange.hunkAccepted[line.hunkIndex] === false &&
                      'opacity-40'
                  )}
                >
                  <span className="text-[10px] text-[var(--vscode-descriptionForeground)] w-8 text-right flex-shrink-0">
                    {line.lineNumber || ''}
                  </span>
                  <span className="flex-1">{line.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'inline' &&
          hunks.map((hunk, hunkIndex) => {
            const accepted = fileChange.hunkAccepted?.[hunkIndex] !== false;
            return (
              <div key={hunkIndex} className={clsx(!accepted && 'opacity-40')}>
                <div className="flex items-center justify-between px-2 py-1 bg-[var(--vscode-editor-lineHighlightBackground)] border-y border-[var(--vscode-panel-border)] text-[var(--vscode-descriptionForeground)] sticky top-0">
                  <span>{formatHunkHeader(hunk)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onAcceptHunk(hunkIndex)}
                      className="p-0.5 rounded hover:bg-green-500/20"
                      title="Accept hunk"
                    >
                      <Check size={11} className="text-green-400" />
                    </button>
                    <button
                      onClick={() => onRejectHunk(hunkIndex)}
                      className="p-0.5 rounded hover:bg-red-500/20"
                      title="Reject hunk"
                    >
                      <X size={11} className="text-red-400" />
                    </button>
                  </div>
                </div>
                {hunk.originalContent &&
                  hunk.originalContent.split('\n').map((l, i) => (
                    <div key={`o-${i}`} className="flex bg-red-500/10 whitespace-pre px-2 py-px">
                      <span className="w-3 text-red-400">-</span>
                      <span className="flex-1">{l}</span>
                    </div>
                  ))}
                {hunk.modifiedContent &&
                  hunk.modifiedContent.split('\n').map((l, i) => (
                    <div key={`m-${i}`} className="flex bg-green-500/10 whitespace-pre px-2 py-px">
                      <span className="w-3 text-green-400">+</span>
                      <span className="flex-1">{l}</span>
                    </div>
                  ))}
              </div>
            );
          })}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] font-sans">
        {onOpenInEditor && (
          <button
            onClick={onOpenInEditor}
            className="px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] flex items-center gap-1"
          >
            <ExternalLink size={11} />
            Open in editor
          </button>
        )}
        {onEditContent && (
          <button
            onClick={onEditContent}
            className="px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] flex items-center gap-1"
          >
            <Edit3 size={11} />
            Edit before accept
          </button>
        )}
        <button
          onClick={onRejectFile}
          className="px-2 py-1 text-[11px] rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center gap-1"
        >
          <X size={11} />
          Reject file
        </button>
        <button
          onClick={onAcceptFile}
          className="px-2 py-1 text-[11px] rounded bg-green-500/15 hover:bg-green-500/25 text-green-400 flex items-center gap-1"
        >
          <Check size={11} />
          Accept file
        </button>
      </div>
    </div>
  );
};

export default ComposerDiffView;
