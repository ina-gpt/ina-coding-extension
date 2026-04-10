/**
 * Phase 17.3 — @link URL Fetch Types
 */
export interface FetchedPage {
  url: string;
  title: string;
  content: string;
  snippet: string;
  language: string | null;
  tokenCount: number;
  fetchedAt: number;
  cached: boolean;
}

export interface LinkFetchOptions {
  maxTokens?: number;
  includeCodeBlocks?: boolean;
  includeImages?: boolean;
  timeoutMs?: number;
}

export interface LinkMentionInfo {
  url: string;
  alias: string | null;
  detected: boolean;
}
