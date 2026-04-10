/**
 * WebSearchService.ts
 * Phase 16.3 — @web search service
 *
 * Search flow with fallback chain:
 *   1. SearXNG (if user has self-hosted instance configured)
 *   2. INA backend proxy at POST /api/websearch
 *   3. DuckDuckGo Instant Answer API (no auth required)
 *
 * Results cached for 1 hour (configurable).
 */

import * as vscode from 'vscode';
import {
  WebSearchOptions,
  WebSearchResponse,
  WebSearchResult,
  WebSearchContext,
  DEFAULT_WEB_SEARCH_OPTIONS,
  SearxngResponse,
  DuckDuckGoResponse,
} from './WebSearchTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

interface CacheEntry {
  response: WebSearchResponse;
  expiresAt: number;
}

export class WebSearchService {
  private static instance: WebSearchService;

  private cache = new Map<string, CacheEntry>();

  private constructor() {}

  static getInstance(): WebSearchService {
    if (!WebSearchService.instance) {
      WebSearchService.instance = new WebSearchService();
    }
    return WebSearchService.instance;
  }

  // ============================================================
  // Public — search
  // ============================================================

  async search(query: string, options?: Partial<WebSearchOptions>): Promise<WebSearchResponse> {
    const opts: WebSearchOptions = { ...DEFAULT_WEB_SEARCH_OPTIONS, ...options };
    const cacheKey = this.getCacheKey(query, opts);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.response;
    }

    const startTime = Date.now();
    const trimmed = query.trim();
    if (!trimmed) {
      return { results: [], query, totalResults: 0, searchTimeMs: 0, engine: 'noop' };
    }

    let response: WebSearchResponse | null = null;

    // 1. SearXNG (highest precedence — user-controlled, privacy-friendly)
    const searxngUrl = ConfigManager.get<string>('web.searxngUrl', '') || '';
    if (searxngUrl) {
      response = await this.searchSearxng(trimmed, opts, searxngUrl).catch((e) => {
        Logger.warn(`[WebSearch] SearXNG failed: ${String(e)}`);
        return null;
      });
    }

    // 2. INA backend proxy
    if (!response) {
      response = await this.searchBackend(trimmed, opts).catch((e) => {
        Logger.warn(`[WebSearch] Backend failed: ${String(e)}`);
        return null;
      });
    }

    // 3. DuckDuckGo Instant Answers
    if (!response) {
      response = await this.searchDuckDuckGo(trimmed, opts).catch((e) => {
        Logger.warn(`[WebSearch] DuckDuckGo failed: ${String(e)}`);
        return null;
      });
    }

    if (!response) {
      response = {
        results: [],
        query: trimmed,
        totalResults: 0,
        searchTimeMs: Date.now() - startTime,
        engine: 'none',
      };
    }

    // Persist to cache
    const ttlMin = ConfigManager.get<number>('web.cacheMinutes', 60);
    this.cache.set(cacheKey, {
      response,
      expiresAt: Date.now() + ttlMin * 60_000,
    });

