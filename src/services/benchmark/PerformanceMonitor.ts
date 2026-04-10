/**
 * PerformanceMonitor.ts
 * Phase 17.6 - Continuous Performance Monitoring
 *
 * Tracks latency, events, and resource usage over time with percentile calculations.
 */

import { Logger } from '../../utils/Logger';

interface PercentileResult {
  p50: number;
  p95: number;
  p99: number;
}

interface HealthMetricSummary {
  name: string;
  average: number;
  p95: number;
  sampleCount: number;
}

interface HealthReport {
  metrics: HealthMetricSummary[];
  alerts: string[];
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;

  private metrics: Map<string, number[]> = new Map();
  private readonly MAX_SAMPLES = 100;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private monitoring: boolean = false;

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Track a latency measurement from a start time.
   * Records (Date.now() - startTime) under the given metric name.
   */
  trackLatency(name: string, startTime: number): void {
    const elapsed = Date.now() - startTime;
    this.recordSample(name, elapsed);
  }

  /**
   * Track an arbitrary numeric event value.
   */
  trackEvent(name: string, value: number): void {
    this.recordSample(name, value);
  }

  /**
   * Get average values for all tracked metrics.
   */
  getAverages(): Map<string, number> {
    const averages = new Map<string, number>();

    for (const [name, samples] of this.metrics.entries()) {
      if (samples.length === 0) {
        averages.set(name, 0);
        continue;
      }
      const sum = samples.reduce((a, b) => a + b, 0);
      averages.set(name, Math.round((sum / samples.length) * 100) / 100);
    }

    return averages;
  }

  /**
   * Get percentile values (p50, p95, p99) for a specific metric.
   */
  getPercentiles(name: string): PercentileResult {
    const samples = this.metrics.get(name);

    if (!samples || samples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    return {
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    };
  }

  /**
   * Generate a health report with metric summaries and degradation alerts.
   */
  getHealthReport(): HealthReport {
    const metricSummaries: HealthMetricSummary[] = [];
    const alerts: string[] = [];
    const averages = this.getAverages();

    for (const [name, samples] of this.metrics.entries()) {
      if (samples.length === 0) {
        continue;
      }

      const avg = averages.get(name) ?? 0;
      const percentiles = this.getPercentiles(name);

      metricSummaries.push({
        name,
        average: avg,
        p95: percentiles.p95,
        sampleCount: samples.length,
      });

      // Detect degradation: p95 more than 3x the average indicates high variance
      if (percentiles.p95 > avg * 3 && samples.length >= 5) {
        alerts.push(
          `[DEGRADATION] ${name}: p95 (${percentiles.p95.toFixed(1)}) is >3x average (${avg.toFixed(1)})`
        );
      }

      // Detect trend: if last 10 samples average is >2x the overall average
      if (samples.length >= 20) {
        const recentSlice = samples.slice(-10);
        const recentAvg = recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;
        if (recentAvg > avg * 2) {
          alerts.push(
            `[TREND] ${name}: recent average (${recentAvg.toFixed(1)}) is increasing vs overall (${avg.toFixed(1)})`
          );
        }
      }
    }

    return { metrics: metricSummaries, alerts };
  }

  /**
   * Start continuous monitoring with periodic memory checks.
   * Records memory usage every 60 seconds.
   */
  startMonitoring(): void {
    if (this.monitoring) {
      Logger.warn('[PerformanceMonitor] Monitoring is already active');
      return;
    }

    this.monitoring = true;
    Logger.info('[PerformanceMonitor] Starting continuous performance monitoring');

    this.recordMemorySnapshot();

    this.monitoringInterval = setInterval(() => {
      this.recordMemorySnapshot();
    }, 60_000);
  }

  /**
   * Stop continuous monitoring.
   */
  stopMonitoring(): void {
    if (!this.monitoring) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.monitoring = false;
    Logger.info('[PerformanceMonitor] Stopped continuous performance monitoring');
  }

  /**
   * Clear all collected metrics.
   */
  reset(): void {
    this.metrics.clear();
  }

  /**
   * Record a sample value, enforcing the MAX_SAMPLES limit.
   */
  private recordSample(name: string, value: number): void {
    let samples = this.metrics.get(name);

    if (!samples) {
      samples = [];
      this.metrics.set(name, samples);
    }

    samples.push(value);

    // Evict oldest samples when exceeding the limit
    if (samples.length > this.MAX_SAMPLES) {
      samples.splice(0, samples.length - this.MAX_SAMPLES);
    }
  }

  /**
   * Record a memory usage snapshot.
   */
  private recordMemorySnapshot(): void {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const rssMB = memUsage.rss / 1024 / 1024;

      this.recordSample('memory.heapUsed', Math.round(heapUsedMB * 100) / 100);
      this.recordSample('memory.heapTotal', Math.round(heapTotalMB * 100) / 100);
      this.recordSample('memory.rss', Math.round(rssMB * 100) / 100);
    } catch (error) {
      Logger.error('[PerformanceMonitor] Failed to record memory snapshot:', error);
    }
  }

  /**
   * Calculate a percentile value from a sorted array.
   */
  private percentile(sorted: number[], pct: number): number {
    if (sorted.length === 0) {
      return 0;
    }

    const index = (pct / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sorted[lower];
    }

    const weight = index - lower;
    return Math.round((sorted[lower] * (1 - weight) + sorted[upper] * weight) * 100) / 100;
  }
}
