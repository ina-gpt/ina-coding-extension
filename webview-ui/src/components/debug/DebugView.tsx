/**
 * DebugView.tsx — Phase 19 Step 19.1
 * Main debug panel: parsed error, root cause, suggested fixes
 */

import React, { useState } from 'react';

interface Fix {
  description: string;
  file: string;
  diff: string;
  risk: 'low' | 'medium' | 'high';
  breakingChange: boolean;
}

interface DiagnosticResult {
  rootCause: string;
  explanation: string;
  suggestedFixes: Fix[];
  confidence: number;
  relatedFiles: string[];
}

interface DebugViewProps {
  result: DiagnosticResult | null;
  isAnalyzing: boolean;
  progress: number;
  statusMessage: string;
  onApplyFix: (fix: Fix) => void;
  onSuggestBreakpoints: () => void;
  onDismiss: () => void;
}

const riskColors: Record<string, string> = {
  low: 'var(--vscode-charts-green)',
  medium: 'var(--vscode-charts-yellow)',
  high: 'var(--vscode-charts-red)',
};

const DebugView: React.FC<DebugViewProps> = ({
  result, isAnalyzing, progress, statusMessage,
  onApplyFix, onSuggestBreakpoints, onDismiss,
}) => {
  const [expandedFix, setExpandedFix] = useState<number | null>(null);

  if (isAnalyzing) {
    return (
      <div className="debug-view" role="status" aria-live="polite">
        <div className="debug-analyzing">
          <div className="debug-progress-bar" style={{ width: `${progress * 100}%` }} />
          <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
          <span>{statusMessage || 'INA-7 Pro analyzing error...'}</span>
        </div>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="debug-view" role="region" aria-label="Debug Analysis">
      <div className="debug-header">
        <h3><span className="codicon codicon-bug" aria-hidden="true" /> INA-7 Pro Debug Analysis</h3>
        <div className="debug-header-actions">
          <span className="debug-confidence" title={`Confidence: ${result.confidence}%`}
            style={{ color: result.confidence >= 70 ? 'var(--vscode-charts-green)' : result.confidence >= 40 ? 'var(--vscode-charts-yellow)' : 'var(--vscode-charts-red)' }}>
            {result.confidence}% confidence
          </span>
          <button className="debug-btn debug-btn-ghost" onClick={onDismiss} aria-label="Dismiss">
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="debug-section">
        <h4>Root Cause</h4>
        <p className="debug-root-cause">{result.rootCause}</p>
      </div>

      <div className="debug-section">
        <h4>Explanation</h4>
        <p className="debug-explanation">{result.explanation}</p>
      </div>

      {result.suggestedFixes.length > 0 && (
        <div className="debug-section">
          <h4>Suggested Fixes ({result.suggestedFixes.length})</h4>
          <ul className="debug-fixes" role="list">
            {result.suggestedFixes.map((fix, i) => (
              <li key={i} className="debug-fix" role="listitem">
                <div className="debug-fix-header" onClick={() => setExpandedFix(expandedFix === i ? null : i)}
                  role="button" tabIndex={0} aria-expanded={expandedFix === i}
                  onKeyDown={e => e.key === 'Enter' && setExpandedFix(expandedFix === i ? null : i)}>
                  <span className="debug-fix-risk" style={{ color: riskColors[fix.risk] }} title={`Risk: ${fix.risk}`}>
                    {fix.risk === 'low' ? '●' : fix.risk === 'medium' ? '◐' : '○'}
                  </span>
                  <span className="debug-fix-desc">{fix.description}</span>
                  {fix.breakingChange && <span className="debug-badge debug-badge-warn" title="Breaking change">breaking</span>}
                  <span className="debug-fix-file">{fix.file}</span>
                </div>
                {expandedFix === i && fix.diff && (
                  <div className="debug-fix-diff">
                    <pre><code>{fix.diff}</code></pre>
                    <button className="debug-btn debug-btn-primary" onClick={() => onApplyFix(fix)} aria-label={`Apply fix: ${fix.description}`}>
                      <span className="codicon codicon-check" aria-hidden="true" /> Apply Fix
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.relatedFiles.length > 0 && (
        <div className="debug-section">
          <h4>Related Files</h4>
          <ul className="debug-related">{result.relatedFiles.map(f => <li key={f}><span className="codicon codicon-file" aria-hidden="true" /> {f}</li>)}</ul>
        </div>
      )}

      <div className="debug-actions">
        <button className="debug-btn debug-btn-secondary" onClick={onSuggestBreakpoints} aria-label="Set suggested breakpoints">
          <span className="codicon codicon-debug-breakpoint" aria-hidden="true" /> Set Breakpoints
        </button>
      </div>
    </div>
  );
};

export default DebugView;
