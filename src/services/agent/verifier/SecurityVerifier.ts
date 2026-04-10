/**
 * SecurityVerifier.ts
 * Phase 18.2 — OWASP Top 10 + secret detection + dangerous-function scan
 *
 * All checks are static pattern matches — no network calls, no AI.
 * Designed to be fast and deterministic so it can run on every code apply.
 */

import { VerificationResult, VerificationSeverity } from './VerifierTypes';

// ============================================================

interface SecurityRule {
  id: string;
  pattern: RegExp;
  severity: VerificationSeverity;
  message: string;
  owasp?: string;
  cwe?: string;
  remediation?: string;
  /** Languages this rule applies to (empty = all) */
  languages?: string[];
}

const SECRET_RULES: SecurityRule[] = [
  {
    id: 'secret-aws-key',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'critical',
    message: 'Hardcoded AWS Access Key ID detected',
    cwe: 'CWE-798',
    remediation: 'Use environment variables or secret manager',
  },
  {
    id: 'secret-aws-secret',
    pattern: /aws_secret_access_key\s*[:=]\s*['"][A-Za-z0-9/+=]{40}['"]/i,
    severity: 'critical',
    message: 'Hardcoded AWS secret access key',
    cwe: 'CWE-798',
  },
  {
    id: 'secret-github-token',
    pattern: /gh[pousr]_[A-Za-z0-9]{36,}/,
    severity: 'critical',
    message: 'Hardcoded GitHub personal access token',
    cwe: 'CWE-798',
  },
  {
    id: 'secret-openai',
    pattern: /sk-[A-Za-z0-9]{20,}/,
    severity: 'critical',
    message: 'Hardcoded OpenAI-style API key',
    cwe: 'CWE-798',
  },
  {
    id: 'secret-stripe',
    pattern: /(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{24,}/,
    severity: 'critical',
    message: 'Hardcoded Stripe API key',
    cwe: 'CWE-798',
  },
  {
    id: 'secret-slack',
    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/,
    severity: 'high',
    message: 'Hardcoded Slack token',
    cwe: 'CWE-798',
  },
  {
    id: 'secret-generic-password',
    pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/i,
    severity: 'high',
    message: 'Hardcoded password literal',
    cwe: 'CWE-798',
    remediation: 'Move credentials to environment variables',
  },
  {
    id: 'secret-private-key',
    pattern: /-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP) PRIVATE KEY-----/,
    severity: 'critical',
    message: 'Private key embedded in source',
    cwe: 'CWE-798',
  },
];

const OWASP_RULES: SecurityRule[] = [
  {
    id: 'dangerous-eval',
    pattern: /\beval\s*\(/,
    severity: 'critical',
    message: 'eval() can execute arbitrary code',
    owasp: 'A03-Injection',
    cwe: 'CWE-95',
    remediation: 'Use JSON.parse, or a safe expression evaluator',
    languages: ['javascript', 'typescript', 'tsx', 'jsx', 'js', 'ts'],
  },
  {
    id: 'dangerous-function',
    pattern: /new\s+Function\s*\(/,
    severity: 'high',
    message: 'new Function() dynamic code construction',
    owasp: 'A03-Injection',
    cwe: 'CWE-95',
    languages: ['javascript', 'typescript', 'tsx', 'jsx', 'js', 'ts'],
  },
  {
    id: 'dangerous-innerhtml',
    pattern: /dangerouslySetInnerHTML|\.innerHTML\s*=/,
    severity: 'high',
    message: 'Direct HTML injection — XSS risk',
    owasp: 'A03-Injection',
    cwe: 'CWE-79',
    remediation: 'Use textContent, or sanitize via DOMPurify before rendering',
    languages: ['javascript', 'typescript', 'tsx', 'jsx', 'js', 'ts'],
  },
  {
    id: 'dangerous-exec',
    pattern: /child_process\.(?:exec|execSync)\s*\(/,
    severity: 'high',
    message: 'child_process.exec — command injection risk',
    owasp: 'A03-Injection',
    cwe: 'CWE-78',
    remediation: 'Use spawn() with array args, or sanitize/escape input',
    languages: ['javascript', 'typescript', 'js', 'ts'],
  },
  {
    id: 'sql-concat',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s.*\+\s*\w+/i,
    severity: 'critical',
    message: 'SQL string concatenation — injection risk',
    owasp: 'A03-Injection',
    cwe: 'CWE-89',
    remediation: 'Use parameterized queries ($1 / ?) or a query builder',
  },
  {
    id: 'path-traversal',
    pattern: /\.\.(?:[/\\]\.\.){1,}/,
    severity: 'high',
    message: 'Path traversal pattern detected',
    owasp: 'A01-Broken Access Control',
    cwe: 'CWE-22',
  },
  {
    id: 'weak-random',
    pattern: /Math\.random\s*\(\s*\).*(?:token|password|secret|key|id|nonce)/i,
    severity: 'high',
    message: 'Math.random() used for security-sensitive value',
    owasp: 'A02-Cryptographic Failures',
    cwe: 'CWE-338',
    remediation: 'Use crypto.randomBytes / crypto.getRandomValues',
  },
  {
    id: 'md5-sha1',
    pattern: /createHash\s*\(\s*['"](?:md5|sha1)['"]/,
    severity: 'high',
    message: 'Weak hash algorithm (MD5/SHA-1) — not collision-resistant',
    owasp: 'A02-Cryptographic Failures',
    cwe: 'CWE-327',
  },
  {
    id: 'disable-ssl-verify',
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/,
    severity: 'critical',
    message: 'TLS certificate verification disabled',
    owasp: 'A02-Cryptographic Failures',
    cwe: 'CWE-295',
  },
  {
    id: 'permissive-cors',
    pattern: /Access-Control-Allow-Origin['"]\s*,\s*['"]\*|cors\(\s*\{\s*origin\s*:\s*true/,
    severity: 'medium',
    message: 'Overly permissive CORS policy',
    owasp: 'A05-Security Misconfiguration',
    cwe: 'CWE-942',
  },
  {
    id: 'missing-auth-route',
    pattern: /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)\b/,
    severity: 'info',
    message: 'API route detected — confirm auth middleware is applied',
    owasp: 'A01-Broken Access Control',
    languages: ['typescript', 'ts', 'tsx'],
  },
];

// ============================================================

export class SecurityVerifier {
  private static instance: SecurityVerifier;

  private constructor() {}

  static getInstance(): SecurityVerifier {
    if (!SecurityVerifier.instance) {
      SecurityVerifier.instance = new SecurityVerifier();
    }
    return SecurityVerifier.instance;
  }

  /**
   * Scan code for security issues. Deterministic — safe to run frequently.
   */
  verify(code: string, filePath: string, language: string): VerificationResult[] {
    const results: VerificationResult[] = [];
    const lang = language.toLowerCase();
    const lines = code.split('\n');

    // Apply all rules to each line
    const allRules = [...SECRET_RULES, ...OWASP_RULES];
    for (const rule of allRules) {
      if (rule.languages && !rule.languages.includes(lang)) continue;
      lines.forEach((line, i) => {
        if (rule.pattern.test(line)) {
          results.push({
            status: rule.severity === 'info' ? 'info' : 'fail',
            category: 'security',
            severity: rule.severity,
            message: rule.message,
            file: filePath,
            line: i + 1,
            verifier: 'security',
            ruleId: rule.id,
            remediation: rule.remediation,
          });
        }
      });
    }

    // Cross-line checks
    results.push(...this.checkApiRouteAuth(code, filePath, lang));
    results.push(...this.checkInputValidation(code, filePath, lang));

    // If there were no findings, emit a passing info result so the report isn't empty
    if (results.length === 0) {
      results.push({
        status: 'pass',
        category: 'security',
        severity: 'info',
        message: 'No security rules triggered',
        file: filePath,
        line: 0,
        verifier: 'security',
      });
    }

    return results;
  }

  // ============================================================
  // Cross-line checks
  // ============================================================

  /**
   * In a Next.js API route (export async function GET/POST/...), flag if
   * there's no `auth` / `authenticate` / `getAuthMiddleware` call.
   */
  private checkApiRouteAuth(code: string, filePath: string, language: string): VerificationResult[] {
    if (!language.includes('ts') && !language.includes('js')) return [];
    // Quick check: does this look like an API route?
    if (!/export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE|PATCH)\b/.test(code)) return [];
    const hasAuth =
      /\bauthenticate\s*\(|\bgetAuthMiddleware\s*\(|\bverifyToken\s*\(|\bgetServerSession\s*\(/.test(code);
    if (hasAuth) return [];
    return [
      {
        status: 'warning',
        category: 'security',
        severity: 'high',
        message: 'API route handler has no apparent auth check',
        file: filePath,
        line: 0,
        verifier: 'security',
        ruleId: 'api-no-auth',
        remediation: 'Call getAuthMiddleware().authenticate(request) at the top of the handler',
      },
    ];
  }

  /**
   * Flag request.json()/await req.json() without any validation (Zod, Joi,
   * parseResult.safeParse, etc.).
   */
  private checkInputValidation(code: string, filePath: string, language: string): VerificationResult[] {
    if (!language.includes('ts') && !language.includes('js')) return [];
    if (!/\brequest\.json\s*\(\)|req\.json\s*\(\)/.test(code)) return [];
    const hasValidation =
      /\bsafeParse\s*\(|\bparse\s*\(|Zod|joi\.|yup\./.test(code);
    if (hasValidation) return [];
    return [
      {
        status: 'warning',
        category: 'security',
        severity: 'medium',
        message: 'request.json() consumed without schema validation',
        file: filePath,
        line: 0,
        verifier: 'security',
        ruleId: 'no-input-validation',
        remediation: 'Validate the body with Zod / Joi / Yup before use',
      },
    ];
  }
}
