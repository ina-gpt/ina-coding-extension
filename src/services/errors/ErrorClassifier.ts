/**
 * Phase 10.4 — Error Classifier
 * Classifies raw errors into structured ClassifiedErrors with category, severity, and recovery hints.
 */
import { Logger } from '../../utils/Logger';
import {
  ClassifiedError, ErrorCategory, ErrorSeverity, ErrorAction,
  ErrorContext, DEFAULT_RETRY_CONFIGS,
} from './ErrorTypes';

let errorIdCounter = 0;

export class ErrorClassifier {
  private static instance: ErrorClassifier;

  static getInstance(): ErrorClassifier {
    if (!ErrorClassifier.instance) {
      ErrorClassifier.instance = new ErrorClassifier();
    }
    return ErrorClassifier.instance;
  }

  classify(error: any, context?: Partial<ErrorContext>): ClassifiedError {
    const msg = error instanceof Error ? error.message : String(error || 'Unknown error');
    const code = error?.code || error?.statusCode?.toString() || null;
    const statusCode = error?.statusCode || error?.status || this.extractStatusCode(msg);
    const category = this.detectCategory(msg, code, statusCode, error);
    const severity = this.detectSeverity(category, msg, statusCode);
    const retryable = this.isRetryable(category, severity, statusCode);
    const action = this.suggestAction(category, severity, retryable);
    const retryConfig = DEFAULT_RETRY_CONFIGS[category];

    return {
      id: `err_${Date.now()}_${++errorIdCounter}`,
      originalError: error,
      category,
      severity,
      message: msg,
      userMessage: this.getUserMessage(category, msg, statusCode),
      code,
      statusCode,
      retryable,
      maxRetries: retryConfig?.maxRetries ?? 0,
      suggestedAction: action,
      context: {
        requestId: null, category: null, operation: 'unknown', filePath: null,
        model: null, endpoint: null, payload: null, attempt: 0, maxAttempts: 0,
        elapsedMs: 0, metadata: {}, ...context,
        ...(context?.payload ? { payload: this.sanitizePayload(context.payload) } : {}),
      },
      timestamp: Date.now(),
      fingerprint: this.generateFingerprint(category, code, msg, context?.endpoint || null),
      stack: error instanceof Error ? error.stack || null : null,
    };
  }

  private detectCategory(msg: string, code: string | null, statusCode: number | null, error: any): ErrorCategory {
    const m = msg.toLowerCase();
    // Network
    if (/econnrefused|enotfound|etimedout|enetunreach|err_network|failed to fetch|network error/i.test(msg)) return ErrorCategory.NETWORK;
    // Timeout
    if (error?.name === 'AbortError' || /timeout|timed out/i.test(msg)) return ErrorCategory.TIMEOUT;
    // Rate limit
    if (statusCode === 429 || /rate.?limit|too many requests|throttled/i.test(msg)) return ErrorCategory.RATE_LIMIT;
    // Auth
    if (statusCode === 401 || statusCode === 403 || /unauthorized|forbidden|invalid token|expired token|auth/i.test(msg)) return ErrorCategory.AUTH;
    // Server
    if (statusCode && statusCode >= 500) return ErrorCategory.SERVER;
    // Model
    if (/model not found|model loading|out of memory|cuda|vram|oom|no model|ollama/i.test(msg)) return ErrorCategory.MODEL;
    // GPU
    if (/\bgpu\b|cuda error|no gpu|vram exhausted/i.test(msg)) return ErrorCategory.GPU;
    // Database
    if (/relation does not exist|connection refused.*5432|sasl|pg_|database|econnreset.*db/i.test(msg)) return ErrorCategory.DATABASE;
    // Parsing
    if (/json|syntaxerror|unexpected token|parse error/i.test(msg)) return ErrorCategory.PARSING;
    // Validation
    if (/zoderror|validation|invalid input|required field/i.test(msg) || statusCode === 400) return ErrorCategory.VALIDATION;
    // File system
    if (/enoent|eacces|eperm|eisdir|enospc|file not found/i.test(msg)) return ErrorCategory.FILE_SYSTEM;
    // LSP
    if (/language server|lsp|provider|documentsymbol/i.test(msg)) return ErrorCategory.LSP;
    // Git
    if (/\bgit\b|fatal:|not a git repository/i.test(msg)) return ErrorCategory.GIT;
    // Extension
    if (/extension host|activate|disposed/i.test(msg)) return ErrorCategory.EXTENSION;
    return ErrorCategory.UNKNOWN;
  }

