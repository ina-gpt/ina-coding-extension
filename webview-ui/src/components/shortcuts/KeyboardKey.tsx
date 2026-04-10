import React from 'react';
import clsx from 'clsx';

interface KeyboardKeyProps {
  keyLabel: string;
  size?: 'sm' | 'md' | 'lg';
  isActive?: boolean;
  variant?: 'default' | 'accent' | 'warning';
}

const SPECIAL_KEYS: Record<string, string> = {
  '⌘': '⌘', Cmd: '⌘', Ctrl: 'Ctrl', '⇧': '⇧', Shift: '⇧',
  '⌥': '⌥', Alt: '⌥', Option: '⌥', '⌃': '⌃',
  '⏎': '↩', Enter: '↩', Return: '↩', '⎋': '⎋', Escape: 'Esc', Esc: 'Esc',
  '⇥': '⇥', Tab: '⇥', Backspace: '⌫', Delete: '⌦',
  '→': '→', '←': '←', '↑': '↑', '↓': '↓',
  Right: '→', Left: '←', Up: '↑', Down: '↓',
  Space: '␣',
};

export function KeyboardKey({ keyLabel, size = 'md', isActive = false, variant = 'default' }: KeyboardKeyProps) {
  const display = SPECIAL_KEYS[keyLabel] || keyLabel;

  const sizeClasses = {
    sm: 'px-1 py-0.5 text-[9px] min-w-[16px]',
    md: 'px-1.5 py-0.5 text-[10px] min-w-[20px]',
    lg: 'px-2 py-1 text-xs min-w-[24px]',
  };

  const variantClasses = {
    default: 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] border-[var(--vscode-panel-border)]',
    accent: 'bg-[var(--ina-accent-primary,#3b82f6)] text-[var(--ina-accent-primary-text,#fff)] border-[var(--ina-accent-primary,#3b82f6)]',
    warning: 'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.2))] text-[var(--ina-status-warning,#eab308)] border-[var(--ina-status-warning,#eab308)]/30',
  };

  return (
    <kbd className={clsx(
      'inline-flex items-center justify-center font-mono rounded border shadow-sm leading-none select-none',
      sizeClasses[size],
      isActive ? variantClasses.accent : variantClasses[variant],
    )}>
      {display}
    </kbd>
  );
}
