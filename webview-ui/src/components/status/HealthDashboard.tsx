import React from 'react';
import { X, RefreshCw } from 'lucide-react';
import { HealthCard } from './HealthCard';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface HealthDashboardProps {
  status: any;
  healthReport: any;
  onClose: () => void;
}

const HEALTH_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  healthy: { label: 'All Systems Operational', color: 'text-[var(--ina-status-success,#22c55e)]', icon: '💚' },
  degraded: { label: 'Performance Degraded', color: 'text-[var(--ina-status-warning,#eab308)]', icon: '💛' },
  unhealthy: { label: 'Issues Detected', color: 'text-[var(--ina-status-error,#ef4444)]', icon: '❤️' },
  offline: { label: 'Offline', color: 'text-[var(--ina-status-error,#ef4444)]', icon: '🖤' },
  unknown: { label: 'Checking...', color: 'text-[var(--vscode-descriptionForeground)]', icon: '🤍' },
};

export function HealthDashboard({ status, healthReport, onClose }: HealthDashboardProps) {
  const report = healthReport || { overall: status?.overall || 'unknown', sections: [], recommendations: [] };
  const healthInfo = HEALTH_LABELS[report.overall] || HEALTH_LABELS.unknown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 max-h-[85vh] rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <span className={clsx('text-lg', report.overall !== 'healthy' && 'animate-pulse')}>{healthInfo.icon}</span>
            <div>
              <h3 className="font-semibold text-sm">System Health</h3>
              <span className={clsx('text-xs', healthInfo.color)}>{healthInfo.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => postMessage({ type: 'requestSystemStatus' } as any)} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Refresh"><RefreshCw size={14} /></button>
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"><X size={16} /></button>
          </div>
        </div>

        {/* Health Grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {report.sections.map((section: any, i: number) => (
              <HealthCard key={i} section={section} />
            ))}
          </div>

          {/* Quick status from live data */}
          {status && !report.sections.length && (
            <div className="grid grid-cols-2 gap-2">
              <HealthCard section={{ name: 'Connection', status: status.connection?.state === 'online' ? 'healthy' : 'unhealthy', icon: '$(cloud)', details: [
                { label: 'State', value: status.connection?.state || 'unknown', status: status.connection?.state === 'online' ? 'good' : 'error', tooltip: null },
                { label: 'Latency', value: status.connection?.latencyMs ? `${status.connection.latencyMs}ms` : 'N/A', status: 'neutral', tooltip: null },
              ]}} />
              <HealthCard section={{ name: 'AI Model', status: status.model?.state === 'ready' ? 'healthy' : 'degraded', icon: '$(hubot)', details: [
                { label: 'Model', value: status.model?.modelName || 'unknown', status: 'neutral', tooltip: null },
                { label: 'State', value: status.model?.state || 'unknown', status: status.model?.state === 'ready' ? 'good' : 'warn', tooltip: null },
              ]}} />
              <HealthCard section={{ name: 'Cache', status: 'healthy', icon: '$(database)', details: [
                { label: 'Hit rate', value: `${Math.round((status.cache?.hitRate || 0) * 100)}%`, status: (status.cache?.hitRate || 0) > 0.5 ? 'good' : 'warn', tooltip: null },
                { label: 'Entries', value: String(status.cache?.totalEntries || 0), status: 'neutral', tooltip: null },
              ]}} />
              <HealthCard section={{ name: 'Breakers', status: (status.circuitBreakers?.open || 0) > 0 ? 'unhealthy' : 'healthy', icon: '$(shield)', details: [
                { label: 'Closed', value: String(status.circuitBreakers?.closed || 0), status: 'good', tooltip: null },
                { label: 'Open', value: String(status.circuitBreakers?.open || 0), status: (status.circuitBreakers?.open || 0) > 0 ? 'error' : 'good', tooltip: null },
              ]}} />
              <HealthCard section={{ name: 'Tokens', status: 'healthy', icon: '$(symbol-number)', details: [
                { label: 'Session', value: fmtTokens(status.tokens?.sessionTotalTokens || 0), status: 'neutral', tooltip: null },
                { label: 'Context', value: status.tokens?.contextWindowPercent ? `${status.tokens.contextWindowPercent}%` : 'N/A', status: (status.tokens?.contextWindowPercent || 0) > 80 ? 'warn' : 'good', tooltip: null },
              ]}} />
              <HealthCard section={{ name: 'Memory', status: 'healthy', icon: '$(brain)', details: [
                { label: 'Memories', value: String(status.memory?.memoriesCount || 0), status: 'neutral', tooltip: null },
                { label: 'Auto-extract', value: status.memory?.autoExtractEnabled ? 'On' : 'Off', status: 'neutral', tooltip: null },
              ]}} />
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold">Recommendations</div>
              {report.recommendations.map((r: string, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-[var(--vscode-input-background)]">
                  <span>💡</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          {report.quickActions?.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {report.quickActions.map((a: any, i: number) => (
                <button key={i} onClick={() => postMessage({ type: a.command?.replace('inaCoding.', '') || '' } as any)}
                  className="px-3 py-1.5 rounded text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]">
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1)}M`;
}
