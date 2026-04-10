import React from 'react';
import clsx from 'clsx';

interface ConnectionIndicatorProps {
  state: string;
  latencyMs?: number | null;
  onClick?: () => void;
}

export function ConnectionIndicator({ state, latencyMs, onClick }: ConnectionIndicatorProps) {
  const configs: Record<string, { color: string; label: string; pulse?: boolean }> = {
    online: { color: 'bg-[var(--ina-status-success,#22c55e)]', label: latencyMs ? `${latencyMs}ms` : 'Connected' },
    offline: { color: 'bg-[var(--ina-status-error,#ef4444)]', label: 'Offline', pulse: true },
    degraded: { color: 'bg-[var(--ina-status-warning,#eab308)]', label: latencyMs ? `Slow (${latencyMs}ms)` : 'Slow' },
    reconnecting: { color: 'bg-[var(--ina-status-info,#3b82f6)]', label: 'Reconnecting...', pulse: true },
    unknown: { color: 'bg-gray-400', label: 'Checking...' },
  };

  const config = configs[state] || configs.unknown;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-xs text-[var(--vscode-descriptionForeground)]"
      title={`Connection: ${state}${latencyMs ? ` (${latencyMs}ms)` : ''}`}
    >
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', config.color)} />
        )}
        <span className={clsx('relative inline-flex rounded-full h-2 w-2', config.color)} />
      </span>
      <span className="hidden sm:inline">{config.label}</span>
    </button>
  );
}
