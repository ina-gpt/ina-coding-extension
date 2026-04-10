import React, { useEffect, useState } from 'react';
import PlanView from './PlanView';
import type { PlanData } from './PlanView';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';

const ExecutionPanel = React.lazy(() => import('./ExecutionPanel'));
const RollbackConfirmDialog = React.lazy(() => import('./RollbackConfirmDialog'));
const ReviewPanel = React.lazy(() => import('./ReviewPanel'));

const AgentChat: React.FC = () => {
  const { agentSession, agentMode, agentPlan, executionState, showRollbackDialog, rollbackType, rollbackAll, rollbackLast, hideRollbackConfirm, reviewSession } = useChatStore();
  const [plan, setPlan] = useState<PlanData | null>(null);

  useEffect(() => {
    if (agentPlan) {
      setPlan({
        description: agentPlan.description,
        steps: agentPlan.steps,
        affectedFiles: agentPlan.affectedFiles,
        estimatedTime: agentPlan.estimatedTime,
        approved: agentPlan.approved,
        reasoning: agentPlan.reasoning,
        warnings: agentPlan.warnings,
        estimate: agentPlan.estimate,
      });
    }
  }, [agentPlan]);

  // Listen for plan messages from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'agentPlanReady') {
        setPlan(msg.plan as PlanData);
      }
      if (msg.type === 'agentPlanUpdate') {
        setPlan((prev) => prev ? { ...prev, ...msg.updates } : null);
      }
      if (msg.type === 'agentPlanStepUpdate') {
        setPlan((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === msg.stepId ? { ...s, ...msg.updates } : s
            ),
          };
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleApprove = () => {
    postMessage({ type: 'approvePlan' } as any);
  };

  const handleReject = () => {
    postMessage({ type: 'rejectPlan' } as any);
    setPlan(null);
  };

  const handleRevise = (feedback: string) => {
    postMessage({ type: 'revisePlan', feedback } as any);
  };

  const handleRollbackConfirm = () => {
    if (rollbackType === 'all') rollbackAll();
    else rollbackLast();
    hideRollbackConfirm();
  };

  if (agentMode === 'chat' || !plan) {
    return null;
  }

  const isExecuting = executionState && executionState !== 'idle';

  return (
    <div style={{ padding: '0 8px' }}>
      {/* Agent mode indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 0',
          fontSize: '11px',
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: agentSession
              ? 'var(--vscode-progressBar-background)'
              : 'var(--vscode-descriptionForeground)',
          }}
        />
        Agent Mode
        {agentSession && (
          <span style={{ textTransform: 'capitalize' }}>
            — {executionState || agentSession.status}
          </span>
        )}
      </div>

      {/* Review panel (show after execution completes) */}
      {reviewSession && !isExecuting && (
        <React.Suspense fallback={<div style={{ padding: '12px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>Loading review panel...</div>}>
          <ReviewPanel />
        </React.Suspense>
      )}

      {/* Plan view (show when not executing and no review) */}
      {!isExecuting && !reviewSession && (
        <PlanView
          plan={plan}
          status={agentSession?.status || 'idle'}
          onApprove={handleApprove}
          onReject={handleReject}
          onRevise={handleRevise}
        />
      )}

      {/* Execution panel (show when executing) */}
      {isExecuting && (
        <React.Suspense fallback={<div style={{ padding: '12px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>Loading execution panel...</div>}>
          <ExecutionPanel />
        </React.Suspense>
      )}

      {/* Rollback confirmation dialog */}
      {showRollbackDialog && (
        <React.Suspense fallback={null}>
          <RollbackConfirmDialog
            onConfirm={handleRollbackConfirm}
            onCancel={hideRollbackConfirm}
            filesAffected={plan.affectedFiles}
            rollbackType={rollbackType || 'all'}
          />
        </React.Suspense>
      )}
    </div>
  );
};

export default AgentChat;
