/**
 * WebSearchTypes.ts
 * Phase 16.3 — @web search type definitions
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
  totalResults: number;
  searchTimeMs: number;
  /** Which engine produced the response (searxng | duckduckgo | backend) */
  engine: string;
}

export interface WebSearchOptions {
  maxResults: number;
  engines: string[];
  language: string | null;
  safeSearch: boolean;
  timeRange: 'day' | 'week' | 'month' | 'year' | null;
}

export const DEFAULT_WEB_SEARCH_OPTIONS: WebSearchOptions = {
  maxResults: 5,
  engines: ['google', 'duckduckgo'],
  language: null,
  safeSearch: true,
  timeRange: null,
};

export interface WebSearchContext {
  /** Pre-formatted prompt-injection text */
  formatted: string;
  tokenCount: number;
  results: WebSearchResult[];
}

/** A SearXNG /search?format=json response shape (subset we use) */
export interface SearxngResponse {
  query: string;
  number_of_results?: number;
  results?: Array<{
    title: string;
    url: string;
    content: string;
    engine?: string;
  }>;
}

/** DuckDuckGo Instant Answer API response shape (subset we use) */
export interface DuckDuckGoResponse {
  Heading?: string;
  AbstractURL?: string;
  AbstractText?: string;
  RelatedTopics?: Array<{
    Result?: string;
    FirstURL?: string;
    Text?: string;
  }>;
  Results?: Array<{
    FirstURL?: string;
    Text?: string;
    Result?: string;
  }>;
}
