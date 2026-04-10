import { ManagedRequest, RequestPriority, RequestCategory, RequestStatus } from './RequestOptTypes';

export class PriorityQueue<T extends ManagedRequest<any>> {
  private queues: Map<RequestPriority, T[]> = new Map();
  private _size: number = 0;
  private maxSize: number;
  private ageBoostTimer: NodeJS.Timeout | null = null;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    for (const p of [RequestPriority.CRITICAL, RequestPriority.HIGH, RequestPriority.NORMAL, RequestPriority.LOW, RequestPriority.BACKGROUND]) {
      this.queues.set(p, []);
    }
  }

  enqueue(request: T): boolean {
    if (this._size >= this.maxSize) {
      // Try evicting lowest priority
      for (const p of [RequestPriority.BACKGROUND, RequestPriority.LOW, RequestPriority.NORMAL]) {
        const q = this.queues.get(p)!;
        if (q.length > 0 && p > request.priority) {
          const evicted = q.shift()!;
          evicted.status = RequestStatus.CANCELLED;
          evicted.reject?.(new Error('Evicted from queue'));
          this._size--;
          break;
        }
      }
      if (this._size >= this.maxSize) return false;
    }

    const q = this.queues.get(request.priority);
    if (!q) return false;
    q.push(request);
    this._size++;
    return true;
  }

  dequeue(): T | null {
    for (const p of [RequestPriority.CRITICAL, RequestPriority.HIGH, RequestPriority.NORMAL, RequestPriority.LOW, RequestPriority.BACKGROUND]) {
      const q = this.queues.get(p)!;
      if (q.length > 0) {
        this._size--;
        return q.shift()!;
      }
    }
    return null;
  }

  peek(): T | null {
    for (const p of [RequestPriority.CRITICAL, RequestPriority.HIGH, RequestPriority.NORMAL, RequestPriority.LOW, RequestPriority.BACKGROUND]) {
      const q = this.queues.get(p)!;
      if (q.length > 0) return q[0];
    }
    return null;
  }

  remove(requestId: string): T | null {
    for (const q of this.queues.values()) {
      const idx = q.findIndex(r => r.id === requestId);
      if (idx >= 0) {
        const [item] = q.splice(idx, 1);
        this._size--;
        return item;
      }
    }
    return null;
  }

  getByCategory(category: RequestCategory): T[] {
    const result: T[] = [];
    for (const q of this.queues.values()) {
      for (const r of q) {
        if (r.category === category) result.push(r);
      }
    }
    return result;
  }

  getByDeduplicationKey(key: string): T | null {
    for (const q of this.queues.values()) {
      for (const r of q) {
        if (r.deduplicationKey === key) return r;
      }
    }
    return null;
  }

  cancelByCategory(category: RequestCategory): number {
    let count = 0;
    for (const q of this.queues.values()) {
      for (let i = q.length - 1; i >= 0; i--) {
        if (q[i].category === category) {
          const r = q.splice(i, 1)[0];
          r.status = RequestStatus.CANCELLED;
          r.abortController.abort();
          r.reject?.(new Error('Cancelled'));
          this._size--;
          count++;
        }
      }
    }
    return count;
  }

  cancelStale(maxAgeMs: number): number {
    const now = Date.now();
    let count = 0;
    for (const q of this.queues.values()) {
      for (let i = q.length - 1; i >= 0; i--) {
        if (now - q[i].createdAt > maxAgeMs) {
          const r = q.splice(i, 1)[0];
          r.status = RequestStatus.STALE;
          r.abortController.abort();
          r.reject?.(new Error('Stale'));
          this._size--;
          count++;
        }
      }
    }
    return count;
  }

  boostAgedRequests(ageThresholdMs: number): number {
    const now = Date.now();
    let count = 0;
    for (const p of [RequestPriority.BACKGROUND, RequestPriority.LOW, RequestPriority.NORMAL]) {
      const q = this.queues.get(p)!;
      for (let i = q.length - 1; i >= 0; i--) {
        if (now - q[i].createdAt > ageThresholdMs && p > RequestPriority.CRITICAL) {
          const r = q.splice(i, 1)[0];
          r.priority = p - 1;
          this.queues.get(r.priority)!.push(r);
          count++;
        }
      }
    }
    return count;
  }

  startAgeBoost(intervalMs: number = 10000): void {
    if (this.ageBoostTimer) return;
    this.ageBoostTimer = setInterval(() => this.boostAgedRequests(intervalMs), intervalMs);
  }

  get size(): number { return this._size; }
  isEmpty(): boolean { return this._size === 0; }

  getSizeByPriority(): Record<number, number> {
    const result: Record<number, number> = {};
    for (const [p, q] of this.queues) result[p] = q.length;
    return result;
  }

  clear(): void {
    for (const q of this.queues.values()) {
      for (const r of q) {
        r.status = RequestStatus.CANCELLED;
        r.abortController.abort();
        r.reject?.(new Error('Queue cleared'));
      }
      q.length = 0;
    }
    this._size = 0;
  }

  toArray(): T[] {
    const result: T[] = [];
    for (const p of [RequestPriority.CRITICAL, RequestPriority.HIGH, RequestPriority.NORMAL, RequestPriority.LOW, RequestPriority.BACKGROUND]) {
      result.push(...this.queues.get(p)!);
    }
    return result;
  }

  dispose(): void {
    if (this.ageBoostTimer) clearInterval(this.ageBoostTimer);
    this.clear();
  }
}
