import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { MemoryClient } from './MemoryClient';
import {
  ExtractionQueueItem,
  ExtractionOptions,
  ExtractedMemory,
  Memory,
  RememberRequest,
  ForgetRequest,
  MEMORY_CLIENT_CONSTANTS,
} from './MemoryTypes';
import { CodeSecurityGate } from '../codesec/CodeSecurityGate';

// ============ Patterns for Explicit Requests ============

const REMEMBER_PATTERNS: RegExp[] = [
  /^remember\s+that\s+(.+)/i,
  /^don'?t\s+forget\s+(?:that\s+)?(.+)/i,
  /^from\s+now\s+on[,:]?\s+(.+)/i,
  /^always\s+(.+)/i,
  /^never\s+(.+)/i,
  /^keep\s+in\s+mind\s+(?:that\s+)?(.+)/i,
  /^note\s+(?:that\s+)?(.+)/i,
  /^please\s+remember\s+(?:that\s+)?(.+)/i,
];

const FORGET_PATTERNS: RegExp[] = [
  /^forget\s+about\s+(.+)/i,
  /^forget\s+that\s+(.+)/i,
  /^clear\s+memor(?:y|ies)(?:\s+(?:about|for|of)\s+(.+))?/i,
  /^remove\s+memor(?:y|ies)\s+(?:about|for|of)\s+(.+)/i,
  /^delete\s+memor(?:y|ies)\s+(?:about|for|of)\s+(.+)/i,
  /^stop\s+remembering\s+(?:that\s+)?(.+)/i,
];

// ============ MemoryAutoExtractor ============

export class MemoryAutoExtractor extends EventEmitter {
  private static instance: MemoryAutoExtractor;
  private memoryClient: MemoryClient;
  private debounceTimer: NodeJS.Timeout | null = null;
  private enabled: boolean = true;
  private extractionQueue: ExtractionQueueItem[] = [];
  private processing: boolean = false;

  static getInstance(): MemoryAutoExtractor {
    if (!MemoryAutoExtractor.instance) {
      MemoryAutoExtractor.instance = new MemoryAutoExtractor();
    }
    return MemoryAutoExtractor.instance;
  }

  private constructor() {
    super();
    this.memoryClient = MemoryClient.getInstance();
  }

  // ============ Queue Management ============

