/**
 * Phase 12.1 — Privacy Types
 * Comprehensive privacy-by-design type system.
 */

export enum PrivacyMode {
  STANDARD = 'standard',
  STRICT = 'strict',
  LOCAL_ONLY = 'local_only',
  AIR_GAPPED = 'air_gapped',
}

export interface PrivacyConfig {
  mode: PrivacyMode;
  telemetry: TelemetryConfig;
  dataRetention: DataRetentionConfig;
  encryption: EncryptionConfig;
  communication: CommunicationConfig;
  consent: ConsentConfig;
  dataMinimization: DataMinimizationConfig;
  localProcessing: LocalProcessingConfig;
}

export interface TelemetryConfig {
  enabled: boolean;
  anonymousUsageStats: boolean;
  errorReporting: boolean;
  performanceMetrics: boolean;
  featureUsageTracking: boolean;
  crashReports: boolean;
  neverSendCodeContent: boolean;
  neverSendFilePaths: boolean;
  neverSendUserIdentity: boolean;
}

export interface DataRetentionConfig {
  chatHistoryDays: number;
  memoryRetentionDays: number;
  cacheRetentionDays: number;
  errorLogRetentionDays: number;
  tokenHistoryRetentionDays: number;
  offlineQueueRetentionHours: number;
  autoDeleteExpired: boolean;
  deleteOnUninstall: boolean;
}

export interface EncryptionConfig {
  encryptAtRest: boolean;
  encryptionAlgorithm: string;
  keyDerivation: string;
  keyDerivationIterations: number;
  encryptChatHistory: boolean;
  encryptMemories: boolean;
  encryptCache: boolean;
  encryptOfflineQueue: boolean;
  encryptGlobalRules: boolean;
}

export interface CommunicationConfig {
  requireTLS: boolean;
  tlsMinVersion: string;
  certificatePinning: boolean;
  apiKeyRotationDays: number | null;
  sanitizeOutgoingRequests: boolean;
  stripSensitiveHeaders: boolean;
  logRequestBodies: boolean;
}

export interface ConsentConfig {
  requireConsentForMemory: boolean;
  requireConsentForIndexing: boolean;
  requireConsentForAnalytics: boolean;
  showPrivacyNoticeOnFirstRun: boolean;
  consentVersion: string;
  userConsents: Record<string, { granted: boolean; grantedAt: number; version: string }>;
}

export interface DataMinimizationConfig {
  stripFilePathsInLogs: boolean;
  stripUserNamesInLogs: boolean;
  hashIdentifiers: boolean;
  truncateCodeInErrors: boolean;
  maxCodeContextLines: number;
  excludeEnvFiles: boolean;
  excludeSecrets: boolean;
  sensitiveFilePatterns: string[];
}

export interface LocalProcessingConfig {
  preferLocalModel: boolean;
  localModelName: string | null;
  localEmbeddingModel: string | null;
  offlineSearchEnabled: boolean;
  localGitOnly: boolean;
  localLSPOnly: boolean;
  localRulesOnly: boolean;
}

export interface PrivacyAuditEntry {
  timestamp: number;
  action: PrivacyAuditAction;
  category: string;
  description: string;
  dataType: string;
  destination: 'local' | 'server' | 'external';
  dataSizeBytes: number | null;
  encrypted: boolean;
  sanitized: boolean;
  userId: string | null;
}

export enum PrivacyAuditAction {
  DATA_SENT = 'data_sent',
  DATA_STORED = 'data_stored',
  DATA_DELETED = 'data_deleted',
  DATA_ENCRYPTED = 'data_encrypted',
  DATA_DECRYPTED = 'data_decrypted',
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
  SECRET_DETECTED = 'secret_detected',
  SECRET_STRIPPED = 'secret_stripped',
  PRIVACY_MODE_CHANGED = 'privacy_mode_changed',
}

export interface DataInventory {
  category: string;
  description: string;
  storageLocation: string;
  encrypted: boolean;
  retentionDays: number;
  purpose: string;
  canDelete: boolean;
  canExport: boolean;
  dataVolume: string;
}

export interface PrivacyAuditReport {
  timestamp: number;
  mode: PrivacyMode;
  findings: AuditFinding[];
  dataInventory: DataInventory[];
  complianceStatus: ComplianceStatus;
  recommendations: string[];
}

export interface AuditFinding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  description: string;
  recommendation: string;
}

export interface ComplianceStatus {
  gdprCompliant: boolean;
  dataMinimized: boolean;
  encryptionEnabled: boolean;
  retentionPolicyActive: boolean;
  consentManaged: boolean;
  auditLogging: boolean;
  rightToErasure: boolean;
  rightToPortability: boolean;
  issues: string[];
}

export type PrivacyEvent = 'mode-changed' | 'consent-changed' | 'data-deleted' | 'secret-detected' | 'audit-entry' | 'encryption-changed' | 'retention-cleanup';

export const SENSITIVE_PATTERNS: RegExp[] = [
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi,
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/gi,
  /(?:secret|token)\s*[:=]\s*['"][^'"]+['"]/gi,
  /(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=\s*\S+/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
  /(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /sk-[A-Za-z0-9]{48}/g,
  /postgres(?:ql)?:\/\/[^\s]+/gi,
  /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
  /(?:PRIVATE_KEY|private_key)\s*[:=]\s*['"][^'"]+['"]/gi,
];

export const PRIVACY_DEFAULTS: PrivacyConfig = {
  mode: PrivacyMode.STANDARD,
  telemetry: {
    enabled: false, anonymousUsageStats: false, errorReporting: false,
    performanceMetrics: false, featureUsageTracking: false, crashReports: false,
    neverSendCodeContent: true, neverSendFilePaths: true, neverSendUserIdentity: true,
  },
  dataRetention: {
    chatHistoryDays: 90, memoryRetentionDays: 365, cacheRetentionDays: 7,
    errorLogRetentionDays: 30, tokenHistoryRetentionDays: 30, offlineQueueRetentionHours: 24,
    autoDeleteExpired: true, deleteOnUninstall: true,
  },
  encryption: {
    encryptAtRest: true, encryptionAlgorithm: 'aes-256-gcm', keyDerivation: 'pbkdf2',
    keyDerivationIterations: 100000, encryptChatHistory: true, encryptMemories: true,
    encryptCache: false, encryptOfflineQueue: true, encryptGlobalRules: false,
  },
  communication: {
    requireTLS: true, tlsMinVersion: 'TLSv1.2', certificatePinning: false,
    apiKeyRotationDays: null, sanitizeOutgoingRequests: true, stripSensitiveHeaders: true,
    logRequestBodies: false,
  },
  consent: {
    requireConsentForMemory: false, requireConsentForIndexing: false,
    requireConsentForAnalytics: true, showPrivacyNoticeOnFirstRun: true,
    consentVersion: '1.0', userConsents: {},
  },
  dataMinimization: {
    stripFilePathsInLogs: true, stripUserNamesInLogs: true, hashIdentifiers: true,
    truncateCodeInErrors: true, maxCodeContextLines: 50, excludeEnvFiles: true,
    excludeSecrets: true, sensitiveFilePatterns: ['.env*', '*.pem', '*.key', '*.cert', 'id_rsa*', '*.p12', '.ssh/*', 'credentials*', 'secrets*', '*.secret'],
  },
  localProcessing: {
    preferLocalModel: false, localModelName: null, localEmbeddingModel: null,
    offlineSearchEnabled: true, localGitOnly: true, localLSPOnly: true, localRulesOnly: true,
  },
};
