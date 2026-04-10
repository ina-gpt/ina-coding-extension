import React, { useCallback } from 'react';
import clsx from 'clsx';
import { Copy, RefreshCw, Bookmark, Pencil, Trash2 } from 'lucide-react';
import { postMessage } from '@/utils/vscode';

interface MessageActionsProps {
  messageId: string;
  isUser: boolean;
  content: string;
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, onClick, variant = 'default' }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    className={clsx(
      'flex items-center gap-1 px-2 py-1 rounded text-xs',
      'transition-colors duration-150',
      'border border-transparent',
      variant === 'danger'
        ? 'hover:bg-[var(--vscode-inputValidation-errorBackground,rgba(255,0,0,0.1))] hover:text-[var(--vscode-errorForeground)]'
        : 'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
      'text-[var(--vscode-descriptionForeground)]',
      'cursor-pointer'
    )}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

const MessageActions: React.FC<MessageActionsProps> = ({ messageId, isUser, content }) => {
  const handleCopy = useCallback(() => {
    postMessage({ type: 'copyToClipboard', text: content });
  }, [content]);

  const handleEdit = useCallback(() => {
    postMessage({ type: 'editMessage', messageId });
  }, [messageId]);

  const handleRegenerate = useCallback(() => {
    postMessage({ type: 'regenerateMessage', messageId });
  }, [messageId]);

  const handleBookmark = useCallback(() => {
    postMessage({ type: 'bookmarkMessage', messageId });
  }, [messageId]);

  const handleDelete = useCallback(() => {
    postMessage({ type: 'deleteMessage', messageId });
  }, [messageId]);

  return (
    <div
      className={clsx(
        'opacity-0 group-hover:opacity-100',
        'transition-opacity duration-150',
        'flex items-center gap-0.5',
        'absolute -top-3 right-2',
        'bg-[var(--vscode-editor-background)]',
        'border border-[var(--vscode-widget-border,transparent)]',
        'rounded-md shadow-sm',
        'px-1 py-0.5',
        'z-10'
      )}
    >
      {isUser ? (
        <>
          <ActionButton
            icon={<Pencil size={14} />}
            label="Edit"
            onClick={handleEdit}
          />
          <ActionButton
            icon={<Trash2 size={14} />}
            label="Delete"
            onClick={handleDelete}
            variant="danger"
          />
        </>
      ) : (
        <>
          <ActionButton
            icon={<Copy size={14} />}
            label="Copy"
            onClick={handleCopy}
          />
          <ActionButton
            icon={<RefreshCw size={14} />}
            label="Regenerate"
            onClick={handleRegenerate}
          />
          <ActionButton
            icon={<Bookmark size={14} />}
            label="Bookmark"
            onClick={handleBookmark}
          />
        </>
      )}
    </div>
  );
};

export default MessageActions;
