/**
 * BenchmarkTypes.ts
 * Phase 17.6 - Performance Benchmarking Types and Targets
 */

export type BenchmarkCategory = 'latency' | 'throughput' | 'memory' | 'startup';

export type BenchmarkUnit = 'ms' | 'tokens/s' | 'MB' | 'count' | '%';

export type BenchmarkStatus = 'pass' | 'warn' | 'fail';

export interface BenchmarkResult {
  name: string;
  category: BenchmarkCategory;
  value: number;
  unit: BenchmarkUnit;
  target: number;
  status: BenchmarkStatus;
  timestamp: number;
  details: string | null;
}

export interface BenchmarkEnvironment {
  nodeVersion: string;
  vscodeVersion: string;
  extensionVersion: string;
  platform: string;
  model: string;
}

export interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  totalPassed: number;
  totalWarned: number;
  totalFailed: number;
  runTimeMs: number;
  environment: BenchmarkEnvironment;
}

export interface BenchmarkTarget {
  target: number;
  warn: number;
  unit: string;
}

/**
 * Benchmark targets for all measured performance metrics.
 * - target: ideal threshold (pass if at or below for latency/memory, at or above for rates)
 * - warn: degraded threshold (warn if between target and warn)
 * - Values beyond warn are considered failures.
 */
export const BENCHMARK_TARGETS: Record<string, BenchmarkTarget> = {
  // Latency targets (ms) - lower is better
  'chat.firstTokenLatency': {
    target: 500,
    warn: 1000,
    unit: 'ms',
  },
  'chat.fullResponseLatency': {
    target: 3000,
    warn: 6000,
    unit: 'ms',
  },
  'completion.triggerToGhostText': {
    target: 200,
    warn: 500,
    unit: 'ms',
  },
  'completion.contextGathering': {
    target: 50,
    warn: 150,
    unit: 'ms',
  },
  'agent.taskLatency': {
    target: 5000,
    warn: 10000,
    unit: 'ms',
  },
  'api.healthCheckLatency': {
    target: 100,
    warn: 300,
    unit: 'ms',
  },
  'codebase.searchLatency': {
    target: 200,
    warn: 500,
    unit: 'ms',
  },
  'file.detectionLatency': {
    target: 50,
    warn: 150,
    unit: 'ms',
  },

  // Throughput targets - higher is better
  'completion.throughput': {
    target: 30,
    warn: 15,
    unit: 'tokens/s',
  },
  'chat.throughput': {
    target: 20,
    warn: 10,
    unit: 'tokens/s',
  },

  // Memory targets (MB) - lower is better
  'memory.heapUsed': {
    target: 150,
    warn: 300,
    unit: 'MB',
  },
  'memory.heapTotal': {
    target: 256,
    warn: 512,
    unit: 'MB',
  },

  // Startup targets (ms) - lower is better
  'extension.activationTime': {
    target: 500,
    warn: 1500,
    unit: 'ms',
  },

  // Rate targets (%) - higher is better
  'cache.hitRate': {
    target: 70,
    warn: 40,
    unit: '%',
  },
  'cache.completionHitRate': {
    target: 60,
    warn: 30,
    unit: '%',
  },
  'api.successRate': {
    target: 99,
    warn: 95,
    unit: '%',
  },
};

/**
 * Categories grouping for benchmark targets.
 */
export const BENCHMARK_CATEGORIES: Record<BenchmarkCategory, string[]> = {
  latency: [
    'chat.firstTokenLatency',
    'chat.fullResponseLatency',
    'completion.triggerToGhostText',
    'completion.contextGathering',
    'agent.taskLatency',
    'api.healthCheckLatency',
    'codebase.searchLatency',
    'file.detectionLatency',
  ],
  throughput: [
    'completion.throughput',
    'chat.throughput',
  ],
  memory: [
    'memory.heapUsed',
    'memory.heapTotal',
  ],
  startup: [
    'extension.activationTime',
    'cache.hitRate',
    'cache.completionHitRate',
    'api.successRate',
  ],
};

/** Units that are "higher is better" (rates, throughput). */
export const HIGHER_IS_BETTER_UNITS: Set<string> = new Set(['tokens/s', '%']);
