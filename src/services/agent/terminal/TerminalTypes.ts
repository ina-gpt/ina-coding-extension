import * as vscode from 'vscode';

// ============ Enums ============

export enum TerminalCommandCategory {
  INSTALL = 'install',
  BUILD = 'build',
  TEST = 'test',
  LINT = 'lint',
  FORMAT = 'format',
  TYPE_CHECK = 'typecheck',
  SCRIPT = 'script',
  GIT = 'git',
  CUSTOM = 'custom',
}

export enum TerminalExecutionStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMED_OUT = 'timed_out',
  CANCELLED = 'cancelled',
  RETRYING = 'retrying',
}

export enum AutoFixStrategy {
  SINGLE_ERROR = 'single',
  BATCH_SIMILAR = 'batch',
  ALL_AT_ONCE = 'all',
}

export enum CommandSecurityLevel {
  SAFE = 'safe',
  NEEDS_REVIEW = 'needs_review',
  DANGEROUS = 'dangerous',
  BLOCKED = 'blocked',
}

// ============ Command ============

export interface TerminalCommand {
  id: string;
  command: string;
  cwd: string;
  description: string;
  category: TerminalCommandCategory;
  timeout: number;
  env: Record<string, string> | null;
  shell: string | null;
  requiresApproval: boolean;
  retryOnFail: boolean;
  maxRetries: number;
  expectedExitCode: number;
  captureOutput: boolean;
}

// ============ Execution ============

export interface TerminalExecution {
  id: string;
  command: TerminalCommand;
  status: TerminalExecutionStatus;
  startTime: number;
  endTime: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  parsedResult: TerminalParsedResult | null;
  retryCount: number;
  error: TerminalError | null;
}

// ============ Parsed Results ============

export interface TerminalParsedResult {
  success: boolean;
  summary: string;
  errors: ParsedError[];
  warnings: ParsedWarning[];
  stats: TerminalStats | null;
  framework: string | null;
}

export interface ParsedError {
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  code: string | null;
  severity: 'error' | 'warning' | 'info';
  source: string;
  fixable: boolean;
  fixSuggestion: string | null;
  rawOutput: string;
}

export interface ParsedWarning {
  message: string;
  file: string | null;
  line: number | null;
  code: string | null;
  source: string;
}

export interface TerminalStats {
  total: number | null;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  duration: number | null;
  coverage: number | null;
}

export interface TerminalError {
  message: string;
  code: string;
  recoverable: boolean;
  suggestion: string | null;
}

// ============ Auto-Fix ============

export interface AutoFixRequest {
  errors: ParsedError[];
  sessionId: string;
  maxAttempts: number;
  strategy: AutoFixStrategy;
}

export interface AutoFixResult {
  fixed: ParsedError[];
  remaining: ParsedError[];
  filesModified: string[];
  attempts: number;
  success: boolean;
}

// ============ Session ============

export interface TerminalSession {
  id: string;
  name: string;
  cwd: string;
  isActive: boolean;
  terminal: vscode.Terminal | null;
  executions: TerminalExecution[];
}

// ============ Events ============

export type TerminalEvent =
  | 'command-start'
  | 'command-output'
  | 'command-complete'
  | 'command-failed'
  | 'command-timeout'
  | 'auto-fix-start'
  | 'auto-fix-attempt'
  | 'auto-fix-complete'
  | 'approval-needed';

// ============ Constants ============

export const COMMAND_TIMEOUTS: Record<TerminalCommandCategory, number> = {
  [TerminalCommandCategory.INSTALL]: 300000,
  [TerminalCommandCategory.BUILD]: 180000,
  [TerminalCommandCategory.TEST]: 120000,
  [TerminalCommandCategory.LINT]: 60000,
  [TerminalCommandCategory.FORMAT]: 30000,
  [TerminalCommandCategory.TYPE_CHECK]: 60000,
  [TerminalCommandCategory.SCRIPT]: 60000,
  [TerminalCommandCategory.GIT]: 30000,
  [TerminalCommandCategory.CUSTOM]: 60000,
};

export const MAX_OUTPUT_BUFFER = 1 * 1024 * 1024;
export const MAX_AUTO_FIX_ATTEMPTS = 3;
