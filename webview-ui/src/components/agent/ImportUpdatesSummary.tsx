import React, { useState } from 'react';

interface ImportUpdateView {
  filePath: string;
  oldImport: string;
  newImport: string;
}

interface ImportUpdatesSummaryProps {
  updates: ImportUpdateView[];
}

const ImportUpdatesSummary: React.FC<ImportUpdatesSummaryProps> = ({ updates }) => {
  const [expanded, setExpanded] = useState(false);

  if (updates.length === 0) return null;

  // Group by file
  const byFile = new Map<string, ImportUpdateView[]>();
  for (const u of updates) {
    const existing = byFile.get(u.filePath) || [];
    existing.push(u);
    byFile.set(u.filePath, existing);
  }

  return (
    <div style={{ margin: '8px 0', border: '1px solid var(--vscode-panel-border)', borderRadius: '4px', overflow: 'hidden' }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: '6px 10px', backgroundColor: 'var(--vscode-sideBarSectionHeader-background)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
        <span style={{ color: 'var(--vscode-foreground)' }}>
          Import Updates
          <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)' }}>{updates.length}</span>
        </span>
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '6px 10px' }}>
          <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginBottom: '6px' }}>
            {updates.length} import statement{updates.length !== 1 ? 's' : ''} updated across {byFile.size} file{byFile.size !== 1 ? 's' : ''}
          </div>
          {[...byFile.entries()].map(([file, fileUpdates]) => (
            <div key={file} style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--vscode-foreground)', marginBottom: '2px' }}>{file}</div>
              {fileUpdates.map((u, i) => (
                <div key={i} style={{ paddingLeft: '12px', fontSize: '10px', fontFamily: 'var(--vscode-editor-font-family)', lineHeight: '1.6' }}>
                  <span style={{ color: 'var(--vscode-testing-iconFailed)', textDecoration: 'line-through' }}>{u.oldImport}</span>
                  <br />
                  <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>{u.newImport}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImportUpdatesSummary;
