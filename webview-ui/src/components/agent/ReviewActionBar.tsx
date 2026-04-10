import React, { useState } from 'react';

interface ReviewProgress {
  total: number;
  decided: number;
  accepted: number;
  rejected: number;
  pending: number;
}

interface ReviewActionBarProps {
  progress: ReviewProgress;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onUndoAll: () => void;
  onFinalize: () => void;
  hasPending: boolean;
}

const ReviewActionBar: React.FC<ReviewActionBarProps> = ({
  progress,
  onAcceptAll,
  onRejectAll,
  onUndoAll,
  onFinalize,
  hasPending,
}) => {
  const [confirmAction, setConfirmAction] = useState<'acceptAll' | 'rejectAll' | 'undoAll' | null>(null);

  const handleAction = (action: 'acceptAll' | 'rejectAll' | 'undoAll') => {
    if (confirmAction === action) {
      if (action === 'acceptAll') onAcceptAll();
      else if (action === 'rejectAll') onRejectAll();
      else onUndoAll();
      setConfirmAction(null);
    } else {
      setConfirmAction(action);
    }
  };

  const pctAccepted = progress.total > 0 ? (progress.accepted / progress.total) * 100 : 0;
  const pctRejected = progress.total > 0 ? (progress.rejected / progress.total) * 100 : 0;

  return (
    <div style={{
      position: 'sticky', bottom: 0, left: 0, right: 0,
      padding: '8px 12px',
      backgroundColor: 'var(--vscode-editor-background)',
      borderTop: '1px solid var(--vscode-panel-border)',
      zIndex: 100,
    }}>
      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '11px' }}>
        <span style={{ color: 'var(--vscode-testing-iconPassed)', fontWeight: 600 }}>{progress.accepted} accepted</span>
        <span style={{ color: 'var(--vscode-descriptionForeground)' }}>·</span>
        <span style={{ color: 'var(--vscode-testing-iconFailed)', fontWeight: 600 }}>{progress.rejected} rejected</span>
        <span style={{ color: 'var(--vscode-descriptionForeground)' }}>·</span>
        <span style={{ color: 'var(--vscode-descriptionForeground)' }}>{progress.pending} pending</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--vscode-descriptionForeground)' }}>
          {progress.decided}/{progress.total}
        </span>
      </div>

      {/* Mini progress bar */}
      <div style={{
        height: '3px', borderRadius: '2px', marginBottom: '8px',
        backgroundColor: 'var(--vscode-textBlockQuote-background)',
        display: 'flex', overflow: 'hidden',
      }}>
        <div style={{ width: `${pctAccepted}%`, backgroundColor: 'var(--vscode-testing-iconPassed)', transition: 'width 0.3s' }} />
        <div style={{ width: `${pctRejected}%`, backgroundColor: 'var(--vscode-testing-iconFailed)', transition: 'width 0.3s' }} />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={() => handleAction('acceptAll')}
          style={{
            padding: '5px 12px', fontSize: '11px', fontWeight: 600,
            backgroundColor: 'var(--vscode-testing-iconPassed)', color: '#fff',
            border: 'none', borderRadius: '4px', cursor: 'pointer',
          }}
        >{confirmAction === 'acceptAll' ? 'Confirm Accept All?' : 'Accept All'}</button>

        <button
          onClick={() => handleAction('rejectAll')}
          style={{
            padding: '5px 12px', fontSize: '11px', fontWeight: 600,
            backgroundColor: 'transparent', color: 'var(--vscode-testing-iconFailed)',
            border: '1px solid var(--vscode-testing-iconFailed)',
            borderRadius: '4px', cursor: 'pointer',
          }}
        >{confirmAction === 'rejectAll' ? 'Confirm Reject All?' : 'Reject All'}</button>

        {progress.decided > 0 && (
          <button
            onClick={() => handleAction('undoAll')}
            style={{
              padding: '5px 12px', fontSize: '11px',
              backgroundColor: 'transparent', color: 'var(--vscode-editorWarning-foreground)',
              border: '1px solid var(--vscode-editorWarning-foreground)',
              borderRadius: '4px', cursor: 'pointer',
            }}
          >{confirmAction === 'undoAll' ? 'Confirm Undo All?' : 'Undo All'}</button>
        )}

        {confirmAction && (
          <button
            onClick={() => setConfirmAction(null)}
            style={{
              padding: '5px 8px', fontSize: '10px',
              backgroundColor: 'transparent', color: 'var(--vscode-descriptionForeground)',
              border: 'none', cursor: 'pointer',
            }}
          >Cancel</button>
        )}

        <span style={{ flex: 1 }} />

        <button
          onClick={onFinalize}
          disabled={hasPending}
          style={{
            padding: '6px 16px', fontSize: '12px', fontWeight: 600,
            backgroundColor: hasPending ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-button-background)',
            color: hasPending ? 'var(--vscode-button-secondaryForeground)' : 'var(--vscode-button-foreground)',
            border: 'none', borderRadius: '4px',
            cursor: hasPending ? 'not-allowed' : 'pointer',
            opacity: hasPending ? 0.6 : 1,
          }}
        >Finalize Review</button>
      </div>
    </div>
  );
};

export default ReviewActionBar;
