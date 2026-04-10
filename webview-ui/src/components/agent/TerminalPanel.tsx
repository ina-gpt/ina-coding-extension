import React, { useState, useCallback } from 'react';
import TerminalOutput from './TerminalOutput';
import ErrorList from './ErrorList';
import AutoFixProgress from './AutoFixProgress';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';

const QUICK_COMMANDS = [
  { label: 'Install', category: 'install', icon: '📦' },
  { label: 'Build', category: 'build', icon: '🔨' },
  { label: 'Test', category: 'test', icon: '🧪' },
  { label: 'Lint', category: 'lint', icon: '🔍' },
  { label: 'Type Check', category: 'typecheck', icon: 'TS' },
  { label: 'Format', category: 'format', icon: '✨' },
];

const STATUS_COLORS: Record<string, string> = {
  queued: 'var(--vscode-descriptionForeground)',
  running: 'var(--vscode-progressBar-background)',
  completed: 'var(--vscode-testing-iconPassed)',
  failed: 'var(--vscode-testing-iconFailed)',
  timed_out: 'var(--vscode-testing-iconFailed)',
  cancelled: 'var(--vscode-descriptionForeground)',
  retrying: 'var(--vscode-editorWarning-foreground)',
};

const TerminalPanel: React.FC = () => {
  const terminalExecutions = useChatStore(s => s.terminalExecutions);
  const currentExecution = useChatStore(s => s.currentTerminalExecution);
  const outputLines = useChatStore(s => s.terminalOutputLines);
  const autoFixStatus = useChatStore(s => s.autoFixStatus);
  const parsedErrors = useChatStore(s => s.parsedErrors);
  const autoFixInProgress = useChatStore(s => s.autoFixInProgress);

  const [commandInput, setCommandInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const isRunning = currentExecution?.status === 'running';

  const handleRunCommand = () => {
    if (!commandInput.trim() || isRunning) return;
    postMessage({ type: 'runTerminalCommand', command: commandInput.trim() } as any);
    setCommandInput('');
  };

  const handleQuickCommand = (category: string) => {
    if (isRunning) return;
    postMessage({ type: 'runQuickCommand', category } as any);
  };

  const handleCancel = () => {
    if (currentExecution) {
      postMessage({ type: 'cancelTerminalCommand', executionId: currentExecution.id } as any);
    }
  };

  const handleAutoFix = useCallback((errors: any[]) => {
    postMessage({ type: 'triggerAutoFix', errors } as any);
  }, []);

  const handleRetry = (executionId: string) => {
    postMessage({ type: 'retryCommand', executionId } as any);
  };

  return (
    <div style={{ border: '1px solid var(--vscode-panel-border)', borderRadius: '6px', overflow: 'hidden', margin: '8px 0' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', backgroundColor: 'var(--vscode-sideBarSectionHeader-background)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px' }}>💻</span>
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--vscode-foreground)' }}>Terminal</span>
          {isRunning && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: 'var(--vscode-progressBar-background)', color: '#fff' }}>Running</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{ padding: '2px 6px', fontSize: '10px', backgroundColor: 'transparent', color: 'var(--vscode-descriptionForeground)', border: '1px solid var(--vscode-panel-border)', borderRadius: '3px', cursor: 'pointer' }}>
            History ({terminalExecutions.length})
          </button>
        </div>
      </div>

      <div style={{ padding: '8px 12px' }}>
        {/* Quick commands */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {QUICK_COMMANDS.map(qc => (
            <button key={qc.category} onClick={() => handleQuickCommand(qc.category)} disabled={isRunning} style={{
              padding: '4px 8px', fontSize: '10px', borderRadius: '4px', cursor: isRunning ? 'not-allowed' : 'pointer', border: 'none',
              backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)',
              opacity: isRunning ? 0.5 : 1,
            }}>
              {qc.icon} {qc.label}
            </button>
          ))}
        </div>

        {/* Command input */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <input
            type="text"
            value={commandInput}
            onChange={e => setCommandInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRunCommand()}
            placeholder="Enter command..."
            disabled={isRunning}
            style={{
              flex: 1, padding: '6px 8px', fontSize: '12px', fontFamily: 'var(--vscode-editor-font-family, monospace)',
              backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
              border: '1px solid var(--vscode-input-border)', borderRadius: '4px',
            }}
          />
          {isRunning ? (
            <button onClick={handleCancel} style={{ padding: '6px 12px', fontSize: '11px', backgroundColor: 'var(--vscode-testing-iconFailed)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
          ) : (
            <button onClick={handleRunCommand} disabled={!commandInput.trim()} style={{ padding: '6px 12px', fontSize: '11px', backgroundColor: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: '4px', cursor: commandInput.trim() ? 'pointer' : 'not-allowed', opacity: commandInput.trim() ? 1 : 0.5 }}>Run</button>
          )}
        </div>

        {/* Live output */}
        {(isRunning || outputLines.length > 0) && (
          <TerminalOutput lines={outputLines} isRunning={isRunning} />
        )}

        {/* Parsed errors */}
        {parsedErrors.length > 0 && !isRunning && (
          <div style={{ marginTop: '8px' }}>
            <ErrorList errors={parsedErrors as any} onAutoFix={handleAutoFix} />
          </div>
        )}

        {/* Auto-fix progress */}
        {autoFixInProgress && autoFixStatus && (
          <AutoFixProgress
            attempt={autoFixStatus.attempt || 1}
            maxAttempts={autoFixStatus.maxAttempts || 3}
            fixedCount={autoFixStatus.fixedCount || 0}
            totalCount={autoFixStatus.totalCount || 0}
            currentFile={autoFixStatus.currentFile || null}
            status={autoFixStatus.status || 'fixing'}
            modifiedFiles={autoFixStatus.modifiedFiles || []}
          />
        )}

        {/* History */}
        {showHistory && terminalExecutions.length > 0 && (
          <div style={{ marginTop: '8px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vscode-descriptionForeground)', marginBottom: '4px' }}>Recent Commands</div>
            {terminalExecutions.slice(-10).reverse().map((exec, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', fontSize: '11px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: STATUS_COLORS[exec.status] || STATUS_COLORS.queued }} />
                <span style={{ flex: 1, fontFamily: 'monospace', color: 'var(--vscode-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exec.command?.command || 'unknown'}</span>
                {exec.endTime && exec.startTime && <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>{((exec.endTime - exec.startTime) / 1000).toFixed(1)}s</span>}
                <button onClick={() => handleRetry(exec.id)} style={{ padding: '1px 6px', fontSize: '9px', backgroundColor: 'transparent', color: 'var(--vscode-descriptionForeground)', border: '1px solid var(--vscode-panel-border)', borderRadius: '3px', cursor: 'pointer' }}>↻</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalPanel;
