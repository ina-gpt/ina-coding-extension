/**
 * Phase 12.3 — Generated Code Scanner
 * Scans AI-generated code before user applies it.
 */
import { Logger } from '../../utils/Logger';
import { CodeSecurityGate } from './CodeSecurityGate';
import { GeneratedCodeScanResult, CodeWarning } from './CodeSecurityTypes';

export class GeneratedCodeScanner {
  private static instance: GeneratedCodeScanner;
  private gate: CodeSecurityGate;

  static getInstance(): GeneratedCodeScanner {
    if (!GeneratedCodeScanner.instance) {
      GeneratedCodeScanner.instance = new GeneratedCodeScanner();
    }
    return GeneratedCodeScanner.instance;
  }

  private constructor() {
    this.gate = CodeSecurityGate.getInstance();
  }

  scanBeforeApply(generatedCode: string, targetFilePath: string, operationType: 'insert' | 'replace' | 'create'): GeneratedCodeScanResult {
    const warnings: CodeWarning[] = [];
    const suggestions: string[] = [];
    let autoFixed: string | null = null;
    let hasIssues = false;

    const lines = generatedCode.split('\n');

    // 1. Hardcoded secrets
    const incomingScan = this.gate.scanIncomingCode(generatedCode, 'generated');
    for (const secret of incomingScan.hardcodedSecrets) {
      warnings.push({
        type: 'hardcoded_secret', severity: secret.severity,
        line: secret.line, message: `Hardcoded ${secret.name}: ${secret.match}. Use environment variables instead.`,
        fix: `Replace with process.env.${secret.type.toUpperCase().replace(/[^A-Z_]/g, '_')}`,
      });
      hasIssues = true;
    }

    // 2. Malicious patterns
    for (const mal of incomingScan.maliciousPatterns) {
      warnings.push({
        type: mal.type, severity: mal.severity,
        line: mal.line, message: mal.description,
        fix: this.getSuggestedFix(mal.type),
      });
      if (mal.severity === 'critical' || mal.severity === 'high') hasIssues = true;
    }

    // 3. Insecure patterns specific to generated code
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // var keyword
      if (/\bvar\s+\w+/.test(line) && !line.includes('//')) {
        warnings.push({ type: 'outdated', severity: 'info', line: lineNum, message: 'Use const/let instead of var', fix: 'Replace var with const or let' });
      }

      // require() in TypeScript
      if (targetFilePath.endsWith('.ts') || targetFilePath.endsWith('.tsx')) {
        if (/\brequire\s*\(/.test(line) && !line.includes('//')) {
          warnings.push({ type: 'outdated', severity: 'info', line: lineNum, message: 'Use import instead of require() in TypeScript', fix: 'Convert to ES module import' });
        }
      }

      // Credential placeholders
      if (/YOUR_.*_HERE|TODO.*(?:key|token|password|secret)/i.test(line)) {
        warnings.push({ type: 'placeholder', severity: 'info', line: lineNum, message: 'Credential placeholder detected — use environment variables', fix: 'Replace with process.env.* reference' });
      }

      // Disabled security
      if (/rejectUnauthorized\s*:\s*false/.test(line)) {
        warnings.push({ type: 'insecure', severity: 'high', line: lineNum, message: 'TLS certificate validation disabled', fix: 'Remove rejectUnauthorized: false' });
        hasIssues = true;
      }
    }

    // 4. File-specific checks
    const fileName = targetFilePath.split('/').pop() || '';
    if (fileName === 'Dockerfile' || fileName === 'dockerfile') {
      for (let i = 0; i < lines.length; i++) {
        if (/^USER\s+root/i.test(lines[i])) {
          warnings.push({ type: 'insecure', severity: 'medium', line: i + 1, message: 'Running Docker container as root', fix: 'Add USER nonroot' });
        }
        if (/^COPY\s+\.\s+\./.test(lines[i])) {
          warnings.push({ type: 'insecure', severity: 'medium', line: i + 1, message: 'COPY . . may include sensitive files', fix: 'Use .dockerignore or COPY specific files' });
        }
      }
    }

    // 5. Auto-fix attempt
    if (hasIssues && warnings.some(w => w.fix)) {
      const fixResult = this.autoFixSecurityIssues(generatedCode, targetFilePath);
      if (fixResult.fixesApplied.length > 0) {
        autoFixed = fixResult.fixed;
        suggestions.push(...fixResult.fixesApplied);
      }
    }

    const requiresReview = warnings.some(w => w.severity === 'critical' || w.severity === 'high');

    return { safe: !hasIssues, warnings, suggestions, autoFixed, requiresReview };
  }

