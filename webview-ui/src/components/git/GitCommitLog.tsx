import React, { useState } from 'react';

interface CommitView {
  hash: string;
  shortHash: string;
  author: string;
  authorDate: string;
  subject: string;
  body: string;
  filesChanged: { path: string; status: string }[];
  stats: { additions: number; deletions: number; filesChanged: number };
}

interface GitCommitLogProps {
  commits: CommitView[];
  onLoadMore: () => void;
  hasMore: boolean;
  onSelectCommit?: (hash: string) => void;
}

export const GitCommitLog: React.FC<GitCommitLogProps> = ({ commits, onLoadMore, hasMore, onSelectCommit }) => {
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = searchQuery
    ? commits.filter(c => c.subject.toLowerCase().includes(searchQuery.toLowerCase()) || c.author.toLowerCase().includes(searchQuery.toLowerCase()))
    : commits;

  const relativeDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  if (commits.length === 0) {
    return <div className="git-empty">No commits found.</div>;
  }

  return (
    <div className="git-commit-log">
      <input
        type="text"
        className="git-search-input"
        placeholder="Filter commits..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {filtered.map(commit => {
        const isExpanded = expandedHash === commit.hash;
        const initial = commit.author.charAt(0).toUpperCase();

        return (
          <div key={commit.hash} className={`git-commit-item ${isExpanded ? 'expanded' : ''}`} onClick={() => setExpandedHash(isExpanded ? null : commit.hash)}>
            <div className="git-commit-header">
              <span className="git-commit-avatar">{initial}</span>
              <div className="git-commit-info">
                <div className="git-commit-subject">{commit.subject}</div>
                <div className="git-commit-meta">
                  <span className="git-commit-hash" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(commit.shortHash); }} title="Click to copy">{commit.shortHash}</span>
                  <span className="git-commit-author">{commit.author}</span>
                  <span className="git-commit-date">{relativeDate(commit.authorDate)}</span>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="git-commit-details">
                {commit.body && <div className="git-commit-body">{commit.body}</div>}
                {commit.stats && (
                  <div className="git-commit-stats">
                    <span className="git-stat-add">+{commit.stats.additions}</span>
                    <span className="git-stat-del">-{commit.stats.deletions}</span>
                    <span>{commit.stats.filesChanged} files</span>
                  </div>
                )}
                {commit.filesChanged && commit.filesChanged.length > 0 && (
                  <div className="git-commit-files">
                    {commit.filesChanged.map((f, i) => (
                      <div key={i} className="git-commit-file">
                        <span className="git-file-status">{f.status}</span> {f.path}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {hasMore && (
        <button className="git-btn git-btn-full" onClick={onLoadMore}>Load more commits</button>
      )}
    </div>
  );
};
