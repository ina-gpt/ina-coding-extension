/**
 * Phase 17.2 — Deep Mention Handler
 * Integrates deep context resolution with the @mention system.
 * Caches results for 60 seconds.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { DeepCacheEntry } from './DeepContextTypes';
import { DeepContextFormatter } from './DeepContextFormatter';
import { DeepResolver } from './DeepResolver';

// ---------------------------------------------------------------------------
// Cache TTL
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// DeepMentionHandler — singleton
// ---------------------------------------------------------------------------

export class DeepMentionHandler {
  private static instance: DeepMentionHandler | null = null;

  private readonly resolver: DeepResolver;
  private readonly formatter: DeepContextFormatter;
  private readonly cache = new Map<string, DeepCacheEntry<string>>();

  private constructor() {
    this.resolver = DeepResolver.getInstance();
    this.formatter = DeepContextFormatter.getInstance();
  }

  static getInstance(): DeepMentionHandler {
    if (!DeepMentionHandler.instance) {
      DeepMentionHandler.instance = new DeepMentionHandler();
    }
    return DeepMentionHandler.instance;
  }

  // -----------------------------------------------------------------------
  // handleDefMention — @def:Symbol
  // -----------------------------------------------------------------------

  async handleDefMention(
    symbol: string,
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<string> {
    const cacheKey = `def:${symbol}:${document.uri.toString()}:${position.line}:${position.character}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) { return cached; }

    try {
      Logger.info(`[DeepMentionHandler] Resolving @def:${symbol}`);

      const result = await this.resolver.resolveDefinition(symbol, document, position);
      const formatted = this.formatter.formatForChat(result);

      this.setCache(cacheKey, formatted);
      return formatted;
    } catch (err) {
      Logger.warn(`[DeepMentionHandler] handleDefMention failed for "${symbol}": ${err}`);
      return `<deep_context symbol="${symbol}" error="resolution_failed" />`;
    }
  }

  // -----------------------------------------------------------------------
  // handleTypeMention — @type:Symbol
  // -----------------------------------------------------------------------

  async handleTypeMention(
    symbol: string,
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<string> {
    const cacheKey = `type:${symbol}:${document.uri.toString()}:${position.line}:${position.character}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) { return cached; }

    try {
      Logger.info(`[DeepMentionHandler] Resolving @type:${symbol}`);

      const result = await this.resolver.resolveType(symbol, document, position);
      const formatted = this.formatter.formatForChat(result);

      this.setCache(cacheKey, formatted);
      return formatted;
    } catch (err) {
      Logger.warn(`[DeepMentionHandler] handleTypeMention failed for "${symbol}": ${err}`);
      return `<deep_context symbol="${symbol}" error="resolution_failed" />`;
    }
  }

  // -----------------------------------------------------------------------
  // handleRefsMention — @refs:Symbol
  // -----------------------------------------------------------------------

  async handleRefsMention(
    symbol: string,
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<string> {
    const cacheKey = `refs:${symbol}:${document.uri.toString()}:${position.line}:${position.character}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) { return cached; }

    try {
      Logger.info(`[DeepMentionHandler] Resolving @refs:${symbol}`);

      const result = await this.resolver.resolveReferences(symbol, document, position);
      const formatted = this.formatter.formatReferences(result.groups, result.totalCount, symbol);

      this.setCache(cacheKey, formatted);
      return formatted;
    } catch (err) {
      Logger.warn(`[DeepMentionHandler] handleRefsMention failed for "${symbol}": ${err}`);
      return `<references symbol="${symbol}" error="resolution_failed" />`;
    }
  }

  // -----------------------------------------------------------------------
  // getCompletions — provide completions for @def:, @type:, @refs: partial
  // -----------------------------------------------------------------------

  async getCompletions(
    partial: string,
    document: vscode.TextDocument,
  ): Promise<{ label: string; detail: string }[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri,
      );

      if (!symbols || symbols.length === 0) {
        return [];
      }

      const flattened = this.flattenSymbols(symbols);
      const lower = partial.toLowerCase();

      return flattened
        .filter((s) => s.name.toLowerCase().includes(lower))
        .slice(0, 20)
        .map((s) => ({
          label: s.name,
          detail: `${vscode.SymbolKind[s.kind]} — line ${s.range.start.line + 1}`,
        }));
    } catch (err) {
      Logger.warn(`[DeepMentionHandler] getCompletions failed: ${err}`);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // clearCache
  // -----------------------------------------------------------------------

  clearCache(): void {
    this.cache.clear();
  }

  // -----------------------------------------------------------------------
  // Private cache helpers
  // -----------------------------------------------------------------------

  private getFromCache(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) { return null; }

    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setCache(key: string, value: string): void {
    // Evict expired entries periodically
    if (this.cache.size > 100) {
      this.evictExpired();
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
    const result: vscode.DocumentSymbol[] = [];
    for (const sym of symbols) {
      result.push(sym);
      if (sym.children && sym.children.length > 0) {
        result.push(...this.flattenSymbols(sym.children));
      }
    }
    return result;
  }
}
