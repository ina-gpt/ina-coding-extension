import React, { memo, useMemo } from 'react';
import {
  Check,
  X,
  FileCode,
  Plus,
  Minus,
  ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';
import { postMessage } from '@/utils/vscode';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DiffHunk {
  id: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffHunkLine[];
}

export interface DiffHunkLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface FileDiffData {
  hunks: DiffHunk[];
  linesAdded: number;
  linesRemoved: number;
}

interface ShadowFileDiffProps {
  diff: FileDiffData;
  filePath: string;
  onAccept: () => void;
  onReject: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const lineBg: Record<DiffHunkLine['type'], string> = {
  add: 'bg-green-900/20',
  remove: 'bg-red-900/20',
  context: '',
};

const lineFg: Record<DiffHunkLine['type'], string> = {
  add: 'text-green-400',
  remove: 'text-red-400',
  context: 'text-[var(--vscode-editor-foreground)]',
};

const lineSymbol: Record<DiffHunkLine['type'], string> = {
  add: '+',
  remove: '-',
  context: ' ',
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const DiffLineRow: React.FC<{ line: DiffHunkLine }> = memo(({ line }) => (
  <div className={clsx('flex font-mono text-xs leading-5', lineBg[line.type])}>
    {/* Old line number */}
    <span
      className={clsx(
        'w-11 flex-shrink-0 px-1 text-right select-none border-r',
        'border-[var(--vscode-panel-border)]',
        'text-[var(--vscode-editorLineNumber-foreground)]',
      )}
    >
      {line.oldLineNo ?? ''}
    </span>
    {/* New line number */}
    <span
      className={clsx(
        'w-11 flex-shrink-0 px-1 text-right select-none border-r',
        'border-[var(--vscode-panel-border)]',
        'text-[var(--vscode-editorLineNumber-foreground)]',
      )}
    >
      {line.newLineNo ?? ''}
    </span>
    {/* Symbol */}
    <span
      className={clsx(
        'w-5 flex-shrink-0 text-center select-none font-bold',
        lineFg[line.type],
      )}
    >
      {lineSymbol[line.type]}
    </span>
    {/* Content */}
    <span
      className={clsx(
        'flex-1 px-2 whitespace-pre overflow-x-auto',
        lineFg[line.type],
      )}
    >
      {line.content}
    </span>
  </div>
));
DiffLineRow.displayName = 'DiffLineRow';

const HunkHeader: React.FC<{ hunk: DiffHunk }> = memo(({ hunk }) => (
  <div
    className={clsx(
      'flex items-center gap-2 px-3 py-1 font-mono text-xs',
      'bg-[var(--vscode-diffEditor-insertedTextBackground,rgba(56,139,253,0.1))]',
      'text-[var(--vscode-descriptionForeground)]',
      'border-y border-[var(--vscode-panel-border)]',
    )}
  >
    <span>
      @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
    </span>
  </div>
));
HunkHeader.displayName = 'HunkHeader';

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const ShadowFileDiff: React.FC<ShadowFileDiffProps> = memo(
  ({ diff, filePath, onAccept, onReject }) => {
    const totalLines = useMemo(
      () => diff.hunks.reduce((sum, h) => sum + h.lines.length, 0),
      [diff.hunks],
    );

    const handleOpenInDiffEditor = () => {
      postMessage({ type: 'openShadowDiffEditor', filePath });
    };

    return (
      <div className="border border-[var(--vscode-panel-border)] rounded-md overflow-hidden bg-[var(--vscode-editor-background)]">
        {/* Diff header */}
        <div
          className={clsx(
            'flex items-center justify-between px-3 py-2',
            'bg-[var(--vscode-sideBar-background)]',
            'border-b border-[var(--vscode-panel-border)]',
          )}
        >
          <div className="flex items-center gap-2 text-xs">
            <FileCode
              size={14}
              className="text-[var(--vscode-descriptionForeground)]"
            />
            <span className="font-medium text-[var(--vscode-editor-foreground)]">
              {filePath}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-400">
              <Plus size={12} />
              {diff.linesAdded}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <Minus size={12} />
              {diff.linesRemoved}
            </span>
          </div>
        </div>

        {/* Hunks */}
        <div className="max-h-[500px] overflow-auto">
          {totalLines === 0 ? (
            <div className="flex items-center justify-center py-6 text-xs text-[var(--vscode-descriptionForeground)]">
              No diff content available
            </div>
          ) : (
            diff.hunks.map((hunk) => (
              <div key={hunk.id}>
                <HunkHeader hunk={hunk} />
                <div className="min-w-fit">
                  {hunk.lines.map((line, idx) => (
                    <DiffLineRow key={`${hunk.id}-${idx}`} line={line} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        <div
          className={clsx(
            'flex items-center justify-between px-3 py-2',
            'bg-[var(--vscode-sideBar-background)]',
            'border-t border-[var(--vscode-panel-border)]',
          )}
        >
          <button
            onClick={handleOpenInDiffEditor}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded',
              'text-[var(--vscode-textLink-foreground)]',
              'hover:bg-[var(--vscode-list-hoverBackground)]',
              'transition-colors',
            )}
          >
            <ExternalLink size={13} />
            Open in Diff Editor
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onReject}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded',
                'bg-[var(--vscode-input-background)]',
                'hover:bg-[var(--vscode-list-hoverBackground)]',
                'border border-[var(--vscode-input-border)]',
                'transition-colors',
              )}
            >
              <X size={13} />
              Reject File
            </button>
            <button
              onClick={onAccept}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded',
                'bg-[var(--ina-status-success,#16a34a)]',
                'text-[var(--ina-accent-primary-text,#fff)]',
                'hover:opacity-90',
                'transition-colors',
              )}
            >
              <Check size={13} />
              Accept File
            </button>
          </div>
        </div>
      </div>
    );
  },
);

ShadowFileDiff.displayName = 'ShadowFileDiff';
export default ShadowFileDiff;
