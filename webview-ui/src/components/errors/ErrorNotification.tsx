import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, XCircle, RefreshCw, Bug, X, ChevronDown, ThumbsUp, ThumbsDown } from 'lucide-react';
import clsx from 'clsx';

interface ErrorNotificationProps {
  error: { category: string; severity: string; userMessage: string; retryable: boolean; id: string };
  recovery?: { recovered: boolean; fallbackUsed: boolean; fallbackSource: string | null; retried: boolean; retryAttempts: number } | null;
  onRetry?: () => void;
  onFeedback?: (rating: 'helpful' | 'not_helpful') => void;
  onDismiss?: () => void;
  onReport?: () => void;
}

export function ErrorNotification({ error, recovery, onRetry, onFeedback, onDismiss, onReport }: ErrorNotificationProps) {
  const [dismissed, setDismissed] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  useEffect(() => {
    if (error.severity === 'transient' && recovery?.recovered) {
      const timer = setTimeout(() => setDismissed(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [error, recovery]);

  if (dismissed) return null;

  const isRecovered = recovery?.recovered;
  const severity = error.severity;

  const config = {
    transient: { icon: <RefreshCw size={14} className="animate-spin" />, bg: 'bg-[var(--ina-status-info-bg,rgba(59,130,246,0.1))]', border: 'border-[var(--ina-status-info,#3b82f6)]/30', text: 'text-[var(--ina-status-info,#60a5fa)]' },
    warning: { icon: <AlertTriangle size={14} />, bg: 'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))]', border: 'border-[var(--ina-status-warning,#eab308)]/30', text: 'text-[var(--ina-status-warning,#facc15)]' },
    error: { icon: <AlertCircle size={14} />, bg: 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.1))]', border: 'border-[var(--ina-status-error,#ef4444)]/30', text: 'text-[var(--ina-status-error,#f87171)]' },
    fatal: { icon: <XCircle size={14} />, bg: 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))]', border: 'border-[var(--ina-status-error,#ef4444)]/50', text: 'text-[var(--ina-status-error,#fca5a5)]' },
  }[severity] || { icon: <AlertCircle size={14} />, bg: 'bg-[var(--ina-bg-tertiary,rgba(128,128,128,0.1))]', border: 'border-[var(--ina-border-secondary,rgba(128,128,128,0.3))]', text: 'text-[var(--ina-text-secondary,#9ca3af)]' };

  return (
    <div className={clsx('rounded-md border p-2 mt-1 text-xs', config.bg, config.border, config.text)}>
      <div className="flex items-start gap-2">
        {config.icon}
        <div className="flex-1">
          <div>{error.userMessage}</div>
          {isRecovered && recovery?.fallbackUsed && (
            <div className="mt-1 opacity-75">Used alternative: {recovery.fallbackSource}</div>
          )}
          {isRecovered && recovery?.retried && (
            <div className="mt-1 opacity-75">Recovered after {recovery.retryAttempts} retries</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {error.retryable && onRetry && !isRecovered && (
            <button onClick={onRetry} className="px-1.5 py-0.5 rounded hover:bg-white/10 text-xs">Retry</button>
          )}
          {onReport && severity !== 'transient' && (
            <button onClick={onReport} className="p-0.5 hover:bg-white/10 rounded" title="Report bug"><Bug size={12} /></button>
          )}
          {onDismiss && (
            <button onClick={() => { setDismissed(true); onDismiss(); }} className="p-0.5 hover:bg-white/10 rounded"><X size={12} /></button>
          )}
        </div>
      </div>
      {isRecovered && !feedbackGiven && onFeedback && (
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-current/10">
          <span className="opacity-60">Was this helpful?</span>
          <button onClick={() => { onFeedback('helpful'); setFeedbackGiven(true); }} className="p-0.5 hover:bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))] rounded"><ThumbsUp size={12} /></button>
          <button onClick={() => { onFeedback('not_helpful'); setFeedbackGiven(true); }} className="p-0.5 hover:bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] rounded"><ThumbsDown size={12} /></button>
        </div>
      )}
      {feedbackGiven && <div className="mt-1 opacity-50 text-xs">Thanks for your feedback!</div>}
    </div>
  );
}
