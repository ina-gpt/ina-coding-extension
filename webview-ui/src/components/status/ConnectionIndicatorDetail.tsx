import React from 'react';
import { MiniSparkline } from './MiniSparkline';
import clsx from 'clsx';

interface ConnectionIndicatorDetailProps {
  connection: any;
  onRetry: () => void;
  onClose: () => void;
}

export function ConnectionIndicatorDetail({ connection, onRetry, onClose }: ConnectionIndicatorDetailProps) {
  if (!connection) return null;
  const stateColors: Record<string, string> = {
    online: 'text-[var(--ina-status-success,#22c55e)]',
    offline: 'text-[var(--ina-status-error,#ef4444)]',
    degraded: 'text-[var(--ina-status-warning,#eab308)]',
    reconnecting: 'text-[var(--ina-status-info,#3b82f6)]',
  };

  return (
    <div className="p-3 space-y-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Connection</span>
        <button onClick={onClose} className="text-[var(--vscode-descriptionForeground)] hover:underline text-[10px]">Close</button>
      </div>
      <div className="flex items-center gap-2">
        <span className={clsx('font-medium capitalize', stateColors[connection.state] || '')}>{connection.state}</span>
        {connection.latencyMs && <span className="text-[var(--vscode-descriptionForeground)]">{connection.latencyMs}ms</span>}
      </div>
      <div className="text-[var(--vscode-descriptionForeground)]">Target: {connection.target}</div>
      {connection.uptime && <div className="text-[var(--vscode-descriptionForeground)]">Uptime: {Math.round(connection.uptime / 60000)}m</div>}
      {connection.state !== 'online' && (
        <button onClick={onRetry} className="px-2 py-1 rounded text-[10px] bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)]">
          Retry Now
        </button>
      )}
    </div>
  );
}
