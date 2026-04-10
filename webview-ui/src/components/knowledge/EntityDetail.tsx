/**
 * EntityDetail.tsx — Phase 19 Step 19.4
 * Entity details: signature, docstring, callers, callees, complexity
 */

import React from 'react';

interface CodeEntity { id: string; type: string; name: string; filePath: string; startLine: number; endLine: number; signature?: string; docstring?: string; complexity?: number; isExported?: boolean; }
interface Relation { entity: CodeEntity; type: string; }

interface EntityDetailProps {
  entity: CodeEntity;
  callers: Relation[];
  callees: Relation[];
  onNavigate: (file: string, line: number) => void;
  onClose: () => void;
}

const typeIcons: Record<string, string> = {
  class: 'codicon-symbol-class', function: 'codicon-symbol-method', method: 'codicon-symbol-method',
  interface: 'codicon-symbol-interface', enum: 'codicon-symbol-enum', variable: 'codicon-symbol-variable',
  file: 'codicon-file', type_alias: 'codicon-symbol-class', module: 'codicon-package',
};

const EntityDetail: React.FC<EntityDetailProps> = ({ entity, callers, callees, onNavigate, onClose }) => {
  return (
    <div className="entity-detail" role="region" aria-label={`${entity.type}: ${entity.name}`}>
      <div className="entity-header">
        <span className={`codicon ${typeIcons[entity.type] || 'codicon-symbol-misc'}`} />
        <h3>{entity.name}</h3>
        <span className="entity-type">{entity.type}</span>
        {entity.isExported && <span className="entity-badge">exported</span>}
        <button className="review-btn review-btn-ghost" onClick={onClose}><span className="codicon codicon-close" /></button>
      </div>

      <button className="entity-location" onClick={() => onNavigate(entity.filePath, entity.startLine)}>
        {entity.filePath}:{entity.startLine}-{entity.endLine}
      </button>

      {entity.signature && <pre className="entity-sig">{entity.signature}</pre>}
      {entity.docstring && <p className="entity-doc">{entity.docstring}</p>}
      {entity.complexity !== undefined && (
        <div className="entity-complexity" style={{ color: entity.complexity > 10 ? 'var(--vscode-charts-red)' : entity.complexity > 5 ? 'var(--vscode-charts-yellow)' : 'var(--vscode-charts-green)' }}>
          Complexity: {entity.complexity}
        </div>
      )}

      {callers.length > 0 && (
        <div className="entity-relations">
          <h4>Called by ({callers.length})</h4>
          <ul>{callers.map((r, i) => (
            <li key={i}><button onClick={() => onNavigate(r.entity.filePath, r.entity.startLine)}>
              <span className={`codicon ${typeIcons[r.entity.type] || 'codicon-symbol-misc'}`} /> {r.entity.name}
            </button></li>
          ))}</ul>
        </div>
      )}

      {callees.length > 0 && (
        <div className="entity-relations">
          <h4>Calls ({callees.length})</h4>
          <ul>{callees.map((r, i) => (
            <li key={i}><button onClick={() => onNavigate(r.entity.filePath, r.entity.startLine)}>
              <span className={`codicon ${typeIcons[r.entity.type] || 'codicon-symbol-misc'}`} /> {r.entity.name}
            </button></li>
          ))}</ul>
        </div>
      )}
    </div>
  );
};

export default EntityDetail;
