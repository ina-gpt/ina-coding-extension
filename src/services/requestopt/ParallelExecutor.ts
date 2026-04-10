import { RequestScheduler } from './RequestScheduler';
import { RequestCategory, RequestPriority } from './RequestOptTypes';
import { Logger } from '../../utils/Logger';

export interface ParallelResult<T> {
  results: Map<string, T>;
  errors: Map<string, Error>;
  completed: number;
  failed: number;
  cancelled: number;
  durationMs: number;
}

export class ParallelExecutor {
  private static instance: ParallelExecutor;

  static getInstance(): ParallelExecutor {
    if (!ParallelExecutor.instance) {
      ParallelExecutor.instance = new ParallelExecutor();
    }
    return ParallelExecutor.instance;
  }

  async executeParallel<T>(
    tasks: {
      name: string;
      category: RequestCategory;
      executeFn: (signal: AbortSignal) => Promise<T>;
      priority?: RequestPriority;
      optional?: boolean;
    }[],
    options?: { failFast?: boolean; timeoutMs?: number }
  ): Promise<ParallelResult<T>> {
    const start = Date.now();
    const results = new Map<string, T>();
    const errors = new Map<string, Error>();
    let cancelled = 0;

    const scheduler = RequestScheduler.getInstance();
    const promises = tasks.map(async (task) => {
      try {
        const result = await scheduler.schedule(task.category, task.executeFn, {
          priority: task.priority,
          timeoutMs: options?.timeoutMs,
        });
        if (result.data !== null) {
          results.set(task.name, result.data);
        } else if (result.error) {
          if (!task.optional) {
            errors.set(task.name, new Error(result.error.message));
          }
        }
      } catch (error: any) {
        if (!task.optional) {
          errors.set(task.name, error);
        }
      }
    });

    if (options?.failFast) {
      await Promise.all(promises.map(p => p.catch(() => {})));
    } else {
      await Promise.allSettled(promises);
    }

    return {
      results,
      errors,
      completed: results.size,
      failed: errors.size,
      cancelled,
      durationMs: Date.now() - start,
    };
  }

  async gatherContext(
    contextFns: {
      name: string;
      fn: () => Promise<any>;
      timeoutMs: number;
      optional: boolean;
    }[]
  ): Promise<Record<string, any>> {
    const result: Record<string, any> = {};

    const promises = contextFns.map(async (ctx) => {
      try {
        const value = await Promise.race([
          ctx.fn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ctx.timeoutMs)),
        ]);
        result[ctx.name] = value;
      } catch (error) {
        if (!ctx.optional) {
          Logger.debug(`Context gather failed for ${ctx.name}:`, error);
        }
        result[ctx.name] = null;
      }
    });

    await Promise.allSettled(promises);
    return result;
  }

  async executeWithFallback<T>(
    primary: { fn: () => Promise<T>; timeoutMs: number },
    fallback: { fn: () => Promise<T>; timeoutMs: number }
  ): Promise<T> {
    try {
      return await Promise.race([
        primary.fn(),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Primary timeout')), primary.timeoutMs)),
      ]);
    } catch {
      return Promise.race([
        fallback.fn(),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Fallback timeout')), fallback.timeoutMs)),
      ]);
    }
  }

  async executeRace<T>(tasks: { name: string; fn: () => Promise<T> }[]): Promise<{ winner: string; result: T }> {
    const abortControllers = tasks.map(() => new AbortController());

    const racePromises = tasks.map((task, idx) =>
      task.fn().then(result => {
        // Cancel others
        for (let i = 0; i < abortControllers.length; i++) {
          if (i !== idx) abortControllers[i].abort();
        }
        return { winner: task.name, result };
      })
    );

    return Promise.race(racePromises);
  }

  async batchExecute<TIn, TOut>(
    items: TIn[],
    processFn: (batch: TIn[]) => Promise<TOut[]>,
    options?: {
      batchSize?: number;
      maxConcurrent?: number;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<TOut[]> {
    const batchSize = options?.batchSize ?? 20;
    const maxConcurrent = options?.maxConcurrent ?? 2;
    const results: TOut[] = [];
    let completed = 0;

    // Split into batches
    const batches: TIn[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    // Process with concurrency limit
    const semaphore = { active: 0 };
    const batchPromises = batches.map(async (batch, idx) => {
      while (semaphore.active >= maxConcurrent) {
        await new Promise(r => setTimeout(r, 50));
      }
      semaphore.active++;
      try {
        const batchResults = await processFn(batch);
        results.push(...batchResults);
        completed += batch.length;
        options?.onProgress?.(completed, items.length);
      } finally {
        semaphore.active--;
      }
    });

    await Promise.allSettled(batchPromises);
    return results;
  }
}
