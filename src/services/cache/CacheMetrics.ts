import { CacheEventData, CacheStats } from './CacheTypes';

interface WindowStats {
  hits: number;
  misses: number;
  evictions: number;
  startTime: number;
}

export class CacheMetrics {
  private static instance: CacheMetrics;
  private history: CacheEventData[] = [];
  private maxHistory = 10000;
  private historyIdx = 0;
  private windows: Map<string, WindowStats> = new Map();

  static getInstance(): CacheMetrics {
    if (!CacheMetrics.instance) {
      CacheMetrics.instance = new CacheMetrics();
    }
    return CacheMetrics.instance;
  }

  recordEvent(cacheName: string, event: CacheEventData): void {
    if (this.history.length < this.maxHistory) {
      this.history.push(event);
    } else {
      this.history[this.historyIdx % this.maxHistory] = event;
    }
    this.historyIdx++;

    let win = this.windows.get(cacheName);
    if (!win) {
      win = { hits: 0, misses: 0, evictions: 0, startTime: Date.now() };
      this.windows.set(cacheName, win);
    }
    if (event.event === 'hit') win.hits++;
    else if (event.event === 'miss') win.misses++;
    else if (event.event === 'evict') win.evictions++;
  }

  getHitRate(cacheName: string, _windowMs: number = 300000): number {
    const win = this.windows.get(cacheName);
    if (!win) return 0;
    const total = win.hits + win.misses;
    return total > 0 ? win.hits / total : 0;
  }

  getOverallHitRate(): number {
    let totalHits = 0;
    let totalMisses = 0;
    for (const win of this.windows.values()) {
      totalHits += win.hits;
      totalMisses += win.misses;
    }
    const total = totalHits + totalMisses;
    return total > 0 ? totalHits / total : 0;
  }

  getEvictionRate(cacheName: string): number {
    const win = this.windows.get(cacheName);
    if (!win) return 0;
    const elapsed = (Date.now() - win.startTime) / 60000; // minutes
    return elapsed > 0 ? win.evictions / elapsed : 0;
  }

  getMostAccessedKeys(topN: number = 10): { key: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const ev of this.history) {
      if (ev.event === 'hit' || ev.event === 'miss') {
        counts.set(ev.key, (counts.get(ev.key) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }

  getRecommendations(cacheStats: Record<string, CacheStats>): string[] {
    const recs: string[] = [];
    for (const [name, stats] of Object.entries(cacheStats)) {
      if (stats.hitRate < 0.2 && stats.hits + stats.misses > 10) {
        recs.push(`${name} hit rate is low (${Math.round(stats.hitRate * 100)}%) — consider increasing TTL`);
      }
      if (stats.sizeBytes > stats.maxSizeBytes * 0.9 && stats.maxSizeBytes > 0) {
        recs.push(`${name} is ${Math.round(stats.sizeBytes / stats.maxSizeBytes * 100)}% full — consider increasing max size`);
      }
      if (stats.hitRate > 0.9 && stats.size < 10) {
        recs.push(`${name} performing well (${Math.round(stats.hitRate * 100)}% hit rate)`);
      }
      if (stats.evictions > stats.hits && stats.evictions > 20) {
        recs.push(`${name} has high eviction rate — cache may be too small`);
      }
    }
    return recs;
  }

  formatReport(cacheStats: Record<string, CacheStats>): string {
    const lines: string[] = ['Cache Performance Report', '========================'];
    let totalHits = 0;
    let totalMisses = 0;
    let totalSize = 0;

    for (const [name, stats] of Object.entries(cacheStats)) {
      totalHits += stats.hits;
      totalMisses += stats.misses;
      totalSize += stats.sizeBytes;
      lines.push(`${name}: ${stats.size} entries, ${formatBytes(stats.sizeBytes)}/${formatBytes(stats.maxSizeBytes)}, ${Math.round(stats.hitRate * 100)}% hit rate, ${stats.evictions} evictions`);
    }

    const total = totalHits + totalMisses;
    lines.push('');
    lines.push(`Overall: ${total > 0 ? Math.round(totalHits / total * 100) : 0}% hit rate, ${formatBytes(totalSize)} used`);
    return lines.join('\n');
  }

  resetAll(): void {
    this.history = [];
    this.historyIdx = 0;
    this.windows.clear();
  }

  dispose(): void {
    this.resetAll();
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
