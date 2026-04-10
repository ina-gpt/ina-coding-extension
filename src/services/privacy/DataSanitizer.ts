/**
 * Phase 12.1 — Data Sanitizer
 * Sanitizes all outgoing data before sending to server.
 */
import { Logger } from '../../utils/Logger';
import { SecretDetector } from './SecretDetector';
import { DataMinimizationConfig, PRIVACY_DEFAULTS } from './PrivacyTypes';

export class DataSanitizer {
  private static instance: DataSanitizer;
  private secretDetector: SecretDetector;
  private config: DataMinimizationConfig;

  static getInstance(): DataSanitizer {
    if (!DataSanitizer.instance) {
      DataSanitizer.instance = new DataSanitizer();
    }
    return DataSanitizer.instance;
  }

  private constructor() {
    this.secretDetector = SecretDetector.getInstance();
    this.config = PRIVACY_DEFAULTS.dataMinimization;
  }

  updateConfig(config: Partial<DataMinimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  sanitizeForAPI(payload: any, category: string): any {
    if (!payload || typeof payload !== 'object') return payload;
    const clone = JSON.parse(JSON.stringify(payload));
    const sanitized = this.secretDetector.sanitizeObject(clone);
    // Strip sensitive file contents
    if (sanitized.context?.fileContent && this.shouldExcludeFile(sanitized.context.file || '')) {
      sanitized.context.fileContent = '[SENSITIVE_FILE_EXCLUDED]';
    }
    // Truncate code
    if (sanitized.context?.code && this.config.maxCodeContextLines > 0) {
      sanitized.context.code = this.truncateCode(sanitized.context.code, this.config.maxCodeContextLines);
    }
    if (sanitized.prefix) sanitized.prefix = this.truncateCode(sanitized.prefix, this.config.maxCodeContextLines);
    if (sanitized.suffix) sanitized.suffix = this.truncateCode(sanitized.suffix, this.config.maxCodeContextLines);
    return sanitized;
  }

  sanitizeCodeForContext(code: string, filePath: string): string {
    if (this.shouldExcludeFile(filePath)) return '[SENSITIVE_FILE_EXCLUDED]';
    const { sanitized } = this.secretDetector.sanitize(code);
    return this.truncateCode(sanitized, this.config.maxCodeContextLines);
  }

  sanitizeForMemory(content: string): string {
    const { sanitized } = this.secretDetector.sanitize(content);
    return sanitized;
  }

  sanitizeForLogging(data: any): any {
    if (!data || typeof data !== 'object') {
      if (typeof data === 'string') return this.secretDetector.sanitize(data).sanitized.substring(0, 200);
      return data;
    }
    const clone = JSON.parse(JSON.stringify(data));
    return this.deepSanitizeForLog(clone, 0);
  }

  sanitizeForExport(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const clone = JSON.parse(JSON.stringify(data));
    // Remove internal tokens and keys
    const remove = ['encryptionKey', 'apiKey', 'token', 'secret', 'password', 'authorization'];
    return this.stripKeys(clone, remove);
  }

  shouldExcludeFile(filePath: string): boolean {
    if (!filePath) return false;
    return this.secretDetector.isSensitiveFile(filePath);
  }

  private truncateCode(code: string, maxLines: number): string {
    const lines = code.split('\n');
    if (lines.length <= maxLines) return code;
    const half = Math.floor((maxLines - 1) / 2);
    const omitted = lines.length - half * 2;
    return [...lines.slice(0, half), `[...truncated ${omitted} lines...]`, ...lines.slice(-half)].join('\n');
  }

  private deepSanitizeForLog(obj: any, depth: number): any {
    if (depth > 5) return '[DEEP_OBJECT]';
    if (typeof obj === 'string') {
      return this.secretDetector.sanitize(obj).sanitized.substring(0, 200);
    }
    if (Array.isArray(obj)) return obj.slice(0, 10).map(v => this.deepSanitizeForLog(v, depth + 1));
    if (typeof obj === 'object' && obj !== null) {
      const clean: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (/code|content|body|payload|source/i.test(k) && typeof v === 'string') {
          clean[k] = '[code]';
        } else {
          clean[k] = this.deepSanitizeForLog(v, depth + 1);
        }
      }
      return clean;
    }
    return obj;
  }

  private stripKeys(obj: any, keys: string[]): any {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(v => this.stripKeys(v, keys));
    const clean: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (keys.some(key => k.toLowerCase().includes(key.toLowerCase()))) continue;
      clean[k] = this.stripKeys(v, keys);
    }
    return clean;
  }
}
