import React, { useMemo, memo, useState } from 'react';
import { diffLines, type Change } from 'diff';
import { Check, X, FileText, Plus, Minus, Equal } from 'lucide-react';
import clsx from 'clsx';

interface DiffViewProps {
  originalCode: string;
  modifiedCode: string;
  filename: string;
  language: string;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLine?: number;
  newLine?: number;
}

const DiffLineRow: React.FC<{ line: DiffLine }> = memo(({ line }) => {
  const bg = { added: 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.1))]', removed: 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.1))]', unchanged: '' };
  const fg = { added: 'text-[var(--ina-status-success,#4ade80)]', removed: 'text-[var(--ina-status-error,#f87171)]', unchanged: '' };
  const sym = { added: '+', removed: '-', unchanged: ' ' };

  return (
    <div className={clsx('flex font-mono text-sm', bg[line.type])}>
      <div className={clsx('w-12 flex-shrink-0 px-2 py-0.5 text-right select-none border-r border-[var(--vscode-panel-border)] text-xs', fg[line.type] || 'text-[var(--vscode-editorLineNumber-foreground)]')}>
        {line.oldLine || ''}
      </div>
      <div className={clsx('w-12 flex-shrink-0 px-2 py-0.5 text-right select-none border-r border-[var(--vscode-panel-border)] text-xs', fg[line.type] || 'text-[var(--vscode-editorLineNumber-foreground)]')}>
        {line.newLine || ''}
      </div>
      <div className={clsx('w-6 flex-shrink-0 px-1 py-0.5 text-center select-none font-bold', fg[line.type])}>
        {sym[line.type]}
      </div>
      <div className={clsx('flex-1 py-0.5 px-2 whitespace-pre overflow-x-auto', fg[line.type])}>
        {line.content}
      </div>
    </div>
  );
});
DiffLineRow.displayName = 'DiffLineRow';

export const DiffView: React.FC<DiffViewProps> = memo(({ originalCode, modifiedCode, filename, language, onAccept, onReject, onClose }) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const { lines, stats } = useMemo(() => {
    const changes = diffLines(originalCode, modifiedCode);
    const result: DiffLine[] = [];
    let oldLine = 1, newLine = 1, adds = 0, dels = 0, same = 0;

    changes.forEach((change: Change) => {
      const content = change.value.replace(/\n$/, '');
      content.split('\n').forEach(line => {
        if (change.added) { result.push({ type: 'added', content: line, newLine: newLine++ }); adds++; }
        else if (change.removed) { result.push({ type: 'removed', content: line, oldLine: oldLine++ }); dels++; }
        else { result.push({ type: 'unchanged', content: line, oldLine: oldLine++, newLine: newLine++ }); same++; }
      });
    });

    return { lines: result, stats: { additions: adds, deletions: dels, unchanged: same } };
  }, [originalCode, modifiedCode]);

  const hasChanges = stats.additions > 0 || stats.deletions > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-[var(--vscode-editor-background)] rounded-lg border border-[var(--vscode-panel-border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-[var(--vscode-descriptionForeground)]" />
            <div><h3 className="font-medium text-sm">Review Changes</h3><p className="text-xs text-[var(--vscode-descriptionForeground)]">{filename}</p></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-[var(--ina-status-success,#4ade80)]"><Plus size={12} />{stats.additions}</span>
              <span className="flex items-center gap-1 text-[var(--ina-status-error,#f87171)]"><Minus size={12} />{stats.deletions}</span>
              <span className="flex items-center gap-1 text-[var(--vscode-descriptionForeground)]"><Equal size={12} />{stats.unchanged}</span>
            </div>
            <div className="flex bg-[var(--vscode-input-background)] rounded overflow-hidden border border-[var(--vscode-input-border)]">
              {(['unified', 'split'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={clsx('px-3 py-1 text-xs transition-colors capitalize', viewMode === m ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]')}>
                  {m}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"><X size={18} /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {!hasChanges ? (
            <div className="flex items-center justify-center h-full text-[var(--vscode-descriptionForeground)]">No changes detected</div>
          ) : viewMode === 'unified' ? (
            <div className="min-w-fit">{lines.map((line, i) => <DiffLineRow key={i} line={line} />)}</div>
          ) : (
            <div className="flex h-full">
              {[{ label: 'Original', code: originalCode, color: 'red' }, { label: 'Modified', code: modifiedCode, color: 'green' }].map(side => (
                <div key={side.label} className="flex-1 border-r border-[var(--vscode-panel-border)] last:border-r-0 overflow-auto">
                  <div className={`sticky top-0 px-3 py-1.5 bg-${side.color}-500/10 text-xs font-medium text-${side.color}-400 border-b border-[var(--vscode-panel-border)]`}>{side.label}</div>
                  <div className="font-mono text-sm">{side.code.split('\n').map((line, i) => (
                    <div key={i} className="flex"><div className="w-10 flex-shrink-0 px-2 py-0.5 text-right text-[var(--vscode-editorLineNumber-foreground)] select-none border-r border-[var(--vscode-panel-border)] text-xs">{i + 1}</div><div className="flex-1 py-0.5 px-2 whitespace-pre overflow-x-auto">{line}</div></div>
                  ))}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
          <p className="text-xs text-[var(--vscode-descriptionForeground)]">Review changes before applying</p>
          <div className="flex items-center gap-2">
            <button onClick={onReject} className="flex items-center gap-2 px-4 py-2 text-sm bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-input-border)] rounded transition-colors"><X size={16} />Reject</button>
            <button onClick={onAccept} disabled={!hasChanges} className={clsx('flex items-center gap-2 px-4 py-2 text-sm rounded transition-colors', hasChanges ? 'bg-[var(--ina-status-success,#16a34a)] hover:opacity-90 text-[var(--ina-accent-primary-text,#fff)]' : 'bg-gray-600 text-gray-400 cursor-not-allowed')}><Check size={16} />Accept</button>
          </div>
        </div>
      </div>
    </div>
  );
});

DiffView.displayName = 'DiffView';
