import React from 'react';

interface AutoFixProgressProps {
  attempt: number;
  maxAttempts: number;
  fixedCount: number;
  totalCount: number;
  currentFile: string | null;
  status: 'fixing' | 'verifying' | 'complete' | 'failed';
  modifiedFiles: string[];
}

const STATUS_INFO: Record<string, { color: string; label: string }> = {
  fixing: { color: 'var(--vscode-progressBar-background)', label: 'Fixing errors...' },
  verifying: { color: 'var(--vscode-editorWarning-foreground)', label: 'Verifying fixes...' },
  complete: { color: 'var(--vscode-testing-iconPassed)', label: 'All errors fixed!' },
  failed: { color: 'var(--vscode-testing-iconFailed)', label: 'Some errors remain' },
};

const AutoFixProgress: React.FC<AutoFixProgressProps> = ({ attempt, maxAttempts, fixedCount, totalCount, currentFile, status, modifiedFiles }) => {
  const info = STATUS_INFO[status] || STATUS_INFO.fixing;
  const percentage = totalCount > 0 ? Math.round((fixedCount / totalCount) * 100) : 0;

  return (
    <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', padding: '12px', margin: '8px 0', backgroundColor: 'var(--vscode-editor-background)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '14px' }}>🔧</span>
        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--vscode-foreground)' }}>Auto-Fix</span>
        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: info.color, color: '#fff' }}>{info.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>Attempt {attempt}/{maxAttempts}</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: '4px', backgroundColor: 'var(--vscode-progressBar-background)', opacity: 0.2, borderRadius: '2px', marginBottom: '8px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percentage}%`, backgroundColor: info.color, borderRadius: '2px', transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginBottom: '6px' }}>
        Fixed {fixedCount}/{totalCount} errors ({percentage}%)
      </div>

      {currentFile && status === 'fixing' && (
        <div style={{ fontSize: '11px', color: 'var(--vscode-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
          Modifying: {currentFile}
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {status === 'verifying' && (
        <div style={{ fontSize: '11px', color: 'var(--vscode-editorWarning-foreground)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
          Re-running to verify fixes...
        </div>
      )}

      {modifiedFiles.length > 0 && (
        <details style={{ marginTop: '6px' }}>
          <summary style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)', cursor: 'pointer' }}>
            {modifiedFiles.length} file{modifiedFiles.length !== 1 ? 's' : ''} modified
          </summary>
          <div style={{ paddingLeft: '12px', marginTop: '4px' }}>
            {modifiedFiles.map((f, i) => (
              <div key={i} style={{ fontSize: '10px', color: 'var(--vscode-textLink-foreground)' }}>{f}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default AutoFixProgress;
