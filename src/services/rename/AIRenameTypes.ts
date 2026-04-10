/**
 * AIRenameTypes.ts
 * Phase 16.7 — AI-powered rename suggestions
 */

export type NamingConvention =
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'UPPER_SNAKE'
  | 'kebab-case'
  | 'unknown';

export interface RenameSuggestion {
  name: string;
  reason: string;
  /** 0..1 confidence score from the model */
  confidence: number;
  convention: NamingConvention;
}

export interface RenameContext {
  currentName: string;
  /** SymbolKind label: 'function', 'class', 'variable', etc. */
  symbolKind: string;
  language: string;
  /** Lines of code where the symbol is used (for context) */
  usageContext: string[];
  /** Surrounding file content snippet */
  fileContent: string;
  /** Project-wide naming convention from rules / detection (or null) */
  projectConventions: string | null;
}

export interface RenameSuggestionsResponse {
  suggestions: RenameSuggestion[];
  durationMs: number;
}

export const DEFAULT_MAX_SUGGESTIONS = 5;
