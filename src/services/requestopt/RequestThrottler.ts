import { RequestCategory, DEFAULT_THROTTLES } from './RequestOptTypes';

interface WindowState {
  timestamps: number[];
  maxPerSecond: number;
  maxPerMinute: number;
  burstAllowance: number;
  throttledCount: number;
}

export class RequestThrottler {
  private static instance: RequestThrottler;
  private windows: Map<string, WindowState> = new Map();

  static getInstance(): RequestThrottler {
    if (!RequestThrottler.instance) {
      RequestThrottler.instance = new RequestThrottler();
    }
    return RequestThrottler.instance;
  }

  private constructor() {
    for (const [cat, config] of Object.entries(DEFAULT_THROTTLES)) {
      if (config) {
        this.windows.set(cat, {
          timestamps: [],
          maxPerSecond: config.maxPerSecond,
          maxPerMinute: config.maxPerMinute,
          burstAllowance: config.burstAllowance,
          throttledCount: 0,
        });
      }
    }
  }

  async acquire(category: RequestCategory): Promise<void> {
    const win = this.windows.get(category);
    if (!win) return; // no throttle config for this category

    this.pruneWindow(win);

    const now = Date.now();
    const lastSecond = win.timestamps.filter(t => now - t < 1000).length;
    const lastMinute = win.timestamps.length;

    if (lastSecond >= win.maxPerSecond + win.burstAllowance || lastMinute >= win.maxPerMinute) {
      win.throttledCount++;
      const waitMs = this.calculateWait(win, now);
      if (waitMs > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, waitMs));
      }
    }

    win.timestamps.push(Date.now());
  }

  isThrottled(category: RequestCategory): boolean {
    const win = this.windows.get(category);
    if (!win) return false;
    this.pruneWindow(win);
    const now = Date.now();
    const lastSecond = win.timestamps.filter(t => now - t < 1000).length;
    return lastSecond >= win.maxPerSecond + win.burstAllowance;
  }

  getWaitTimeMs(category: RequestCategory): number {
    const win = this.windows.get(category);
    if (!win) return 0;
    this.pruneWindow(win);
    return this.calculateWait(win, Date.now());
  }

  getStats(): Record<string, { requestsInWindow: number; limit: number; throttled: number }> {
    const result: Record<string, any> = {};
    for (const [cat, win] of this.windows) {
      this.pruneWindow(win);
      result[cat] = {
        requestsInWindow: win.timestamps.length,
        limit: win.maxPerMinute,
        throttled: win.throttledCount,
      };
    }
    return result;
  }

  private pruneWindow(win: WindowState): void {
    const cutoff = Date.now() - 60000;
    win.timestamps = win.timestamps.filter(t => t > cutoff);
  }

  private calculateWait(win: WindowState, now: number): number {
    const lastSecond = win.timestamps.filter(t => now - t < 1000);
    if (lastSecond.length >= win.maxPerSecond) {
      const oldest = Math.min(...lastSecond);
      return Math.max(0, 1000 - (now - oldest) + 50);
    }
    return 0;
  }
}
