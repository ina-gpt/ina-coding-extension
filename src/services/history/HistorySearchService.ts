/**
 * HistorySearchService.ts
 * Phase 16.5 — Full-text search across chat history
 *
 * Builds an in-memory index from the existing HistoryManager conversations
 * and provides fuzzy + filtered search.
 */

import {
  HistorySearchOptions,
  HistorySearchResult,
  HistorySearchStats,
  ConversationSummary,
  IndexEntry,
  DEFAULT_SEARCH_OPTIONS,
} from './HistorySearchTypes';
import { HistoryManager, Conversation, ChatMessage } from '../HistoryManager';
import { Logger } from '../../utils/Logger';

export class HistorySearchService {
  private static instance: HistorySearchService;

  /** messageId → IndexEntry */
  private index = new Map<string, IndexEntry>();
  /** conversationId → summary */
  private conversations = new Map<string, ConversationSummary>();
  private historyManager: HistoryManager | null = null;

  private constructor() {}

  static getInstance(): HistorySearchService {
    if (!HistorySearchService.instance) {
      HistorySearchService.instance = new HistorySearchService();
    }
    return HistorySearchService.instance;
  }

  setHistoryManager(hm: HistoryManager): void {
    this.historyManager = hm;
    // Auto-rebuild on changes
    hm.onChange((event) => {
      if (
        event.type === 'created' ||
        event.type === 'messageAdded' ||
        event.type === 'messageUpdated' ||
        event.type === 'messageDeleted' ||
        event.type === 'deleted'
      ) {
        // Throttle: rebuild lazily next search
        this.markStale();
      }
    });
  }

  private staleAt = 0;
  private markStale(): void {
    this.staleAt = Date.now();
  }

  // ============================================================
  // Index building
  // ============================================================

  buildIndex(conversations?: Conversation[]): void {
    this.index.clear();
    this.conversations.clear();

    const list =
      conversations ??
      this.historyManager?.getRecentConversations(500, true) ??
      [];

    for (const conv of list) {
      this.indexConversation(conv);
    }
    this.staleAt = 0;
    Logger.info(
      `[HistorySearch] Indexed ${list.length} conversations / ${this.index.size} messages`
    );
  }

  private indexConversation(conv: Conversation): void {
    const messages = conv.messages ?? [];
    if (messages.length === 0) return;

    const firstUserMsg = messages.find((m) => m.role === 'user');
    const summary: ConversationSummary = {
      id: conv.id,
      title: conv.title,
      messageCount: messages.length,
      firstMessageAt: messages[0].timestamp,
      lastMessageAt: messages[messages.length - 1].timestamp,
      preview: this.truncate(firstUserMsg?.content ?? '', 120),
    };
    this.conversations.set(conv.id, summary);

    for (const msg of messages) {
      if (msg.role === 'system') continue;
      const tokens = new Set(this.tokenize(msg.content));
      const trigrams = this.buildTrigrams(msg.content.toLowerCase());
      const hasCodeBlock = /```[\s\S]*?```/.test(msg.content);
      this.index.set(msg.id, {
        messageId: msg.id,
        conversationId: conv.id,
        role: msg.role,
        timestamp: msg.timestamp,
        content: msg.content,
        tokens,
        trigrams,
        hasCodeBlock,
      });
    }
  }

  // ============================================================
  // Search
  // ============================================================

  search(options: Partial<HistorySearchOptions>): HistorySearchResult[] {
    // Re-index if stale
    if (this.staleAt > 0 || this.index.size === 0) {
      this.buildIndex();
    }

    const opts: HistorySearchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const queryTokens = this.tokenize(opts.query);
    if (queryTokens.length === 0) return [];
    const queryTrigrams = this.buildTrigrams(opts.query.toLowerCase());

    const results: Array<HistorySearchResult & { _raw: number }> = [];

    for (const entry of this.index.values()) {
      // Filters
      if (opts.role !== 'all' && entry.role !== opts.role) continue;
      if (opts.dateFrom !== null && entry.timestamp < opts.dateFrom) continue;
      if (opts.dateTo !== null && entry.timestamp > opts.dateTo) continue;
      if (opts.hasCodeBlock !== null && entry.hasCodeBlock !== opts.hasCodeBlock) continue;

      // Score
      let exactHits = 0;
      for (const t of queryTokens) {
        if (entry.tokens.has(t)) exactHits++;
      }
      const exactRatio = queryTokens.length > 0 ? exactHits / queryTokens.length : 0;

      // Fuzzy match (trigram intersection ratio)
      let fuzzyScore = 0;
      if (exactRatio < 1) {
        const intersection = this.intersectionSize(queryTrigrams, entry.trigrams);
        if (queryTrigrams.size > 0) {
          fuzzyScore = intersection / queryTrigrams.size;
        }
      }

      const baseScore = exactRatio * 1.0 + fuzzyScore * 0.4;
      if (baseScore < 0.15) continue;

      // Recency boost — last 30 days = +0.1, last 7 days = +0.2
      const ageMs = Date.now() - entry.timestamp;
      const recencyBoost = ageMs < 7 * 86400000 ? 0.2 : ageMs < 30 * 86400000 ? 0.1 : 0;

      const score = baseScore + recencyBoost;

      const conv = this.conversations.get(entry.conversationId);
      results.push({
        conversationId: entry.conversationId,
        conversationTitle: conv?.title ?? 'Untitled',
        messageId: entry.messageId,
        messageRole: entry.role,
        content: entry.content,
        matchSnippet: this.highlightMatch(entry.content, opts.query),
        matchScore: score,
        timestamp: entry.timestamp,
        _raw: score,
      });
    }

    results.sort((a, b) => b._raw - a._raw);
    return results.slice(0, opts.maxResults).map(({ _raw, ...r }) => r);
  }

