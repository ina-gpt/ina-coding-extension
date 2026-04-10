import React, { useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  FileCheck2,
  Inbox,
} from 'lucide-react';
import clsx from 'clsx';

export type AsyncSessionStatusView =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_input';

export interface AsyncSessionView {
  id: string;
  taskDescription: string;
  status: AsyncSessionStatusView;
  progress: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  applied: boolean;
  totalTokensUsed: number;
  createdAt: number;
  updatedAt: number;
}

interface AsyncSessionPanelProps {
  sessions: AsyncSessionView[];
  onOpen: (id: string) => void;
  onCancel: (id: string) => void;
  onResume: (id: string) => void;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-500/20 text-gray-400',
  running: 'bg-blue-500/20 text-blue-400',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
  needs_input: 'bg-purple-500/20 text-purple-400',
};

const STATUS_ICONS: Record<string, React.ComponentType<any>> = {
  queued: Clock,
  running: Loader2,
  paused: Pause,
  completed: CheckCircle2,
  failed: AlertTriangle,
  cancelled: X,
  needs_input: AlertTriangle,
};

const formatAge = (ts: number): string => {
  const ms = Date.now() - ts;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

const formatDuration = (ms: number): string => {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
};

export const AsyncSessionPanel: React.FC<AsyncSessionPanelProps> = ({
  sessions,
  onOpen,
  onCancel,
  onResume,
  onApply,
  onDelete,
  onRefresh,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  const filtered = sessions.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'running') return s.status === 'running' || s.status === 'queued';
    if (filter === 'completed') return s.status === 'completed';
    if (filter === 'failed') return s.status === 'failed' || s.status === 'cancelled';
    return true;
  });

  const counts = {
    all: sessions.length,
    running: sessions.filter((s) => s.status === 'running' || s.status === 'queued').length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    failed: sessions.filter((s) => s.status === 'failed' || s.status === 'cancelled').length,
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[640px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-[var(--ina-accent-primary,#4f46e5)]" />
            <span className="text-sm font-semibold">INA-7 Pro · Async Sessions</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {counts.running} running · {counts.completed} completed
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              className="px-2 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
              title="Refresh"
            >
              ↻
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[var(--vscode-panel-border)]">
          {(['all', 'running', 'completed', 'failed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-2 py-0.5 text-[10px] rounded capitalize',
                filter === f
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]'
              )}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-center text-xs text-[var(--vscode-descriptionForeground)] py-12">
              <Inbox size={32} className="mx-auto mb-2 opacity-40" />
              No async sessions
            </div>
          )}
          {filtered.map((s) => {
            const Icon = STATUS_ICONS[s.status] || Clock;
            const isRunning = s.status === 'running' || s.status === 'queued';
            const elapsed = s.startedAt ? (s.completedAt ?? Date.now()) - s.startedAt : 0;
            return (
              <div
                key={s.id}
                className="border-b border-[var(--vscode-panel-border)] px-4 py-3 hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                onClick={() => onOpen(s.id)}
              >
                <div className="flex items-start gap-2">
                  <Icon
                    size={13}
                    className={clsx(
                      'flex-shrink-0 mt-0.5',
                      STATUS_COLORS[s.status]?.split(' ')[1],
                      s.status === 'running' && 'animate-spin'
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="text-xs font-medium line-clamp-2 flex-1" title={s.taskDescription}>
                        {s.taskDescription}
                      </span>
                      <span
                        className={clsx(
                          'text-[9px] px-1 rounded font-medium uppercase flex-shrink-0',
                          STATUS_COLORS[s.status]
                        )}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {(s.status === 'running' || s.status === 'paused' || s.progress > 0) && (
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-1 bg-[var(--vscode-progressBar-background,#444)] rounded overflow-hidden">
                          <div
                            className="h-full bg-[var(--ina-accent-primary,#4f46e5)] transition-all"
                            style={{ width: `${s.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] font-mono w-8 text-right">
                          {s.progress}%
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
                      <span>{formatAge(s.updatedAt)}</span>
                      {elapsed > 0 && <span>· {formatDuration(elapsed)}</span>}
                      <span>· {s.totalTokensUsed.toLocaleString()} tokens</span>
                      {s.applied && (
                        <span className="text-green-400 flex items-center gap-0.5">
                          · <FileCheck2 size={9} /> applied
                        </span>
                      )}
                    </div>

                    {s.error && (
                      <div className="text-[10px] text-red-400 mt-1 line-clamp-2" title={s.error}>
                        {s.error}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div
                  className="flex items-center justify-end gap-1 mt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isRunning && (
                    <button
                      onClick={() => onCancel(s.id)}
                      className="px-2 py-0.5 text-[10px] rounded hover:bg-red-500/20 hover:text-red-400 flex items-center gap-1"
                    >
                      <X size={10} />
                      Cancel
                    </button>
                  )}
                  {(s.status === 'paused' || s.status === 'failed') && (
                    <button
                      onClick={() => onResume(s.id)}
                      className="px-2 py-0.5 text-[10px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1"
                    >
                      <Play size={10} />
                      Resume
                    </button>
                  )}
                  {s.status === 'completed' && !s.applied && (
                    <button
                      onClick={() => onApply(s.id)}
                      className="px-2 py-0.5 text-[10px] rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 flex items-center gap-1"
                    >
                      <FileCheck2 size={10} />
                      Apply
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AsyncSessionPanel;
