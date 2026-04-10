import * as vscode from 'vscode';
import { ConfigManager } from '../utils/ConfigManager';
import { Logger } from '../utils/Logger';
import { AuthService } from './AuthService';
import { streamSSE, SSEEvent } from './SSEClient';
import { RequestScheduler } from './requestopt/RequestScheduler';
import { RequestCategory, RequestPriority } from './requestopt/RequestOptTypes';
import { ConnectivityMonitor } from './offline/ConnectivityMonitor';
import { CodeSecurityGate } from './codesec/CodeSecurityGate';
import { EphemeralPolicyEnforcer } from './codesec/EphemeralPolicyEnforcer';
import { CodeTransmissionMonitor } from './codesec/CodeTransmissionMonitor';
import { ApiKeyStore } from './access/ApiKeyStore';

// ============ Types ============

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

export interface ChatContext {
  currentFile?: string;
  selectedText?: string;
  cursorPosition?: { line: number; column: number };
  referencedFiles?: string[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  context?: ChatContext;
  options?: { model?: string; temperature?: number; maxTokens?: number };
}

export interface StreamMetadata {
  messageId: string;
  totalTokens?: number;
  evalCount?: number;
}

export interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

// ============ Request Queue ============

class RequestQueue {
  private queue: Array<{ execute: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private running = 0;

  constructor(private maxConcurrent: number = 3) {}

  async add<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ execute, resolve: resolve as (v: unknown) => void, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) { return; }
    const req = this.queue.shift()!;
    this.running++;
    try { req.resolve(await req.execute()); }
    catch (e) { req.reject(e); }
    finally { this.running--; this.process(); }
  }

  clear(): void {
    this.queue.forEach(r => r.reject(new Error('Queue cleared')));
    this.queue = [];
  }
}

// ============ Circuit Breaker ============

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private isOpen = false;

  constructor(private threshold = 5, private resetTimeout = 30000) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen && Date.now() - this.lastFailure < this.resetTimeout) {
      throw new Error('Service temporarily unavailable (circuit breaker open)');
    }
    if (this.isOpen) { this.isOpen = false; } // Half-open

    try {
      const result = await fn();
      this.failures = 0;
      this.isOpen = false;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.threshold) {
        this.isOpen = true;
        Logger.warn(`Circuit breaker opened after ${this.failures} failures`);
      }
      throw error;
    }
  }

  reset(): void { this.failures = 0; this.isOpen = false; }
}

// ============ API Service ============

