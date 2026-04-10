/**
 * WebMentionHandler.ts
 * Phase 16.3 — Handles @web mentions in chat
 *
 * Bridges the @web mention type from MentionParser to WebSearchService.
 */

import { WebSearchService } from './WebSearchService';
import { WebSearchContext } from './WebSearchTypes';
import { Logger } from '../../utils/Logger';

interface CacheEntry {
  context: WebSearchContext;
  expiresAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class WebMentionHandler {
  private static instance: WebMentionHandler;

  private cache = new Map<string, CacheEntry>();
  private webSearch: WebSearchService;

  private constructor() {
    this.webSearch = WebSearchService.getInstance();
  }

  static getInstance(): WebMentionHandler {
    if (!WebMentionHandler.instance) {
      WebMentionHandler.instance = new WebMentionHandler();
    }
    return WebMentionHandler.instance;
  }

  /**
   * Handle a @web mention. Uses smart query extraction if `query` is empty.
   */
  async handleMention(query: string, userMessage: string): Promise<WebSearchContext> {
    const effectiveQuery = query.trim() || this.webSearch.smartSearchQuery(userMessage);
    const cacheKey = effectiveQuery.toLowerCase();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }

    try {
      const context = await this.webSearch.searchForContext(effectiveQuery, 4000);
      this.cache.set(cacheKey, {
        context,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return context;
    } catch (e) {
      Logger.error('[WebMention] search failed:', e);
      return {
        formatted: `<web_search_results query="${effectiveQuery}">\nSearch failed: ${String(e)}\n</web_search_results>`,
        tokenCount: 50,
        results: [],
      };
    }
  }

  /**
   * Suggestions for the @web mention autocomplete.
   */
  getCompletions(partial: string): Array<{ label: string; detail: string }> {
    const all = [
      { label: '@web', detail: 'Search the web' },
      { label: '@web:stackoverflow', detail: 'Search StackOverflow' },
      { label: '@web:github', detail: 'Search GitHub' },
      { label: '@web:docs', detail: 'Search documentation' },
      { label: '@web:mdn', detail: 'Search MDN Web Docs' },
      { label: '@web:npm', detail: 'Search npm packages' },
    ];
    if (!partial) return all;
    const q = partial.toLowerCase();
    return all.filter((s) => s.label.toLowerCase().includes(q));
  }

  clearCache(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.cache.clear();
  }
}
