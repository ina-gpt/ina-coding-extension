import { SafetyIssue } from './QualityTypes';

export class SafetyChecker {
  private static instance: SafetyChecker;
  private unsafePatterns: Map<string, Array<{ pattern: RegExp; message: string; suggestion: string | null }>> = new Map();
  private warningPatterns: Map<string, Array<{ pattern: RegExp; message: string; suggestion: string | null }>> = new Map();

  constructor() {
    this.initializePatterns();
  }

  static getInstance(): SafetyChecker {
    if (!SafetyChecker.instance) {
      SafetyChecker.instance = new SafetyChecker();
    }
    return SafetyChecker.instance;
  }

  check(
    completion: string,
    language: string
  ): { safe: boolean; issues: SafetyIssue[]; severity: 'none' | 'warning' | 'danger' } {
    const issues: SafetyIssue[] = [];

    issues.push(...this.checkForEval(completion, language));
    issues.push(...this.checkForInjection(completion, language));
    issues.push(...this.checkForHardcodedSecrets(completion));
    issues.push(...this.checkForInsecurePatterns(completion, language));

    const hasDanger = issues.some((i) => i.severity === 'danger');
    const hasWarning = issues.some((i) => i.severity === 'warning');

    return {
      safe: !hasDanger,
      issues,
      severity: hasDanger ? 'danger' : hasWarning ? 'warning' : 'none',
    };
  }

  checkForEval(completion: string, language: string): SafetyIssue[] {
    const issues: SafetyIssue[] = [];

    if (['javascript', 'typescript', 'typescriptreact', 'javascriptreact'].includes(language)) {
      if (/\beval\s*\(/.test(completion)) {
        issues.push({
          type: 'eval',
          pattern: 'eval()',
          position: completion.search(/\beval\s*\(/),
          message: 'eval() can execute arbitrary code - use safer alternatives',
          severity: 'danger',
          suggestion: 'JSON.parse() for JSON, or Function constructor with validation',
        });
      }
      if (/new\s+Function\s*\(/.test(completion)) {
        issues.push({
          type: 'function_constructor',
          pattern: 'new Function()',
          position: completion.search(/new\s+Function\s*\(/),
          message: 'Function constructor is similar to eval()',
          severity: 'warning',
          suggestion: null,
        });
      }
      if (/\.innerHTML\s*=/.test(completion) && !/sanitize|escape|DOMPurify/.test(completion)) {
        issues.push({
          type: 'xss',
          pattern: 'innerHTML',
          position: completion.search(/\.innerHTML\s*=/),
          message: 'innerHTML without sanitization can lead to XSS',
          severity: 'warning',
          suggestion: 'Use textContent or sanitize with DOMPurify',
        });
      }
      if (/document\.write\s*\(/.test(completion)) {
        issues.push({
          type: 'document_write',
          pattern: 'document.write()',
          position: completion.search(/document\.write\s*\(/),
          message: 'document.write() can overwrite page content',
          severity: 'warning',
          suggestion: 'Use DOM manipulation methods instead',
        });
      }
    }

    if (language === 'python') {
      if (/\beval\s*\(/.test(completion)) {
        issues.push({
          type: 'eval',
          pattern: 'eval()',
          position: completion.search(/\beval\s*\(/),
          message: 'eval() can execute arbitrary code',
          severity: 'danger',
          suggestion: 'Use ast.literal_eval() for safe evaluation',
        });
      }
      if (/\bexec\s*\(/.test(completion)) {
        issues.push({
          type: 'exec',
          pattern: 'exec()',
          position: completion.search(/\bexec\s*\(/),
          message: 'exec() can execute arbitrary code',
          severity: 'danger',
          suggestion: null,
        });
      }
      if (/subprocess.*shell\s*=\s*True/.test(completion)) {
        issues.push({
          type: 'shell_injection',
          pattern: 'shell=True',
          position: completion.search(/shell\s*=\s*True/),
          message: 'subprocess with shell=True can lead to shell injection',
          severity: 'danger',
          suggestion: 'Use shell=False with a list of arguments',
        });
      }
    }

    return issues;
  }

  checkForInjection(completion: string, language: string): SafetyIssue[] {
    const issues: SafetyIssue[] = [];

    // SQL injection - string concatenation in queries
    if (/(?:SELECT|INSERT|UPDATE|DELETE|WHERE|AND|OR).*['"]\s*\+\s*\w+/.test(completion)) {
      issues.push({
        type: 'sql_injection',
        pattern: 'string concatenation in SQL',
        position: 0,
        message: 'String concatenation in SQL queries can lead to SQL injection',
        severity: 'danger',
        suggestion: 'Use parameterized queries or prepared statements',
      });
    }

    // Template literal in SQL without escaping
    if (/(?:SELECT|INSERT|UPDATE|DELETE|WHERE).*`.*\$\{/.test(completion)) {
      issues.push({
        type: 'sql_injection',
        pattern: 'template literal in SQL',
        position: 0,
        message: 'Template literals in SQL queries can lead to SQL injection',
        severity: 'warning',
        suggestion: 'Use parameterized queries',
      });
    }

    return issues;
  }

  checkForHardcodedSecrets(completion: string): SafetyIssue[] {
    const issues: SafetyIssue[] = [];

    const secretPatterns = [
      { pattern: /(?:password|passwd|pwd)\s*=\s*['"][^'"]{4,}['"]/i, type: 'hardcoded_password' },
      { pattern: /(?:api[_-]?key|apikey)\s*=\s*['"][A-Za-z0-9_\-]{16,}['"]/i, type: 'hardcoded_api_key' },
      { pattern: /(?:secret|token)\s*=\s*['"][A-Za-z0-9_\-]{16,}['"]/i, type: 'hardcoded_secret' },
      { pattern: /(?:aws_access_key_id|aws_secret_access_key)\s*=\s*['"][^'"]+['"]/i, type: 'aws_credentials' },
    ];

    for (const { pattern, type } of secretPatterns) {
      if (pattern.test(completion)) {
        issues.push({
          type,
          pattern: type,
          position: completion.search(pattern),
          message: `Hardcoded ${type.replace(/_/g, ' ')} detected`,
          severity: 'danger',
          suggestion: 'Use environment variables or a secrets manager',
        });
      }
    }

    return issues;
  }

  checkForInsecurePatterns(completion: string, language: string): SafetyIssue[] {
    const issues: SafetyIssue[] = [];

    // Insecure random for crypto
    if (/Math\.random\s*\(\)/.test(completion) &&
        /(?:token|key|secret|password|hash|salt|nonce|iv)/i.test(completion)) {
      issues.push({
        type: 'insecure_random',
        pattern: 'Math.random() for crypto',
        position: completion.search(/Math\.random/),
        message: 'Math.random() is not cryptographically secure',
        severity: 'warning',
        suggestion: 'Use crypto.randomBytes() or crypto.getRandomValues()',
      });
    }

    return issues;
  }

  getSafetyScore(completion: string, language: string): number {
    const result = this.check(completion, language);
    if (result.severity === 'danger') return 0.2;
    if (result.severity === 'warning') return 0.6;
    return 1.0;
  }

  suggestSafeAlternative(issue: SafetyIssue, completion: string): string | null {
    return issue.suggestion;
  }

  private initializePatterns(): void {
    // Patterns are applied inline in check methods for better readability
  }
}
