import React, { useEffect, useRef, useState } from 'react';
import { Send, User, Bot, Camera, ListOrdered, Activity, Info } from 'lucide-react';
import clsx from 'clsx';
import type { ComposerMessage } from '@/types';

interface ComposerConversationProps {
  messages: ComposerMessage[];
  onSendRefinement: (instruction: string) => void;
  isExecuting: boolean;
}

const ROLE_ICONS: Record<string, React.ComponentType<any>> = {
  user: User,
  assistant: Bot,
  plan: ListOrdered,
  execution: Activity,
  checkpoint: Camera,
  system: Info,
};

const ROLE_COLORS: Record<string, string> = {
  user: 'text-[var(--vscode-foreground)]',
  assistant: 'text-blue-400',
  plan: 'text-indigo-400',
  execution: 'text-amber-400',
  checkpoint: 'text-purple-400',
  system: 'text-[var(--vscode-descriptionForeground)]',
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const MessageRow: React.FC<{ message: ComposerMessage }> = ({ message }) => {
  const Icon = ROLE_ICONS[message.role] || Info;

  if (message.role === 'checkpoint') {
    return (
      <div className="flex items-center gap-2 my-3">
        <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
        <div className="flex items-center gap-1 text-[10px] text-purple-400">
          <Camera size={11} />
          {message.content}
        </div>
        <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
      </div>
    );
  }

  if (message.role === 'plan') {
    return (
      <div className="my-2 px-3 py-2 rounded border border-indigo-500/30 bg-indigo-500/5">
        <div className="flex items-center gap-2 mb-1 text-indigo-400 text-xs font-medium">
          <ListOrdered size={12} />
          Plan
          <span className="ml-auto text-[10px] text-[var(--vscode-descriptionForeground)]">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <pre className="text-[11px] whitespace-pre-wrap font-mono text-[var(--vscode-foreground)]">
          {message.content}
        </pre>
      </div>
    );
  }

  if (message.role === 'execution') {
    return (
      <div className="my-1 px-3 py-1 rounded border-l-2 border-amber-500/50 bg-amber-500/5 text-[11px]">
        <div className="flex items-center gap-2 text-amber-400">
          <Activity size={11} />
          {message.content}
          <span className="ml-auto text-[10px] text-[var(--vscode-descriptionForeground)]">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="my-2 flex items-start gap-2 justify-end">
        <div className="max-w-[80%] px-3 py-2 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">
          <div className="text-xs whitespace-pre-wrap">{message.content}</div>
          <div className="text-[10px] opacity-70 mt-1 text-right">
            {formatTime(message.timestamp)}
          </div>
        </div>
        <Icon size={14} className="text-[var(--vscode-descriptionForeground)] mt-1 flex-shrink-0" />
      </div>
    );
  }

  // assistant / system
  return (
    <div className="my-2 flex items-start gap-2">
      <Icon size={14} className={clsx('mt-1 flex-shrink-0', ROLE_COLORS[message.role])} />
      <div className="flex-1 min-w-0">
        <div className="text-xs whitespace-pre-wrap text-[var(--vscode-foreground)]">
          {message.content}
        </div>
        <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-1">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

export const ComposerConversation: React.FC<ComposerConversationProps> = ({
  messages,
  onSendRefinement,
  isExecuting,
}) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isExecuting) return;
    onSendRefinement(trimmed);
    setHistory((h) => [trimmed, ...h].slice(0, 20));
    setHistoryIdx(-1);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === 'ArrowUp' && input === '' && history.length > 0) {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      setInput(history[next] || '');
    }
    if (e.key === 'ArrowDown' && historyIdx >= 0) {
      e.preventDefault();
      const next = historyIdx - 1;
      setHistoryIdx(next);
      setInput(next >= 0 ? history[next] || '' : '');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <div className="text-center text-[var(--vscode-descriptionForeground)] text-xs py-6">
            No messages yet
          </div>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Refinement input */}
      <div className="border-t border-[var(--vscode-panel-border)] p-2 bg-[var(--vscode-sideBar-background)]">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
            placeholder={
              isExecuting ? 'Waiting for execution...' : 'Describe additional changes...'
            }
            rows={2}
            className={clsx(
              'flex-1 resize-none px-2 py-1.5 rounded text-xs',
              'bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]',
              'border border-[var(--vscode-input-border,transparent)]',
              'focus:outline-none focus:border-[var(--ina-accent-primary,#4f46e5)]',
              isExecuting && 'opacity-50 cursor-not-allowed'
            )}
          />
          <button
            onClick={handleSend}
            disabled={isExecuting || !input.trim()}
            className={clsx(
              'p-2 rounded text-[var(--vscode-button-foreground)]',
              isExecuting || !input.trim()
                ? 'bg-[var(--vscode-button-secondaryBackground)] opacity-50 cursor-not-allowed'
                : 'bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)]'
            )}
            title="Send refinement (Enter)"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComposerConversation;
