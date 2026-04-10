import React, { useState } from 'react';
import { postMessage } from '@/utils/vscode';

export interface FileOpEntryView {
  id: string;
  operation: string;
  sourcePath: string;
  targetPath: string | null;
  description: string;
  dependencies: string[];
}

export interface FileOpResultView {
  id: string;
  operation: string;
  success: boolean;
  sourcePath: string;
  targetPath: string | null;
  error: string | null;
  diff: { added: number; removed: number; changed: number } | null;
  duration: number;
}

interface FileOpItemProps {
  op: FileOpEntryView;
  result: FileOpResultView | null;
  onOpen?: () => void;
  onDiff?: () => void;
  onRevert?: () => void;
}

const OP_ICONS: Record<string, { icon: string; color: string }> = {
  create: { icon: '+', color: 'var(--vscode-testing-iconPassed)' },
  edit: { icon: '~', color: 'var(--vscode-textLink-foreground)' },
  delete: { icon: '−', color: 'var(--vscode-testing-iconFailed)' },
  rename: { icon: '→', color: 'var(--vscode-editorWarning-foreground)' },
  move: { icon: '→', color: 'var(--vscode-editorWarning-foreground)' },
  copy: { icon: '⊕', color: 'var(--vscode-descriptionForeground)' },
  create_folder: { icon: '📁', color: 'var(--vscode-descriptionForeground)' },
  patch: { icon: '⊿', color: 'var(--vscode-textLink-foreground)' },
  append: { icon: '▼', color: 'var(--vscode-textLink-foreground)' },
  prepend: { icon: '▲', color: 'var(--vscode-textLink-foreground)' },
  insert_at: { icon: '⤓', color: 'var(--vscode-textLink-foreground)' },
  replace_range: { icon: '⇄', color: 'var(--vscode-textLink-foreground)' },
};

const FileOpItem: React.FC<FileOpItemProps> = ({ op, result, onOpen, onDiff, onRevert }) => {
  const [expanded, setExpanded] = useState(result?.error != null);
  const opStyle = OP_ICONS[op.operation] || { icon: '?', color: 'var(--vscode-descriptionForeground)' };
  const success = result?.success;
  const failed = result && !result.success;
  const pending = !result;

  const dir = op.sourcePath.includes('/') ? op.sourcePath.substring(0, op.sourcePath.lastIndexOf('/') + 1) : '';
  const filename = op.sourcePath.includes('/') ? op.sourcePath.substring(op.sourcePath.lastIndexOf('/') + 1) : op.sourcePath;

  return (
    <div style={{ padding: '4px 8px', borderLeft: `3px solid ${failed ? 'var(--vscode-testing-iconFailed)' : success ? opStyle.color : 'var(--vscode-descriptionForeground)'}`, borderRadius: '3px', marginBottom: '2px', fontSize: '12px', backgroundColor: 'var(--vscode-editor-background)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span style={{ color: opStyle.color, fontWeight: 700, fontFamily: 'monospace', width: '16px', textAlign: 'center' }}>{opStyle.icon}</span>
        <span style={{ flex: 1 }}>
          <span style={{ color: 'var(--vscode-descriptionForeground)' }}>{dir}</span>
          <span style={{ color: 'var(--vscode-foreground)', fontWeight: 600, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onOpen?.(); }}>{filename}</span>
          {op.targetPath && <span style={{ color: 'var(--vscode-descriptionForeground)' }}> → {op.targetPath}</span>}
        </span>
        {result?.diff && (
          <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>
            <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>+{result.diff.added}</span>
            {' '}
            <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>-{result.diff.removed}</span>
          </span>
        )}
        {pending && <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>pending</span>}
        {success && <span style={{ color: 'var(--vscode-testing-iconPassed)', fontSize: '12px' }}>✓</span>}
        {failed && <span style={{ color: 'var(--vscode-testing-iconFailed)', fontSize: '12px' }}>✗</span>}
        {result?.duration != null && <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>{result.duration < 1000 ? `${result.duration}ms` : `${(result.duration / 1000).toFixed(1)}s`}</span>}
      </div>

      {expanded && (
        <div style={{ paddingLeft: '24px', marginTop: '4px' }}>
          <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>{op.description}</div>
          {result?.error && <div style={{ fontSize: '11px', color: 'var(--vscode-testing-iconFailed)', padding: '4px 6px', backgroundColor: 'rgba(200,0,0,0.1)', borderRadius: '3px', marginBottom: '4px' }}>{result.error}</div>}
          <div style={{ display: 'flex', gap: '6px' }}>
            {(op.operation === 'edit' || op.operation === 'patch') && onDiff && (
              <button onClick={onDiff} style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Diff</button>
            )}
            {result?.success && onRevert && (
              <button onClick={onRevert} style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'transparent', color: 'var(--vscode-editorWarning-foreground)', border: '1px solid var(--vscode-panel-border)', borderRadius: '3px', cursor: 'pointer' }}>Revert</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileOpItem;
