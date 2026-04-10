/**
 * DebugTypes.ts — Phase 19 Step 19.1
 * AI-Powered Debugger type definitions
 */

export interface StackFrame {
  file: string;
  line: number;
  column?: number;
  functionName: string;
  args?: string[];
  localVariables?: Record<string, string>;
  isUserCode: boolean;
}

export type ErrorType = 'TypeError' | 'ReferenceError' | 'SyntaxError' | 'RuntimeError' | 'CustomError' | 'AssertionError' | 'NetworkError' | 'PermissionError';

export interface ParsedError {
  type: ErrorType;
  message: string;
  stackFrames: StackFrame[];
  rawOutput: string;
  language: string;
  exitCode?: number;
  causedBy?: ParsedError;
}

export interface DebugContext {
  error: ParsedError;
  surroundingCode: Map<string, { code: string; startLine: number; endLine: number }>;
  gitBlame: Map<string, { line: number; author: string; date: string; commit: string }[]>;
  recentChanges: string;
  projectContext?: { dependencies?: Record<string, string>; tsConfig?: any };
}

export interface Fix {
  description: string;
  file: string;
  diff: string;
  risk: 'low' | 'medium' | 'high';
  breakingChange: boolean;
}

export interface DiagnosticResult {
  rootCause: string;
  explanation: string;
  suggestedFixes: Fix[];
  confidence: number;
  relatedFiles: string[];
  breakpoints?: SuggestedBreakpoint[];
}

export interface SuggestedBreakpoint {
  file: string;
  line: number;
  condition?: string;
  logMessage?: string;
  reason: string;
}

export interface DebugConfig {
  autoAnalyze: boolean;
  maxFrameDepth: number;
  includeGitBlame: boolean;
  includeRecentChanges: boolean;
  autoFixOnHighConfidence: boolean;
  tokenBudget: number;
}

export const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  autoAnalyze: false,
  maxFrameDepth: 10,
  includeGitBlame: true,
  includeRecentChanges: true,
  autoFixOnHighConfidence: false,
  tokenBudget: 8000,
};

export interface DebugAnalysisEvent {
  type: 'parsing' | 'building_context' | 'analyzing' | 'complete' | 'error';
  progress: number;
  message?: string;
  result?: DiagnosticResult;
}