export class ApiService {
  private context: vscode.ExtensionContext;
  private authService: AuthService | null = null;
  private requestQueue: RequestQueue;
  private circuitBreaker: CircuitBreaker;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.requestQueue = new RequestQueue(ConfigManager.getAdvanced().maxConcurrentRequests);
    this.circuitBreaker = new CircuitBreaker(5, 30000);
  }

  setAuthService(auth: AuthService): void { this.authService = auth; }

  async initialize(): Promise<void> {
    Logger.info('API Service initialized', { baseUrl: ConfigManager.getApiEndpoint() });
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authService) {
      const authHeaders = await this.authService.getAuthHeaders();
      Object.assign(headers, authHeaders);
    }
    // Fall back to ina_* API key from ApiKeyStore when no OAuth token is present
    if (!headers['Authorization']) {
      try {
        const apiKeyStore = ApiKeyStore.getInstance();
        const key = await apiKeyStore.getKey();
        if (key) {
          headers['Authorization'] = `Bearer ${key}`;
        }
      } catch {
        // ApiKeyStore not initialized, continue without
      }
    }
    return headers;
  }

  // ============ Chat Streaming (SSE) ============

  async *chatStream(
    request: ChatRequest,
    signal?: AbortSignal
  ): AsyncGenerator<string, StreamMetadata | undefined, unknown> {
    const url = `${ConfigManager.getApiEndpoint()}/api/chat`;
    const headers = await this.getHeaders();

    const body = {
      messages: request.messages,
      projectId: undefined,
      context: request.context,
      options: {
        model: request.options?.model || ConfigManager.getChatModel(),
        temperature: request.options?.temperature ?? ConfigManager.getChat().temperature,
        maxTokens: request.options?.maxTokens ?? ConfigManager.getChat().maxTokens,
        stream: true,
      },
    };

    // Apply ephemeral policy headers if enabled
    try {
      const enforcer = EphemeralPolicyEnforcer.getInstance();
      if (enforcer.isEnabled()) {
        const { headers: ephHeaders } = enforcer.enforceOnRequest(body);
        Object.assign(headers, ephHeaders);
      }
    } catch {
      // Ephemeral policy enforcer not available, continue without
    }

    let metadata: StreamMetadata | undefined;

    try {
      for await (const event of streamSSE(url, {
        headers: { ...headers, 'Accept': 'text/event-stream' },
        body,
        timeout: ConfigManager.getApi().timeout,
        signal,
      })) {
        let data: Record<string, unknown>;
        try { data = JSON.parse(event.data); }
        catch { data = { content: event.data }; }

        switch (event.event) {
          case 'start':
            Logger.debug(`Stream started: ${data.messageId}`);
            break;
          case 'token':
            if (data.content) { yield data.content as string; }
            break;
          case 'done':
            metadata = { messageId: data.messageId as string, totalTokens: data.totalTokens as number, evalCount: data.evalCount as number };
            break;
          case 'error':
            throw new Error((data.error as string) || 'Stream error');
          case 'cancelled':
            return metadata;
          default:
            // Legacy format fallback
            if (data.content) { yield data.content as string; }
            if (data.error) { throw new Error(data.error as string); }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        Logger.info('Chat stream aborted');
        return metadata;
      }
      Logger.error('Chat stream error:', error);
      throw error;
    }

    return metadata;
  }

  // ============ Non-Streaming Chat ============

  async chat(request: ChatRequest): Promise<ApiResponse> {
    const scheduler = RequestScheduler.getInstance();
    const result = await scheduler.schedule<ApiResponse>(
      RequestCategory.CHAT,
      async (signal) => {
        return this.circuitBreaker.execute(async () => {
          const headers = await this.getHeaders();
          const response = await fetch(`${ConfigManager.getApiEndpoint()}/api/chat`, {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({
              messages: request.messages,
              context: request.context,
              options: { ...request.options, stream: false, model: request.options?.model || ConfigManager.getChatModel() },
            }),
          });
          if (!response.ok) { throw new Error(`HTTP ${response.status}`); }
          return response.json();
        });
      },
      { priority: RequestPriority.HIGH }
    );
    if (result.error) { throw new Error(result.error.message); }
    return result.data!;
  }

  // ============ Code Completion ============

  async complete(request: { prefix: string; suffix: string; language?: string; filename?: string; options?: { model?: string; maxTokens?: number } }, signal?: AbortSignal): Promise<ApiResponse<{ completion: string }>> {
    const scheduler = RequestScheduler.getInstance();
    const result = await scheduler.schedule<ApiResponse<{ completion: string }>>(
      RequestCategory.COMPLETION,
      async (schedSignal) => {
        return this.circuitBreaker.execute(async () => {
          const headers = await this.getHeaders();
          // Use external signal or scheduler signal
          const abortCtrl = new AbortController();
          const onAbort = () => abortCtrl.abort();
          schedSignal.addEventListener('abort', onAbort);
          if (signal) signal.addEventListener('abort', onAbort);
          try {
            const response = await fetch(`${ConfigManager.getApiEndpoint()}/api/complete`, {
              method: 'POST',
              headers,
              signal: abortCtrl.signal,
              body: JSON.stringify({
                ...request,
                options: { ...request.options, model: request.options?.model || ConfigManager.getCompletionModel() },
              }),
            });
            if (!response.ok) { throw new Error(`HTTP ${response.status}`); }
            return response.json();
          } finally {
            schedSignal.removeEventListener('abort', onAbort);
            if (signal) signal.removeEventListener('abort', onAbort);
          }
        });
      },
      { priority: RequestPriority.HIGH, timeoutMs: 10000, maxRetries: 0 }
    );
    if (result.error) { throw new Error(result.error.message); }
    return result.data!;
  }

  // ============ Edit Streaming ============

  async *editStream(request: { instruction: string; code: string; language?: string; filename?: string; selection?: { startLine: number; endLine: number } }, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
    const url = `${ConfigManager.getApiEndpoint()}/api/edit`;
    const headers = await this.getHeaders();

    try {
      for await (const event of streamSSE(url, {
        headers: { ...headers, 'Accept': 'text/event-stream' },
        body: { ...request, options: { stream: true } },
        timeout: ConfigManager.getApi().timeout,
        signal,
      })) {
        let data: Record<string, unknown>;
        try { data = JSON.parse(event.data); } catch { data = { content: event.data }; }
        if (event.event === 'token' && data.content) { yield data.content as string; }
        else if (event.event === 'error') { throw new Error((data.error as string) || 'Edit error'); }
        else if (data.content) { yield data.content as string; }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') { throw error; }
    }
  }

  // ============ Search ============

  async search(request: { query: string; projectId: string; type?: string; limit?: number }): Promise<ApiResponse> {
    const scheduler = RequestScheduler.getInstance();
    const result = await scheduler.schedule<ApiResponse>(
      RequestCategory.SEARCH,
      async (signal) => {
        const headers = await this.getHeaders();
        const params = new URLSearchParams({ query: request.query, projectId: request.projectId, type: request.type || 'hybrid', limit: String(request.limit || 10) });
        const response = await fetch(`${ConfigManager.getApiEndpoint()}/api/search?${params}`, { method: 'GET', headers, signal });
        return response.json();
      },
      { priority: RequestPriority.NORMAL }
    );
    if (result.error) {
      return { success: false, error: { code: 'NETWORK_ERROR', message: result.error.message } };
    }
    return result.data!;
  }

  // ============ Index ============

  async indexProject(data: { projectName: string; projectPath: string; files?: Array<{ path: string; content: string; language?: string }> }): Promise<ApiResponse> {
    const scheduler = RequestScheduler.getInstance();
    const userId = this.authService?.user?.id || 'anonymous';
    const result = await scheduler.schedule<ApiResponse>(
      RequestCategory.INDEX,
      async (signal) => {
        const headers = await this.getHeaders();
        const response = await fetch(`${ConfigManager.getApiEndpoint()}/api/index`, {
          method: 'POST', headers, signal, body: JSON.stringify({ ...data, userId }),
        });
        return response.json();
      },
      { priority: RequestPriority.LOW }
    );
    if (result.error) {
      return { success: false, error: { code: 'NETWORK_ERROR', message: result.error.message } };
    }
    return result.data!;
  }

  // ============ Health ============

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${ConfigManager.getApiEndpoint()}/api/health`);
      const data = await response.json();
      return data.status === 'healthy';
    } catch { return false; }
  }

  async getCurrentUser(): Promise<ApiResponse> {
    const headers = await this.getHeaders();
    try {
      const response = await fetch(`${ConfigManager.getApiEndpoint()}/api/auth/me`, { method: 'GET', headers });
      return { success: true, data: await response.json() };
    } catch (error) {
      return { success: false, error: { code: 'API_ERROR', message: error instanceof Error ? error.message : 'Unknown error' } };
    }
  }

  /** Classify network errors for connectivity reporting */
  static isNetworkError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ERR_NETWORK|Failed to fetch|network|abort/i.test(msg);
  }

  dispose(): void { this.requestQueue.clear(); this.circuitBreaker.reset(); }
}
