import React, { useState } from 'react';

interface ConflictDialogProps {
  conflict: { operationId: string; type: string; description: string; resolution: string | null };
  onResolve: (resolution: string) => void;
  onCancel: () => void;
}

const TYPE_INFO: Record<string, { label: string; color: string }> = {
  'already-exists': { label: 'File Exists', color: 'var(--vscode-editorWarning-foreground)' },
  'not-found': { label: 'Not Found', color: 'var(--vscode-testing-iconFailed)' },
  'modified-externally': { label: 'Modified Externally', color: 'var(--vscode-editorWarning-foreground)' },
  'locked': { label: 'File Locked', color: 'var(--vscode-testing-iconFailed)' },
  'circular-rename': { label: 'Circular Rename', color: 'var(--vscode-testing-iconFailed)' },
  'import-broken': { label: 'Import Will Break', color: 'var(--vscode-editorWarning-foreground)' },
};

const ConflictDialog: React.FC<ConflictDialogProps> = ({ conflict, onResolve, onCancel }) => {
  const [applyToAll, setApplyToAll] = useState(false);
  const info = TYPE_INFO[conflict.type] || { label: conflict.type, color: 'var(--vscode-foreground)' };

  const buttons: Array<{ label: string; value: string; color: string; show: boolean }> = [
    { label: 'Overwrite', value: 'overwrite', color: 'var(--vscode-editorWarning-foreground)', show: conflict.type === 'already-exists' || conflict.type === 'modified-externally' },
    { label: 'Skip', value: 'skip', color: 'var(--vscode-descriptionForeground)', show: true },
    { label: 'Create with New Name', value: 'rename_new', color: 'var(--vscode-textLink-foreground)', show: conflict.type === 'already-exists' },
    { label: 'Merge', value: 'merge', color: 'var(--vscode-textLink-activeForeground)', show: conflict.type === 'modified-externally' },
    { label: 'Abort Batch', value: 'abort', color: 'var(--vscode-testing-iconFailed)', show: conflict.type === 'circular-rename' || conflict.type === 'locked' },
  ];

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onCancel}>
      <div style={{ backgroundColor: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-panel-border)', borderRadius: '8px', padding: '20px', maxWidth: '420px', width: '90%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--vscode-foreground)' }}>File Conflict</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', backgroundColor: 'rgba(200,150,0,0.15)', color: info.color }}>{info.label}</span>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--vscode-foreground)', marginBottom: '16px', lineHeight: '1.5' }}>
          {conflict.description}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
          {buttons.filter(b => b.show).map(b => (
            <button key={b.value} onClick={() => onResolve(applyToAll ? `${b.value}:all` : b.value)} style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: b.value === 'abort' ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-button-secondaryBackground)', color: b.value === 'abort' ? '#fff' : 'var(--vscode-button-secondaryForeground)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {b.label}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', cursor: 'pointer' }}>
          <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} style={{ accentColor: 'var(--vscode-focusBorder)' }} />
          Apply to all similar conflicts
        </label>
      </div>
    </div>
  );
};

export default ConflictDialog;
