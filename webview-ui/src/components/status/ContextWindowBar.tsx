import React from 'react';
import clsx from 'clsx';

interface ContextWindowBarProps {
  used: number;
  max: number;
  breakdown?: { label: string; tokens: number; color: string }[];
}

export function ContextWindowBar({ used, max, breakdown }: ContextWindowBarProps) {
  const percent = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const fmt = (n: number) => n < 1000 ? String(n) : n < 1000000 ? `${Math.round(n / 1000)}K` : `${(n / 1000000).toFixed(1)}M`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-[var(--vscode-descriptionForeground)]">
        <span>Context Window</span>
        <span>{fmt(used)} / {fmt(max)} ({Math.round(percent)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--vscode-editor-background)] overflow-hidden relative">
        {breakdown && breakdown.length > 0 ? (
          <div className="flex h-full">
            {breakdown.map((seg, i) => {
              const segPercent = max > 0 ? (seg.tokens / max) * 100 : 0;
              return (
                <div key={i} className="h-full transition-all" style={{ width: `${segPercent}%`, backgroundColor: seg.color }}
                  title={`${seg.label}: ${fmt(seg.tokens)} tokens (${Math.round(segPercent)}%)`} />
              );
            })}
          </div>
        ) : (
          <div className={clsx('h-full rounded-full transition-all',
            percent > 95 ? 'bg-[var(--ina-status-error,#ef4444)]' : percent > 80 ? 'bg-[var(--ina-status-warning,#eab308)]' : 'bg-[var(--ina-accent-primary,#3b82f6)]'
          )} style={{ width: `${percent}%` }} />
        )}
        {/* Warning threshold marker */}
        <div className="absolute top-0 bottom-0 border-r border-dashed border-[var(--vscode-descriptionForeground)] opacity-30" style={{ left: '80%' }} />
      </div>
    </div>
  );
}
