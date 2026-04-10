import React from 'react';
import { Plus, Camera } from 'lucide-react';
import clsx from 'clsx';
import type { ComposerCheckpoint } from '@/types';

interface ComposerTimelineProps {
  checkpoints: ComposerCheckpoint[];
  currentIndex: number;
  onRestore: (checkpointId: string) => void;
  onCreate: () => void;
  onCompare?: (checkpointId: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  initial: 'bg-gray-400',
  plan: 'bg-blue-400',
  execution: 'bg-amber-400',
  refinement: 'bg-indigo-400',
  manual: 'bg-purple-400',
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const ComposerTimeline: React.FC<ComposerTimelineProps> = ({
  checkpoints,
  currentIndex,
  onRestore,
  onCreate,
  onCompare,
}) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] overflow-x-auto">
      <Camera size={12} className="text-[var(--vscode-descriptionForeground)] flex-shrink-0" />
      <span className="text-xs text-[var(--vscode-descriptionForeground)] flex-shrink-0">
        Checkpoints:
      </span>

      <div className="flex items-center gap-1 flex-1">
        {checkpoints.map((cp, idx) => {
          const isActive = idx === currentIndex;
          const isPast = idx < currentIndex;
          return (
            <React.Fragment key={cp.id}>
              {idx > 0 && (
                <div
                  className={clsx(
                    'h-px w-4 flex-shrink-0',
                    isPast ? 'bg-[var(--vscode-foreground)]' : 'bg-[var(--vscode-panel-border)]'
                  )}
                />
              )}
              <button
                onClick={() => onRestore(cp.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onCompare?.(cp.id);
                }}
                title={`${cp.description}\n${formatTime(cp.timestamp)}\nRight-click to compare`}
                className={clsx(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors group',
                  isActive && 'bg-[var(--vscode-list-activeSelectionBackground)]'
                )}
              >
                <span
                  className={clsx(
                    'rounded-full transition-all flex-shrink-0',
                    TYPE_COLORS[cp.type] || 'bg-gray-400',
                    isActive ? 'w-3 h-3 ring-2 ring-[var(--ina-accent-primary,#4f46e5)]' : 'w-2 h-2',
                    !isPast && !isActive && 'opacity-50'
                  )}
                />
                <span
                  className={clsx(
                    'truncate max-w-[120px]',
                    isActive
                      ? 'text-[var(--vscode-foreground)] font-medium'
                      : 'text-[var(--vscode-descriptionForeground)]'
                  )}
                >
                  {cp.description}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <button
        onClick={onCreate}
        className="flex-shrink-0 p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
        title="Create new checkpoint"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

export default ComposerTimeline;
