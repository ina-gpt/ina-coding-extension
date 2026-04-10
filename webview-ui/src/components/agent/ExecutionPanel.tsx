import React, { useMemo, useRef, useEffect } from 'react';
import { postMessage } from '@/utils/vscode';
import { useChatStore } from '@/store/chatStore';
import ExecutionStepItem from './ExecutionStepItem';
import type { StepExecutionView } from './ExecutionStepItem';
import RollbackConfirmDialog from './RollbackConfirmDialog';

const FileOpsPanel = React.lazy(() => import('./FileOpsPanel'));
const TerminalPanel = React.lazy(() => import('./TerminalPanel'));

type ExecutionState = 'idle' | 'executing' | 'paused' | 'failed' | 'completed' | 'rolling_back';

const STATE_COLORS: Record<ExecutionState, string> = {
  idle: 'var(--vscode-descriptionForeground)',
  executing: 'var(--vscode-progressBar-background)',
  paused: 'var(--vscode-editorWarning-foreground)',
  failed: 'var(--vscode-testing-iconFailed)',
  completed: 'var(--vscode-testing-iconPassed)',
  rolling_back: 'var(--vscode-editorWarning-foreground)',
};

const STATE_LABELS: Record<ExecutionState, string> = {
  idle: 'Idle',
  executing: 'Executing',
  paused: 'Paused',
  failed: 'Failed',
  completed: 'Completed',
  rolling_back: 'Rolling Back',
};

