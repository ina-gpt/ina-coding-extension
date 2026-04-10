import React, { useEffect, useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { CacheHitRateChart } from './CacheHitRateChart';
import { postMessage } from '../../utils/vscode';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

export const CacheStatsPanel: React.FC = () => {
  const { cacheStats } = useChatStore();
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => {
    postMessage({ type: 'requestCacheStats' } as any);
  }, []);

  const handleRefresh = () => postMessage({ type: 'requestCacheStats' } as any);
  const handleClearAll = () => { postMessage({ type: 'clearAllCaches' } as any); setShowConfirmClear(false); };
  const handlePrune = () => postMessage({ type: 'pruneExpired' } as any);
  const handleClearOne = (name: string) => postMessage({ type: 'clearCache', cacheName: name } as any);

  if (!cacheStats) {
    return (
      <div className="p-4 text-center text-xs text-[var(--vscode-descriptionForeground)]">
        <p>Loading cache stats...</p>
        <button onClick={handleRefresh} className="mt-2 px-3 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">Refresh</button>
      </div>
    );
  }

  const cacheEntries = Object.entries(cacheStats.caches || {});
  const chartData = cacheEntries.map(([name, s]) => ({
    name: name.replace('Cache', ''),
    hitRate: s.hitRate,
    size: s.sizeBytes,
    maxSize: s.maxSizeBytes,
  }));

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Overview */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="font-semibold text-sm">Cache</span>
        </div>
        <div className="flex gap-1">
          <button onClick={handleRefresh} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">↻</button>
          <button onClick={handlePrune} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Prune expired">🧹</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded border border-[var(--vscode-panel-border)] text-center">
          <div className="text-base font-bold">{cacheStats.totalEntries}</div>
          <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">Entries</div>
        </div>
        <div className="p-2 rounded border border-[var(--vscode-panel-border)] text-center">
          <div className="text-base font-bold">{formatBytes(cacheStats.totalSizeBytes)}</div>
          <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">Size</div>
        </div>
        <div className="p-2 rounded border border-[var(--vscode-panel-border)] text-center">
          <div className="text-base font-bold" style={{ color: cacheStats.overallHitRate > 0.5 ? '#22c55e' : '#eab308' }}>
            {Math.round(cacheStats.overallHitRate * 100)}%
          </div>
          <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">Hit Rate</div>
        </div>
      </div>

      {/* Hit rate chart */}
      {chartData.length > 0 && (
        <div>
          <span className="text-[10px] font-medium text-[var(--vscode-descriptionForeground)]">Hit Rates & Capacity</span>
          <div className="mt-1">
            <CacheHitRateChart caches={chartData} />
          </div>
        </div>
      )}

      {/* Per-cache table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[var(--vscode-descriptionForeground)] border-b border-[var(--vscode-panel-border)]">
              <th className="text-left py-1">Cache</th>
              <th className="text-right py-1">Entries</th>
              <th className="text-right py-1">Size</th>
              <th className="text-right py-1">Hits</th>
              <th className="text-right py-1">Rate</th>
              <th className="text-right py-1"></th>
            </tr>
          </thead>
          <tbody>
            {cacheEntries.map(([name, s]) => (
              <tr key={name} className="border-b border-[var(--vscode-panel-border)]">
                <td className="py-1">{name.replace('Cache', '')}</td>
                <td className="text-right py-1">{s.size}</td>
                <td className="text-right py-1">{formatBytes(s.sizeBytes)}</td>
                <td className="text-right py-1">{s.hits}/{s.hits + s.misses}</td>
                <td className="text-right py-1" style={{ color: s.hitRate > 0.5 ? '#22c55e' : s.hitRate > 0.2 ? '#eab308' : '#ef4444' }}>
                  {Math.round(s.hitRate * 100)}%
                </td>
                <td className="text-right py-1">
                  <button onClick={() => handleClearOne(name)} className="text-[9px] px-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">Clear</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recommendations */}
      {cacheStats.recommendations && cacheStats.recommendations.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-[var(--vscode-descriptionForeground)]">Recommendations</span>
          {cacheStats.recommendations.map((rec: string, i: number) => (
            <div key={i} className="text-[10px] px-2 py-1 rounded bg-[var(--vscode-editor-background)]">💡 {rec}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-1">
        {showConfirmClear ? (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[var(--vscode-errorForeground)]">Clear all?</span>
            <button onClick={handleClearAll} className="px-2 py-0.5 rounded bg-[var(--vscode-errorForeground)] text-[var(--ina-accent-primary-text,#fff)] text-[10px]">Yes</button>
            <button onClick={() => setShowConfirmClear(false)} className="px-2 py-0.5 rounded text-[10px]">No</button>
          </div>
        ) : (
          <button onClick={() => setShowConfirmClear(true)} className="text-[10px] px-2 py-1 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]">
            Clear All Caches
          </button>
        )}
      </div>
    </div>
  );
};
