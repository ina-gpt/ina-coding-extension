/**
 * FixPreview.tsx — Phase 19 Step 19.1
 * Diff preview of suggested fix before applying
 */

import React from 'react';

interface Fix {
  description: string;
  file: string;
  diff: string;
  risk: 'low' | 'medium' | 'high';
  breakingChange: boolean;
}

interface FixPreviewProps {
  fix: Fix;
  onApply: () => void;
  onDismiss: () => void;
}

const FixPreview: React.FC<FixPreviewProps> = ({ fix, onApply, onDismiss }) => {
  const diffLines = fix.diff.split('\n');

  return (
    <div className="fix-preview" role="dialog" aria-label={`Fix preview: ${fix.description}`}>
      <div className="fix-preview-header">
        <h4>
          <span className="codicon codicon-diff" aria-hidden="true" /> Fix Preview
        </h4>
        <div className="fix-preview-meta">
          <span className={`fix-risk fix-risk-${fix.risk}`}>Risk: {fix.risk}</span>
          {fix.breakingChange && <span className="fix-breaking">Breaking Change</span>}
        </div>
      </div>

      <p className="fix-preview-desc">{fix.description}</p>
      <p className="fix-preview-file">
        <span className="codicon codicon-file" aria-hidden="true" /> {fix.file}
      </p>

      <div className="fix-preview-diff" role="region" aria-label="Diff">
        <pre>
          {diffLines.map((line, i) => {
            let cls = 'diff-context';
            if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-add';
            else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-remove';
            else if (line.startsWith('@@')) cls = 'diff-hunk';
            return <div key={i} className={cls}>{line}</div>;
          })}
        </pre>
      </div>

      <div className="fix-preview-actions">
        <button className="debug-btn debug-btn-primary" onClick={onApply} aria-label="Apply this fix">
          <span className="codicon codicon-check" aria-hidden="true" /> Apply
        </button>
        <button className="debug-btn debug-btn-ghost" onClick={onDismiss} aria-label="Cancel">
          Cancel
        </button>
      </div>
    </div>
  );
};

export default FixPreview;
