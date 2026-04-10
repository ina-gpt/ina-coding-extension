/**
 * Embedding Cache Service
 *
 * Persistent cache for embeddings to avoid re-computation.
 * Uses VS Code globalState for persistence across sessions.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface CachedEmbedding {
  hash: string;
  embedding: number[];
  timestamp: number;
  accessCount: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

export interface CacheConfig {
  maxSize: number;
  ttlMs: number;
  persistKey: string;
  autoSave: boolean;
  autoSaveInterval: number;
}

// ============ Constants ============

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 1000,  // Reduced from 5000 to limit globalState size
  ttlMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
  persistKey: 'inaCoding.embeddingCache',
  autoSave: true,
  autoSaveInterval: 60000,  // 1 minute
};

// ============ Embedding Cache ============

export class EmbeddingCache implements vscode.Disposable {
  private cache: Map<string, CachedEmbedding> = new Map();
  private config: CacheConfig;
  private context: vscode.ExtensionContext | null = null;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private isDirty = false;

  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============ Initialization ============

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;

    // Load from persistent storage
    await this.load();

    // Start auto-save if enabled
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    Logger.info(`EmbeddingCache initialized with ${this.cache.size} entries`);
  }

  // ============ Cache Operations ============

  get(hash: string): number[] | null {
    const entry = this.cache.get(hash);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(hash);
      this.isDirty = true;
      this.stats.misses++;
      return null;
    }

    // Update access count and move to end (LRU)
    entry.accessCount++;
    this.cache.delete(hash);
    this.cache.set(hash, entry);

    this.stats.hits++;
    return entry.embedding;
  }

  set(hash: string, embedding: number[]): void {
    // Evict if full
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.cache.set(hash, {
      hash,
      embedding,
      timestamp: Date.now(),
      accessCount: 1,
    });

    this.isDirty = true;
  }

  has(hash: string): boolean {
    const entry = this.cache.get(hash);

    if (!entry) return false;

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(hash);
      this.isDirty = true;
      return false;
    }

    return true;
  }

  delete(hash: string): boolean {
    const deleted = this.cache.delete(hash);
    if (deleted) this.isDirty = true;
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.isDirty = true;
    this.stats = { hits: 0, misses: 0 };
  }

  getBatch(hashes: string[]): Map<string, number[]> {
    const results = new Map<string, number[]>();

    for (const hash of hashes) {
      const embedding = this.get(hash);
      if (embedding) {
        results.set(hash, embedding);
      }
    }

    return results;
  }

  setBatch(entries: Array<{ hash: string; embedding: number[] }>): void {
    for (const entry of entries) {
      this.set(entry.hash, entry.embedding);
    }
  }

  // ============ Hash Generation ============

  static generateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  static generateChunkHash(
    content: string,
    file: string,
    startLine: number
  ): string {
    const input = `${file}:${startLine}:${content}`;
    return this.generateHash(input);
  }

  // ============ Eviction ============

  private evictLRU(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => {
        if (a[1].accessCount !== b[1].accessCount) {
          return a[1].accessCount - b[1].accessCount;
        }
        return a[1].timestamp - b[1].timestamp;
      });

    // Remove bottom 10%
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));

    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.isDirty = true;
    Logger.debug(`Evicted ${toRemove} cache entries`);
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [hash, entry] of this.cache) {
      if (now - entry.timestamp > this.config.ttlMs) {
        this.cache.delete(hash);
        removed++;
      }
    }

    if (removed > 0) {
      this.isDirty = true;
      Logger.debug(`Cleaned up ${removed} expired cache entries`);
    }

    return removed;
  }

  // ============ Persistence ============

  private async load(): Promise<void> {
    if (!this.context) return;

    try {
      const data = this.context.globalState.get<{
        entries: Array<[string, CachedEmbedding]>;
        savedAt: number;
      }>(this.config.persistKey);

      if (data && data.entries) {
        this.cache = new Map(data.entries);

        // Cleanup expired entries after load
        this.cleanup();

        Logger.info(`Loaded ${this.cache.size} cached embeddings`);
      }
    } catch (error) {
      Logger.warn('Failed to load embedding cache:', error);
    }
  }

  private readonly MAX_PERSIST_SIZE = 5 * 1024 * 1024; // 5MB max in globalState

  async save(): Promise<void> {
    if (!this.context || !this.isDirty) return;

    try {
      const entries = Array.from(this.cache.entries());
      const data = { entries, savedAt: Date.now() };
      const serialized = JSON.stringify(data);

      // Check size before persisting to avoid overloading globalState
      if (serialized.length > this.MAX_PERSIST_SIZE) {
        Logger.warn(`Embedding cache too large (${(serialized.length / 1024 / 1024).toFixed(1)}MB), trimming to 500 entries`);
        const trimmed = entries.slice(-500);
        await this.context.globalState.update(this.config.persistKey, { entries: trimmed, savedAt: Date.now() });
      } else {
        await this.context.globalState.update(this.config.persistKey, data);
      }

      this.isDirty = false;
      Logger.debug(`Saved ${this.cache.size} cached embeddings`);
    } catch (error) {
      Logger.error('Failed to save embedding cache:', error);
    }
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.save();
      }
    }, this.config.autoSaveInterval);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ============ Statistics ============

  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map(e => e.timestamp);

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  // ============ Export/Import ============

  toJSON(): string {
    const data = {
      entries: Array.from(this.cache.entries()),
      exportedAt: Date.now(),
      stats: this.getStats(),
    };

    return JSON.stringify(data);
  }

  importJSON(json: string): number {
    try {
      const data = JSON.parse(json);

      if (!data.entries || !Array.isArray(data.entries)) {
        throw new Error('Invalid cache data');
      }

      let imported = 0;
      for (const [hash, entry] of data.entries) {
        if (!this.cache.has(hash)) {
          this.cache.set(hash, entry);
          imported++;
        }
      }

      this.isDirty = imported > 0;
      return imported;

    } catch (error) {
      Logger.error('Failed to import cache:', error);
      return 0;
    }
  }

  // ============ Cleanup ============

  dispose(): void {
    this.stopAutoSave();

    // Final save
    if (this.isDirty && this.context) {
      this.save();
    }
  }
}

// ============ Singleton Export ============

export const embeddingCache = new EmbeddingCache();
