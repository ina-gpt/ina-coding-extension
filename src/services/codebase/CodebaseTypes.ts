/**
 * Phase 15.4 — Codebase Search Types
 */

export interface CodebaseSearchResult {
  chunks: CodebaseChunk[];
  totalMatches: number;
  searchTimeMs: number;
  query: string;
  filters: CodebaseFilter | null;
}

export interface CodebaseChunk {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  relevanceScore: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
  symbols: string[];
}

export interface CodebaseFilter {
  directory: string | null;
  pattern: string | null;
  language: string | null;
  recentOnly: boolean;
}

export interface CodebaseContext {
  formatted: string;
  tokenCount: number;
  chunks: CodebaseChunk[];
  truncated: boolean;
}

export const CODEBASE_CONSTANTS = {
  DEFAULT_TOP_K: 10,
  MAX_TOP_K: 25,
  MAX_TOKENS: 8000,
  SEMANTIC_WEIGHT: 0.7,
  KEYWORD_WEIGHT: 0.3,
  CACHE_TTL_MS: 30000,
};
