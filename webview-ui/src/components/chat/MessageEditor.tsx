import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

interface MessageEditorProps {
  originalContent: string;
  onSave: (newContent: string) => void;
  onCancel: () => void;
}

const MessageEditor: React.FC<MessageEditorProps> = ({ originalContent, onSave, onCancel }) => {
  const [content, setContent] = useState(originalContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (content.trim()) onSave(content);
    }
  };

  const hasChanges = content !== originalContent;
  const isEmpty = content.trim().length === 0;

  return (
    <div className="flex flex-col gap-2 w-full">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={3}
        className={clsx(
          'w-full resize-none rounded-md p-3',
          'bg-[var(--vscode-input-background)]',
          'text-[var(--vscode-input-foreground)]',
          'border border-[var(--vscode-input-border,var(--vscode-widget-border,transparent))]',
          'focus:outline-none focus:border-[var(--vscode-focusBorder)]',
          'text-sm font-[var(--vscode-editor-font-family)]',
          'leading-relaxed'
        )}
        placeholder="Edit your message..."
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {content.length} characters
          {hasChanges && ' (modified)'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className={clsx(
              'px-3 py-1.5 rounded text-xs',
              'text-[var(--vscode-foreground)]',
              'hover:bg-[var(--vscode-toolbar-hoverBackground)]',
              'transition-colors duration-150',
              'cursor-pointer'
            )}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(content)}
            disabled={isEmpty}
            className={clsx(
              'px-3 py-1.5 rounded text-xs font-medium',
              'bg-[var(--vscode-button-background)]',
              'text-[var(--vscode-button-foreground)]',
              'hover:bg-[var(--vscode-button-hoverBackground)]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-colors duration-150',
              'cursor-pointer'
            )}
          >
            Save & Resend
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--vscode-descriptionForeground)] select-none">
        Ctrl+Enter to save &middot; Esc to cancel
      </p>
    </div>
  );
};

export default MessageEditor;
