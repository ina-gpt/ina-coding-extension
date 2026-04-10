/**
 * Phase 10.2 — Request Batcher
 * Batches multiple small requests into fewer large requests.
 */
import { Logger } from '../../utils/Logger';
import { RequestCategory, CATEGORY_DEFAULTS } from './RequestOptTypes';

interface BatchItem<TIn = any, TOut = any> {
  params: TIn;
  resolve: (value: TOut) => void;
  reject: (reason: any) => void;
  requestId: string;
}

interface BatchConfig {
  maxBatchSize: number;
  windowMs: number;
  processFn: (batch: any[]) => Promise<any[]>;
}

export class RequestBatcher {
  private static instance: RequestBatcher;
  private pendingBatches = new Map<string, {
    items: BatchItem[];
    timer: ReturnType<typeof setTimeout> | null;
    config: BatchConfig;
  }>();
  private batchesFlushed = 0;

  static getInstance(): RequestBatcher {
    if (!RequestBatcher.instance) {
      RequestBatcher.instance = new RequestBatcher();
    }
    return RequestBatcher.instance;
  }

  private constructor() {}

  registerBatchProcessor(category: RequestCategory, config: BatchConfig): void {
    if (!this.pendingBatches.has(category)) {
      this.pendingBatches.set(category, { items: [], timer: null, config });
    } else {
      const batch = this.pendingBatches.get(category)!;
      batch.config = config;
    }
  }

  addToBatch<TIn, TOut>(
    category: RequestCategory,
    params: TIn,
    processFn?: (batch: TIn[]) => Promise<TOut[]>
  ): Promise<TOut> {
    const defaults = CATEGORY_DEFAULTS[category];
    let batch = this.pendingBatches.get(category);

    if (!batch) {
      const config: BatchConfig = {
        maxBatchSize: defaults.maxBatchSize,
        windowMs: defaults.batchWindowMs,
        processFn: processFn || (() => Promise.resolve([])),
      };
      batch = { items: [], timer: null, config };
      this.pendingBatches.set(category, batch);
    }

    if (processFn) {
      batch.config.processFn = processFn;
    }

    return new Promise<TOut>((resolve, reject) => {
      const item: BatchItem<TIn, TOut> = {
        params,
        resolve,
        reject,
        requestId: `batch_${Date.now()}_${batch!.items.length}`,
      };

      batch!.items.push(item);

      // Flush immediately if batch is full
      if (batch!.items.length >= batch!.config.maxBatchSize) {
        this.flush(category).catch(e => Logger.debug('Batch flush error:', e));
        return;
      }

      // Reset window timer
      this.clearBatchTimer(category);
      this.startBatchTimer(category, batch!.config.windowMs);
    });
  }

  async flush(category: RequestCategory): Promise<void> {
    const batch = this.pendingBatches.get(category);
    if (!batch || batch.items.length === 0) return;

    this.clearBatchTimer(category);
    const items = [...batch.items];
    batch.items = [];

    try {
      const params = items.map(i => i.params);
      const results = await batch.config.processFn(params);
      this.batchesFlushed++;

      // Map results back to individual items
      for (let i = 0; i < items.length; i++) {
        if (i < results.length) {
          items[i].resolve(results[i]);
        } else {
          items[i].reject(new Error('Batch result missing for index ' + i));
        }
      }
    } catch (error) {
      for (const item of items) {
        item.reject(error);
      }
    }
  }

  async flushAll(): Promise<void> {
    const categories = Array.from(this.pendingBatches.keys());
    await Promise.all(categories.map(cat => this.flush(cat as RequestCategory)));
  }

  getPendingCount(category: RequestCategory): number {
    return this.pendingBatches.get(category)?.items.length ?? 0;
  }

  getTotalPending(): number {
    let total = 0;
    for (const batch of this.pendingBatches.values()) {
      total += batch.items.length;
    }
    return total;
  }

  getBatchesFlushed(): number {
    return this.batchesFlushed;
  }

  private startBatchTimer(category: RequestCategory, windowMs: number): void {
    const batch = this.pendingBatches.get(category);
    if (!batch) return;
    batch.timer = setTimeout(() => {
      this.flush(category).catch(e => Logger.debug('Batch timer flush error:', e));
    }, windowMs);
  }

  private clearBatchTimer(category: RequestCategory): void {
    const batch = this.pendingBatches.get(category);
    if (batch?.timer) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }
  }

  dispose(): void {
    this.flushAll().catch(() => {});
    for (const batch of this.pendingBatches.values()) {
      if (batch.timer) clearTimeout(batch.timer);
    }
    this.pendingBatches.clear();
  }
}
