import React from 'react';
import { GitBranch } from 'lucide-react';
import clsx from 'clsx';
import type { WorktreeInstanceView } from './WorktreePanel';

interface WorktreeBranchGraphProps {
  worktrees: WorktreeInstanceView[];
  onSelect?: (id: string) => void;
}

/**
 * Lightweight SVG branch graph. Each parent branch becomes a row; each
 * worktree branch is drawn as a short offshoot with a dot at the tip.
 */
export const WorktreeBranchGraph: React.FC<WorktreeBranchGraphProps> = ({ worktrees, onSelect }) => {
  // Group worktrees by parent branch
  const byParent = new Map<string, WorktreeInstanceView[]>();
  for (const wt of worktrees) {
    if (!byParent.has(wt.parentBranch)) byParent.set(wt.parentBranch, []);
    byParent.get(wt.parentBranch)!.push(wt);
  }

  const rowHeight = 34;
  const nodeRadius = 5;
  const parentX = 28;
  const childXStep = 56;
  const totalRows = byParent.size;
  const maxChildren = Math.max(1, ...[...byParent.values()].map((w) => w.length));
  const width = parentX + childXStep * (maxChildren + 1);
  const height = Math.max(80, totalRows * rowHeight + 30);

  const STATUS_FILL: Record<string, string> = {
    creating: '#60a5fa',
    active: '#4ade80',
    running: '#facc15',
    completed: '#10b981',
    merging: '#818cf8',
    merged: '#22c55e',
    conflicted: '#f87171',
    abandoned: '#6b7280',
    error: '#ef4444',
  };

  return (
    <div className="p-3 bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
      <div className="flex items-center gap-2 mb-2">
        <GitBranch size={13} className="text-[var(--ina-accent-primary,#4f46e5)]" />
        <span className="text-xs font-semibold">Branch graph</span>
      </div>

      {worktrees.length === 0 ? (
        <div className="text-xs text-[var(--vscode-descriptionForeground)]">No worktrees to graph</div>
      ) : (
        <svg width={width} height={height} className="font-mono text-[10px]">
          {[...byParent.entries()].map(([parent, children], rowIdx) => {
            const y = rowIdx * rowHeight + 20;
            return (
              <g key={parent}>
                {/* Parent trunk (horizontal line) */}
                <line
                  x1={parentX}
                  y1={y}
                  x2={parentX + childXStep * (children.length + 1)}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.2}
                  strokeWidth={1}
                />
                {/* Parent dot */}
                <circle cx={parentX} cy={y} r={nodeRadius} fill="#4b5563" />
                <text
                  x={parentX - 10}
                  y={y + 3}
                  textAnchor="end"
                  fill="currentColor"
                  fillOpacity={0.7}
                >
                  {parent}
                </text>

                {/* Child worktrees */}
                {children.map((wt, i) => {
                  const cx = parentX + childXStep * (i + 1);
                  const cy = y;
                  const fill = STATUS_FILL[wt.status] ?? '#9ca3af';
                  return (
                    <g
                      key={wt.id}
                      className={clsx(onSelect && 'cursor-pointer')}
                      onClick={onSelect ? () => onSelect(wt.id) : undefined}
                    >
                      {/* Offshoot — slight curve up then dot */}
                      <path
                        d={`M ${parentX} ${y} Q ${cx - 14} ${y - 12}, ${cx} ${cy - 6}`}
                        stroke={fill}
                        strokeWidth={1.5}
                        fill="none"
                        strokeOpacity={0.7}
                      />
                      <circle cx={cx} cy={cy - 6} r={nodeRadius + 1} fill={fill} />
                      <text
                        x={cx}
                        y={cy - 14}
                        textAnchor="middle"
                        fill="currentColor"
                        fillOpacity={0.9}
                      >
                        {wt.label ? wt.label.substring(0, 16) : wt.id.substring(0, 8)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
        {Object.entries({
          active: 'active',
          running: 'running',
          completed: 'completed',
          merged: 'merged',
          conflicted: 'conflicted',
          abandoned: 'abandoned',
        }).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_FILL[k] }}
            />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorktreeBranchGraph;