  onConversationTurn(
    userMessage: string,
    assistantMessage: string,
    context: ExtractionOptions = {}
  ): void {
    if (!this.enabled) {
      Logger.debug('Memory auto-extraction disabled, skipping');
      return;
    }

    if (!userMessage.trim() || !assistantMessage.trim()) {
      return;
    }

    this.extractionQueue.push({
      userMessage,
      assistantMessage,
      context,
      timestamp: Date.now(),
    });

    Logger.debug(`Memory extraction queued (queue size: ${this.extractionQueue.length})`);

    // Debounce processing to avoid rapid-fire API calls
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processQueue().catch((error) => {
        Logger.error('Memory extraction queue processing failed:', error);
      });
    }, MEMORY_CLIENT_CONSTANTS.EXTRACTION_DEBOUNCE_MS);
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.extractionQueue.length === 0) {
      return;
    }

    this.processing = true;
    const items = [...this.extractionQueue];
    this.extractionQueue = [];

    try {
      for (const item of items) {
        try {
          // Sanitize conversation content before sending for memory extraction
          let userMsg = item.userMessage;
          let assistantMsg = item.assistantMessage;
          try {
            const gate = CodeSecurityGate.getInstance();
            const sanitized = gate.scanOutgoingCode(
              userMsg + '\n' + assistantMsg, null, 'memory-extraction'
            );
            if (sanitized.sanitizedCode) {
              const parts = sanitized.sanitizedCode.split('\n');
              // Use sanitized content; keep original split point approximate
              userMsg = parts.slice(0, Math.ceil(parts.length / 2)).join('\n');
              assistantMsg = parts.slice(Math.ceil(parts.length / 2)).join('\n');
            }
          } catch {
            // Security gate not available, continue with original messages
          }

          const result = await this.memoryClient.extractFromConversation(
            userMsg,
            assistantMsg,
            item.context
          );

          if (result.extracted.length > 0) {
            Logger.info(`Extracted ${result.extracted.length} memories from conversation`);
            this.emit('extraction-complete', {
              extracted: result.extracted,
              saved: result.saved,
              source: item,
            });
          }
        } catch (error) {
          Logger.warn('Failed to extract memories from conversation turn:', error);
          // Continue processing remaining items
        }
      }
    } finally {
      this.processing = false;

      // If new items were added during processing, schedule another round
      if (this.extractionQueue.length > 0) {
        this.debounceTimer = setTimeout(() => {
          this.processQueue().catch((error) => {
            Logger.error('Memory extraction queue re-processing failed:', error);
          });
        }, MEMORY_CLIENT_CONSTANTS.EXTRACTION_DEBOUNCE_MS);
      }
    }
  }

  // ============ Explicit Request Detection ============

  detectExplicitRememberRequest(message: string): RememberRequest {
    const trimmed = message.trim();

    for (const pattern of REMEMBER_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        return {
          isRememberRequest: true,
          content: match[1].trim(),
        };
      }
    }

    return { isRememberRequest: false, content: '' };
  }

  detectExplicitForgetRequest(message: string): ForgetRequest {
    const trimmed = message.trim();

    for (const pattern of FORGET_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) {
        const query = (match[1] || '').trim();
        return {
          isForgetRequest: true,
          query,
        };
      }
    }

    return { isForgetRequest: false, query: '' };
  }

  // ============ Explicit Handlers ============

  async handleExplicitRemember(
    content: string,
    context: ExtractionOptions = {}
  ): Promise<Memory> {
    Logger.info('Handling explicit remember request:', content);

    try {
      const memory = await this.memoryClient.createMemory({
        type: 'fact',
        scope: context.projectId ? 'project' : 'global',
        content,
        summary: content.length > 100 ? content.substring(0, 97) + '...' : content,
        source_type: 'explicit',
        source_message_id: context.messageId,
        source_chat_id: context.chatId,
        confidence: 1.0,
        project_id: context.projectId,
        related_files: context.currentFile ? [context.currentFile] : undefined,
        tags: ['explicit', 'user-requested'],
      });

      this.emit('memory-created', memory);
      Logger.info(`Explicit memory created: ${memory.id}`);
      return memory;
    } catch (error) {
      Logger.error('Failed to create explicit memory:', error);
      throw error;
    }
  }

  async handleExplicitForget(
    query: string,
    projectId?: string
  ): Promise<{ deactivated: number }> {
    Logger.info('Handling explicit forget request:', query);

    try {
      let deactivatedCount = 0;

      if (!query) {
        // "Clear memory" without a query -- deactivate all for the project
        const { memories } = await this.memoryClient.getMemories({
          projectId,
          isActive: true,
          limit: 100,
        });

        for (const memory of memories) {
          try {
            await this.memoryClient.updateMemory(memory.id, { is_active: false });
            deactivatedCount++;
          } catch (error) {
            Logger.warn(`Failed to deactivate memory ${memory.id}:`, error);
          }
        }
      } else {
        // Search for matching memories and deactivate them
        const { results } = await this.memoryClient.searchMemories(query, projectId, 20);

        for (const memory of results) {
          try {
            await this.memoryClient.updateMemory(memory.id, { is_active: false });
            deactivatedCount++;
          } catch (error) {
            Logger.warn(`Failed to deactivate memory ${memory.id}:`, error);
          }
        }
      }

      Logger.info(`Deactivated ${deactivatedCount} memories for forget request`);
      this.emit('memory-deleted', { query, deactivated: deactivatedCount });
      return { deactivated: deactivatedCount };
    } catch (error) {
      Logger.error('Failed to handle explicit forget request:', error);
      throw error;
    }
  }

  // ============ Enable / Disable ============

  enable(): void {
    this.enabled = true;
    Logger.info('Memory auto-extraction enabled');
  }

  disable(): void {
    this.enabled = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.extractionQueue = [];
    Logger.info('Memory auto-extraction disabled');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ============ Cleanup ============

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.extractionQueue = [];
    this.processing = false;
    this.removeAllListeners();
    Logger.debug('MemoryAutoExtractor disposed');
  }
}

export const memoryAutoExtractor = MemoryAutoExtractor.getInstance();
