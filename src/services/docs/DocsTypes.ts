export interface DocSource {
  id: string;
  project_id: string | null;
  name: string;
  type: 'url' | 'local' | 'npm' | 'builtin' | 'custom';
  url: string | null;
  local_path: string | null;
  package_name: string | null;
  version: string | null;
  status: 'pending' | 'crawling' | 'indexing' | 'ready' | 'failed' | 'stale' | 'disabled';
  last_crawled_at: string | null;
  last_indexed_at: string | null;
  doc_count: number;
  chunk_count: number;
  error_message: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DocSearchResult {
  chunk: {
    id: string;
    content: string;
    section_title: string | null;
    section_hierarchy: string[];
    code_snippets: string[];
    keywords: string[];
    token_count: number | null;
  };
  page: {
    id: string;
    url: string | null;
    title: string | null;
  };
  source: {
    id: string;
    name: string;
    type: string;
    url: string | null;
  };
  score: number;
  highlights: string[];
}

export interface DocSuggestion {
  source: string;
  title: string;
  url: string | null;
  relevance: number;
  reason: string;
  snippet: string;
}

export interface DocCrawlProgress {
  sourceId: string;
  status: string;
  pagesFound: number;
  pagesCrawled: number;
  chunksCreated: number;
  errors: string[];
  startedAt: number;
  estimatedRemaining: number | null;
}

export interface BuiltinDocSource {
  name: string;
  packageName: string;
  docsUrl: string;
  version: string;
  description: string;
  icon: string;
  category: string;
}

export interface DocsConfig {
  autoSuggest: boolean;
  maxSuggestions: number;
  suggestDebounceMs: number;
  indexedSources: string[];
  enabledBuiltins: string[];
}

export type DocsEvent =
  | 'source-added'
  | 'source-removed'
  | 'crawl-started'
  | 'crawl-progress'
  | 'crawl-complete'
  | 'index-complete'
  | 'suggestion-ready';
