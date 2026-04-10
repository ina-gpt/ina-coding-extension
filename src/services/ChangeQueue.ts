import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

// ============ Types ============

export type ChangeType = 'create' | 'change' | 'delete' | 'rename';

export interface FileChange {
  uri: vscode.Uri;
  type: ChangeType;
  timestamp: number;
  oldUri?: vscode.Uri;
  metadata?: { size?: number; language?: string };
}

export interface ChangeQueueOptions {
  debounceMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  priorityExtensions?: string[];
  onFlush?: (changes: FileChange[]) => Promise<void>;
  onError?: (error: Error) => void;
}

export interface QueueStats {
  pending: number;
  processed: number;
  errors: number;
  lastFlush: number | null;
  avgProcessTime: number;
}

// ============ Constants ============

const PRIORITY_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go',
  '.java', '.kt', '.c', '.cpp', '.h', '.cs', '.rb', '.php',
  '.swift', '.vue', '.svelte', '.md',
];

// ============ Change Queue Class ============

export class ChangeQueue implements vscode.Disposable {
  private queue: Map<string, FileChange> = new Map();
  private priorityQueue: Map<string, FileChange> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;
  private options: Required<ChangeQueueOptions>;
  private stats: QueueStats = { pending: 0, processed: 0, errors: 0, lastFlush: null, avgProcessTime: 0 };
  private processTimes: number[] = [];
  private disposed = false;

  private onFlushEmitter = new vscode.EventEmitter<FileChange[]>();
  readonly onFlush = this.onFlushEmitter.event;

  constructor(options: ChangeQueueOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 500,
      maxBatchSize: options.maxBatchSize ?? 100,
      maxQueueSize: options.maxQueueSize ?? 10000,
      priorityExtensions: options.priorityExtensions ?? PRIORITY_EXTENSIONS,
      onFlush: options.onFlush ?? (async () => {}),
      onError: options.onError ?? ((e) => Logger.error('ChangeQueue error:', e)),
    };
  }

  // ============ Queue Operations ============

  enqueue(change: FileChange): void {
    if (this.disposed) { return; }

    const key = change.uri.toString();
    const isPriority = this.isPriorityFile(change.uri.fsPath);

    // Merge with existing
    const existing = this.queue.get(key) || this.priorityQueue.get(key);
    if (existing) {
      const merged = this.mergeChanges(existing, change);
      if (!merged) {
        this.queue.delete(key);
        this.priorityQueue.delete(key);
        this.updatePendingCount();
        return;
      }
      change = merged;
    }

    // Queue size limit
    if (this.queue.size + this.priorityQueue.size >= this.options.maxQueueSize) {
      Logger.warn(`ChangeQueue: Max queue size reached (${this.options.maxQueueSize})`);
      this.flushNow();
    }

    if (isPriority) {
      this.priorityQueue.set(key, change);
      this.queue.delete(key);
    } else {
      this.queue.set(key, change);
    }

    this.updatePendingCount();
    this.scheduleFlush();
  }

  enqueueMany(changes: FileChange[]): void {
    for (const c of changes) { this.enqueue(c); }
  }

  clear(): void {
    this.queue.clear();
    this.priorityQueue.clear();
    this.updatePendingCount();
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
  }

  // ============ Change Merging ============

  private mergeChanges(existing: FileChange, incoming: FileChange): FileChange | null {
    const transitions: Record<ChangeType, Record<ChangeType, ChangeType | null>> = {
      create: { create: 'create', change: 'create', delete: null, rename: 'create' },
      change: { create: 'change', change: 'change', delete: 'delete', rename: 'rename' },
      delete: { create: 'change', change: 'delete', delete: 'delete', rename: 'delete' },
      rename: { create: 'create', change: 'rename', delete: 'delete', rename: 'rename' },
    };

    const resultType = transitions[existing.type][incoming.type];
    if (resultType === null) { return null; }

    return {
      uri: incoming.type === 'rename' ? incoming.uri : existing.uri,
      type: resultType,
      timestamp: incoming.timestamp,
      oldUri: existing.type === 'rename' ? existing.oldUri : incoming.oldUri,
      metadata: { ...existing.metadata, ...incoming.metadata },
    };
  }

  // ============ Flush ============

  private scheduleFlush(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.debounceTimer = setTimeout(() => { this.flushNow(); }, this.options.debounceMs);
  }

  async flushNow(): Promise<void> {
    if (this.flushPromise) { await this.flushPromise; }
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }

    const changes = this.collectBatch();
    if (changes.length === 0) { return; }

    this.flushPromise = this.doFlush(changes);
    await this.flushPromise;
    this.flushPromise = null;
  }

  private collectBatch(): FileChange[] {
    const batch: FileChange[] = [];
    const max = this.options.maxBatchSize;

    for (const [key, change] of this.priorityQueue) {
      if (batch.length >= max) { break; }
      batch.push(change);
      this.priorityQueue.delete(key);
    }
    for (const [key, change] of this.queue) {
      if (batch.length >= max) { break; }
      batch.push(change);
      this.queue.delete(key);
    }

    this.updatePendingCount();
    batch.sort((a, b) => a.timestamp - b.timestamp);
    return batch;
  }

  private async doFlush(changes: FileChange[]): Promise<void> {
    const startTime = Date.now();

    try {
      Logger.debug(`ChangeQueue: Flushing ${changes.length} changes`);
      await this.options.onFlush(changes);
      this.onFlushEmitter.fire(changes);

      this.stats.processed += changes.length;
      this.stats.lastFlush = Date.now();

      const processTime = Date.now() - startTime;
      this.processTimes.push(processTime);
      if (this.processTimes.length > 100) { this.processTimes.shift(); }
      this.stats.avgProcessTime = this.processTimes.reduce((a, b) => a + b, 0) / this.processTimes.length;

    } catch (error) {
      this.stats.errors++;
      this.options.onError(error as Error);

      // Re-queue failed changes
      for (const change of changes) {
        const key = change.uri.toString();
        if (this.isPriorityFile(change.uri.fsPath)) {
          this.priorityQueue.set(key, change);
        } else {
          this.queue.set(key, change);
        }
      }
      this.updatePendingCount();
    }
  }

  // ============ Utilities ============

  private isPriorityFile(filePath: string): boolean {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return this.options.priorityExtensions.includes(ext);
  }

  private updatePendingCount(): void {
    this.stats.pending = this.queue.size + this.priorityQueue.size;
  }

  getStats(): QueueStats { return { ...this.stats }; }
  get size(): number { return this.queue.size + this.priorityQueue.size; }
  get isEmpty(): boolean { return this.queue.size === 0 && this.priorityQueue.size === 0; }

  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    this.queue.clear();
    this.priorityQueue.clear();
    this.onFlushEmitter.dispose();
  }
}

// ============ Factory ============

export function createIndexingQueue(onFlush: (changes: FileChange[]) => Promise<void>): ChangeQueue {
  return new ChangeQueue({
    debounceMs: 500,
    maxBatchSize: 100,
    onFlush,
    onError: (error) => {
      Logger.error('Indexing queue error:', error);
    },
  });
}
