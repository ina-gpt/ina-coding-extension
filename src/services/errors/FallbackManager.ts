/**
 * Phase 10.4 — Fallback Manager
 * Manages fallback chains for graceful error recovery.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ClassifiedError, FallbackChain, FallbackResponse, FallbackStep, ErrorCategory } from './ErrorTypes';

export class FallbackManager extends EventEmitter {
  private static instance: FallbackManager;
  private chains = new Map<string, FallbackChain>();

  static getInstance(): FallbackManager {
    if (!FallbackManager.instance) { FallbackManager.instance = new FallbackManager(); }
    return FallbackManager.instance;
  }

  private constructor() {
    super();
    this.registerDefaultChains();
  }

  registerChain(name: string, chain: FallbackChain): void {
    this.chains.set(name, chain);
  }

  async executeFallbackChain(chainName: string, originalError: ClassifiedError, context?: any): Promise<FallbackResponse> {
    const chain = this.chains.get(chainName);
    if (!chain) {
      Logger.warn(`[Fallback] No chain registered: ${chainName}`);
      return { content: 'Service temporarily unavailable.', source: 'none', quality: 'none', isPartial: false, warning: originalError.userMessage };
    }

    const sortedSteps = [...chain.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      if (step.condition && !step.condition(originalError)) continue;

      try {
        const result = await Promise.race([
          step.executeFn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fallback step timeout')), step.timeoutMs)),
        ]);

        if (result !== null && result !== undefined) {
          Logger.info(`[Fallback] ${chainName}: used step "${step.name}"`);
          this.emit('fallback-used', chainName, step.name);
          const content = typeof result === 'string' ? result : (result as any)?.content || JSON.stringify(result);
          return { content, source: step.name, quality: 'degraded', isPartial: false, warning: `Used fallback: ${step.name}` };
        }
      } catch (e) {
        Logger.debug(`[Fallback] Step "${step.name}" failed:`, e);
      }
    }

    if (chain.defaultResponse) return chain.defaultResponse;
    return { content: originalError.userMessage, source: 'error', quality: 'none', isPartial: false, warning: originalError.userMessage };
  }

  getChain(name: string): FallbackChain | null { return this.chains.get(name) || null; }
  getChainNames(): string[] { return Array.from(this.chains.keys()); }

  private registerDefaultChains(): void {
    // Chat fallback — steps registered later by ChatViewProvider with actual cache/model access
    this.chains.set('chat-fallback', {
      name: 'chat-fallback',
      steps: [],
      defaultResponse: { content: "I'm having trouble connecting right now. Your question has been saved.", source: 'default', quality: 'none', isPartial: false, warning: 'Service temporarily unavailable' },
    });

    // Completion fallback
    this.chains.set('completion-fallback', {
      name: 'completion-fallback',
      steps: [],
      defaultResponse: { content: '', source: 'none', quality: 'none', isPartial: false, warning: null },
    });

    // Search fallback
    this.chains.set('search-fallback', {
      name: 'search-fallback',
      steps: [],
      defaultResponse: { content: 'No results found. Search may be temporarily unavailable.', source: 'default', quality: 'none', isPartial: false, warning: 'Search unavailable' },
    });

    // Agent fallback
    this.chains.set('agent-fallback', {
      name: 'agent-fallback',
      steps: [],
      defaultResponse: { content: 'Agent mode is temporarily unavailable. Please try again.', source: 'default', quality: 'none', isPartial: false, warning: 'Agent unavailable' },
    });
  }

  dispose(): void { this.removeAllListeners(); }
}
