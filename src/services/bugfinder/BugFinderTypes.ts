/**
 * Phase 15.5 — Bug Finder Types
 * Type definitions, enums, and prompt constants for the Bug Finder service.
 */

// ============ Enums ============

export enum BugSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

export enum BugCategory {
  LOGIC = 'logic',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  TYPE_SAFETY = 'type',
  EDGE_CASE = 'edge_case',
  ERROR_HANDLING = 'error_handling',
  RACE_CONDITION = 'race',
  MEMORY_LEAK = 'memory',
  NULL_REFERENCE = 'null_ref',
  DEAD_CODE = 'dead_code',
  CODE_SMELL = 'code_smell',
}

export enum ScanMode {
  CURRENT_FILE = 'current',
  CHANGED_FILES = 'changed',
  FULL_PROJECT = 'full',
  SELECTION = 'selection',
}

// ============ Interfaces ============

export interface BugFix {
  /** Human-readable description of the fix */
  description: string;
  /** The replacement code */
  code: string;
  /** Start line of the code to replace (1-based) */
  startLine: number;
  /** End line of the code to replace (1-based) */
  endLine: number;
}

export interface BugReport {
  /** Unique identifier for this bug report */
  id: string;
  /** Absolute file path where the bug was found */
  filePath: string;
  /** Start line of the buggy region (1-based) */
  startLine: number;
  /** End line of the buggy region (1-based) */
  endLine: number;
  /** How severe the bug is */
  severity: BugSeverity;
  /** What category the bug falls into */
  category: BugCategory;
  /** Short title summarizing the bug */
  title: string;
  /** Detailed explanation of the bug */
  description: string;
  /** How to fix it */
  suggestion: string;
  /** The code snippet containing the bug */
  codeSnippet: string;
  /** An optional automated fix */
  fix: BugFix | null;
  /** Current lifecycle status */
  status: 'open' | 'fixing' | 'fixed' | 'dismissed';
}

export interface ScanResult {
  /** All bugs found during the scan */
  bugs: BugReport[];
  /** Number of files that were scanned */
  filesScanned: number;
  /** Total scan duration in milliseconds */
  scanTimeMs: number;
  /** Which scan mode was used */
  mode: ScanMode;
}

export interface ScanProgress {
  /** Current phase of the scan */
  phase: 'collecting' | 'analyzing' | 'complete';
  /** Current item index (0-based) */
  current: number;
  /** Total items to process */
  total: number;
  /** File currently being analyzed, if applicable */
  currentFile: string | null;
}

// ============ Severity Ordering ============

export const SEVERITY_ORDER: Record<BugSeverity, number> = {
  [BugSeverity.CRITICAL]: 0,
  [BugSeverity.HIGH]: 1,
  [BugSeverity.MEDIUM]: 2,
  [BugSeverity.LOW]: 3,
  [BugSeverity.INFO]: 4,
};

// ============ Validation Helpers ============

export function isValidSeverity(value: string): value is BugSeverity {
  return Object.values(BugSeverity).includes(value as BugSeverity);
}

export function isValidCategory(value: string): value is BugCategory {
  return Object.values(BugCategory).includes(value as BugCategory);
}

// ============ Raw AI Response Shape ============

export interface RawBugEntry {
  severity?: string;
  category?: string;
  title?: string;
  description?: string;
  suggestion?: string;
  line?: number;
  endLine?: number;
  codeSnippet?: string;
  fix?: {
    description?: string;
    code?: string;
    startLine?: number;
    endLine?: number;
  } | null;
}

// ============ Scan Options ============

export interface ProjectScanOptions {
  /** Glob patterns to include (default: common source patterns) */
  include?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
  /** Maximum number of files to scan */
  maxFiles?: number;
  /** Only scan files modified within the last N minutes */
  modifiedWithinMinutes?: number;
}

// ============ Master Prompt ============

export const BUG_SCAN_PROMPT = `You are an expert code reviewer and bug detector. Analyze the provided code carefully and identify real bugs, potential issues, and code problems.

Focus on the following categories:
1. **Logic errors** — incorrect conditions, off-by-one errors, wrong operators, inverted boolean logic, unreachable branches.
2. **Security vulnerabilities** — injection risks (SQL, XSS, command), insecure randomness, hardcoded secrets, path traversal, missing input validation.
3. **Null / undefined references** — accessing properties on possibly null/undefined values, missing null checks, unsafe optional chaining gaps.
4. **Missing error handling** — unhandled promise rejections, missing try/catch around I/O, swallowed errors, missing finally cleanup.
5. **Race conditions** — shared mutable state without synchronization, TOCTOU issues, concurrent access to collections, missing locks or semaphores.
6. **Performance issues** — O(n^2) loops that could be O(n), redundant re-computation, unnecessary allocations in hot paths, missing memoization.
7. **Type safety** — implicit any, unsafe type assertions, missing discriminated union checks, incorrect generic constraints.
8. **Edge cases** — empty arrays/strings not handled, negative numbers, integer overflow, Unicode edge cases, boundary conditions.
9. **Memory leaks** — event listeners never removed, intervals never cleared, growing caches without eviction, closures capturing large scopes.
10. **Dead code / code smells** — unreachable code, unused variables, duplicate logic, overly complex expressions, misleading names.

Rules:
- Only report genuine issues. Do NOT flag stylistic preferences or nitpicks.
- Each bug must have a clear explanation of WHY it is a problem.
- Provide an actionable suggestion for how to fix each bug.
- If you can provide an exact code fix, include it in the "fix" field.
- Line numbers must be relative to the provided code snippet (1-based).
- If you find no bugs, return an empty array.

Output format: a JSON array (no markdown fences, no surrounding text). Each element:
{
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "category": "logic" | "security" | "type" | "edge_case" | "error_handling" | "race" | "memory" | "null_ref" | "dead_code" | "code_smell" | "performance",
  "title": "Short descriptive title",
  "description": "Detailed explanation of the bug",
  "suggestion": "How to fix it",
  "line": <start line number>,
  "endLine": <end line number or same as line>,
  "codeSnippet": "the offending code",
  "fix": {
    "description": "What the fix does",
    "code": "replacement code",
    "startLine": <start>,
    "endLine": <end>
  } or null
}`;
