import React, { useState } from 'react';

interface DiagnosticInfo {
  filePath: string;
  range: { startLine: number; startCol: number };
  message: string;
  severity: string;
  code: string | null;
  source: string | null;
}

interface DiagnosticsListProps {
  diagnostics: DiagnosticInfo[];
  onNavigate: (filePath: string, line: number) => void;
  onFixWithAI: (diagnostic: DiagnosticInfo) => void;
  onExplain: (diagnostic: DiagnosticInfo) => void;
}

const SEVERITY_ICONS: Record<string, { icon: string; color: string }> = {
  error: { icon: '✕', color: 'var(--vscode-testing-iconFailed, #f44747)' },
  warning: { icon: '⚠', color: 'var(--vscode-editorWarning-foreground, #cca700)' },
  info: { icon: 'ℹ', color: 'var(--vscode-editorInfo-foreground, #75beff)' },
  hint: { icon: '💡', color: 'var(--vscode-editorHint-foreground, #999)' },
};

export const DiagnosticsList: React.FC<DiagnosticsListProps> = ({ diagnostics, onNavigate, onFixWithAI, onExplain }) => {
  const [filter, setFilter] = useState<string | null>(null);

  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const warnings = diagnostics.filter(d => d.severity === 'warning').length;
  const filtered = filter ? diagnostics.filter(d => d.severity === filter) : diagnostics;

  return (
    <div className="lsp-diagnostics">
      <div className="lsp-diagnostics-summary">
        <span className="lsp-diag-count lsp-diag-error" onClick={() => setFilter(filter === 'error' ? null : 'error')}>{errors} errors</span>
        <span className="lsp-diag-count lsp-diag-warning" onClick={() => setFilter(filter === 'warning' ? null : 'warning')}>{warnings} warnings</span>
        {filter && <span className="lsp-diag-clear" onClick={() => setFilter(null)}>Show all</span>}
      </div>

      {filtered.map((diag, i) => {
        const sev = SEVERITY_ICONS[diag.severity] || SEVERITY_ICONS.info;
        return (
          <div key={i} className="lsp-diagnostic-item">
            <div className="lsp-diagnostic-header">
              <span className="lsp-diagnostic-icon" style={{ color: sev.color }}>{sev.icon}</span>
              <span className="lsp-diagnostic-location" onClick={() => onNavigate(diag.filePath, diag.range.startLine)}>
                {diag.filePath}:{diag.range.startLine + 1}
              </span>
              {diag.source && <span className="lsp-diagnostic-source">{diag.source}</span>}
              {diag.code && <span className="lsp-diagnostic-code">{diag.code}</span>}
            </div>
            <div className="lsp-diagnostic-message">{diag.message}</div>
            <div className="lsp-diagnostic-actions">
              <button className="lsp-btn lsp-btn-sm" onClick={() => onFixWithAI(diag)}>Fix</button>
              <button className="lsp-btn lsp-btn-sm lsp-btn-secondary" onClick={() => onExplain(diag)}>Explain</button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
