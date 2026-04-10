/**
 * Phase 10.3 — Graceful Degradation
 * Orchestrator that decides what to do when offline/degraded.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ConnectivityMonitor } from './ConnectivityMonitor';
import { LocalModelManager } from './LocalModelManager';
import { OfflineQueue } from './OfflineQueue';
import { CacheManager } from '../cache/CacheManager';
import {
  ConnectionState, DegradedResponse, OfflineRequestType,
  OfflineCapability, OFFLINE_CAPABILITIES,
} from './OfflineTypes';

export class GracefulDegradation extends EventEmitter {
  private static instance: GracefulDegradation;
  private connectivityMonitor: ConnectivityMonitor;
  private cacheManager: CacheManager;
  private localModelManager: LocalModelManager;
  private offlineQueue: OfflineQueue;

  static getInstance(): GracefulDegradation {
    if (!GracefulDegradation.instance) {
      GracefulDegradation.instance = new GracefulDegradation();
    }
    return GracefulDegradation.instance;
  }

  private constructor() {
    super();
    this.connectivityMonitor = ConnectivityMonitor.getInstance();
    this.cacheManager = CacheManager.getInstance();
    this.localModelManager = LocalModelManager.getInstance();
    this.offlineQueue = OfflineQueue.getInstance();
  }

  async handleChatRequest(
    systemPrompt: string,
    userMessage: string,
    context: any
  ): Promise<DegradedResponse> {
    const state = this.connectivityMonitor.getState();

    if (state === ConnectionState.ONLINE) {
      return { content: null, source: 'normal', quality: 'full', warning: null };
    }

    // 1. Check response cache
    try {
      const cached = await this.cacheManager.getResponse('', systemPrompt, userMessage, '');
      if (cached) {
        Logger.info('[Offline] Serving cached chat response');
        const response: DegradedResponse = {
          content: typeof cached === 'string' ? cached : JSON.stringify(cached),
          source: 'cache',
          quality: 'cached',
          warning: 'This is a cached response from a previous conversation.',
        };
        this.emit('degraded-response', response);
        return response;
      }
    } catch { /* cache miss */ }

    // 2. Try local model
    if (this.localModelManager.isAvailable()) {
      try {
        Logger.info('[Offline] Using local model for chat');
        const offlineSystemPrompt = this.buildOfflineSystemPrompt(systemPrompt);
        let content = '';
        for await (const chunk of this.localModelManager.chat(
          [{ role: 'system', content: offlineSystemPrompt }, { role: 'user', content: userMessage }],
          { maxTokens: 1024 }
        )) {
          if (chunk.type === 'token') content += chunk.content;
        }

        const response: DegradedResponse = {
          content,
          source: 'local_model',
          quality: 'degraded',
          warning: 'Generated offline with a smaller model. Quality may be reduced.',
        };
        this.emit('degraded-response', response);
        return response;
      } catch (e) {
        Logger.debug('[Offline] Local model chat failed:', e);
      }
    }

    // 3. Queue for later
    this.offlineQueue.enqueue({
      type: OfflineRequestType.CHAT,
      category: 'chat',
      payload: { systemPrompt: systemPrompt.slice(0, 2000), userMessage },
      priority: 1,
    });

    return {
      content: null,
      source: 'unavailable',
      quality: 'none',
      warning: 'Currently offline. Your message has been queued and will be processed when connection is restored.',
    };
  }

  async handleCompletionRequest(prefix: string, suffix: string, filePath: string): Promise<DegradedResponse> {
    const state = this.connectivityMonitor.getState();
    if (state === ConnectionState.ONLINE) {
      return { content: null, source: 'normal', quality: 'full', warning: null };
    }

    // 1. Check completion cache
    try {
      const cached = this.cacheManager.getCompletion(prefix.slice(-200), suffix, filePath);
      if (cached) {
        return { content: typeof cached === 'string' ? cached : '', source: 'cache', quality: 'cached', warning: null };
      }
    } catch { /* miss */ }

    // 2. Try local model FIM
    if (this.localModelManager.isAvailable()) {
      try {
        const completion = await this.localModelManager.complete(prefix, suffix);
        if (completion) {
          return { content: completion, source: 'local_model', quality: 'degraded', warning: null };
        }
      } catch { /* fall through */ }
    }

    return { content: null, source: 'unavailable', quality: 'none', warning: null };
  }

  async handleSearchRequest(query: string): Promise<DegradedResponse> {
    if (this.connectivityMonitor.isOnline()) {
      return { content: null, source: 'normal', quality: 'full', warning: null };
    }
    // No embedding search offline — return notice
    return {
      content: null,
      source: 'unavailable',
      quality: 'none',
      warning: 'Search is limited offline. Try using workspace search (Ctrl+Shift+F) instead.',
    };
  }

  async handleMemoryRecall(context: any): Promise<DegradedResponse> {
    if (this.connectivityMonitor.isOnline()) {
      return { content: null, source: 'normal', quality: 'full', warning: null };
    }
    return { content: null, source: 'unavailable', quality: 'none', warning: 'Memory recall unavailable offline.' };
  }

  handleAgentRequest(): DegradedResponse {
    if (this.connectivityMonitor.isOnline()) {
      return { content: null, source: 'normal', quality: 'full', warning: null };
    }
    return {
      content: null,
      source: 'unavailable',
      quality: 'none',
      warning: 'Agent mode is not available offline. Your request has been saved.',
    };
  }

  handleVisionRequest(): DegradedResponse {
    if (this.connectivityMonitor.isOnline()) {
      return { content: null, source: 'normal', quality: 'full', warning: null };
    }
    return {
      content: null,
      source: 'unavailable',
      quality: 'none',
      warning: 'Image analysis requires a server connection. Request queued for later.',
    };
  }

  queueForLater(type: OfflineRequestType, payload: any, priority = 5): any {
    return this.offlineQueue.enqueue({
      type,
      category: type,
      payload,
      priority,
    });
  }

  getOfflineCapabilities(): OfflineCapability[] {
    return OFFLINE_CAPABILITIES;
  }

  getOfflineStatus() {
    return {
      state: this.connectivityMonitor.getState(),
      capabilities: OFFLINE_CAPABILITIES,
      queueSize: this.offlineQueue.getQueueSize(),
      localModelAvailable: this.localModelManager.isAvailable(),
      localModelName: this.localModelManager.getSelectedModel(),
    };
  }

  private buildOfflineSystemPrompt(basePrompt: string): string {
    return `${basePrompt}\n\n[OFFLINE MODE] You are running in offline mode with a smaller model. Keep responses focused and concise. You don't have access to the codebase index, documentation search, or memory system. Focus on what you can help with from the context provided.`;
  }

  dispose(): void { this.removeAllListeners(); }
}
