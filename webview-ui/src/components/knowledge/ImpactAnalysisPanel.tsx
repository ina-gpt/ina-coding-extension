/**
 * ImpactAnalysisPanel.tsx — Phase 19 Step 19.4
 * "What will this change affect?" view
 */

import React from 'react';

interface CodeEntity { id: string; type: string; name: string; filePath: string; startLine: number; complexity?: number; }
interface ImpactAnalysis { changedEntity: CodeEntity; directlyAffected: CodeEntity[]; transitivelyAffected: CodeEntity[]; riskScore: number; suggestedTestFiles: string[]; }

interface ImpactAnalysisPanelProps {
  analyses: ImpactAnalysis[];
  isAnalyzing: boolean;
  onNavigate: (file: string, line: number) => void;
  onRunTests: (files: string[]) => void;
}

const riskColor = (score: number) => score >= 70 ? 'var(--vscode-charts-red)' : score >= 40 ? 'var(--vscode-charts-yellow)' : 'var(--vscode-charts-green)';

const ImpactAnalysisPanel: React.FC<ImpactAnalysisPanelProps> = ({ analyses, isAnalyzing, onNavigate, onRunTests }) => {
  if (isAnalyzing) return <div className="impact-panel" role="status"><span className="codicon codicon-loading codicon-modifier-spin" /> Analyzing impact...</div>;

  if (analyses.length === 0) return <div className="impact-panel"><p>No significant impact detected for current changes.</p></div>;

  const totalDirect = new Set(analyses.flatMap(a => a.directlyAffected.map(e => e.filePath))).size;
  const allTests = [...new Set(analyses.flatMap(a => a.suggestedTestFiles))];

  return (
    <div className="impact-panel" role="region" aria-label="Impact analysis">
      <div className="impact-header">
        <h3><span className="codicon codicon-graph" aria-hidden="true" /> Impact Analysis</h3>
        <span>{totalDirect} file(s) directly affected</span>
      </div>

      {allTests.length > 0 && (
        <div className="impact-tests">
          <button className="review-btn review-btn-sm review-btn-primary" onClick={() => onRunTests(allTests)}><span className="codicon codicon-beaker" /> Run {allTests.length} suggested test(s)</button>
        </div>
      )}

      <ul className="impact-list" role="list">
        {analyses.map((a, i) => (
          <li key={i} className="impact-item" role="listitem">
            <div className="impact-entity">
              <span className="impact-risk" style={{ color: riskColor(a.riskScore) }} title={`Risk: ${a.riskScore}%`}>{a.riskScore}%</span>
              <button className="impact-name" onClick={() => onNavigate(a.changedEntity.filePath, a.changedEntity.startLine)}>
                <span className="codicon codicon-symbol-method" /> {a.changedEntity.name}
              </button>
              <span className="impact-file">{a.changedEntity.filePath}</span>
            </div>
            {a.directlyAffected.length > 0 && (
              <div className="impact-affected">
                <strong>Direct ({a.directlyAffected.length}):</strong>
                {a.directlyAffected.slice(0, 5).map(e => (
                  <button key={e.id} className="impact-dep" onClick={() => onNavigate(e.filePath, e.startLine)}>{e.name}</button>
                ))}
                {a.directlyAffected.length > 5 && <span>+{a.directlyAffected.length - 5} more</span>}
              </div>
            )}
            {a.transitivelyAffected.length > 0 && (
              <div className="impact-transitive"><strong>Transitive ({a.transitivelyAffected.length}):</strong> {a.transitivelyAffected.slice(0, 3).map(e => e.name).join(', ')}{a.transitivelyAffected.length > 3 ? ` +${a.transitivelyAffected.length - 3}` : ''}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ImpactAnalysisPanel;
