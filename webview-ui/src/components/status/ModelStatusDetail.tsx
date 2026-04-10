import React from 'react';
import clsx from 'clsx';

interface ModelStatusDetailProps {
  model: any;
  onClose: () => void;
}

export function ModelStatusDetail({ model, onClose }: ModelStatusDetailProps) {
  if (!model) return null;
  const stateColors: Record<string, string> = { ready: 'text-[var(--ina-status-success,#22c55e)]', loading: 'text-[var(--ina-status-warning,#eab308)]', unavailable: 'text-[var(--ina-status-error,#ef4444)]' };

  return (
    <div className="p-3 space-y-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">AI Model</span>
        <button onClick={onClose} className="text-[var(--vscode-descriptionForeground)] hover:underline text-[10px]">Close</button>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono">{model.modelName || 'unknown'}</span>
        <span className={clsx('capitalize', stateColors[model.state] || '')}>{model.state}</span>
      </div>
      {model.vramUsedMB && model.vramTotalMB && (
        <div>
          <div className="flex justify-between text-[10px] text-[var(--vscode-descriptionForeground)] mb-0.5">
            <span>VRAM</span>
            <span>{model.vramUsedMB}/{model.vramTotalMB} GB ({model.vramPercent || 0}%)</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--vscode-editor-background)]">
            <div className={clsx('h-full rounded-full', (model.vramPercent || 0) > 95 ? 'bg-[var(--ina-status-error,#ef4444)]' : (model.vramPercent || 0) > 85 ? 'bg-[var(--ina-status-warning,#eab308)]' : 'bg-[var(--ina-accent-primary,#3b82f6)]')}
              style={{ width: `${model.vramPercent || 0}%` }} />
          </div>
        </div>
      )}
      {model.lastResponseMs && <div className="text-[var(--vscode-descriptionForeground)]">Last response: {(model.lastResponseMs / 1000).toFixed(1)}s</div>}
      <div className="text-[var(--vscode-descriptionForeground)]">Active: {model.requestsActive} • Queue: {model.queueDepth}</div>
    </div>
  );
}
