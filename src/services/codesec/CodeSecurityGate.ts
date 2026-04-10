/**
 * Phase 12.3 — Code Security Gate
 * THE CENTRAL SECURITY GATE: every piece of code passes through here before leaving the extension.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { SecretDetector } from '../privacy/SecretDetector';
import { DataSanitizer } from '../privacy/DataSanitizer';
import { SensitiveFileDetector } from './SensitiveFileDetector';
import {
  CodeSecurityPolicy, CodeSecurityAlert, CodeSecurityEvent, CodeScanResult,
  IncomingCodeScanResult, SecretDetectionResult, MaliciousPattern,
  SensitiveFileAction, CODE_SECURITY_DEFAULTS, DEFAULT_SECRET_PATTERNS,
  MALICIOUS_CODE_PATTERNS,
} from './CodeSecurityTypes';

export class CodeSecurityGate extends EventEmitter {
  private static instance: CodeSecurityGate;
  private secretDetector: SecretDetector;
  private sensitiveFileDetector: SensitiveFileDetector;
  private dataSanitizer: DataSanitizer;
  private policy: CodeSecurityPolicy;
  private alerts: CodeSecurityAlert[] = [];
  private compiledPatterns: { regex: RegExp; name: string; type: string; severity: 'critical' | 'high' | 'medium' | 'low' }[] = [];
  private compiledMalicious: { regex: RegExp; pattern: MaliciousPattern }[] = [];

  // Session counters
  private totalScans = 0;
  private secretsDetected = 0;
  private filesBlocked = 0;
  private fileOpsThisSession = 0;
  private terminalCommandsThisSession = 0;

  static getInstance(): CodeSecurityGate {
    if (!CodeSecurityGate.instance) {
      CodeSecurityGate.instance = new CodeSecurityGate();
    }
    return CodeSecurityGate.instance;
  }

  private constructor() {
    super();
    this.secretDetector = SecretDetector.getInstance();
    this.sensitiveFileDetector = SensitiveFileDetector.getInstance();
    this.dataSanitizer = DataSanitizer.getInstance();
    this.policy = CODE_SECURITY_DEFAULTS;
    this.compilePatterns();
  }

  updatePolicy(policy: Partial<CodeSecurityPolicy>): void {
    Object.assign(this.policy, policy);
    this.compilePatterns();
  }

  // ============ THE MAIN GATE — outgoing code ============

  scanOutgoingCode(code: string, filePath: string | null, purpose: string): CodeScanResult {
    this.totalScans++;
    const warnings: string[] = [];
    let sanitizedCode = code;
    let blocked = false;
    let blockReason: string | null = null;
    let sensitiveFile = false;
    const secretsFound: SecretDetectionResult[] = [];

    // 1. Check sensitive file
    if (filePath && this.sensitiveFileDetector.isSensitiveFile(filePath)) {
      sensitiveFile = true;
      const action = this.sensitiveFileDetector.getSensitiveFileAction(filePath);

      if (action === SensitiveFileAction.EXCLUDE) {
        this.filesBlocked++;
        this.createAlert('sensitive-file-blocked', 'high', 'Sensitive file blocked', `File "${filePath}" excluded from AI context`, filePath);
        return {
          safe: false, sanitizedCode: '[SENSITIVE_FILE_EXCLUDED]', secretsFound: [],
          sensitiveFile: true, warnings: [`Sensitive file "${filePath}" excluded from AI context`],
          blocked: true, blockReason: 'Sensitive file excluded by security policy',
        };
      }
      if (action === SensitiveFileAction.WARN) {
        warnings.push(`⚠️ Sensitive file "${filePath}" is being sent to AI`);
        this.createAlert('sensitive-file-warned', 'medium', 'Sensitive file accessed', `File "${filePath}" sent to AI`, filePath);
      }
      if (action === SensitiveFileAction.REDACT) {
        sanitizedCode = this.redactValues(sanitizedCode);
        warnings.push(`Sensitive file "${filePath}" redacted (values stripped)`);
      }
    }

    // 2. Scan for secrets
    if (this.policy.secretProtection.enabled && this.policy.secretProtection.scanBeforeSend) {
      const detected = this.detectSecretsAdvanced(sanitizedCode);
      if (detected.length > 0) {
        this.secretsDetected += detected.length;
        secretsFound.push(...detected);

        if (this.policy.secretProtection.autoStrip) {
          sanitizedCode = this.stripSecrets(sanitizedCode, detected);
          warnings.push(`${detected.length} secret(s) automatically redacted`);
          this.createAlert('secret-stripped', 'high', 'Secrets auto-stripped', `${detected.length} secrets removed before sending`, filePath);
        }
        if (this.policy.secretProtection.blockIfSecretsFound) {
          blocked = true;
          blockReason = `${detected.length} secret(s) detected — blocked by policy`;
        }
      }
    }

    // 3. Check code size
    const maxSize = this.policy.codeTransmission.maxCodeSizeBytes;
    if (sanitizedCode.length > maxSize) {
      const originalLen = sanitizedCode.length;
      sanitizedCode = sanitizedCode.substring(0, maxSize);
      warnings.push(`Code truncated from ${originalLen} to ${maxSize} bytes`);
    }

    // 4. Check excluded paths
    if (filePath) {
      if (this.policy.codeTransmission.excludeNodeModules && filePath.includes('node_modules')) {
        return { safe: false, sanitizedCode: '[NODE_MODULES_EXCLUDED]', secretsFound: [], sensitiveFile: false, warnings: ['node_modules content excluded'], blocked: true, blockReason: 'node_modules excluded by policy' };
      }
      if (this.policy.codeTransmission.excludeBuildOutput) {
        const buildPaths = ['dist/', '.next/', 'build/', 'out/', '__pycache__/'];
        if (buildPaths.some(bp => filePath.includes(bp))) {
          return { safe: false, sanitizedCode: '[BUILD_OUTPUT_EXCLUDED]', secretsFound: [], sensitiveFile: false, warnings: ['Build output excluded'], blocked: true, blockReason: 'Build output excluded by policy' };
        }
      }
    }

    // 5. Audit log
    if (secretsFound.length > 0 && this.policy.auditPolicy.logSecretDetections) {
      Logger.info(`[CodeSecurity] ${secretsFound.length} secrets detected in ${purpose}${filePath ? ` (${filePath})` : ''}`);
    }

    return {
      safe: !blocked && secretsFound.length === 0,
      sanitizedCode, secretsFound, sensitiveFile, warnings, blocked, blockReason,
    };
  }

  // ============ Incoming code (AI-generated) ============

  scanIncomingCode(code: string, source: string): IncomingCodeScanResult {
    this.totalScans++;
    const warnings: string[] = [];
    const hardcodedSecrets: SecretDetectionResult[] = [];

    // 1. Detect hardcoded secrets
    if (this.policy.secretProtection.scanGeneratedCode) {
      const detected = this.detectSecretsAdvanced(code);
      hardcodedSecrets.push(...detected);
      if (detected.length > 0) {
        warnings.push(`${detected.length} hardcoded secret(s) in generated code`);
      }
    }

    // 2. Detect malicious patterns
    const maliciousPatterns: MaliciousPattern[] = [];
    const lines = code.split('\n');
    for (const { regex, pattern } of this.compiledMalicious) {
      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          maliciousPatterns.push({ ...pattern, line: i + 1 });
          warnings.push(`Line ${i + 1}: ${pattern.description}`);
        }
      }
    }

    return {
      safe: hardcodedSecrets.length === 0 && maliciousPatterns.filter(p => p.severity === 'critical').length === 0,
      warnings, hardcodedSecrets, maliciousPatterns,
    };
  }

  // ============ Pasted content ============

  scanPastedContent(content: string): CodeScanResult {
    return this.scanOutgoingCode(content, null, 'user-paste');
  }

  // ============ Mentioned file ============

  scanMentionedFile(filePath: string, content: string): CodeScanResult {
    const result = this.scanOutgoingCode(content, filePath, 'file-mention');

    // Additional: enforce maxContextCodeLines
    if (!result.blocked) {
      const maxLines = this.policy.codeTransmission.maxContextCodeLines;
      const lines = result.sanitizedCode.split('\n');
      if (lines.length > maxLines) {
        const half = Math.floor(maxLines / 2);
        result.sanitizedCode = [
          ...lines.slice(0, half),
          `[...truncated ${lines.length - maxLines} lines...]`,
          ...lines.slice(-half),
        ].join('\n');
        result.warnings.push(`File truncated to ${maxLines} lines`);
      }
    }

    return result;
  }

  // ============ Agent operations ============

  scanAgentOperation(operation: { type: string; filePath: string; content: string | null }): { allowed: boolean; warnings: string[]; sanitizedContent: string | null } {
    const warnings: string[] = [];
    this.fileOpsThisSession++;

    // Check session limit
    if (this.fileOpsThisSession > this.policy.agentSecurity.maxFileModificationsPerSession) {
      return { allowed: false, warnings: [`Session limit reached: ${this.policy.agentSecurity.maxFileModificationsPerSession} file modifications`], sanitizedContent: null };
    }

    // Check workspace boundary
    if (this.policy.agentSecurity.blockWriteOutsideWorkspace) {
      const folders = vscode.workspace.workspaceFolders;
      if (folders) {
        const isInWorkspace = folders.some(f => {
          const abs = path.resolve(f.uri.fsPath, operation.filePath);
          return abs.startsWith(f.uri.fsPath);
        });
        if (!isInWorkspace) {
          return { allowed: false, warnings: ['Write outside workspace blocked'], sanitizedContent: null };
        }
      }
    }

    // Check sensitive file target
    if (this.sensitiveFileDetector.isSensitiveFile(operation.filePath)) {
      if (operation.type === 'create' || operation.type === 'edit') {
        warnings.push(`⚠️ Agent writing to sensitive file: ${operation.filePath}`);
      }
      if (operation.type === 'delete') {
        warnings.push(`⚠️ Agent deleting sensitive file: ${operation.filePath}`);
      }
    }

    // Scan content
    let sanitizedContent = operation.content;
    if (operation.content && this.policy.secretProtection.scanGeneratedCode) {
      const scan = this.scanIncomingCode(operation.content, 'agent');
      warnings.push(...scan.warnings);
    }

    if (this.policy.auditPolicy.logAgentFileOps) {
      Logger.info(`[CodeSecurity] Agent ${operation.type}: ${operation.filePath}`);
    }

    return { allowed: true, warnings, sanitizedContent };
  }

  // ============ Terminal commands ============

  scanTerminalCommand(command: string): { allowed: boolean; reason: string | null; sanitizedCommand: string } {
    this.terminalCommandsThisSession++;

    if (this.terminalCommandsThisSession > this.policy.agentSecurity.maxTerminalCommandsPerSession) {
      return { allowed: false, reason: `Session limit: ${this.policy.agentSecurity.maxTerminalCommandsPerSession} terminal commands`, sanitizedCommand: command };
    }

    // Check for sensitive file exposure
    const sensitiveCommands = [
      /\bcat\s+.*\.env\b/i,
      /\becho\s+\$\w*(PASSWORD|SECRET|TOKEN|KEY)\b/i,
      /\bcat\s+.*id_rsa\b/i,
      /\bcat\s+.*\.pem\b/i,
      /\bprintenv\b/,
      /\benv\s*\|/,
      /\bgrep\s+.*(?:password|secret|token)\b/i,
    ];

    for (const pattern of sensitiveCommands) {
      if (pattern.test(command)) {
        return { allowed: false, reason: 'Command would expose sensitive data', sanitizedCommand: command };
      }
    }

    if (this.policy.auditPolicy.logTerminalCommands) {
      Logger.info(`[CodeSecurity] Terminal: ${command.substring(0, 100)}`);
    }

    return { allowed: true, reason: null, sanitizedCommand: command };
  }

  // ============ Alerts ============

  getAlerts(): CodeSecurityAlert[] {
    return this.alerts.filter(a => !a.dismissed);
  }

  getAllAlerts(): CodeSecurityAlert[] {
    return [...this.alerts];
  }

  dismissAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) alert.dismissed = true;
  }

  getStats(): { totalScans: number; secretsDetected: number; filesBlocked: number; alertsActive: number; fileOpsThisSession: number; terminalCommandsThisSession: number } {
    return {
      totalScans: this.totalScans,
      secretsDetected: this.secretsDetected,
      filesBlocked: this.filesBlocked,
      alertsActive: this.alerts.filter(a => !a.dismissed).length,
      fileOpsThisSession: this.fileOpsThisSession,
      terminalCommandsThisSession: this.terminalCommandsThisSession,
    };
  }

  resetStats(): void {
    this.totalScans = 0;
    this.secretsDetected = 0;
    this.filesBlocked = 0;
    this.fileOpsThisSession = 0;
    this.terminalCommandsThisSession = 0;
    this.alerts = [];
  }

  // ============ Private ============

  private compilePatterns(): void {
    const allPatterns = [...DEFAULT_SECRET_PATTERNS, ...(this.policy.secretProtection.customPatterns || [])];
    this.compiledPatterns = allPatterns.map(p => {
      try {
        return { regex: new RegExp(p.pattern, 'g'), name: p.name, type: p.type, severity: p.severity };
      } catch (e) { Logger.warn(`[CodeSecurity] Failed to compile secret pattern "${p.name}": ${p.pattern}`); return null; }
    }).filter(Boolean) as typeof this.compiledPatterns;

    this.compiledMalicious = MALICIOUS_CODE_PATTERNS.map(p => {
      try {
        return { regex: new RegExp(p.pattern, 'gm'), pattern: p };
      } catch (e) { Logger.warn(`[CodeSecurity] Failed to compile malicious pattern: ${p.type}`); return null; }
    }).filter(Boolean) as typeof this.compiledMalicious;
  }

  private detectSecretsAdvanced(content: string): SecretDetectionResult[] {
    const results: SecretDetectionResult[] = [];
    const whiteList = this.policy.secretProtection.whitelistPatterns || [];
    const lines = content.split('\n');

    for (const { regex, name, type, severity } of this.compiledPatterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const matchStr = match[0];
        // Check whitelist
        if (whiteList.some(w => matchStr.includes(w))) continue;

        const before = content.substring(0, match.index);
        const lineNum = before.split('\n').length;
        const masked = matchStr.substring(0, Math.min(4, matchStr.length)) + '***';

        results.push({ pattern: regex.source.substring(0, 30), match: masked, line: lineNum, type, severity, name });
      }
    }
    return results;
  }

  private stripSecrets(code: string, _detections: SecretDetectionResult[]): string {
    let result = code;
    for (const { regex, type } of this.compiledPatterns) {
      // Use fresh regex to avoid lastIndex state issues
      const fresh = new RegExp(regex.source, regex.flags);
      result = result.replace(fresh, (m) => `[REDACTED:${type}]`);
    }
    return result;
  }

  private redactValues(code: string): string {
    // Keep structure (key names, indentation) but replace values
    return code.replace(/[:=]\s*['"][^'"]*['"]/g, ': "[REDACTED]"')
               .replace(/[:=]\s*[A-Za-z0-9/+_-]{20,}/g, '= [REDACTED]');
  }

  private createAlert(type: CodeSecurityEvent, severity: CodeSecurityAlert['severity'], title: string, description: string, filePath?: string | null, secretType?: string): void {
    const alert: CodeSecurityAlert = {
      id: `csa_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type, severity, title, description,
      filePath: filePath || null, secretType: secretType || null,
      action: type, timestamp: Date.now(), dismissed: false, autoResolved: false,
    };
    this.alerts.push(alert);
    if (this.alerts.length > 200) this.alerts = this.alerts.slice(-150);
    this.emit('security-alert', alert);
    if (severity === 'critical' || severity === 'high') {
      this.emit('secret-detected', alert);
    }
  }

  dispose(): void {
    this.alerts = [];
    this.removeAllListeners();
  }
}
