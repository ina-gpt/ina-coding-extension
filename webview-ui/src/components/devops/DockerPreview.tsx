/**
 * DockerPreview.tsx — Phase 19 Step 19.5
 * Dockerfile preview with save action
 */

import React from 'react';

interface DockerPreviewProps {
  dockerfile: string;
  dockerignore: string;
  composeFile?: string;
  onSave: (filename: string, content: string) => void;
  onClose: () => void;
}

const DockerPreview: React.FC<DockerPreviewProps> = ({ dockerfile, dockerignore, composeFile, onSave, onClose }) => {
  const [tab, setTab] = React.useState<'dockerfile' | 'ignore' | 'compose'>('dockerfile');

  const content = tab === 'dockerfile' ? dockerfile : tab === 'ignore' ? dockerignore : composeFile || '';
  const filename = tab === 'dockerfile' ? 'Dockerfile' : tab === 'ignore' ? '.dockerignore' : 'docker-compose.yml';

  return (
    <div className="docker-preview" role="region" aria-label="Docker configuration">
      <div className="docker-header">
        <div className="docker-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'dockerfile'} onClick={() => setTab('dockerfile')}>Dockerfile</button>
          <button role="tab" aria-selected={tab === 'ignore'} onClick={() => setTab('ignore')}>.dockerignore</button>
          {composeFile && <button role="tab" aria-selected={tab === 'compose'} onClick={() => setTab('compose')}>Compose</button>}
        </div>
        <button className="devops-btn devops-btn-ghost" onClick={onClose}><span className="codicon codicon-close" /></button>
      </div>
      <pre className="docker-code"><code>{content}</code></pre>
      <div className="docker-actions">
        <button className="devops-btn devops-btn-primary" onClick={() => onSave(filename, content)}><span className="codicon codicon-save" /> Save {filename}</button>
      </div>
    </div>
  );
};

export default DockerPreview;
