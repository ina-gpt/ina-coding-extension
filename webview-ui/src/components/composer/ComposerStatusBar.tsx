import React from 'react';
import { Check, X, Camera, Pause, Play, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import type { ComposerStats, ComposerStatus } from '@/types';

interface ComposerStatusBarProps {
  stats: ComposerStats;
  status: ComposerStatus;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onPause: () => void;
  onResume: () => void;
  onCheckpoint: () => void;
  onRefineFocus?: () => void;
}

const STATUS_LABEL: Record<ComposerStatus, string> = {
  planning: 'Planning',
  executing: 'Executing',
  reviewing: 'Reviewing',
  refining: 'Refining',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused',
};

const STATUS_BG: Record<ComposerStatus, string> = {
  planning: 'bg-blue-500/20 text-blue-400',
  executing: 'bg-amber-500/20 text-amber-400',
  reviewing: 'bg-purple-500/20 text-purple-400',
  refining: 'bg-indigo-500/20 text-indigo-400',
  completed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  paused: 'bg-gray-500/20 text-gray-400',
};

const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m ${sec % 60}s`;
};

export const ComposerStatusBar: React.FC<ComposerStatusBarProps> = ({
  stats,
  status,
  onAcceptAll,
  onRejectAll,
  onPause,
  onResume,
  onCheckpoint,
  onRefineFocus,
}) => {
  const isExecuting = status === 'executing';
  const isPaused = status === 'paused';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] text-xs">
      {/* Stats */}
      <div className="flex items-center gap-3 text-[var(--vscode-descriptionForeground)]">
        <span className={clsx('px-2 py-0.5 rounded font-medium', STATUS_BG[status])}>
          {STATUS_LABEL[status]}
        </span>
        <span>
          <strong className="text-[var(--vscode-foreground)]">{stats.totalFiles}</strong> files
        </span>
        <span className="text-green-400">+{stats.linesAdded}</span>
        <span className="text-red-400">-{stats.linesRemoved}</span>
        <span>
          <strong className="text-[var(--vscode-foreground)]">
            {stats.stepsCompleted}/{stats.planSteps}
          </strong>{' '}
          steps
        </span>
        {stats.refinementCount > 0 && (
          <span>
            <strong className="text-[var(--vscode-foreground)]">{stats.refinementCount}</strong> refinements
          </span>
        )}
        {stats.executionTimeMs > 0 && <span>{formatTime(stats.executionTimeMs)}</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {onRefineFocus && (
          <button
            onClick={onRefineFocus}
            className="px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            title="Focus refinement input"
          >
            <RefreshCw size={12} />
            Refine
          </button>
        )}
        <button
          onClick={onCheckpoint}
          className="px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          title="Save checkpoint"
        >
          <Camera size={12} />
          Checkpoint
        </button>
        {isExecuting ? (
          <button
            onClick={onPause}
            className="px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <Pause size={12} />
            Pause
          </button>
        ) : isPaused ? (
          <button
            onClick={onResume}
            className="px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <Play size={12} />
            Resume
          </button>
        ) : null}
        <button
          onClick={onRejectAll}
          className="px-2 py-1 rounded text-xs flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 text-red-400"
        >
          <X size={12} />
          Reject All
        </button>
        <button
          onClick={onAcceptAll}
          className="px-2 py-1 rounded text-xs flex items-center gap-1 bg-green-500/15 hover:bg-green-500/25 text-green-400 font-medium"
        >
          <Check size={12} />
          Accept All
        </button>
      </div>
    </div>
  );
};

export default ComposerStatusBar;
