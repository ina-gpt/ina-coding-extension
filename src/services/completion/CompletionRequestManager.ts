import * as vscode from 'vscode';
import { CompletionContext, CompletionRequest, CompletionStatus } from './CompletionTypes';

export class CompletionRequestManager implements vscode.Disposable {
  private activeRequests: Map<string, CompletionRequest> = new Map();
  private requestHistory: Array<{
    id: string;
    status: CompletionStatus;
    duration: number;
    timestamp: number;
  }> = [];
  private maxHistorySize: number = 100;
  private maxConcurrentRequests: number = 1;
  private currentRequest: CompletionRequest | null = null;
  private requestIdCounter: number = 0;

  private readonly onRequestStartEmitter = new vscode.EventEmitter<CompletionRequest>();
  private readonly onRequestCompleteEmitter = new vscode.EventEmitter<{
    requestId: string;
    status: CompletionStatus;
  }>();
  private readonly onRequestCancelEmitter = new vscode.EventEmitter<string>();

  public readonly onRequestStart = this.onRequestStartEmitter.event;
  public readonly onRequestComplete = this.onRequestCompleteEmitter.event;
  public readonly onRequestCancel = this.onRequestCancelEmitter.event;

  createRequest(context: CompletionContext): CompletionRequest {
    // Cancel any existing current request
    this.cancelCurrentRequest();

    this.requestIdCounter++;
    const id = `cr-${this.requestIdCounter}-${Date.now()}`;
    const abortController = new AbortController();

    const request: CompletionRequest = {
      id,
      context,
      timestamp: Date.now(),
      abortController,
    };

    this.activeRequests.set(id, request);
    this.currentRequest = request;
    this.onRequestStartEmitter.fire(request);

    return request;
  }

  cancelRequest(requestId: string): boolean {
    const request = this.activeRequests.get(requestId);
    if (!request) return false;

    request.abortController.abort();
    this.activeRequests.delete(requestId);

    this.requestHistory.push({
      id: requestId,
      status: CompletionStatus.CANCELLED,
      duration: Date.now() - request.timestamp,
      timestamp: Date.now(),
    });
    this.pruneHistory();

    if (this.currentRequest?.id === requestId) {
      this.currentRequest = null;
    }

    this.onRequestCancelEmitter.fire(requestId);
    return true;
  }

  cancelCurrentRequest(): boolean {
    if (!this.currentRequest) return false;
    return this.cancelRequest(this.currentRequest.id);
  }

  cancelAllRequests(): void {
    for (const [id] of this.activeRequests) {
      this.cancelRequest(id);
    }
    this.currentRequest = null;
  }

  completeRequest(requestId: string, status: CompletionStatus): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      this.requestHistory.push({
        id: requestId,
        status,
        duration: Date.now() - request.timestamp,
        timestamp: Date.now(),
      });
      this.pruneHistory();
      this.activeRequests.delete(requestId);

      if (this.currentRequest?.id === requestId) {
        this.currentRequest = null;
      }

      this.onRequestCompleteEmitter.fire({ requestId, status });
    }
  }

  getRequest(requestId: string): CompletionRequest | undefined {
    return this.activeRequests.get(requestId);
  }

  getCurrentRequest(): CompletionRequest | null {
    return this.currentRequest;
  }

  isRequestActive(requestId: string): boolean {
    return this.activeRequests.has(requestId);
  }

  isRequestCancelled(requestId: string): boolean {
    const request = this.activeRequests.get(requestId);
    return request ? request.abortController.signal.aborted : true;
  }

  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  getRequestHistory(limit: number = 20): typeof this.requestHistory {
    return this.requestHistory.slice(-limit);
  }

  getMetrics(): { total: number; completed: number; cancelled: number; avgDuration: number } {
    const total = this.requestHistory.length;
    const completed = this.requestHistory.filter(
      (r) => r.status === CompletionStatus.ACCEPTED || r.status === CompletionStatus.REJECTED
    ).length;
    const cancelled = this.requestHistory.filter(
      (r) => r.status === CompletionStatus.CANCELLED
    ).length;
    const durations = this.requestHistory.map((r) => r.duration);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return { total, completed, cancelled, avgDuration };
  }

  private pruneHistory(): void {
    if (this.requestHistory.length > this.maxHistorySize) {
      this.requestHistory = this.requestHistory.slice(-this.maxHistorySize);
    }
  }

  dispose(): void {
    this.cancelAllRequests();
    this.onRequestStartEmitter.dispose();
    this.onRequestCompleteEmitter.dispose();
    this.onRequestCancelEmitter.dispose();
  }
}
