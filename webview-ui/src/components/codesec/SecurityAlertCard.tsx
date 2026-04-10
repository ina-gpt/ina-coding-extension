import React from 'react';
import { AlertTriangle, Shield, Info, X, Eye, ListX } from 'lucide-react';
import clsx from 'clsx';

interface SecurityAlertCardProps {
  alert: {
    id: string;
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    description: string;
    filePath: string | null;
    secretType: string | null;
    timestamp: number;
  };
  onDismiss: (id: string) => void;
  onViewDetails?: (id: string) => void;
  onWhitelist?: (id: string) => void;
}

const SEVERITY_STYLES: Record<string, { border: string; icon: string; bg: string }> = {
  critical: { border: 'border-l-[var(--ina-status-error,#ef4444)]', icon: 'text-[var(--ina-status-error,#ef4444)]', bg: 'bg-[var(--ina-status-error,#ef4444)]/5' },
  high: { border: 'border-l-[var(--ina-status-warning,#f97316)]', icon: 'text-[var(--ina-status-warning,#f97316)]', bg: 'bg-[var(--ina-status-warning,#f97316)]/5' },
  medium: { border: 'border-l-[var(--ina-status-warning,#eab308)]', icon: 'text-[var(--ina-status-warning,#eab308)]', bg: 'bg-[var(--ina-status-warning,#eab308)]/5' },
  low: { border: 'border-l-[var(--ina-accent-primary,#3b82f6)]', icon: 'text-[var(--ina-accent-primary,#3b82f6)]', bg: 'bg-[var(--ina-accent-primary,#3b82f6)]/5' },
  info: { border: 'border-l-[var(--vscode-descriptionForeground)]', icon: 'text-[var(--vscode-descriptionForeground)]', bg: '' },
};

export function SecurityAlertCard({ alert, onDismiss, onViewDetails, onWhitelist }: SecurityAlertCardProps) {
  const styles = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
  const timeAgo = formatTimeAgo(alert.timestamp);

  return (
    <div className={clsx('border-l-2 rounded-r-md p-3 mb-2', styles.border, styles.bg, 'bg-[var(--vscode-editor-background)]')}>
      <div className="flex items-start gap-2">
        <div className={clsx('mt-0.5', styles.icon)}>
          {alert.severity === 'critical' || alert.severity === 'high' ? <AlertTriangle size={14} /> : alert.severity === 'info' ? <Info size={14} /> : <Shield size={14} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{alert.title}</span>
            <button onClick={() => onDismiss(alert.id)} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Dismiss">
              <X size={12} />
            </button>
          </div>
          <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">{alert.description}</p>
          {alert.filePath && <p className="text-xs text-[var(--vscode-textLink-foreground)] mt-0.5 truncate">{alert.filePath}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{timeAgo}</span>
            {alert.secretType && <span className="text-[10px] px-1 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">{alert.secretType}</span>}
            {onViewDetails && <button onClick={() => onViewDetails(alert.id)} className="text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline flex items-center gap-0.5"><Eye size={10} /> Details</button>}
            {onWhitelist && <button onClick={() => onWhitelist(alert.id)} className="text-[10px] text-[var(--vscode-descriptionForeground)] hover:underline flex items-center gap-0.5"><ListX size={10} /> Whitelist</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default SecurityAlertCard;
