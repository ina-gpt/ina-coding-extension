import React from 'react';
import { Shield } from 'lucide-react';
import clsx from 'clsx';

interface PrivacyBadgeProps {
  mode: string;
  telemetryEnabled: boolean;
  encrypted: boolean;
  onClick: () => void;
}

export function PrivacyBadge({ mode, telemetryEnabled, encrypted, onClick }: PrivacyBadgeProps) {
  const isStrict = mode !== 'standard';
  const color = isStrict ? 'text-[var(--ina-status-success,#22c55e)]' : telemetryEnabled ? 'text-[var(--ina-status-warning,#eab308)]' : 'text-[var(--ina-accent-primary,#3b82f6)]';

  const tooltip = `Privacy: ${mode}${encrypted ? ' • Encrypted' : ''}${!telemetryEnabled ? ' • No telemetry' : ''}`;

  return (
    <button onClick={onClick} className={clsx('p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors', color)} title={tooltip}>
      <Shield size={14} />
    </button>
  );
}
