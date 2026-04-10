import React from 'react';
import { AlertTriangle, RefreshCw, Shield, BarChart3, Heart, Trash2 } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

export function ErrorDashboard() {
  const { errorAnalytics, circuitBreakers } = useChatStore();
  const analytics = errorAnalytics;

  if (!analytics) {
    return (
      <div className="p-4 text-sm text-[var(--vscode-descriptionForeground)]">
        <p>Loading error analytics...</p>
        <button onClick={() => postMessage({ type: 'requestErrorAnalytics' } as any)} className="mt-2 px-3 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-xs">
          Load Analytics
        </button>
      </div>
    );
  }

  const trendIcons: Record<string, string> = { improving: '📉', stable: '➡️', worsening: '📈' };
  const trendIcon = trendIcons[analytics.trendDirection as string] || '➡️';

  return (
    <div className="p-3 space-y-4 text-sm">
      <h3 className="font-medium flex items-center gap-2"><Shield size={16} /> Error Dashboard</h3>

      {/* Overview */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)]">
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">Error Rate</div>
          <div className="text-lg font-mono">{analytics.errorRate.toFixed(1)}/min {trendIcon}</div>
        </div>
        <div className="p-2 rounded bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)]">
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">Retry Success</div>
          <div className="text-lg font-mono">{(analytics.retrySuccessRate * 100).toFixed(0)}%</div>
        </div>
        <div className="p-2 rounded bg-[var(--vscode-editor-background)] border border-[var(--vscode-widget-border)]">
          <div className="text-xs text-[var(--vscode-descriptionForeground)]">CB Trips</div>
          <div className="text-lg font-mono">{analytics.circuitBreakerTrips}</div>
        </div>
      </div>

      {/* Category Breakdown */}
      {Object.keys(analytics.errorsByCategory).length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">By Category</div>
          <div className="space-y-0.5">
            {Object.entries(analytics.errorsByCategory as Record<string, number>).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cat, count]: [string, number]) => (
              <div key={cat} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate">{cat}</span>
                <div className="flex-1 bg-[var(--vscode-editor-background)] rounded-full h-1.5">
                  <div className="bg-[var(--ina-status-error,#ef4444)]/60 h-1.5 rounded-full" style={{ width: `${Math.min(100, (count / Math.max(analytics.totalErrors, 1)) * 100)}%` }} />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Errors */}
      {analytics.topErrors.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">Top Errors</div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {analytics.topErrors.slice(0, 5).map((e: any) => (
              <div key={e.fingerprint} className="text-xs px-2 py-1 rounded bg-[var(--vscode-editor-background)] flex items-center gap-2">
                <span className="flex-1 truncate">{e.message}</span>
                <span className="text-[var(--ina-status-error,#f87171)] font-mono">{e.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Circuit Breakers */}
      {circuitBreakers && circuitBreakers.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">Circuit Breakers</div>
          <div className="grid grid-cols-2 gap-1">
            {circuitBreakers.map(b => (
              <div key={b.name} className={clsx('text-xs px-2 py-1 rounded border', b.state === 'closed' ? 'border-[var(--ina-status-success,#22c55e)]/30 bg-[var(--ina-status-success-bg,rgba(34,197,94,0.05))]' : b.state === 'open' ? 'border-[var(--ina-status-error,#ef4444)]/30 bg-[var(--ina-status-error-bg,rgba(239,68,68,0.05))]' : 'border-[var(--ina-status-warning,#eab308)]/30 bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.05))]')}>
                <div className="flex items-center gap-1">
                  <span className={clsx('h-1.5 w-1.5 rounded-full', b.state === 'closed' ? 'bg-[var(--ina-status-success,#22c55e)]' : b.state === 'open' ? 'bg-[var(--ina-status-error,#ef4444)]' : 'bg-[var(--ina-status-warning,#eab308)]')} />
                  <span className="truncate">{b.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-[var(--vscode-widget-border)]">
        <button onClick={() => postMessage({ type: 'resetAllCircuitBreakers' } as any)} className="px-2 py-1 rounded text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">
          <RefreshCw size={10} className="inline mr-1" />Reset CBs
        </button>
        <button onClick={() => postMessage({ type: 'runSelfHeal' } as any)} className="px-2 py-1 rounded text-xs bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))]">
          <Heart size={10} className="inline mr-1" />Self-Heal
        </button>
        <button onClick={() => postMessage({ type: 'clearErrorHistory' } as any)} className="px-2 py-1 rounded text-xs bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))]">
          <Trash2 size={10} className="inline mr-1" />Clear
        </button>
      </div>
    </div>
  );
}
