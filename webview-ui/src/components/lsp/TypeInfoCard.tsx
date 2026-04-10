import React from 'react';

interface TypeInfo {
  name: string;
  fullName: string;
  kind: string;
  members: { name: string; kind: string; type: string; isOptional: boolean; isReadonly: boolean; visibility: string | null }[] | null;
  parameters: { name: string; type: string; isOptional: boolean; isRest: boolean }[] | null;
  returnType: string | null;
  genericParams: string[] | null;
  documentation: string | null;
  filePath: string;
  line: number;
}

interface TypeInfoCardProps {
  typeInfo: TypeInfo;
  onGoToDefinition: () => void;
}

export const TypeInfoCard: React.FC<TypeInfoCardProps> = ({ typeInfo, onGoToDefinition }) => {
  return (
    <div className="lsp-type-card">
      <div className="lsp-type-header">
        <span className="lsp-type-kind">{typeInfo.kind}</span>
        <span className="lsp-type-name">{typeInfo.name}</span>
        {typeInfo.genericParams && (
          <span className="lsp-type-generics">{'<'}{typeInfo.genericParams.join(', ')}{'>'}</span>
        )}
      </div>

      {typeInfo.fullName && typeInfo.fullName !== typeInfo.name && (
        <pre className="lsp-type-signature"><code>{typeInfo.fullName}</code></pre>
      )}

      {typeInfo.parameters && typeInfo.parameters.length > 0 && (
        <div className="lsp-type-section">
          <div className="lsp-type-section-title">Parameters</div>
          {typeInfo.parameters.map((p, i) => (
            <div key={i} className="lsp-type-member">
              {p.isRest && <span className="lsp-badge">...</span>}
              <span className="lsp-member-name">{p.name}</span>
              {p.isOptional && <span className="lsp-badge">?</span>}
              <span className="lsp-member-type">{p.type}</span>
            </div>
          ))}
        </div>
      )}

      {typeInfo.returnType && (
        <div className="lsp-type-return">Returns: <code>{typeInfo.returnType}</code></div>
      )}

      {typeInfo.members && typeInfo.members.length > 0 && (
        <div className="lsp-type-section">
          <div className="lsp-type-section-title">Members</div>
          {typeInfo.members.map((m, i) => (
            <div key={i} className="lsp-type-member">
              {m.visibility && <span className="lsp-badge lsp-badge-vis">{m.visibility[0]}</span>}
              {m.isReadonly && <span className="lsp-badge">ro</span>}
              <span className="lsp-member-name">{m.name}</span>
              {m.isOptional && <span className="lsp-badge">?</span>}
              <span className="lsp-member-type">{m.type}</span>
            </div>
          ))}
        </div>
      )}

      {typeInfo.documentation && (
        <div className="lsp-type-docs">{typeInfo.documentation}</div>
      )}

      <button className="lsp-btn lsp-btn-link" onClick={onGoToDefinition}>
        Go to definition ({typeInfo.filePath}:{typeInfo.line + 1})
      </button>
    </div>
  );
};
