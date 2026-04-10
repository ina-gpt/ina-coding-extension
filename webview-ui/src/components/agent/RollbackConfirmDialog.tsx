import React from 'react';

interface RollbackConfirmDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  filesAffected: string[];
  rollbackType: 'all' | 'last';
}

const RollbackConfirmDialog: React.FC<RollbackConfirmDialogProps> = ({ onConfirm, onCancel, filesAffected, rollbackType }) => {
  const maxDisplay = 10;
  const displayFiles = filesAffected.slice(0, maxDisplay);
  const remaining = filesAffected.length - maxDisplay;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }} onClick={onCancel}>
      <div style={{
        backgroundColor: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-panel-border)',
        borderRadius: '8px', padding: '20px', maxWidth: '400px', width: '90%',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--vscode-foreground)' }}>
            {rollbackType === 'all' ? 'Rollback All Changes' : 'Rollback Last Step'}
          </span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '12px' }}>
          This will revert {rollbackType === 'all' ? 'all' : 'the last'} file changes. This action cannot be undone.
        </div>
        {displayFiles.length > 0 && (
          <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: 'var(--vscode-textBlockQuote-background)', borderRadius: '4px', fontSize: '11px' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--vscode-foreground)' }}>Files to revert:</div>
            {displayFiles.map((f, i) => (
              <div key={i} style={{ color: 'var(--vscode-descriptionForeground)', padding: '1px 0' }}>• {f}</div>
            ))}
            {remaining > 0 && <div style={{ color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>+{remaining} more</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '6px 16px', backgroundColor: 'transparent', color: 'var(--vscode-descriptionForeground)',
            border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '6px 16px', backgroundColor: 'var(--vscode-testing-iconFailed)', color: '#fff',
            border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
          }}>Confirm Rollback</button>
        </div>
      </div>
    </div>
  );
};

export default RollbackConfirmDialog;
