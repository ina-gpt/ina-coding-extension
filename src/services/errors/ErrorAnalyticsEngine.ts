/**
 * Phase 10.4 — Error Analytics Engine
 * Tracks, analyzes, and reports error patterns.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ClassifiedError, ErrorReport, UserFeedback, ErrorAnalytics, ERROR_CONSTANTS } from './ErrorTypes';

export class ErrorAnalyticsEngine extends EventEmitter {
  private static instance: ErrorAnalyticsEngine;
  private errorHistory: ClassifiedError[] = [];
  private errorReports = new Map<string, ErrorReport>();
  private feedbackHistory: UserFeedback[] = [];
  private context: vscode.ExtensionContext | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private retrySuccesses = 0;
  private retryAttempts = 0;
  private fallbackUsages = 0;
  private circuitBreakerTrips = 0;

  static getInstance(): ErrorAnalyticsEngine {
    if (!ErrorAnalyticsEngine.instance) { ErrorAnalyticsEngine.instance = new ErrorAnalyticsEngine(); }
    return ErrorAnalyticsEngine.instance;
  }

  private constructor() { super(); }

  initialize(ctx: vscode.ExtensionContext): void {
    this.context = ctx;
    this.loadFromGlobalState();
  }

  recordError(error: ClassifiedError): void {
    this.errorHistory.push(error);
    if (this.errorHistory.length > ERROR_CONSTANTS.MAX_ERROR_HISTORY) this.errorHistory.shift();

    const existing = this.errorReports.get(error.fingerprint);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = error.timestamp;
      existing.error = error;
    } else {
      this.errorReports.set(error.fingerprint, {
        id: error.fingerprint,
        error,
        userFeedback: null,
        resolved: false,
        resolvedAt: null,
        resolution: null,
        occurrences: 1,
        firstSeen: error.timestamp,
        lastSeen: error.timestamp,
      });
    }

    if (this.detectSpike(error.fingerprint)) {
      this.emit('error-spike', error.fingerprint, this.errorReports.get(error.fingerprint)?.occurrences || 0);
    }

    this.schedulePersist();
  }

  recordFeedback(feedback: UserFeedback): void {
    this.feedbackHistory.push(feedback);
    const report = this.errorReports.get(feedback.errorId);
    if (report) report.userFeedback = feedback;
    this.schedulePersist();
  }

  recordRetryResult(success: boolean): void {
    this.retryAttempts++;
    if (success) this.retrySuccesses++;
  }

  recordFallbackUsage(): void { this.fallbackUsages++; }
  recordCircuitBreakerTrip(): void { this.circuitBreakerTrips++; }

  getAnalytics(windowMs = ERROR_CONSTANTS.ERROR_ANALYTICS_WINDOW_MS): ErrorAnalytics {
    const cutoff = Date.now() - windowMs;
    const recent = this.errorHistory.filter(e => e.timestamp > cutoff);
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const e of recent) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
    }

    const minuteWindow = Math.max(1, windowMs / 60000);
    const topErrors = Array.from(this.errorReports.values())
      .filter(r => r.lastSeen > cutoff)
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10)
      .map(r => ({ fingerprint: r.id, message: r.error.userMessage, count: r.occurrences, lastSeen: r.lastSeen }));

    const helpfulFeedback = this.feedbackHistory.filter(f => f.rating === 'helpful').length;
    const totalFeedback = this.feedbackHistory.length;
    const satisfaction = totalFeedback > 0 ? helpfulFeedback / totalFeedback : 0;

    const previousWindow = this.errorHistory.filter(e => e.timestamp > cutoff - windowMs && e.timestamp <= cutoff).length;
    const trend = this.calculateTrend(recent.length, previousWindow);

    return {
      totalErrors: recent.length,
      errorsByCategory: byCategory,
      errorsBySeverity: bySeverity,
      errorRate: recent.length / minuteWindow,
      topErrors,
      meanTimeToRecovery: null,
      retrySuccessRate: this.retryAttempts > 0 ? this.retrySuccesses / this.retryAttempts : 0,
      fallbackUsageRate: this.fallbackUsages,
      circuitBreakerTrips: this.circuitBreakerTrips,
      userFeedbackCount: totalFeedback,
      feedbackSatisfaction: satisfaction,
      trendDirection: trend,
    };
  }

  getRecommendations(): string[] {
    const a = this.getAnalytics();
    const recs: string[] = [];
    if ((a.errorsByCategory['network'] || 0) > 5) recs.push('Network errors are high — check server connectivity');
    if ((a.errorsByCategory['gpu'] || 0) > 2) recs.push('GPU errors occurring — consider reducing context size');
    if ((a.errorsByCategory['rate_limit'] || 0) > 3) recs.push('Rate limit errors increasing — enable request batching');
    if ((a.errorsByCategory['auth'] || 0) > 0) recs.push('Auth errors detected — token may be expired');
    if ((a.errorsByCategory['timeout'] || 0) > 5) recs.push('Timeout rate is high — consider increasing timeout');
    if (a.retrySuccessRate < 0.5 && this.retryAttempts > 5) recs.push('Retry success rate is low — server may be down');
    if (a.circuitBreakerTrips > 3) recs.push('Multiple circuit breaker trips — services degraded');
    return recs;
  }

  clearHistory(): void {
    this.errorHistory = [];
    this.errorReports.clear();
    this.feedbackHistory = [];
    this.retrySuccesses = 0;
    this.retryAttempts = 0;
    this.fallbackUsages = 0;
    this.circuitBreakerTrips = 0;
    this.schedulePersist();
  }

  private detectSpike(fingerprint: string): boolean {
    const recent = this.errorHistory.filter(e => e.fingerprint === fingerprint && e.timestamp > Date.now() - 60000);
    return recent.length >= 5;
  }

  private calculateTrend(current: number, previous: number): 'improving' | 'stable' | 'worsening' {
    if (previous === 0 && current === 0) return 'stable';
    if (previous === 0) return 'worsening';
    const ratio = current / previous;
    if (ratio < 0.7) return 'improving';
    if (ratio > 1.3) return 'worsening';
    return 'stable';
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistToGlobalState(), 5000);
  }

  private persistToGlobalState(): void {
    if (!this.context) return;
    try {
      const data = {
        reports: Array.from(this.errorReports.entries()).slice(0, 100),
        feedback: this.feedbackHistory.slice(-50),
        counters: { retrySuccesses: this.retrySuccesses, retryAttempts: this.retryAttempts, fallbackUsages: this.fallbackUsages, circuitBreakerTrips: this.circuitBreakerTrips },
      };
      this.context.globalState.update('inaCoding.errorAnalytics', JSON.stringify(data));
    } catch { /* ignore persist errors */ }
  }

  private loadFromGlobalState(): void {
    if (!this.context) return;
    try {
      const raw = this.context.globalState.get<string>('inaCoding.errorAnalytics');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.reports) for (const [k, v] of data.reports) this.errorReports.set(k, v as ErrorReport);
        if (data.feedback) this.feedbackHistory = data.feedback;
        if (data.counters) Object.assign(this, data.counters);
      }
    } catch { /* ignore load errors */ }
  }

  dispose(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistToGlobalState();
    this.removeAllListeners();
  }
}
