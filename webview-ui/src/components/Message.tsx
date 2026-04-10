import React, { memo, useState } from 'react';
import { User, Bot, AlertCircle, Loader2, Copy, RefreshCw, Bookmark, Pencil, Trash2, GitBranch, FileText, ChevronDown } from 'lucide-react';
import { Markdown } from './Markdown';
import { MemoryIndicator } from './memory/MemoryIndicator';
import { DegradedResponseBadge } from './offline/DegradedResponseBadge';
import { FeedbackWidget } from './errors/FeedbackWidget';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import type { ChatMessage } from '@/types';
import clsx from 'clsx';

interface MessageProps {
  message: ChatMessage;
}

const UserAvatar: React.FC = () => (
  <div className="w-7 h-7 rounded-full bg-[var(--vscode-button-background)] flex items-center justify-center flex-shrink-0">
    <User size={16} className="text-[var(--vscode-button-foreground)]" />
  </div>
);

const AssistantAvatar: React.FC = () => (
  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--ina-accent-primary,#4f46e5)] to-[var(--ina-accent-secondary,#7c3aed)] flex items-center justify-center flex-shrink-0">
    <Bot size={16} className="text-[var(--ina-accent-primary-text,#fff)]" />
  </div>
);

const TypingIndicator: React.FC<{ modelName?: string | null }> = ({ modelName }) => (
  <div className="flex items-center gap-2 py-2 text-[var(--vscode-descriptionForeground)]">
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-[var(--ina-accent-primary,#4f46e5)] animate-[typing-dot_1.4s_ease-in-out_infinite]" />
      <span className="w-2 h-2 rounded-full bg-[var(--ina-accent-primary,#4f46e5)] animate-[typing-dot_1.4s_ease-in-out_0.2s_infinite]" />
      <span className="w-2 h-2 rounded-full bg-[var(--ina-accent-primary,#4f46e5)] animate-[typing-dot_1.4s_ease-in-out_0.4s_infinite]" />
    </div>
    <span className="text-xs">{modelName ? `${modelName} is generating...` : 'INA is thinking...'}</span>
  </div>
);

const MessageActionBar: React.FC<{ messageId: string; isUser: boolean; content: string }> = ({ messageId, isUser, content }) => {
  const [copied, setCopied] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const handleCopy = () => {
    postMessage({ type: 'copyToClipboard', text: content } as any);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleCopyMarkdown = () => {
    postMessage({ type: 'copyAsMarkdown', messageId } as any);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleFork = () => {
    postMessage({ type: 'forkConversation', messageId } as any);
  };
  const handleRetryWithModel = (model: string) => {
    postMessage({ type: 'retryWithModel', messageId, model } as any);
    setShowModelPicker(false);
  };
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {!isUser && (
        <>
          <button onClick={handleCopy} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]" title={copied ? 'Copied!' : 'Copy'}>
            <Copy size={13} />
          </button>
          <button onClick={handleCopyMarkdown} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]" title="Copy as Markdown">
            <FileText size={13} />
          </button>
          <div className="relative">
            <button onClick={() => postMessage({ type: 'regenerateMessage', messageId } as any)} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]" title="Regenerate">
              <RefreshCw size={13} />
            </button>
            <button onClick={() => setShowModelPicker(!showModelPicker)} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]" title="Retry with different model" aria-label="Select model for retry">
              <ChevronDown size={10} />
            </button>
            {showModelPicker && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1 rounded-md shadow-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-dropdown-background)]" role="listbox" aria-label="Select model">
                {[
                  { id: 'qwen2.5-coder:32b', label: 'INA-7 Pro (Code)' },
                  { id: 'qwen3:14b', label: 'INA-7 Pro (Chat)' },
                ].map(m => (
                  <button key={m.id} onClick={() => handleRetryWithModel(m.id)} className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-dropdown-foreground)]" role="option">
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => (useChatStore.getState() as any).toggleBookmark(messageId)} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]" title="Bookmark">
            <Bookmark size={13} />
          </button>
        </>
      )}
      <button onClick={handleFork} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]" title="Fork conversation from here" aria-label="Fork conversation from this message">
        <GitBranch size={13} />
      </button>
      {isUser && (
        <button onClick={() => postMessage({ type: 'editMessage', messageId, newContent: content } as any)} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]" title="Edit">
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
};

export const Message: React.FC<MessageProps> = memo(({ message }) => {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isError = message.status === 'error';
  const isEmpty = !message.content && isStreaming;
  const { recalledMemories } = useChatStore();

  return (
    <div className={clsx('group px-4 py-4 transition-colors', !isUser && 'bg-[var(--vscode-editor-background)]/50')}>
      <div className="flex gap-3 max-w-3xl mx-auto">
        <div className="pt-1">{isUser ? <UserAvatar /> : <AssistantAvatar />}</div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{isUser ? 'You' : 'INA'}</span>
            {isStreaming && !isEmpty && <Loader2 size={12} className="animate-spin text-[var(--vscode-descriptionForeground)]" />}
            {isError && <AlertCircle size={12} className="text-[var(--vscode-errorForeground)]" />}
            {!isStreaming && !isError && message.content && (
              <MessageActionBar messageId={message.id} isUser={isUser} content={message.content} />
            )}
          </div>
          {isUser && message.context?.file && (
            <div className="mb-2 text-xs text-[var(--vscode-descriptionForeground)]">
              <span className="px-2 py-0.5 bg-[var(--vscode-badge-background)] rounded">
                {message.context.file.split('/').pop()}
                {message.context.selection && ` L${message.context.selection.startLine}-${message.context.selection.endLine}`}
              </span>
            </div>
          )}
          {!isUser && message.status === 'complete' && recalledMemories && recalledMemories.length > 0 && (
            <MemoryIndicator memoriesUsed={recalledMemories} />
          )}
          {isEmpty ? <TypingIndicator /> : isError ? (
            <div className="text-[var(--vscode-errorForeground)] text-sm">
              <p>Error: {message.error || 'Unknown error'}</p>
              <p className="mt-1 text-xs opacity-75">Please try again</p>
            </div>
          ) : <Markdown content={message.content} />}
          <div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
});

Message.displayName = 'Message';
