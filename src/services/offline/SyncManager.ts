/**
 * Phase 10.3 — Sync Manager
 * Syncs queued offline requests when connection is restored.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { OfflineQueue } from './OfflineQueue';
import { ConnectivityMonitor } from './ConnectivityMonitor';
import { SyncProgress, OfflineRequestType, OFFLINE_CONSTANTS } from './OfflineTypes';

export class SyncManager extends EventEmitter {
  private static instance: SyncManager;
  private offlineQueue: OfflineQueue;
  private connectivityMonitor: ConnectivityMonitor;
  private isSyncing = false;
  private syncProgress: SyncProgress | null = null;
  private cancelRequested = false;

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  private constructor() {
    super();
    this.offlineQueue = OfflineQueue.getInstance();
    this.connectivityMonitor = ConnectivityMonitor.getInstance();

    // Auto-sync on reconnect
    this.connectivityMonitor.on('reconnected', () => {
      setTimeout(() => {
        if (this.offlineQueue.getQueueSize() > 0) {
          Logger.info('[Sync] Auto-syncing after reconnect');
          this.startSync().catch(e => Logger.debug('[Sync] Auto-sync failed:', e));
        }
      }, OFFLINE_CONSTANTS.SYNC_DELAY_AFTER_RECONNECT_MS);
    });
  }

  async startSync(): Promise<SyncProgress> {
    if (this.isSyncing) return this.syncProgress!;
    if (this.connectivityMonitor.isOffline()) {
      throw new Error('Cannot sync while offline');
    }

    this.isSyncing = true;
    this.cancelRequested = false;
    const queuedItems = this.offlineQueue.getQueue().filter(i => i.status === 'queued');
    this.syncProgress = {
      total: queuedItems.length,
      synced: 0,
      failed: 0,
      remaining: queuedItems.length,
      currentItem: null,
      startedAt: Date.now(),
      estimatedRemainingMs: null,
      errors: [],
    };
    this.emit('sync-started', this.syncProgress);

    try {
      for (let i = 0; i < queuedItems.length; i += OFFLINE_CONSTANTS.SYNC_BATCH_SIZE) {
        if (this.cancelRequested || this.connectivityMonitor.isOffline()) break;

        const batch = queuedItems.slice(i, i + OFFLINE_CONSTANTS.SYNC_BATCH_SIZE);
        for (const item of batch) {
          if (this.cancelRequested) break;
          this.syncProgress.currentItem = item.type;

          try {
            const result = await this.syncItem(item);
            if (result.success) {
              this.offlineQueue.markSynced(item.id, result.result);
              this.syncProgress.synced++;
            } else {
              this.offlineQueue.markFailed(item.id, result.error || 'Unknown error');
              this.syncProgress.failed++;
              this.syncProgress.errors.push(result.error || 'Unknown');
            }
          } catch (e: any) {
            this.offlineQueue.markFailed(item.id, e?.message || 'Sync error');
            this.syncProgress.failed++;
            this.syncProgress.errors.push(e?.message || 'Error');
          }

          this.syncProgress.remaining = queuedItems.length - this.syncProgress.synced - this.syncProgress.failed;
          const elapsed = Date.now() - this.syncProgress.startedAt;
          const done = this.syncProgress.synced + this.syncProgress.failed;
          if (done > 0) {
            this.syncProgress.estimatedRemainingMs = (elapsed / done) * this.syncProgress.remaining;
          }
          this.emit('sync-progress', { ...this.syncProgress });
        }

        // Brief delay between batches
        if (i + OFFLINE_CONSTANTS.SYNC_BATCH_SIZE < queuedItems.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } finally {
      this.isSyncing = false;
      this.syncProgress.currentItem = null;
      this.emit('sync-complete', { ...this.syncProgress });
    }

    return this.syncProgress;
  }

  cancelSync(): void {
    this.cancelRequested = true;
  }

  getSyncProgress(): SyncProgress | null {
    return this.syncProgress ? { ...this.syncProgress } : null;
  }

  async retryFailed(): Promise<SyncProgress> {
    const failed = this.offlineQueue.getItemsByStatus('failed');
    for (const item of failed) {
      item.status = 'queued';
      item.retryCount = 0;
      item.error = null;
    }
    return this.startSync();
  }

  private async syncItem(item: { id: string; type: OfflineRequestType; payload: any }): Promise<{ success: boolean; result?: any; error?: string }> {
    const baseUrl = ConfigManager.getApiEndpoint();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      let url = '';
      let body: any = item.payload;

      switch (item.type) {
        case OfflineRequestType.MEMORY_CREATE:
          url = `${baseUrl}/api/memory`;
          break;
        case OfflineRequestType.MEMORY_EXTRACT:
          url = `${baseUrl}/api/memory/extract`;
          break;
        case OfflineRequestType.INDEX_UPDATE:
          url = `${baseUrl}/api/index/chunks`;
          break;
        case OfflineRequestType.FEEDBACK:
          url = `${baseUrl}/api/memory/feedback`;
          break;
        case OfflineRequestType.DOC_CRAWL:
          url = `${baseUrl}/api/docs/crawl`;
          break;
        case OfflineRequestType.ANALYTICS:
        case OfflineRequestType.CHAT:
          return { success: true }; // Skip non-syncable types
        default:
          return { success: true };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const result = await response.json().catch(() => ({}));
      return { success: true, result };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Sync failed' };
    } finally {
      clearTimeout(timeout);
    }
  }

  dispose(): void { this.removeAllListeners(); }
}
