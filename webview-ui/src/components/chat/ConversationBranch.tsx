import React from 'react';
import clsx from 'clsx';
import { GitBranch } from 'lucide-react';

interface Branch {
  id: string;
  label: string;
  messageCount: number;
}

interface ConversationBranchProps {
  branches: Branch[];
  activeBranchId: string;
  onSwitchBranch: (id: string) => void;
}

const ConversationBranch: React.FC<ConversationBranchProps> = ({
  branches,
  activeBranchId,
  onSwitchBranch,
}) => {
  if (branches.length <= 1) return null;

  return (
    <div
      className={clsx(
        'flex items-center gap-1 px-2 py-1 rounded-md',
        'bg-[var(--vscode-editorGroupHeader-tabsBackground)]',
        'border border-[var(--vscode-widget-border,transparent)]',
        'overflow-x-auto',
        'my-1'
      )}
      role="tablist"
      aria-label="Conversation branches"
    >
      <GitBranch
        size={13}
        className="text-[var(--vscode-descriptionForeground)] flex-shrink-0 mr-1"
      />
      {branches.map((branch) => {
        const isActive = branch.id === activeBranchId;
        return (
          <button
            key={branch.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSwitchBranch(branch.id)}
            title={`${branch.label} (${branch.messageCount} messages)`}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs',
              'transition-colors duration-150 cursor-pointer',
              'whitespace-nowrap flex-shrink-0',
              isActive
                ? [
                    'bg-[var(--vscode-button-background)]',
                    'text-[var(--vscode-button-foreground)]',
                    'font-medium',
                  ]
                : [
                    'text-[var(--vscode-descriptionForeground)]',
                    'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
                    'hover:text-[var(--vscode-foreground)]',
                  ]
            )}
          >
            <span>{branch.label}</span>
            <span
              className={clsx(
                'text-[10px] px-1 py-px rounded-full leading-none',
                isActive
                  ? 'bg-[var(--vscode-button-foreground)] text-[var(--vscode-button-background)] bg-opacity-20'
                  : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
              )}
            >
              {branch.messageCount}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ConversationBranch;
