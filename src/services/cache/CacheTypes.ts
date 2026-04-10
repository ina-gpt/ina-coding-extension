export interface CacheEntry<T> {
  key: string;
  value: T;
  sizeBytes: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  expiresAt: number | null;
  tags: string[];
  priority: CachePriority;
  metadata: Record<string, any>;
}

export enum CachePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
  EPHEMERAL = 'ephemeral',
}

export interface CacheConfig {
  maxSizeBytes: number;
  maxEntries: number;
  defaultTTLMs: number;
  evictionPolicy: EvictionPolicy;
  enablePersistence: boolean;
  persistenceKey: string | null;
  enableMetrics: boolean;
  enableCompression: boolean;
  warmUpOnStart: boolean;
}

export enum EvictionPolicy {
  LRU = 'lru',
  LFU = 'lfu',
  FIFO = 'fifo',
  TTL = 'ttl',
  PRIORITY_LRU = 'priority_lru',
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  sizeBytes: number;
  maxSizeBytes: number;
  hitRate: number;
  avgAccessTime: number;
  oldestEntry: number;
  newestEntry: number;
  entriesByPriority: Record<string, number>;
  entriesByTag: Record<string, number>;
}

export type CacheEvent = 'hit' | 'miss' | 'set' | 'evict' | 'expire' | 'clear' | 'persist' | 'restore';

export interface CacheEventData {
  event: CacheEvent;
  key: string;
  sizeBytes: number | null;
  reason: string | null;
  timestamp: number;
}

export enum CacheTier {
  L1_MEMORY = 'l1_memory',
  L2_GLOBAL_STATE = 'l2_globalstate',
  L3_DISK = 'l3_disk',
  L4_SERVER = 'l4_server',
}

export interface MultiTierCacheConfig {
  l1: CacheConfig;
  l2: CacheConfig;
  l3: CacheConfig | null;
  enablePromotion: boolean;
  enableDemotion: boolean;
}

export interface CacheKeyGeneratorInterface {
  generate(...args: any[]): string;
}

export interface CacheSerializerInterface {
  serialize<T>(value: T): string;
  deserialize<T>(data: string): T;
}

export interface CacheWarmUpStrategy {
  name: string;
  keys: () => Promise<string[]>;
  loader: (key: string) => Promise<any>;
  priority: CachePriority;
  ttl: number;
}

export interface SetOptions {
  ttlMs?: number;
  priority?: CachePriority;
  tags?: string[];
  sizeBytes?: number;
  metadata?: Record<string, any>;
}

export const CACHE_DEFAULTS = {
  L1_MAX_SIZE_BYTES: 52428800,   // 50MB
  L1_MAX_ENTRIES: 5000,
  L1_DEFAULT_TTL: 300000,       // 5min
  L2_MAX_SIZE_BYTES: 10485760,  // 10MB
  L2_MAX_ENTRIES: 1000,
  L2_DEFAULT_TTL: 3600000,      // 1h
  RESPONSE_CACHE_TTL: 600000,   // 10min
  EMBEDDING_CACHE_TTL: 86400000,// 24h
  FILE_CONTENT_CACHE_TTL: 30000,// 30s
  SYMBOL_CACHE_TTL: 10000,      // 10s
  GIT_CACHE_TTL: 3000,          // 3s
  COMPLETION_CACHE_TTL: 60000,  // 1min
} as const;
