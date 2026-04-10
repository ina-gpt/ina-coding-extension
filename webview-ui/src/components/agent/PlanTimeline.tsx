import React from 'react';
import type { PlanStepData } from './PlanStepCard';

interface PlanTimelineProps {
  steps: PlanStepData[];
  currentStepIndex: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--vscode-descriptionForeground)',
  running: 'var(--vscode-progressBar-background)',
  executing: 'var(--vscode-progressBar-background)',
  completed: 'var(--vscode-testing-iconPassed)',
  failed: 'var(--vscode-testing-iconFailed)',
  skipped: 'var(--vscode-descriptionForeground)',
  rolling_back: 'var(--vscode-editorWarning-foreground)',
};

const PlanTimeline: React.FC<PlanTimelineProps> = ({ steps, currentStepIndex }) => {
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const failedCount = steps.filter((s) => s.status === 'failed').length;
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Progress bar */}
      <div
        style={{
          height: '4px',
          backgroundColor: 'var(--vscode-progressBar-background)',
          opacity: 0.2,
          borderRadius: '2px',
          marginBottom: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: failedCount > 0
              ? 'var(--vscode-testing-iconFailed)'
              : 'var(--vscode-progressBar-background)',
            borderRadius: '2px',
            transition: 'width 0.3s ease',
            opacity: 1,
          }}
        />
      </div>

      {/* Step dots */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
        {steps.map((step, i) => (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <div
              title={`Step ${i + 1}: ${step.description}`}
              style={{
                width: i === currentStepIndex ? '12px' : '8px',
                height: i === currentStepIndex ? '12px' : '8px',
                borderRadius: '50%',
                backgroundColor: STATUS_COLORS[step.status] || STATUS_COLORS.pending,
                opacity: step.status === 'pending' ? 0.4 : 1,
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                animation: (step.status === 'running' || step.status === 'executing') ? 'pulse 1.5s ease-in-out infinite' : 'none',
                boxShadow: (step.status === 'running' || step.status === 'executing') ? `0 0 6px ${STATUS_COLORS.running}` : 'none',
              }}
            />
            {i < steps.length - 1 && (
              <div
                style={{
                  width: '8px',
                  height: '1px',
                  backgroundColor: 'var(--vscode-descriptionForeground)',
                  opacity: 0.3,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'var(--vscode-descriptionForeground)',
          marginTop: '6px',
        }}
      >
        <span>
          {completedCount}/{steps.length} complete
        </span>
        {failedCount > 0 && (
          <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>
            {failedCount} failed
          </span>
        )}
      </div>
    </div>
  );
};

export default PlanTimeline;
