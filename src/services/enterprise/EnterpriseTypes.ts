/**
 * Phase 13.4 — Enterprise Edition Types (Extension)
 */

export type SSOProviderType = 'saml' | 'oidc' | 'ldap';
export type ModelProvider = 'ollama' | 'openai' | 'anthropic' | 'azure' | 'custom' | 'vllm' | 'tgi' | 'llamacpp';
export type ModelCapability = 'chat' | 'completion' | 'embedding' | 'vision' | 'function_calling';
export type EnterprisePlan = 'starter' | 'professional' | 'enterprise' | 'unlimited';

export interface SSOProvider {
  id: string;
  teamId: string;
  type: SSOProviderType;
  name: string;
  displayName: string | null;
  isActive: boolean;
  isDefault: boolean;
  clientId: string | null;
  issuerUrl: string | null;
  scopes: string[];
  allowedDomains: string[] | null;
  autoProvisionUsers: boolean;
  autoAssignRole: string;
  enforceMfa: boolean;
  sessionLifetimeMinutes: number;
  createdAt: Date;
}

export interface UsageMetrics {
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokens: number;
  uniqueUsers: number;
  avgLatencyMs: number;
  errorRate: number;
  byCategory: Record<string, { requests: number; tokens: number; avgLatency: number }>;
  byModel: Record<string, { requests: number; tokens: number }>;
  topUsers: { userId: string; requests: number; tokens: number }[];
  peakHour: number;
  costEstimate: number;
}

export interface UsageDashboard {
  overview: UsageMetrics;
  dailyTrend: { date: string; requests: number; tokens: number }[];
  hourlyDistribution: { hour: number; requests: number }[];
  modelUsage: { model: string; percentage: number; tokens: number }[];
  categoryBreakdown: { category: string; percentage: number }[];
  userActivity: { userId: string; name: string | null; requests: number; tokens: number; lastActive: Date }[];
  alerts: UsageAlert[];
}

export interface UsageAlert {
  type: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
}

export interface ModelConfig {
  id: string;
  teamId: string | null;
  name: string;
  displayName: string;
  provider: ModelProvider;
  modelId: string;
  endpointUrl: string | null;
  capabilities: ModelCapability[];
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  costPerMillionInput: number;
  costPerMillionOutput: number;
  isActive: boolean;
  isDefault: boolean;
  healthStatus: string;
  avgLatencyMs: number | null;
  createdAt: Date;
}

export interface ModelHealthCheck {
  modelId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number | null;
  lastCheckAt: Date;
  errorMessage: string | null;
}

export interface EnterpriseLicense {
  id: string;
  licenseKey: string;
  teamId: string | null;
  plan: EnterprisePlan;
  maxUsers: number;
  maxModels: number;
  features: Record<string, any>;
  validFrom: Date;
  validUntil: Date | null;
  isActive: boolean;
  issuedBy: string;
  createdAt: Date;
}

export interface AdminSetting {
  key: string;
  value: any;
  category: string;
  description: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

export interface AdminDashboard {
  systemHealth: { status: string; uptime: number; version: string; nodeVersion: string; dbSize: string };
  userStats: { total: number; active: number; newThisMonth: number };
  usageStats: UsageMetrics;
  modelStats: ModelHealthCheck[];
  storageStats: { dbSizeMB: number; indexSizeMB: number; cacheSizeMB: number };
  securityStats: { failedLogins: number; apiKeyRotations: number; auditEntries: number; activeSessions: number };
}

export interface EnterpriseConfig {
  ssoEnabled: boolean;
  analyticsEnabled: boolean;
  customModelsEnabled: boolean;
  adminDashboardEnabled: boolean;
  licenseKey: string | null;
  plan: EnterprisePlan | null;
}

export type EnterpriseEvent = 'sso-login' | 'sso-logout' | 'analytics-updated' | 'model-changed' | 'license-activated' | 'settings-changed';
