import React, { useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { postMessage } from '../../utils/vscode';

export const RequestStatsPanel: React.FC = () => {
  const { requestMetrics } = useChatStore();

  useEffect(() => {
    postMessage({ type: 'requestStatsRequest' } as any);
    const timer = setInterval(() => postMessage({ type: 'requestStatsRequest' } as any), 5000);
    return () => clearInterval(timer);
  }, []);

  if (!requestMetrics) {
    return <div className="p-4 text-xs text-center text-[var(--vscode-descriptionForeground)]">Loading request stats...</div>;
  }

  const m = requestMetrics;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <span className="font-semibold text-sm">Request Stats</span>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Active" value={m.activeRequests} color={m.activeRequests > 0 ? '#22c55e' : undefined} />
        <StatBox label="Queued" value={m.queuedRequests} />
        <StatBox label="Req/min" value={Math.round(m.requestsPerMinute)} />
        <StatBox label="Avg ms" value={Math.round(m.avgExecutionTimeMs)} />
      </div>

      {/* Percentiles */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="p50" value={`${Math.round(m.p50Ms)}ms`} />
        <StatBox label="p95" value={`${Math.round(m.p95Ms)}ms`} />
        <StatBox label="p99" value={`${Math.round(m.p99Ms)}ms`} />
      </div>

      {/* Optimization stats */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {m.deduplicatedRequests > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)]">🔗 {m.deduplicatedRequests} deduplicated</span>}
        {m.batchesMerged > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)]">📦 {m.batchesMerged} batched</span>}
        {m.staleCancellations > 0 && <span className="px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)]">⏱ {m.staleCancellations} stale</span>}
      </div>

      {/* Per-category table */}
      {m.byCategory && Object.keys(m.byCategory).length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[var(--vscode-descriptionForeground)] border-b border-[var(--vscode-panel-border)]">
                <th className="text-left py-1">Category</th>
                <th className="text-right py-1">Active</th>
                <th className="text-right py-1">Total</th>
                <th className="text-right py-1">Avg ms</th>
                <th className="text-right py-1">Err%</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(m.byCategory)
                .filter(([, v]) => v.total > 0)
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([cat, v]) => (
                  <tr key={cat} className="border-b border-[var(--vscode-panel-border)]">
                    <td className="py-1">{cat}</td>
                    <td className="text-right py-1">{v.active}</td>
                    <td className="text-right py-1">{v.total}</td>
                    <td className="text-right py-1" style={{ color: v.avgMs > 2000 ? '#ef4444' : v.avgMs > 500 ? '#eab308' : '#22c55e' }}>
                      {Math.round(v.avgMs)}
                    </td>
                    <td className="text-right py-1" style={{ color: v.errorRate > 0.1 ? '#ef4444' : undefined }}>
                      {Math.round(v.errorRate * 100)}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status counts */}
      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <span>Completed: {m.completedRequests}</span>
        <span>Failed: {m.failedRequests}</span>
        <span>Cancelled: {m.cancelledRequests}</span>
      </div>
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
  <div className="p-1.5 rounded border border-[var(--vscode-panel-border)] text-center">
    <div className="text-sm font-bold" style={color ? { color } : undefined}>{value}</div>
    <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">{label}</div>
  </div>
);
