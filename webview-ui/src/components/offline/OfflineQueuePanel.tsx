import React from 'react';
import { Trash2, RefreshCw, Play, X } from 'lucide-react';
import clsx from 'clsx';

interface QueueItem {
  id: string;
  type: string;
  category: string;
  status: string;
  priority: number;
  createdAt: number;
  error: string | null;
  payload?: any;
}

interface OfflineQueuePanelProps {
  queue: QueueItem[];
  syncProgress: { total: number; synced: number; failed: number; remaining: number; currentItem: string | null } | null;
  onSync: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onRetryFailed: () => void;
}

export function OfflineQueuePanel({ queue, syncProgress, onSync, onRemove, onClear, onRetryFailed }: OfflineQueuePanelProps) {
  const queued = queue.filter(i => i.status === 'queued');
  const failed = queue.filter(i => i.status === 'failed');
  const synced = queue.filter(i => i.status === 'synced');

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      queued: 'bg-gray-500/20 text-gray-400',
      syncing: 'bg-[var(--ina-status-info-bg,rgba(59,130,246,0.2))] text-[var(--ina-status-info,#60a5fa)]',
      synced: 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))] text-[var(--ina-status-success,#4ade80)]',
      failed: 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] text-[var(--ina-status-error,#f87171)]',
      expired: 'bg-gray-500/10 text-gray-500 line-through',
    };
    return <span className={clsx('px-1.5 py-0.5 rounded text-xs', colors[status] || colors.queued)}>{status}</span>;
  };

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      chat: 'bg-purple-500/20 text-purple-400',
      memory_create: 'bg-cyan-500/20 text-cyan-400',
      memory_extract: 'bg-cyan-500/20 text-cyan-400',
      index_update: 'bg-orange-500/20 text-orange-400',
      feedback: 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))] text-[var(--ina-status-success,#4ade80)]',
    };
    return <span className={clsx('px-1.5 py-0.5 rounded text-xs', colors[type] || 'bg-gray-500/20')}>{type.replace('_', ' ')}</span>;
  };

  const timeAgo = (ts: number) => {
    const d = Date.now() - ts;
    if (d < 60000) return 'just now';
    if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
    return `${Math.floor(d / 3600000)}h ago`;
  };

  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Offline Queue</h3>
        <div className="flex gap-1.5">
          <button onClick={onSync} className="px-2 py-1 rounded text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:opacity-90" disabled={queued.length === 0}>
            <Play size={12} className="inline mr-1" />Sync Now
          </button>
          {failed.length > 0 && (
            <button onClick={onRetryFailed} className="px-2 py-1 rounded text-xs bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.2))] hover:bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.3))]">
              <RefreshCw size={12} className="inline mr-1" />Retry Failed
            </button>
          )}
          <button onClick={onClear} className="px-2 py-1 rounded text-xs bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] hover:bg-[var(--ina-status-error-bg,rgba(239,68,68,0.3))]">
            <Trash2 size={12} className="inline mr-1" />Clear
          </button>
        </div>
      </div>

      {syncProgress && (
        <div className="rounded bg-[var(--vscode-inputValidation-infoBackground)] p-2 text-xs space-y-1">
          <div>Syncing {syncProgress.synced}/{syncProgress.total}...</div>
          <div className="w-full bg-black/20 rounded-full h-1.5">
            <div className="bg-[var(--ina-status-info,#3b82f6)] h-1.5 rounded-full transition-all" style={{ width: `${(syncProgress.synced / Math.max(syncProgress.total, 1)) * 100}%` }} />
          </div>
          {syncProgress.currentItem && <div className="text-[var(--vscode-descriptionForeground)]">Current: {syncProgress.currentItem}</div>}
        </div>
      )}

      <div className="text-xs text-[var(--vscode-descriptionForeground)]">
        {queued.length} queued · {failed.length} failed · {synced.length} synced
      </div>

      <div className="space-y-1 max-h-60 overflow-y-auto">
        {queue.map(item => (
          <div key={item.id} className="flex items-center gap-2 p-1.5 rounded bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)]">
            {typeBadge(item.type)}
            {statusBadge(item.status)}
            <span className="flex-1 truncate text-xs">{typeof item.payload === 'object' ? (item.payload?.userMessage || item.type) : String(item.payload).slice(0, 50)}</span>
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">{timeAgo(item.createdAt)}</span>
            <button onClick={() => onRemove(item.id)} className="p-0.5 hover:bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] rounded" title="Remove"><X size={12} /></button>
          </div>
        ))}
        {queue.length === 0 && <div className="text-center text-xs text-[var(--vscode-descriptionForeground)] py-4">Queue is empty</div>}
      </div>

      {failed.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-[var(--ina-status-error,#f87171)]">Failed Items</div>
          {failed.map(item => (
            <div key={item.id} className="text-xs text-[var(--ina-status-error,#f87171)]/80 px-2">{item.type}: {item.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
