/**
 * Phase 15.6 — AI Commit Message Types
 *
 * Type definitions and configuration for AI-powered commit message generation.
 */

// ============ Result Types ============

export interface CommitMessageResult {
  summary: string;
  body: string | null;
  type: string;
  scope: string | null;
  breaking: boolean;
  alternatives: CommitMessageAlternative[];
}

export interface CommitMessageAlternative {
  summary: string;
  style: string;
}

// ============ Configuration ============

export interface CommitMessageConfig {
  style: 'conventional' | 'descriptive' | 'imperative';
  includeBody: boolean;
  maxSummaryLength: number;
  language: string | null;
  includeScope: boolean;
  learnFromHistory: boolean;
}

export const DEFAULT_COMMIT_CONFIG: CommitMessageConfig = {
  style: 'conventional',
  includeBody: true,
  maxSummaryLength: 72,
  language: null,
  includeScope: true,
  learnFromHistory: true,
};

// ============ Internal Types ============

export interface CommitGenerateOptions {
  staged?: boolean;
  style?: CommitMessageConfig['style'];
  maxLength?: number;
  hint?: string;
}

export interface ParsedCommitStyle {
  dominant: 'conventional' | 'descriptive' | 'imperative';
  conventionalCount: number;
  totalCount: number;
  commonTypes: string[];
  commonScopes: string[];
}

export type CommitType =
  | 'feat'
  | 'fix'
  | 'test'
  | 'docs'
  | 'refactor'
  | 'style'
  | 'chore'
  | 'perf'
  | 'ci'
  | 'build';

export const COMMIT_TYPE_LABELS: Record<CommitType, string> = {
  feat: 'Features',
  fix: 'Bug Fixes',
  test: 'Tests',
  docs: 'Documentation',
  refactor: 'Code Refactoring',
  style: 'Styles',
  chore: 'Chores',
  perf: 'Performance Improvements',
  ci: 'Continuous Integration',
  build: 'Build System',
};

export interface AgentPlan {
  description: string;
  steps: string[];
  goal: string;
}
