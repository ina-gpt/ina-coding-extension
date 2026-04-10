/**
 * Phase 13.4 — Enterprise Client
 * API client for enterprise endpoints.
 */
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';
import type {
  SSOProvider, UsageDashboard, ModelConfig, ModelHealthCheck,
  EnterpriseLicense, AdminDashboard, AdminSetting
} from './EnterpriseTypes';

export class EnterpriseClient {
  private static instance: EnterpriseClient;
  private headersFn: (() => Promise<Record<string, string>>) | null = null;

  private constructor() {}

  static getInstance(): EnterpriseClient {
    if (!EnterpriseClient.instance) {
      EnterpriseClient.instance = new EnterpriseClient();
    }
    return EnterpriseClient.instance;
  }

  initialize(headersFn: () => Promise<Record<string, string>>): void {
    this.headersFn = headersFn;
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const endpoint = ConfigManager.getApiEndpoint();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(this.headersFn ? await this.headersFn() : {}) };
    const res = await fetch(`${endpoint}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  // SSO
  async listSSOProviders(teamId: string): Promise<SSOProvider[]> {
    const data = await this.request<{ providers: SSOProvider[] }>('GET', `/api/enterprise/sso/providers?teamId=${teamId}`);
    return data.providers;
  }

  async createSSOProvider(request: any): Promise<SSOProvider> {
    const data = await this.request<{ provider: SSOProvider }>('POST', '/api/enterprise/sso/providers', request);
    return data.provider;
  }

  async updateSSOProvider(id: string, updates: any): Promise<SSOProvider> {
    const data = await this.request<{ provider: SSOProvider }>('PATCH', `/api/enterprise/sso/providers/${id}`, updates);
    return data.provider;
  }

  async deleteSSOProvider(id: string): Promise<void> {
    await this.request('DELETE', `/api/enterprise/sso/providers/${id}`);
  }

  async initiateSSOLogin(providerId: string): Promise<{ authUrl: string; state: string }> {
    return this.request('GET', `/api/enterprise/sso/login?provider_id=${providerId}`);
  }

  async getActiveSessions(teamId?: string): Promise<any[]> {
    const q = teamId ? `?teamId=${teamId}` : '';
    const data = await this.request<{ sessions: any[] }>('GET', `/api/enterprise/sso/sessions${q}`);
    return data.sessions;
  }

  async revokeAllSessions(teamId: string): Promise<void> {
    await this.request('DELETE', '/api/enterprise/sso/sessions', { teamId });
  }

  // Analytics
  async getDashboard(options?: { days?: number; teamId?: string }): Promise<UsageDashboard> {
    const params = new URLSearchParams();
    if (options?.days) params.set('days', String(options.days));
    if (options?.teamId) params.set('teamId', options.teamId);
    return this.request('GET', `/api/enterprise/analytics?${params}`);
  }

  async generateReport(config: any): Promise<string> {
    const res = await this.request<any>('POST', '/api/enterprise/analytics/report', config);
    return typeof res === 'string' ? res : JSON.stringify(res);
  }

  async getEvents(filters?: any): Promise<any[]> {
    const params = new URLSearchParams();
    if (filters?.since) params.set('since', filters.since);
    if (filters?.until) params.set('until', filters.until);
    if (filters?.userId) params.set('userId', filters.userId);
    if (filters?.category) params.set('category', filters.category);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const data = await this.request<{ events: any[] }>('GET', `/api/enterprise/analytics/events?${params}`);
    return data.events;
  }

  // Models
  async listModels(teamId?: string): Promise<ModelConfig[]> {
    const q = teamId ? `?teamId=${teamId}` : '';
    const data = await this.request<{ models: ModelConfig[] }>('GET', `/api/enterprise/models${q}`);
    return data.models;
  }

  async registerModel(request: any): Promise<ModelConfig> {
    const data = await this.request<{ model: ModelConfig }>('POST', '/api/enterprise/models', request);
    return data.model;
  }

  async updateModel(id: string, updates: any): Promise<ModelConfig> {
    const data = await this.request<{ model: ModelConfig }>('PATCH', `/api/enterprise/models/${id}`, updates);
    return data.model;
  }

  async deleteModel(id: string): Promise<void> {
    await this.request('DELETE', `/api/enterprise/models/${id}`);
  }

  async checkModelHealth(id: string): Promise<ModelHealthCheck> {
    return this.request('GET', `/api/enterprise/models/${id}/health`);
  }

  async setDefaultModel(id: string): Promise<void> {
    await this.request('PATCH', `/api/enterprise/models/${id}`, { isDefault: true });
  }

  // Admin
  async getAdminDashboard(): Promise<AdminDashboard> {
    return this.request('GET', '/api/enterprise/admin');
  }

  async getSettings(category?: string): Promise<AdminSetting[]> {
    const q = category ? `?category=${category}` : '';
    const data = await this.request<{ settings: AdminSetting[] }>('GET', `/api/enterprise/admin/settings${q}`);
    return data.settings;
  }

  async updateSetting(key: string, value: any): Promise<void> {
    await this.request('PATCH', '/api/enterprise/admin/settings', { key, value });
  }

  async listUsers(filters?: any): Promise<{ users: any[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.role) params.set('role', filters.role);
    if (filters?.limit) params.set('limit', String(filters.limit));
    if (filters?.offset) params.set('offset', String(filters.offset));
    return this.request('GET', `/api/enterprise/admin/users?${params}`);
  }

  async updateUser(userId: string, updates: any): Promise<void> {
    await this.request('PATCH', '/api/enterprise/admin/users', { userId, ...updates });
  }

  async getLicense(): Promise<EnterpriseLicense | null> {
    const data = await this.request<{ license: EnterpriseLicense | null }>('GET', '/api/enterprise/admin/license');
    return data.license;
  }

  async activateLicense(key: string): Promise<EnterpriseLicense> {
    const data = await this.request<{ license: EnterpriseLicense }>('POST', '/api/enterprise/admin/license', { licenseKey: key });
    return data.license;
  }
}
