/**
 * Phase 12.2 — Rate Limit Handler
 * Handles rate limit responses, shows warnings/errors, provides retry info.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { EventEmitter } from 'events';

export class RateLimitHandler extends EventEmitter {
  private static instance: RateLimitHandler | null = null;
  private isRateLimited = false;
  private retryAfterMs: number | null = null;
  private remaining: number | null = null;
  private limit: number | null = null;
  private resetAt: number | null = null;
  private statusBarItem: vscode.StatusBarItem | null = null;

  static getInstance(): RateLimitHandler {
    if (!RateLimitHandler.instance) {
      RateLimitHandler.instance = new RateLimitHandler();
    }
    return RateLimitHandler.instance;
  }

  setStatusBarItem(item: vscode.StatusBarItem): void {
    this.statusBarItem = item;
  }

  handleRateLimitHeaders(headers: Headers): void {
    const remainStr = headers.get('x-ratelimit-remaining');
    const limitStr = headers.get('x-ratelimit-limit');
    const resetStr = headers.get('x-ratelimit-reset');
    const retryStr = headers.get('retry-after');

    if (remainStr) this.remaining = parseInt(remainStr);
    if (limitStr) this.limit = parseInt(limitStr);
    if (resetStr) this.resetAt = parseInt(resetStr) * 1000;

    if (retryStr) {
      this.retryAfterMs = parseInt(retryStr) * 1000;
      this.isRateLimited = true;
      this.emit('rateLimited');
      this.showRateLimitError();

      // Auto-clear after retry period
      setTimeout(() => {
        this.isRateLimited = false;
        this.retryAfterMs = null;
        this.updateStatusBar();
        this.emit('rateLimitCleared');
      }, this.retryAfterMs);
    } else if (this.remaining !== null && this.limit !== null) {
      const threshold = vscode.workspace.getConfiguration('inaCoding.access')
        .get<number>('rateLimitWarningThreshold', 80);
      const usedPercent = ((this.limit - this.remaining) / this.limit) * 100;

      if (usedPercent >= threshold) {
        this.showRateLimitWarning();
      }

      if (this.isRateLimited) {
        this.isRateLimited = false;
        this.emit('rateLimitCleared');
      }
    }

    this.updateStatusBar();
  }

  handleRateLimitError(error: any): { shouldRetry: boolean; retryAfterMs: number } {
    if (error?.status === 429 || error?.message?.includes('429')) {
      const retryAfter = error.headers?.['retry-after']
        ? parseInt(error.headers['retry-after']) * 1000
        : 60000;

      this.isRateLimited = true;
      this.retryAfterMs = retryAfter;
      this.showRateLimitError();

      setTimeout(() => {
        this.isRateLimited = false;
        this.updateStatusBar();
        this.emit('rateLimitCleared');
      }, retryAfter);

      return { shouldRetry: true, retryAfterMs: retryAfter };
    }

    return { shouldRetry: false, retryAfterMs: 0 };
  }

  getRemainingQuota(): { remaining: number; limit: number; resetAt: number } | null {
    if (this.remaining === null || this.limit === null || this.resetAt === null) return null;
    return { remaining: this.remaining, limit: this.limit, resetAt: this.resetAt };
  }

  isCurrentlyLimited(): boolean {
    return this.isRateLimited;
  }

  private showRateLimitWarning(): void {
    const showWarnings = vscode.workspace.getConfiguration('inaCoding.access')
      .get<boolean>('showRateLimitWarnings', true);
    if (!showWarnings) return;

    const resetIn = this.resetAt ? Math.ceil((this.resetAt - Date.now()) / 1000) : '?';
    vscode.window.showWarningMessage(
      `INA Coding: Approaching rate limit. ${this.remaining}/${this.limit} requests remaining. Resets in ${resetIn}s.`
    );
  }

  private showRateLimitError(): void {
    const retrySeconds = this.retryAfterMs ? Math.ceil(this.retryAfterMs / 1000) : 60;
    vscode.window.showErrorMessage(
      `INA Coding: Rate limit exceeded. Please wait ${retrySeconds}s before trying again.`
    );
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem) return;

    if (this.isRateLimited) {
      this.statusBarItem.text = '$(warning) Rate Limited';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBarItem.show();
    } else if (this.remaining !== null && this.limit !== null) {
      const pct = Math.round((this.remaining / this.limit) * 100);
      if (pct < 20) {
        this.statusBarItem.text = `$(pulse) ${this.remaining}/${this.limit}`;
        this.statusBarItem.show();
      } else {
        this.statusBarItem.hide();
      }
    } else {
      this.statusBarItem.hide();
    }
  }
}
