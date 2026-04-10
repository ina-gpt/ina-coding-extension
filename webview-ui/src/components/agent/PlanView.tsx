import React, { useState } from 'react';
import PlanStepCard from './PlanStepCard';
import PlanTimeline from './PlanTimeline';
import type { PlanStepData } from './PlanStepCard';
import { postMessage } from '@/utils/vscode';

export interface PlanData {
  description: string;
  steps: PlanStepData[];
  affectedFiles: string[];
  estimatedTime: number;
  approved: boolean;
  reasoning?: string;
  warnings?: string[];
  estimate?: {
    complexity: string;
    riskLevel: string;
    requiresTests: boolean;
  };
}

interface PlanViewProps {
  plan: PlanData;
  status: string;
  onApprove: () => void;
  onReject: () => void;
  onRevise: (feedback: string) => void;
}

const RISK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  safe: { bg: 'rgba(0, 180, 0, 0.1)', text: 'var(--vscode-testing-iconPassed)', label: 'Safe' },
  moderate: { bg: 'rgba(200, 150, 0, 0.1)', text: 'var(--vscode-editorWarning-foreground)', label: 'Moderate Risk' },
  risky: { bg: 'rgba(200, 0, 0, 0.1)', text: 'var(--vscode-testing-iconFailed)', label: 'Risky' },
};

const PlanView: React.FC<PlanViewProps> = ({ plan, status, onApprove, onReject, onRevise }) => {
  const [reviseInput, setReviseInput] = useState('');
  const [showRevise, setShowRevise] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const currentStepIndex = plan.steps.findIndex(
    (s) => s.status === 'running'
  );
  const isExecuting = status === 'executing';
  const isPending = !plan.approved && status !== 'executing';
  const riskStyle = plan.estimate?.riskLevel
    ? RISK_STYLES[plan.estimate.riskLevel] || RISK_STYLES.safe
    : RISK_STYLES.safe;

  const handleRevise = () => {
    if (reviseInput.trim()) {
      onRevise(reviseInput.trim());
      setReviseInput('');
      setShowRevise(false);
    }
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `~${Math.round(s / 60)}min`;
  };

  return (
    <div
      style={{
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: '6px',
        overflow: 'hidden',
        margin: '8px 0',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 12px',
          backgroundColor: 'var(--vscode-sideBarSectionHeader-background)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📋</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--vscode-foreground)' }}>
              {plan.description}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginTop: '2px' }}>
              {plan.steps.length} steps · {plan.affectedFiles.length} files · {formatDuration(plan.estimatedTime)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: '8px',
              backgroundColor: riskStyle.bg,
              color: riskStyle.text,
            }}
          >
            {riskStyle.label}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
            {expanded ? '▼' : '▶'}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '8px 12px' }}>
          {/* Timeline */}
          {plan.steps.length > 0 && (
            <PlanTimeline steps={plan.steps} currentStepIndex={currentStepIndex} />
          )}

          {/* Reasoning */}
          {plan.reasoning && (
            <div
              style={{
                padding: '8px',
                backgroundColor: 'var(--vscode-textBlockQuote-background)',
                borderLeft: '3px solid var(--vscode-textBlockQuote-border)',
                borderRadius: '4px',
                fontSize: '12px',
                color: 'var(--vscode-foreground)',
                marginBottom: '8px',
              }}
            >
              {plan.reasoning}
            </div>
          )}

          {/* Warnings */}
          {plan.warnings && plan.warnings.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              {plan.warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'rgba(200, 150, 0, 0.1)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: 'var(--vscode-editorWarning-foreground)',
                    marginBottom: '2px',
                  }}
                >
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}

          {/* Steps */}
          <div style={{ marginBottom: '8px' }}>
            {plan.steps.map((step, i) => (
              <PlanStepCard
                key={step.id}
                step={step}
                index={i}
                isActive={i === currentStepIndex}
              />
            ))}
          </div>

          {/* Affected Files */}
          {plan.affectedFiles.length > 0 && (
            <details style={{ marginBottom: '8px' }}>
              <summary
                style={{
                  fontSize: '11px',
                  color: 'var(--vscode-descriptionForeground)',
                  cursor: 'pointer',
                  marginBottom: '4px',
                }}
              >
                Affected files ({plan.affectedFiles.length})
              </summary>
              <div style={{ paddingLeft: '12px' }}>
                {plan.affectedFiles.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '11px',
                      color: 'var(--vscode-textLink-foreground)',
                      cursor: 'pointer',
                      padding: '1px 0',
                    }}
                    onClick={() => postMessage({ type: 'openFile', path: f })}
                  >
                    {f}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Action buttons */}
          {isPending && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={onApprove}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  backgroundColor: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                ✓ Approve & Execute
              </button>
              <button
                onClick={() => setShowRevise(!showRevise)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ✎ Revise
              </button>
              <button
                onClick={onReject}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  color: 'var(--vscode-testing-iconFailed)',
                  border: '1px solid var(--vscode-testing-iconFailed)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                ✗ Reject
              </button>
            </div>
          )}

          {/* Revise input */}
          {showRevise && (
            <div style={{ marginTop: '8px' }}>
              <textarea
                value={reviseInput}
                onChange={(e) => setReviseInput(e.target.value)}
                placeholder="Describe what changes you want to the plan..."
                style={{
                  width: '100%',
                  minHeight: '60px',
                  padding: '8px',
                  backgroundColor: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)',
                  border: '1px solid var(--vscode-input-border)',
                  borderRadius: '4px',
                  fontSize: '12px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  onClick={handleRevise}
                  disabled={!reviseInput.trim()}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: 'var(--vscode-button-background)',
                    color: 'var(--vscode-button-foreground)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: reviseInput.trim() ? 'pointer' : 'not-allowed',
                    fontSize: '11px',
                    opacity: reviseInput.trim() ? 1 : 0.5,
                  }}
                >
                  Send Revision
                </button>
                <button
                  onClick={() => { setShowRevise(false); setReviseInput(''); }}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: 'transparent',
                    color: 'var(--vscode-descriptionForeground)',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Executing status */}
          {isExecuting && (
            <div
              style={{
                textAlign: 'center',
                padding: '8px',
                fontSize: '12px',
                color: 'var(--vscode-progressBar-background)',
              }}
            >
              ⏳ Executing plan...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PlanView;
