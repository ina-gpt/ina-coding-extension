/**
 * AsyncSessionClient.ts
 * Phase 18.5 — Client for the backend async session API
 *
 * Talks to /api/agent/async/* endpoints on the INA Coding API. Provides
 * both streaming (SSE) and polling fallbacks for progress updates.
 */

import { Logger } from '../../../utils/Logger';
import { ConfigManager } from '../../../utils/ConfigManager';
import { AuthService } from '../../AuthService';
import { ApiKeyStore } from '../../access/ApiKeyStore';

// ============================================================
// Types (mirror backend shapes — simplified)
// ============================================================

export type AsyncSessionStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'needs_input';

export interface AsyncSessionSummary {
  id: string;
  userId: string;
  taskDescription: string;
  status: AsyncSessionStatus;
  progress: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  applied: boolean;
  totalTokensUsed: number;
  createdAt: number;
  updatedAt: number;
}

export interface AsyncSessionDetails extends AsyncSessionSummary {
  taskGraph: any | null;
  results: AsyncSessionResultView[];
  notifyOnComplete: boolean;
}

export interface AsyncSessionResultView {
  taskId: string;
  description: string;
  requiredRole: string;
  output: string;
  filePath: string | null;
  language: string | null;
  durationMs: number;
  tokensUsed: number;
  completedAt: number;
}

export interface AsyncProgressEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  status?: AsyncSessionStatus;
  progress?: number;
  taskId?: string;
  message?: string;
  data?: any;
}

// ============================================================

export class AsyncSessionClient {
  private static instance: AsyncSessionClient;

  private authService: AuthService | null = null;

  private constructor() {}

  static getInstance(): AsyncSessionClient {
    if (!AsyncSessionClient.instance) {
      AsyncSessionClient.instance = new AsyncSessionClient();
    }
    return AsyncSessionClient.instance;
  }

  setAuthService(authService: AuthService): void {
    this.authService = authService;
  }

  // ============================================================
  // API calls
  // ============================================================

  async startAsync(
    taskDescription: string,
    options: { taskGraph?: any; notifyOnComplete?: boolean } = {}
  ): Promise<AsyncSessionSummary> {
    const body = {
      taskDescription,
      taskGraph: options.taskGraph ?? null,
      notifyOnComplete: options.notifyOnComplete ?? true,
    };
    const response = await this.request('/api/agent/async/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'Failed to create session');
    return json.session as AsyncSessionSummary;
  }

  async listSessions(options: { limit?: number; offset?: number; status?: AsyncSessionStatus } = {}): Promise<{
    sessions: AsyncSessionSummary[];
    total: number;
  }> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    if (options.status) params.set('status', options.status);
    const response = await this.request(`/api/agent/async/sessions?${params.toString()}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'Failed to list sessions');
    return { sessions: json.sessions ?? [], total: json.total ?? 0 };
  }

  async getSession(id: string): Promise<AsyncSessionDetails> {
    const response = await this.request(`/api/agent/async/sessions/${encodeURIComponent(id)}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'Failed to fetch session');
    return json.session as AsyncSessionDetails;
  }

  async cancelSession(id: string): Promise<void> {
    const response = await this.request(
      `/api/agent/async/sessions/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' }
    );
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'Failed to cancel session');
  }

  async resumeSession(id: string): Promise<void> {
    const response = await this.request(
      `/api/agent/async/sessions/${encodeURIComponent(id)}/resume`,
      { method: 'POST' }
    );
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'Failed to resume session');
  }

  async deleteSession(id: string): Promise<void> {
    const response = await this.request(`/api/agent/async/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'Failed to delete session');
  }

  // ============================================================
  // Streaming — SSE with polling fallback
  // ============================================================

  /**
   * Subscribe to progress events via Server-Sent Events. Returns an
   * unsubscribe function. If SSE fails (cannot open the stream), falls
   * back to polling `getSession` every `pollIntervalMs`.
   */
  streamProgress(
    id: string,
    onEvent: (event: AsyncProgressEvent) => void,
    pollIntervalMs: number = 5000
  ): () => void {
    let cancelled = false;
    const abortController = new AbortController();

    const runStream = async () => {
      try {
        const url = `${this.getApiUrl()}/api/agent/async/sessions/${encodeURIComponent(id)}/stream`;
        const response = await fetch(url, {
          headers: await this.getHeaders({ Accept: 'text/event-stream' }),
          signal: abortController.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`SSE HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Parse SSE messages
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const lines = part.split('\n');
            let eventName = 'message';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr += line.slice(6);
              // Ignore heartbeats (lines starting with `:`)
            }
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              onEvent({
                type: eventName,
                sessionId: id,
                timestamp: Date.now(),
                ...data,
              });
            } catch {
              /* skip malformed */
            }
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        Logger.warn(`[AsyncClient] SSE failed, falling back to polling: ${String(e)}`);
        runPolling();
      }
    };

    const runPolling = () => {
      let lastProgress = -1;
      const timer = setInterval(async () => {
        if (cancelled) {
          clearInterval(timer);
          return;
        }
        try {
          const session = await this.getSession(id);
          if (session.progress !== lastProgress) {
            lastProgress = session.progress;
            onEvent({
              type: 'progress-update',
              sessionId: id,
              timestamp: Date.now(),
              progress: session.progress,
              status: session.status,
            });
          }
          if (
            session.status === 'completed' ||
            session.status === 'failed' ||
            session.status === 'cancelled'
          ) {
            onEvent({
              type: session.status,
              sessionId: id,
              timestamp: Date.now(),
              status: session.status,
            });
            clearInterval(timer);
            cancelled = true;
          }
        } catch (e) {
          Logger.warn(`[AsyncClient] poll failed: ${String(e)}`);
        }
      }, pollIntervalMs);
    };

    runStream();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.getApiUrl()}${path}`;
    const headers = await this.getHeaders(
      init.headers as Record<string, string> | undefined
    );
    headers['Content-Type'] ??= 'application/json';
    return fetch(url, { ...init, headers });
  }

  private getApiUrl(): string {
    const url =
      ConfigManager.get<string>('apiUrl', '') ||
      ConfigManager.get<string>('general.apiUrl', '') ||
      'http://localhost:3200';
    return url.replace(/\/+$/, '');
  }

  private async getHeaders(
    extra: Record<string, string> = {}
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...extra };
    if (this.authService) {
      try {
        const authHeaders = await this.authService.getAuthHeaders();
        Object.assign(headers, authHeaders);
      } catch {
        /* fall through to API key */
      }
    }
    if (!headers['Authorization']) {
      try {
        const store = ApiKeyStore.getInstance();
        const key = await store.getKey();
        if (key) headers['Authorization'] = `Bearer ${key}`;
      } catch {
        /* noop */
      }
    }
    return headers;
  }
}
