import React, { useState } from 'react';
import { postMessage } from '@/utils/vscode';

export interface StepExecutionView {
  stepId: string;
  status: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  retryCount: number;
  output: string[];
  error: { message: string; code: string; recoverable: boolean; suggestion: string | null } | null;
  result: { success: boolean; filesChanged: string[]; output: string; warnings: string[] } | null;
}

interface ExecutionStepItemProps {
  step: { id: string; type: string; filePath: string; description: string; status: string };
  execution: StepExecutionView | null;
  isActive: boolean;
  onRetry?: () => void;
  onSkip?: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  create: '📄', edit: '✏️', delete: '🗑️', rename: '📝', move: '📦', terminal: '💻', test: '🧪',
};

const STATUS_STYLES: Record<string, { color: string; icon: string }> = {
  idle: { color: 'var(--vscode-descriptionForeground)', icon: '○' },
  pending: { color: 'var(--vscode-descriptionForeground)', icon: '○' },
  preparing: { color: 'var(--vscode-descriptionForeground)', icon: '○' },
  executing: { color: 'var(--vscode-progressBar-background)', icon: '◉' },
  completed: { color: 'var(--vscode-testing-iconPassed)', icon: '✓' },
  failed: { color: 'var(--vscode-testing-iconFailed)', icon: '✗' },
  skipped: { color: 'var(--vscode-descriptionForeground)', icon: '—' },
  rolling_back: { color: 'var(--vscode-editorWarning-foreground)', icon: '↺' },
};

const ExecutionStepItem: React.FC<ExecutionStepItemProps> = ({ step, execution, isActive, onRetry, onSkip }) => {
  const [expanded, setExpanded] = useState(isActive || execution?.status === 'failed');
  const status = execution?.status || step.status || 'pending';
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const typeIcon = TYPE_ICONS[step.type] || '📋';
  const duration = execution?.duration;

  return (
    <div style={{
      padding: '6px 10px',
      borderLeft: `3px solid ${style.color}`,
      backgroundColor: isActive ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-editor-background)',
      borderRadius: '4px',
      marginBottom: '3px',
      fontSize: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span style={{ color: style.color, fontWeight: 700, fontSize: '13px' }}>{style.icon}</span>
        <span>{typeIcon}</span>
        <span style={{ flex: 1, color: status === 'skipped' ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-foreground)', textDecoration: status === 'skipped' ? 'line-through' : 'none' }}>
          {step.description}
        </span>
        {execution?.retryCount ? (
          <span style={{ fontSize: '10px', color: 'var(--vscode-editorWarning-foreground)' }}>
            Attempt {execution.retryCount + 1}
          </span>
        ) : null}
        {duration != null && (
          <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>
            {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
          </span>
        )}
        {status === 'executing' && (
          <span style={{ fontSize: '10px', color: style.color }}>running...</span>
        )}
        <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>{expanded ? '▼' : '▶'}</span>
      </div>

      {step.filePath && (
        <div style={{ fontSize: '11px', color: 'var(--vscode-textLink-foreground)', cursor: 'pointer', marginTop: '2px', paddingLeft: '28px' }}
          onClick={() => postMessage({ type: 'openFile', path: step.filePath })}>
          {step.filePath}
        </div>
      )}

      {expanded && execution?.error && (
        <div style={{ margin: '6px 0 4px 28px', padding: '6px 8px', backgroundColor: 'rgba(200,0,0,0.1)', borderRadius: '4px', fontSize: '11px' }}>
          <div style={{ color: 'var(--vscode-testing-iconFailed)', fontWeight: 600 }}>{execution.error.message}</div>
          {execution.error.suggestion && (
            <div style={{ color: 'var(--vscode-descriptionForeground)', marginTop: '2px' }}>Suggestion: {execution.error.suggestion}</div>
          )}
          {(onRetry || onSkip) && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              {onRetry && execution.error.recoverable && (
                <button onClick={onRetry} style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Retry</button>
              )}
              {onSkip && (
                <button onClick={onSkip} style={{ padding: '2px 8px', fontSize: '10px', backgroundColor: 'transparent', color: 'var(--vscode-descriptionForeground)', border: '1px solid var(--vscode-panel-border)', borderRadius: '3px', cursor: 'pointer' }}>Skip</button>
              )}
            </div>
          )}
        </div>
      )}

      {expanded && execution?.output && execution.output.length > 0 && (
        <div style={{ margin: '4px 0 0 28px', padding: '4px 8px', backgroundColor: 'var(--vscode-terminal-background)', borderRadius: '4px', fontSize: '10px', fontFamily: 'var(--vscode-editor-font-family)', color: 'var(--vscode-terminal-foreground)', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {execution.output.slice(-20).join('\n')}
        </div>
      )}
    </div>
  );
};

export default ExecutionStepItem;
