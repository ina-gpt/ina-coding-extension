import React from 'react';
import { ShieldAlert, Check, X, Wrench } from 'lucide-react';

interface CodeWarning {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  line: number | null;
  message: string;
  fix: string | null;
}

interface GeneratedCodeWarningProps {
  warnings: CodeWarning[];
  onApplyAnyway: () => void;
  onApplyFixed?: () => void;
  onCancel: () => void;
  hasAutoFix: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-[var(--ina-status-error,#ef4444)]',
  high: 'text-[var(--ina-status-warning,#f97316)]',
  medium: 'text-[var(--ina-status-warning,#eab308)]',
  low: 'text-[var(--ina-accent-primary,#3b82f6)]',
  info: 'text-[var(--vscode-descriptionForeground)]',
};

export function GeneratedCodeWarning({ warnings, onApplyAnyway, onApplyFixed, onCancel, hasAutoFix }: GeneratedCodeWarningProps) {
  const criticalCount = warnings.filter(w => w.severity === 'critical' || w.severity === 'high').length;

  return (
    <div className="mx-2 my-1 rounded-lg border border-[var(--ina-status-warning,#eab308)]/30 bg-[var(--vscode-editor-background)] p-3">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert size={14} className="text-[var(--ina-status-warning,#eab308)]" />
        <span className="text-sm font-medium">{warnings.length} security concern{warnings.length > 1 ? 's' : ''} in generated code</span>
      </div>

      <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
        {warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 ${SEVERITY_COLORS[w.severity]}`}>
              {w.severity === 'critical' ? '!!' : w.severity === 'high' ? '!' : w.severity === 'info' ? 'i' : '*'}
            </span>
            <span className="text-[var(--vscode-descriptionForeground)]">
              {w.line ? `L${w.line}: ` : ''}{w.message}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {hasAutoFix && onApplyFixed && (
          <button onClick={onApplyFixed} className="px-2.5 py-1 text-xs rounded bg-[var(--ina-status-success,#22c55e)] text-white font-medium hover:opacity-90 flex items-center gap-1">
            <Wrench size={10} /> Apply Auto-Fixed
          </button>
        )}
        <button onClick={onApplyAnyway} className="px-2.5 py-1 text-xs rounded bg-[var(--ina-status-warning,#eab308)] text-black font-medium hover:opacity-90 flex items-center gap-1" title="Code may have security issues">
          <Check size={10} /> Apply Anyway
        </button>
        <button onClick={onCancel} className="px-2.5 py-1 text-xs rounded border border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-toolbar-hoverBackground)] flex items-center gap-1">
          <X size={10} /> Cancel
        </button>
      </div>
    </div>
  );
}

export default GeneratedCodeWarning;
