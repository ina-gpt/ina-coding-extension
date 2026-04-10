/**
 * WorktreeTypes.ts
 * Phase 18.3 — Git Worktree Isolation type definitions
 *
 * A worktree is an isolated checkout of the same repository on a new branch.
 * We use worktrees to sandbox AI-generated changes so they don't pollute the
 * user's working tree until they're reviewed and explicitly merged.
 */

// ============================================================

export type WorktreeStatus =
  | 'creating'
  | 'active'
  | 'running'
  | 'completed'
  | 'merging'
  | 'merged'
  | 'conflicted'
  | 'abandoned'
  | 'error';

export interface WorktreeInstance {
  id: string;
  /** Absolute path to the worktree directory */
  path: string;
  /** Branch checked out in the worktree */
  branch: string;
  /** Parent branch the worktree was created from */
  parentBranch: string;
  /** Commit sha the worktree was branched from */
  baseCommit: string;
  status: WorktreeStatus;
  /** Optional link to the agent session that owns this worktree */
  agentSessionId: string | null;
  /** Optional human label (e.g. "Best-of-N candidate #1") */
  label: string | null;
  /** Number of conflicted files if status === 'conflicted' */
  conflictCount: number;
  /** Last error message (if status === 'error') */
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WorktreeConfig {
  /** Directory under the repo root where worktrees live */
  basePath: string;
  /** Max concurrent active worktrees */
  maxWorktrees: number;
  /** Auto-cleanup abandoned/merged worktrees after this age */
  autoCleanup: boolean;
  cleanupAfterHours: number;
  /** Whether to auto-stash uncommitted changes before creating a worktree */
  autoStashDirty: boolean;
  /** Default branch prefix for generated worktree branches */
  branchPrefix: string;
}

export const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  basePath: '.ina-worktrees',
  maxWorktrees: 5,
  autoCleanup: true,
  cleanupAfterHours: 24,
  autoStashDirty: true,
  branchPrefix: 'ina/',
};

// ============================================================
// Events
// ============================================================

export type WorktreeEventType =
  | 'created'
  | 'switched'
  | 'running'
  | 'completed'
  | 'merging'
  | 'merged'
  | 'conflicted'
  | 'abandoned'
  | 'deleted'
  | 'error';

export interface WorktreeEvent {
  type: WorktreeEventType;
  worktreeId: string;
  timestamp: number;
  message?: string;
  data?: any;
}

// ============================================================
// Merge strategy
// ============================================================

export type MergeStrategy = 'merge' | 'rebase' | 'squash';

export interface MergeResult {
  success: boolean;
  strategy: MergeStrategy;
  worktreeId: string;
  /** Files with unresolved conflicts (empty on success) */
  conflictedFiles: string[];
  /** Human-readable summary of what happened */
  message: string;
}

// ============================================================
// Helpers
// ============================================================

/** Compute a short, filesystem-safe id for a new worktree. */
export function generateWorktreeId(prefix: string = 'wt'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}
