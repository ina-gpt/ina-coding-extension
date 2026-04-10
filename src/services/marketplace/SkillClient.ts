/**
 * SkillClient.ts
 * Phase 19B Step 19.2 — Extension client for the marketplace API
 *
 * Talks to /api/marketplace/* endpoints. Uses the same auth pattern as
 * the main ApiService (OAuth Bearer → ApiKeyStore fallback).
 */

import * as fs from 'fs';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { AuthService } from '../AuthService';
import { ApiKeyStore } from '../access/ApiKeyStore';

// ============================================================
// Types (mirror backend shapes — kept loose with `any` for the LLM-defined
// step bodies so we don't drift)
// ============================================================

export type SkillCategoryView =
  | 'code_generation'
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'devops'
  | 'security'
  | 'review'
  | 'data'
  | 'custom';

export interface SkillView {
  id: string;
  name: string;
  slug: string;
  version: string;
  author: string;
  description: string;
  longDescription: string;
  category: SkillCategoryView;
  icon: string;
  tags: string[];
  steps: any[];
  config: any;
  inputs: any[];
  outputs: any[];
  installCount: number;
  rating: number;
  ratingCount: number;
  visibility: 'public' | 'team' | 'private';
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface InstalledSkillView {
  installed: {
    id: string;
    skillId: string;
    userId: string;
    config: any;
    usageCount: number;
    installedAt: number;
  };
  skill: SkillView | null;
}

export interface SkillExecutionEvent {
  type: string;
  skillId: string;
  stepOrder?: number;
  stepName?: string;
  output?: any;
  error?: string;
  timestamp: number;
}

// ============================================================

export class SkillClient {
  private static instance: SkillClient;

  private authService: AuthService | null = null;

  private constructor() {}

  static getInstance(): SkillClient {
    if (!SkillClient.instance) {
      SkillClient.instance = new SkillClient();
    }
    return SkillClient.instance;
  }

  setAuthService(authService: AuthService): void {
    this.authService = authService;
  }

  // ============================================================
  // Browse / details
  // ============================================================

  async browseSkills(options: {
    query?: string;
    category?: SkillCategoryView;
    sort?: 'popular' | 'recent' | 'rating';
    limit?: number;
    offset?: number;
  } = {}): Promise<{ skills: SkillView[]; total: number }> {
    const params = new URLSearchParams();
    if (options.query) params.set('query', options.query);
    if (options.category) params.set('category', options.category);
    if (options.sort) params.set('sort', options.sort);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const response = await this.request(`/api/marketplace/skills?${params.toString()}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'browseSkills failed');
    return { skills: json.skills ?? [], total: json.total ?? 0 };
  }

  async getBuiltinSkills(): Promise<SkillView[]> {
    const response = await this.request('/api/marketplace/builtin');
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'getBuiltinSkills failed');
    return json.skills ?? [];
  }

  async getSkill(slugOrId: string): Promise<SkillView> {
    const response = await this.request(`/api/marketplace/skills/${encodeURIComponent(slugOrId)}`);
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'getSkill failed');
    return json.skill;
  }

  async getInstalled(): Promise<InstalledSkillView[]> {
    const response = await this.request('/api/marketplace/installed');
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'getInstalled failed');
    return json.installed ?? [];
  }

  // ============================================================
  // Mutations
  // ============================================================

  async installSkill(slugOrId: string): Promise<void> {
    const response = await this.request(
      `/api/marketplace/skills/${encodeURIComponent(slugOrId)}/install`,
      { method: 'POST' }
    );
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'install failed');
  }

  async uninstallSkill(slugOrId: string): Promise<void> {
    const response = await this.request(
      `/api/marketplace/skills/${encodeURIComponent(slugOrId)}/install`,
      { method: 'DELETE' }
    );
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'uninstall failed');
  }

  async rateSkill(slugOrId: string, rating: number): Promise<void> {
    const response = await this.request(
      `/api/marketplace/skills/${encodeURIComponent(slugOrId)}/rate`,
      { method: 'POST', body: JSON.stringify({ rating }) }
    );
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'rate failed');
  }

  async createSkill(skill: Partial<SkillView>): Promise<SkillView> {
    const response = await this.request('/api/marketplace/skills', {
      method: 'POST',
      body: JSON.stringify(skill),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'create failed');
    return json.skill;
  }

  async updateSkill(id: string, updates: Partial<SkillView>): Promise<SkillView> {
    const response = await this.request(`/api/marketplace/skills/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'update failed');
    return json.skill;
  }

  async deleteSkill(id: string): Promise<void> {
    const response = await this.request(`/api/marketplace/skills/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'delete failed');
  }

  // ============================================================
  // Import / export
  // ============================================================

  async importSkill(filePath: string): Promise<{ skill: SkillView; isUpgrade: boolean }> {
    const text = fs.readFileSync(filePath, 'utf8');
    const response = await this.request('/api/marketplace/skills/import', {
      method: 'POST',
      body: text,
    });
    const json = await response.json();
    if (!json.success) throw new Error(json.error?.message ?? 'import failed');
    return { skill: json.skill, isUpgrade: !!json.isUpgrade };
  }

  async exportSkill(slugOrId: string, savePath: string): Promise<void> {
    const response = await this.request(
      `/api/marketplace/skills/${encodeURIComponent(slugOrId)}/export`
    );
    if (!response.ok) {
      throw new Error(`Export HTTP ${response.status}`);
    }
    const text = await response.text();
    fs.writeFileSync(savePath, text, 'utf8');
  }

  // ============================================================
  // Execute (SSE stream)
  // ============================================================

  /**
   * Start a skill execution. Returns an unsubscribe function. Events are
   * delivered to the callback in order; the stream auto-closes after
   * `execution-completed` / `execution-failed`.
   */
  executeSkill(
    slugOrId: string,
    inputs: Record<string, any>,
    onEvent: (event: SkillExecutionEvent) => void,
    context: Record<string, any> = {}
  ): () => void {
    let cancelled = false;
    const abort = new AbortController();

    const run = async () => {
      try {
        const url = `${this.getApiUrl()}/api/marketplace/skills/${encodeURIComponent(slugOrId)}/execute`;
        const response = await fetch(url, {
          method: 'POST',
          headers: await this.getHeaders({ Accept: 'text/event-stream' }),
          body: JSON.stringify({ inputs, context }),
          signal: abort.signal,
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
              onEvent({ type: eventName, ...data });
            } catch {
              /* skip */
            }
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        Logger.warn(`[SkillClient] execute stream failed: ${String(e)}`);
        onEvent({
          type: 'execution-failed',
          skillId: slugOrId,
          error: e?.message ?? String(e),
          timestamp: Date.now(),
        });
      }
    };
    run();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }

  // ============================================================
  // Internal helpers (mirrors AsyncSessionClient)
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
