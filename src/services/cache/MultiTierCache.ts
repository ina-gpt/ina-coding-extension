import * as vscode from 'vscode';
import { LRUCache } from './LRUCache';
import { MultiTierCacheConfig, CacheStats, SetOptions, EvictionPolicy } from './CacheTypes';

export class MultiTierCache<T> {
  private l1: LRUCache<T>;
  private l2Key: string;
  private context: vscode.ExtensionContext | null;
  private config: MultiTierCacheConfig;
  private persistTimer: NodeJS.Timeout | null = null;
  private dirtyKeys: Set<string> = new Set();

  constructor(name: string, config: MultiTierCacheConfig, context?: vscode.ExtensionContext) {
    this.config = config;
    this.l2Key = `cache:${name}`;
    this.context = context || null;

    this.l1 = new LRUCache<T>({
      maxSizeBytes: config.l1.maxSizeBytes,
      maxEntries: config.l1.maxEntries,
      defaultTTLMs: config.l1.defaultTTLMs,
      evictionPolicy: config.l1.evictionPolicy || EvictionPolicy.LRU,
    });
  }

  async get(key: string): Promise<T | null> {
    // L1: memory
    const l1Value = this.l1.get(key);
    if (l1Value !== null) return l1Value;

    // L2: globalState
    if (this.context) {
      const l2Value = this.loadFromGlobalState(key);
      if (l2Value !== null && this.config.enablePromotion) {
        this.l1.set(key, l2Value);
      }
      return l2Value;
    }

    return null;
  }

  async set(key: string, value: T, options?: SetOptions): Promise<void> {
    this.l1.set(key, value, options);

    if (this.config.l2 && this.context) {
      this.dirtyKeys.add(key);
      this.schedulePersistence();
    }
  }

  async delete(key: string): Promise<void> {
    this.l1.delete(key);
    if (this.context) {
      const stateKey = `${this.l2Key}:${key}`;
      await this.context.globalState.update(stateKey, undefined);
    }
  }

  async clear(): Promise<void> {
    this.l1.clear();
    // Note: globalState entries aren't bulk-deletable, just clear L1
  }

  getStats(): { l1: CacheStats; combined: CacheStats } {
    const l1Stats = this.l1.getStats();
    return { l1: l1Stats, combined: l1Stats };
  }

  getL1(): LRUCache<T> {
    return this.l1;
  }

  private loadFromGlobalState(key: string): T | null {
    if (!this.context) return null;
    try {
      const stateKey = `${this.l2Key}:${key}`;
      const data = this.context.globalState.get<{ value: T; expiresAt: number | null }>(stateKey);
      if (!data) return null;
      if (data.expiresAt && Date.now() > data.expiresAt) {
        this.context.globalState.update(stateKey, undefined);
        return null;
      }
      return data.value;
    } catch {
      return null;
    }
  }

  private schedulePersistence(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.flushDirtyKeys();
      this.persistTimer = null;
    }, 2000);
  }

  private flushDirtyKeys(): void {
    if (!this.context || this.dirtyKeys.size === 0) return;
    for (const key of this.dirtyKeys) {
      const val = this.l1.get(key);
      if (val !== null) {
        const stateKey = `${this.l2Key}:${key}`;
        const ttl = this.config.l2.defaultTTLMs;
        this.context.globalState.update(stateKey, {
          value: val,
          expiresAt: ttl > 0 ? Date.now() + ttl : null,
        });
      }
    }
    this.dirtyKeys.clear();
  }

  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.flushDirtyKeys();
    }
    this.l1.dispose();
  }
}
