/**
 * Phase 10.4 — Error Recovery Service
 * THE MAIN ORCHESTRATOR — handles errors with retry, fallback, circuit breaker, and self-healing.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ErrorClassifier } from './ErrorClassifier';
import { RetryEngine } from './RetryEngine';
import { CircuitBreakerRegistry } from './CircuitBreakerRegistry';
import { FallbackManager } from './FallbackManager';
import { ErrorAnalyticsEngine } from './ErrorAnalyticsEngine';
import { SelfHealingEngine } from './SelfHealingEngine';
import {
  ClassifiedError, ErrorRecoveryResult, ErrorAction, ErrorCategory,
  RetryConfig, ErrorContext, DEFAULT_RETRY_CONFIGS,
} from './ErrorTypes';

export class ErrorRecoveryService extends EventEmitter {
  private static instance: ErrorRecoveryService;
  private classifier: ErrorClassifier;
  private retryEngine: RetryEngine;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private fallbackManager: FallbackManager;
  private analyticsEngine: ErrorAnalyticsEngine;
  private selfHealingEngine: SelfHealingEngine;

  static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  private constructor() {
    super();
    this.classifier = ErrorClassifier.getInstance();
    this.retryEngine = RetryEngine.getInstance();
    this.circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();
    this.fallbackManager = FallbackManager.getInstance();
    this.analyticsEngine = ErrorAnalyticsEngine.getInstance();
    this.selfHealingEngine = SelfHealingEngine.getInstance();
  }

  async handleError<T>(
    error: any,
    operation: string,
    executeFn: (() => Promise<T>) | null,
    context?: Partial<ErrorContext>
  ): Promise<ErrorRecoveryResult<T>> {
    const classified = this.classifier.classify(error, { ...context, operation });
    this.analyticsEngine.recordError(classified);

    const result: ErrorRecoveryResult<T> = {
      recovered: false, result: null, fallbackUsed: false, fallbackSource: null,
      retried: false, retryAttempts: 0, userNotified: false, queued: false,
      classifiedError: classified,
    };

    switch (classified.suggestedAction) {
      case ErrorAction.RETRY:
        if (executeFn) {
          try {
            const config = DEFAULT_RETRY_CONFIGS[classified.category] || DEFAULT_RETRY_CONFIGS[ErrorCategory.NETWORK];
            const retryResult = await this.retryEngine.executeWithRetry(
              () => executeFn(),
              config,
              { requestId: context?.requestId || undefined, operation }
            );
            result.recovered = true;
            result.result = retryResult;
            result.retried = true;
            this.analyticsEngine.recordRetryResult(true);
            this.emit('recovery', result);
            return result;
          } catch {
            this.analyticsEngine.recordRetryResult(false);
            // Fall through to fallback
          }
        }
        // Fall through to fallback if retry fails
        break;

      case ErrorAction.QUEUE:
        result.queued = true;
        result.userNotified = true;
        this.emit('recovery', result);
        return result;

      case ErrorAction.ABORT:
        result.userNotified = true;
        this.emit('fatal-error', classified);
        return result;

      case ErrorAction.IGNORE:
        return result;

      case ErrorAction.ESCALATE:
        result.userNotified = true;
        return result;

      case ErrorAction.SELF_HEAL:
        try {
          await this.selfHealingEngine.checkAndHeal();
          if (executeFn) {
            const healResult = await executeFn();
            result.recovered = true;
            result.result = healResult;
            this.emit('recovery', result);
            return result;
          }
        } catch { /* self-heal failed, fall through */ }
        break;
    }

    // Try fallback chain
    if (classified.suggestedAction === ErrorAction.FALLBACK || !result.recovered) {
      const chainName = this.getChainName(operation);
      try {
        const fallbackResult = await this.fallbackManager.executeFallbackChain(chainName, classified);
        if (fallbackResult.content && fallbackResult.quality !== 'none') {
          result.recovered = true;
          result.result = fallbackResult as any;
          result.fallbackUsed = true;
          result.fallbackSource = fallbackResult.source;
          this.analyticsEngine.recordFallbackUsage();
          this.emit('recovery', result);
          return result;
        }
      } catch { /* fallback failed */ }
    }

    result.userNotified = true;
    return result;
  }

  async wrapWithRecovery<T>(
    operation: string,
    executeFn: () => Promise<T>,
    options?: { circuitBreakerName?: string; fallbackChain?: string; retryConfig?: Partial<RetryConfig>; context?: Partial<ErrorContext> }
  ): Promise<T> {
    // Check circuit breaker
    if (options?.circuitBreakerName) {
      const cb = this.circuitBreakerRegistry.get(options.circuitBreakerName);
      if (cb) {
        try {
          return await cb.execute(executeFn);
        } catch (error) {
          if (cb.isOpen()) this.analyticsEngine.recordCircuitBreakerTrip();
          const recovery = await this.handleError(error, operation, executeFn, options?.context);
          if (recovery.recovered && recovery.result !== null) return recovery.result as T;
          throw error;
        }
      }
    }

    try {
      return await executeFn();
    } catch (error) {
      const recovery = await this.handleError(error, operation, executeFn, options?.context);
      if (recovery.recovered && recovery.result !== null) return recovery.result as T;
      throw error;
    }
  }

  getHealth() {
    return {
      circuitBreakers: this.circuitBreakerRegistry.getOverallHealth(),
      analytics: this.analyticsEngine.getAnalytics(),
      selfHealActions: this.selfHealingEngine.getActionHistory(),
    };
  }

  getRecommendations(): string[] { return this.analyticsEngine.getRecommendations(); }

  private getChainName(operation: string): string {
    if (/chat|send/i.test(operation)) return 'chat-fallback';
    if (/complet/i.test(operation)) return 'completion-fallback';
    if (/search/i.test(operation)) return 'search-fallback';
    if (/agent/i.test(operation)) return 'agent-fallback';
    return 'chat-fallback';
  }

  dispose(): void {
    this.retryEngine.dispose();
    this.circuitBreakerRegistry.dispose();
    this.fallbackManager.dispose();
    this.analyticsEngine.dispose();
    this.selfHealingEngine.dispose();
    this.removeAllListeners();
  }
}
