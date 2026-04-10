import { CacheEntry, CacheConfig, CacheStats, CachePriority, EvictionPolicy, CacheEventData, SetOptions } from './CacheTypes';
import { EventEmitter } from 'events';

export class LRUCache<T> extends EventEmitter {
  private map: Map<string, CacheEntry<T>> = new Map();
  private currentSizeBytes: number = 0;
  private config: CacheConfig;
  private stats: CacheStats;

  constructor(config: Partial<CacheConfig> & { maxSizeBytes: number; maxEntries: number }) {
    super();
    this.config = {
      maxSizeBytes: config.maxSizeBytes,
      maxEntries: config.maxEntries,
      defaultTTLMs: config.defaultTTLMs ?? 300000,
      evictionPolicy: config.evictionPolicy ?? EvictionPolicy.LRU,
      enablePersistence: config.enablePersistence ?? false,
      persistenceKey: config.persistenceKey ?? null,
      enableMetrics: config.enableMetrics ?? true,
      enableCompression: config.enableCompression ?? false,
      warmUpOnStart: config.warmUpOnStart ?? false,
    };
    this.stats = this.emptyStats();
  }

  get(key: string): T | null {
    const entry = this.map.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (this.isExpired(entry)) {
      this.map.delete(key);
      this.currentSizeBytes -= entry.sizeBytes;
      this.stats.misses++;
      this.stats.size = this.map.size;
      return null;
    }
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    // Promote to front (LRU): delete + re-set
    this.map.delete(key);
    this.map.set(key, entry);
    this.stats.hits++;
    return entry.value;
  }

  set(key: string, value: T, options?: SetOptions): void {
    const sizeBytes = options?.sizeBytes ?? this.estimateSize(value);
    // Skip if single entry is too large
    if (sizeBytes > this.config.maxSizeBytes * 0.25) return;

    // Remove existing entry if updating
    if (this.map.has(key)) {
      const old = this.map.get(key)!;
      this.currentSizeBytes -= old.sizeBytes;
      this.map.delete(key);
    }

    // Evict until we have room
    while (
      (this.currentSizeBytes + sizeBytes > this.config.maxSizeBytes ||
        this.map.size >= this.config.maxEntries) &&
      this.map.size > 0
    ) {
      this.evict();
    }

    const now = Date.now();
    const ttl = options?.ttlMs ?? this.config.defaultTTLMs;
    const entry: CacheEntry<T> = {
      key,
      value,
      sizeBytes,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      expiresAt: ttl > 0 ? now + ttl : null,
      tags: options?.tags ?? [],
      priority: options?.priority ?? CachePriority.NORMAL,
      metadata: options?.metadata ?? {},
    };

    this.map.set(key, entry);
    this.currentSizeBytes += sizeBytes;
    this.stats.size = this.map.size;
    this.stats.sizeBytes = this.currentSizeBytes;
  }

  has(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.map.delete(key);
      this.currentSizeBytes -= entry.sizeBytes;
      this.stats.size = this.map.size;
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.map.delete(key);
    this.currentSizeBytes -= entry.sizeBytes;
    this.stats.size = this.map.size;
    this.stats.sizeBytes = this.currentSizeBytes;
    return true;
  }

  clear(): void {
    this.map.clear();
    this.currentSizeBytes = 0;
    this.stats.size = 0;
    this.stats.sizeBytes = 0;
  }

