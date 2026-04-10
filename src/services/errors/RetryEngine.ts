/**
 * Phase 10.4 — Retry Engine
 * Intelligent retry with exponential backoff and jitter.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ErrorClassifier } from './ErrorClassifier';
import { ClassifiedError, RetryConfig, ErrorCategory, DEFAULT_RETRY_CONFIGS } from './ErrorTypes';

export class RetryEngine extends EventEmitter {
  private static instance: RetryEngine;
  private activeRetries = new Map<string, { attempt: number; timer: ReturnType<typeof setTimeout> | null; abortController: AbortController }>();
  private classifier = ErrorClassifier.getInstance();

  static getInstance(): RetryEngine {
    if (!RetryEngine.instance) { RetryEngine.instance = new RetryEngine(); }
    return RetryEngine.instance;
  }

  private constructor() { super(); }

  async executeWithRetry<T>(
    executeFn: (signal: AbortSignal) => Promise<T>,
    config: RetryConfig,
    context?: { requestId?: string; operation?: string }
  ): Promise<T> {
    const requestId = context?.requestId || `retry_${Date.now()}`;
    const abortController = new AbortController();
    this.activeRetries.set(requestId, { attempt: 0, timer: null, abortController });

    try {
      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        if (abortController.signal.aborted) throw new Error('Retry cancelled');

        this.activeRetries.get(requestId)!.attempt = attempt;

        try {
          return await executeFn(abortController.signal);
        } catch (error: any) {
          if (abortController.signal.aborted) throw error;

          const classified = this.classifier.classify(error, { operation: context?.operation, attempt, maxAttempts: config.maxRetries });

          if (!classified.retryable || attempt >= config.maxRetries) {
            this.emit('retry-exhausted', classified, attempt + 1);
            throw error;
          }

          const delay = this.calculateDelay(attempt, config);
          Logger.info(`[Retry] Attempt ${attempt + 1}/${config.maxRetries} in ${delay}ms: ${classified.userMessage}`);
          this.emit('retrying', attempt + 1, classified, delay);
          config.onRetry?.(attempt + 1, classified, delay);

          await this.sleep(delay, abortController.signal);
        }
      }
    } finally {
      this.activeRetries.delete(requestId);
    }
    throw new Error('Retry exhausted'); // should not reach
  }

  calculateDelay(attempt: number, config: RetryConfig): number {
    const base = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
    const jitter = base * config.jitterFactor * (Math.random() * 2 - 1);
    return Math.min(Math.max(0, base + jitter), config.maxDelayMs);
  }

  cancelRetry(requestId: string): void {
    const active = this.activeRetries.get(requestId);
    if (active) {
      active.abortController.abort();
      if (active.timer) clearTimeout(active.timer);
      this.activeRetries.delete(requestId);
    }
  }

  cancelAll(): void {
    for (const [id] of this.activeRetries) this.cancelRetry(id);
  }

  getRetryConfig(category: ErrorCategory, overrides?: Partial<RetryConfig>): RetryConfig {
    const base = DEFAULT_RETRY_CONFIGS[category] || DEFAULT_RETRY_CONFIGS[ErrorCategory.UNKNOWN] || {
      maxRetries: 0, baseDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2, jitterFactor: 0.2,
      retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null,
    };
    return { ...base, ...overrides };
  }

  isRetrying(requestId: string): boolean { return this.activeRetries.has(requestId); }
  getActiveRetryCount(): number { return this.activeRetries.size; }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Retry cancelled')); }, { once: true });
    });
  }

  dispose(): void { this.cancelAll(); this.removeAllListeners(); }
}
