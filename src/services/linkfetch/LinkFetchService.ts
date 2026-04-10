/**
 * Phase 17.3 — Link Fetch Service
 * Fetches and cleans web pages for chat context.
 */
import { FetchedPage, LinkFetchOptions } from './LinkFetchTypes';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';

const BLOCKED_PATTERNS = [/^(10|172\.(1[6-9]|2\d|3[01])|192\.168|127|0)\./,/^localhost/i,/^file:|^ftp:|^data:/];
const STRIP_TAGS = /<(script|style|nav|footer|sidebar|header|noscript|iframe|form|aside|menu)\b[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_ATTRS = /\s(class|id|style|onclick|onerror|onload)="[^"]*"/gi;

export class LinkFetchService {
  private static instance: LinkFetchService;
  private cache = new Map<string, { page: FetchedPage; cachedAt: number }>();
  private constructor() {}
  static getInstance(): LinkFetchService {
    if (!LinkFetchService.instance) LinkFetchService.instance = new LinkFetchService();
    return LinkFetchService.instance;
  }

  async fetch(url: string, options?: LinkFetchOptions): Promise<FetchedPage> {
    const maxTokens = options?.maxTokens || 5000;
    const cached = this.cache.get(url);
    const cacheHours = ConfigManager.get<number>('linkFetch.cacheHours', 24);
    if (cached && Date.now() - cached.cachedAt < cacheHours * 3600000) {
      return { ...cached.page, cached: true };
    }
    if (this.isBlockedUrl(url)) throw new Error(`URL blocked: ${url}`);
    try {
      const endpoint = ConfigManager.getApiEndpoint();
      const res = await fetch(`${endpoint}/api/linkfetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxTokens }),
        signal: AbortSignal.timeout(options?.timeoutMs || 10000),
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      const content = this.cleanHtml(data.html || '');
      const truncated = this.truncateToTokens(content, maxTokens);
      const page: FetchedPage = {
        url, title: data.title || url, content: truncated,
        snippet: truncated.substring(0, 200), language: null,
        tokenCount: Math.ceil(truncated.length / 4), fetchedAt: Date.now(), cached: false,
      };
      this.cache.set(url, { page, cachedAt: Date.now() });
      return page;
    } catch (e: any) {
      Logger.error(`[LinkFetch] Failed to fetch ${url}:`, e);
      throw e;
    }
  }

  async fetchMultiple(urls: string[]): Promise<FetchedPage[]> {
    const results: FetchedPage[] = [];
    const batches = [];
    for (let i = 0; i < urls.length; i += 3) batches.push(urls.slice(i, i + 3));
    for (const batch of batches) {
      const pages = await Promise.allSettled(batch.map(u => this.fetch(u)));
      for (const p of pages) if (p.status === 'fulfilled') results.push(p.value);
    }
    return results;
  }

  detectUrls(message: string): string[] {
    const regex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const urls = (message.match(regex) || []).map(u => u.replace(/[.,;:!?)]+$/, ''));
    return [...new Set(urls)];
  }

  formatForContext(pages: FetchedPage[]): string {
    if (pages.length === 0) return '';
    return '<fetched_pages>\n' + pages.map(p =>
      `<page url="${p.url}" title="${p.title}" tokens="${p.tokenCount}">\n${p.content}\n</page>`
    ).join('\n') + '\n</fetched_pages>';
  }

  private cleanHtml(html: string): string {
    let text = html;
    text = text.replace(STRIP_TAGS, '');
    text = text.replace(/<[^>]+>/g, (tag) => {
      if (/^<(p|div|br|h[1-6]|li|tr|blockquote)[>\s/]/i.test(tag)) return '\n';
      if (/^<\/(p|div|h[1-6]|li|tr|ul|ol|blockquote)>/i.test(tag)) return '\n';
      if (/^<(code|pre)[>\s]/i.test(tag)) return '\n```\n';
      if (/^<\/(code|pre)>/i.test(tag)) return '\n```\n';
      if (/^<a[^>]+href="([^"]+)"/i.test(tag)) return '';
      return '';
    });
    text = text.replace(STRIP_ATTRS, '');
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    return text.length > maxChars ? text.substring(0, maxChars) + '\n...[truncated]' : text;
  }

  private isBlockedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
      return BLOCKED_PATTERNS.some(p => p.test(host));
    } catch { return true; }
  }
}