  getMany(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const val = this.get(key);
      if (val !== null) result.set(key, val);
    }
    return result;
  }

  setMany(entries: { key: string; value: T; options?: SetOptions }[]): void {
    for (const e of entries) this.set(e.key, e.value, e.options);
  }

  keys(): string[] {
    return Array.from(this.map.keys());
  }

  getByTag(tag: string): CacheEntry<T>[] {
    const results: CacheEntry<T>[] = [];
    for (const entry of this.map.values()) {
      if (entry.tags.includes(tag) && !this.isExpired(entry)) results.push(entry);
    }
    return results;
  }

  deleteByTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.map) {
      if (entry.tags.includes(tag)) {
        this.currentSizeBytes -= entry.sizeBytes;
        this.map.delete(key);
        count++;
      }
    }
    this.stats.size = this.map.size;
    this.stats.sizeBytes = this.currentSizeBytes;
    return count;
  }

  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) {
        const entry = this.map.get(key)!;
        this.currentSizeBytes -= entry.sizeBytes;
        this.map.delete(key);
        count++;
      }
    }
    this.stats.size = this.map.size;
    this.stats.sizeBytes = this.currentSizeBytes;
    return count;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    this.stats.maxSizeBytes = this.config.maxSizeBytes;
    this.stats.sizeBytes = this.currentSizeBytes;
    this.stats.size = this.map.size;

    // Compute entries by priority and tag
    const byPriority: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    let oldest = Infinity;
    let newest = 0;
    for (const entry of this.map.values()) {
      byPriority[entry.priority] = (byPriority[entry.priority] || 0) + 1;
      for (const tag of entry.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
      if (entry.createdAt < oldest) oldest = entry.createdAt;
      if (entry.createdAt > newest) newest = entry.createdAt;
    }
    this.stats.entriesByPriority = byPriority;
    this.stats.entriesByTag = byTag;
    this.stats.oldestEntry = oldest === Infinity ? 0 : oldest;
    this.stats.newestEntry = newest;

    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = this.emptyStats();
  }

  prune(): number {
    let count = 0;
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.currentSizeBytes -= entry.sizeBytes;
        this.map.delete(key);
        count++;
      }
    }
    this.stats.size = this.map.size;
    this.stats.sizeBytes = this.currentSizeBytes;
    return count;
  }

  resize(newMaxSizeBytes: number, newMaxEntries: number): void {
    this.config.maxSizeBytes = newMaxSizeBytes;
    this.config.maxEntries = newMaxEntries;
    while (
      (this.currentSizeBytes > this.config.maxSizeBytes || this.map.size > this.config.maxEntries) &&
      this.map.size > 0
    ) {
      this.evict();
    }
  }

  private evict(): void {
    let targetKey: string | null = null;

    switch (this.config.evictionPolicy) {
      case EvictionPolicy.LRU: {
        // First entry in Map iteration is least recently used
        targetKey = this.map.keys().next().value ?? null;
        break;
      }
      case EvictionPolicy.LFU: {
        let minAccess = Infinity;
        for (const [key, entry] of this.map) {
          if (entry.accessCount < minAccess) {
            minAccess = entry.accessCount;
            targetKey = key;
          }
        }
        break;
      }
      case EvictionPolicy.FIFO: {
        let oldestTime = Infinity;
        for (const [key, entry] of this.map) {
          if (entry.createdAt < oldestTime) {
            oldestTime = entry.createdAt;
            targetKey = key;
          }
        }
        break;
      }
      case EvictionPolicy.TTL: {
        let closestExpiry = Infinity;
        for (const [key, entry] of this.map) {
          if (entry.expiresAt !== null && entry.expiresAt < closestExpiry) {
            closestExpiry = entry.expiresAt;
            targetKey = key;
          }
        }
        if (!targetKey) targetKey = this.map.keys().next().value ?? null;
        break;
      }
      case EvictionPolicy.PRIORITY_LRU: {
        const priorities = [CachePriority.EPHEMERAL, CachePriority.LOW, CachePriority.NORMAL, CachePriority.HIGH, CachePriority.CRITICAL];
        for (const pri of priorities) {
          let oldestAccess = Infinity;
          for (const [key, entry] of this.map) {
            if (entry.priority === pri && entry.lastAccessedAt < oldestAccess) {
              oldestAccess = entry.lastAccessedAt;
              targetKey = key;
            }
          }
          if (targetKey) break;
        }
        break;
      }
    }

    if (targetKey) {
      const entry = this.map.get(targetKey)!;
      this.currentSizeBytes -= entry.sizeBytes;
      this.map.delete(targetKey);
      this.stats.evictions++;
      this.stats.size = this.map.size;
    }
  }

  private estimateSize(value: T): number {
    if (value === null || value === undefined) return 8;
    if (typeof value === 'string') return (value as string).length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (Buffer.isBuffer(value)) return (value as Buffer).byteLength;
    if (Array.isArray(value)) {
      if ((value as any[]).length > 0 && typeof (value as any[])[0] === 'number') {
        return (value as any[]).length * 8; // number array (embedding)
      }
    }
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 256;
    }
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  private emptyStats(): CacheStats {
    return {
      hits: 0, misses: 0, evictions: 0, size: 0, sizeBytes: 0,
      maxSizeBytes: this.config.maxSizeBytes, hitRate: 0, avgAccessTime: 0,
      oldestEntry: 0, newestEntry: 0, entriesByPriority: {}, entriesByTag: {},
    };
  }

  dispose(): void {
    this.clear();
    this.removeAllListeners();
  }
}