  // ============================================================
  // Conversation operations
  // ============================================================

  getConversations(limit?: number, offset?: number): ConversationSummary[] {
    if (this.staleAt > 0 || this.conversations.size === 0) {
      this.buildIndex();
    }
    const all = [...this.conversations.values()].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt
    );
    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;
    return all.slice(start, end);
  }

  getConversation(id: string): { messages: ChatMessage[]; title: string } | null {
    if (!this.historyManager) return null;
    const conv = this.historyManager.getConversation(id);
    if (!conv) return null;
    return { messages: conv.messages, title: conv.title };
  }

  resumeConversation(id: string): void {
    if (!this.historyManager) return;
    this.historyManager.setCurrentConversation(id);
  }

  deleteConversation(id: string): void {
    if (!this.historyManager) return;
    this.historyManager.deleteConversation(id);
    this.conversations.delete(id);
    // Drop index entries
    for (const [mid, entry] of [...this.index.entries()]) {
      if (entry.conversationId === id) this.index.delete(mid);
    }
  }

  exportConversation(id: string, format: 'json' | 'md'): string {
    const conv = this.historyManager?.getConversation(id);
    if (!conv) return '';
    if (format === 'json') return JSON.stringify(conv, null, 2);

    // Markdown
    const lines: string[] = [
      `# ${conv.title}`,
      '',
      `_Created: ${new Date(conv.createdAt).toISOString()}_`,
      `_Updated: ${new Date(conv.updatedAt).toISOString()}_`,
      '',
    ];
    for (const m of conv.messages) {
      const who = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'INA' : 'System';
      lines.push(`## ${who} — ${new Date(m.timestamp).toLocaleString()}`);
      lines.push('');
      lines.push(m.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  // ============================================================
  // Stats
  // ============================================================

  getStats(): HistorySearchStats {
    if (this.staleAt > 0 || this.index.size === 0) {
      this.buildIndex();
    }
    let oldest: number | null = null;
    let newest: number | null = null;
    for (const e of this.index.values()) {
      if (oldest === null || e.timestamp < oldest) oldest = e.timestamp;
      if (newest === null || e.timestamp > newest) newest = e.timestamp;
    }
    return {
      totalConversations: this.conversations.size,
      totalMessages: this.index.size,
      oldestMessage: oldest,
      newestMessage: newest,
      indexSize: this.index.size,
    };
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  private buildTrigrams(text: string): Set<string> {
    const grams = new Set<string>();
    const padded = `  ${text}  `;
    for (let i = 0; i < padded.length - 2; i++) {
      grams.add(padded.substring(i, i + 3));
    }
    return grams;
  }

  private intersectionSize(a: Set<string>, b: Set<string>): number {
    let count = 0;
    for (const x of a) if (b.has(x)) count++;
    return count;
  }

  private trigramSimilarity(a: string, b: string): number {
    const ga = this.buildTrigrams(a.toLowerCase());
    const gb = this.buildTrigrams(b.toLowerCase());
    const inter = this.intersectionSize(ga, gb);
    const union = ga.size + gb.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  private highlightMatch(content: string, query: string): string {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return this.truncate(content, 200);

    // Find first occurrence of any query token
    const lower = content.toLowerCase();
    let firstMatchIdx = -1;
    for (const t of queryTokens) {
      const idx = lower.indexOf(t);
      if (idx >= 0 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
        firstMatchIdx = idx;
      }
    }
    if (firstMatchIdx === -1) return this.truncate(content, 200);

    // Window 80 chars before/after
    const start = Math.max(0, firstMatchIdx - 80);
    const end = Math.min(content.length, firstMatchIdx + 120);
    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    // Bold-mark each query token (case-insensitive)
    for (const t of queryTokens) {
      const re = new RegExp(`(${this.escapeRegex(t)})`, 'gi');
      snippet = snippet.replace(re, '**$1**');
    }
    return snippet;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private truncate(s: string, n: number): string {
    if (s.length <= n) return s;
    return s.substring(0, n) + '...';
  }

  dispose(): void {
    this.index.clear();
    this.conversations.clear();
  }
}
