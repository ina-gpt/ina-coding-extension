import React, { useState } from 'react';
import { Globe, ExternalLink, Download, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import type { WebSearchResult } from '@/types';

interface WebSearchCardProps {
  results: WebSearchResult[];
  query: string;
  onExpand?: () => void;
  onFetchPage?: (url: string) => void;
}

export const WebSearchCard: React.FC<WebSearchCardProps> = ({
  results,
  query,
  onExpand,
  onFetchPage,
}) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? results : results.slice(0, 3);

  return (
    <div className="my-2 rounded border border-blue-500/30 bg-blue-500/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-blue-500/20">
        <div className="flex items-center gap-1.5 text-xs">
          <Globe size={12} className="text-blue-400" />
          <span className="font-medium text-blue-400">Web Search</span>
          <span className="text-[var(--vscode-descriptionForeground)] truncate max-w-[300px]">
            {query}
          </span>
        </div>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {results.length} result{results.length === 1 ? '' : 's'}
        </span>
      </div>

      {results.length === 0 && (
        <div className="px-3 py-3 text-xs text-[var(--vscode-descriptionForeground)]">
          No results found
        </div>
      )}

      <div className="divide-y divide-blue-500/10">
        {visible.map((r, i) => (
          <div key={`${r.url}-${i}`} className="px-3 py-2 hover:bg-blue-500/5">
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-1 flex-shrink-0 w-4 text-right">
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-400 hover:underline truncate block"
                  title={r.url}
                >
                  {r.title || r.url}
                </a>
                <div className="flex items-center gap-2 text-[10px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                  <span className="bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] px-1 rounded">
                    {r.domain}
                  </span>
                </div>
                <div
                  className={clsx(
                    'text-[11px] text-[var(--vscode-foreground)] mt-1',
                    !expanded && 'line-clamp-2'
                  )}
                >
                  {r.snippet}
                </div>
              </div>
              {onFetchPage && (
                <button
                  onClick={() => onFetchPage(r.url)}
                  className="p-1 rounded hover:bg-blue-500/20 text-blue-400 flex-shrink-0"
                  title="Fetch full page"
                >
                  <Download size={11} />
                </button>
              )}
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded hover:bg-blue-500/20 text-blue-400 flex-shrink-0"
                title="Open in browser"
              >
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {results.length > 3 && (
        <button
          onClick={() => {
            setExpanded(!expanded);
            if (!expanded) onExpand?.();
          }}
          className="w-full px-3 py-1.5 text-[11px] text-blue-400 hover:bg-blue-500/10 flex items-center justify-center gap-1 border-t border-blue-500/20"
        >
          {expanded ? (
            <>
              <ChevronUp size={11} />
              Show less
            </>
          ) : (
            <>
              <ChevronDown size={11} />
              Show {results.length - 3} more
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default WebSearchCard;
