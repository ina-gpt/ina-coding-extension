import React, { useEffect, useState } from 'react';
import { postMessage } from '../../utils/vscode';

interface ExtractedMemoryView {
  type: string;
  summary: string;
  confidence: number;
  content: string;
}

interface Props {
  extractions: ExtractedMemoryView[];
  onDismiss: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  fact: '#3b82f6', correction: '#f97316', preference: '#a855f7', pattern: '#22c55e',
  decision: '#eab308', context: '#6b7280', snippet: '#06b6d4', warning: '#ef4444',
};

export const ExtractionNotification: React.FC<Props> = ({ extractions, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!expanded) onDismiss();
    }, 8000);
    return () => clearTimeout(timer);
  }, [expanded, onDismiss]);

  if (!extractions || extractions.length === 0) return null;

  const visibleExtractions = extractions.filter((_, i) => !dismissed.has(i));
  if (visibleExtractions.length === 0) { onDismiss(); return null; }

  const handleKeep = (idx: number) => {
    const ext = extractions[idx];
    postMessage({ type: 'keepExtractedMemory', extraction: ext } as any);
    setDismissed(prev => new Set([...prev, idx]));
  };

  const handleDiscard = (idx: number) => {
    postMessage({ type: 'discardExtractedMemory', index: idx } as any);
    setDismissed(prev => new Set([...prev, idx]));
  };

  const handleDisableNotifications = () => {
    postMessage({ type: 'toggleAutoExtract', enabled: true, showNotification: false } as any);
    onDismiss();
  };

  return (
    <div className="mx-2 mb-2 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] animate-in slide-in-from-bottom-2">
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs">💾</span>
        <span className="text-[11px]">
          Remembered {visibleExtractions.length} thing{visibleExtractions.length !== 1 ? 's' : ''} from this conversation
        </span>
        <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="ml-auto text-[10px] px-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">✕</button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--vscode-panel-border)] px-2 py-1">
          {extractions.map((ext, i) => {
            if (dismissed.has(i)) return null;
            return (
              <div key={i} className="flex items-start gap-1.5 py-1">
                <span className="text-[9px] px-1 py-0.5 rounded text-[var(--ina-accent-primary-text,#fff)] shrink-0 mt-0.5" style={{ backgroundColor: TYPE_COLORS[ext.type] || '#6b7280' }}>
                  {ext.type}
                </span>
                <span className="flex-1 text-xs">{ext.summary}</span>
                <div className="flex gap-0.5 shrink-0">
                  <button onClick={() => handleKeep(i)} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">Keep</button>
                  <button onClick={() => handleDiscard(i)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">Discard</button>
                </div>
              </div>
            );
          })}
          <button onClick={handleDisableNotifications} className="text-[10px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] mt-1">
            Don't show these
          </button>
        </div>
      )}
    </div>
  );
};
