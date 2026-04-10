/**
 * ArchitectureView.tsx — Phase 19 Step 19.4
 * Architecture layer diagram with violation warnings
 */

import React from 'react';

interface ArchitectureLayer { name: string; pattern: string; entities: string[]; description: string; fileCount: number; }
interface Violation { from: string; to: string; file: string; dependency: string; }

interface ArchitectureViewProps {
  layers: ArchitectureLayer[];
  violations: Violation[];
  pattern: string;
  onNavigate: (file: string) => void;
}

const layerColors: Record<string, string> = {
  Presentation: '#3b82f6', Application: '#8b5cf6', Domain: '#10b981',
  Infrastructure: '#f59e0b', Configuration: '#6b7280', Testing: '#ec4899', Other: '#9ca3af',
};

const ArchitectureView: React.FC<ArchitectureViewProps> = ({ layers, violations, pattern, onNavigate }) => {
  return (
    <div className="arch-view" role="region" aria-label="Architecture overview">
      <div className="arch-header">
        <h3><span className="codicon codicon-layers" aria-hidden="true" /> Architecture</h3>
        <span className="arch-pattern">{pattern}</span>
      </div>

      <div className="arch-layers" role="list">
        {layers.filter(l => l.name !== 'Other').map(layer => (
          <div key={layer.name} className="arch-layer" role="listitem" style={{ borderLeftColor: layerColors[layer.name] || '#999' }}>
            <div className="arch-layer-header">
              <strong>{layer.name}</strong>
              <span className="arch-count">{layer.fileCount} files</span>
            </div>
            <p className="arch-desc">{layer.description}</p>
          </div>
        ))}
      </div>

      {violations.length > 0 && (
        <div className="arch-violations">
          <h4><span className="codicon codicon-warning" style={{ color: 'var(--vscode-charts-yellow)' }} /> Layer Violations ({violations.length})</h4>
          <ul role="list">
            {violations.map((v, i) => (
              <li key={i} className="arch-violation">
                <span className="arch-violation-arrow">{v.from} → {v.to}</span>
                <button className="arch-violation-file" onClick={() => onNavigate(v.file)}>{v.file}</button>
                <span className="arch-violation-dep">imports {v.dependency}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {violations.length === 0 && <p className="arch-clean"><span className="codicon codicon-check" style={{ color: 'var(--vscode-charts-green)' }} /> Clean layer dependencies</p>}
    </div>
  );
};

export default ArchitectureView;
