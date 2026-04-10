import React from 'react';
import clsx from 'clsx';

interface CircuitBreakerStatusProps {
  breakers: { name: string; state: string; failures: number; lastFailure: number | null }[];
  onClick?: () => void;
}

export function CircuitBreakerStatus({ breakers, onClick }: CircuitBreakerStatusProps) {
  if (!breakers || breakers.length === 0) return null;
  const openCount = breakers.filter(b => b.state === 'open').length;
  if (openCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-xs"
      title={`${openCount} service(s) degraded`}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--ina-status-error,#ef4444)] opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--ina-status-error,#ef4444)]" />
      </span>
      <span className="text-[var(--ina-status-error,#f87171)]">{openCount} degraded</span>
    </button>
  );
}
