/**
 * Phase 10.4 — Circuit Breaker Registry
 * Manages circuit breakers for all services.
 */
import { CircuitBreaker } from './CircuitBreaker';
import { CircuitBreakerState } from './ErrorTypes';

export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private breakers = new Map<string, CircuitBreaker>();

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  private constructor() {
    // Pre-register common breakers
    this.getOrCreate('inference-chat', { failureThreshold: 3, resetTimeoutMs: 30000 });
    this.getOrCreate('inference-completion', { failureThreshold: 5, resetTimeoutMs: 20000 });
    this.getOrCreate('inference-embedding', { failureThreshold: 5, resetTimeoutMs: 15000 });
    this.getOrCreate('api-server', { failureThreshold: 5, resetTimeoutMs: 30000 });
    this.getOrCreate('vision', { failureThreshold: 2, resetTimeoutMs: 60000 });
    this.getOrCreate('database', { failureThreshold: 3, resetTimeoutMs: 15000 });
  }

  getOrCreate(name: string, config?: any): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | null { return this.breakers.get(name) || null; }
  getAll(): Map<string, CircuitBreaker> { return new Map(this.breakers); }

  resetAll(): void { for (const b of this.breakers.values()) b.reset(); }

  getOverallHealth(): { healthy: string[]; tripped: string[]; halfOpen: string[] } {
    const healthy: string[] = [], tripped: string[] = [], halfOpen: string[] = [];
    for (const [name, b] of this.breakers) {
      const s = b.getState();
      if (s === CircuitBreakerState.CLOSED) healthy.push(name);
      else if (s === CircuitBreakerState.OPEN) tripped.push(name);
      else halfOpen.push(name);
    }
    return { healthy, tripped, halfOpen };
  }

  getStatusArray(): { name: string; state: string; failures: number; lastFailure: number | null }[] {
    return Array.from(this.breakers.entries()).map(([name, b]) => {
      const s = b.getStats();
      return { name, state: s.state, failures: s.failures, lastFailure: s.lastFailure };
    });
  }

  dispose(): void { for (const b of this.breakers.values()) b.dispose(); this.breakers.clear(); }
}
