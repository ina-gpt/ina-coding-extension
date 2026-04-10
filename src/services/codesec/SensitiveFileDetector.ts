/**
 * Phase 12.3 — Sensitive File Detector
 * Detects and manages sensitive file access.
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { SecretDetector, SecretDetection } from '../privacy/SecretDetector';
import {
  SensitiveFileAction, SensitiveFileConfig, SensitiveFileScanResult,
  SecretDetectionResult, DEFAULT_SENSITIVE_PATTERNS, CODE_SECURITY_DEFAULTS,
} from './CodeSecurityTypes';

interface AccessLogEntry {
  filePath: string;
  action: SensitiveFileAction;
  timestamp: number;
  purpose: string;
}

export class SensitiveFileDetector extends EventEmitter {
  private static instance: SensitiveFileDetector;
  private patterns: string[];
  private customPatterns: string[];
  private config: SensitiveFileConfig;
  private accessLog: AccessLogEntry[] = [];
  private cache = new Map<string, { isSensitive: boolean; matchedPattern: string | null }>();
  private secretDetector: SecretDetector;

  static getInstance(): SensitiveFileDetector {
    if (!SensitiveFileDetector.instance) {
      SensitiveFileDetector.instance = new SensitiveFileDetector();
    }
    return SensitiveFileDetector.instance;
  }

  private constructor() {
    super();
    this.config = CODE_SECURITY_DEFAULTS.sensitiveFiles;
    this.patterns = [...DEFAULT_SENSITIVE_PATTERNS];
    this.customPatterns = [];
    this.secretDetector = SecretDetector.getInstance();
  }

  updateConfig(config: Partial<SensitiveFileConfig>): void {
    Object.assign(this.config, config);
    if (config.patterns) this.patterns = config.patterns;
    if (config.customPatterns) this.customPatterns = config.customPatterns;
    this.cache.clear();
  }

  isSensitiveFile(filePath: string): boolean {
    if (!this.config.enabled) return false;
    const normalized = this.normalizeFilePath(filePath);
    const cached = this.cache.get(normalized);
    if (cached !== undefined) return cached.isSensitive;

    for (const pattern of [...this.patterns, ...this.customPatterns]) {
      if (this.matchPattern(normalized, pattern)) {
        this.cache.set(normalized, { isSensitive: true, matchedPattern: pattern });
        return true;
      }
    }
    this.cache.set(normalized, { isSensitive: false, matchedPattern: null });
    return false;
  }

  getSensitiveFileAction(filePath: string): SensitiveFileAction {
    if (this.isSensitiveFile(filePath)) return this.config.action;
    return SensitiveFileAction.ALLOW;
  }

  checkFileAccess(filePath: string, purpose: string): { allowed: boolean; action: SensitiveFileAction; warning: string | null } {
    if (!this.isSensitiveFile(filePath)) {
      return { allowed: true, action: SensitiveFileAction.ALLOW, warning: null };
    }

    const action = this.config.action;
    const fileName = path.basename(filePath);

    this.accessLog.push({ filePath, action, timestamp: Date.now(), purpose });
    if (this.accessLog.length > 500) this.accessLog = this.accessLog.slice(-400);
    this.emit('sensitive-file-accessed', filePath, action);

    switch (action) {
      case SensitiveFileAction.EXCLUDE:
        return { allowed: false, action, warning: `Sensitive file "${fileName}" is excluded from AI context for security` };
      case SensitiveFileAction.WARN:
        return { allowed: true, action, warning: `⚠️ Sensitive file "${fileName}" is being sent to AI` };
      case SensitiveFileAction.REDACT:
        return { allowed: true, action, warning: `Sensitive file "${fileName}" will be redacted (structure only, values stripped)` };
      default:
        return { allowed: true, action, warning: null };
    }
  }

  scanGitDiff(diffContent: string): { secretsFound: SecretDetectionResult[]; sensitiveFilesInDiff: string[] } {
    const secretsFound: SecretDetectionResult[] = [];
    const sensitiveFilesInDiff: string[] = [];

    // Find file paths in diff
    const fileMatches = diffContent.matchAll(/^\+\+\+\s+b\/(.+)$/gm);
    for (const m of fileMatches) {
      const fp = m[1];
      if (this.isSensitiveFile(fp)) sensitiveFilesInDiff.push(fp);
    }

    // Find secrets in added lines only
    const addedLines = diffContent.split('\n')
      .filter(l => l.startsWith('+') && !l.startsWith('+++'))
      .map(l => l.substring(1))
      .join('\n');

    if (addedLines) {
      const detections = this.secretDetector.detectSecrets(addedLines);
      for (const d of detections) {
        secretsFound.push({ ...d, severity: 'high', name: d.type });
      }
    }

    return { secretsFound, sensitiveFilesInDiff };
  }

  async scanWorkspace(): Promise<SensitiveFileScanResult> {
    const result: SensitiveFileScanResult = {
      sensitiveFiles: [], secretsInFiles: [],
      totalFiles: 0, totalSensitive: 0, totalSecrets: 0,
    };

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return result;

    const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,**/dist/**,**/.next/**}', 5000);
    result.totalFiles = files.length;

    for (const file of files) {
      const relativePath = vscode.workspace.asRelativePath(file);
      if (this.isSensitiveFile(relativePath)) {
        const cached = this.cache.get(this.normalizeFilePath(relativePath));
        result.sensitiveFiles.push({
          path: relativePath,
          pattern: cached?.matchedPattern || 'unknown',
          action: this.config.action,
        });
        result.totalSensitive++;
      }
    }

    return result;
  }

  addCustomPattern(pattern: string): void {
    if (!this.customPatterns.includes(pattern)) {
      this.customPatterns.push(pattern);
      this.cache.clear();
    }
  }

  removeCustomPattern(pattern: string): void {
    this.customPatterns = this.customPatterns.filter(p => p !== pattern);
    this.cache.clear();
  }

  getPatterns(): string[] {
    return [...this.patterns, ...this.customPatterns];
  }

  getAccessLog(): AccessLogEntry[] {
    return [...this.accessLog];
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    const fp = filePath.replace(/\\/g, '/');
    const fileName = path.basename(fp);
    const p = pattern.replace(/\\/g, '/');

    // Exact filename match: '.env' matches any .env in any directory
    if (!p.includes('/') && !p.includes('*')) {
      return fileName === p;
    }

    // Extension match: '*.pem'
    if (p.startsWith('*.')) {
      const ext = p.slice(1);
      return fileName.endsWith(ext);
    }

    // Directory wildcard: '.ssh/*'
    if (p.endsWith('/*')) {
      const dir = p.slice(0, -2);
      return fp.includes('/' + dir + '/') || fp.startsWith(dir + '/');
    }

    // Wildcard prefix: '.env.*' or 'id_rsa.*'
    if (p.includes('.*')) {
      const base = p.replace('.*', '');
      return fileName.startsWith(base + '.') || fileName === base;
    }

    // Glob star: 'firebase-adminsdk*.json'
    if (p.includes('*') && !p.startsWith('*')) {
      const [prefix, suffix] = p.split('*');
      return fileName.startsWith(prefix) && (suffix ? fileName.endsWith(suffix) : true);
    }

    // '*-service-account.json'
    if (p.startsWith('*')) {
      const suffix = p.slice(1);
      return fileName.endsWith(suffix);
    }

    // Direct path or filename match
    return fp === p || fp.endsWith('/' + p) || fileName === p;
  }

  private normalizeFilePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/\/+/g, '/');
  }

  dispose(): void {
    this.cache.clear();
    this.accessLog = [];
    this.removeAllListeners();
  }
}
