import React, { useState } from 'react';
import { Check, Code2, Gauge, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import ScoreRadar from './ScoreRadar';

export interface CandidateView {
  id: string;
  code: string;
  temperature: number;
  verificationScore: number;
  verificationVerdict: 'pass' | 'warning' | 'fail';
  finalScore: number;
  metrics: {
    complexity: number;
    readability: number;
    performance: number;
    testsPassing: number;
    changedLines: number;
  };
}

interface CandidateComparisonProps {
  candidates: CandidateView[];
  winnerId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const VERDICT_COLORS: Record<string, string> = {
  pass: 'bg-green-500/20 text-green-400',
  warning: 'bg-amber-500/20 text-amber-400',
  fail: 'bg-red-500/20 text-red-400',
};

export const CandidateComparison: React.FC<CandidateComparisonProps> = ({
  candidates,
  winnerId,
  onSelect,
  onClose,
}) => {
  const [expandedCode, setExpandedCode] = useState<string | null>(candidates[0]?.id ?? null);

  const sorted = [...candidates].sort((a, b) => b.finalScore - a.finalScore);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[90vw] max-w-[1100px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--ina-accent-primary,#4f46e5)]" />
            <span className="text-sm font-semibold">INA-7 Pro · Best-of-N Comparison</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {candidates.length} candidates
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-xs"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((c, i) => {
              const isWinner = c.id === winnerId;
              const isTop = i === 0;
              const expanded = expandedCode === c.id;
              return (
                <div
                  key={c.id}
                  className={clsx(
                    'rounded border overflow-hidden',
                    isWinner
                      ? 'border-green-500/60 bg-green-500/5'
                      : 'border-[var(--vscode-panel-border)]'
                  )}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-lineHighlightBackground)]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Code2 size={12} className="text-[var(--vscode-descriptionForeground)] flex-shrink-0" />
                      <span className="text-xs font-semibold truncate">
                        Candidate {i + 1}
                        {isWinner && <span className="ml-1 text-green-400">★ Winner</span>}
                        {!isWinner && isTop && (
                          <span className="ml-1 text-amber-400">▲ Highest score</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className={clsx(
                          'text-[9px] px-1 rounded font-medium uppercase',
                          VERDICT_COLORS[c.verificationVerdict]
                        )}
                      >
                        {c.verificationVerdict}
                      </span>
                      <span className="text-xs font-bold text-[var(--vscode-foreground)]">
                        {c.finalScore}/100
                      </span>
                    </div>
                  </div>

                  {/* Radar + metrics */}
                  <div className="flex items-start gap-2 px-3 py-2">
                    <div className="flex-shrink-0">
                      <ScoreRadar
                        size={110}
                        dimensions={[
                          { label: 'Verification', value: c.verificationScore },
                          { label: 'Readability', value: c.metrics.readability },
                          { label: 'Performance', value: c.metrics.performance },
                          {
                            label: 'Simplicity',
                            value: Math.max(0, 100 - c.metrics.complexity * 2),
                          },
                          { label: 'Tests', value: Math.min(100, c.metrics.testsPassing * 5) },
                        ]}
                      />
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                      <div>
                        <Gauge size={9} className="inline" /> Complexity
                      </div>
                      <div className="text-right font-mono">{c.metrics.complexity}</div>

                      <div>Readability</div>
                      <div className="text-right font-mono">{c.metrics.readability}/100</div>

                      <div>Performance</div>
                      <div className="text-right font-mono">{c.metrics.performance}/100</div>

                      <div>Tests</div>
                      <div className="text-right font-mono">{c.metrics.testsPassing}</div>

                      <div>Changed lines</div>
                      <div className="text-right font-mono">{c.metrics.changedLines}</div>

                      <div>Temperature</div>
                      <div className="text-right font-mono">{c.temperature.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Collapsible code preview */}
                  <button
                    onClick={() => setExpandedCode(expanded ? null : c.id)}
                    className="w-full flex items-center gap-1 px-3 py-1 text-[10px] text-left border-t border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)]"
                  >
                    {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    {expanded ? 'Hide code' : 'Show code'}
                  </button>
                  {expanded && (
                    <pre className="px-3 py-2 text-[10px] font-mono bg-[var(--vscode-textCodeBlock-background)] max-h-60 overflow-auto whitespace-pre border-t border-[var(--vscode-panel-border)]">
                      {c.code.substring(0, 4000)}
                      {c.code.length > 4000 && '\n... (truncated)'}
                    </pre>
                  )}

                  {/* Select button */}
                  <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)]">
                    <button
                      onClick={() => onSelect(c.id)}
                      disabled={isWinner}
                      className={clsx(
                        'w-full px-2 py-1 text-[11px] rounded font-medium flex items-center justify-center gap-1',
                        isWinner
                          ? 'bg-green-500/20 text-green-400 cursor-default'
                          : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
                      )}
                    >
                      <Check size={10} />
                      {isWinner ? 'Selected' : 'Use this candidate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidateComparison;
