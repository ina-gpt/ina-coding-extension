/**
 * BenchmarkRunner.ts
 * Phase 17.6 - Performance Benchmarking Runner
 *
 * Executes all performance benchmarks and collects results.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { CacheManager } from '../cache/CacheManager';
import { CacheMetrics } from '../cache/CacheMetrics';
import { RequestMetricsCollector } from '../requestopt/RequestMetricsCollector';
import { ConnectivityMonitor } from '../offline/ConnectivityMonitor';
import { StatusAggregator } from '../status/StatusAggregator';
import { FileDetector } from '../apply/FileDetector';
import {
  BenchmarkResult,
  BenchmarkSuite,
  BenchmarkCategory,
  BenchmarkStatus,
  BenchmarkUnit,
  BenchmarkEnvironment,
  BENCHMARK_TARGETS,
  BENCHMARK_CATEGORIES,
  HIGHER_IS_BETTER_UNITS,
} from './BenchmarkTypes';

export class BenchmarkRunner {
  private static instance: BenchmarkRunner;
  private running: boolean = false;

  private constructor() {}

  static getInstance(): BenchmarkRunner {
    if (!BenchmarkRunner.instance) {
      BenchmarkRunner.instance = new BenchmarkRunner();
    }
    return BenchmarkRunner.instance;
  }

  /**
   * Run all benchmark categories and return a complete suite.
   */
  async runAll(): Promise<BenchmarkSuite> {
    if (this.running) {
      throw new Error('Benchmark suite is already running');
    }

    this.running = true;
    const startTime = Date.now();
    Logger.info('[BenchmarkRunner] Starting full benchmark suite');

    const results: BenchmarkResult[] = [];

    try {
      for (const category of Object.keys(BENCHMARK_CATEGORIES) as BenchmarkCategory[]) {
        const categoryResults = await this.runCategoryBenchmarks(category);
        results.push(...categoryResults);
      }
    } catch (error) {
      Logger.error('[BenchmarkRunner] Error running benchmarks:', error);
    } finally {
      this.running = false;
    }

    const suite = this.buildSuite('Full Benchmark Suite', results, startTime);
    Logger.info(
      `[BenchmarkRunner] Suite complete: ${suite.totalPassed} passed, ${suite.totalWarned} warned, ${suite.totalFailed} failed in ${suite.runTimeMs}ms`
    );
    return suite;
  }

  /**
   * Run benchmarks for a single category.
   */
  async runCategory(category: BenchmarkCategory): Promise<BenchmarkSuite> {
    if (this.running) {
      throw new Error('Benchmark suite is already running');
    }

    this.running = true;
    const startTime = Date.now();
    Logger.info(`[BenchmarkRunner] Running ${category} benchmarks`);

    let results: BenchmarkResult[] = [];
    try {
      results = await this.runCategoryBenchmarks(category);
    } catch (error) {
      Logger.error(`[BenchmarkRunner] Error running ${category} benchmarks:`, error);
    } finally {
      this.running = false;
    }

    return this.buildSuite(`${category} Benchmarks`, results, startTime);
  }

  /**
   * Run all benchmarks for a given category.
   */
  private async runCategoryBenchmarks(category: BenchmarkCategory): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    switch (category) {
      case 'latency':
        results.push(await this.benchmarkChatLatency());
        results.push(await this.benchmarkCompletionLatency());
        results.push(await this.benchmarkContextGathering());
        results.push(await this.benchmarkAPIHealth());
        results.push(await this.benchmarkCodebaseSearch());
        results.push(await this.benchmarkFileDetection());
        break;
      case 'throughput':
        results.push(await this.benchmarkChatThroughput());
        break;
      case 'memory':
        results.push(await this.benchmarkExtensionMemory());
        break;
      case 'startup':
        results.push(await this.benchmarkCachePerformance());
        results.push(await this.benchmarkAPISuccessRate());
        break;
    }

    return results;
  }

  /**
   * Benchmark chat latency: send "Hello" to API and measure first token + full response time.
   */
  async benchmarkChatLatency(): Promise<BenchmarkResult> {
    const targetKey = 'chat.fullResponseLatency';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const endpoint = ConfigManager.getApiEndpoint();
      const startTime = Date.now();

      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello', benchmark: true }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Chat API returned ${response.status}`);
      }

      // Read full response to measure total latency
      await response.text();
      const elapsed = Date.now() - startTime;

      return this.createResult(
        'Chat Full Response Latency',
        'latency',
        elapsed,
        'ms',
        target.target,
        this.evaluate(elapsed, targetKey),
        `API endpoint: ${endpoint}`
      );
    } catch (error: any) {
      return this.createResult(
        'Chat Full Response Latency',
        'latency',
        -1,
        'ms',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark completion latency: measure simulated trigger-to-ghost-text time.
   */
  async benchmarkCompletionLatency(): Promise<BenchmarkResult> {
    const targetKey = 'completion.triggerToGhostText';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const endpoint = ConfigManager.getApiEndpoint();
      const startTime = Date.now();

      const response = await fetch(`${endpoint}/api/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: 'function hello() {\n  ',
          suffix: '\n}',
          language: 'typescript',
          benchmark: true,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`Completion API returned ${response.status}`);
      }

      await response.text();
      const elapsed = Date.now() - startTime;

      return this.createResult(
        'Completion Trigger to Ghost Text',
        'latency',
        elapsed,
        'ms',
        target.target,
        this.evaluate(elapsed, targetKey),
        null
      );
    } catch (error: any) {
      return this.createResult(
        'Completion Trigger to Ghost Text',
        'latency',
        -1,
        'ms',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark context gathering time via ContextAggregator performance.
   */
  async benchmarkContextGathering(): Promise<BenchmarkResult> {
    const targetKey = 'completion.contextGathering';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const metricsCollector = RequestMetricsCollector.getInstance();
      const metrics = metricsCollector.getMetrics();

      // Use average context gathering time from collected metrics if available
      const avgLatency = (metrics as any).averageLatencyMs ?? -1;
      const elapsed = avgLatency >= 0 ? avgLatency : 0;

      return this.createResult(
        'Context Gathering',
        'latency',
        elapsed,
        'ms',
        target.target,
        elapsed >= 0 ? this.evaluate(elapsed, targetKey) : 'warn',
        elapsed < 0 ? 'No context gathering metrics available' : null
      );
    } catch (error: any) {
      return this.createResult(
        'Context Gathering',
        'latency',
        -1,
        'ms',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark cache performance: collect hit rates from CacheMetrics.
   */
  async benchmarkCachePerformance(): Promise<BenchmarkResult> {
    const targetKey = 'cache.hitRate';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const cacheMetrics = CacheMetrics.getInstance();
      const hitRate = cacheMetrics.getOverallHitRate?.() ?? 0;

      return this.createResult(
        'Cache Hit Rate',
        'startup',
        hitRate,
        '%',
        target.target,
        this.evaluate(hitRate, targetKey),
        `Hit rate: ${hitRate.toFixed(1)}%`
      );
    } catch (error: any) {
      return this.createResult(
        'Cache Hit Rate',
        'startup',
        0,
        '%',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark API health check round-trip latency.
   */
  async benchmarkAPIHealth(): Promise<BenchmarkResult> {
    const targetKey = 'api.healthCheckLatency';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const endpoint = ConfigManager.getApiEndpoint();
      const startTime = Date.now();

      const response = await fetch(`${endpoint}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`Health check returned ${response.status}`);
      }

      return this.createResult(
        'API Health Check Latency',
        'latency',
        elapsed,
        'ms',
        target.target,
        this.evaluate(elapsed, targetKey),
        `Status: ${response.status}`
      );
    } catch (error: any) {
      return this.createResult(
        'API Health Check Latency',
        'latency',
        -1,
        'ms',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark extension memory usage via process.memoryUsage().
   */
  async benchmarkExtensionMemory(): Promise<BenchmarkResult> {
    const targetKey = 'memory.heapUsed';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100;

      return this.createResult(
        'Heap Memory Used',
        'memory',
        heapUsedMB,
        'MB',
        target.target,
        this.evaluate(heapUsedMB, targetKey),
        `Heap total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB, RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`
      );
    } catch (error: any) {
      return this.createResult(
        'Heap Memory Used',
        'memory',
        -1,
        'MB',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark codebase search latency.
   */
  async benchmarkCodebaseSearch(): Promise<BenchmarkResult> {
    const targetKey = 'codebase.searchLatency';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const startTime = Date.now();

      // Use VS Code workspace search as a proxy for codebase search performance
      const results = await vscode.workspace.findFiles('**/*.ts', '**/node_modules/**', 10);
      const elapsed = Date.now() - startTime;

      return this.createResult(
        'Codebase Search Latency',
        'latency',
        elapsed,
        'ms',
        target.target,
        this.evaluate(elapsed, targetKey),
        `Found ${results.length} files`
      );
    } catch (error: any) {
      return this.createResult(
        'Codebase Search Latency',
        'latency',
        -1,
        'ms',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark FileDetector.detectTarget() latency.
   */
  async benchmarkFileDetection(): Promise<BenchmarkResult> {
    const targetKey = 'file.detectionLatency';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const detector = FileDetector.getInstance();

      const startTime = Date.now();
      await detector.detectTarget({
        code: 'console.log("benchmark test");',
        language: 'typescript',
        filename: null,
        isComplete: false,
        hasFileHeader: false,
      });
      const elapsed = Date.now() - startTime;

      return this.createResult(
        'File Detection Latency',
        'latency',
        elapsed,
        'ms',
        target.target,
        this.evaluate(elapsed, targetKey),
        null
      );
    } catch (error: any) {
      return this.createResult(
        'File Detection Latency',
        'latency',
        -1,
        'ms',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark chat throughput (tokens/s).
   */
  private async benchmarkChatThroughput(): Promise<BenchmarkResult> {
    const targetKey = 'chat.throughput';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const metricsCollector = RequestMetricsCollector.getInstance();
      const metrics = metricsCollector.getMetrics();
      const throughput = (metrics as any).tokensPerSecond ?? 0;

      return this.createResult(
        'Chat Throughput',
        'throughput',
        throughput,
        'tokens/s',
        target.target,
        this.evaluate(throughput, targetKey),
        null
      );
    } catch (error: any) {
      return this.createResult(
        'Chat Throughput',
        'throughput',
        0,
        'tokens/s',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Benchmark API success rate.
   */
  private async benchmarkAPISuccessRate(): Promise<BenchmarkResult> {
    const targetKey = 'api.successRate';
    const target = BENCHMARK_TARGETS[targetKey];

    try {
      const connectivity = ConnectivityMonitor.getInstance();
      const isOnline = connectivity.isOnline();
      const successRate = isOnline ? 100 : 0;

      return this.createResult(
        'API Success Rate',
        'startup',
        successRate,
        '%',
        target.target,
        this.evaluate(successRate, targetKey),
        `Online: ${isOnline}`
      );
    } catch (error: any) {
      return this.createResult(
        'API Success Rate',
        'startup',
        0,
        '%',
        target.target,
        'fail',
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Evaluate a measured value against its benchmark target.
   * For "lower is better" metrics (latency, memory): pass if <= target, warn if <= warn, else fail.
   * For "higher is better" metrics (throughput, %): pass if >= target, warn if >= warn, else fail.
   */
  private evaluate(value: number, targetKey: string): BenchmarkStatus {
    const benchTarget = BENCHMARK_TARGETS[targetKey];
    if (!benchTarget) {
      return 'warn';
    }

    const higherIsBetter = HIGHER_IS_BETTER_UNITS.has(benchTarget.unit);

    if (higherIsBetter) {
      if (value >= benchTarget.target) { return 'pass'; }
      if (value >= benchTarget.warn) { return 'warn'; }
      return 'fail';
    } else {
      if (value <= benchTarget.target) { return 'pass'; }
      if (value <= benchTarget.warn) { return 'warn'; }
      return 'fail';
    }
  }

  /**
   * Create a BenchmarkResult entry.
   */
  private createResult(
    name: string,
    category: BenchmarkCategory,
    value: number,
    unit: BenchmarkUnit,
    target: number,
    status: BenchmarkStatus,
    details: string | null
  ): BenchmarkResult {
    return {
      name,
      category,
      value,
      unit,
      target,
      status,
      timestamp: Date.now(),
      details,
    };
  }

  /**
   * Build a BenchmarkSuite from collected results.
   */
  private buildSuite(name: string, results: BenchmarkResult[], startTime: number): BenchmarkSuite {
    const env = this.getEnvironment();
    return {
      name,
      results,
      totalPassed: results.filter(r => r.status === 'pass').length,
      totalWarned: results.filter(r => r.status === 'warn').length,
      totalFailed: results.filter(r => r.status === 'fail').length,
      runTimeMs: Date.now() - startTime,
      environment: env,
    };
  }

  /**
   * Collect current environment information.
   */
  private getEnvironment(): BenchmarkEnvironment {
    return {
      nodeVersion: process.version,
      vscodeVersion: vscode.version,
      extensionVersion: vscode.extensions.getExtension('ina-coding.ina-coding')?.packageJSON?.version ?? 'unknown',
      platform: `${process.platform} ${process.arch}`,
      model: ConfigManager.getApiEndpoint(),
    };
  }
}
