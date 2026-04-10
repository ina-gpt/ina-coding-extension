import { EventEmitter } from 'events';
import { PriorityQueue } from './PriorityQueue';
import { RequestDeduplicator } from './RequestDeduplicator';
import { RequestThrottler } from './RequestThrottler';
import { StaleRequestDetector } from './StaleRequestDetector';
import { ConcurrencyController } from './ConcurrencyController';
import { RequestMetricsCollector } from './RequestMetricsCollector';
import {
  ManagedRequest, RequestResult, RequestCategory, RequestPriority, RequestStatus,
  RequestEvent, CATEGORY_DEFAULTS,
} from './RequestOptTypes';
import { Logger } from '../../utils/Logger';

let reqIdCounter = 0;
function genReqId(): string { return `req_${Date.now()}_${++reqIdCounter}`; }

export class RequestScheduler extends EventEmitter {
  private static instance: RequestScheduler;
  private queue: PriorityQueue<ManagedRequest<any>>;
  private deduplicator: RequestDeduplicator;
  private throttler: RequestThrottler;
  private staleDetector: StaleRequestDetector;
  private concurrency: ConcurrencyController;
  private metricsCollector: RequestMetricsCollector;
  private isProcessing = false;

  static getInstance(): RequestScheduler {
    if (!RequestScheduler.instance) {
      RequestScheduler.instance = new RequestScheduler();
    }
    return RequestScheduler.instance;
  }

  private constructor() {
    super();
    this.queue = new PriorityQueue(500);
    this.deduplicator = RequestDeduplicator.getInstance();
    this.throttler = RequestThrottler.getInstance();
    this.staleDetector = StaleRequestDetector.getInstance();
    this.concurrency = ConcurrencyController.getInstance();
    this.metricsCollector = RequestMetricsCollector.getInstance();
    this.queue.startAgeBoost(10000);
    this.staleDetector.startMonitoring(5000);
  }

  schedule<T>(
    category: RequestCategory,
    executeFn: (signal: AbortSignal) => Promise<T>,
    options?: {
      priority?: RequestPriority;
      deduplicationKey?: string;
      timeoutMs?: number;
      maxRetries?: number;
      tags?: string[];
      metadata?: Record<string, any>;
    }
  ): Promise<RequestResult<T>> {
    const defaults = CATEGORY_DEFAULTS[category];
    const id = genReqId();
    const priority = options?.priority ?? defaults.priority;
    const timeoutMs = options?.timeoutMs ?? defaults.timeoutMs;
    const maxRetries = options?.maxRetries ?? defaults.maxRetries;

    // Generate dedup key
    const dedupKey = options?.deduplicationKey ?? null;

    // Deduplication check
    if (dedupKey) {
      const existing = this.deduplicator.checkDuplicate(dedupKey);
      if (existing) {
        this.metricsCollector.recordEvent(category, 'deduplicated');
        return new Promise<RequestResult<T>>((resolve, reject) => {
          this.deduplicator.subscribe<T>(dedupKey, (val) => {
            resolve(this.buildResult(id, val, null, RequestStatus.COMPLETED, 0, false, false));
          }, (err) => {
            reject(err);
          });
        });
      }
    }

    return new Promise<RequestResult<T>>((resolve, reject) => {
      const abortController = new AbortController();
      const request: ManagedRequest<T> = {
        id, category, priority, createdAt: Date.now(),
        startedAt: null, completedAt: null, status: RequestStatus.QUEUED,
        abortController, promise: null, resolve: null, reject: null,
        retryCount: 0, maxRetries, timeoutMs,
        metadata: options?.metadata ?? {}, tags: options?.tags ?? [],
        deduplicationKey: dedupKey, batchId: null,
        stallDetectionMs: defaults.stallDetectionMs,
        executeFn,
      };

      request.resolve = (value: T) => {
        request.status = RequestStatus.COMPLETED;
        request.completedAt = Date.now();
        const duration = request.startedAt ? request.completedAt - request.startedAt : 0;
        this.metricsCollector.recordEvent(category, 'completed', duration);
        this.staleDetector.untrack(id);
        this.concurrency.releaseSlot(category, id);
        if (dedupKey) this.deduplicator.resolveInflight(dedupKey, value);
        resolve(this.buildResult(id, value, null, RequestStatus.COMPLETED, duration, false, request.retryCount > 0));
        this.startProcessing();
      };

      request.reject = (error: any) => {
        // Check if retryable
        if (request.retryCount < request.maxRetries && !request.abortController.signal.aborted) {
          request.retryCount++;
          request.status = RequestStatus.QUEUED;
          request.priority = Math.max(0, request.priority - 1) as RequestPriority; // boost
          this.metricsCollector.recordEvent(category, 'retrying');
          this.concurrency.releaseSlot(category, id);
          this.queue.enqueue(request);
          this.startProcessing();
          return;
        }

        request.status = RequestStatus.FAILED;
        request.completedAt = Date.now();
        const duration = request.startedAt ? request.completedAt - request.startedAt : 0;
        this.metricsCollector.recordEvent(category, 'failed', duration);
        this.staleDetector.untrack(id);
        this.concurrency.releaseSlot(category, id);
        if (dedupKey) this.deduplicator.rejectInflight(dedupKey, error);
        resolve(this.buildResult<T>(id, null as any, error, RequestStatus.FAILED, duration, false, request.retryCount > 0));
      };

      if (dedupKey) this.deduplicator.registerInflight(dedupKey, request);
      this.metricsCollector.recordEvent(category, 'queued');
      this.queue.enqueue(request);
      this.startProcessing();
    });
  }

