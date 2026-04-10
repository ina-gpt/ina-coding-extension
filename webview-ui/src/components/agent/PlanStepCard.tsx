import React from 'react';

export interface PlanStepData {
  id: string;
  type: string;
  filePath: string;
  description: string;
  status: string;
  risk?: string;
  dependencies?: string[];
  details?: string;
  targetPath?: string | null;
}

interface PlanStepCardProps {
  step: PlanStepData;
  index: number;
  isActive: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  create: '📄',
  edit: '✏️',
  delete: '🗑️',
  rename: '📝',
  move: '📦',
  terminal: '💻',
  test: '🧪',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--vscode-descriptionForeground)',
  running: 'var(--vscode-progressBar-background)',
  completed: 'var(--vscode-testing-iconPassed)',
  failed: 'var(--vscode-testing-iconFailed)',
  skipped: 'var(--vscode-descriptionForeground)',
};

const RISK_LABELS: Record<string, { text: string; color: string }> = {
  low: { text: 'Low', color: 'var(--vscode-testing-iconPassed)' },
  medium: { text: 'Med', color: 'var(--vscode-editorWarning-foreground)' },
  high: { text: 'High', color: 'var(--vscode-testing-iconFailed)' },
};

const PlanStepCard: React.FC<PlanStepCardProps> = ({ step, index, isActive }) => {
  const icon = TYPE_ICONS[step.type] || '📋';
  const statusColor = STATUS_COLORS[step.status] || STATUS_COLORS.pending;
  const riskInfo = step.risk ? RISK_LABELS[step.risk] : null;

  return (
    <div
      style={{
        padding: '8px 12px',
        borderLeft: `3px solid ${statusColor}`,
        backgroundColor: isActive
          ? 'var(--vscode-list-activeSelectionBackground)'
          : 'var(--vscode-editor-background)',
        borderRadius: '4px',
        marginBottom: '4px',
        fontSize: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <span style={{ fontSize: '14px' }}>{icon}</span>
        <span style={{ fontWeight: 600, color: 'var(--vscode-foreground)' }}>
          Step {index + 1}
        </span>
        <span
          style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '8px',
            backgroundColor: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)',
            textTransform: 'uppercase',
          }}
        >
          {step.type}
        </span>
        {riskInfo && (
          <span style={{ fontSize: '10px', color: riskInfo.color, marginLeft: 'auto' }}>
            {riskInfo.text} risk
          </span>
        )}
      </div>
      <div style={{ color: 'var(--vscode-foreground)', marginBottom: '2px' }}>
        {step.description}
      </div>
      {step.filePath && (
        <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px' }}>
          {step.filePath}
          {step.targetPath && ` → ${step.targetPath}`}
        </div>
      )}
      {step.status !== 'pending' && (
        <div style={{ fontSize: '10px', color: statusColor, marginTop: '4px', textTransform: 'capitalize' }}>
          ● {step.status}
        </div>
      )}
    </div>
  );
};

export default PlanStepCard;
