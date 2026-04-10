import React from 'react';
import { GitBranch, GitMerge, Trash2, FolderOpen, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import clsx from 'clsx';

export interface WorktreeInstanceView {
  id: string;
  path: string;
  branch: string;
  parentBranch: string;
  status: string;
  label: string | null;
  conflictCount: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

interface WorktreePanelProps {
  worktrees: WorktreeInstanceView[];
  onMerge: (id: string, strategy: 'merge' | 'rebase' | 'squash') => void;
  onAbandon: (id: string) => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  creating: 'bg-blue-500/20 text-blue-400',
  active: 'bg-green-500/20 text-green-400',
  running: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  merging: 'bg-indigo-500/20 text-indigo-400',
  merged: 'bg-green-500/20 text-green-400',
  conflicted: 'bg-red-500/20 text-red-400',
  abandoned: 'bg-gray-500/20 text-gray-400',
  error: 'bg-red-500/20 text-red-400',
};

const STATUS_ICONS: Record<string, React.ComponentType<any>> = {
  creating: Loader2,
  active: GitBranch,
  running: Loader2,
  completed: CheckCircle2,
  merging: GitMerge,
  merged: CheckCircle2,
  conflicted: AlertTriangle,
  abandoned: XCircle,
  error: XCircle,
};

const formatAge = (ts: number): string => {
  const ms = Date.now() - ts;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

export const WorktreePanel: React.FC<WorktreePanelProps> = ({
  worktrees,
  onMerge,
  onAbandon,
  onOpen,
  onRefresh,
}) => {
  return (
    <div className="flex flex-col h-full bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-[var(--ina-accent-primary,#4f46e5)]" />
          <span className="text-sm font-semibold">INA-7 Pro · Worktrees</span>
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
            {worktrees.length} active
          </span>
        </div>
        <button
          onClick={onRefresh}
          className="p-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {worktrees.length === 0 && (
          <div className="text-center text-xs text-[var(--vscode-descriptionForeground)] py-8">
            <GitBranch size={28} className="mx-auto mb-2 opacity-40" />
            No active worktrees
          </div>
        )}
        {worktrees.map((wt) => {
          const Icon = STATUS_ICONS[wt.status] || GitBranch;
          const isSpinning = wt.status === 'creating' || wt.status === 'running' || wt.status === 'merging';
          return (
            <div
              key={wt.id}
              className="border-b border-[var(--vscode-panel-border)] px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)]"
            >
              <div className="flex items-start gap-2">
                <Icon
                  size={13}
                  className={clsx(
                    'flex-shrink-0 mt-0.5',
                    STATUS_COLORS[wt.status]?.split(' ')[1],
                    isSpinning && 'animate-spin'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium truncate" title={wt.label ?? wt.branch}>
                      {wt.label ?? wt.branch}
                    </span>
                    <span
                      className={clsx(
                        'text-[9px] px-1 rounded font-medium uppercase',
                        STATUS_COLORS[wt.status]
                      )}
                    >
                      {wt.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--vscode-descriptionForeground)] font-mono truncate">
                    {wt.branch} ← {wt.parentBranch}
                  </div>
                  <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                    {formatAge(wt.updatedAt)}
                  </div>
                  {wt.conflictCount > 0 && (
                    <div className="text-[10px] text-red-400 mt-0.5">
                      ⚠ {wt.conflictCount} conflicted file{wt.conflictCount === 1 ? '' : 's'}
                    </div>
                  )}
                  {wt.lastError && (
                    <div
                      className="text-[10px] text-red-400 mt-0.5 truncate"
                      title={wt.lastError}
                    >
                      {wt.lastError}
                    </div>
                  )}
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1 mt-2 justify-end">
                <button
                  onClick={() => onOpen(wt.id)}
                  className="px-1.5 py-0.5 text-[10px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] flex items-center gap-1"
                  title="Open in new window"
                >
                  <FolderOpen size={10} />
                  Open
                </button>
                {(wt.status === 'completed' || wt.status === 'active') && (
                  <button
                    onClick={() => onMerge(wt.id, 'merge')}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/15 hover:bg-green-500/25 text-green-400 flex items-center gap-1"
                  >
                    <GitMerge size={10} />
                    Merge
                  </button>
                )}
                <button
                  onClick={() => onAbandon(wt.id)}
                  className="px-1.5 py-0.5 text-[10px] rounded hover:bg-red-500/20 hover:text-red-400 flex items-center gap-1"
                  title="Abandon (delete)"
                >
                  <Trash2 size={10} />
                  Abandon
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorktreePanel;
