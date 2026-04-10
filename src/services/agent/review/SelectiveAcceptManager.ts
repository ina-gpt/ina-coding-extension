import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import {
  ReviewSession,
  ReviewableChange,
  ReviewHunk,
  ReviewDecision,
  ReviewFilter,
  ChangeStatus,
  ApplyResult,
} from './ReviewTypes';
import { RollbackManager } from '../execution/RollbackManager';
import { Logger } from '../../../utils/Logger';

/**
 * SelectiveAcceptManager handles per-file and per-hunk accept/reject decisions
 * during the review process. It allows users to selectively accept or reject
 * individual changes or hunks, and then apply the final decision to the workspace.
 */
export class SelectiveAcceptManager extends EventEmitter {
  private static instance: SelectiveAcceptManager;
  private reviewSession: ReviewSession | null = null;

  private constructor() {
    super();
  }

  static getInstance(): SelectiveAcceptManager {
    if (!SelectiveAcceptManager.instance) {
      SelectiveAcceptManager.instance = new SelectiveAcceptManager();
    }
    return SelectiveAcceptManager.instance;
  }

  /**
   * Start a new review session.
   */
  startReview(session: ReviewSession): void {
    this.reviewSession = session;
    Logger.info('SelectiveAcceptManager: Review session started', { sessionId: session.id });
  }

  /**
   * Accept all changes in the current review session.
   */
  acceptAll(): ReviewDecision {
    if (!this.reviewSession) {
      throw new Error('No active review');
    }

    for (const change of this.reviewSession.changes) {
      change.accepted = true;
      change.status = ChangeStatus.ACCEPTED;
      for (const hunk of change.hunks) {
        hunk.accepted = true;
      }
    }

    Logger.info('SelectiveAcceptManager: All changes accepted');
    return this.getDecision();
  }

  /**
   * Reject all changes in the current review session.
   */
  rejectAll(): ReviewDecision {
    if (!this.reviewSession) {
      throw new Error('No active review');
    }

    for (const change of this.reviewSession.changes) {
      change.accepted = false;
      change.status = ChangeStatus.REJECTED;
      for (const hunk of change.hunks) {
        hunk.accepted = false;
      }
    }

    Logger.info('SelectiveAcceptManager: All changes rejected');
    return this.getDecision();
  }

  /**
   * Accept a specific change by ID.
   */
  acceptChange(changeId: string): void {
    const change = this.findChange(changeId);
    if (change) {
      change.accepted = true;
      change.status = ChangeStatus.ACCEPTED;
      for (const hunk of change.hunks) {
        hunk.accepted = true;
      }
      this.emit('change-decided', { changeId, status: 'accepted' });
      Logger.info('SelectiveAcceptManager: Change accepted', { changeId });
    }
  }

  /**
   * Reject a specific change by ID.
   */
  rejectChange(changeId: string): void {
    const change = this.findChange(changeId);
    if (change) {
      change.accepted = false;
      change.status = ChangeStatus.REJECTED;
      for (const hunk of change.hunks) {
        hunk.accepted = false;
      }
      this.emit('change-decided', { changeId, status: 'rejected' });
      Logger.info('SelectiveAcceptManager: Change rejected', { changeId });
    }
  }

  /**
   * Accept a specific hunk by ID and update the parent change status.
   */
  acceptHunk(hunkId: string): void {
    const result = this.findHunk(hunkId);
    if (result) {
      result.hunk.accepted = true;
      this.updateChangeFromHunks(result.change);
      this.emit('hunk-decided', { hunkId, status: 'accepted' });
      Logger.info('SelectiveAcceptManager: Hunk accepted', { hunkId });
    }
  }

  /**
   * Reject a specific hunk by ID and update the parent change status.
   */
  rejectHunk(hunkId: string): void {
    const result = this.findHunk(hunkId);
    if (result) {
      result.hunk.accepted = false;
      this.updateChangeFromHunks(result.change);
      this.emit('hunk-decided', { hunkId, status: 'rejected' });
      Logger.info('SelectiveAcceptManager: Hunk rejected', { hunkId });
    }
  }

