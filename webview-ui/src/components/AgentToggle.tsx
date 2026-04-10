import React from 'react';
import { MessageSquare, Bot, Sparkles } from 'lucide-react';
import clsx from 'clsx';

type AgentMode = 'chat' | 'agent' | 'auto';

interface AgentToggleProps {
  mode: AgentMode;
  onToggle: () => void;
  isSessionActive?: boolean;
}

const MODE_CONFIG: Record<AgentMode, { icon: React.ReactNode; label: string; color: string; tooltip: string }> = {
  chat: {
    icon: <MessageSquare size={14} />,
    label: 'Chat',
    color: 'text-[var(--vscode-foreground)]',
    tooltip: 'Chat Mode - Ask questions and get answers',
  },
  agent: {
    icon: <Bot size={14} />,
    label: 'Agent',
    color: 'text-[var(--ina-status-info,#60a5fa)]',
    tooltip: 'Agent Mode - Create, edit, and delete files across your project',
  },
  auto: {
    icon: <Sparkles size={14} />,
    label: 'Auto',
    color: 'text-[var(--ina-status-warning,#facc15)]',
    tooltip: 'Auto Mode - Automatically switches to Agent when needed',
  },
};

export function AgentToggle({ mode, onToggle, isSessionActive }: AgentToggleProps) {
  const config = MODE_CONFIG[mode];

  return (
    <button
      onClick={onToggle}
      className={clsx(
        'relative flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        'border transition-all duration-200 cursor-pointer',
        'hover:opacity-90 active:scale-95',
        mode === 'chat' && 'border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]',
        mode === 'agent' && 'border-blue-500/50 bg-[var(--ina-status-info-bg,rgba(59,130,246,0.1))]',
        mode === 'auto' && 'border-yellow-500/50 bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))]',
      )}
      title={`${config.tooltip}\n\nKeyboard: Cmd+Shift+K`}
    >
      <span className={clsx('transition-colors duration-200', config.color)}>
        {config.icon}
      </span>
      <span className={clsx('transition-colors duration-200', config.color)}>
        {config.label}
      </span>

      {isSessionActive && (
        <span className="relative flex h-2 w-2 ml-0.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--ina-status-info,#60a5fa)] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--ina-status-info,#3b82f6)]" />
        </span>
      )}
    </button>
  );
}
