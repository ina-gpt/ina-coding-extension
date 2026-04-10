/**
 * Phase 10.4 — Error Recovery Types
 * Comprehensive type definitions for error management, classification, and recovery.
 */

// ─── Error Classification ───────────────────────────────────────────

export enum ErrorCategory {
  NETWORK = 'network', API = 'api', AUTH = 'auth', MODEL = 'model',
  TIMEOUT = 'timeout', RATE_LIMIT = 'rate_limit', SERVER = 'server',
  GPU = 'gpu', DATABASE = 'db', PARSING = 'parsing', VALIDATION = 'validation',
  FILE_SYSTEM = 'fs', LSP = 'lsp', GIT = 'git', EXTENSION = 'extension',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  FATAL = 'fatal', ERROR = 'error', WARNING = 'warning',
  TRANSIENT = 'transient', IGNORABLE = 'ignorable',
}

export enum ErrorAction {
  RETRY = 'retry', FALLBACK = 'fallback', QUEUE = 'queue', ABORT = 'abort',
  NOTIFY = 'notify', IGNORE = 'ignore', ESCALATE = 'escalate', SELF_HEAL = 'self_heal',
}

export interface ErrorContext {
  requestId: string | null;
  category: string | null;
  operation: string;
  filePath: string | null;
  model: string | null;
  endpoint: string | null;
  payload: any | null;
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  metadata: Record<string, any>;
}

export interface ClassifiedError {
  id: string;
  originalError: Error | any;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  code: string | null;
  statusCode: number | null;
  retryable: boolean;
  maxRetries: number;
  suggestedAction: ErrorAction;
  context: ErrorContext;
  timestamp: number;
  fingerprint: string;
  stack: string | null;
}

// ─── Retry ──────────────────────────────────────────────────────────

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableErrors: ErrorCategory[];
  retryableStatusCodes: number[];
  retryOn: ((error: ClassifiedError) => boolean) | null;
  onRetry: ((attempt: number, error: ClassifiedError, delayMs: number) => void) | null;
}

// ─── Circuit Breaker ────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests: number;
  monitorWindowMs: number;
  failureRateThreshold: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed', OPEN = 'open', HALF_OPEN = 'half_open',
}

// ─── Fallback ───────────────────────────────────────────────────────

export interface FallbackChain {
  name: string;
  steps: FallbackStep[];
  defaultResponse: FallbackResponse | null;
}

export interface FallbackStep {
  name: string;
  executeFn: () => Promise<any>;
  condition: ((error: ClassifiedError) => boolean) | null;
  timeoutMs: number;
  order: number;
}

export interface FallbackResponse {
  content: string;
  source: string;
  quality: string;
  isPartial: boolean;
  warning: string | null;
}

// ─── Error Reports ──────────────────────────────────────────────────

export interface ErrorReport {
  id: string;
  error: ClassifiedError;
  userFeedback: UserFeedback | null;
  resolved: boolean;
  resolvedAt: number | null;
  resolution: string | null;
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
}

export interface UserFeedback {
  errorId: string;
  rating: 'helpful' | 'not_helpful' | 'wrong' | 'confusing';
  comment: string | null;
  expectedBehavior: string | null;
  timestamp: number;
  context: string | null;
}

// ─── Analytics ──────────────────────────────────────────────────────

export interface ErrorAnalytics {
  totalErrors: number;
  errorsByCategory: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  errorRate: number;
  topErrors: { fingerprint: string; message: string; count: number; lastSeen: number }[];
  meanTimeToRecovery: number | null;
  retrySuccessRate: number;
  fallbackUsageRate: number;
  circuitBreakerTrips: number;
  userFeedbackCount: number;
  feedbackSatisfaction: number;
  trendDirection: 'improving' | 'stable' | 'worsening';
}

// ─── Self-Healing ───────────────────────────────────────────────────

export interface SelfHealAction {
  trigger: string;
  condition: (error?: ClassifiedError) => boolean;
  action: () => Promise<boolean>;
  description: string;
  lastExecutedAt: number | null;
  successCount: number;
  failureCount: number;
}

// ─── Recovery Result ────────────────────────────────────────────────

export interface ErrorRecoveryResult<T = any> {
  recovered: boolean;
  result: T | null;
  fallbackUsed: boolean;
  fallbackSource: string | null;
  retried: boolean;
  retryAttempts: number;
  userNotified: boolean;
  queued: boolean;
  classifiedError: ClassifiedError;
}

// ─── Constants ──────────────────────────────────────────────────────

export const ERROR_CONSTANTS = {
  MAX_ERROR_HISTORY: 1000,
  MAX_ERROR_REPORTS: 500,
  FINGERPRINT_WINDOW_MS: 300000,
  DEFAULT_RETRY_BASE_DELAY: 1000,
  DEFAULT_RETRY_MAX_DELAY: 30000,
  DEFAULT_RETRY_MULTIPLIER: 2,
  DEFAULT_JITTER: 0.2,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_TIMEOUT: 30000,
  FEEDBACK_PROMPT_DELAY_MS: 5000,
  ERROR_ANALYTICS_WINDOW_MS: 3600000,
  SELF_HEAL_COOLDOWN_MS: 300000,
};

export const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  [ErrorCategory.NETWORK]: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 15000, backoffMultiplier: 2, jitterFactor: 0.3, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.API]: { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 20000, backoffMultiplier: 2, jitterFactor: 0.2, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.TIMEOUT]: { maxRetries: 2, baseDelayMs: 3000, maxDelayMs: 30000, backoffMultiplier: 2.5, jitterFactor: 0.1, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.RATE_LIMIT]: { maxRetries: 3, baseDelayMs: 5000, maxDelayMs: 60000, backoffMultiplier: 3, jitterFactor: 0.5, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.MODEL]: { maxRetries: 1, baseDelayMs: 5000, maxDelayMs: 10000, backoffMultiplier: 2, jitterFactor: 0.1, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.GPU]: { maxRetries: 1, baseDelayMs: 10000, maxDelayMs: 30000, backoffMultiplier: 2, jitterFactor: 0.1, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.SERVER]: { maxRetries: 2, baseDelayMs: 5000, maxDelayMs: 30000, backoffMultiplier: 2, jitterFactor: 0.3, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.DATABASE]: { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 15000, backoffMultiplier: 2, jitterFactor: 0.2, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
  [ErrorCategory.AUTH]: { maxRetries: 1, baseDelayMs: 1000, maxDelayMs: 5000, backoffMultiplier: 1, jitterFactor: 0, retryableErrors: [], retryableStatusCodes: [], retryOn: null, onRetry: null },
};
