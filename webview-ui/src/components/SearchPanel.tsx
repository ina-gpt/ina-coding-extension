import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  Search,
  FileCode,
  ChevronRight,
  ChevronDown,
  Clock,
  Zap,
  Filter,
  X,
  ExternalLink,
  Copy,
  Bookmark,
} from 'lucide-react';
import { postMessage, onMessage } from '@/utils/vscode';
import clsx from 'clsx';

// ============ Types ============

interface SearchResult {
  id: string;
  score: number;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  preview?: string;
  name?: string;
  type: string;
  language: string;
  signature?: string;
  documentation?: string;
  citation: {
    id: string;
    file: string;
    startLine: number;
    endLine: number;
    snippet: string;
    language: string;
  };
}

interface SearchTiming {
  total: number;
  embedding: number;
  vectorSearch: number;
  reranking?: number;
}

// ============ Result Item Component ============

interface ResultItemProps {
  result: SearchResult;
  isExpanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onCopy: () => void;
  onCite: () => void;
}

const ResultItem: React.FC<ResultItemProps> = memo(({
  result,
  isExpanded,
  onToggle,
  onOpen,
  onCopy,
  onCite,
}) => {
  const fileName = result.file.split('/').pop() || result.file;
  const relativePath = result.file;
  const scorePercent = Math.round(result.score * 100);

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileCode size={14} className="text-[var(--vscode-textLink-foreground)]" />
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {result.name || fileName}
            </span>
            <span className={clsx(
              'text-xs px-1 py-0.5 rounded',
              {
                'bg-purple-500/20 text-purple-300': result.type === 'function' || result.type === 'method',
                'bg-[var(--ina-status-info-bg,rgba(59,130,246,0.2))] text-[var(--ina-status-info,#93c5fd)]': result.type === 'class',
                'bg-cyan-500/20 text-cyan-300': result.type === 'interface',
                'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.2))] text-[var(--ina-status-warning,#fde047)]': result.type === 'type',
                'bg-gray-500/20 text-gray-300': !['function', 'method', 'class', 'interface', 'type'].includes(result.type),
              }
            )}>
              {result.type}
            </span>
          </div>
          <div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
            {relativePath}:{result.startLine}-{result.endLine}
          </div>
        </div>
        <span className={clsx(
          'text-xs px-1.5 py-0.5 rounded',
          {
            'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))] text-[var(--ina-status-success,#4ade80)]': scorePercent >= 80,
            'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.2))] text-[var(--ina-status-warning,#facc15)]': scorePercent >= 60 && scorePercent < 80,
            'bg-gray-500/20 text-gray-400': scorePercent < 60,
          }
        )}>
          {scorePercent}%
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-[var(--vscode-panel-border)]">
          {result.documentation && (
            <div className="px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)] bg-[var(--vscode-textBlockQuote-background)] border-b border-[var(--vscode-panel-border)]">
              {result.documentation.split('\n')[0]}
            </div>
          )}

          <pre className="p-3 text-xs overflow-x-auto bg-[var(--vscode-editor-background)] max-h-48">
            <code>{result.content}</code>
          </pre>

          <div className="flex items-center gap-1 p-2 bg-[var(--vscode-sideBar-background)]">
            <button
              onClick={onOpen}
              className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded transition-colors"
            >
              <ExternalLink size={12} />
              Open
            </button>
            <button
              onClick={onCopy}
              className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded transition-colors"
            >
              <Copy size={12} />
              Copy
            </button>
            <button
              onClick={onCite}
              className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded transition-colors"
            >
              <Bookmark size={12} />
              Cite
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

ResultItem.displayName = 'ResultItem';

// ============ Main Search Panel ============

export const SearchPanel: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [timing, setTiming] = useState<SearchTiming | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    languages: [] as string[],
    types: [] as string[],
  });
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case 'searchResults':
          setResults((message as any).results);
          setTiming((message as any).timing);
          setIsSearching(false);
          break;
        case 'searchError':
          setIsSearching(false);
          break;
        case 'searchHistory':
          setSearchHistory((message as any).history);
          break;
        case 'setSearchQuery':
          setQuery((message as any).query);
          break;
      }
    });

    return unsubscribe;
  }, []);

  const handleSearch = useCallback(() => {
    if (!query.trim() || isSearching) return;

    setIsSearching(true);
    setResults([]);

    postMessage({
      type: 'search',
      query: query.trim(),
      filters: {
        languages: filters.languages.length > 0 ? filters.languages : undefined,
        chunkTypes: filters.types.length > 0 ? filters.types : undefined,
      },
    });
  }, [query, filters, isSearching]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const openResult = useCallback((result: SearchResult) => {
    postMessage({ type: 'openSearchResult', result });
  }, []);

  const copyResult = useCallback((result: SearchResult) => {
    postMessage({ type: 'copyToClipboard', text: result.content });
  }, []);

  const citeResult = useCallback((result: SearchResult) => {
    postMessage({ type: 'insertCitation', citation: result.citation });
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setTiming(null);
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Search Input */}
      <div className="p-3 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--vscode-descriptionForeground)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search codebase..."
              className="w-full pl-7 pr-8 py-1.5 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)]"
            />
            {query && (
              <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              'p-1.5 rounded transition-colors',
              showFilters
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'hover:bg-[var(--vscode-button-secondaryHoverBackground)]'
            )}
          >
            <Filter size={14} />
          </button>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || isSearching}
            className="px-3 py-1.5 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSearching ? (
              <span className="flex items-center gap-1">
                <Zap size={12} className="animate-pulse" />
                ...
              </span>
            ) : 'Search'}
          </button>
        </div>

        {showFilters && (
          <div className="mt-2 p-2 bg-[var(--vscode-editor-background)] rounded border border-[var(--vscode-panel-border)]">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[var(--vscode-descriptionForeground)]">Languages</label>
                <select
                  multiple
                  value={filters.languages}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, opt => opt.value);
                    setFilters(f => ({ ...f, languages: values }));
                  }}
                  className="w-full mt-1 p-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                >
                  <option value="typescript">TypeScript</option>
                  <option value="javascript">JavaScript</option>
                  <option value="python">Python</option>
                  <option value="rust">Rust</option>
                  <option value="go">Go</option>
                </select>
              </div>
              <div>
                <label className="text-[var(--vscode-descriptionForeground)]">Types</label>
                <select
                  multiple
                  value={filters.types}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, opt => opt.value);
                    setFilters(f => ({ ...f, types: values }));
                  }}
                  className="w-full mt-1 p-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
                >
                  <option value="function">Function</option>
                  <option value="class">Class</option>
                  <option value="interface">Interface</option>
                  <option value="type">Type</option>
                  <option value="method">Method</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {timing && results.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)] border-b border-[var(--vscode-panel-border)]">
            <span>{results.length} results</span>
            <span className="flex items-center gap-1"><Clock size={10} />{timing.total}ms</span>
          </div>
        )}

        <div className="p-2 space-y-2">
          {results.map((result) => (
            <ResultItem
              key={result.id}
              result={result}
              isExpanded={expandedIds.has(result.id)}
              onToggle={() => toggleExpanded(result.id)}
              onOpen={() => openResult(result)}
              onCopy={() => copyResult(result)}
              onCite={() => citeResult(result)}
            />
          ))}

          {!isSearching && results.length === 0 && query && (
            <div className="text-center py-8 text-[var(--vscode-descriptionForeground)]">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p>No results found</p>
              <p className="text-xs mt-1">Try different keywords or filters</p>
            </div>
          )}

          {!isSearching && results.length === 0 && !query && (
            <div className="text-center py-8 text-[var(--vscode-descriptionForeground)]">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p>Search your codebase</p>
              <p className="text-xs mt-1">Use natural language or code patterns</p>
              {searchHistory.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs mb-2">Recent searches:</p>
                  <div className="flex flex-wrap gap-1 justify-center">
                    {searchHistory.slice(-5).map((h, i) => (
                      <button
                        key={i}
                        onClick={() => setQuery(h)}
                        className="text-xs px-2 py-1 bg-[var(--vscode-button-secondaryBackground)] rounded hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchPanel;
