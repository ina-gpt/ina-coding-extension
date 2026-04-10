import { EventEmitter } from 'events';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';
import {
  Memory,
  MemoryContext,
  MemoryStats,
  MemoryFilters,
  CreateMemoryPayload,
  UpdateMemoryPayload,
  ExtractedMemory,
  ExtractionOptions,
  MemoryRecallOptions,
  MemorySearchOptions,
} from './MemoryTypes';
import { RequestScheduler } from '../requestopt/RequestScheduler';
import { RequestCategory, RequestPriority } from '../requestopt/RequestOptTypes';

// ============ MemoryClient ============

export class MemoryClient extends EventEmitter {
  private static instance: MemoryClient;

  static getInstance(): MemoryClient {
    if (!MemoryClient.instance) {
      MemoryClient.instance = new MemoryClient();
    }
    return MemoryClient.instance;
  }

  private constructor() {
    super();
  }

  // ============ Internal HTTP Helper ============

  private getBaseUrl(): string {
    return ConfigManager.getApiEndpoint();
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const message = `Memory API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`;
        Logger.error(message);
        throw new Error(message);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return undefined as unknown as T;
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Memory API error:')) {
        throw error;
      }
      Logger.error(`Memory API request failed: ${path}`, error);
      throw new Error(`Memory API request failed: ${path} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ============ Memory Scope ============

  /**
   * Get the effective projectId based on memory scope setting.
   * 'global' → null (no project filter → cross-project memories)
   * 'project' → workspace folder hash
   */
  getEffectiveProjectId(): string | undefined {
    const scope = ConfigManager.get<string>('memory.scope', 'global');
    if (scope === 'global') return undefined;
    const ws = require('vscode').workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return undefined;
    const crypto = require('crypto');
    return crypto.createHash('md5').update(ws).digest('hex').slice(0, 12);
  }

  // ============ CRUD Operations ============

  async createMemory(memory: CreateMemoryPayload): Promise<Memory> {
    const result = await this.request<{ memory: Memory }>('/api/memory', {
      method: 'POST',
      body: JSON.stringify(memory),
    });
    this.emit('memory-created', result.memory);
    return result.memory;
  }

  async getMemories(filters?: MemoryFilters): Promise<{ memories: Memory[]; total: number }> {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.type) params.set('type', filters.type);
      if (filters.scope) params.set('scope', filters.scope);
      if (filters.projectId) params.set('projectId', filters.projectId);
      if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
      if (filters.isPinned !== undefined) params.set('isPinned', String(filters.isPinned));
      if (filters.tags && filters.tags.length > 0) params.set('tags', filters.tags.join(','));
      if (filters.limit !== undefined) params.set('limit', String(filters.limit));
      if (filters.offset !== undefined) params.set('offset', String(filters.offset));
    }

    const queryString = params.toString();
    const path = `/api/memory${queryString ? `?${queryString}` : ''}`;
    return this.request<{ memories: Memory[]; total: number }>(path, { method: 'GET' });
  }

  async updateMemory(id: string, updates: UpdateMemoryPayload): Promise<Memory> {
    const result = await this.request<{ memory: Memory }>(`/api/memory/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    this.emit('memory-updated', result.memory);
    return result.memory;
  }

  async deleteMemory(id: string): Promise<void> {
    await this.request<void>(`/api/memory/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    this.emit('memory-deleted', id);
  }

  // ============ Search & Recall ============

  async searchMemories(
    query: string,
    projectId?: string,
    limit?: number
  ): Promise<{ results: Memory[]; total: number }> {
    const body: MemorySearchOptions = { query };
    if (projectId) body.projectId = projectId;
    if (limit !== undefined) body.limit = limit;

    return this.request<{ results: Memory[]; total: number }>('/api/memory/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async recallForContext(
    message: string,
    options?: MemoryRecallOptions
  ): Promise<MemoryContext> {
    const scheduler = RequestScheduler.getInstance();
    const result = await scheduler.schedule<MemoryContext>(
      RequestCategory.MEMORY,
      async () => {
        const body: Record<string, any> = { message };
        if (options?.projectId) body.projectId = options.projectId;
        if (options?.currentFile) body.currentFile = options.currentFile;
        if (options?.limit !== undefined) body.limit = options.limit;
        if (options?.scope) body.scope = options.scope;
        if (options?.types) body.types = options.types;
        return this.request<MemoryContext>('/api/memory/recall', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      },
      { priority: RequestPriority.NORMAL }
    );
    if (result.data) {
      this.emit('memory-recalled', result.data);
      return result.data;
    }
    return { memories: [], injectedText: '', totalRecalled: 0 } as any;
  }

  // ============ Extraction ============

  async extractFromConversation(
    userMessage: string,
    assistantMessage: string,
    options?: ExtractionOptions
  ): Promise<{ extracted: ExtractedMemory[]; saved: Memory[] }> {
    const body: Record<string, any> = { userMessage, assistantMessage };
    if (options?.projectId) body.projectId = options.projectId;
    if (options?.currentFile) body.currentFile = options.currentFile;
    if (options?.chatId) body.chatId = options.chatId;
    if (options?.messageId) body.messageId = options.messageId;

    return this.request<{ extracted: ExtractedMemory[]; saved: Memory[] }>('/api/memory/extract', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ============ Feedback ============

  async submitFeedback(
    memoryId: string,
    type: 'helpful' | 'not_helpful' | 'incorrect' | 'outdated',
    context?: string
  ): Promise<void> {
    await this.request<void>('/api/memory/feedback', {
      method: 'POST',
      body: JSON.stringify({ memoryId, type, context }),
    });
    this.emit('feedback-submitted', { memoryId, type });
  }

  // ============ Stats & Maintenance ============

  async getStats(projectId?: string): Promise<MemoryStats> {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    const queryString = params.toString();
    const path = `/api/memory/stats${queryString ? `?${queryString}` : ''}`;
    return this.request<MemoryStats>(path, { method: 'GET' });
  }

  async runMaintenance(): Promise<{ cleaned: number; merged: number; decayed: number }> {
    return this.request<{ cleaned: number; merged: number; decayed: number }>('/api/memory/maintenance', {
      method: 'POST',
    });
  }

  // ============ Import / Export ============

  async exportMemories(
    projectId?: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<{ data: Memory[]; count: number }> {
    const params = new URLSearchParams({ export: 'true', format });
    if (projectId) params.set('projectId', projectId);
    return this.request<{ data: Memory[]; count: number }>(`/api/memory?${params.toString()}`, {
      method: 'GET',
    });
  }

  async importMemories(
    data: CreateMemoryPayload[],
    projectId?: string
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const body: Record<string, any> = { action: 'import', memories: data };
    if (projectId) body.projectId = projectId;

    return this.request<{ imported: number; skipped: number; errors: string[] }>('/api/memory', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ============ Pin / Unpin ============

  async pinMemory(id: string): Promise<Memory> {
    return this.updateMemory(id, { is_pinned: true });
  }

  async unpinMemory(id: string): Promise<Memory> {
    return this.updateMemory(id, { is_pinned: false });
  }
}

export const memoryClient = MemoryClient.getInstance();
