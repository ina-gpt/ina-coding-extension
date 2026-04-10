/**
 * Phase 10.3 — Offline Queue
 * Persists requests made while offline for later sync.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { OfflineQueueItem, OfflineRequestType, OFFLINE_CONSTANTS } from './OfflineTypes';

let queueIdCounter = 0;

export class OfflineQueue extends EventEmitter {
  private static instance: OfflineQueue;
  private queue: OfflineQueueItem[] = [];
  private context: vscode.ExtensionContext | null = null;
  private persistenceKey = 'inaCoding.offlineQueue';
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSizeBytes = 0;

  static getInstance(): OfflineQueue {
    if (!OfflineQueue.instance) {
      OfflineQueue.instance = new OfflineQueue();
    }
    return OfflineQueue.instance;
  }

  private constructor() { super(); }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadFromPersistence();
    this.clearExpired();
  }

  enqueue(item: {
    type: OfflineRequestType;
    category: string;
    payload: any;
    priority?: number;
    expiresAt?: number | null;
    maxRetries?: number;
  }): OfflineQueueItem | null {
    if (this.queue.length >= OFFLINE_CONSTANTS.MAX_QUEUE_SIZE) {
      if (!this.evictLowestPriority()) {
        Logger.warn('[OfflineQueue] Queue full, cannot enqueue');
        return null;
      }
    }

    const sizeBytes = this.calculateItemSize(item);
    if (this.currentSizeBytes + sizeBytes > OFFLINE_CONSTANTS.MAX_QUEUE_SIZE_BYTES) {
      while (this.currentSizeBytes + sizeBytes > OFFLINE_CONSTANTS.MAX_QUEUE_SIZE_BYTES && this.queue.length > 0) {
        if (!this.evictLowestPriority()) break;
      }
      if (this.currentSizeBytes + sizeBytes > OFFLINE_CONSTANTS.MAX_QUEUE_SIZE_BYTES) {
        Logger.warn('[OfflineQueue] Queue size limit exceeded');
        return null;
      }
    }

    const queueItem: OfflineQueueItem = {
      id: `oq_${Date.now()}_${++queueIdCounter}`,
      type: item.type,
      category: item.category,
      payload: item.payload,
      createdAt: Date.now(),
      priority: item.priority ?? 5,
      expiresAt: item.expiresAt ?? (Date.now() + OFFLINE_CONSTANTS.QUEUE_EXPIRATION_MS),
      retryCount: 0,
      maxRetries: item.maxRetries ?? 3,
      sizeBytes,
      status: 'queued',
      error: null,
      result: null,
    };

    this.queue.push(queueItem);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.currentSizeBytes += sizeBytes;
    this.schedulePersist();
    this.emit('queue-added', queueItem);
    return queueItem;
  }

  dequeue(count = 1): OfflineQueueItem[] {
    const items = this.queue.filter(i => i.status === 'queued').slice(0, count);
    for (const item of items) { item.status = 'syncing'; }
    this.schedulePersist();
    return items;
  }

  markSynced(itemId: string, result?: any): void {
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return;
    item.status = 'synced';
    item.result = result ?? null;
    this.emit('queue-synced', item);
    // Remove synced items after brief delay
    setTimeout(() => {
      this.queue = this.queue.filter(i => i.id !== itemId);
      this.recalculateSize();
      this.schedulePersist();
    }, 5000);
  }

  markFailed(itemId: string, error: string): void {
    const item = this.queue.find(i => i.id === itemId);
    if (!item) return;
    item.retryCount++;
    item.error = error;
    if (item.retryCount < item.maxRetries) {
      item.status = 'queued';
    } else {
      item.status = 'failed';
    }
    this.emit('queue-failed', item);
    this.schedulePersist();
  }

  getQueue(): OfflineQueueItem[] { return [...this.queue]; }
  getQueueSize(): number { return this.queue.filter(i => i.status === 'queued' || i.status === 'syncing').length; }
  getQueueSizeBytes(): number { return this.currentSizeBytes; }

  removeItem(itemId: string): boolean {
    const idx = this.queue.findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    this.recalculateSize();
    this.schedulePersist();
    return true;
  }

  clearQueue(): void {
    this.queue = [];
    this.currentSizeBytes = 0;
    this.schedulePersist();
  }

  clearExpired(): number {
    const now = Date.now();
    const before = this.queue.length;
    this.queue = this.queue.filter(i => !i.expiresAt || i.expiresAt > now);
    this.recalculateSize();
    if (this.queue.length !== before) this.schedulePersist();
    return before - this.queue.length;
  }

  getItemsByType(type: OfflineRequestType): OfflineQueueItem[] {
    return this.queue.filter(i => i.type === type);
  }

  getItemsByStatus(status: string): OfflineQueueItem[] {
    return this.queue.filter(i => i.status === status);
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 1000);
  }

  private persist(): void {
    if (!this.context) return;
    try {
      // Only persist essential fields, strip large payloads for size
      const slim = this.queue.map(i => ({
        ...i,
        payload: typeof i.payload === 'string' && i.payload.length > 5000
          ? i.payload.slice(0, 5000) + '...[truncated]'
          : i.payload,
      }));
      this.context.globalState.update(this.persistenceKey, JSON.stringify(slim));
    } catch (e) {
      Logger.debug('[OfflineQueue] Persist failed:', e);
    }
  }

  private loadFromPersistence(): void {
    if (!this.context) return;
    try {
      const data = this.context.globalState.get<string>(this.persistenceKey);
      if (data) {
        this.queue = JSON.parse(data);
        this.recalculateSize();
      }
    } catch (e) {
      Logger.debug('[OfflineQueue] Load failed:', e);
      this.queue = [];
    }
  }

  private calculateItemSize(item: any): number {
    try { return JSON.stringify(item).length * 2; }
    catch { return 1000; }
  }

  private recalculateSize(): void {
    this.currentSizeBytes = this.queue.reduce((sum, i) => sum + i.sizeBytes, 0);
  }

  private evictLowestPriority(): boolean {
    // Find lowest priority, oldest item
    let worst = -1;
    let worstPriority = -1;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].status === 'queued' && this.queue[i].priority > worstPriority) {
        worst = i;
        worstPriority = this.queue[i].priority;
      }
    }
    if (worst >= 0) {
      this.queue.splice(worst, 1);
      this.recalculateSize();
      return true;
    }
    return false;
  }

  dispose(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persist();
    this.removeAllListeners();
  }
}
