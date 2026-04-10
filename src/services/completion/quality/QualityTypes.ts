import { CompletionItem } from '../CompletionTypes';

// ============ Enums ============

export enum QualityCheckResult {
  PASS = 'pass',
  FAIL = 'fail',
  WARN = 'warn',
  SKIP = 'skip',
}

export enum FilterReason {
  LOW_CONFIDENCE = 'low_confidence',
  DUPLICATE = 'duplicate',
  SYNTAX_ERROR = 'syntax_error',
  INDENTATION_MISMATCH = 'indentation_mismatch',
  TOO_SHORT = 'too_short',
  TOO_LONG = 'too_long',
  REPETITIVE = 'repetitive',
  INCOMPLETE = 'incomplete',
  HALLUCINATION = 'hallucination',
  UNSAFE_PATTERN = 'unsafe_pattern',
  USER_REJECTED_PATTERN = 'user_rejected_pattern',
}

// ============ Scoring ============

export interface QualityScore {
  overall: number;
  confidence: number;
  syntax: number;
  relevance: number;
  formatting: number;
  safety: number;
  userPreference: number;
}

export interface QualityCheck {
  name: string;
  result: QualityCheckResult;
  reason: string | null;
  score: number;
  details: Record<string, unknown>;
}

export interface QualityReport {
  completion: string;
  originalScore: number;
  adjustedScore: number;
  checks: QualityCheck[];
  passed: boolean;
  filterReason: FilterReason | null;
  suggestions: string[];
}

// ============ Feedback ============

export interface CompletionFeedback {
  completionId: string;
  completionText: string;
  accepted: boolean;
  timestamp: number;
  context: {
    language: string;
    filePath: string;
    prefix: string;
    suffix: string;
  };
  editedText: string | null;
  timeToDecision: number;
  cursorMovedAfter: boolean;
}

// ============ User Preferences ============

export interface PatternStats {
  pattern: string;
  count: number;
  lastSeen: number;
  confidence: number;
  contexts: string[];
}

export interface LanguagePreference {
  language: string;
  acceptRate: number;
  avgLength: number;
  preferredIndentation: 'tabs' | 'spaces';
  indentSize: number;
  semicolons: boolean;
  trailingCommas: boolean;
}

export interface UserPreferences {
  userId: string;
  acceptedPatterns: PatternStats[];
  rejectedPatterns: PatternStats[];
  languagePreferences: Map<string, LanguagePreference>;
  averageAcceptLength: number;
  preferredCompletionStyle: 'minimal' | 'verbose' | 'balanced';
}

// ============ Deduplication ============

export interface DeduplicationResult {
  unique: CompletionItem[];
  duplicates: Array<{
    item: CompletionItem;
    duplicateOf: string;
    similarity: number;
  }>;
}

// ============ Formatting ============

export interface FormattingContext {
  indentation: string;
  lineContent: string;
  language: string;
  isInString: boolean;
  isInComment: boolean;
  bracketDepth: number;
}

export interface FormattingRule {
  name: string;
  language: string;
  pattern: RegExp;
  replacement: string | ((match: string, context: FormattingContext) => string);
  priority: number;
}

// ============ Safety ============

export interface SafetyIssue {
  type: string;
  pattern: string;
  position: number;
  message: string;
  severity: 'warning' | 'danger';
  suggestion: string | null;
}

// ============ Hallucination ============

export interface HallucinationIssue {
  type: 'undefined_variable' | 'undefined_function' | 'undefined_type' | 'invalid_api' | 'wrong_signature';
  symbol: string;
  position: number;
  suggestion: string | null;
}

// ============ Defaults ============

export const DEFAULT_MIN_CONFIDENCE: number = 0.3;
export const DEFAULT_MIN_LENGTH: number = 2;
export const DEFAULT_MAX_LENGTH: number = 500;
