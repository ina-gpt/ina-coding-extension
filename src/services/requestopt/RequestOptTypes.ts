export enum RequestPriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  BACKGROUND = 4,
}

export enum RequestCategory {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  SEARCH = 'search',
  INDEX = 'index',
  MEMORY = 'memory',
  DOC_SEARCH = 'doc_search',
  VISION = 'vision',
  AGENT = 'agent',
  GIT = 'git',
  LSP = 'lsp',
  FILE_READ = 'file_read',
}

export enum RequestStatus {
  QUEUED = 'queued',
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  TIMED_OUT = 'timed_out',
  STALE = 'stale',
}

export interface ManagedRequest<T> {
  id: string;
  category: RequestCategory;
  priority: RequestPriority;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  status: RequestStatus;
  abortController: AbortController;
  promise: Promise<T> | null;
  resolve: ((value: T) => void) | null;
  reject: ((reason: any) => void) | null;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  metadata: Record<string, any>;
  tags: string[];
  deduplicationKey: string | null;
  batchId: string | null;
  stallDetectionMs: number | null;
  executeFn?: (signal: AbortSignal) => Promise<T>;
}

export interface RequestResult<T> {
  data: T | null;
  error: RequestError | null;
  status: RequestStatus;
  durationMs: number;
  fromCache: boolean;
  retried: boolean;
  requestId: string;
}

export interface RequestError {
  message: string;
  code: string;
  retryable: boolean;
  statusCode: number | null;
  category: string;
}

export interface QueueConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  defaultTimeoutMs: number;
  defaultRetries: number;
  stallDetectionMs: number;
  priorityBoostOnAge: boolean;
  ageBoostIntervalMs: number;
  deduplicateRequests: boolean;
  enableBatching: boolean;
}

export interface ThrottleConfig {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  burstAllowance: number;
  windowMs: number;
  retryAfterMs: number;
}

export interface ParallelConfig {
  maxConcurrentPerCategory: Record<string, number>;
  globalMaxConcurrent: number;
  reservedSlots: Record<string, number>;
}

export interface RequestMetrics {
  totalRequests: number;
  activeRequests: number;
  queuedRequests: number;
  completedRequests: number;
  failedRequests: number;
  cancelledRequests: number;
  timedOutRequests: number;
  staleRequests: number;
  avgWaitTimeMs: number;
  avgExecutionTimeMs: number;
  avgTotalTimeMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  requestsPerMinute: number;
  byCategory: Record<string, { total: number; active: number; queued: number; avgMs: number; errorRate: number }>;
  batchesMerged: number;
  deduplicatedRequests: number;
  staleCancellations: number;
}

export type RequestEvent = 'queued' | 'started' | 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'stale_detected' | 'retrying' | 'batched' | 'deduplicated' | 'throttled' | 'priority_boosted';

export interface CategoryConfig {
  maxConcurrent: number;
  timeoutMs: number;
  maxRetries: number;
  priority: RequestPriority;
  stallDetectionMs: number;
  batchable: boolean;
  batchWindowMs: number;
  maxBatchSize: number;
}

export const CATEGORY_DEFAULTS: Record<RequestCategory, CategoryConfig> = {
  [RequestCategory.CHAT]: { maxConcurrent: 1, timeoutMs: 120000, maxRetries: 1, priority: RequestPriority.HIGH, stallDetectionMs: 30000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.COMPLETION]: { maxConcurrent: 2, timeoutMs: 10000, maxRetries: 0, priority: RequestPriority.HIGH, stallDetectionMs: 5000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.EMBEDDING]: { maxConcurrent: 4, timeoutMs: 30000, maxRetries: 2, priority: RequestPriority.NORMAL, stallDetectionMs: 15000, batchable: true, batchWindowMs: 200, maxBatchSize: 20 },
  [RequestCategory.SEARCH]: { maxConcurrent: 3, timeoutMs: 15000, maxRetries: 1, priority: RequestPriority.NORMAL, stallDetectionMs: 10000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.INDEX]: { maxConcurrent: 2, timeoutMs: 60000, maxRetries: 2, priority: RequestPriority.LOW, stallDetectionMs: 30000, batchable: true, batchWindowMs: 500, maxBatchSize: 50 },
  [RequestCategory.MEMORY]: { maxConcurrent: 2, timeoutMs: 10000, maxRetries: 1, priority: RequestPriority.NORMAL, stallDetectionMs: 5000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.DOC_SEARCH]: { maxConcurrent: 2, timeoutMs: 15000, maxRetries: 1, priority: RequestPriority.LOW, stallDetectionMs: 10000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.VISION]: { maxConcurrent: 1, timeoutMs: 180000, maxRetries: 0, priority: RequestPriority.HIGH, stallDetectionMs: 60000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.AGENT]: { maxConcurrent: 1, timeoutMs: 180000, maxRetries: 1, priority: RequestPriority.CRITICAL, stallDetectionMs: 60000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.GIT]: { maxConcurrent: 3, timeoutMs: 10000, maxRetries: 1, priority: RequestPriority.NORMAL, stallDetectionMs: 5000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.LSP]: { maxConcurrent: 5, timeoutMs: 5000, maxRetries: 0, priority: RequestPriority.HIGH, stallDetectionMs: 3000, batchable: false, batchWindowMs: 0, maxBatchSize: 1 },
  [RequestCategory.FILE_READ]: { maxConcurrent: 10, timeoutMs: 5000, maxRetries: 1, priority: RequestPriority.NORMAL, stallDetectionMs: 3000, batchable: true, batchWindowMs: 50, maxBatchSize: 20 },
};

export const DEFAULT_THROTTLES: Partial<Record<RequestCategory, { maxPerSecond: number; maxPerMinute: number; burstAllowance: number }>> = {
  [RequestCategory.CHAT]: { maxPerSecond: 2, maxPerMinute: 30, burstAllowance: 3 },
  [RequestCategory.COMPLETION]: { maxPerSecond: 5, maxPerMinute: 120, burstAllowance: 10 },
  [RequestCategory.EMBEDDING]: { maxPerSecond: 10, maxPerMinute: 300, burstAllowance: 20 },
  [RequestCategory.SEARCH]: { maxPerSecond: 5, maxPerMinute: 60, burstAllowance: 5 },
  [RequestCategory.VISION]: { maxPerSecond: 1, maxPerMinute: 10, burstAllowance: 2 },
  [RequestCategory.AGENT]: { maxPerSecond: 2, maxPerMinute: 20, burstAllowance: 3 },
};
