import React from 'react';
import clsx from 'clsx';

interface HealthCardProps {
  section: { name: string; status: string; icon: string; details: { label: string; value: string; status: string; tooltip: string | null }[] };
  onClick?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'border-l-[var(--ina-status-success,#22c55e)]',
  degraded: 'border-l-[var(--ina-status-warning,#eab308)]',
  unhealthy: 'border-l-[var(--ina-status-error,#ef4444)]',
  offline: 'border-l-[var(--ina-status-error,#ef4444)]',
  unknown: 'border-l-[var(--vscode-descriptionForeground)]',
};

const DOT_COLORS: Record<string, string> = {
  healthy: 'bg-[var(--ina-status-success,#22c55e)]',
  degraded: 'bg-[var(--ina-status-warning,#eab308)]',
  unhealthy: 'bg-[var(--ina-status-error,#ef4444)]',
  good: 'bg-[var(--ina-status-success,#22c55e)]',
  warn: 'bg-[var(--ina-status-warning,#eab308)]',
  error: 'bg-[var(--ina-status-error,#ef4444)]',
  neutral: 'bg-[var(--vscode-descriptionForeground)]',
};

export function HealthCard({ section, onClick }: HealthCardProps) {
  return (
    <div onClick={onClick}
      className={clsx('rounded-lg border border-l-4 p-2.5 bg-[var(--vscode-input-background)] cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] transition-colors', STATUS_COLORS[section.status] || STATUS_COLORS.unknown)}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={clsx('h-2 w-2 rounded-full', DOT_COLORS[section.status] || DOT_COLORS.neutral)} />
        <span className="text-xs font-semibold">{section.name}</span>
      </div>
      <div className="space-y-0.5">
        {section.details.slice(0, 3).map((d, i) => (
          <div key={i} className="flex items-center justify-between text-[10px]" title={d.tooltip || undefined}>
            <span className="text-[var(--vscode-descriptionForeground)]">{d.label}</span>
            <span className={clsx('font-mono',
              d.status === 'good' ? 'text-[var(--ina-status-success,#22c55e)]' :
              d.status === 'warn' ? 'text-[var(--ina-status-warning,#eab308)]' :
              d.status === 'error' ? 'text-[var(--ina-status-error,#ef4444)]' : ''
            )}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
