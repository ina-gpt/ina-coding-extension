import React from 'react';
import clsx from 'clsx';

interface TypingIndicatorProps {
  isTyping: boolean;
  modelName: string | null;
}

const dotKeyframes = `
@keyframes typingPulse {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(8px);
  }
}
`;

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ isTyping, modelName }) => {
  if (!isTyping) return null;

  const label = modelName ? `${modelName} is generating...` : 'INA is thinking...';

  return (
    <>
      <style>{dotKeyframes}</style>
      <div
        className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'bg-[var(--vscode-editor-background)]',
          'border border-[var(--vscode-widget-border,transparent)]',
          'text-[var(--vscode-descriptionForeground)] text-xs',
          'w-fit'
        )}
        style={{ animation: 'slideIn 0.2s ease-out forwards' }}
        role="status"
        aria-label={label}
      >
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block w-1.5 h-1.5 rounded-full bg-[var(--vscode-textLink-foreground)]"
              style={{
                animation: 'typingPulse 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
        <span className="select-none">{label}</span>
      </div>
    </>
  );
};

export default TypingIndicator;
