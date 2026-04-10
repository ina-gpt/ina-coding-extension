/**
 * Phase 12.2 — Access Control API Client
 * Communicates with backend access control endpoints.
 */

import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';
import {
  ApiKey, ApiKeyCreateRequest, ApiKeyCreateResult,
  Team, TeamCreateRequest, TeamMember,
  Permission, AuditLog, AuditSummary,
  RateLimitStatus, IntegrityResult,
} from './AccessTypes';

export class AccessClient {
  private static instance: AccessClient | null = null;
  private getHeaders: () => Promise<Record<string, string>>;

  private constructor(headersFn: () => Promise<Record<string, string>>) {
    this.getHeaders = headersFn;
  }

  static initialize(headersFn: () => Promise<Record<string, string>>): AccessClient {
    if (!AccessClient.instance) {
      AccessClient.instance = new AccessClient(headersFn);
    }
    return AccessClient.instance;
  }

  static getInstance(): AccessClient {
    if (!AccessClient.instance) {
      throw new Error('AccessClient not initialized');
    }
    return AccessClient.instance;
  }

  private get baseUrl(): string {
    return ConfigManager.getApiEndpoint();
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, 'Content-Type': 'application/json', ...options.headers },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
      throw new Error(err.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.data !== undefined ? data.data : data;
  }

  // ============ API Keys ============

  async listKeys(): Promise<ApiKey[]> {
    return this.request<ApiKey[]>('/api/access/keys');
  }

  async createKey(req: ApiKeyCreateRequest): Promise<ApiKeyCreateResult> {
    return this.request<ApiKeyCreateResult>('/api/access/keys', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async revokeKey(keyId: string, reason: string): Promise<void> {
    await this.request(`/api/access/keys/${keyId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  async rotateKey(keyId: string): Promise<ApiKeyCreateResult> {
    return this.request<ApiKeyCreateResult>(`/api/access/keys/${keyId}/rotate`, {
      method: 'POST',
    });
  }

  async updateKey(keyId: string, updates: { scopes?: string[]; rateLimitTier?: string }): Promise<void> {
    await this.request(`/api/access/keys/${keyId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async getKeyUsage(keyId: string): Promise<any> {
    return this.request(`/api/access/keys/${keyId}`);
  }

  // ============ Teams ============

  async listTeams(): Promise<any[]> {
    return this.request<any[]>('/api/access/teams');
  }

  async createTeam(req: TeamCreateRequest): Promise<Team> {
    return this.request<Team>('/api/access/teams', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  }

  async deleteTeam(teamId: string): Promise<void> {
    await this.request(`/api/access/teams/${teamId}`, { method: 'DELETE' });
  }

  async addMember(teamId: string, userId: string, role: string, permissions: string[]): Promise<void> {
    await this.request(`/api/access/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role, permissions }),
    });
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.request(`/api/access/teams/${teamId}/members`, {
      method: 'DELETE',
      body: JSON.stringify({ userId }),
    });
  }

  async updateMemberRole(teamId: string, userId: string, role: string): Promise<void> {
    await this.request(`/api/access/teams/${teamId}/members`, {
      method: 'PATCH',
      body: JSON.stringify({ userId, role }),
    });
  }

  // ============ Audit ============

  async getAuditLogs(filters?: Record<string, string>): Promise<{ entries: AuditLog[]; total: number }> {
    const params = new URLSearchParams(filters || {});
    return this.request<{ entries: AuditLog[]; total: number }>(`/api/access/audit?${params}`);
  }

  async getAuditSummary(windowDays?: number): Promise<AuditSummary> {
    const params = windowDays ? `?windowDays=${windowDays}` : '';
    return this.request<AuditSummary>(`/api/access/audit/summary${params}`);
  }

  async verifyAuditIntegrity(): Promise<IntegrityResult> {
    return this.request<IntegrityResult>('/api/access/audit?verify=true');
  }

  async exportAuditLog(format: string): Promise<string> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/api/access/audit?format=${format}&limit=10000`, {
      headers: { ...headers },
    });
    return response.text();
  }

  // ============ Permissions ============

  async getPermissions(): Promise<Permission[]> {
    return this.request<Permission[]>('/api/access/permissions');
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return this.request<RateLimitStatus>('/api/access/rate-limit');
  }

  // ============ Rate Limit Response Handling ============

  handleRateLimitResponse(headers: Headers): void {
    const remaining = headers.get('X-RateLimit-Remaining');
    const limit = headers.get('X-RateLimit-Limit');

    if (remaining && limit) {
      const remainNum = parseInt(remaining);
      const limitNum = parseInt(limit);
      if (remainNum < limitNum * 0.1) {
        Logger.warn(`Rate limit warning: ${remainNum}/${limitNum} remaining`);
      }
    }
  }
}
