import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface StatusBarProps {
  status: any;
  onItemClick: (id: string) => void;
}

export function StatusBar({ status, onItemClick }: StatusBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  if (!status) return null;

  const fmt = (n: number) => n < 1000 ? String(n) : n < 1000000 ? `${Math.round(n / 1000)}K` : `${(n / 1000000).toFixed(1)}M`;
  const ctxPercent = status.tokens?.contextWindowPercent || 0;

  if (collapsed) {
    return (
      <div className="h-[22px] flex items-center px-1 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
        <button onClick={() => setCollapsed(false)} className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"><ChevronRight size={10} /></button>
      </div>
    );
  }

  return (
    <div className="h-[22px] flex items-center gap-2 px-2 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] text-[10px] overflow-x-auto">
      <button onClick={() => setCollapsed(true)} className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded flex-shrink-0"><ChevronLeft size={10} /></button>

      {/* Connection */}
      <button onClick={() => onItemClick('connection')} className="flex items-center gap-1 hover:opacity-80" title={`Connection: ${status.connection?.state}`}>
        <span className={clsx('h-1.5 w-1.5 rounded-full',
          status.connection?.state === 'online' ? 'bg-[var(--ina-status-success,#22c55e)]' :
          status.connection?.state === 'degraded' ? 'bg-[var(--ina-status-warning,#eab308)]' :
          'bg-[var(--ina-status-error,#ef4444)]'
        )} />
        {status.connection?.latencyMs && <span className="text-[var(--vscode-descriptionForeground)]">{status.connection.latencyMs}ms</span>}
      </button>

      {/* Model */}
      <button onClick={() => onItemClick('model')} className="flex items-center gap-1 hover:opacity-80 text-[var(--vscode-descriptionForeground)]" title={`Model: ${status.model?.modelName || '?'}`}>
        <span>{status.model?.modelName || '?'}</span>
      </button>

      <span className="w-px h-3 bg-[var(--vscode-panel-border)]" />

      {/* Active requests */}
      {(status.requests?.active > 0 || status.requests?.queued > 0) && (
        <>
          <button onClick={() => onItemClick('requests')} className="flex items-center gap-1 hover:opacity-80 text-[var(--ina-accent-primary,#3b82f6)]">
            <span className="animate-pulse">●</span>
            <span>{status.requests.active}</span>
          </button>
          <span className="w-px h-3 bg-[var(--vscode-panel-border)]" />
        </>
      )}

      {/* Tokens */}
      <button onClick={() => onItemClick('tokens')} className="flex items-center gap-1 hover:opacity-80" title={`Session: ${fmt(status.tokens?.sessionTotalTokens || 0)} tokens`}>
        <span className="text-[var(--vscode-descriptionForeground)]">{fmt(status.tokens?.sessionTotalTokens || 0)}</span>
      </button>

      {/* Context window mini bar */}
      {status.tokens?.contextWindowMax > 0 && (
        <div className="w-12 h-1.5 rounded-full bg-[var(--vscode-editor-background)] overflow-hidden" title={`Context: ${ctxPercent}%`}>
          <div className={clsx('h-full rounded-full transition-all',
            ctxPercent > 95 ? 'bg-[var(--ina-status-error,#ef4444)]' : ctxPercent > 80 ? 'bg-[var(--ina-status-warning,#eab308)]' : 'bg-[var(--ina-accent-primary,#3b82f6)]'
          )} style={{ width: `${ctxPercent}%` }} />
        </div>
      )}

      <span className="w-px h-3 bg-[var(--vscode-panel-border)]" />

      {/* Git */}
      {status.git?.branch && (
        <button onClick={() => onItemClick('git')} className="flex items-center gap-1 hover:opacity-80 text-[var(--vscode-descriptionForeground)]">
          <span>{status.git.branch}</span>
          {status.git.changesCount > 0 && <span className="text-[var(--ina-status-warning,#eab308)]">●{status.git.changesCount}</span>}
        </button>
      )}

      {/* Diagnostics */}
      {status.diagnostics?.errors > 0 && (
        <button onClick={() => onItemClick('diagnostics')} className="flex items-center gap-1 hover:opacity-80 text-[var(--ina-status-error,#ef4444)]">
          {status.diagnostics.errors}E
          {status.diagnostics.warnings > 0 && <span className="text-[var(--ina-status-warning,#eab308)]">{status.diagnostics.warnings}W</span>}
        </button>
      )}

      {/* Agent */}
      {status.agent?.isActive && (
        <>
          <span className="w-px h-3 bg-[var(--vscode-panel-border)]" />
          <button onClick={() => onItemClick('agent')} className="flex items-center gap-1 hover:opacity-80 text-[var(--ina-accent-primary,#3b82f6)]">
            <span>🤖</span>
            <span>{status.agent.currentStep || status.agent.status || 'Agent'}</span>
          </button>
        </>
      )}
    </div>
  );
}
