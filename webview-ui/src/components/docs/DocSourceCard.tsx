import React, { useState } from 'react';

interface DocSourceProps {
  source: {
    id: string;
    name: string;
    type: string;
    status: string;
    doc_count: number;
    chunk_count: number;
    last_indexed_at: string | null;
    url: string | null;
    package_name: string | null;
  };
  crawlProgress: {
    pagesCrawled: number;
    pagesFound: number;
    status: string;
  } | null;
  onRecrawl: () => void;
  onRemove: () => void;
}

export const DocSourceCard: React.FC<DocSourceProps> = ({ source, crawlProgress, onRecrawl, onRemove }) => {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const statusClass = source.status === 'ready' ? 'status-ready' : source.status === 'crawling' || source.status === 'indexing' ? 'status-crawling' : source.status === 'failed' ? 'status-failed' : 'status-pending';

  const typeBadge = source.type === 'builtin' ? 'Builtin' : source.type === 'url' ? 'URL' : source.type === 'local' ? 'Local' : source.type === 'npm' ? 'NPM' : 'Custom';

  const progressPercent = crawlProgress && crawlProgress.pagesFound > 0
    ? Math.round((crawlProgress.pagesCrawled / crawlProgress.pagesFound) * 100)
    : 0;

  const isCrawling = source.status === 'crawling' || source.status === 'indexing';

  return (
    <div className="doc-source-card">
      <div className="doc-source-header">
        <div className="doc-source-info">
          <span className="doc-source-name">{source.name}</span>
          <span className={`doc-type-badge`}>{typeBadge}</span>
        </div>
        <span className={`doc-status-badge ${statusClass}`}>{source.status}</span>
      </div>

      <div className="doc-source-stats">
        {source.doc_count} pages, {source.chunk_count} chunks
        {source.last_indexed_at && (
          <> | Last indexed: {new Date(source.last_indexed_at).toLocaleDateString()}</>
        )}
      </div>

      {isCrawling && crawlProgress && (
        <div className="doc-progress">
          <div className="doc-progress-bar">
            <div className="doc-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="doc-progress-text">
            {crawlProgress.pagesCrawled}/{crawlProgress.pagesFound} pages — {crawlProgress.status}
          </div>
        </div>
      )}

      <div className="doc-source-actions">
        <button className="docs-btn docs-btn-secondary" onClick={onRecrawl} disabled={isCrawling}>
          {isCrawling ? 'Crawling...' : 'Re-crawl'}
        </button>
        {confirmRemove ? (
          <>
            <button className="docs-btn docs-btn-danger" onClick={() => { onRemove(); setConfirmRemove(false); }}>Confirm</button>
            <button className="docs-btn docs-btn-secondary" onClick={() => setConfirmRemove(false)}>Cancel</button>
          </>
        ) : (
          <button className="docs-btn docs-btn-danger" onClick={() => setConfirmRemove(true)}>Remove</button>
        )}
      </div>
    </div>
  );
};