  cancelRequest(requestId: string): boolean {
    const req = this.queue.remove(requestId);
    if (req) {
      req.status = RequestStatus.CANCELLED;
      req.abortController.abort();
      req.reject?.(new Error('Cancelled'));
      this.metricsCollector.recordEvent(req.category, 'cancelled');
      return true;
    }
    return false;
  }

  cancelByCategory(category: RequestCategory): number {
    return this.queue.cancelByCategory(category);
  }

  cancelAll(): number {
    const count = this.queue.size;
    this.queue.clear();
    return count;
  }

  getMetrics() { return this.metricsCollector.getMetrics(); }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (!this.queue.isEmpty()) {
        const request = this.queue.peek();
        if (!request) break;

        // Check concurrency
        if (this.concurrency.getAvailableSlots(request.category) <= 0) break;

        this.queue.dequeue();
        request.status = RequestStatus.ACTIVE;
        request.startedAt = Date.now();
        this.metricsCollector.recordEvent(request.category, 'started');
        this.staleDetector.track(request);

        // Throttling
        await this.throttler.acquire(request.category);

        // Execute with timeout
        const executeFn = request.executeFn;
        if (!executeFn) {
          request.reject?.(new Error('No execute function'));
          continue;
        }

        try {
          await this.concurrency.acquireSlot(request.category, request.id, request.priority);
        } catch {
          request.reject?.(new Error('Could not acquire slot'));
          continue;
        }

        // Fire and continue (don't await — allows parallel processing)
        this.executeRequest(request, executeFn).catch(() => {});
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeRequest<T>(request: ManagedRequest<T>, executeFn: (signal: AbortSignal) => Promise<T>): Promise<void> {
    try {
      const result = await Promise.race([
        executeFn(request.abortController.signal),
        this.timeoutPromise(request.timeoutMs, request.id),
      ]);
      request.resolve?.(result as T);
    } catch (error: any) {
      if (error?.message === 'Request timed out') {
        request.status = RequestStatus.TIMED_OUT;
        request.abortController.abort();
        this.metricsCollector.recordEvent(request.category, 'timed_out');
        this.staleDetector.untrack(request.id);
        this.concurrency.releaseSlot(request.category, request.id);
        // Timeout: reject so the outer promise resolves with error result via request.reject
      }
      request.reject?.(error);
    }
  }

  private startProcessing(): void {
    if (!this.isProcessing) {
      setTimeout(() => this.processQueue(), 0);
    }
  }

  private timeoutPromise(ms: number, requestId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out')), ms);
    });
  }

  private buildResult<T>(id: string, data: T | null, error: any, status: RequestStatus, durationMs: number, fromCache: boolean, retried: boolean): RequestResult<T> {
    return {
      data,
      error: error ? { message: String(error?.message || error), code: error?.code || 'ERROR', retryable: false, statusCode: error?.statusCode || null, category: '' } : null,
      status, durationMs, fromCache, retried, requestId: id,
    };
  }

  dispose(): void {
    this.queue.dispose();
    this.staleDetector.dispose();
    this.concurrency.dispose();
    this.removeAllListeners();
  }
}
