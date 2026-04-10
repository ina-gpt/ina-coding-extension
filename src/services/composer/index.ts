/**
 * Composer service barrel — Phase 16.1
 */

export { ComposerSessionManager } from './ComposerSessionManager';
export { ComposerDiffEngine } from './ComposerDiffEngine';
export {
  ComposerLayout,
  DEFAULT_COMPOSER_CONFIG,
  createEmptyStats,
  toSessionView,
} from './ComposerTypes';
export type {
  ComposerSession,
  ComposerSessionView,
  ComposerStatus,
  ComposerCheckpoint,
  ComposerCheckpointType,
  ComposerFileChange,
  ComposerFileChangeStatus,
  ComposerMessage,
  ComposerMessageRole,
  ComposerRefinement,
  ComposerRefinementStatus,
  ComposerStats,
  ComposerConfig,
  ComposerDiff,
  ComposerDiffViewMode,
  ComposerRiskLevel,
  DiffHunk,
  DiffLine,
  ComposerProgressUpdate,
  ComposerStatusChangedEvent,
  ComposerFileChangedEvent,
  ComposerCheckpointCreatedEvent,
} from './ComposerTypes';
