import { RequestCategory, RequestEvent, RequestMetrics } from './RequestOptTypes';

interface CategoryStat {
  total: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  timedOut: number;
  totalDurationMs: number;
  durations: number[];
}

export class RequestMetricsCollector {
  private static instance: RequestMetricsCollector;
  private events: { timestamp: number; category: RequestCategory; event: RequestEvent; durationMs: number | null }[] = [];
  private maxEvents = 10000;
  private categoryStats: Map<RequestCategory, CategoryStat> = new Map();
  private deduplicatedCount = 0;
  private batchesMerged = 0;
  private staleCancellations = 0;
  private startTime = Date.now();

  static getInstance(): RequestMetricsCollector {
    if (!RequestMetricsCollector.instance) {
      RequestMetricsCollector.instance = new RequestMetricsCollector();
    }
    return RequestMetricsCollector.instance;
  }

  recordEvent(category: RequestCategory, event: RequestEvent, durationMs?: number): void {
    if (this.events.length >= this.maxEvents) this.events.shift();
    this.events.push({ timestamp: Date.now(), category, event, durationMs: durationMs ?? null });

    const stat = this.getStat(category);
    stat.total++;

    switch (event) {
      case 'started': stat.active++; break;
      case 'completed':
        stat.active = Math.max(0, stat.active - 1);
        stat.completed++;
        if (durationMs != null) {
          stat.totalDurationMs += durationMs;
          stat.durations.push(durationMs);
          if (stat.durations.length > 100) stat.durations.shift();
        }
        break;
      case 'failed': stat.active = Math.max(0, stat.active - 1); stat.failed++; break;
      case 'cancelled': stat.active = Math.max(0, stat.active - 1); stat.cancelled++; break;
      case 'timed_out': stat.active = Math.max(0, stat.active - 1); stat.timedOut++; break;
      case 'deduplicated': this.deduplicatedCount++; break;
      case 'batched': this.batchesMerged++; break;
      case 'stale_detected': this.staleCancellations++; break;
    }
  }

  getMetrics(windowMs: number = 300000): RequestMetrics {
    const now = Date.now();
    const windowEvents = this.events.filter(e => now - e.timestamp < windowMs);
    const durations = windowEvents.filter(e => e.durationMs !== null).map(e => e.durationMs!).sort((a, b) => a - b);

    let totalActive = 0;
    let totalQueued = 0;
    const byCategory: Record<string, any> = {};

    for (const cat of Object.values(RequestCategory)) {
      const stat = this.categoryStats.get(cat);
      if (!stat) continue;
      totalActive += stat.active;
      byCategory[cat] = {
        total: stat.total,
        active: stat.active,
        queued: 0,
        avgMs: stat.completed > 0 ? stat.totalDurationMs / stat.completed : 0,
        errorRate: stat.total > 0 ? stat.failed / stat.total : 0,
      };
    }

    const elapsed = (now - this.startTime) / 60000;
    const totalCompleted = windowEvents.filter(e => e.event === 'completed').length;

    return {
      totalRequests: this.events.length,
      activeRequests: totalActive,
      queuedRequests: totalQueued,
      completedRequests: totalCompleted,
      failedRequests: windowEvents.filter(e => e.event === 'failed').length,
      cancelledRequests: windowEvents.filter(e => e.event === 'cancelled').length,
      timedOutRequests: windowEvents.filter(e => e.event === 'timed_out').length,
      staleRequests: this.staleCancellations,
      avgWaitTimeMs: 0,
      avgExecutionTimeMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      avgTotalTimeMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      p50Ms: this.percentile(durations, 50),
      p95Ms: this.percentile(durations, 95),
      p99Ms: this.percentile(durations, 99),
      requestsPerMinute: elapsed > 0 ? this.events.length / elapsed : 0,
      byCategory,
      batchesMerged: this.batchesMerged,
      deduplicatedRequests: this.deduplicatedCount,
      staleCancellations: this.staleCancellations,
    };
  }

  getRequestsPerMinute(category?: RequestCategory): number {
    const now = Date.now();
    const lastMin = this.events.filter(e => now - e.timestamp < 60000 && (!category || e.category === category));
    return lastMin.length;
  }

  getErrorRate(category?: RequestCategory): number {
    const relevant = category ? this.events.filter(e => e.category === category) : this.events;
    if (relevant.length === 0) return 0;
    return relevant.filter(e => e.event === 'failed').length / relevant.length;
  }

  reset(): void {
    this.events = [];
    this.categoryStats.clear();
    this.deduplicatedCount = 0;
    this.batchesMerged = 0;
    this.staleCancellations = 0;
    this.startTime = Date.now();
  }

  private getStat(category: RequestCategory): CategoryStat {
    let stat = this.categoryStats.get(category);
    if (!stat) {
      stat = { total: 0, active: 0, completed: 0, failed: 0, cancelled: 0, timedOut: 0, totalDurationMs: 0, durations: [] };
      this.categoryStats.set(category, stat);
    }
    return stat;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil(sorted.length * p / 100) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
  }
}
