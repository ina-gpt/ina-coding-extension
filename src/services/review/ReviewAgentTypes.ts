/**
 * ReviewAgentTypes.ts — Phase 19 Step 19.3
 * PR/Code Review Agent type definitions
 */

export interface ReviewScope {
  files: string[];
  baseBranch?: string;
  headBranch?: string;
  commitRange?: string;
  staged?: boolean;
}

export type ReviewSeverity = 'critical' | 'warning' | 'suggestion' | 'nitpick';
export type ReviewCategory = 'bug' | 'security' | 'performance' | 'style' | 'naming' | 'complexity' | 'documentation' | 'testing' | 'error-handling';
export type PRType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'test' | 'ci';
export type ApprovalStatus = 'approve' | 'request-changes' | 'comment';

export interface ReviewComment {
  file: string;
  line: number;
  endLine?: number;
  severity: ReviewSeverity;
  category: ReviewCategory;
  message: string;
  suggestedFix?: string;
  codeSnippet?: string;
}

export interface ReviewReport {
  summary: string;
  overallScore: number;
  comments: ReviewComment[];
  approvalStatus: ApprovalStatus;
  timeSpent: number;
  linesReviewed: number;
  filesReviewed: number;
  categoryCounts: Partial<Record<ReviewCategory, number>>;
}

export interface PRDescription {
  title: string;
  body: string;
  type: PRType;
  breakingChanges: string[];
  testingNotes: string;
  reviewerSuggestions: string[];
}

export interface FileDiff {
  file: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  language: string;
  isBinary: boolean;
  oldFile?: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  context?: string;
}

export interface ReviewConfig {
  maxFilesPerReview: number;
  ignorePaths: string[];
  severityThreshold: ReviewSeverity;
  categories: ReviewCategory[];
  customRules: string[];
  maxLinesPerChunk: number;
}

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  maxFilesPerReview: 50,
  ignorePaths: ['node_modules', 'dist', 'build', '.next', 'coverage', '*.lock', '*.min.*', 'vendor', '__pycache__'],
  severityThreshold: 'warning',
  categories: ['bug', 'security', 'performance', 'style', 'naming', 'complexity', 'documentation', 'testing', 'error-handling'],
  customRules: [],
  maxLinesPerChunk: 500,
};
