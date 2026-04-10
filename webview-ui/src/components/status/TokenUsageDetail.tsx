import React from 'react';
import { ContextWindowBar } from './ContextWindowBar';
import clsx from 'clsx';

interface TokenUsageDetailProps {
  tokens: any;
  onReset: () => void;
  onClose: () => void;
}

export function TokenUsageDetail({ tokens, onReset, onClose }: TokenUsageDetailProps) {
  if (!tokens) return null;
  const fmt = (n: number) => n < 1000 ? String(n) : n < 1000000 ? `${Math.round(n / 1000)}K` : `${(n / 1000000).toFixed(1)}M`;
  const ctxPercent = tokens.contextWindowPercent || 0;

  return (
    <div className="p-3 space-y-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Token Usage</span>
        <button onClick={onClose} className="text-[var(--vscode-descriptionForeground)] hover:underline text-[10px]">Close</button>
      </div>

      {/* Session */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded bg-[var(--vscode-input-background)]">
          <div className="text-[var(--vscode-descriptionForeground)]">Input</div>
          <div className="font-mono text-sm">{fmt(tokens.sessionTokensIn || 0)}</div>
        </div>
        <div className="p-2 rounded bg-[var(--vscode-input-background)]">
          <div className="text-[var(--vscode-descriptionForeground)]">Output</div>
          <div className="font-mono text-sm">{fmt(tokens.sessionTokensOut || 0)}</div>
        </div>
        <div className="p-2 rounded bg-[var(--vscode-input-background)]">
          <div className="text-[var(--vscode-descriptionForeground)]">Total</div>
          <div className="font-mono text-sm font-semibold">{fmt(tokens.sessionTotalTokens || 0)}</div>
        </div>
      </div>

      {/* Context Window */}
      {tokens.contextWindowMax > 0 && (
        <div>
          <ContextWindowBar used={tokens.contextWindowUsed || 0} max={tokens.contextWindowMax || 0} />
          {ctxPercent > 80 && (
            <div className={clsx('mt-1 text-[10px]', ctxPercent > 95 ? 'text-[var(--ina-status-error,#ef4444)]' : 'text-[var(--ina-status-warning,#eab308)]')}>
              {ctxPercent > 95 ? '⚠️ Context nearly full — responses may be truncated' : '⚠️ Context window getting full'}
            </div>
          )}
        </div>
      )}

      {/* Daily/Monthly */}
      <div className="flex gap-4 text-[var(--vscode-descriptionForeground)]">
        <span>Today: <span className="font-mono">{fmt(tokens.dailyTokens || 0)}</span></span>
        <span>Month: <span className="font-mono">{fmt(tokens.monthlyTokens || 0)}</span></span>
      </div>

      {/* Last request */}
      {tokens.lastRequestTokensIn && (
        <div className="text-[var(--vscode-descriptionForeground)]">
          Last: {tokens.lastRequestTokensIn} in / {tokens.lastRequestTokensOut || 0} out
        </div>
      )}

      <button onClick={onReset} className="text-[10px] text-[var(--ina-accent-primary,#3b82f6)] hover:underline">
        Reset Session Counter
      </button>
    </div>
  );
}
