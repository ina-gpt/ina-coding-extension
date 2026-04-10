import * as vscode from 'vscode';
import { RequestScheduler } from '../requestopt/RequestScheduler';
import { RequestCategory } from '../requestopt/RequestOptTypes';

export class CompletionDebouncer implements vscode.Disposable {
  private pendingRequest: {
    timer: ReturnType<typeof setTimeout>;
    abortController: AbortController;
    requestId: string;
  } | null = null;

  private debounceMs: number;
  private minCharsSinceLastCompletion: number = 2;
  private lastCompletionPosition: vscode.Position | null = null;
  private lastCompletionTime: number = 0;
  private requestIdCounter: number = 0;

  private readonly onCancelledEmitter = new vscode.EventEmitter<string>();
  public readonly onCancelled: vscode.Event<string> = this.onCancelledEmitter.event;

  constructor(debounceMs: number = 300) {
    this.debounceMs = debounceMs;
  }

  debounce<T>(fn: () => Promise<T>, requestId?: string): Promise<T | null> {
    this.cancelPending();

    const id = requestId || this.generateRequestId();
    const abortController = new AbortController();

    return new Promise<T | null>((resolve) => {
      const timer = setTimeout(async () => {
        if (abortController.signal.aborted) {
          resolve(null);
          return;
        }

        this.pendingRequest = null;

        try {
          const result = await fn();
          if (abortController.signal.aborted) {
            resolve(null);
          } else {
            resolve(result);
          }
        } catch (error) {
          if (abortController.signal.aborted) {
            resolve(null);
          } else {
            throw error;
          }
        }
      }, this.debounceMs);

      this.pendingRequest = { timer, abortController, requestId: id };
    });
  }

  cancelPending(): void {
    if (this.pendingRequest) {
      clearTimeout(this.pendingRequest.timer);
      this.pendingRequest.abortController.abort();
      this.onCancelledEmitter.fire(this.pendingRequest.requestId);
      this.pendingRequest = null;
    }
    // Also cancel any in-flight completions in the scheduler
    try {
      RequestScheduler.getInstance().cancelByCategory(RequestCategory.COMPLETION);
    } catch { /* scheduler may not be initialized yet */ }
  }

  cancelAll(): void {
    this.cancelPending();
    this.lastCompletionPosition = null;
    this.lastCompletionTime = 0;
  }

  shouldTrigger(position: vscode.Position, document: vscode.TextDocument): boolean {
    const now = Date.now();

    // Minimum time between completions
    if (now - this.lastCompletionTime < 100) {
      return false;
    }

    // Minimum chars since last completion
    if (this.lastCompletionPosition) {
      if (position.line === this.lastCompletionPosition.line) {
        const charDiff = Math.abs(position.character - this.lastCompletionPosition.character);
        if (charDiff < this.minCharsSinceLastCompletion) {
          return false;
        }
      }
    }

    return true;
  }

  recordCompletion(position: vscode.Position): void {
    this.lastCompletionPosition = position;
    this.lastCompletionTime = Date.now();
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }

  getDebounceMs(): number {
    return this.debounceMs;
  }

  isPending(): boolean {
    return this.pendingRequest !== null;
  }

  getPendingRequestId(): string | null {
    return this.pendingRequest?.requestId ?? null;
  }

  generateRequestId(): string {
    this.requestIdCounter++;
    return `cr-${this.requestIdCounter}-${Date.now()}`;
  }

  dispose(): void {
    this.cancelAll();
    this.onCancelledEmitter.dispose();
  }
}
