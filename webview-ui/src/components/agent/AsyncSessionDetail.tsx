import React from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Code2,
  Pause,
  FileCheck2,
  User,
  Bot,
  Shield,
  Wrench,
  TestTube2,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

export interface AsyncSessionResultView {
  taskId: string;
  description: string;
  requiredRole: string;
  output: string;
  filePath: string | null;
  language: string | null;
  durationMs: number;
  tokensUsed: number;
  completedAt: number;
}

export interface AsyncSessionDetailView {
  id: string;
  taskDescription: string;
  status: string;
  progress: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  applied: boolean;
  totalTokensUsed: number;
  results: AsyncSessionResultView[];
}

interface AsyncSessionDetailProps {
  session: AsyncSessionDetailView;
  onApply: () => void;
  onClose: () => void;
  onBack?: () => void;
}

const ROLE_ICONS: Record<string, React.ComponentType<any>> = {
  planner: Sparkles,
  coder: Code2,
  reviewer: User,
  tester: TestTube2,
  refactorer: Wrench,
  security_auditor: Shield,
};

const ROLE_COLORS: Record<string, string> = {
  planner: 'text-blue-400',
  coder: 'text-emerald-400',
  reviewer: 'text-amber-400',
  tester: 'text-purple-400',
  refactorer: 'text-cyan-400',
  security_auditor: 'text-red-400',
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
};

export const AsyncSessionDetail: React.FC<AsyncSessionDetailProps> = ({
  session,
  onApply,
  onClose,
  onBack,
}) => {
  const isCompleted = session.status === 'completed';
  const elapsed = session.startedAt ? (session.completedAt ?? Date.now()) - session.startedAt : 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[800px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] text-xs"
              >
                ← Back
              </button>
            )}
            <Bot size={14} className="text-[var(--ina-accent-primary,#4f46e5)]" />
            <span className="text-sm font-semibold">INA-7 Pro · Session</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {session.id.substring(0, 8)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Task description + summary */}
        <div className="px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold mb-2 whitespace-pre-wrap">{session.taskDescription}</div>
          <div className="flex items-center gap-3 text-[10px] text-[var(--vscode-descriptionForeground)]">
            <span
              className={clsx(
                'px-1.5 py-0.5 rounded font-medium uppercase',
                session.status === 'completed'
                  ? 'bg-green-500/20 text-green-400'
                  : session.status === 'running'
                    ? 'bg-blue-500/20 text-blue-400'
                    : session.status === 'failed'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-gray-500/20 text-gray-400'
              )}
            >
              {session.status.replace('_', ' ')}
            </span>
            <span>{session.progress}% complete</span>
            {elapsed > 0 && <span>· {formatDuration(elapsed)}</span>}
            <span>· {session.totalTokensUsed.toLocaleString()} tokens</span>
            <span>· {session.results.length} task{session.results.length === 1 ? '' : 's'}</span>
            {session.applied && (
              <span className="text-green-400 flex items-center gap-0.5">
                · <FileCheck2 size={10} /> applied
              </span>
            )}
          </div>
          {session.error && (
            <div className="mt-2 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-[10px] text-red-400">
              <AlertTriangle size={10} className="inline mr-1" />
              {session.error}
            </div>
          )}
        </div>

        {/* Task results */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {session.results.length === 0 && (
            <div className="text-center text-xs text-[var(--vscode-descriptionForeground)] py-6">
              <Clock size={28} className="mx-auto mb-2 opacity-40" />
              {session.status === 'running' || session.status === 'queued'
                ? 'Task is running — progress will appear here'
                : 'No results yet'}
            </div>
          )}
          {session.results.map((r, i) => {
            const Icon = ROLE_ICONS[r.requiredRole] || Bot;
            return (
              <div
                key={r.taskId}
                className="rounded border border-[var(--vscode-panel-border)] overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--vscode-editor-lineHighlightBackground)] border-b border-[var(--vscode-panel-border)]">
                  <Icon
                    size={12}
                    className={clsx('flex-shrink-0', ROLE_COLORS[r.requiredRole] ?? 'text-gray-400')}
                  />
                  <span className="text-[10px] font-mono text-[var(--vscode-descriptionForeground)]">
                    {i + 1}.
                  </span>
                  <span className="text-xs font-medium flex-1 truncate" title={r.description}>
                    {r.description}
                  </span>
                  <span className="text-[10px] text-[var(--vscode-descriptionForeground)] font-mono">
                    {formatDuration(r.durationMs)}
                  </span>
                  <span className="text-[10px] text-[var(--vscode-descriptionForeground)] font-mono">
                    {r.tokensUsed}t
                  </span>
                </div>
                {r.filePath && (
                  <div className="px-3 py-1 text-[10px] text-[var(--vscode-descriptionForeground)] border-b border-[var(--vscode-panel-border)] font-mono">
                    📄 {r.filePath}
                  </div>
                )}
                <pre className="px-3 py-2 text-[10px] font-mono bg-[var(--vscode-textCodeBlock-background)] max-h-64 overflow-auto whitespace-pre">
                  {r.output.substring(0, 3000)}
                  {r.output.length > 3000 && '\n... (truncated)'}
                </pre>
              </div>
            );
          })}
        </div>

        {/* Action footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--vscode-panel-border)]">
          <button
            onClick={onClose}
            className="px-3 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            Close
          </button>
          {isCompleted && !session.applied && (
            <button
              onClick={onApply}
              className="px-3 py-1 text-[11px] rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 flex items-center gap-1 font-medium"
            >
              <FileCheck2 size={11} />
              Apply Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AsyncSessionDetail;
