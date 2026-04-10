/**
 * MutationReport.tsx — Phase 19 Step 19.2
 * Surviving mutants list with "Improve Test" actions
 */

import React from 'react';

interface MutationResult {
  mutant: string;
  location: { file: string; line: number };
  killed: boolean;
  survivingTest?: string;
}

interface MutationReportProps {
  results: MutationResult[];
  isRunning: boolean;
  onImproveTest: (result: MutationResult) => void;
  onNavigate: (file: string, line: number) => void;
}

const MutationReport: React.FC<MutationReportProps> = ({
  results, isRunning, onImproveTest, onNavigate,
}) => {
  const killed = results.filter(r => r.killed).length;
  const survived = results.filter(r => !r.killed).length;
  const score = results.length > 0 ? Math.round((killed / results.length) * 100) : 0;

  return (
    <div className="mutation-report" role="region" aria-label="Mutation testing report">
      <div className="mutation-header">
        <h3><span className="codicon codicon-symbol-event" aria-hidden="true" /> Mutation Testing</h3>
        {isRunning && <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />}
      </div>

      {results.length > 0 && (
        <div className="mutation-summary" aria-live="polite">
          <span className="mutation-score" style={{ color: score >= 80 ? 'var(--vscode-charts-green)' : score >= 50 ? 'var(--vscode-charts-yellow)' : 'var(--vscode-charts-red)' }}>
            Score: {score}%
          </span>
          <span>{killed} killed / {survived} survived / {results.length} total</span>
        </div>
      )}

      {survived > 0 && (
        <div className="mutation-survivors">
          <h4>Surviving Mutants ({survived})</h4>
          <ul className="mutation-list" role="list">
            {results.filter(r => !r.killed).map((r, i) => (
              <li key={i} className="mutation-item mutation-survived" role="listitem">
                <div className="mutation-item-header">
                  <span className="codicon codicon-warning" aria-hidden="true" style={{ color: 'var(--vscode-charts-yellow)' }} />
                  <span className="mutation-desc">{r.mutant}</span>
                </div>
                <button className="mutation-loc" onClick={() => onNavigate(r.location.file, r.location.line)}
                  aria-label={`Navigate to ${r.location.file} line ${r.location.line}`}>
                  {r.location.file}:{r.location.line}
                </button>
                <button className="testgen-btn testgen-btn-sm" onClick={() => onImproveTest(r)} aria-label="Improve test to catch this mutant">
                  <span className="codicon codicon-lightbulb" aria-hidden="true" /> Improve Test
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isRunning && results.length === 0 && (
        <div className="mutation-empty" role="status">
          <p>Run mutation testing to evaluate test quality</p>
        </div>
      )}
    </div>
  );
};

export default MutationReport;