function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const ExecutionPanel: React.FC = () => {
  const executionState = useChatStore((s) => s.executionState) as ExecutionState;
  const executionProgress = useChatStore((s) => s.executionProgress) as {
    currentStepIndex: number;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    percentage: number;
    estimatedTimeRemaining: number | null;
  } | null;
  const stepExecutionsArray = useChatStore((s) => s.stepExecutions);
  const stepExecutions: Record<string, StepExecutionView> = {};
  if (stepExecutionsArray) {
    for (const e of stepExecutionsArray) {
      stepExecutions[e.stepId] = e;
    }
  }
  const agentPlan = useChatStore((s) => s.agentPlan) as {
    steps: { id: string; type: string; filePath: string; description: string; status: string }[];
  } | null;
  const showRollbackDialog = useChatStore((s) => s.showRollbackDialog) as boolean;
  const rollbackType = useChatStore((s) => s.rollbackType) as 'all' | 'last';

  const stepListRef = useRef<HTMLDivElement>(null);

  const steps = agentPlan?.steps || [];
  const progress = executionProgress;
  const stateColor = STATE_COLORS[executionState] || STATE_COLORS.idle;

  // Auto-scroll to active step
  useEffect(() => {
    if (executionState === 'executing' && stepListRef.current && progress) {
      const activeEl = stepListRef.current.children[progress.currentStepIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [executionState, progress?.currentStepIndex]);

  const affectedFiles = useMemo(() => {
    if (!stepExecutions) return [];
    const files: string[] = [];
    Object.values(stepExecutions).forEach((exec) => {
      if (exec.result?.filesChanged) {
        files.push(...exec.result.filesChanged);
      }
    });
    return [...new Set(files)];
  }, [stepExecutions]);

  const statsLine = useMemo(() => {
    if (!progress) return null;
    const parts: string[] = [];
    parts.push(`Step ${progress.currentStepIndex + 1}/${progress.totalSteps}`);
    if (progress.completedSteps > 0) {
      parts.push(`${progress.completedSteps} completed`);
    }
    if (progress.failedSteps > 0) {
      parts.push(`${progress.failedSteps} failed`);
    }
    if (progress.skippedSteps > 0) {
      parts.push(`${progress.skippedSteps} skipped`);
    }
    parts.push(`${progress.percentage}%`);
    if (progress.estimatedTimeRemaining != null && progress.estimatedTimeRemaining > 0) {
      parts.push(`~${formatTime(progress.estimatedTimeRemaining)} remaining`);
    }
    return parts.join(' \u2022 ');
  }, [progress]);

  if (executionState === 'idle' && steps.length === 0) {
    return null;
  }

  const handlePause = () => postMessage({ type: 'pauseExecution' });
  const handleResume = () => postMessage({ type: 'resumeExecution' });
  const handleCancel = () => postMessage({ type: 'cancelExecution' });
  const handleSkipStep = () => postMessage({ type: 'skipStep' });
  const handleRollbackAll = () => postMessage({ type: 'rollbackAll' });
  const handleRollbackLast = () => postMessage({ type: 'rollbackLast' });
  const handleRetryStep = (stepId: string) => postMessage({ type: 'retryStep', stepId });

  const handleRollbackConfirm = () => {
    if (rollbackType === 'all') {
      postMessage({ type: 'rollbackAll' });
    } else {
      postMessage({ type: 'rollbackLast' });
    }
  };

  const handleRollbackCancel = () => {
    useChatStore.getState().hideRollbackConfirm();
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '8px',
      padding: '10px', borderRadius: '6px',
      backgroundColor: 'var(--vscode-sideBar-background)',
      border: '1px solid var(--vscode-panel-border)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--vscode-foreground)' }}>
            Execution
          </span>
          <span style={{
            fontSize: '10px', padding: '1px 6px', borderRadius: '3px',
            backgroundColor: stateColor, color: '#fff', fontWeight: 600,
          }}>
            {STATE_LABELS[executionState]}
          </span>
        </div>
        {progress && (
          <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
            {progress.percentage}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      {progress && (
        <div style={{
          height: '4px', borderRadius: '2px',
          backgroundColor: 'var(--vscode-progressBar-background)',
          opacity: 0.2,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${progress.percentage}%`,
            backgroundColor: stateColor,
            opacity: 1,
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {/* Stats line */}
      {statsLine && (
        <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          {statsLine}
        </div>
      )}

      {/* Step list */}
      {steps.length > 0 && (
        <div ref={stepListRef} style={{
          maxHeight: '400px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '2px',
        }}>
          {steps.map((step, index) => {
            const execution = stepExecutions?.[step.id] || null;
            const isActive = progress?.currentStepIndex === index && executionState === 'executing';
            return (
              <ExecutionStepItem
                key={step.id}
                step={step}
                execution={execution}
                isActive={isActive}
                onRetry={() => handleRetryStep(step.id)}
                onSkip={handleSkipStep}
              />
            );
          })}
        </div>
      )}

      {/* Control buttons */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
        {executionState === 'executing' && (
          <>
            <button onClick={handlePause} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              border: 'none',
            }}>Pause</button>
            <button onClick={handleCancel} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'transparent',
              color: 'var(--vscode-descriptionForeground)',
              border: '1px solid var(--vscode-panel-border)',
            }}>Cancel</button>
          </>
        )}

        {executionState === 'paused' && (
          <>
            <button onClick={handleResume} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
            }}>Resume</button>
            <button onClick={handleSkipStep} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              border: 'none',
            }}>Skip Step</button>
            <button onClick={handleRollbackLast} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'transparent',
              color: 'var(--vscode-editorWarning-foreground)',
              border: '1px solid var(--vscode-editorWarning-foreground)',
            }}>Rollback Last</button>
            <button onClick={handleRollbackAll} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'transparent',
              color: 'var(--vscode-testing-iconFailed)',
              border: '1px solid var(--vscode-testing-iconFailed)',
            }}>Rollback All</button>
            <button onClick={handleCancel} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'transparent',
              color: 'var(--vscode-descriptionForeground)',
              border: '1px solid var(--vscode-panel-border)',
            }}>Cancel</button>
          </>
        )}

        {executionState === 'failed' && (
          <>
            <button onClick={handleRollbackAll} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'transparent',
              color: 'var(--vscode-testing-iconFailed)',
              border: '1px solid var(--vscode-testing-iconFailed)',
            }}>Rollback All</button>
            <button onClick={handleCancel} style={{
              padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
              backgroundColor: 'transparent',
              color: 'var(--vscode-descriptionForeground)',
              border: '1px solid var(--vscode-panel-border)',
            }}>Cancel</button>
          </>
        )}

        {executionState === 'rolling_back' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--vscode-editorWarning-foreground)' }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>↻</span>
            <span>Rolling back changes...</span>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {executionState === 'completed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <span style={{ fontSize: '12px', color: 'var(--vscode-testing-iconPassed)', fontWeight: 600 }}>
              ✓ Completed
            </span>
            <div style={{ flex: 1 }} />
            {affectedFiles.length > 0 && (
              <button onClick={handleRollbackAll} style={{
                padding: '4px 12px', fontSize: '11px', cursor: 'pointer', borderRadius: '3px',
                backgroundColor: 'transparent',
                color: 'var(--vscode-descriptionForeground)',
                border: '1px solid var(--vscode-panel-border)',
              }}>Rollback All</button>
            )}
          </div>
        )}
      </div>

      {/* File Operations Panel */}
      <React.Suspense fallback={null}>
        <FileOpsPanel />
      </React.Suspense>

      {/* Terminal Panel */}
      <React.Suspense fallback={null}>
        <TerminalPanel />
      </React.Suspense>

      {/* Rollback confirmation dialog */}
      {showRollbackDialog && (
        <RollbackConfirmDialog
          onConfirm={handleRollbackConfirm}
          onCancel={handleRollbackCancel}
          filesAffected={affectedFiles}
          rollbackType={rollbackType}
        />
      )}
    </div>
  );
};

export default ExecutionPanel;