  /**
   * Toggle a change through the cycle: null -> true -> false -> null.
   */
  toggleChange(changeId: string): void {
    const change = this.findChange(changeId);
    if (!change) {
      return;
    }

    if (change.accepted === null) {
      this.acceptChange(changeId);
    } else if (change.accepted === true) {
      this.rejectChange(changeId);
    } else {
      change.accepted = null;
      change.status = ChangeStatus.PENDING;
      for (const hunk of change.hunks) {
        hunk.accepted = null;
      }
      this.emit('change-decided', { changeId, status: 'pending' });
    }
  }

  /**
   * Toggle a hunk through the cycle: null -> true -> false -> null.
   */
  toggleHunk(hunkId: string): void {
    const result = this.findHunk(hunkId);
    if (!result) {
      return;
    }

    if (result.hunk.accepted === null) {
      result.hunk.accepted = true;
    } else if (result.hunk.accepted === true) {
      result.hunk.accepted = false;
    } else {
      result.hunk.accepted = null;
    }

    this.updateChangeFromHunks(result.change);
    this.emit('hunk-decided', { hunkId, status: result.hunk.accepted });
  }

  /**
   * Accept all changes matching the given filter.
   */
  acceptByFilter(filter: ReviewFilter): void {
    if (!this.reviewSession) {
      return;
    }

    const matching = this.filterChanges(filter);
    for (const change of matching) {
      this.acceptChange(change.id);
    }

    Logger.info('SelectiveAcceptManager: Accepted by filter', { matchCount: matching.length });
  }

  /**
   * Reject all changes matching the given filter.
   */
  rejectByFilter(filter: ReviewFilter): void {
    if (!this.reviewSession) {
      return;
    }

    const matching = this.filterChanges(filter);
    for (const change of matching) {
      this.rejectChange(change.id);
    }

    Logger.info('SelectiveAcceptManager: Rejected by filter', { matchCount: matching.length });
  }

  /**
   * Get the current review decision based on accept/reject state of all changes.
   */
  getDecision(): ReviewDecision {
    if (!this.reviewSession) {
      throw new Error('No active review');
    }

    const accepted = this.reviewSession.changes
      .filter((c) => c.accepted === true)
      .map((c) => c.id);
    const rejected = this.reviewSession.changes
      .filter((c) => c.accepted === false)
      .map((c) => c.id);
    const acceptedHunks = this.reviewSession.changes.flatMap((c) =>
      c.hunks.filter((h) => h.accepted === true).map((h) => h.id)
    );
    const rejectedHunks = this.reviewSession.changes.flatMap((c) =>
      c.hunks.filter((h) => h.accepted === false).map((h) => h.id)
    );

    const type =
      rejected.length === 0 && accepted.length === this.reviewSession.changes.length
        ? 'accept-all'
        : accepted.length === 0 && rejected.length === this.reviewSession.changes.length
          ? 'reject-all'
          : 'partial';

    return {
      type,
      acceptedChanges: accepted,
      rejectedChanges: rejected,
      acceptedHunks,
      rejectedHunks,
      timestamp: Date.now(),
      notes: null,
    };
  }

  /**
   * Build final file content for a change based on accepted/rejected hunks.
   * Returns null if the change is fully rejected.
   */
  buildFinalContent(change: ReviewableChange): string | null {
    // Fully rejected
    if (change.accepted === false) {
      return null;
    }

    // Fully accepted
    if (change.accepted === true) {
      return change.newContent;
    }

    // Partial: start from original, apply only accepted hunks (bottom-to-top)
    if (!change.originalContent) {
      return change.newContent;
    }

    let lines = change.originalContent.split('\n');
    const acceptedHunks = change.hunks
      .filter((h) => h.accepted === true)
      .sort((a, b) => b.startLineOld - a.startLineOld);

    for (const hunk of acceptedHunks) {
      const hunkLines = hunk.content.split('\n');
      const added = hunkLines.filter((l) => l.startsWith('+')).map((l) => l.slice(1));
      const removeCount = hunkLines.filter((l) => l.startsWith('-')).length;
      lines.splice(hunk.startLineOld - 1, removeCount, ...added);
    }

    return lines.join('\n');
  }

