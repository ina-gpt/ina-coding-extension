import React from 'react';

interface UndoConfirmDialogProps {
  scope: 'all' | 'single_file' | 'single_hunk';
  filesAffected: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

const SCOPE_MESSAGES: Record<string, string> = {
  all: 'This will undo all review decisions and reset all changes to pending.',
  single_file: 'This will undo the review decision for this file and reset it to pending.',
  single_hunk: 'This will undo the review decision for this hunk and reset it to pending.',
};

const UndoConfirmDialog: React.FC<UndoConfirmDialogProps> = ({
  scope,
  filesAffected,
  onConfirm,
  onCancel,
}) => {
  const maxDisplay = 15;
  const displayFiles = filesAffected.slice(0, maxDisplay);
  const remaining = filesAffected.length - maxDisplay;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '8px', padding: '20px',
          maxWidth: '420px', width: '90%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '20px' }}>&#9888;&#65039;</span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--vscode-foreground)' }}>
            Undo {scope === 'all' ? 'All Decisions' : scope === 'single_file' ? 'File Decision' : 'Hunk Decision'}
          </span>
        </div>

        <div style={{
          fontSize: '12px', color: 'var(--vscode-descriptionForeground)', marginBottom: '12px',
        }}>
          {SCOPE_MESSAGES[scope]}
        </div>

        {displayFiles.length > 0 && (
          <div style={{
            marginBottom: '12px', padding: '8px',
            backgroundColor: 'var(--vscode-textBlockQuote-background)',
            borderRadius: '4px', fontSize: '11px',
            maxHeight: '200px', overflowY: 'auto',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--vscode-foreground)' }}>
              Affected files:
            </div>
            {displayFiles.map((f, i) => (
              <div key={i} style={{ color: 'var(--vscode-descriptionForeground)', padding: '1px 0' }}>
                &#8226; {f}
              </div>
            ))}
            {remaining > 0 && (
              <div style={{ color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
                +{remaining} more
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 16px',
              backgroundColor: 'transparent',
              color: 'var(--vscode-descriptionForeground)',
              border: '1px solid var(--vscode-panel-border)',
              borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
            }}
          >Cancel</button>
          <button
            onClick={onConfirm}
            style={{
              padding: '6px 16px',
              backgroundColor: 'var(--vscode-editorWarning-foreground)',
              color: '#fff',
              border: 'none', borderRadius: '4px',
              cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            }}
          >Confirm Undo</button>
        </div>
      </div>
    </div>
  );
};

export default UndoConfirmDialog;
