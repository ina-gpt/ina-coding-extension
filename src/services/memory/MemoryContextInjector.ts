import { Logger } from '../../utils/Logger';
import { MemoryClient } from './MemoryClient';
import {
  MemoryContext,
  MemoryRecallOptions,
  MEMORY_CLIENT_CONSTANTS,
} from './MemoryTypes';

// ============ Cache Entry ============

interface CacheEntry {
  context: MemoryContext;
  timestamp: number;
}

// ============ Injection Options ============

export interface InjectionOptions {
  projectId?: string;
  currentFile?: string;
  limit?: number;
  mode?: 'chat' | 'completion' | 'edit';
}

// ============ MemoryContextInjector ============

export class MemoryContextInjector {
  private static instance: MemoryContextInjector;
  private memoryClient: MemoryClient;
  private recallCache: Map<string, CacheEntry> = new Map();
  private lastRecalled: MemoryContext | null = null;

  static getInstance(): MemoryContextInjector {
    if (!MemoryContextInjector.instance) {
      MemoryContextInjector.instance = new MemoryContextInjector();
    }
    return MemoryContextInjector.instance;
  }

  private constructor() {
    this.memoryClient = MemoryClient.getInstance();
  }

  // ============ Main Injection ============

  async injectMemories(
    basePrompt: string,
    userMessage: string,
    options: InjectionOptions = {}
  ): Promise<string> {
    const mode = options.mode || 'chat';

    if (!this.shouldRecall(mode, userMessage.length)) {
      return basePrompt;
    }

    try {
      const cacheKey = this.buildCacheKey(userMessage, options.projectId, options.currentFile);
      const cached = this.getCachedContext(cacheKey);

      let memoryContext: MemoryContext;

      if (cached) {
        memoryContext = cached;
        Logger.debug('Using cached memory context');
      } else {
        const recallOptions: MemoryRecallOptions = {
          projectId: options.projectId,
          currentFile: options.currentFile,
          limit: options.limit || MEMORY_CLIENT_CONSTANTS.MAX_RECALL_RESULTS,
        };

        memoryContext = await this.memoryClient.recallForContext(userMessage, recallOptions);

        this.recallCache.set(cacheKey, {
          context: memoryContext,
          timestamp: Date.now(),
        });
      }

      this.lastRecalled = memoryContext;

      if (memoryContext.memories.length === 0) {
        return basePrompt;
      }

      const memorySection = this.formatMemorySection(memoryContext);
      return `${basePrompt}\n\n${memorySection}`;
    } catch (error) {
      Logger.warn('Failed to inject memories into prompt:', error);
      // Gracefully degrade: return the original prompt without memories
      return basePrompt;
    }
  }

  // ============ Accessors ============

  getLastRecalledMemories(): MemoryContext | null {
    return this.lastRecalled;
  }

  invalidateCache(): void {
    this.recallCache.clear();
    Logger.debug('Memory recall cache invalidated');
  }

  // ============ Private Helpers ============

  private shouldRecall(mode: string, messageLength: number): boolean {
    // Skip recall for very short messages that lack meaningful content
    if (messageLength < 5) {
      return false;
    }

    // For completions, only recall if the message has enough context
    if (mode === 'completion' && messageLength < 20) {
      return false;
    }

    return true;
  }

  private buildCacheKey(
    message: string,
    projectId?: string,
    currentFile?: string
  ): string {
    // Use a simple hash of the message combined with context identifiers.
    // This avoids recalling the same context for identical or near-identical queries.
    const normalized = message.trim().toLowerCase().substring(0, 200);
    const parts = [normalized, projectId || '', currentFile || ''];
    return this.simpleHash(parts.join('|'));
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private getCachedContext(key: string): MemoryContext | null {
    const entry = this.recallCache.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > MEMORY_CLIENT_CONSTANTS.RECALL_CACHE_TTL_MS) {
      this.recallCache.delete(key);
      return null;
    }

    return entry.context;
  }

  private formatMemorySection(context: MemoryContext): string {
    // If the API returned a pre-formatted string, use it directly
    if (context.formatted && context.formatted.trim().length > 0) {
      return context.formatted;
    }

    // Otherwise build a formatted section from the individual memories
    const lines: string[] = [
      '--- Recalled Memories ---',
    ];

    for (const result of context.memories) {
      const mem = result.memory;
      const typeTag = `[${mem.type}]`;
      const pinTag = mem.is_pinned ? ' [pinned]' : '';
      const confidenceTag = mem.confidence < 0.7 ? ` (confidence: ${mem.confidence.toFixed(2)})` : '';
      lines.push(`${typeTag}${pinTag}${confidenceTag} ${mem.summary || mem.content}`);
    }

    lines.push('--- End Recalled Memories ---');
    return lines.join('\n');
  }

  // ============ Cache Maintenance ============

  pruneExpiredCache(): void {
    const now = Date.now();
    const keys = Array.from(this.recallCache.keys());
    for (const key of keys) {
      const entry = this.recallCache.get(key);
      if (entry && now - entry.timestamp > MEMORY_CLIENT_CONSTANTS.RECALL_CACHE_TTL_MS) {
        this.recallCache.delete(key);
      }
    }
  }

  dispose(): void {
    this.recallCache.clear();
    this.lastRecalled = null;
    Logger.debug('MemoryContextInjector disposed');
  }
}

export const memoryContextInjector = MemoryContextInjector.getInstance();
