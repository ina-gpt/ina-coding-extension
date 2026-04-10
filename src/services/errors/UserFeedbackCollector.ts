/**
 * Phase 10.4 — User Feedback Collector
 * Collects user feedback on errors and AI responses.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ErrorAnalyticsEngine } from './ErrorAnalyticsEngine';
import { ClassifiedError, UserFeedback } from './ErrorTypes';

export class UserFeedbackCollector extends EventEmitter {
  private static instance: UserFeedbackCollector;
  private analyticsEngine: ErrorAnalyticsEngine;

  static getInstance(): UserFeedbackCollector {
    if (!UserFeedbackCollector.instance) { UserFeedbackCollector.instance = new UserFeedbackCollector(); }
    return UserFeedbackCollector.instance;
  }

  private constructor() {
    super();
    this.analyticsEngine = ErrorAnalyticsEngine.getInstance();
  }

  submitFeedback(feedback: UserFeedback): void {
    this.analyticsEngine.recordFeedback(feedback);
    this.emit('feedback-received', feedback);
    Logger.info(`[Feedback] Received: ${feedback.rating} for ${feedback.errorId}`);
  }

  submitResponseFeedback(messageId: string, rating: 'good' | 'bad', comment?: string): void {
    const feedback: UserFeedback = {
      errorId: messageId,
      rating: rating === 'good' ? 'helpful' : 'not_helpful',
      comment: comment || null,
      expectedBehavior: null,
      timestamp: Date.now(),
      context: 'response_quality',
    };
    this.analyticsEngine.recordFeedback(feedback);
    this.emit('feedback-received', feedback);
  }

  async collectBugReport(errorId: string): Promise<string> {
    const analytics = this.analyticsEngine.getAnalytics();
    const recs = this.analyticsEngine.getRecommendations();
    const report = [
      '# INA Coding Bug Report',
      '',
      `**Error ID:** ${errorId}`,
      `**Date:** ${new Date().toISOString()}`,
      `**VS Code:** ${vscode.version}`,
      `**Extension:** ina-coding@1.0.0`,
      `**OS:** ${process.platform} ${process.arch}`,
      '',
      '## Error Analytics (Last Hour)',
      `- Total errors: ${analytics.totalErrors}`,
      `- Error rate: ${analytics.errorRate.toFixed(2)}/min`,
      `- Retry success rate: ${(analytics.retrySuccessRate * 100).toFixed(0)}%`,
      `- Circuit breaker trips: ${analytics.circuitBreakerTrips}`,
      '',
      '## Top Errors',
      ...analytics.topErrors.slice(0, 5).map(e => `- ${e.message} (${e.count}x)`),
      '',
      '## Recommendations',
      ...recs.map(r => `- ${r}`),
      '',
      '---',
      '*This report does not contain your code or personal data.*',
    ].join('\n');

    return report;
  }

  getFeedbackStats() {
    const analytics = this.analyticsEngine.getAnalytics();
    return {
      total: analytics.userFeedbackCount,
      satisfactionRate: analytics.feedbackSatisfaction,
    };
  }

  dispose(): void { this.removeAllListeners(); }
}
