import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { ShortcutKeyCombo } from './ShortcutKeyCombo';
import clsx from 'clsx';

interface ConflictData {
  shortcutId: string;
  conflictsWith: { source: string; command: string; keys: string };
  severity: 'blocking' | 'override' | 'context-safe';
  suggestion: string;
}

interface ShortcutConflictAlertProps {
  conflicts: ConflictData[];
  onResolve: (conflict: ConflictData) => void;
  onDismiss: () => void;
  onAutoResolve: () => void;
}

export function ShortcutConflictAlert({ conflicts, onResolve, onDismiss, onAutoResolve }: ShortcutConflictAlertProps) {
  if (conflicts.length === 0) return null;

  const blocking = conflicts.filter(c => c.severity === 'blocking');
  const safe = conflicts.filter(c => c.severity === 'context-safe');

  return (
    <div className={clsx('rounded-lg border p-3 space-y-2',
      blocking.length > 0 ? 'border-[var(--ina-status-error,#ef4444)]/30 bg-[var(--ina-status-error-bg,rgba(239,68,68,0.05))]' : 'border-[var(--ina-status-warning,#eab308)]/30 bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.05))]')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium">
          <AlertTriangle size={14} />
          {conflicts.length} shortcut conflict{conflicts.length > 1 ? 's' : ''} detected
        </div>
        <button onClick={onDismiss} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"><X size={12} /></button>
      </div>

      <div className="space-y-1 max-h-32 overflow-y-auto">
        {conflicts.slice(0, 5).map((c, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-[var(--vscode-editor-background)]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[10px]">{c.conflictsWith.keys}</span>
              <span className="truncate">INA vs {c.conflictsWith.source}</span>
              <span className={clsx('px-1 py-0.5 rounded text-[9px]',
                c.severity === 'blocking' ? 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] text-[var(--ina-status-error,#ef4444)]' :
                c.severity === 'context-safe' ? 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))] text-[var(--ina-status-success,#22c55e)]' :
                'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.2))] text-[var(--ina-status-warning,#eab308)]'
              )}>{c.severity}</span>
            </div>
            {c.severity === 'blocking' && (
              <button onClick={() => onResolve(c)} className="text-[10px] text-[var(--ina-accent-primary,#3b82f6)] hover:underline ml-2">Resolve</button>
            )}
          </div>
        ))}
      </div>

      {safe.length > 0 && (
        <button onClick={onAutoResolve} className="text-xs text-[var(--ina-accent-primary,#3b82f6)] hover:underline">
          Auto-resolve {safe.length} safe conflict{safe.length > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
