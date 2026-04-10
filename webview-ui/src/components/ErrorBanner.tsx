import React from 'react';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';

interface ErrorBannerProps { message: string; canRetry?: boolean; onDismiss?: () => void; }

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, canRetry = false, onDismiss }) => {
  const { retryLastMessage, isStreaming } = useChatStore();

  return (
    <div className="px-4 py-3 bg-[var(--vscode-inputValidation-errorBackground,#5a1d1d)] border-b border-[var(--vscode-inputValidation-errorBorder,#be1100)]">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-[var(--vscode-errorForeground,#f48771)] flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--vscode-errorForeground,#f48771)]">{message}</p>
          {canRetry && (
            <button onClick={() => retryLastMessage()} disabled={isStreaming}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 transition-colors">
              <RefreshCw size={12} /> Retry
            </button>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"><X size={16} /></button>
        )}
      </div>
    </div>
  );
};
