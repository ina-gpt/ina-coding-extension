/**
 * Phase 11.4 — Token Tracker
 * Tracks token usage across all requests with daily/monthly persistence.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { StatusAggregator } from './StatusAggregator';

const DAILY_KEY = 'inaCoding.tokenTracker.daily';
const MONTHLY_KEY = 'inaCoding.tokenTracker.monthly';
const DATE_KEY = 'inaCoding.tokenTracker.date';

export class TokenTracker extends EventEmitter {
  private static instance: TokenTracker;
  private context: vscode.ExtensionContext | null = null;
  private sessionIn = 0;
  private sessionOut = 0;
  private dailyTokens = 0;
  private monthlyTokens = 0;
  private history: { timestamp: number; in: number; out: number; model: string; category: string }[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): TokenTracker {
    if (!TokenTracker.instance) {
      TokenTracker.instance = new TokenTracker();
    }
    return TokenTracker.instance;
  }

  private constructor() { super(); }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadPersisted();
    this.checkReset();
    Logger.info(`[TokenTracker] Initialized: daily=${this.dailyTokens}, monthly=${this.monthlyTokens}`);
  }

  recordRequest(tokensIn: number, tokensOut: number, model: string, category: string): void {
    this.sessionIn += tokensIn;
    this.sessionOut += tokensOut;
    const total = tokensIn + tokensOut;
    this.dailyTokens += total;
    this.monthlyTokens += total;

    this.history.push({ timestamp: Date.now(), in: tokensIn, out: tokensOut, model, category });
    if (this.history.length > 1000) this.history.shift();

    // Notify aggregator
    StatusAggregator.getInstance().recordTokenUsage(tokensIn, tokensOut);

    this.emit('tokens-recorded', { in: tokensIn, out: tokensOut, total: this.sessionIn + this.sessionOut });
    this.debouncePersist();
  }

  recordContextWindow(used: number, max: number): void {
    StatusAggregator.getInstance().recordContextWindowUsage(used, max);
    const percent = max > 0 ? (used / max) * 100 : 0;
    if (percent > 80) this.emit('context-warning', percent);
  }

  getSessionUsage(): { in: number; out: number; total: number } {
    return { in: this.sessionIn, out: this.sessionOut, total: this.sessionIn + this.sessionOut };
  }

  getDailyUsage(): number { return this.dailyTokens; }
  getMonthlyUsage(): number { return this.monthlyTokens; }

  getHistory(windowMs?: number): typeof this.history {
    if (!windowMs) return [...this.history];
    const cutoff = Date.now() - windowMs;
    return this.history.filter(h => h.timestamp >= cutoff);
  }

  getUsageSummary(): string {
    const s = this.getSessionUsage();
    const parts = [`Session: ${this.fmt(s.total)} tokens (${this.fmt(s.in)} in / ${this.fmt(s.out)} out)`];
    parts.push(`Today: ${this.fmt(this.dailyTokens)}`);
    parts.push(`Month: ${this.fmt(this.monthlyTokens)}`);
    return parts.join(' | ');
  }

  resetSession(): void {
    this.sessionIn = 0;
    this.sessionOut = 0;
    this.history = [];
    StatusAggregator.getInstance().resetSession();
    Logger.info('[TokenTracker] Session reset');
  }

  private fmt(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1000000) return `${Math.round(n / 1000)}K`;
    return `${(n / 1000000).toFixed(1)}M`;
  }

  private debouncePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 5000);
  }

  private persist(): void {
    if (!this.context) return;
    try {
      this.context.globalState.update(DAILY_KEY, this.dailyTokens);
      this.context.globalState.update(MONTHLY_KEY, this.monthlyTokens);
      this.context.globalState.update(DATE_KEY, new Date().toISOString().slice(0, 10));
    } catch {}
  }

  private loadPersisted(): void {
    if (!this.context) return;
    this.dailyTokens = this.context.globalState.get<number>(DAILY_KEY, 0);
    this.monthlyTokens = this.context.globalState.get<number>(MONTHLY_KEY, 0);
  }

  private checkReset(): void {
    if (!this.context) return;
    const savedDate = this.context.globalState.get<string>(DATE_KEY, '');
    const today = new Date().toISOString().slice(0, 10);
    const savedMonth = savedDate.slice(0, 7);
    const thisMonth = today.slice(0, 7);

    if (savedDate !== today) {
      this.dailyTokens = 0;
      Logger.info('[TokenTracker] Daily reset');
    }
    if (savedMonth !== thisMonth) {
      this.monthlyTokens = 0;
      Logger.info('[TokenTracker] Monthly reset');
    }
    this.persist();
  }

  dispose(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persist();
    this.removeAllListeners();
  }
}
