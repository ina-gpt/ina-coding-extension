/**
 * ReviewPanel.tsx — Phase 19 Step 19.3
 * Full review dashboard with file list, inline comments, score
 */

import React, { useState } from 'react';

interface ReviewComment { file: string; line: number; endLine?: number; severity: string; category: string; message: string; suggestedFix?: string; }
interface ReviewReport { summary: string; overallScore: number; comments: ReviewComment[]; approvalStatus: string; filesReviewed: number; linesReviewed: number; categoryCounts: Record<string, number>; }

interface ReviewPanelProps {
  report: ReviewReport | null;
  isReviewing: boolean;
  onStartReview: () => void;
  onApplyFix: (comment: ReviewComment) => void;
  onNavigate: (file: string, line: number) => void;
  onDismiss: () => void;
}

const sevColors: Record<string, string> = { critical: 'var(--vscode-charts-red)', warning: 'var(--vscode-charts-yellow)', suggestion: 'var(--vscode-charts-blue)', nitpick: 'var(--vscode-descriptionForeground)' };

const ReviewPanel: React.FC<ReviewPanelProps> = ({ report, isReviewing, onStartReview, onApplyFix, onNavigate, onDismiss }) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (isReviewing) {
    return (
      <div className="review-panel" role="status"><span className="codicon codicon-loading codicon-modifier-spin" /> INA-7 Pro reviewing code...</div>
    );
  }

  if (!report) {
    return (
      <div className="review-panel">
        <h3><span className="codicon codicon-eye" aria-hidden="true" /> INA-7 Pro Code Review</h3>
        <button className="review-btn review-btn-primary" onClick={onStartReview}><span className="codicon codicon-play" aria-hidden="true" /> Start Review</button>
      </div>
    );
  }

  const fileComments = new Map<string, ReviewComment[]>();
  for (const c of report.comments) {
    const arr = fileComments.get(c.file) || [];
    arr.push(c);
    fileComments.set(c.file, arr);
  }
  const shownComments = selectedFile ? (fileComments.get(selectedFile) || []) : report.comments;

  return (
    <div className="review-panel" role="region" aria-label="Code review">
      <div className="review-header">
        <h3><span className="codicon codicon-eye" aria-hidden="true" /> Review Results</h3>
        <span className={`review-score ${report.overallScore >= 80 ? 'good' : report.overallScore >= 50 ? 'fair' : 'poor'}`}>{report.overallScore}/100</span>
        <span className={`review-status review-status-${report.approvalStatus}`}>{report.approvalStatus === 'approve' ? '✓ Approve' : report.approvalStatus === 'request-changes' ? '✗ Changes Requested' : '● Comment'}</span>
        <button className="review-btn review-btn-ghost" onClick={onDismiss}><span className="codicon codicon-close" /></button>
      </div>
      <p className="review-summary">{report.summary}</p>
      <div className="review-meta">{report.filesReviewed} files · {report.linesReviewed} lines · {report.comments.length} comments</div>

      <div className="review-files" role="list" aria-label="Files">
        {Array.from(fileComments.entries()).map(([file, comments]) => {
          const criticals = comments.filter(c => c.severity === 'critical').length;
          const warnings = comments.filter(c => c.severity === 'warning').length;
          return (
            <button key={file} className={`review-file ${selectedFile === file ? 'active' : ''}`} onClick={() => setSelectedFile(selectedFile === file ? null : file)} role="listitem" aria-label={`${file} (${comments.length} comments)`}>
              <span className="codicon codicon-file" />{' '}{file.split('/').pop()}
              {criticals > 0 && <span className="review-badge critical">{criticals}</span>}
              {warnings > 0 && <span className="review-badge warning">{warnings}</span>}
            </button>
          );
        })}
      </div>

      <ul className="review-comments" role="list">
        {shownComments.map((c, i) => (
          <li key={i} className="review-comment" role="listitem">
            <div className="review-comment-header">
              <span style={{ color: sevColors[c.severity] }}>● {c.severity}</span>
              <span className="review-category">{c.category}</span>
              <button className="review-file-link" onClick={() => onNavigate(c.file, c.line)}>{c.file.split('/').pop()}:{c.line}</button>
            </div>
            <p className="review-comment-message">{c.message}</p>
            {c.suggestedFix && (
              <div className="review-comment-fix">
                <pre><code>{c.suggestedFix}</code></pre>
                <button className="review-btn review-btn-sm" onClick={() => onApplyFix(c)}><span className="codicon codicon-check" /> Apply</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ReviewPanel;
