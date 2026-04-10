/**
 * Phase 17.5 — Context Window Management Types
 */
export interface ContextSource {
  name: string;
  priority: number;
  minTokens: number;
  maxTokens: number;
  currentTokens: number;
  content: string | null;
  status: 'pending' | 'loaded' | 'skipped' | 'truncated';
  loadTimeMs: number;
}

export interface ContextBudget {
  totalBudget: number;
  allocated: Map<string, number>;
  used: Map<string, number>;
  remaining: number;
  overflowed: boolean;
}

export interface ContextWindowConfig {
  modelContextWindow: number;
  responseReserve: number;
  systemPromptReserve: number;
  userMessageReserve: number;
}

export interface ContextVisualizationData {
  segments: { name: string; tokens: number; percentage: number; color: string }[];
  totalUsed: number;
  totalBudget: number;
  utilizationPercent: number;
  warnings: string[];
}

export const SOURCE_PRIORITIES: Record<string, { priority: number; min: number; max: number }> = {
  USER_MESSAGE: { priority: 1, min: 100, max: 100000 },
  SELECTION: { priority: 2, min: 0, max: 2000 },
  ACTIVE_FILE: { priority: 3, min: 500, max: 8000 },
  PROJECT_RULES: { priority: 4, min: 0, max: 1000 },
  MEMORIES: { priority: 5, min: 0, max: 1000 },
  MENTIONED_FILES: { priority: 6, min: 0, max: 4000 },
  MENTIONED_SYMBOLS: { priority: 7, min: 0, max: 2000 },
  DEEP_CONTEXT: { priority: 8, min: 0, max: 3000 },
  DIAGNOSTICS: { priority: 9, min: 0, max: 500 },
  GIT_CONTEXT: { priority: 10, min: 0, max: 1000 },
  RELATED_FILES: { priority: 11, min: 0, max: 2000 },
  DOC_SEARCH: { priority: 12, min: 0, max: 2000 },
  CODEBASE_SEARCH: { priority: 13, min: 0, max: 4000 },
  WEB_SEARCH: { priority: 14, min: 0, max: 3000 },
  LINK_FETCH: { priority: 15, min: 0, max: 3000 },
};

export const SEGMENT_COLORS: Record<string, string> = {
  USER_MESSAGE: '#3b82f6',
  ACTIVE_FILE: '#22c55e',
  PROJECT_RULES: '#a855f7',
  MEMORIES: '#ec4899',
  DIAGNOSTICS: '#ef4444',
  GIT_CONTEXT: '#f97316',
  CODEBASE_SEARCH: '#06b6d4',
  RELATED_FILES: '#84cc16',
  MENTIONED_FILES: '#8b5cf6',
  DOC_SEARCH: '#14b8a6',
  LINK_FETCH: '#f59e0b',
  DEFAULT: '#6b7280',
};
