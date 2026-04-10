/**
 * Phase 10.4 — Circuit Breaker
 * Prevents cascading failures with open/closed/half-open state machine.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { CircuitBreakerConfig, CircuitBreakerState, ERROR_CONSTANTS } from './ErrorTypes';

export class CircuitBreaker extends EventEmitter {
  private state = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange = Date.now();
  private halfOpenRequests = 0;
  private config: CircuitBreakerConfig;
  private name: string;
  private recentResults: { success: boolean; timestamp: number }[] = [];

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    super();
    this.name = name;
    this.config = {
      failureThreshold: config?.failureThreshold ?? ERROR_CONSTANTS.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      resetTimeoutMs: config?.resetTimeoutMs ?? ERROR_CONSTANTS.CIRCUIT_BREAKER_RESET_TIMEOUT,
      halfOpenMaxRequests: config?.halfOpenMaxRequests ?? 2,
      monitorWindowMs: config?.monitorWindowMs ?? 60000,
      failureRateThreshold: config?.failureRateThreshold ?? 0.5,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - (this.lastFailureTime || 0) < this.config.resetTimeoutMs) {
        const remaining = Math.ceil((this.config.resetTimeoutMs - (Date.now() - (this.lastFailureTime || 0))) / 1000);
        throw new Error(`Service ${this.name} temporarily unavailable (circuit breaker open). Retry in ${remaining}s.`);
      }
      this.transitionTo(CircuitBreakerState.HALF_OPEN);
    }

    if (this.state === CircuitBreakerState.HALF_OPEN && this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
      throw new Error(`Service ${this.name} testing recovery (circuit half-open).`);
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) this.halfOpenRequests++;

    try {
      const result = await fn();
      this.recordResult(true);
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.successCount++;
        if (this.successCount >= this.config.halfOpenMaxRequests) {
          this.transitionTo(CircuitBreakerState.CLOSED);
        }
      } else {
        this.failureCount = 0;
      }
      return result;
    } catch (error) {
      this.recordResult(false);
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.transitionTo(CircuitBreakerState.OPEN);
      } else if (this.failureCount >= this.config.failureThreshold || this.getFailureRate() >= this.config.failureRateThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
      }
      throw error;
    }
  }

  getState(): CircuitBreakerState { return this.state; }
  isOpen(): boolean { return this.state === CircuitBreakerState.OPEN; }
  isClosed(): boolean { return this.state === CircuitBreakerState.CLOSED; }
  getName(): string { return this.name; }

  reset(): void { this.transitionTo(CircuitBreakerState.CLOSED); this.failureCount = 0; this.successCount = 0; }
  trip(): void { this.transitionTo(CircuitBreakerState.OPEN); }

  getStats() {
    return { state: this.state, failures: this.failureCount, successes: this.successCount, lastFailure: this.lastFailureTime, timeInState: Date.now() - this.lastStateChange, failureRate: this.getFailureRate() };
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const old = this.state;
    if (old === newState) return;
    this.state = newState;
    this.lastStateChange = Date.now();
    if (newState === CircuitBreakerState.HALF_OPEN) { this.halfOpenRequests = 0; this.successCount = 0; }
    if (newState === CircuitBreakerState.CLOSED) { this.failureCount = 0; this.successCount = 0; }
    Logger.info(`[CircuitBreaker:${this.name}] ${old} → ${newState}`);
    this.emit('state-change', old, newState, this.getStats());
  }

  private recordResult(success: boolean): void {
    this.recentResults.push({ success, timestamp: Date.now() });
    const cutoff = Date.now() - this.config.monitorWindowMs;
    this.recentResults = this.recentResults.filter(r => r.timestamp > cutoff);
  }

  private getFailureRate(): number {
    if (this.recentResults.length < 5) return 0;
    const failures = this.recentResults.filter(r => !r.success).length;
    return failures / this.recentResults.length;
  }

  dispose(): void { this.removeAllListeners(); }
}
