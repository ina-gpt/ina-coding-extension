/**
 * Phase 10.3 — Offline Mode Types
 * Comprehensive types for connectivity monitoring, offline queue, degraded mode.
 */

// ─── Connection State ───────────────────────────────────────────────

export enum ConnectionState {
  ONLINE = 'online',
  OFFLINE = 'offline',
  DEGRADED = 'degraded',
  RECONNECTING = 'reconnecting',
  UNKNOWN = 'unknown',
}

export enum ConnectionTarget {
  API_SERVER = 'api',
  OLLAMA = 'ollama',
  GPU = 'gpu',
  DATABASE = 'db',
  INTERNET = 'internet',
}

export interface TargetHealth {
  target: ConnectionTarget;
  state: ConnectionState;
  latencyMs: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  errorMessage: string | null;
  consecutiveFailures: number;
}

export interface ConnectionHealth {
  state: ConnectionState;
  targets: Record<string, TargetHealth>;
  lastCheckedAt: number;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;
  downDurationMs: number | null;
  reconnectAttempts: number;
}

// ─── Offline Queue ──────────────────────────────────────────────────

export enum OfflineRequestType {
  CHAT = 'chat',
  MEMORY_CREATE = 'memory_create',
  MEMORY_EXTRACT = 'memory_extract',
  INDEX_UPDATE = 'index_update',
  FEEDBACK = 'feedback',
  DOC_CRAWL = 'doc_crawl',
  ANALYTICS = 'analytics',
}

export interface OfflineQueueItem {
  id: string;
  type: OfflineRequestType;
  category: string;
  payload: any;
  createdAt: number;
  priority: number;
  expiresAt: number | null;
  retryCount: number;
  maxRetries: number;
  sizeBytes: number;
  status: 'queued' | 'syncing' | 'synced' | 'failed' | 'expired';
  error: string | null;
  result: any | null;
}

export interface SyncProgress {
  total: number;
  synced: number;
  failed: number;
  remaining: number;
  currentItem: string | null;
  startedAt: number;
  estimatedRemainingMs: number | null;
  errors: string[];
}

// ─── Capabilities ───────────────────────────────────────────────────

export interface OfflineCapability {
  name: string;
  availableOffline: boolean;
  degradedOffline: boolean;
  description: string;
  fallbackBehavior: string;
}

// ─── Local Model ────────────────────────────────────────────────────

export interface LocalModelConfig {
  enabled: boolean;
  modelName: string;
  modelPath: string | null;
  quantization: string | null;
  maxContextLength: number;
  downloadUrl: string | null;
  downloadSizeBytes: number | null;
  isDownloaded: boolean;
  lastUsedAt: number | null;
}

// ─── Degraded Mode Config ───────────────────────────────────────────

export interface DegradedModeConfig {
  enableCachedResponses: boolean;
  enableLocalModel: boolean;
  enableOfflineCompletion: boolean;
  enableOfflineSearch: boolean;
  showOfflineBanner: boolean;
  autoQueueRequests: boolean;
  maxQueueSize: number;
  queueExpirationMs: number;
  syncOnReconnect: boolean;
  syncBatchSize: number;
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  reconnectBackoffMs: number[];
  maxReconnectAttempts: number;
}

// ─── Degraded Response ──────────────────────────────────────────────

export interface DegradedResponse {
  content: string | null;
  source: 'cache' | 'local_model' | 'queued' | 'unavailable' | 'normal';
  quality: 'full' | 'degraded' | 'cached' | 'none';
  warning: string | null;
}

// ─── Events ─────────────────────────────────────────────────────────

export type OfflineEvent =
  | 'went-offline'
  | 'went-online'
  | 'degraded'
  | 'reconnecting'
  | 'reconnected'
  | 'queue-added'
  | 'queue-synced'
  | 'queue-failed'
  | 'sync-started'
  | 'sync-complete'
  | 'sync-failed'
  | 'local-model-ready'
  | 'local-model-error'
  | 'health-check';

// ─── Capabilities List ──────────────────────────────────────────────

export const OFFLINE_CAPABILITIES: OfflineCapability[] = [
  { name: 'Chat (cached)', availableOffline: true, degradedOffline: false, description: 'Cached responses for previously asked questions', fallbackBehavior: 'Return cached response if identical question was asked before' },
  { name: 'Chat (local model)', availableOffline: true, degradedOffline: true, description: 'Reduced quality responses via local model', fallbackBehavior: 'Use local INA Lite model for basic tasks' },
  { name: 'Tab Completion', availableOffline: true, degradedOffline: true, description: 'Basic completions from cache or local model', fallbackBehavior: 'Serve from completion cache, fall back to local model' },
  { name: 'Code Search', availableOffline: true, degradedOffline: true, description: 'Search local index if already built', fallbackBehavior: 'Keyword search on local files (no embedding search)' },
  { name: 'Git Integration', availableOffline: true, degradedOffline: false, description: 'Full git features (local operation)', fallbackBehavior: 'Fully functional — git is local' },
  { name: 'LSP Integration', availableOffline: true, degradedOffline: false, description: 'Full LSP features (local operation)', fallbackBehavior: 'Fully functional — LSP is local' },
  { name: 'Project Rules', availableOffline: true, degradedOffline: false, description: 'Rules are local files', fallbackBehavior: 'Fully functional' },
  { name: 'Memory Recall', availableOffline: true, degradedOffline: true, description: 'Limited to cached memories', fallbackBehavior: 'Return memories from last sync, no new recall' },
  { name: 'Agent Mode', availableOffline: false, degradedOffline: false, description: 'Requires server', fallbackBehavior: 'Disabled, show message' },
  { name: 'Image Analysis', availableOffline: false, degradedOffline: false, description: 'Requires GPU', fallbackBehavior: 'Disabled, queue for later' },
  { name: 'Doc Search', availableOffline: true, degradedOffline: true, description: 'Search locally cached docs', fallbackBehavior: 'Keyword search on cached doc chunks' },
];

// ─── Constants ──────────────────────────────────────────────────────

export const OFFLINE_CONSTANTS = {
  HEALTH_CHECK_INTERVAL_MS: 15000,
  HEALTH_CHECK_TIMEOUT_MS: 5000,
  RECONNECT_BACKOFF_MS: [1000, 2000, 5000, 10000, 30000, 60000],
  MAX_RECONNECT_ATTEMPTS: 50,
  MAX_QUEUE_SIZE: 200,
  MAX_QUEUE_SIZE_BYTES: 10485760, // 10MB
  QUEUE_EXPIRATION_MS: 86400000, // 24h
  SYNC_BATCH_SIZE: 10,
  SYNC_DELAY_AFTER_RECONNECT_MS: 3000,
  DEGRADED_THRESHOLD_LATENCY_MS: 5000,
};
