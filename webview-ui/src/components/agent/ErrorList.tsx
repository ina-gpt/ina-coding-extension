import React, { useState } from 'react';
import { postMessage } from '@/utils/vscode';

interface ParsedErrorView {
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  code: string | null;
  severity: 'error' | 'warning' | 'info';
  source: string;
  fixable: boolean;
  fixSuggestion: string | null;
}

interface ErrorListProps {
  errors: ParsedErrorView[];
  onAutoFix?: (errors: ParsedErrorView[]) => void;
}

const ErrorList: React.FC<ErrorListProps> = ({ errors, onAutoFix }) => {
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings' | 'fixable'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const filtered = errors.filter(e => {
    if (filter === 'errors') return e.severity === 'error';
    if (filter === 'warnings') return e.severity === 'warning';
    if (filter === 'fixable') return e.fixable;
    return true;
  });

  // Group by file
  const byFile = new Map<string, Array<ParsedErrorView & { idx: number }>>();
  filtered.forEach((e, i) => {
    const key = e.file || 'unknown';
    const arr = byFile.get(key) || [];
    arr.push({ ...e, idx: i });
    byFile.set(key, arr);
  });

  const fixableCount = errors.filter(e => e.fixable).length;

  const handleOpenFile = (file: string, line?: number | null) => {
    postMessage({ type: 'openFileAtLine', path: file, line: line || 1 } as any);
  };

  const toggleSelect = (idx: number) => {
    const next = new Set(selectedIds);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedIds(next);
  };

  const handleFixSelected = () => {
    const toFix = [...selectedIds].map(i => filtered[i]).filter(e => e?.fixable);
    if (toFix.length > 0 && onAutoFix) onAutoFix(toFix);
  };

  return (
    <div style={{ fontSize: '12px' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {(['all', 'errors', 'warnings', 'fixable'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '2px 8px', fontSize: '10px', borderRadius: '8px', cursor: 'pointer', border: 'none',
            backgroundColor: filter === f ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
            color: filter === f ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
          }}>
            {f === 'all' ? `All (${errors.length})` : f === 'errors' ? `Errors (${errors.filter(e => e.severity === 'error').length})` : f === 'warnings' ? `Warnings (${errors.filter(e => e.severity === 'warning').length})` : `Fixable (${fixableCount})`}
          </button>
        ))}
        {selectedIds.size > 0 && onAutoFix && (
          <button onClick={handleFixSelected} style={{ padding: '2px 8px', fontSize: '10px', borderRadius: '8px', cursor: 'pointer', border: 'none', backgroundColor: 'var(--vscode-textLink-foreground)', color: '#fff', marginLeft: 'auto' }}>
            Fix Selected ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Grouped errors */}
      {[...byFile.entries()].map(([file, fileErrors]) => (
        <div key={file} style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vscode-textLink-foreground)', cursor: 'pointer' }} onClick={() => handleOpenFile(file)}>
              {file}
            </span>
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '6px', backgroundColor: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>
              {fileErrors.length}
            </span>
          </div>
          {fileErrors.map((e) => (
            <div key={e.idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '3px 0 3px 12px', borderLeft: `2px solid ${e.severity === 'error' ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-editorWarning-foreground)'}` }}>
              {onAutoFix && e.fixable && (
                <input type="checkbox" checked={selectedIds.has(e.idx)} onChange={() => toggleSelect(e.idx)} style={{ marginTop: '2px', accentColor: 'var(--vscode-focusBorder)' }} />
              )}
              <span style={{ color: e.severity === 'error' ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-editorWarning-foreground)', fontSize: '11px' }}>
                {e.severity === 'error' ? '●' : '▲'}
              </span>
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '10px', cursor: 'pointer' }} onClick={() => e.file && handleOpenFile(e.file, e.line)}>
                  {e.line ? `${e.line}${e.column ? ':' + e.column : ''}` : ''}
                </span>
                {e.code && <span style={{ fontSize: '9px', padding: '0 4px', marginLeft: '4px', borderRadius: '4px', backgroundColor: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>{e.code}</span>}
                <div style={{ color: 'var(--vscode-foreground)', fontSize: '11px' }}>{e.message}</div>
                {e.fixSuggestion && <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '10px', fontStyle: 'italic' }}>{e.fixSuggestion}</div>}
              </div>
              {e.fixable && onAutoFix && (
                <span title="Auto-fix" onClick={() => onAutoFix([e])} style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--vscode-textLink-foreground)' }}>🔧</span>
              )}
            </div>
          ))}
        </div>
      ))}
      {filtered.length === 0 && <div style={{ color: 'var(--vscode-descriptionForeground)', textAlign: 'center', padding: '12px' }}>No matching errors</div>}

      {/* Auto-fix all button */}
      {fixableCount > 0 && onAutoFix && (
        <button onClick={() => onAutoFix(errors.filter(e => e.fixable))} style={{ width: '100%', padding: '6px', fontSize: '11px', backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '8px' }}>
          Auto-Fix {fixableCount} Error{fixableCount !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
};

export default ErrorList;
