/**
 * Phase 17.1 — Shadow Workspace Types
 *
 * Type definitions for the Shadow Workspace feature.
 * Shadow workspaces allow AI-generated file changes to be staged
 * in a virtual filesystem for review before applying to real files.
 */
import * as vscode from 'vscode';

/**
 * Status of a shadow file in the review pipeline.
 */
export enum ShadowFileStatus {
  /** File has been created/modified but not yet reviewed */
  PENDING = 'pending',
  /** File changes have been accepted and written to disk */
  ACCEPTED = 'accepted',
  /** File changes have been rejected and discarded */
  REJECTED = 'rejected',
  /** File has been manually edited in the shadow workspace */
  EDITED = 'edited',
  /** File has a conflict with the real filesystem version */
  CONFLICT = 'conflict',
}

/**
 * Represents a single file in the shadow workspace.
 */
export interface ShadowFile {
  /** URI of the real file on disk */
  realUri: vscode.Uri;
  /** URI in the ina-shadow virtual filesystem */
  shadowUri: vscode.Uri;
  /** Current content in the shadow workspace */
  content: string;
  /** Original content from the real filesystem at time of shadow creation */
  originalContent: string;
  /** Review status of this file */
  status: ShadowFileStatus;
  /** Timestamp when the shadow file was created */
  createdAt: number;
  /** Timestamp of last modification */
  modifiedAt: number;
  /** The operation that created this shadow file (e.g. 'agent', 'apply', 'inlineEdit') */
  sourceOperation: string;
  /** Additional metadata attached by the source operation */
  metadata: Record<string, any>;
}

/**
 * A shadow session groups related shadow files together.
 * Typically one session per agent execution or apply operation.
 */
export interface ShadowSession {
  /** Unique identifier for this session */
  id: string;
  /** Human-readable name for display in the tree view */
  name: string;
  /** Map of file paths to shadow files */
  files: Map<string, ShadowFile>;
  /** Session lifecycle status */
  status: 'active' | 'committed' | 'discarded' | 'expired';
  /** Timestamp when the session was created */
  createdAt: number;
  /** Timestamp when the session will auto-expire */
  expiresAt: number;
  /** Ordered list of checkpoints for undo/redo */
  checkpoints: ShadowCheckpoint[];
  /** The operation that created this session */
  sourceOperation: string;
}

/**
 * A checkpoint captures the state of all files in a session
 * at a specific point in time, enabling rollback.
 */
export interface ShadowCheckpoint {
  /** Unique identifier for this checkpoint */
  id: string;
  /** Timestamp when the checkpoint was created */
  timestamp: number;
  /** Human-readable description of the checkpoint */
  description: string;
  /** Snapshot of all file contents at checkpoint time (filePath -> content) */
  snapshot: Map<string, string>;
}

/**
 * Represents the diff between original and shadow content for a single file.
 */
export interface ShadowDiff {
  /** Path of the file being diffed */
  filePath: string;
  /** Individual diff hunks */
  hunks: DiffHunk[];
  /** Total lines added */
  linesAdded: number;
  /** Total lines removed */
  linesRemoved: number;
  /** Total lines changed (modified in place) */
  linesChanged: number;
}

/**
 * A contiguous region of changes between original and modified content.
 */
export interface DiffHunk {
  /** Start line in the original content (1-based) */
  startLineOriginal: number;
  /** End line in the original content (1-based, inclusive) */
  endLineOriginal: number;
  /** Start line in the modified content (1-based) */
  startLineModified: number;
  /** End line in the modified content (1-based, inclusive) */
  endLineModified: number;
  /** The original content of this hunk */
  originalContent: string;
  /** The modified content of this hunk */
  modifiedContent: string;
}

/**
 * Event types emitted by the shadow workspace system.
 */
export type ShadowWorkspaceEventType =
  | 'fileAdded'
  | 'fileModified'
  | 'fileAccepted'
  | 'fileRejected'
  | 'sessionCreated'
  | 'sessionCommitted'
  | 'sessionDiscarded'
  | 'checkpointCreated';

/**
 * Event payload emitted when shadow workspace state changes.
 */
export interface ShadowWorkspaceEvent {
  /** Type of event */
  type: ShadowWorkspaceEventType;
  /** ID of the session this event belongs to */
  sessionId: string;
  /** File path if the event is file-related, null for session-level events */
  filePath: string | null;
  /** Additional event data */
  data: any;
}

/**
 * Configuration options for the shadow workspace feature.
 */
export interface ShadowConfig {
  /** Whether shadow workspace is enabled */
  enabled: boolean;
  /** Minutes before an inactive session auto-expires */
  autoExpireMinutes: number;
  /** Whether to show shadow files in the explorer tree view */
  showInExplorer: boolean;
  /** Whether to require confirmation before accepting changes */
  requireConfirmation: boolean;
  /** Whether to automatically create checkpoints on file writes */
  autoCreateCheckpoints: boolean;
  /** Maximum number of concurrent sessions */
  maxSessions: number;
}

/**
 * Default configuration values for the shadow workspace.
 */
export const DEFAULT_SHADOW_CONFIG: ShadowConfig = {
  enabled: true,
  autoExpireMinutes: 30,
  showInExplorer: true,
  requireConfirmation: true,
  autoCreateCheckpoints: true,
  maxSessions: 5,
};
