import React, { useState } from 'react';
import { postMessage } from '../../utils/vscode';

interface MemorySearchResultView {
  memory: { id: string; type: string; summary: string; confidence: number };
  score: number;
  relevanceReason: string;
}

interface Props {
  memoriesUsed: MemorySearchResultView[];
}

const TYPE_COLORS: Record<string, string> = {
  fact: '#3b82f6', correction: '#f97316', preference: '#a855f7', pattern: '#22c55e',
  decision: '#eab308', context: '#6b7280', snippet: '#06b6d4', warning: '#ef4444',
};

export const MemoryIndicator: React.FC<Props> = ({ memoriesUsed }) => {
  const [expanded, setExpanded] = useState(false);

  if (!memoriesUsed || memoriesUsed.length === 0) return null;

  const handleFeedback = (memoryId: string, type: string) => {
    postMessage({ type: 'submitMemoryFeedback', memoryId, feedbackType: type } as any);
  };

  const handleViewAll = () => postMessage({ type: 'openMemoryPanel' } as any);

  return (
    <div className="mx-2 mb-2 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
      <div
        className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs">💡</span>
        <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
          Used {memoriesUsed.length} memor{memoriesUsed.length === 1 ? 'y' : 'ies'}
        </span>
        <span className="text-[10px] ml-auto">{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className="border-t border-[var(--vscode-panel-border)] px-2 py-1">
          {memoriesUsed.map((m, i) => (
            <div key={i} className="flex items-start gap-1.5 py-1 text-xs">
              <span className="text-[9px] px-1 py-0.5 rounded text-[var(--ina-accent-primary-text,#fff)] shrink-0 mt-0.5" style={{ backgroundColor: TYPE_COLORS[m.memory.type] || '#6b7280' }}>
                {m.memory.type}
              </span>
              <span className="flex-1 text-[var(--vscode-foreground)]">{m.memory.summary}</span>
              <div className="flex gap-0.5 shrink-0">
                <button onClick={() => handleFeedback(m.memory.id, 'helpful')} className="text-[10px] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded px-0.5" title="Helpful">👍</button>
                <button onClick={() => handleFeedback(m.memory.id, 'not_helpful')} className="text-[10px] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded px-0.5" title="Not helpful">👎</button>
              </div>
            </div>
          ))}
          <button onClick={handleViewAll} className="text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline mt-1">
            View all memories
          </button>
        </div>
      )}
    </div>
  );
};
