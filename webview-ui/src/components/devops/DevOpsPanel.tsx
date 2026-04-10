/**
 * DevOpsPanel.tsx — Phase 19 Step 19.5
 * Main DevOps dashboard
 */

import React from 'react';

interface ProjectStack { runtime: string; framework: string; packageManager: string; databases: string[]; existingDocker: boolean; existingCI: string | null; }
interface GeneratedFile { name: string; content: string; }
interface InfraRecommendation { category: string; severity: string; message: string; suggestedChange: string; file?: string; autoFixable: boolean; }

interface DevOpsPanelProps {
  stack: ProjectStack | null;
  generatedFiles: GeneratedFile[];
  recommendations: InfraRecommendation[];
  isDetecting: boolean;
  onDetectStack: () => void;
  onGenerateDocker: () => void;
  onGenerateCI: () => void;
  onGenerateK8s: () => void;
  onAnalyzeInfra: () => void;
  onSyncEnv: () => void;
  onSaveFile: (file: GeneratedFile) => void;
  onAutoFix: (rec: InfraRecommendation) => void;
}

const DevOpsPanel: React.FC<DevOpsPanelProps> = ({ stack, generatedFiles, recommendations, isDetecting, onDetectStack, onGenerateDocker, onGenerateCI, onGenerateK8s, onAnalyzeInfra, onSyncEnv, onSaveFile, onAutoFix }) => {
  return (
    <div className="devops-panel" role="region" aria-label="DevOps Agent">
      <div className="devops-header">
        <h3><span className="codicon codicon-server-process" aria-hidden="true" /> INA-7 Pro DevOps Agent</h3>
      </div>

      {!stack && (
        <button className="devops-btn devops-btn-primary" onClick={onDetectStack} disabled={isDetecting}>
          {isDetecting ? <><span className="codicon codicon-loading codicon-modifier-spin" /> Detecting...</> : <><span className="codicon codicon-search" /> Detect Stack</>}
        </button>
      )}

      {stack && (
        <div className="devops-stack">
          <h4>Detected Stack</h4>
          <div className="devops-stack-info">
            <span><strong>Runtime:</strong> {stack.runtime}</span>
            <span><strong>Framework:</strong> {stack.framework || 'N/A'}</span>
            <span><strong>Package:</strong> {stack.packageManager}</span>
            <span><strong>DB:</strong> {stack.databases.join(', ') || 'none'}</span>
            <span><strong>Docker:</strong> {stack.existingDocker ? '✓' : '✗'}</span>
            <span><strong>CI:</strong> {stack.existingCI || 'none'}</span>
          </div>

          <div className="devops-actions" role="group" aria-label="Generate actions">
            <button className="devops-btn" onClick={onGenerateDocker}><span className="codicon codicon-package" /> Dockerfile</button>
            <button className="devops-btn" onClick={onGenerateCI}><span className="codicon codicon-play-circle" /> CI/CD</button>
            <button className="devops-btn" onClick={onGenerateK8s}><span className="codicon codicon-cloud" /> Kubernetes</button>
            <button className="devops-btn" onClick={onAnalyzeInfra}><span className="codicon codicon-shield" /> Analyze</button>
            <button className="devops-btn" onClick={onSyncEnv}><span className="codicon codicon-key" /> Env Sync</button>
          </div>
        </div>
      )}

      {generatedFiles.length > 0 && (
        <div className="devops-files">
          <h4>Generated Files ({generatedFiles.length})</h4>
          <ul role="list">
            {generatedFiles.map((f, i) => (
              <li key={i} className="devops-file">
                <span className="codicon codicon-file" /> {f.name}
                <button className="devops-btn devops-btn-sm" onClick={() => onSaveFile(f)}>Save</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="devops-recs">
          <h4>Recommendations ({recommendations.length})</h4>
          <ul role="list">
            {recommendations.map((r, i) => (
              <li key={i} className={`devops-rec devops-rec-${r.severity}`}>
                <span className={`codicon ${r.severity === 'critical' ? 'codicon-error' : r.severity === 'warning' ? 'codicon-warning' : 'codicon-info'}`} />
                <div>
                  <p><strong>[{r.category}]</strong> {r.message}</p>
                  <p className="devops-rec-fix">{r.suggestedChange}</p>
                  {r.autoFixable && <button className="devops-btn devops-btn-sm" onClick={() => onAutoFix(r)}>Auto-Fix</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DevOpsPanel;
