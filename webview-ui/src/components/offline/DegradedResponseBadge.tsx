import React, { useState } from 'react';
import clsx from 'clsx';

interface DegradedResponseBadgeProps {
  source: 'cache' | 'local_model' | 'queued';
  quality: 'degraded' | 'cached';
  warning?: string | null;
}

export function DegradedResponseBadge({ source, quality, warning }: DegradedResponseBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const configs: Record<string, { icon: string; label: string; color: string }> = {
    cache: { icon: '📦', label: 'Cached response', color: 'bg-gray-500/20 text-gray-400' },
    local_model: { icon: '🖥️', label: 'Offline model', color: 'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.2))] text-[var(--ina-status-warning,#facc15)]' },
    queued: { icon: '📋', label: 'Queued for later', color: 'bg-[var(--ina-status-info-bg,rgba(59,130,246,0.2))] text-[var(--ina-status-info,#60a5fa)]' },
  };

  const config = configs[source] || configs.cache;

  return (
    <div className="mt-1">
      <button
        onClick={() => warning && setExpanded(!expanded)}
        className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs', config.color, warning && 'cursor-pointer hover:opacity-80')}
        title={warning || undefined}
      >
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </button>
      {expanded && warning && (
        <div className="mt-1 text-xs text-[var(--vscode-descriptionForeground)] italic px-2">
          {warning}
        </div>
      )}
    </div>
  );
}
