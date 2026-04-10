import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';
import clsx from 'clsx';

interface FeedbackWidgetProps {
  messageId: string;
  onSubmit: (messageId: string, rating: 'good' | 'bad', comment?: string) => void;
  onDismiss: () => void;
}

export function FeedbackWidget({ messageId, onSubmit, onDismiss }: FeedbackWidgetProps) {
  const [submitted, setSubmitted] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');

  if (submitted) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
      <button
        onClick={() => { onSubmit(messageId, 'good'); setSubmitted(true); }}
        className="p-0.5 rounded hover:bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))] hover:text-[var(--ina-status-success,#4ade80)] transition-colors"
        title="Good response"
      >
        <ThumbsUp size={12} />
      </button>
      <button
        onClick={() => setShowComment(true)}
        className="p-0.5 rounded hover:bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] hover:text-[var(--ina-status-error,#f87171)] transition-colors"
        title="Bad response"
      >
        <ThumbsDown size={12} />
      </button>
      {showComment && (
        <div className="flex items-center gap-1 ml-1">
          <input
            type="text"
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="What was wrong?"
            className="px-1.5 py-0.5 rounded bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-xs w-40"
            onKeyDown={e => {
              if (e.key === 'Enter') { onSubmit(messageId, 'bad', comment); setSubmitted(true); }
              if (e.key === 'Escape') setShowComment(false);
            }}
          />
          <button onClick={() => { onSubmit(messageId, 'bad', comment); setSubmitted(true); }} className="px-1 py-0.5 rounded bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] text-xs">Send</button>
          <button onClick={() => setShowComment(false)} className="p-0.5"><X size={10} /></button>
        </div>
      )}
    </div>
  );
}
