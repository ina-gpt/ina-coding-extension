import { EventEmitter } from 'events';
import { ManagedRequest, RequestStatus } from './RequestOptTypes';
import { Logger } from '../../utils/Logger';

export class StaleRequestDetector extends EventEmitter {
  private static instance: StaleRequestDetector;
  private activeRequests: Map<string, { request: ManagedRequest<any>; lastProgressAt: number }> = new Map();
  private checkTimer: NodeJS.Timeout | null = null;

  static getInstance(): StaleRequestDetector {
    if (!StaleRequestDetector.instance) {
      StaleRequestDetector.instance = new StaleRequestDetector();
    }
    return StaleRequestDetector.instance;
  }

  track(request: ManagedRequest<any>): void {
    this.activeRequests.set(request.id, { request, lastProgressAt: Date.now() });
  }

  reportProgress(requestId: string): void {
    const entry = this.activeRequests.get(requestId);
    if (entry) entry.lastProgressAt = Date.now();
  }

  untrack(requestId: string): void {
    this.activeRequests.delete(requestId);
  }

  startMonitoring(checkIntervalMs: number = 5000): void {
    if (this.checkTimer) return;
    this.checkTimer = setInterval(() => this.checkForStale(), checkIntervalMs);
  }

  cancelStale(): number {
    const stale = this.getStaleRequests();
    for (const req of stale) {
      this.cancelRequest(req.id, 'Stale request detected');
    }
    return stale.length;
  }

  getStaleRequests(): ManagedRequest<any>[] {
    const now = Date.now();
    const stale: ManagedRequest<any>[] = [];
    for (const [, entry] of this.activeRequests) {
      const { request, lastProgressAt } = entry;
      if (request.stallDetectionMs && now - lastProgressAt > request.stallDetectionMs) {
        stale.push(request);
      }
    }
    return stale;
  }

  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  private checkForStale(): void {
    const now = Date.now();
    for (const [id, entry] of this.activeRequests) {
      const { request, lastProgressAt } = entry;

      // Stale: no progress for stallDetectionMs
      if (request.stallDetectionMs && request.status === RequestStatus.ACTIVE && now - lastProgressAt > request.stallDetectionMs) {
        Logger.debug(`Stale request detected: ${id} (${request.category})`);
        this.emit('stale_detected', request, 'No progress');
      }

      // Timed out while queued
      if (request.status === RequestStatus.QUEUED && request.timeoutMs && now - request.createdAt > request.timeoutMs) {
        this.cancelRequest(id, 'Timed out while queued');
      }

      // Hung: active but no progress for 2x stallDetectionMs
      if (request.stallDetectionMs && request.status === RequestStatus.ACTIVE && now - lastProgressAt > request.stallDetectionMs * 2) {
        this.cancelRequest(id, 'Request appears hung');
      }
    }
  }

  private cancelRequest(requestId: string, reason: string): void {
    const entry = this.activeRequests.get(requestId);
    if (!entry) return;
    const { request } = entry;
    request.status = RequestStatus.STALE;
    request.abortController.abort();
    request.reject?.(new Error(reason));
    this.activeRequests.delete(requestId);
    this.emit('stale_detected', request, reason);
    Logger.debug(`Cancelled stale request: ${requestId} - ${reason}`);
  }

  dispose(): void {
    this.stopMonitoring();
    this.activeRequests.clear();
    this.removeAllListeners();
  }
}
