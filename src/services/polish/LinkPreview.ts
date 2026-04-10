/**
 * Phase 17.7 — Link Preview
 *
 * Detects URLs in assistant responses and produces hover-preview cards with
 * title, description, and favicon. Re-uses the Phase 17.3 LinkFetchService so
 * we get consistent caching and the same SSRF guard rails.
 */
import { LinkFetchService } from '../linkfetch/LinkFetchService';

export interface LinkPreviewCard {
  url: string;
  title: string | null;
  description: string | null;
  faviconUrl: string;
  fetchedAt: number;
  cached: boolean;
}

const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`\)]+/gi;
const TITLE_RE = /<title[^>]*>([^<]*)<\/title>/i;
const META_DESC_RE = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i;
const META_OG_DESC_RE = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i;
const PREVIEW_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export class LinkPreview {
  private static instance: LinkPreview;
  private cache = new Map<string, { card: LinkPreviewCard; cachedAt: number }>();
  private linkFetch = LinkFetchService.getInstance();

  static getInstance(): LinkPreview {
    if (!LinkPreview.instance) LinkPreview.instance = new LinkPreview();
    return LinkPreview.instance;
  }

  /**
   * Extract all HTTP(S) URLs from a piece of text.
   */
  extractUrls(text: string): string[] {
    if (!text) return [];
    const matches = text.match(URL_REGEX) ?? [];
    const unique = Array.from(new Set(matches.map(u => u.replace(/[.,;:!?\]\)]+$/, ''))));
    return unique;
  }

  /**
   * Produce (or reuse) a preview card for a URL. Returns `null` when the URL
   * is blocked (SSRF guard) or fetching failed.
   */
  async getPreview(url: string): Promise<LinkPreviewCard | null> {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.cachedAt < PREVIEW_CACHE_TTL_MS) {
      return { ...cached.card, cached: true };
    }

    let page;
    try {
      page = await this.linkFetch.fetch(url, { maxTokens: 1000 });
    } catch {
      return null;
    }

    const rawHtml = (page as { rawHtml?: string; content?: string }).rawHtml ?? (page as any).content ?? '';
    const title = this.extractMatch(rawHtml, TITLE_RE) ?? this.deriveTitleFromUrl(url);
    const description = this.extractMatch(rawHtml, META_OG_DESC_RE) ?? this.extractMatch(rawHtml, META_DESC_RE);
    const card: LinkPreviewCard = {
      url,
      title,
      description,
      faviconUrl: this.faviconFor(url),
      fetchedAt: Date.now(),
      cached: false,
    };
    this.cache.set(url, { card, cachedAt: Date.now() });
    return card;
  }

  /**
   * Pre-warm the cache for every URL in a block of text. Failures are
   * swallowed silently so the caller can fire-and-forget.
   */
  async prewarmForText(text: string): Promise<void> {
    const urls = this.extractUrls(text);
    await Promise.all(urls.map(url => this.getPreview(url).catch(() => null)));
  }

  clear(): void {
    this.cache.clear();
  }

  // ========== helpers ==========

  private extractMatch(html: string, re: RegExp): string | null {
    const m = html.match(re);
    if (!m || m.length < 2) return null;
    return m[1].trim().slice(0, 240);
  }

  private deriveTitleFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return segments.length > 0 ? segments[segments.length - 1] : parsed.hostname;
    } catch {
      return url;
    }
  }

  private faviconFor(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}/favicon.ico`;
    } catch {
      return '';
    }
  }
}
