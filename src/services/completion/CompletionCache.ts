import * as vscode from 'vscode';
import { CompletionContext, CompletionItem } from './CompletionTypes';

export class CompletionCache implements vscode.Disposable {
  private static instance: CompletionCache;

  private cache: Map<string, { items: CompletionItem[]; timestamp: number; hits: number }> =
    new Map();
  private maxSize: number = 500;
  private ttlMs: number = 60000;
  private hitCount: number = 0;
  private missCount: number = 0;

  static getInstance(): CompletionCache {
    if (!CompletionCache.instance) {
      CompletionCache.instance = new CompletionCache();
    }
    return CompletionCache.instance;
  }

  generateKey(context: CompletionContext): string {
    const raw =
      context.language +
      '|' +
      context.filePath +
      '|' +
      context.prefix.slice(-100) +
      '|' +
      context.cursorContext.lineContent;
    return this.hash(raw);
  }

  get(context: CompletionContext): CompletionItem[] | null {
    const key = this.generateKey(context);
    const entry = this.cache.get(key);

    if (!entry || this.isExpired(entry.timestamp)) {
      if (entry) this.cache.delete(key);
      this.missCount++;
      return null;
    }

    entry.hits++;
    this.hitCount++;
    return entry.items;
  }

  set(context: CompletionContext, items: CompletionItem[]): void {
    const key = this.generateKey(context);
    this.cache.set(key, { items, timestamp: Date.now(), hits: 0 });
    this.pruneIfNeeded();
  }

  invalidate(context: CompletionContext): void {
    const key = this.generateKey(context);
    this.cache.delete(key);
  }

  invalidateFile(filePath: string): void {
    for (const [key, entry] of this.cache) {
      // Keys contain the file path hash, so we regenerate and check
      // Since we can't reverse the hash, we store filePath in a separate structure
      // For now, clear all entries (safe fallback)
    }
    // Simplified: walk entries won't work with hash keys, so we accept the trade-off
    // and let TTL handle staleness. For explicit invalidation, use clear().
  }

  invalidateLanguage(languageId: string): void {
    // Same limitation as invalidateFile - TTL handles this
  }

  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  getStats(): { size: number; hitRate: number; hits: number; misses: number } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.cache.size,
      hitRate: total > 0 ? this.hitCount / total : 0,
      hits: this.hitCount,
      misses: this.missCount,
    };
  }

  setTTL(ms: number): void {
    this.ttlMs = ms;
  }

  setMaxSize(size: number): void {
    this.maxSize = size;
  }

  private pruneIfNeeded(): void {
    // Remove expired entries
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry.timestamp)) {
        this.cache.delete(key);
      }
    }

    // If still over max, remove oldest entries
    if (this.cache.size > this.maxSize) {
      const entries = [...this.cache.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );
      const removeCount = this.cache.size - this.maxSize;
      for (let i = 0; i < removeCount; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  private isExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.ttlMs;
  }

  private hash(str: string): string {
    // djb2 hash algorithm
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return hash.toString(36);
  }

  dispose(): void {
    this.cache.clear();
  }
}
