/**
 * PipelinePreview.tsx — Phase 19 Step 19.5
 * CI/CD pipeline preview with stage visualization
 */

import React from 'react';

interface PipelinePreviewProps {
  content: string;
  provider: string;
  filename: string;
  onSave: (filename: string, content: string) => void;
  onClose: () => void;
}

const PipelinePreview: React.FC<PipelinePreviewProps> = ({ content, provider, filename, onSave, onClose }) => {
  // Extract stages from YAML
  const stages = content.match(/^\s{2}(\w+):/gm)?.map(s => s.trim().replace(':', '')) || [];

  return (
    <div className="pipeline-preview" role="region" aria-label="CI/CD pipeline">
      <div className="pipeline-header">
        <h4><span className="codicon codicon-play-circle" /> {provider} Pipeline</h4>
        <button className="devops-btn devops-btn-ghost" onClick={onClose}><span className="codicon codicon-close" /></button>
      </div>

      {stages.length > 0 && (
        <div className="pipeline-stages" role="list" aria-label="Pipeline stages">
          {stages.filter(s => !['on', 'name', 'concurrency', 'jobs', 'stages', 'variables'].includes(s)).map((stage, i, arr) => (
            <React.Fragment key={stage}>
              <span className="pipeline-stage">{stage}</span>
              {i < arr.length - 1 && <span className="pipeline-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
      )}

      <pre className="pipeline-code"><code>{content}</code></pre>
      <div className="pipeline-actions">
        <button className="devops-btn devops-btn-primary" onClick={() => onSave(filename, content)}><span className="codicon codicon-save" /> Save {filename}</button>
      </div>
    </div>
  );
};

export default PipelinePreview;