  scanBeforeInlineEdit(originalCode: string, editedCode: string, filePath: string): GeneratedCodeScanResult {
    // Compare: detect newly introduced issues
    const origScan = this.gate.scanIncomingCode(originalCode, 'original');
    const editScan = this.gate.scanIncomingCode(editedCode, 'edited');

    // Only report NEW issues (not already in original)
    const newSecrets = editScan.hardcodedSecrets.filter(
      s => !origScan.hardcodedSecrets.some(o => o.type === s.type && o.line === s.line)
    );
    const newMalicious = editScan.maliciousPatterns.filter(
      m => !origScan.maliciousPatterns.some(o => o.type === m.type && o.line === m.line)
    );

    const warnings: CodeWarning[] = [];
    for (const s of newSecrets) {
      warnings.push({ type: 'hardcoded_secret', severity: s.severity, line: s.line, message: `Edit introduced hardcoded ${s.name}`, fix: 'Use environment variables' });
    }
    for (const m of newMalicious) {
      warnings.push({ type: m.type, severity: m.severity, line: m.line, message: `Edit introduced: ${m.description}`, fix: this.getSuggestedFix(m.type) });
    }

    return {
      safe: warnings.length === 0,
      warnings, suggestions: [],
      autoFixed: null,
      requiresReview: warnings.some(w => w.severity === 'critical' || w.severity === 'high'),
    };
  }

  scanBeforeAgentApply(files: { path: string; content: string; operation: string }[]): Map<string, GeneratedCodeScanResult> {
    const results = new Map<string, GeneratedCodeScanResult>();
    for (const file of files) {
      const op = (['insert', 'replace', 'create'].includes(file.operation) ? file.operation : 'create') as 'insert' | 'replace' | 'create';
      const result = this.scanBeforeApply(file.content, file.path, op);
      results.set(file.path, result);
    }
    return results;
  }

  autoFixSecurityIssues(code: string, filePath: string): { fixed: string; fixesApplied: string[] } {
    let fixed = code;
    const fixesApplied: string[] = [];

    // Replace hardcoded secrets with env var references
    const secretPatterns = [
      { regex: /(['"])(sk-[A-Za-z0-9]{48,})\1/g, env: 'OPENAI_API_KEY', label: 'OpenAI key' },
      { regex: /(['"])(sk-ant-[A-Za-z0-9-]{90,})\1/g, env: 'ANTHROPIC_API_KEY', label: 'Anthropic key' },
      { regex: /(['"])(ghp_[A-Za-z0-9]{36,})\1/g, env: 'GITHUB_TOKEN', label: 'GitHub token' },
      { regex: /(['"])(AKIA[0-9A-Z]{16})\1/g, env: 'AWS_ACCESS_KEY_ID', label: 'AWS key' },
    ];

    for (const { regex, env, label } of secretPatterns) {
      if (regex.test(fixed)) {
        fixed = fixed.replace(regex, `process.env.${env}`);
        fixesApplied.push(`Replaced hardcoded ${label} with process.env.${env}`);
      }
    }

    // Replace http:// with https:// (not localhost)
    const httpReplace = fixed.replace(/http:\/\/(?!localhost|127\.0\.0\.1)/g, 'https://');
    if (httpReplace !== fixed) {
      fixed = httpReplace;
      fixesApplied.push('Replaced http:// with https://');
    }

    // Replace var with const
    const varReplace = fixed.replace(/\bvar\s+(\w+)\s*=/g, 'const $1 =');
    if (varReplace !== fixed) {
      fixed = varReplace;
      fixesApplied.push('Replaced var with const');
    }

    return { fixed, fixesApplied };
  }

  private getSuggestedFix(type: string): string | null {
    const fixes: Record<string, string> = {
      code_injection: 'Use Function constructor or safe alternatives instead of eval()',
      command_injection: 'Use execFile() with argument array instead of exec() with string',
      path_traversal: 'Use path.resolve() and validate against workspace root',
      prototype_pollution: 'Use Object.create(null) or Map instead of plain objects',
      sql_injection: 'Use parameterized queries ($1, $2) instead of string interpolation',
      xss: 'Use textContent or a sanitizer like DOMPurify',
      insecure_tls: 'Remove rejectUnauthorized: false or use proper CA certificates',
      insecure_protocol: 'Use HTTPS instead of HTTP',
      shell_injection: 'Use execFile with separate arguments',
    };
    return fixes[type] || null;
  }

  dispose(): void {}
}
