import React from 'react';
import { postMessage } from '@/utils/vscode';

interface RequestActivityDetailProps {
  requests: any;
  onClose: () => void;
}

export function RequestActivityDetail({ requests, onClose }: RequestActivityDetailProps) {
  if (!requests) return null;
  const errorRate = requests.totalInSession > 0 ? ((requests.failedInSession / requests.totalInSession) * 100).toFixed(1) : '0';

  return (
    <div className="p-3 space-y-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Requests</span>
        <button onClick={onClose} className="text-[var(--vscode-descriptionForeground)] hover:underline text-[10px]">Close</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-1.5 rounded bg-[var(--vscode-input-background)]">
          <div className="text-[var(--vscode-descriptionForeground)]">Active</div>
          <div className="font-mono text-sm">{requests.active}</div>
        </div>
        <div className="p-1.5 rounded bg-[var(--vscode-input-background)]">
          <div className="text-[var(--vscode-descriptionForeground)]">Queued</div>
          <div className="font-mono text-sm">{requests.queued}</div>
        </div>
      </div>
      <div className="space-y-0.5 text-[var(--vscode-descriptionForeground)]">
        <div>Avg latency: {requests.avgLatencyMs ? `${(requests.avgLatencyMs / 1000).toFixed(1)}s` : 'N/A'}</div>
        <div>Throughput: {requests.requestsPerMinute?.toFixed(1) || 0} req/min</div>
        <div>Error rate: {errorRate}%</div>
        <div>Session total: {requests.totalInSession} ({requests.failedInSession} failed)</div>
      </div>
      {requests.active > 0 && (
        <button onClick={() => postMessage({ type: 'cancelAllRequests' } as any)} className="text-[10px] text-[var(--ina-status-error,#ef4444)] hover:underline">
          Cancel All
        </button>
      )}
    </div>
  );
}
