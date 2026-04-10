/**
 * CloudAgentClient.ts
 * Phase 19B Step 19.1 — Extension client for /api/cloud-agent/*
 *
 * Mirrors the SkillClient pattern: same auth chain, same SSE handling.
 * Lives under marketplace/ to keep all "client to backend" services
 * grouped, even though it talks to the cloud-agent endpoints.
 */

import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { AuthService } from '../AuthService';
import { ApiKeyStore } from '../access/ApiKeyStore';

// ============================================================

export type CloudAgentStatusView =
  | 'queued'
  | 'provisioning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export interface CloudAgentView {
  id: string;
  userId: string;
  taskDescription: string;
  status: CloudAgentStatusView;
  containerId: string | null;
  containerImage: string;
  resourceLimits: any;
  result: any | null;
  logs: string[];
  priority: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  errorMessage: string | null;
}

export interface CloudAgentSystemStatusView {
  totalQueued: number;
  totalRunning: number;
  capacity: number;
  averageWaitTimeMs: number;
  throughputPerHour: number;
  containerCounts: Record<string, number>;
  dockerAvailable: boolean;
}

export interface CloudAgentEventView {
  type: string;
  agentId: string;
  timestamp: number;
  data?: any;
}

// ============================================================

export class CloudAgentClient {
  private static instance: CloudAgentClient;

  private authService: AuthService | null = null;

  private constructor() {}

  static getInstance(): CloudAgentClient {
    if (!CloudAgentClient.instance) {
      CloudAgentClient.instance = new CloudAgentClient();
    }
    return CloudAgentClient.instance;
  }

  setAuthService(authService: AuthService): void {
    this.authService = authService;
  }

  // ============================================================
  // API
  // ============================================================

  async dispatch(
    taskDescription: string,
    options: { priority?: number; resourceLimits?: any } = {}
  ): Promise<CloudAgentView> {
    const response = await this.request('/api/cloud-agent/dispatch', {
      method: 'POST',
      body: JSON.stringify({ taskDescription, ...options }),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'dispatch failed');
    return json.agent;
  }

  async listAgents(options: {
    status?: CloudAgentStatusView;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ agents: CloudAgentView[]; total: number }> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const response = await this.request(`/api/cloud-agent/agents?${params.toString()}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'list failed');
    return { agents: json.agents ?? [], total: json.total ?? 0 };
  }

  async getAgent(id: string): Promise<CloudAgentView> {
    const response = await this.request(`/api/cloud-agent/agents/${encodeURIComponent(id)}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'get failed');
    return json.agent;
  }

  async cancelAgent(id: string): Promise<void> {
    const response = await this.request(
      `/api/cloud-agent/agents/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' }
    );
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'cancel failed');
  }

  async deleteAgent(id: string): Promise<void> {
    const response = await this.request(`/api/cloud-agent/agents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'delete failed');
  }

  async getStatus(): Promise<CloudAgentSystemStatusView> {
    const response = await this.request('/api/cloud-agent/status');
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'status failed');
    return json.status;
  }

  // ============================================================
  // SSE stream
  // ============================================================

  streamProgress(
    id: string,
    onEvent: (event: CloudAgentEventView) => void
  ): () => void {
    let cancelled = false;
    const abort = new AbortController();

    const run = async () => {
      try {
        const url = `${this.getApiUrl()}/api/cloud-agent/agents/${encodeURIComponent(id)}/stream`;
        const response = await fetch(url, {
          headers: await this.getHeaders({ Accept: 'text/event-stream' }),
          signal: abort.signal,
        });
        if (!response.ok || !response.body) throw new Error(`SSE HTTP ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            const lines = part.split('\n');
            let eventName = 'message';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr += line.slice(6);
            }
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              onEvent({ type: eventName, agentId: id, timestamp: Date.now(), ...data });
            } catch {
              /* skip */
            }
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        Logger.warn(`[CloudAgentClient] SSE failed: ${String(e)}`);
      }
    };
    run();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.getApiUrl()}${path}`;
    const headers = await this.getHeaders(init.headers as Record<string, string> | undefined);
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

  private async getHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...extra };
    if (this.authService) {
      try {
        const authHeaders = await this.authService.getAuthHeaders();
        Object.assign(headers, authHeaders);
      } catch {
        /* fall through */
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
