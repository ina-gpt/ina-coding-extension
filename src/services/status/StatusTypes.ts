/**
 * Phase 11.4 — Status Types
 * Comprehensive type system for system status, health monitoring, and token tracking.
 */

export interface SystemStatus {
  connection: ConnectionStatus;
  model: ModelStatus;
  indexing: IndexingStatus;
  requests: RequestStatus;
  tokens: TokenUsage;
  agent: AgentActivityStatus;
  git: GitActivityStatus;
  diagnostics: DiagnosticsSummary;
  memory: MemoryStatus;
  rules: RulesStatus;
  cache: CacheHealth;
  circuitBreakers: CircuitBreakerSummary;
  overall: OverallHealth;
  timestamp: number;
}

export enum OverallHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  OFFLINE = 'offline',
  UNKNOWN = 'unknown',
}

export interface ConnectionStatus {
  state: 'online' | 'offline' | 'degraded' | 'reconnecting';
  latencyMs: number | null;
  lastCheckedAt: number;
  target: string;
  uptime: number | null;
}

export interface ModelStatus {
  state: 'ready' | 'loading' | 'unavailable' | 'unknown';
  modelName: string | null;
  vramUsedMB: number | null;
  vramTotalMB: number | null;
  vramPercent: number | null;
  lastResponseMs: number | null;
  requestsActive: number;
  queueDepth: number;
}

export interface IndexingStatus {
  state: 'idle' | 'scanning' | 'indexing' | 'embedding' | 'complete' | 'error' | 'paused';
  progress: number | null;
  filesTotal: number | null;
  filesProcessed: number | null;
  chunksTotal: number | null;
  chunksProcessed: number | null;
  currentFile: string | null;
  estimatedRemainingMs: number | null;
  lastIndexedAt: number | null;
  errorMessage: string | null;
}

export interface RequestStatus {
  active: number;
  queued: number;
  totalInSession: number;
  failedInSession: number;
  avgLatencyMs: number | null;
  requestsPerMinute: number;
  byCategory: Record<string, { active: number; queued: number }>;
}

export interface TokenUsage {
  sessionTokensIn: number;
  sessionTokensOut: number;
  sessionTotalTokens: number;
  estimatedCostUSD: number | null;
  lastRequestTokensIn: number | null;
  lastRequestTokensOut: number | null;
  contextWindowUsed: number | null;
  contextWindowMax: number | null;
  contextWindowPercent: number | null;
  dailyTokens: number;
  monthlyTokens: number;
}

export interface AgentActivityStatus {
  isActive: boolean;
  sessionId: string | null;
  status: string | null;
  currentStep: string | null;
  progress: number | null;
  filesChanged: number;
}

export interface GitActivityStatus {
  branch: string | null;
  isClean: boolean;
  changesCount: number;
  ahead: number;
  behind: number;
}

export interface DiagnosticsSummary {
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
  filesWithErrors: number;
}

export interface MemoryStatus {
  memoriesCount: number;
  lastRecallCount: number | null;
  autoExtractEnabled: boolean;
}

export interface RulesStatus {
  projectRulesActive: boolean;
  globalRulesActive: boolean;
  rulesCount: number;
  conflictsCount: number;
}

export interface CacheHealth {
  hitRate: number;
  totalEntries: number;
  totalSizeMB: number;
  maxSizeMB: number;
}

export interface CircuitBreakerSummary {
  total: number;
  closed: number;
  open: number;
  halfOpen: number;
  trippedNames: string[];
}

export interface StatusBarItemConfig {
  id: string;
  text: string;
  tooltip: string;
  icon: string;
  color: string | null;
  backgroundColor: string | null;
  command: string | null;
  priority: number;
  alignment: 'left' | 'right';
  visible: boolean;
}

export interface StatusUpdateEvent {
  source: string;
  field: string;
  value: any;
  timestamp: number;
}

export interface TokenTrackingConfig {
  enableTracking: boolean;
  showInStatusBar: boolean;
  showInChat: boolean;
  warnAtPercent: number;
  errorAtPercent: number;
  estimateCost: boolean;
  costPerMillionTokens: number | null;
}

export interface HealthReport {
  overall: OverallHealth;
  sections: HealthSection[];
  recommendations: string[];
  timestamp: number;
}

export interface HealthSection {
  name: string;
  status: OverallHealth;
  icon: string;
  details: HealthDetail[];
}

export interface HealthDetail {
  label: string;
  value: string;
  status: 'good' | 'warn' | 'error' | 'neutral';
  tooltip: string | null;
}

export const STATUS_CONSTANTS = {
  UPDATE_INTERVAL_MS: 2000,
  STATUS_BAR_PRIORITY_BASE: 100,
  TOKEN_WARN_THRESHOLD: 0.8,
  TOKEN_ERROR_THRESHOLD: 0.95,
  LATENCY_GOOD_MS: 500,
  LATENCY_WARN_MS: 2000,
  LATENCY_BAD_MS: 5000,
  VRAM_WARN_PERCENT: 85,
  VRAM_ERROR_PERCENT: 95,
  INDEX_STALE_HOURS: 24,
  MAX_TOKEN_HISTORY: 1000,
};

export function getDefaultSystemStatus(): SystemStatus {
  return {
    connection: { state: 'online', latencyMs: null, lastCheckedAt: 0, target: '', uptime: null },
    model: { state: 'unknown', modelName: null, vramUsedMB: null, vramTotalMB: null, vramPercent: null, lastResponseMs: null, requestsActive: 0, queueDepth: 0 },
    indexing: { state: 'idle', progress: null, filesTotal: null, filesProcessed: null, chunksTotal: null, chunksProcessed: null, currentFile: null, estimatedRemainingMs: null, lastIndexedAt: null, errorMessage: null },
    requests: { active: 0, queued: 0, totalInSession: 0, failedInSession: 0, avgLatencyMs: null, requestsPerMinute: 0, byCategory: {} },
    tokens: { sessionTokensIn: 0, sessionTokensOut: 0, sessionTotalTokens: 0, estimatedCostUSD: null, lastRequestTokensIn: null, lastRequestTokensOut: null, contextWindowUsed: null, contextWindowMax: null, contextWindowPercent: null, dailyTokens: 0, monthlyTokens: 0 },
    agent: { isActive: false, sessionId: null, status: null, currentStep: null, progress: null, filesChanged: 0 },
    git: { branch: null, isClean: true, changesCount: 0, ahead: 0, behind: 0 },
    diagnostics: { errors: 0, warnings: 0, infos: 0, hints: 0, filesWithErrors: 0 },
    memory: { memoriesCount: 0, lastRecallCount: null, autoExtractEnabled: true },
    rules: { projectRulesActive: false, globalRulesActive: false, rulesCount: 0, conflictsCount: 0 },
    cache: { hitRate: 0, totalEntries: 0, totalSizeMB: 0, maxSizeMB: 100 },
    circuitBreakers: { total: 0, closed: 0, open: 0, halfOpen: 0, trippedNames: [] },
    overall: OverallHealth.UNKNOWN,
    timestamp: Date.now(),
  };
}
