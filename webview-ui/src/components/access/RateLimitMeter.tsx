/**
 * Phase 12.2 — Rate Limit Usage Visualization
 */
import React from 'react';
import clsx from 'clsx';

interface UsageWindow {
  window: string;
  current: number;
  limit: number;
  resetAt: number;
}

interface RateLimitMeterProps {
  usage: UsageWindow[];
}

function getColor(pct: number): string {
  if (pct >= 95) return 'bg-red-500';
  if (pct >= 80) return 'bg-orange-500';
  if (pct >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function formatReset(resetAt: number): string {
  const diff = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.ceil(diff / 60)}m`;
  return `${Math.ceil(diff / 3600)}h`;
}

export const RateLimitMeter: React.FC<RateLimitMeterProps> = ({ usage }) => {
  const anyLimited = usage.some(u => u.current >= u.limit);

  return (
    <div className={clsx(
      'space-y-2 p-3 rounded-lg border',
      anyLimited
        ? 'border-red-500 animate-pulse'
        : 'border-[var(--vscode-panel-border)]'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--vscode-descriptionForeground)]">
          Rate Limits
        </span>
        {anyLimited && (
          <span className="text-xs px-2 py-0.5 bg-red-500 text-white rounded-full font-medium">
            Rate Limited
          </span>
        )}
      </div>
      {usage.map((u) => {
        const pct = u.limit > 0 ? Math.min(100, (u.current / u.limit) * 100) : 0;
        return (
          <div key={u.window} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--vscode-foreground)]">{u.window}</span>
              <span className="text-[var(--vscode-descriptionForeground)]">
                {u.current}/{u.limit}
                <span className="ml-2 opacity-60">
                  Resets {formatReset(u.resetAt)}
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-[var(--vscode-input-background)] rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all duration-300', getColor(pct))}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
