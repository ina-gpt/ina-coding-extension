import React from 'react';
import { postMessage } from '../../utils/vscode';

interface PRContext {
  title: string | null;
  baseBranch: string;
  headBranch: string;
  commits: { shortHash: string; subject: string; author: string }[];
  filesChanged: { path: string; status: string }[];
  diffStats: { additions: number; deletions: number; filesChanged: number };
}

interface GitPRSummaryProps {
  pr: PRContext;
}

export const GitPRSummary: React.FC<GitPRSummaryProps> = ({ pr }) => {
  const handleInsertInChat = () => {
    postMessage({ type: 'insertGitMention', subCommand: 'pr' } as any);
  };

  return (
    <div className="git-pr-summary">
      <div className="git-pr-header">
        <h3 className="git-pr-title">{pr.title || 'Current Branch Changes'}</h3>
      </div>

      <div className="git-pr-flow">
        <span className="git-pr-branch git-pr-base">{pr.baseBranch}</span>
        <span className="git-pr-arrow">←</span>
        <span className="git-pr-branch git-pr-head">{pr.headBranch}</span>
      </div>

      <div className="git-pr-stats">
        <div className="git-pr-stat">
          <span className="git-pr-stat-value">{pr.commits.length}</span>
          <span className="git-pr-stat-label">commits</span>
        </div>
        <div className="git-pr-stat">
          <span className="git-pr-stat-value">{pr.diffStats.filesChanged}</span>
          <span className="git-pr-stat-label">files</span>
        </div>
        <div className="git-pr-stat">
          <span className="git-pr-stat-value git-stat-add">+{pr.diffStats.additions}</span>
          <span className="git-pr-stat-label">additions</span>
        </div>
        <div className="git-pr-stat">
          <span className="git-pr-stat-value git-stat-del">-{pr.diffStats.deletions}</span>
          <span className="git-pr-stat-label">deletions</span>
        </div>
      </div>

      <div className="git-pr-commits">
        <div className="git-section-title">COMMITS</div>
        {pr.commits.map((c, i) => (
          <div key={i} className="git-pr-commit">
            <span className="git-commit-hash">{c.shortHash}</span>
            <span className="git-pr-commit-subject">{c.subject}</span>
          </div>
        ))}
      </div>

      {pr.filesChanged.length > 0 && (
        <div className="git-pr-files">
          <div className="git-section-title">FILES CHANGED</div>
          {pr.filesChanged.slice(0, 20).map((f, i) => (
            <div key={i} className="git-pr-file">
              <span className="git-file-status">{f.status}</span> {f.path}
            </div>
          ))}
          {pr.filesChanged.length > 20 && (
            <div className="git-pr-more">...and {pr.filesChanged.length - 20} more files</div>
          )}
        </div>
      )}

      <button className="git-btn git-btn-full" onClick={handleInsertInChat}>
        Include in chat (@git:pr)
      </button>
    </div>
  );
};
