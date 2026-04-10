/**
 * Phase 12.1 — Secret Detector
 * Detects and strips secrets from content before sending anywhere.
 */
import { Logger } from '../../utils/Logger';
import { SENSITIVE_PATTERNS } from './PrivacyTypes';

export interface SecretDetection {
  pattern: string;
  match: string;
  line: number | null;
  type: string;
}

const SENSITIVE_KEYS = /^(password|passwd|pwd|secret|token|key|authorization|cookie|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|bearer|credentials?)$/i;

export class SecretDetector {
  private static instance: SecretDetector;
  private patterns: RegExp[];
  private customPatterns: RegExp[] = [];
  private detectionCount = 0;
  private byType = new Map<string, number>();

  static getInstance(): SecretDetector {
    if (!SecretDetector.instance) {
      SecretDetector.instance = new SecretDetector();
    }
    return SecretDetector.instance;
  }

  private constructor() {
    this.patterns = SENSITIVE_PATTERNS.map(p => new RegExp(p.source, p.flags));
  }

  containsSecrets(content: string): boolean {
    for (const p of [...this.patterns, ...this.customPatterns]) {
      p.lastIndex = 0;
      if (p.test(content)) return true;
    }
    return false;
  }

  detectSecrets(content: string): SecretDetection[] {
    const detections: SecretDetection[] = [];
    const lines = content.split('\n');
    for (const p of [...this.patterns, ...this.customPatterns]) {
      p.lastIndex = 0;
      let match;
      while ((match = p.exec(content)) !== null) {
        const before = content.substring(0, match.index);
        const lineNum = before.split('\n').length;
        const masked = match[0].substring(0, 4) + '***';
        const type = this.classifySecret(match[0]);
        detections.push({ pattern: p.source.substring(0, 30), match: masked, line: lineNum, type });
        this.detectionCount++;
        this.byType.set(type, (this.byType.get(type) || 0) + 1);
      }
    }
    return detections;
  }

  sanitize(content: string): { sanitized: string; secretsFound: number; secretTypes: string[] } {
    let sanitized = content;
    let secretsFound = 0;
    const secretTypes = new Set<string>();
    for (const p of [...this.patterns, ...this.customPatterns]) {
      const regex = new RegExp(p.source, p.flags);
      let match;
      while ((match = regex.exec(sanitized)) !== null) {
        const type = this.classifySecret(match[0]);
        const replacement = `[REDACTED:${type}]`;
        sanitized = sanitized.substring(0, match.index) + replacement + sanitized.substring(match.index + match[0].length);
        regex.lastIndex = match.index + replacement.length;
        secretsFound++;
        secretTypes.add(type);
      }
    }
    return { sanitized, secretsFound, secretTypes: Array.from(secretTypes) };
  }

  sanitizeObject(obj: any, depth = 0): any {
    if (depth > 10 || obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return this.sanitize(obj).sanitized;
    if (Array.isArray(obj)) return obj.map(item => this.sanitizeObject(item, depth + 1));
    if (typeof obj === 'object') {
      const clean: any = {};
      for (const [k, v] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.test(k)) { clean[k] = '[REDACTED]'; }
        else if (typeof v === 'string') { clean[k] = this.sanitize(v).sanitized; }
        else { clean[k] = this.sanitizeObject(v, depth + 1); }
      }
      return clean;
    }
    return obj;
  }

  sanitizeFilePath(filePath: string, workspaceRoot?: string): string {
    let p = filePath;
    const home = process.env.HOME || process.env.USERPROFILE || '';
    if (home && p.startsWith(home)) p = '~' + p.substring(home.length);
    if (workspaceRoot && p.includes(workspaceRoot)) p = p.replace(workspaceRoot, '{workspace}');
    return p;
  }

  sanitizeError(error: any): { message: string; stack: string | null; code: string | null } {
    const msg = error instanceof Error ? error.message : String(error || 'Unknown');
    const sanitizedMsg = this.sanitize(msg).sanitized;
    let stack: string | null = null;
    if (error instanceof Error && error.stack) {
      const frames = error.stack.split('\n').slice(0, 6);
      stack = frames.map(f => this.sanitizeFilePath(f)).join('\n');
    }
    return { message: sanitizedMsg.substring(0, 500), stack, code: error?.code || null };
  }

  isSensitiveFile(filePath: string): boolean {
    const patterns = ['.env', '.pem', '.key', '.cert', 'id_rsa', '.p12', '.ssh/', 'credentials', 'secrets', '.secret'];
    const lower = filePath.toLowerCase();
    return patterns.some(p => lower.includes(p));
  }

  addCustomPattern(pattern: RegExp, type: string): void {
    this.customPatterns.push(pattern);
  }

  getStats(): { totalDetections: number; byType: Record<string, number> } {
    return { totalDetections: this.detectionCount, byType: Object.fromEntries(this.byType) };
  }

  private classifySecret(match: string): string {
    const m = match.toLowerCase();
    if (/api[_-]?key|apikey/.test(m)) return 'api_key';
    if (/password|passwd|pwd/.test(m)) return 'password';
    if (/bearer|token/.test(m)) return 'token';
    if (/private.key|begin.*private/i.test(m)) return 'private_key';
    if (/postgres|mongodb|mysql/.test(m)) return 'connection_string';
    if (/ghp_|sk-/.test(m)) return 'api_key';
    if (/secret/.test(m)) return 'secret';
    return 'other';
  }
}
