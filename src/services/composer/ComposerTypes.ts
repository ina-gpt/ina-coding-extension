/**
 * ComposerTypes.ts
 * Phase 16.1 — Composer UI Enhancement
 *
 * Type definitions for the full-screen Composer experience: split-view layout,
 * checkpoint system, iterative refinement, real-time file change preview.
 */

import type { PlanResponse } from '../agent/planning/PlanningTypes';
import type { ExecutionProgress } from '../agent/execution/ExecutionTypes';

// ============ Status & Layout ============

export type ComposerStatus =
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'refining'
  | 'completed'
  | 'failed'
  | 'paused';

export enum ComposerLayout {
  SIDEBAR = 'sidebar',
  PANEL = 'panel',
  FULLSCREEN = 'fullscreen',
  SPLIT = 'split',
}

export type ComposerDiffViewMode = 'inline' | 'side-by-side';

// ============ Diff Primitives ============

export interface DiffHunk {
  startLineOriginal: number;
  endLineOriginal: number;
  startLineModified: number;
  endLineModified: number;
  originalContent: string;
  modifiedContent: string;
}

export interface DiffLine {
  lineNumber: number;
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  hunkIndex: number | null;
}

export interface ComposerDiff {
  hunks: DiffHunk[];
  linesAdded: number;
  linesRemoved: number;
}

// ============ File Changes ============

export type ComposerFileChangeStatus =
  | 'created'
  | 'modified'
  | 'deleted'
  | 'renamed';

export type ComposerRiskLevel = 'low' | 'medium' | 'high';

export interface ComposerFileChange {
  filePath: string;
  status: ComposerFileChangeStatus;
  diff: ComposerDiff;
  originalContent: string | null;
  newContent: string;
  /** null = pending review, true = accepted, false = rejected */
  accepted: boolean | null;
  /** Per-hunk acceptance state (parallel array to diff.hunks). */
  hunkAccepted?: boolean[];
  /** Which checkpoint created this change */
  checkpointId: string;
  /** Renamed-from path (if status is 'renamed') */
  renamedFrom?: string;
  /** Computed risk level for surfacing in UI */
  risk?: ComposerRiskLevel;
}

// ============ Checkpoints ============

export type ComposerCheckpointType =
  | 'initial'
  | 'plan'
  | 'execution'
  | 'refinement'
  | 'manual';

export interface ComposerCheckpoint {
  id: string;
  index: number;
  description: string;
  timestamp: number;
  /**
   * Snapshot of file contents at this checkpoint.
   * Map<filePath, content>. Files not present in the map were not yet modified.
   */
  fileSnapshots: Map<string, string>;
  /** Instruction (or refinement) that produced this checkpoint */
  instruction: string;
  type: ComposerCheckpointType;
}

// ============ Refinements ============

export type ComposerRefinementStatus =
  | 'pending'
  | 'planning'
  | 'executing'
  | 'completed'
  | 'failed';

export interface ComposerRefinement {
  id: string;
  instruction: string;
  timestamp: number;
  /** Incremental plan changes (subset of full PlanResponse). */
  planDelta: Partial<PlanResponse> | null;
  status: ComposerRefinementStatus;
}

// ============ Conversation Messages ============

export type ComposerMessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'plan'
  | 'execution'
  | 'checkpoint';

export interface ComposerMessage {
  id: string;
  role: ComposerMessageRole;
  content: string;
  timestamp: number;
  metadata: Record<string, any>;
}

// ============ Stats ============

export interface ComposerStats {
  totalFiles: number;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  linesAdded: number;
  linesRemoved: number;
  planSteps: number;
  stepsCompleted: number;
  stepsFailed: number;
  executionTimeMs: number;
  refinementCount: number;
  checkpointCount: number;
}

// ============ Session ============

export interface ComposerSession {
  id: string;
  status: ComposerStatus;
  instruction: string;
  refinements: ComposerRefinement[];
  /** Latest planning result (PlanResponse from PlanningTypes). */
  plan: PlanResponse | null;
  /** Latest execution snapshot (ExecutionProgress). */
  execution: ExecutionProgress | null;
  fileChanges: ComposerFileChange[];
  checkpoints: ComposerCheckpoint[];
  currentCheckpointIndex: number;
  conversation: ComposerMessage[];
  stats: ComposerStats;
  createdAt: number;
  updatedAt: number;
}

// ============ Configuration ============

export interface ComposerConfig {
  defaultLayout: ComposerLayout;
  autoCheckpoint: boolean;
  showFileTree: boolean;
  showTimeline: boolean;
  diffViewMode: ComposerDiffViewMode;
  maxRefinements: number;
  /** When true, low-risk changes are auto-accepted; otherwise all changes require manual accept. */
  autoAcceptLowRisk: boolean;
}

export const DEFAULT_COMPOSER_CONFIG: ComposerConfig = {
  defaultLayout: ComposerLayout.FULLSCREEN,
  autoCheckpoint: true,
  showFileTree: true,
  showTimeline: true,
  diffViewMode: 'side-by-side',
  maxRefinements: 10,
  autoAcceptLowRisk: false,
};

// ============ Event Payloads ============

export interface ComposerProgressUpdate {
  sessionId: string;
  stepIndex: number;
  totalSteps: number;
  currentStepDescription: string;
  status: ComposerStatus;
  percentComplete: number;
}

export interface ComposerStatusChangedEvent {
  sessionId: string;
  status: ComposerStatus;
  previousStatus: ComposerStatus;
}

export interface ComposerFileChangedEvent {
  sessionId: string;
  fileChange: ComposerFileChange;
  changeType: 'added' | 'updated' | 'removed' | 'accepted' | 'rejected';
}

export interface ComposerCheckpointCreatedEvent {
  sessionId: string;
  checkpoint: ComposerCheckpoint;
}

// ============ Helpers ============

export function createEmptyStats(): ComposerStats {
  return {
    totalFiles: 0,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    linesAdded: 0,
    linesRemoved: 0,
    planSteps: 0,
    stepsCompleted: 0,
    stepsFailed: 0,
    executionTimeMs: 0,
    refinementCount: 0,
    checkpointCount: 0,
  };
}

/**
 * Serializable form of a ComposerSession (Map → object) for postMessage transport.
 */
export interface ComposerSessionView {
  id: string;
  status: ComposerStatus;
  instruction: string;
  refinements: ComposerRefinement[];
  plan: PlanResponse | null;
  execution: ExecutionProgress | null;
  fileChanges: ComposerFileChange[];
  checkpoints: Array<Omit<ComposerCheckpoint, 'fileSnapshots'> & { fileSnapshots: Record<string, string> }>;
  currentCheckpointIndex: number;
  conversation: ComposerMessage[];
  stats: ComposerStats;
  createdAt: number;
  updatedAt: number;
}

export function toSessionView(session: ComposerSession): ComposerSessionView {
  return {
    ...session,
    checkpoints: session.checkpoints.map((cp) => ({
      ...cp,
      fileSnapshots: Object.fromEntries(cp.fileSnapshots.entries()),
    })),
  };
}
