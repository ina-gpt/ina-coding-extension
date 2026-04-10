import React, { useState } from 'react';

interface SearchResult {
  chunk: {
    id: string;
    content: string;
    section_title: string | null;
    code_snippets: string[];
  };
  page: {
    url: string | null;
    title: string | null;
  };
  source: {
    name: string;
    type: string;
  };
  score: number;
  highlights: string[];
}

interface DocSearchResultsProps {
  results: SearchResult[];
  query: string;
  onOpenUrl?: (url: string) => void;
}

export const DocSearchResults: React.FC<DocSearchResultsProps> = ({ results, query, onOpenUrl }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (results.length === 0) {
    return <div className="docs-empty">No results found for "{query}".</div>;
  }

  return (
    <div className="doc-search-results">
      {results.map((result, idx) => {
        const isExpanded = expandedId === result.chunk.id;
        const scorePercent = Math.round(result.score * 100);
        const snippet = isExpanded ? result.chunk.content : result.chunk.content.slice(0, 200);

        return (
          <div key={result.chunk.id || idx} className="doc-search-item" onClick={() => setExpandedId(isExpanded ? null : result.chunk.id)}>
            <div className="doc-result-header">
              <span className="doc-result-source">{result.source.name}</span>
              <span className="doc-result-title">{result.chunk.section_title || result.page.title || 'Documentation'}</span>
              <span className="doc-result-score">{scorePercent}%</span>
            </div>

            <div className="doc-result-snippet">
              {snippet}{!isExpanded && result.chunk.content.length > 200 && '...'}
            </div>

            {isExpanded && result.chunk.code_snippets.length > 0 && (
              <div className="doc-result-code">
                {result.chunk.code_snippets.map((code, i) => (
                  <pre key={i}><code>{code}</code></pre>
                ))}
              </div>
            )}

            {result.page.url && (
              <a
                className="doc-result-link"
                href={result.page.url}
                onClick={(e) => { e.stopPropagation(); onOpenUrl?.(result.page.url!); }}
              >
                View docs
              </a>
            )}

            <div className="doc-score-bar">
              <div className="doc-score-fill" style={{ width: `${scorePercent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
