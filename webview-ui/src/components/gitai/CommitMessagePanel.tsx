import React, { useState, useEffect } from 'react';
import { GitCommit, Zap, Copy, RefreshCw } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommitMessageData {
  summary: string;
  body: string;
}

type CommitStyle = 'conventional' | 'imperative' | 'descriptive';

const STYLE_LABELS: Record<CommitStyle, string> = {
  conventional: 'Conventional',
  imperative: 'Imperative',
  descriptive: 'Descriptive',
};

// ---------------------------------------------------------------------------
// CommitMessagePanel
// ---------------------------------------------------------------------------

export function CommitMessagePanel() {
  const { commitMessage, isGeneratingCommit } = useChatStore() as any;

  const msg = commitMessage as CommitMessageData | null;

  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [activeStyle, setActiveStyle] = useState<CommitStyle>('conventional');

  // Sync store data into local editable state
  useEffect(() => {
    if (msg) {
      setSummary(msg.summary ?? '');
      setBody(msg.body ?? '');
    }
  }, [msg]);

  const handleGenerate = () => {
    postMessage({ type: 'generateCommitMessage' } as any);
  };

  const handleRegenerate = () => {
    postMessage({ type: 'generateCommitMessage', style: activeStyle } as any);
  };

  const handleCopy = () => {
    const full = body ? `${summary}\n\n${body}` : summary;
    postMessage({ type: 'copyToClipboard', text: full } as any);
  };

  const handleStyleChange = (style: CommitStyle) => {
    setActiveStyle(style);
    postMessage({ type: 'generateCommitMessage', style } as any);
  };

  const hasResult = summary.length > 0;

  return (
    <div className="p-3 space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitCommit size={16} className="text-[var(--vscode-descriptionForeground)]" />
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">
          Commit Message
        </span>
      </div>

      {/* Generate button */}
      {!hasResult && !isGeneratingCommit && (
        <button
          onClick={handleGenerate}
          className={clsx(
            'w-full px-3 py-2 rounded text-xs font-medium flex items-center justify-center gap-1.5',
            'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]',
            'hover:bg-[var(--vscode-button-hoverBackground)]',
          )}
        >
          <Zap size={14} /> Generate Commit Message
        </button>
      )}

      {/* Loading state */}
      {isGeneratingCommit && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--vscode-descriptionForeground)]">
          <RefreshCw size={14} className="animate-spin" />
          Generating...
        </div>
      )}

      {/* Result */}
      {hasResult && !isGeneratingCommit && (
        <div className="space-y-2">
          {/* Summary input */}
          <div>
            <label className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-0.5 block">Summary</label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-2 py-1 rounded text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)]"
            />
          </div>

          {/* Body textarea */}
          <div>
            <label className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-0.5 block">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full px-2 py-1 rounded text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] outline-none focus:border-[var(--vscode-focusBorder)] resize-y font-mono"
            />
          </div>

          {/* Style buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">Style:</span>
            {(Object.keys(STYLE_LABELS) as CommitStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => handleStyleChange(style)}
                className={clsx(
                  'px-2 py-0.5 rounded text-[11px] border transition-colors',
                  activeStyle === style
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent'
                    : 'bg-transparent text-[var(--vscode-foreground)] border-[var(--vscode-widget-border)] hover:bg-[var(--vscode-list-hoverBackground)]',
                )}
              >
                {STYLE_LABELS[style]}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={handleCopy}
              className="px-2 py-1 rounded text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1"
            >
              <Copy size={12} /> Copy
            </button>
            <button
              onClick={handleRegenerate}
              className="px-2 py-1 rounded text-xs bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] flex items-center gap-1"
            >
              <RefreshCw size={12} /> Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
