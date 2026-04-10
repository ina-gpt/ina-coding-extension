import React, { useRef, useEffect } from 'react';
import { Message } from './Message';
import { useChatStore } from '@/store/chatStore';
import { Sparkles } from 'lucide-react';

const WelcomeMessage: React.FC = () => {
  const { setInputValue, onboardingState } = useChatStore();
  const isFirstRun = onboardingState?.isFirstRun ?? false;

  const suggestions = isFirstRun ? [
    { icon: '👋', text: 'Explain this file' },
    { icon: '💡', text: '@file:package.json what dependencies does this project use?' },
    { icon: '✏️', text: 'Help me write a function to...' },
    { icon: '🔍', text: '@codebase how does authentication work?' },
  ] : [
    { icon: '💡', text: 'Explain this code' },
    { icon: '🐛', text: 'Help me fix this bug' },
    { icon: '✨', text: 'Refactor for better readability' },
    { icon: '📝', text: 'Write unit tests' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--ina-accent-primary,#4f46e5)] to-[var(--ina-accent-secondary,#7c3aed)] flex items-center justify-center mb-6 shadow-lg">
        <Sparkles size={32} className="text-[var(--ina-accent-primary-text,#fff)]" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Welcome to INA Coding</h2>
      <p className="text-[var(--vscode-descriptionForeground)] max-w-sm mb-8">
        Your AI-powered coding assistant. Ask me anything about code, debugging, or best practices.
      </p>
      <div className="grid gap-3 w-full max-w-sm">
        {suggestions.map((s) => (
          <button key={s.text} onClick={() => setInputValue(s.text)}
            className="flex items-center gap-3 px-4 py-3 text-left bg-[var(--vscode-input-background)] hover:bg-[var(--vscode-list-hoverBackground)] border border-[var(--vscode-input-border)] rounded-lg transition-colors">
            <span className="text-lg">{s.icon}</span>
            <span className="text-sm">{s.text}</span>
          </button>
        ))}
      </div>
      <div className="mt-8 text-xs text-[var(--vscode-descriptionForeground)]">
        <p>Press <kbd className="px-1.5 py-0.5 bg-[var(--vscode-badge-background)] rounded">Cmd+Shift+L</kbd> to add code context</p>
      </div>
    </div>
  );
};

export const MessageList: React.FC = () => {
  const { messages, isAITyping } = useChatStore() as any;
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = React.useState(false);

  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, userScrolledUp]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setUserScrolledUp(scrollHeight - scrollTop - clientHeight > 100);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUserScrolledUp(false);
  };

  if (messages.length === 0) { return <WelcomeMessage />; }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scroll-smooth relative">
      <div className="pb-4">
        {messages.map((message: any) => (<Message key={message.id} message={message} />))}
        {isAITyping && (
          <div className="px-4 py-2">
            <div className="flex items-center gap-2 text-[var(--vscode-descriptionForeground)]">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--ina-accent-primary,#4f46e5)]" style={{ animation: 'typing-dot 1.4s ease-in-out infinite' }} />
                <span className="w-2 h-2 rounded-full bg-[var(--ina-accent-primary,#4f46e5)]" style={{ animation: 'typing-dot 1.4s ease-in-out 0.2s infinite' }} />
                <span className="w-2 h-2 rounded-full bg-[var(--ina-accent-primary,#4f46e5)]" style={{ animation: 'typing-dot 1.4s ease-in-out 0.4s infinite' }} />
              </div>
              <span className="text-xs">INA is thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {userScrolledUp && (
        <button onClick={scrollToBottom}
          className="fixed bottom-20 right-6 z-10 px-3 py-1.5 bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded-full text-xs shadow-lg hover:opacity-90 transition-opacity">
          ↓ New messages
        </button>
      )}
    </div>
  );
};
