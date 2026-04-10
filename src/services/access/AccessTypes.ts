/**
 * Phase 12.2 — Extension Access Control Types
 */

// ============ Enums ============

export enum ApiKeyRole {
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  USER = 'user',
  READONLY = 'readonly',
  SERVICE = 'service',
}

export enum RateLimitTier {
  FREE = 'free',
  STANDARD = 'standard',
  PRO = 'pro',
  UNLIMITED = 'unlimited',
  CUSTOM = 'custom',
}

export enum AuditSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

export enum TeamRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

// ============ Interfaces ============

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  role: ApiKeyRole;
  rateLimitTier: RateLimitTier;
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  metadata: Record<string, any>;
}

export interface ApiKeyCreateRequest {
  name: string;
  scopes: string[];
  role: ApiKeyRole;
  rateLimitTier: RateLimitTier;
  expiresInDays: number | null;
  metadata?: Record<string, any> | null;
}

export interface ApiKeyCreateResult {
  key: string;
  keyPrefix: string;
  apiKey: ApiKey;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  settings: Record<string, any>;
  maxMembers: number;
  rateLimitTier: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  permissions: string[];
  invitedBy: string | null;
  joinedAt: string;
}

export interface TeamCreateRequest {
  name: string;
  slug: string;
  description: string | null;
  maxMembers: number;
}

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isDefault: boolean;
  requiresRole: string | null;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  userId: string | null;
  apiKeyId: string | null;
  teamId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  statusCode: number | null;
  details: Record<string, any>;
  severity: AuditSeverity;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterMs: number | null;
  tier: string;
}

export interface AuthenticatedRequest {
  userId: string;
  apiKeyId: string | null;
  role: ApiKeyRole;
  scopes: string[];
  teamId: string | null;
  rateLimitTier: RateLimitTier;
}

export interface AccessConfig {
  apiKey: string | null;
  apiKeyId: string | null;
  role: ApiKeyRole | null;
  teamId: string | null;
  scopes: string[];
}

export type AccessEvent =
  | 'key-changed'
  | 'rate-limited'
  | 'permission-denied'
  | 'team-changed';

export interface RateLimitStatus {
  tier: RateLimitTier;
  remaining: {
    perSecond: number;
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  usage: {
    total: number;
    byEndpoint: Record<string, number>;
    byHour: { hour: string; count: number }[];
  };
}

export interface AuditSummary {
  totalEvents: number;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  uniqueUsers: number;
  securityEvents: number;
  rateLimitEvents: number;
  permissionDenials: number;
}

export interface IntegrityResult {
  valid: boolean;
  brokenAt: number | null;
  totalChecked: number;
}
