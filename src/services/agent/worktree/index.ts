/**
 * Worktree service barrel — Phase 18.3
 */

export { WorktreeManager } from './WorktreeManager';
export { IsolatedExecutor } from './IsolatedExecutor';
export {
  DEFAULT_WORKTREE_CONFIG,
  generateWorktreeId,
} from './WorktreeTypes';
export type {
  WorktreeInstance,
  WorktreeConfig,
  WorktreeStatus,
  WorktreeEvent,
  WorktreeEventType,
  MergeStrategy,
  MergeResult,
} from './WorktreeTypes';
export type {
  IsolatedTaskInput,
  IsolatedTaskResult,
  IsolatedExecutorOptions,
} from './IsolatedExecutor';