  /**
   * Apply the review decision: revert rejected changes, keep accepted ones,
   * and rebuild partial changes from accepted hunks.
   */
  async applyDecision(decision: ReviewDecision): Promise<ApplyResult> {
    if (!this.reviewSession) {
      throw new Error('No active review');
    }

    const applied: string[] = [];
    const reverted: string[] = [];
    const errors: string[] = [];
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    for (const change of this.reviewSession.changes) {
      try {
        if (decision.rejectedChanges.includes(change.id)) {
          await this.revertChange(change, workspaceRoot);
          reverted.push(change.filePath);
        } else if (decision.acceptedChanges.includes(change.id)) {
          // Fully accepted: keep as-is
          applied.push(change.filePath);
        } else {
          // Partial: rebuild content from accepted hunks
          const finalContent = this.buildFinalContent(change);
          if (finalContent !== null && finalContent !== change.newContent) {
            const fullPath = path.resolve(workspaceRoot, change.filePath);
            await fs.writeFile(fullPath, finalContent, 'utf-8');
            applied.push(change.filePath);
          } else if (finalContent !== null) {
            applied.push(change.filePath);
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'unknown';
        errors.push(`Failed to process ${change.filePath}: ${message}`);
        Logger.error('SelectiveAcceptManager: Failed to process change', { filePath: change.filePath, error: message });
      }
    }

    this.emit('apply-complete', { applied, reverted, errors });
    Logger.info('SelectiveAcceptManager: Decision applied', { applied: applied.length, reverted: reverted.length, errors: errors.length });
    return { applied, reverted, errors };
  }

  /**
   * Get the current progress of the review.
   */
  getReviewProgress(): { total: number; decided: number; accepted: number; rejected: number; pending: number } {
    if (!this.reviewSession) {
      return { total: 0, decided: 0, accepted: 0, rejected: 0, pending: 0 };
    }

    const total = this.reviewSession.changes.length;
    const accepted = this.reviewSession.changes.filter((c) => c.accepted === true).length;
    const rejected = this.reviewSession.changes.filter((c) => c.accepted === false).length;

    return {
      total,
      decided: accepted + rejected,
      accepted,
      rejected,
      pending: total - accepted - rejected,
    };
  }

  private findChange(changeId: string): ReviewableChange | undefined {
    return this.reviewSession?.changes.find((c) => c.id === changeId);
  }

  private findHunk(hunkId: string): { hunk: ReviewHunk; change: ReviewableChange } | undefined {
    if (!this.reviewSession) {
      return undefined;
    }

    for (const change of this.reviewSession.changes) {
      const hunk = change.hunks.find((h) => h.id === hunkId);
      if (hunk) {
        return { hunk, change };
      }
    }

    return undefined;
  }

  private updateChangeFromHunks(change: ReviewableChange): void {
    const allAccepted = change.hunks.every((h) => h.accepted === true);
    const allRejected = change.hunks.every((h) => h.accepted === false);
    const mixed = !allAccepted && !allRejected && change.hunks.some((h) => h.accepted !== null);

    if (allAccepted) {
      change.accepted = true;
      change.status = ChangeStatus.ACCEPTED;
    } else if (allRejected) {
      change.accepted = false;
      change.status = ChangeStatus.REJECTED;
    } else if (mixed) {
      change.accepted = null;
      change.status = ChangeStatus.PARTIALLY_ACCEPTED;
    }
  }

  private filterChanges(filter: ReviewFilter): ReviewableChange[] {
    if (!this.reviewSession) {
      return [];
    }

    return this.reviewSession.changes.filter((change) => {
      if (filter.status !== 'all' && change.status !== filter.status) {
        return false;
      }
      if (filter.operation !== 'all' && change.operation !== filter.operation) {
        return false;
      }
      if (filter.directory && !change.filePath.startsWith(filter.directory)) {
        return false;
      }
      if (filter.searchQuery && !change.filePath.includes(filter.searchQuery)) {
        return false;
      }
      return true;
    });
  }

  private async revertChange(change: ReviewableChange, workspaceRoot: string): Promise<void> {
    const fullPath = path.resolve(workspaceRoot, change.filePath);

    if (change.operation === ('create' as any)) {
      try {
        await fs.unlink(fullPath);
      } catch {
        // File may not exist
      }
    } else if (change.originalContent !== null) {
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, change.originalContent, 'utf-8');
    }
  }

  dispose(): void {
    this.reviewSession = null;
    this.removeAllListeners();
  }
}
