import * as vscode from 'vscode';
import { LRUCache } from './LRUCache';
import { MultiTierCache } from './MultiTierCache';
import { CacheKeyGenerator } from './CacheKeyGenerator';
import { CacheMetrics } from './CacheMetrics';
import { CacheStats, CACHE_DEFAULTS, EvictionPolicy, CachePriority } from './CacheTypes';
import { Logger } from '../../utils/Logger';

export class CacheManager {
  private static instance: CacheManager;
  private caches: Map<string, LRUCache<any>> = new Map();
  private multiTierCaches: Map<string, MultiTierCache<any>> = new Map();
  private context: vscode.ExtensionContext | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private keyGen: CacheKeyGenerator;
  private metrics: CacheMetrics;

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private constructor() {
    this.keyGen = CacheKeyGenerator.getInstance();
    this.metrics = CacheMetrics.getInstance();
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;

    // Response cache (multi-tier)
    this.multiTierCaches.set('responseCache', new MultiTierCache<string>('response', {
      l1: { maxSizeBytes: 20971520, maxEntries: 500, defaultTTLMs: CACHE_DEFAULTS.RESPONSE_CACHE_TTL, evictionPolicy: EvictionPolicy.LRU, enablePersistence: true, persistenceKey: 'responseCache', enableMetrics: true, enableCompression: false, warmUpOnStart: false },
      l2: { maxSizeBytes: 5242880, maxEntries: 200, defaultTTLMs: 3600000, evictionPolicy: EvictionPolicy.LRU, enablePersistence: false, persistenceKey: null, enableMetrics: false, enableCompression: false, warmUpOnStart: false },
      l3: null, enablePromotion: true, enableDemotion: true,
    }, context));

    // Embedding cache (multi-tier)
    this.multiTierCaches.set('embeddingCache', new MultiTierCache<number[]>('embedding', {
      l1: { maxSizeBytes: 31457280, maxEntries: 2000, defaultTTLMs: CACHE_DEFAULTS.EMBEDDING_CACHE_TTL, evictionPolicy: EvictionPolicy.LRU, enablePersistence: true, persistenceKey: 'embeddingCache', enableMetrics: true, enableCompression: false, warmUpOnStart: false },
      l2: { maxSizeBytes: 10485760, maxEntries: 1000, defaultTTLMs: 604800000, evictionPolicy: EvictionPolicy.LRU, enablePersistence: false, persistenceKey: null, enableMetrics: false, enableCompression: false, warmUpOnStart: false },
      l3: null, enablePromotion: true, enableDemotion: true,
    }, context));

    // Single-tier caches
    this.caches.set('fileContentCache', new LRUCache<string>({ maxSizeBytes: 10485760, maxEntries: 500, defaultTTLMs: CACHE_DEFAULTS.FILE_CONTENT_CACHE_TTL }));
    this.caches.set('symbolCache', new LRUCache<any>({ maxSizeBytes: 5242880, maxEntries: 200, defaultTTLMs: CACHE_DEFAULTS.SYMBOL_CACHE_TTL }));
    this.caches.set('completionCache', new LRUCache<string>({ maxSizeBytes: 5242880, maxEntries: 300, defaultTTLMs: CACHE_DEFAULTS.COMPLETION_CACHE_TTL }));
    this.caches.set('typeInfoCache', new LRUCache<any>({ maxSizeBytes: 3145728, maxEntries: 200, defaultTTLMs: CACHE_DEFAULTS.SYMBOL_CACHE_TTL }));
    this.caches.set('gitCache', new LRUCache<any>({ maxSizeBytes: 2097152, maxEntries: 100, defaultTTLMs: CACHE_DEFAULTS.GIT_CACHE_TTL }));
    this.caches.set('docSearchCache', new LRUCache<any>({ maxSizeBytes: 5242880, maxEntries: 100, defaultTTLMs: 300000 }));
    this.caches.set('memoryRecallCache', new LRUCache<any>({ maxSizeBytes: 2097152, maxEntries: 50, defaultTTLMs: 30000 }));
    this.caches.set('rulesCache', new LRUCache<string>({ maxSizeBytes: 1048576, maxEntries: 10, defaultTTLMs: 0 }));

    this.startAutoPrune(60000);
    Logger.info('CacheManager initialized with all caches');
  }

  getCache(name: string): LRUCache<any> | null {
    return this.caches.get(name) || null;
  }

  getMultiTierCache(name: string): MultiTierCache<any> | null {
    return this.multiTierCaches.get(name) || null;
  }

  // ============ Response Cache ============

  async getResponse(model: string, systemPrompt: string, userMessage: string, contextHash: string): Promise<string | null> {
    const key = this.keyGen.forResponse(model, systemPrompt, userMessage, contextHash);
    const cache = this.multiTierCaches.get('responseCache');
    if (!cache) return null;
    const val = await cache.get(key);
    this.metrics.recordEvent('responseCache', { event: val ? 'hit' : 'miss', key, sizeBytes: null, reason: null, timestamp: Date.now() });
    return val;
  }

