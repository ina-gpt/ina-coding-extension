import React, { useState } from 'react';
import { Play, X, CheckCircle2, AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import clsx from 'clsx';

export interface SkillInputDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'folder' | 'selection';
  description: string;
  required: boolean;
  default?: any;
}

export interface RunnerEvent {
  type: string;
  stepOrder?: number;
  stepName?: string;
  output?: any;
  error?: string;
  timestamp: number;
}

interface SkillRunnerProps {
  skillName: string;
  skillIcon: string;
  inputs: SkillInputDef[];
  events: RunnerEvent[];
  isRunning: boolean;
  awaitingApproval: { stepOrder: number; stepName: string } | null;
  onStart: (inputs: Record<string, any>) => void;
  onApprove: (approved: boolean) => void;
  onCancel: () => void;
  onClose: () => void;
}

const STEP_STATUS_COLORS: Record<string, string> = {
  'step-started': 'text-blue-400',
  'step-completed': 'text-green-400',
  'step-failed': 'text-red-400',
  'approval-required': 'text-amber-400',
  'execution-completed': 'text-green-400',
  'execution-failed': 'text-red-400',
};

export const SkillRunner: React.FC<SkillRunnerProps> = ({
  skillName,
  skillIcon,
  inputs,
  events,
  isRunning,
  awaitingApproval,
  onStart,
  onApprove,
  onCancel,
  onClose,
}) => {
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const input of inputs) {
      if (input.default !== undefined) init[input.name] = input.default;
    }
    return init;
  });

  const setValue = (name: string, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const canRun = inputs.every((i) => !i.required || values[i.name] !== undefined && values[i.name] !== '');

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[640px] max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">{skillIcon}</span>
            <span className="text-sm font-semibold">INA-7 Pro · {skillName}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Input form */}
          {!isRunning && events.length === 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-2">
                Inputs
              </h3>
              {inputs.length === 0 && (
                <div className="text-xs text-[var(--vscode-descriptionForeground)]">
                  No inputs required — click Run to start.
                </div>
              )}
              <div className="space-y-3">
                {inputs.map((input) => (
                  <div key={input.name}>
                    <label className="block text-xs font-medium mb-1">
                      {input.name}
                      {input.required && <span className="text-amber-400 ml-1">*</span>}
                      <span className="text-[10px] text-[var(--vscode-descriptionForeground)] ml-2">
                        {input.type}
                      </span>
                    </label>
                    <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-1">
                      {input.description}
                    </div>
                    {input.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={!!values[input.name]}
                        onChange={(e) => setValue(input.name, e.target.checked)}
                      />
                    ) : input.type === 'number' ? (
                      <input
                        type="number"
                        value={values[input.name] ?? ''}
                        onChange={(e) => setValue(input.name, e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none"
                      />
                    ) : (
                      <textarea
                        value={values[input.name] ?? ''}
                        onChange={(e) => setValue(input.name, e.target.value)}
                        rows={input.type === 'string' ? 2 : 1}
                        className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none font-mono"
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Event stream */}
          {events.length > 0 && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-2">
                Progress
              </h3>
              <div className="space-y-1">
                {events.map((ev, i) => {
                  const Icon =
                    ev.type === 'step-completed' || ev.type === 'execution-completed'
                      ? CheckCircle2
                      : ev.type === 'step-failed' || ev.type === 'execution-failed'
                        ? AlertTriangle
                        : ev.type === 'step-started' && isRunning
                          ? Loader2
                          : Sparkles;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-[11px] px-2 py-1 rounded hover:bg-[var(--vscode-list-hoverBackground)]"
                    >
                      <Icon
                        size={11}
                        className={clsx(
                          'flex-shrink-0 mt-0.5',
                          STEP_STATUS_COLORS[ev.type] ?? 'text-[var(--vscode-descriptionForeground)]',
                          ev.type === 'step-started' && 'animate-spin'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs">
                          {ev.stepOrder !== undefined && (
                            <span className="font-mono text-[10px] text-[var(--vscode-descriptionForeground)]">
                              {ev.stepOrder}.{' '}
                            </span>
                          )}
                          {ev.stepName ?? ev.type}
                        </div>
                        {ev.error && <div className="text-[10px] text-red-400 mt-0.5">{ev.error}</div>}
                        {ev.output && typeof ev.output === 'string' && (
                          <pre className="text-[10px] mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[var(--vscode-descriptionForeground)]">
                            {ev.output.substring(0, 800)}
                            {ev.output.length > 800 && '\n…'}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Approval prompt */}
          {awaitingApproval && (
            <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="text-xs font-semibold text-amber-400 mb-2">
                ⚠ Approval required for: {awaitingApproval.stepName}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onApprove(true)}
                  className="px-3 py-1 text-[11px] rounded bg-green-500/20 hover:bg-green-500/30 text-green-400"
                >
                  Approve
                </button>
                <button
                  onClick={() => onApprove(false)}
                  className="px-3 py-1 text-[11px] rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--vscode-panel-border)]">
          {isRunning ? (
            <button
              onClick={onCancel}
              className="px-3 py-1 text-[11px] rounded bg-red-500/20 hover:bg-red-500/30 text-red-400"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-3 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
              >
                Close
              </button>
              <button
                onClick={() => onStart(values)}
                disabled={!canRun}
                className={clsx(
                  'px-3 py-1 text-[11px] rounded font-medium flex items-center gap-1',
                  canRun
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
                    : 'bg-[var(--vscode-button-secondaryBackground)] opacity-50 cursor-not-allowed'
                )}
              >
                <Play size={11} />
                Run
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkillRunner;
