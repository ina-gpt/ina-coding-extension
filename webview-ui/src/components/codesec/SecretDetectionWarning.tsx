import React from 'react';
import { AlertTriangle, Send, X, Eye } from 'lucide-react';

interface SecretDetectionWarningProps {
  detections: { type: string; match: string; line: number | null; severity: string; name: string }[];
  action: 'stripped' | 'blocked' | 'warned';
  onProceed?: () => void;
  onCancel?: () => void;
  onViewDetails?: () => void;
}

export function SecretDetectionWarning({ detections, action, onProceed, onCancel, onViewDetails }: SecretDetectionWarningProps) {
  return (
    <div className="mx-2 mb-2 rounded-lg border border-[var(--ina-status-warning,#eab308)]/30 bg-[var(--ina-status-warning,#eab308)]/5 p-3 animate-in slide-in-from-top-2">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-[var(--ina-status-warning,#eab308)] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {detections.length} potential secret{detections.length > 1 ? 's' : ''} detected
          </p>

          <div className="mt-1.5 space-y-1">
            {detections.slice(0, 5).map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`px-1 rounded text-[10px] font-mono ${d.severity === 'critical' ? 'bg-[var(--ina-status-error,#ef4444)]/20 text-[var(--ina-status-error,#ef4444)]' : 'bg-[var(--ina-status-warning,#eab308)]/20 text-[var(--ina-status-warning,#eab308)]'}`}>
                  {d.name}
                </span>
                <span className="font-mono text-[var(--vscode-descriptionForeground)]">{d.match}</span>
                {d.line && <span className="text-[var(--vscode-descriptionForeground)]">line {d.line}</span>}
              </div>
            ))}
            {detections.length > 5 && (
              <p className="text-xs text-[var(--vscode-descriptionForeground)]">+{detections.length - 5} more</p>
            )}
          </div>

          {action === 'stripped' && (
            <p className="text-xs text-[var(--ina-status-success,#22c55e)] mt-2">Secrets have been automatically redacted</p>
          )}
          {action === 'blocked' && (
            <p className="text-xs text-[var(--ina-status-error,#ef4444)] mt-2">Message blocked. Remove secrets to continue.</p>
          )}

          {action === 'warned' && (
            <div className="flex items-center gap-2 mt-2">
              <button onClick={onProceed} className="px-2 py-1 text-xs rounded bg-[var(--ina-status-warning,#eab308)] text-black font-medium hover:opacity-90 flex items-center gap-1">
                <Send size={10} /> Send Anyway
              </button>
              <button onClick={onCancel} className="px-2 py-1 text-xs rounded border border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-toolbar-hoverBackground)]">
                Cancel
              </button>
              {onViewDetails && (
                <button onClick={onViewDetails} className="px-2 py-1 text-xs text-[var(--vscode-textLink-foreground)] hover:underline flex items-center gap-1">
                  <Eye size={10} /> Details
                </button>
              )}
            </div>
          )}
        </div>

        {(action === 'stripped' || action === 'blocked') && onCancel && (
          <button onClick={onCancel} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default SecretDetectionWarning;
