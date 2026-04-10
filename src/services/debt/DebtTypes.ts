/**
 * DebtTypes.ts — Phase 20 Step 20.4
 * Technical Debt Tracker type definitions
 */

export enum DebtCategory {
  TODO_FIXME = 'todo_fixme',
  COMPLEXITY = 'complexity',
  DUPLICATION = 'duplication',
  DEPRECATED_API = 'deprecated_api',
  MISSING_TESTS = 'missing_tests',
  MISSING_DOCS = 'missing_docs',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  DEAD_CODE = 'dead_code',
  INCONSISTENCY = 'inconsistency',
  WORKAROUND = 'workaround',
}

export type DebtSeverity = 'critical' | 'high' | 'medium' | 'low';
export type DebtStatus = 'open' | 'in-progress' | 'resolved' | 'wontfix';

export interface DebtItem {
  id: string;
  type: DebtCategory;
  title: string;
  description: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: DebtSeverity;
  estimatedEffort: number;
  detectedAt: string;
  status: DebtStatus;
  assignee?: string;
  tags: string[];
  relatedItems: string[];
}

export interface DebtBudget {
  totalItems: number;
  byCategory: Record<string, number>;
  totalEstimatedHours: number;
  weeklyBurndown: number;
  weeklyAccrual: number;
  debtRatio: number;
}

export interface DebtTrend {
  date: string;
  totalItems: number;
  resolvedSinceLast: number;
  addedSinceLast: number;
  netChange: number;
}

export interface DebtPolicy {
  maxDebtRatio: number;
  blockPRIfCritical: boolean;
  requireDebtReviewWeekly: boolean;
  autoDetectNewDebt: boolean;
  categories: DebtCategory[];
}

export const DEFAULT_DEBT_POLICY: DebtPolicy = {
  maxDebtRatio: 0.15,
  blockPRIfCritical: true,
  requireDebtReviewWeekly: true,
  autoDetectNewDebt: true,
  categories: Object.values(DebtCategory),
};

export interface SprintDebtAllocation {
  sprintName: string;
  totalPoints: number;
  debtPoints: number;
  selectedItems: DebtItem[];
  totalEffort: number;
}
