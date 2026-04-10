import { ManagedRequest, RequestCategory } from './RequestOptTypes';

export class RequestDeduplicator {
  private static instance: RequestDeduplicator;
  private inflight: Map<string, { request: ManagedRequest<any>; subscribers: { resolve: Function; reject: Function }[] }> = new Map();

  static getInstance(): RequestDeduplicator {
    if (!RequestDeduplicator.instance) {
      RequestDeduplicator.instance = new RequestDeduplicator();
    }
    return RequestDeduplicator.instance;
  }

  getDeduplicationKey(category: RequestCategory, params: any): string {
    try {
      const raw = typeof params === 'string' ? params : JSON.stringify(params);
      return category + ':' + this.djb2(raw);
    } catch {
      return category + ':' + Date.now();
    }
  }

  checkDuplicate(key: string): ManagedRequest<any> | null {
    const entry = this.inflight.get(key);
    return entry ? entry.request : null;
  }

  registerInflight(key: string, request: ManagedRequest<any>): void {
    this.inflight.set(key, { request, subscribers: [] });
  }

  subscribe<T>(key: string, resolve: (v: T) => void, reject: (e: any) => void): boolean {
    const entry = this.inflight.get(key);
    if (!entry) return false;
    entry.subscribers.push({ resolve, reject });
    return true;
  }

  resolveInflight(key: string, result: any): void {
    const entry = this.inflight.get(key);
    if (!entry) return;
    for (const sub of entry.subscribers) {
      try { sub.resolve(result); } catch {}
    }
    this.inflight.delete(key);
  }

  rejectInflight(key: string, error: any): void {
    const entry = this.inflight.get(key);
    if (!entry) return;
    for (const sub of entry.subscribers) {
      try { sub.reject(error); } catch {}
    }
    this.inflight.delete(key);
  }

  removeInflight(key: string): void {
    this.inflight.delete(key);
  }

  getInflightCount(): number {
    return this.inflight.size;
  }

  getInflightByCategory(category: RequestCategory): number {
    let count = 0;
    for (const entry of this.inflight.values()) {
      if (entry.request.category === category) count++;
    }
    return count;
  }

  private djb2(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
