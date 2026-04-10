import React, { useState, useEffect } from 'react';
import { AlertTriangle, WifiOff, Zap, RefreshCw, X, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

interface OfflineBannerProps {
  state: string;
  queueSize: number;
  localModelAvailable: boolean;
  reconnectAttempts?: number;
  onRetry: () => void;
  onShowDetails: () => void;
  onDismiss: () => void;
}

export function OfflineBanner({ state, queueSize, localModelAvailable, reconnectAttempts, onRetry, onShowDetails, onDismiss }: OfflineBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [autoDismiss, setAutoDismiss] = useState(false);

  useEffect(() => {
    if (state === 'online' && !autoDismiss) {
      setAutoDismiss(true);
      const timer = setTimeout(onDismiss, 5000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (state === 'online' && autoDismiss) {
    return (
      <div className="px-3 py-1.5 bg-[var(--vscode-testing-iconPassed)] bg-opacity-20 text-[var(--vscode-testing-iconPassed)] text-xs flex items-center gap-2 rounded-md mx-2 mt-1">
        <CheckCircle size={14} />
        <span>Back online!{queueSize > 0 ? ` Syncing ${queueSize} queued items...` : ''}</span>
      </div>
    );
  }

  if (state === 'online' || state === 'unknown') return null;

  const configs: Record<string, { icon: React.ReactNode; bg: string; text: string; message: string }> = {
    offline: {
      icon: <WifiOff size={14} />,
      bg: 'bg-[var(--vscode-inputValidation-errorBackground)]',
      text: 'text-[var(--vscode-inputValidation-errorForeground)]',
      message: localModelAvailable
        ? `Offline — Using local model${queueSize > 0 ? ` (${queueSize} queued)` : ''}`
        : `Offline — ${queueSize > 0 ? `${queueSize} messages queued` : 'Limited functionality'}`,
    },
    degraded: {
      icon: <Zap size={14} />,
      bg: 'bg-[var(--vscode-inputValidation-warningBackground)]',
      text: 'text-[var(--vscode-inputValidation-warningForeground)]',
      message: 'Slow connection — Some features may be limited',
    },
    reconnecting: {
      icon: <RefreshCw size={14} className="animate-spin" />,
      bg: 'bg-[var(--vscode-inputValidation-infoBackground)]',
      text: 'text-[var(--vscode-inputValidation-infoForeground)]',
      message: `Reconnecting...${reconnectAttempts ? ` (attempt ${reconnectAttempts})` : ''}`,
    },
  };

  const config = configs[state] || configs.offline;

  return (
    <div className={clsx('mx-2 mt-1 rounded-md text-xs', config.bg, config.text)}>
      <div className="flex items-center gap-2 px-3 py-1.5">
        {config.icon}
        <span className="flex-1">{config.message}</span>
        <div className="flex items-center gap-1">
          {state === 'offline' && (
            <button onClick={onRetry} className="px-2 py-0.5 rounded hover:bg-black/10 text-xs" title="Retry connection">
              Retry
            </button>
          )}
          <button onClick={onShowDetails} className="px-2 py-0.5 rounded hover:bg-black/10 text-xs">
            {expanded ? 'Less' : 'Details'}
          </button>
          <button onClick={() => { setExpanded(!expanded); }} className="p-0.5 hover:bg-black/10 rounded">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button onClick={onDismiss} className="p-0.5 hover:bg-black/10 rounded" title="Dismiss">
            <X size={12} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-2 border-t border-current/10 pt-1.5 space-y-1">
          <div className="font-medium">What works offline:</div>
          {[
            { name: 'Git / LSP / Rules', available: true },
            { name: 'Cached responses', available: true },
            { name: 'Local model chat', available: localModelAvailable },
            { name: 'Tab completion', available: localModelAvailable },
            { name: 'Agent mode', available: false },
            { name: 'Image analysis', available: false },
          ].map(cap => (
            <div key={cap.name} className="flex items-center gap-1.5">
              <span>{cap.available ? '✅' : '❌'}</span>
              <span>{cap.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