    return response;
  }

  /**
   * Search and format results for prompt injection (token-budgeted).
   */
  async searchForContext(query: string, maxTokens: number): Promise<WebSearchContext> {
    const response = await this.search(query);
    const formatted = this.formatForPrompt(response);
    const truncated = this.truncateToTokens(formatted, maxTokens);
    return {
      formatted: truncated,
      tokenCount: this.estimateTokens(truncated),
      results: response.results,
    };
  }

  /**
   * Heuristic — extract a useful search query from a free-form user message.
   */
  smartSearchQuery(userMessage: string): string {
    const msg = userMessage.trim();

    // Stack trace / error message — preserve verbatim
    const errorMatch = msg.match(/(?:error|exception|fatal|undefined|cannot read).{0,200}/i);
    if (errorMatch) return errorMatch[0];

    // "How to ..." → keep as is
    if (/^(how|what|why|when|where) /i.test(msg)) return msg;

    // Library question — append "documentation"
    const libMatch = msg.match(/\b(react|vue|angular|svelte|nextjs|django|fastapi|express|rails)\b/i);
    if (libMatch && !/documentation|docs/i.test(msg)) {
      return `${msg} ${libMatch[1]} documentation`;
    }

    return msg;
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ============================================================
  // Backend providers
  // ============================================================

  private async searchSearxng(
    query: string,
    opts: WebSearchOptions,
    searxngUrl: string
  ): Promise<WebSearchResponse> {
    const startTime = Date.now();
    const url = new URL('/search', searxngUrl.replace(/\/+$/, ''));
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    if (opts.engines.length > 0) {
      url.searchParams.set('engines', opts.engines.join(','));
    }
    if (opts.language) url.searchParams.set('language', opts.language);
    if (opts.safeSearch) url.searchParams.set('safesearch', '1');
    if (opts.timeRange) url.searchParams.set('time_range', opts.timeRange);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
      const data = (await res.json()) as SearxngResponse;
      const results: WebSearchResult[] = (data.results ?? []).slice(0, opts.maxResults).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content ?? '',
        domain: this.extractDomain(r.url),
      }));
      return {
        results,
        query,
        totalResults: data.number_of_results ?? results.length,
        searchTimeMs: Date.now() - startTime,
        engine: 'searxng',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchBackend(
    query: string,
    opts: WebSearchOptions
  ): Promise<WebSearchResponse> {
    const startTime = Date.now();
    const apiUrl = ConfigManager.get<string>('apiUrl', '') || ConfigManager.get<string>('general.apiUrl', '');
    if (!apiUrl) throw new Error('Backend apiUrl not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/websearch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          maxResults: opts.maxResults,
          engines: opts.engines,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
      const data = await res.json();
      const results: WebSearchResult[] = (data.results ?? []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet ?? '',
        domain: r.domain ?? this.extractDomain(r.url),
      }));
      return {
        results,
        query,
        totalResults: results.length,
        searchTimeMs: Date.now() - startTime,
        engine: 'backend',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async searchDuckDuckGo(
    query: string,
    opts: WebSearchOptions
  ): Promise<WebSearchResponse> {
    const startTime = Date.now();
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_redirect', '1');
    url.searchParams.set('no_html', '1');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'INA-Coding/1.0', Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`DDG HTTP ${res.status}`);
      const data = (await res.json()) as DuckDuckGoResponse;
      const results: WebSearchResult[] = [];

      if (data.AbstractURL && data.AbstractText) {
        results.push({
          title: data.Heading ?? data.AbstractURL,
          url: data.AbstractURL,
          snippet: data.AbstractText,
          domain: this.extractDomain(data.AbstractURL),
        });
      }
      for (const r of data.RelatedTopics ?? []) {
        if (results.length >= opts.maxResults) break;
        if (r.FirstURL && r.Text) {
          results.push({
            title: r.Text.split(' - ')[0] ?? r.Text,
            url: r.FirstURL,
            snippet: r.Text,
            domain: this.extractDomain(r.FirstURL),
          });
        }
      }
      for (const r of data.Results ?? []) {
        if (results.length >= opts.maxResults) break;
        if (r.FirstURL && r.Text) {
          results.push({
            title: r.Text,
            url: r.FirstURL,
            snippet: r.Text,
            domain: this.extractDomain(r.FirstURL),
          });
        }
      }

      return {
        results,
        query,
        totalResults: results.length,
        searchTimeMs: Date.now() - startTime,
        engine: 'duckduckgo',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async fetchPageContent(url: string): Promise<string | null> {
    try {
      const apiUrl =
        ConfigManager.get<string>('apiUrl', '') || ConfigManager.get<string>('general.apiUrl', '');
      if (!apiUrl) return null;
      const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/linkfetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxTokens: 3000 }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.html as string) ?? null;
    } catch {
      return null;
    }
  }

  private formatForPrompt(response: WebSearchResponse): string {
    if (response.results.length === 0) {
      return `<web_search_results query="${response.query}">\nNo results found.\n</web_search_results>`;
    }
    const lines: string[] = [`<web_search_results query="${response.query}">`];
    response.results.forEach((r, i) => {
      lines.push(`  <result rank="${i + 1}" url="${r.url}" domain="${r.domain}">`);
      lines.push(`    <title>${this.escapeXml(r.title)}</title>`);
      lines.push(`    <snippet>${this.escapeXml(r.snippet)}</snippet>`);
      lines.push(`  </result>`);
    });
    lines.push(`</web_search_results>`);
    return lines.join('\n');
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private getCacheKey(query: string, opts: WebSearchOptions): string {
    return `${query}::${opts.maxResults}::${opts.engines.join(',')}::${opts.timeRange ?? ''}`;
  }

  private estimateTokens(s: string): number {
    return Math.ceil(s.length / 4);
  }

  private truncateToTokens(s: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (s.length <= maxChars) return s;
    return s.substring(0, maxChars) + '\n... (truncated)';
  }

  dispose(): void {
    this.cache.clear();
  }
}
