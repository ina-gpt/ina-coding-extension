import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import {
  ReviewSession,
  ReviewableChange,
  ReviewHunk,
  UndoScope,
  UndoResult,
  ChangeStatus,
} from './ReviewTypes';
import { RollbackManager } from '../execution/RollbackManager';
import { Logger } from '../../../utils/Logger';

interface UndoEntry {
  timestamp: number;
  scope: UndoScope;
  filesAffected: string[];
  previousState: Map<string, string>;
}

/**
 * UndoManager handles post-review undo operations, allowing users to revert
 * applied changes at the file, hunk, or session level.
 */
export class UndoManager extends EventEmitter {
  private static instance: UndoManager;
  private undoHistory: UndoEntry[] = [];

  private constructor() {
    super();
  }

  static getInstance(): UndoManager {
    if (!UndoManager.instance) {
      UndoManager.instance = new UndoManager();
    }
    return UndoManager.instance;
  }

  /**
   * Undo all changes in the review session, restoring every file to its original state.
   */
  async undoAll(reviewSession: ReviewSession): Promise<UndoResult> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const filesReverted: string[] = [];
    const errors: string[] = [];
    const previousState = new Map<string, string>();

    // Process changes in reverse order
    for (const change of [...reviewSession.changes].reverse()) {
      try {
        const fullPath = path.resolve(workspaceRoot, change.filePath);

        // Save current state for potential redo
        try {
          previousState.set(change.filePath, await fs.readFile(fullPath, 'utf-8'));
        } catch {
          // File may not exist
        }

        if (change.operation === ('create' as any)) {
          try {
            await fs.unlink(fullPath);
          } catch {
            // File may not exist
          }
        } else if (change.originalContent !== null) {
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, change.originalContent, 'utf-8');
        }

        filesReverted.push(change.filePath);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'unknown';
        errors.push(`Failed to undo ${change.filePath}: ${message}`);
        Logger.error('UndoManager: Failed to undo change', { filePath: change.filePath, error: message });
      }
    }

    this.undoHistory.push({
      timestamp: Date.now(),
      scope: UndoScope.ALL,
      filesAffected: filesReverted,
      previousState,
    });

    this.emit('undo', { scope: UndoScope.ALL, filesReverted });
    Logger.info('UndoManager: Undone all changes', { filesReverted: filesReverted.length, errors: errors.length });

    return {
      success: errors.length === 0,
      filesReverted,
      filesPartiallyReverted: [],
      errors,
      newState: reviewSession.changes,
    };
  }

  /**
   * Undo a single file change, restoring it to its original state.
   */
  async undoFile(changeId: string, reviewSession: ReviewSession): Promise<UndoResult> {
    const change = reviewSession.changes.find((c) => c.id === changeId);
    if (!change) {
      return {
        success: false,
        filesReverted: [],
        filesPartiallyReverted: [],
        errors: ['Change not found'],
        newState: reviewSession.changes,
      };
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = path.resolve(workspaceRoot, change.filePath);
    const previousState = new Map<string, string>();

    try {
      // Save current state for potential redo
      try {
        previousState.set(change.filePath, await fs.readFile(fullPath, 'utf-8'));
      } catch {
        // File may not exist
      }

      if (change.operation === ('create' as any)) {
        try {
          await fs.unlink(fullPath);
        } catch {
          // File may not exist
        }
      } else if (change.originalContent !== null) {
        await fs.writeFile(fullPath, change.originalContent, 'utf-8');
      }

      change.status = ChangeStatus.REVERTED;

      this.undoHistory.push({
        timestamp: Date.now(),
        scope: UndoScope.SINGLE_FILE,
        filesAffected: [change.filePath],
        previousState,
      });

      this.emit('undo', { scope: UndoScope.SINGLE_FILE, file: change.filePath });
      Logger.info('UndoManager: Undone file change', { filePath: change.filePath });

      return {
        success: true,
        filesReverted: [change.filePath],
        filesPartiallyReverted: [],
        errors: [],
        newState: reviewSession.changes,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown';
      Logger.error('UndoManager: Failed to undo file', { filePath: change.filePath, error: message });
      return {
        success: false,
        filesReverted: [],
        filesPartiallyReverted: [],
        errors: [message],
        newState: reviewSession.changes,
      };
    }
  }

  /**
   * Undo a single hunk within a file, reversing just that hunk's changes.
   */
  async undoHunk(hunkId: string, changeId: string, reviewSession: ReviewSession): Promise<UndoResult> {
    const change = reviewSession.changes.find((c) => c.id === changeId);
    if (!change) {
      return {
        success: false,
        filesReverted: [],
        filesPartiallyReverted: [],
        errors: ['Change not found'],
        newState: reviewSession.changes,
      };
    }

    const hunk = change.hunks.find((h) => h.id === hunkId);
    if (!hunk) {
      return {
        success: false,
        filesReverted: [],
        filesPartiallyReverted: [],
        errors: ['Hunk not found'],
        newState: reviewSession.changes,
      };
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = path.resolve(workspaceRoot, change.filePath);

    try {
      const currentContent = await fs.readFile(fullPath, 'utf-8');
      const reversedContent = this.reverseHunk(currentContent, hunk);
      await fs.writeFile(fullPath, reversedContent, 'utf-8');

      hunk.accepted = false;
      change.status = ChangeStatus.PARTIALLY_ACCEPTED;

      this.emit('undo', { scope: UndoScope.SINGLE_HUNK, file: change.filePath, hunkId });
      Logger.info('UndoManager: Undone hunk', { hunkId, filePath: change.filePath });

      return {
        success: true,
        filesReverted: [],
        filesPartiallyReverted: [change.filePath],
        errors: [],
        newState: reviewSession.changes,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown';
      Logger.error('UndoManager: Failed to undo hunk', { hunkId, error: message });
      return {
        success: false,
        filesReverted: [],
        filesPartiallyReverted: [],
        errors: [message],
        newState: reviewSession.changes,
      };
    }
  }

  /**
   * Undo all changes since a specific checkpoint using the RollbackManager.
   */
  async undoSinceCheckpoint(checkpointId: string, rollbackManager: RollbackManager): Promise<UndoResult> {
    Logger.info('UndoManager: Rolling back to checkpoint', { checkpointId });
    const result = await rollbackManager.rollbackToCheckpoint(checkpointId);
    return {
      success: result.success,
      filesReverted: [],
      filesPartiallyReverted: [],
      errors: result.errors,
      newState: [],
    };
  }

  /**
   * Check if there are any undo entries available.
   */
  canUndo(): boolean {
    return this.undoHistory.length > 0;
  }

  /**
   * Redo the last undone operation by restoring the previous state.
   */
  async redo(): Promise<UndoResult> {
    if (this.undoHistory.length === 0) {
      return {
        success: false,
        filesReverted: [],
        filesPartiallyReverted: [],
        errors: ['Nothing to redo'],
        newState: [],
      };
    }

    const last = this.undoHistory.pop()!;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const errors: string[] = [];

    for (const [filePath, content] of last.previousState) {
      try {
        await fs.writeFile(path.resolve(workspaceRoot, filePath), content, 'utf-8');
      } catch (e) {
        errors.push(filePath);
      }
    }

    this.emit('redo', { filesAffected: last.filesAffected });
    Logger.info('UndoManager: Redo completed', { filesAffected: last.filesAffected.length });

    return {
      success: errors.length === 0,
      filesReverted: last.filesAffected,
      filesPartiallyReverted: [],
      errors,
      newState: [],
    };
  }

  /**
   * Get the full undo history.
   */
  getUndoHistory(): UndoEntry[] {
    return [...this.undoHistory];
  }

  /**
   * Reverse a single hunk in the file content by removing added lines
   * and restoring removed lines at the hunk position.
   */
  private reverseHunk(content: string, hunk: ReviewHunk): string {
    const lines = content.split('\n');
    const hunkLines = hunk.content.split('\n');
    const toRemove = hunkLines.filter((l) => l.startsWith('+')).map((l) => l.slice(1));
    const toRestore = hunkLines.filter((l) => l.startsWith('-')).map((l) => l.slice(1));

    // Find and replace added lines with removed lines at hunk position
    const offset = hunk.startLineNew - 1;
    lines.splice(offset, toRemove.length, ...toRestore);

    return lines.join('\n');
  }

  dispose(): void {
    this.undoHistory = [];
    this.removeAllListeners();
  }
}
