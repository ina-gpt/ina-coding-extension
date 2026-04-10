import React from 'react';
import clsx from 'clsx';

interface OnboardingProgressProps {
  progress: { completed: number; total: number; percentage: number };
  onResume: () => void;
}

export function OnboardingProgress({ progress, onResume }: OnboardingProgressProps) {
  if (progress.percentage >= 100) return null;

  return (
    <button onClick={onResume}
      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
      title="Resume onboarding setup">
      <div className="w-16 h-1.5 rounded-full bg-[var(--vscode-descriptionForeground)] opacity-20">
        <div className="h-full rounded-full bg-[var(--ina-accent-primary,#3b82f6)] transition-all"
          style={{ width: `${progress.percentage}%` }} />
      </div>
      <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
        {progress.completed}/{progress.total}
      </span>
    </button>
  );
}
