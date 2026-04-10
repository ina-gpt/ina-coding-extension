import React from 'react';

interface BlameLine {
  lineNumber: number;
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  summary: string;
  content: string;
  isUncommitted: boolean;
}

interface GitBlameOverlayProps {
  blame: BlameLine[];
  startLine: number;
  endLine: number;
  compact?: boolean;
}

export const GitBlameOverlay: React.FC<GitBlameOverlayProps> = ({ blame, startLine, endLine, compact }) => {
  const filtered = blame.filter(l => l.lineNumber >= startLine && l.lineNumber <= endLine);

  if (filtered.length === 0) return null;

  if (compact) {
    const grouped = new Map<string, { author: string; count: number; lastDate: string; summary: string }>();
    for (const line of filtered) {
      const key = line.hash;
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
      } else {
        grouped.set(key, { author: line.author, count: 1, lastDate: line.date, summary: line.summary });
      }
    }

    return (
      <div className="git-blame-compact">
        {[...grouped.entries()].map(([hash, info]) => (
          <div key={hash} className="git-blame-group">
            <span className="git-blame-hash">{hash.slice(0, 7)}</span>
            <span className="git-blame-author">{info.author}</span>
            <span className="git-blame-count">{info.count} lines</span>
            <span className="git-blame-summary">{info.summary}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="git-blame-overlay">
      <table className="git-blame-table">
        <tbody>
          {filtered.map(line => (
            <tr key={line.lineNumber} className={line.isUncommitted ? 'git-blame-uncommitted' : ''}>
              <td className="git-blame-ln">{line.lineNumber}</td>
              <td className="git-blame-hash">{line.shortHash}</td>
              <td className="git-blame-author">{line.isUncommitted ? 'You' : line.author}</td>
              <td className="git-blame-content"><code>{line.content}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
