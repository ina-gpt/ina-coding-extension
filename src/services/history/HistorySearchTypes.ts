/**
 * HistorySearchTypes.ts
 * Phase 16.5 — Full-text search across past chat conversations
 */

export interface HistorySearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  messageRole: 'user' | 'assistant';
  /** Full message content */
  content: string;
  /** Highlighted snippet around the match (with **bold** markers) */
  matchSnippet: string;
  matchScore: number;
  timestamp: number;
}

export interface HistorySearchOptions {
  query: string;
  dateFrom: number | null;
  dateTo: number | null;
  role: 'user' | 'assistant' | 'all';
  hasCodeBlock: boolean | null;
  maxResults: number;
}

export const DEFAULT_SEARCH_OPTIONS: HistorySearchOptions = {
  query: '',
  dateFrom: null,
  dateTo: null,
  role: 'all',
  hasCodeBlock: null,
  maxResults: 20,
};

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  firstMessageAt: number;
  lastMessageAt: number;
  /** First user message content, truncated to ~120 chars */
  preview: string;
}

export interface HistorySearchStats {
  totalConversations: number;
  totalMessages: number;
  oldestMessage: number | null;
  newestMessage: number | null;
  indexSize: number;
}

/** Internal index entry — one per indexed message */
export interface IndexEntry {
  messageId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  timestamp: number;
  /** Original (non-lowercased) content for snippet generation */
  content: string;
  /** Tokens for fast match check */
  tokens: Set<string>;
  /** Trigrams for fuzzy match */
  trigrams: Set<string>;
  /** True if message contains a fenced code block */
  hasCodeBlock: boolean;
}
