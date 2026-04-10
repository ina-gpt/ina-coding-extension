/**
 * CoverageGapView.tsx — Phase 19 Step 19.2
 * Visual coverage gap report with auto-generate action
 */

import React from 'react';

interface CoverageGap {
  file: string;
  function: string;
  uncoveredLines: number[];
  branchInfo?: string;
  complexity: number;
  priority: 'high' | 'medium' | 'low';
}

interface CoverageGapViewProps {
  gaps: CoverageGap[];
  isLoading: boolean;
  onGenerateForGap: (gap: CoverageGap) => void;
  onGenerateForAll: () => void;
  onRefresh: () => void;
}

const priorityColors: Record<string, string> = {
  high: 'var(--vscode-charts-red)',
  medium: 'var(--vscode-charts-yellow)',
  low: 'var(--vscode-charts-green)',
};

const CoverageGapView: React.FC<CoverageGapViewProps> = ({
  gaps, isLoading, onGenerateForGap, onGenerateForAll, onRefresh,
}) => {
  const highCount = gaps.filter(g => g.priority === 'high').length;
  const mediumCount = gaps.filter(g => g.priority === 'medium').length;

  return (
    <div className="coverage-view" role="region" aria-label="Coverage gaps">
      <div className="coverage-header">
        <h3><span className="codicon codicon-shield" aria-hidden="true" /> Coverage Gaps</h3>
        <div className="coverage-actions">
          <button className="testgen-btn testgen-btn-sm" onClick={onRefresh} disabled={isLoading} aria-label="Refresh coverage">
            <span className={`codicon codicon-refresh ${isLoading ? 'codicon-modifier-spin' : ''}`} aria-hidden="true" />
          </button>
          {gaps.length > 0 && (
            <button className="testgen-btn testgen-btn-sm testgen-btn-primary" onClick={onGenerateForAll} aria-label="Generate tests for all gaps">
              <span className="codicon codicon-beaker" aria-hidden="true" /> Fill All Gaps
            </button>
          )}
        </div>
      </div>

      {gaps.length > 0 && (
        <div className="coverage-summary" aria-live="polite">
          <span style={{ color: 'var(--vscode-charts-red)' }}>{highCount} high</span>
          <span style={{ color: 'var(--vscode-charts-yellow)' }}>{mediumCount} medium</span>
          <span style={{ color: 'var(--vscode-charts-green)' }}>{gaps.length - highCount - mediumCount} low</span>
        </div>
      )}

      <ul className="coverage-list" role="list">
        {gaps.map((gap, i) => (
          <li key={i} className="coverage-item" role="listitem">
            <div className="coverage-item-header">
              <span className="coverage-priority" style={{ color: priorityColors[gap.priority] }} aria-label={`Priority: ${gap.priority}`}>
                ●
              </span>
              <span className="coverage-file">{gap.file}</span>
              {gap.function !== '*' && <span className="coverage-fn">::{gap.function}</span>}
            </div>
            {gap.branchInfo && <p className="coverage-info">{gap.branchInfo}</p>}
            {gap.uncoveredLines.length > 0 && (
              <p className="coverage-lines">Uncovered: L{gap.uncoveredLines.slice(0, 10).join(', L')}{gap.uncoveredLines.length > 10 ? ` +${gap.uncoveredLines.length - 10} more` : ''}</p>
            )}
            <button className="testgen-btn testgen-btn-sm" onClick={() => onGenerateForGap(gap)} aria-label={`Generate tests for ${gap.file}`}>
              <span className="codicon codicon-beaker" aria-hidden="true" /> Generate
            </button>
          </li>
        ))}
      </ul>

      {!isLoading && gaps.length === 0 && (
        <div className="coverage-empty" role="status">
          <span className="codicon codicon-check" aria-hidden="true" />
          <p>No significant coverage gaps found</p>
        </div>
      )}
    </div>
  );
};

export default CoverageGapView;