  async setResponse(model: string, systemPrompt: string, userMessage: string, contextHash: string, response: string): Promise<void> {
    const key = this.keyGen.forResponse(model, systemPrompt, userMessage, contextHash);
    const cache = this.multiTierCaches.get('responseCache');
    if (cache) await cache.set(key, response, { priority: CachePriority.HIGH });
  }

  // ============ Embedding Cache ============

  async getEmbedding(text: string, model: string): Promise<number[] | null> {
    const key = this.keyGen.forEmbedding(text, model);
    const cache = this.multiTierCaches.get('embeddingCache');
    return cache ? await cache.get(key) : null;
  }

  async setEmbedding(text: string, model: string, embedding: number[]): Promise<void> {
    const key = this.keyGen.forEmbedding(text, model);
    const cache = this.multiTierCaches.get('embeddingCache');
    if (cache) await cache.set(key, embedding, { priority: CachePriority.HIGH });
  }

  // ============ File Content ============

  getFileContent(filePath: string, mtime: number): string | null {
    const key = this.keyGen.forFileContent(filePath, mtime);
    return this.caches.get('fileContentCache')?.get(key) || null;
  }

  setFileContent(filePath: string, mtime: number, content: string): void {
    const key = this.keyGen.forFileContent(filePath, mtime);
    this.caches.get('fileContentCache')?.set(key, content, { tags: ['file:' + this.keyGen.filePrefix(filePath)] });
  }

  // ============ Symbols ============

  getSymbols(filePath: string, version: number): any | null {
    const key = this.keyGen.forSymbols(filePath, version);
    return this.caches.get('symbolCache')?.get(key) || null;
  }

  setSymbols(filePath: string, version: number, symbols: any): void {
    const key = this.keyGen.forSymbols(filePath, version);
    this.caches.get('symbolCache')?.set(key, symbols, { tags: ['file:' + this.keyGen.filePrefix(filePath)] });
  }

  // ============ Completion ============

  getCompletion(prefix: string, suffix: string, filePath: string): string | null {
    const key = this.keyGen.forCompletion(prefix, suffix, filePath);
    return this.caches.get('completionCache')?.get(key) || null;
  }

  setCompletion(prefix: string, suffix: string, filePath: string, completion: string): void {
    const key = this.keyGen.forCompletion(prefix, suffix, filePath);
    this.caches.get('completionCache')?.set(key, completion);
  }

  // ============ Invalidation ============

  invalidateFile(filePath: string): void {
    const prefix = this.keyGen.filePrefix(filePath);
    const tag = 'file:' + prefix;
    for (const cache of this.caches.values()) {
      cache.deleteByTag(tag);
    }
  }

  invalidateAll(): void {
    for (const cache of this.caches.values()) cache.clear();
    for (const cache of this.multiTierCaches.values()) cache.clear();
  }

  invalidateByTag(tag: string): void {
    for (const cache of this.caches.values()) cache.deleteByTag(tag);
  }

  // ============ Stats ============

  getGlobalStats(): { caches: Record<string, CacheStats>; totalSizeBytes: number; totalEntries: number; overallHitRate: number } {
    const cacheStats: Record<string, CacheStats> = {};
    let totalSizeBytes = 0;
    let totalEntries = 0;
    let totalHits = 0;
    let totalMisses = 0;

    for (const [name, cache] of this.caches) {
      const stats = cache.getStats();
      cacheStats[name] = stats;
      totalSizeBytes += stats.sizeBytes;
      totalEntries += stats.size;
      totalHits += stats.hits;
      totalMisses += stats.misses;
    }

    for (const [name, cache] of this.multiTierCaches) {
      const { l1 } = cache.getStats();
      cacheStats[name] = l1;
      totalSizeBytes += l1.sizeBytes;
      totalEntries += l1.size;
      totalHits += l1.hits;
      totalMisses += l1.misses;
    }

    const total = totalHits + totalMisses;
    return {
      caches: cacheStats,
      totalSizeBytes,
      totalEntries,
      overallHitRate: total > 0 ? totalHits / total : 0,
    };
  }

  // ============ Maintenance ============

  pruneAll(): number {
    let total = 0;
    for (const cache of this.caches.values()) total += cache.prune();
    return total;
  }

  startAutoPrune(intervalMs: number): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.pruneTimer = setInterval(() => this.pruneAll(), intervalMs);
  }

  dispose(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    for (const cache of this.caches.values()) cache.dispose();
    for (const cache of this.multiTierCaches.values()) cache.dispose();
    this.caches.clear();
    this.multiTierCaches.clear();
  }
}
