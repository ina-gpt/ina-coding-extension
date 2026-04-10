/**
 * VerifierTypes.ts
 * Phase 18.2 — Verifier Agent type definitions
 *
 * The Verifier runs multiple checks (syntax, logic, security, style, tests)
 * over AI-generated code and produces a structured report. If the score
 * falls below a threshold, the code can be sent back to the CODER agent
 * for auto-fixing.
 */

// ============================================================

export type VerificationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type VerificationCategory =
  | 'syntax'
  | 'logic'
  | 'security'
  | 'style'
  | 'test'
  | 'performance'
  | 'convention';

export type VerificationStatus = 'pass' | 'fail' | 'warning' | 'info';

export interface VerificationResult {
  status: VerificationStatus;
  category: VerificationCategory;
  severity: VerificationSeverity;
  message: string;
  file: string;
  line: number;
  column?: number;
  /** Which sub-verifier produced this result (syntax|logic|security|...) */
  verifier: string;
  /** Optional remediation hint */
  remediation?: string;
  /** Optional rule / CWE / OWASP id */
  ruleId?: string;
}

export interface VerificationReport {
  /** Overall pass/fail/warning verdict */
  verdict: 'pass' | 'warning' | 'fail';
  /** Numeric score 0..100 */
  score: number;
  results: VerificationResult[];
  /** Aggregate counts by severity */
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  /** High-level plain-text summary */
  summary: string;
  /** Actionable suggestions the CODER agent can apply */
  suggestions: string[];
  /** Total wall-clock time of verification in ms */
  durationMs: number;
  /** Per-sub-verifier timings for debugging */
  subVerifierTimings: Record<string, number>;
  /** File under test (for single-file runs) */
  filePath: string;
  /** Language id (typescript, python, go, ...) */
  language: string;
}

export interface VerificationConfig {
  enableSyntaxCheck: boolean;
  enableLogicReview: boolean;
  enableSecurityScan: boolean;
  enableStyleCheck: boolean;
  enableTestCoverage: boolean;
  /** Score below which verification "fails" */
  passThreshold: number;
  /** Strict mode blocks on any high/critical finding */
  strictMode: boolean;
  /** Max auto-fix iterations before giving up */
  maxFixIterations: number;
  /** Timeout for each individual verifier */
  subVerifierTimeoutMs: number;
}

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  enableSyntaxCheck: true,
  enableLogicReview: true,
  enableSecurityScan: true,
  enableStyleCheck: false,
  enableTestCoverage: false,
  passThreshold: 70,
  strictMode: false,
  maxFixIterations: 3,
  subVerifierTimeoutMs: 45_000,
};

// ============================================================
// Scoring weights per category
// ============================================================

export const SEVERITY_WEIGHTS: Record<VerificationSeverity, number> = {
  critical: 40,
  high: 20,
  medium: 10,
  low: 3,
  info: 0,
};

/**
 * Compute an overall score from the results list.
 * Starts at 100 and subtracts severity weights for each issue.
 */
export function computeScore(results: VerificationResult[]): number {
  let score = 100;
  for (const r of results) {
    if (r.status === 'fail' || r.status === 'warning') {
      score -= SEVERITY_WEIGHTS[r.severity];
    }
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Determine the verdict from a score + config.
 */
export function computeVerdict(
  score: number,
  results: VerificationResult[],
  config: VerificationConfig
): 'pass' | 'warning' | 'fail' {
  if (config.strictMode) {
    for (const r of results) {
      if (r.severity === 'critical' || r.severity === 'high') return 'fail';
    }
  }
  if (score >= config.passThreshold + 20) return 'pass';
  if (score >= config.passThreshold) return 'warning';
  return 'fail';
}
