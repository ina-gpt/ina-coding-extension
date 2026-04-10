import React from 'react';
import { Bot, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';

type AgentMode = 'chat' | 'agent' | 'auto';

interface AgentBannerProps {
  mode: AgentMode;
  visible: boolean;
  onDismiss: () => void;
  onDontShowAgain: () => void;
}

export function AgentBanner({ mode, visible, onDismiss, onDontShowAgain }: AgentBannerProps) {
  if (!visible || mode === 'chat') return null;

  return (
    <div
      className={clsx(
        'relative flex items-center gap-3 px-4 py-2.5 text-xs',
        'border-b transition-all duration-300',
        mode === 'agent' && 'bg-gradient-to-r from-blue-500/10 to-blue-600/5 border-blue-500/20',
        mode === 'auto' && 'bg-gradient-to-r from-yellow-500/10 to-yellow-600/5 border-yellow-500/20',
      )}
    >
      <span className={clsx(
        mode === 'agent' && 'text-[var(--ina-status-info,#60a5fa)]',
        mode === 'auto' && 'text-[var(--ina-status-warning,#facc15)]',
      )}>
        {mode === 'agent' ? <Bot size={16} /> : <Sparkles size={16} />}
      </span>

      <span className="flex-1 text-[var(--vscode-foreground)] opacity-90">
        {mode === 'agent'
          ? 'Agent Mode Active \u2014 I can create, edit, and delete files across your project'
          : "Auto Mode \u2014 I'll switch to Agent when needed"
        }
      </span>

      <div className="flex items-center gap-2">
        <button
          onClick={onDontShowAgain}
          className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] text-[10px] underline cursor-pointer"
        >
          Don't show again
        </button>
        <button
          onClick={onDismiss}
          className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