  private detectSeverity(category: ErrorCategory, msg: string, statusCode: number | null): ErrorSeverity {
    if (/oom|enospc|out of memory/i.test(msg)) return ErrorSeverity.FATAL;
    if (category === ErrorCategory.EXTENSION) return ErrorSeverity.FATAL;
    if (category === ErrorCategory.AUTH && /permanently|revoked/i.test(msg)) return ErrorSeverity.FATAL;
    if (category === ErrorCategory.RATE_LIMIT) return ErrorSeverity.WARNING;
    if (category === ErrorCategory.NETWORK || category === ErrorCategory.TIMEOUT) return ErrorSeverity.TRANSIENT;
    if (/cancel|abort|stale/i.test(msg)) return ErrorSeverity.IGNORABLE;
    if (statusCode && statusCode >= 500) return ErrorSeverity.ERROR;
    return ErrorSeverity.ERROR;
  }

  private isRetryable(category: ErrorCategory, severity: ErrorSeverity, statusCode: number | null): boolean {
    if (severity === ErrorSeverity.FATAL || severity === ErrorSeverity.IGNORABLE) return false;
    if ([ErrorCategory.NETWORK, ErrorCategory.TIMEOUT, ErrorCategory.RATE_LIMIT, ErrorCategory.DATABASE].includes(category)) return true;
    if (category === ErrorCategory.SERVER && (statusCode === 502 || statusCode === 503 || statusCode === 504)) return true;
    if (category === ErrorCategory.MODEL && /loading/i.test('')) return true;
    return false;
  }

  private suggestAction(category: ErrorCategory, severity: ErrorSeverity, retryable: boolean): ErrorAction {
    if (severity === ErrorSeverity.IGNORABLE) return ErrorAction.IGNORE;
    if (severity === ErrorSeverity.FATAL) return ErrorAction.ABORT;
    if (category === ErrorCategory.AUTH) return ErrorAction.ESCALATE;
    if (retryable && severity === ErrorSeverity.TRANSIENT) return ErrorAction.RETRY;
    if (category === ErrorCategory.RATE_LIMIT) return ErrorAction.RETRY;
    if (category === ErrorCategory.NETWORK) return ErrorAction.QUEUE;
    if (category === ErrorCategory.GPU || category === ErrorCategory.MODEL) return ErrorAction.FALLBACK;
    if (retryable) return ErrorAction.RETRY;
    return ErrorAction.NOTIFY;
  }

  private getUserMessage(category: ErrorCategory, msg: string, statusCode: number | null): string {
    const messages: Record<string, string> = {
      [ErrorCategory.NETWORK]: 'Unable to connect to the server. Check your internet connection.',
      [ErrorCategory.TIMEOUT]: 'The request took too long. The server might be busy.',
      [ErrorCategory.RATE_LIMIT]: 'Too many requests. Please wait a moment.',
      [ErrorCategory.AUTH]: 'Authentication error. Please sign in again.',
      [ErrorCategory.MODEL]: 'The AI model is currently unavailable. It may be loading.',
      [ErrorCategory.GPU]: 'GPU is overloaded. Please try again in a moment.',
      [ErrorCategory.SERVER]: 'Server error. Our team has been notified.',
      [ErrorCategory.DATABASE]: 'Database connection issue. Retrying...',
      [ErrorCategory.PARSING]: 'Received an unexpected response format.',
      [ErrorCategory.VALIDATION]: 'Invalid request. Please check your input.',
      [ErrorCategory.FILE_SYSTEM]: 'File system error.',
      [ErrorCategory.LSP]: 'Language server issue. Some features may be limited.',
      [ErrorCategory.GIT]: 'Git operation failed.',
      [ErrorCategory.EXTENSION]: 'Extension error occurred.',
    };
    return messages[category] || `An error occurred: ${msg.slice(0, 100)}`;
  }

  private generateFingerprint(category: string, code: string | null, msg: string, endpoint: string | null): string {
    const key = `${category}:${code || ''}:${msg.slice(0, 100)}:${endpoint || ''}`;
    let hash = 5381;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash) + key.charCodeAt(i);
    return `fp_${(hash >>> 0).toString(36)}`;
  }

  private extractStatusCode(msg: string): number | null {
    const match = msg.match(/HTTP\s+(\d{3})|status\s+(\d{3})/i);
    return match ? parseInt(match[1] || match[2], 10) : null;
  }

  private sanitizePayload(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload;
    const sensitive = /password|token|secret|key|authorization|cookie|api_key/i;
    const clean: any = Array.isArray(payload) ? [] : {};
    for (const [k, v] of Object.entries(payload)) {
      if (sensitive.test(k)) { clean[k] = '[REDACTED]'; }
      else if (typeof v === 'object' && v !== null) { clean[k] = this.sanitizePayload(v); }
      else { clean[k] = v; }
    }
    return clean;
  }

  isUserActionRequired(error: ClassifiedError): boolean {
    return error.category === ErrorCategory.AUTH || (error.category === ErrorCategory.VALIDATION && error.severity === ErrorSeverity.ERROR);
  }
}
