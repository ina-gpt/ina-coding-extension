/**
 * Partial Accept Manager
 *
 * Manages line-by-line and hunk-by-hunk acceptance/rejection.
 */

import { DiffResult, DiffHunk, DiffLineType } from './DiffTypes';

// ============ Types ============

type LineState = 'accepted' | 'rejected' | 'pending';
type HunkState = 'accepted' | 'rejected' | 'partial' | 'pending';

interface SessionState {
  accepted: Set<number>;
  rejected: Set<number>;
  diffResult: DiffResult;
}

// ============ Partial Accept Manager ============

export class PartialAcceptManager {
  private pendingChanges: Map<string, SessionState> = new Map();

  // ============ Session ============

  initializeSession(sessionId: string, diffResult: DiffResult): void {
    this.pendingChanges.set(sessionId, {
      accepted: new Set(),
      rejected: new Set(),
      diffResult,
    });
  }

  // ============ Line Actions ============

  acceptLine(sessionId: string, lineNumber: number): void {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return;

    session.accepted.add(lineNumber);
    session.rejected.delete(lineNumber);
  }

  rejectLine(sessionId: string, lineNumber: number): void {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return;

    session.rejected.add(lineNumber);
    session.accepted.delete(lineNumber);
  }

  toggleLine(sessionId: string, lineNumber: number): LineState {
    const state = this.getLineState(sessionId, lineNumber);

    if (state === 'pending') {
      this.acceptLine(sessionId, lineNumber);
      return 'accepted';
    } else if (state === 'accepted') {
      this.rejectLine(sessionId, lineNumber);
      return 'rejected';
    } else {
      // Reset to pending
      const session = this.pendingChanges.get(sessionId);
      if (session) {
        session.accepted.delete(lineNumber);
        session.rejected.delete(lineNumber);
      }
      return 'pending';
    }
  }

  // ============ Hunk Actions ============

  acceptHunk(sessionId: string, hunkId: string): void {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return;

    const hunk = session.diffResult.hunks.find(h => h.id === hunkId);
    if (!hunk) return;

    for (const line of hunk.lines) {
      if (line.type !== DiffLineType.UNCHANGED) {
        session.accepted.add(line.lineNumber);
        session.rejected.delete(line.lineNumber);
      }
    }
  }

  rejectHunk(sessionId: string, hunkId: string): void {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return;

    const hunk = session.diffResult.hunks.find(h => h.id === hunkId);
    if (!hunk) return;

    for (const line of hunk.lines) {
      if (line.type !== DiffLineType.UNCHANGED) {
        session.rejected.add(line.lineNumber);
        session.accepted.delete(line.lineNumber);
      }
    }
  }

  toggleHunk(sessionId: string, hunkId: string): HunkState {
    const state = this.getHunkState(sessionId, hunkId);

    if (state === 'pending' || state === 'partial') {
      this.acceptHunk(sessionId, hunkId);
      return 'accepted';
    } else if (state === 'accepted') {
      this.rejectHunk(sessionId, hunkId);
      return 'rejected';
    } else {
      // Reset
      const session = this.pendingChanges.get(sessionId);
      const hunk = session?.diffResult.hunks.find(h => h.id === hunkId);
      if (session && hunk) {
        for (const line of hunk.lines) {
          session.accepted.delete(line.lineNumber);
          session.rejected.delete(line.lineNumber);
        }
      }
      return 'pending';
    }
  }

  // ============ State Queries ============

  getLineState(sessionId: string, lineNumber: number): LineState {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return 'pending';

    if (session.accepted.has(lineNumber)) return 'accepted';
    if (session.rejected.has(lineNumber)) return 'rejected';
    return 'pending';
  }

  getHunkState(sessionId: string, hunkId: string): HunkState {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return 'pending';

    const hunk = session.diffResult.hunks.find(h => h.id === hunkId);
    if (!hunk) return 'pending';

    const changedLines = hunk.lines.filter(l => l.type !== DiffLineType.UNCHANGED);
    if (changedLines.length === 0) return 'pending';

    const allAccepted = changedLines.every(l => session.accepted.has(l.lineNumber));
    const allRejected = changedLines.every(l => session.rejected.has(l.lineNumber));
    const anyAccepted = changedLines.some(l => session.accepted.has(l.lineNumber));
    const anyRejected = changedLines.some(l => session.rejected.has(l.lineNumber));

    if (allAccepted) return 'accepted';
    if (allRejected) return 'rejected';
    if (anyAccepted || anyRejected) return 'partial';
    return 'pending';
  }

  // ============ Build Final Content ============

  buildFinalContent(sessionId: string, original: string, modified: string, diffResult: DiffResult): string {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return original;

    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const result: string[] = [];

    let origIdx = 0;
    let modIdx = 0;

    for (const hunk of diffResult.hunks) {
      for (const line of hunk.lines) {
        const isAccepted = session.accepted.has(line.lineNumber);
        const isRejected = session.rejected.has(line.lineNumber);

        switch (line.type) {
          case DiffLineType.UNCHANGED:
            result.push(line.content);
            origIdx++;
            modIdx++;
            break;

          case DiffLineType.ADDED:
            if (!isRejected) {
              // Accept by default or explicitly accepted
              result.push(line.content);
            }
            modIdx++;
            break;

          case DiffLineType.REMOVED:
            if (isRejected || !isAccepted) {
              // Keep original (reject removal or pending)
              result.push(line.content);
            }
            origIdx++;
            break;

          case DiffLineType.MODIFIED:
            if (isAccepted) {
              result.push(line.content); // Use modified
            } else {
              result.push(line.originalContent || line.content); // Keep original
            }
            origIdx++;
            modIdx++;
            break;
        }
      }
    }

    // Remaining lines
    while (origIdx < originalLines.length) {
      result.push(originalLines[origIdx]);
      origIdx++;
    }

    return result.join('\n');
  }

  // ============ Counts ============

  getAcceptedCount(sessionId: string): { lines: number; hunks: number } {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return { lines: 0, hunks: 0 };

    const hunks = session.diffResult.hunks.filter(h => this.getHunkState(sessionId, h.id) === 'accepted').length;
    return { lines: session.accepted.size, hunks };
  }

  getRejectedCount(sessionId: string): { lines: number; hunks: number } {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return { lines: 0, hunks: 0 };

    const hunks = session.diffResult.hunks.filter(h => this.getHunkState(sessionId, h.id) === 'rejected').length;
    return { lines: session.rejected.size, hunks };
  }

  getPendingCount(sessionId: string): { lines: number; hunks: number } {
    const session = this.pendingChanges.get(sessionId);
    if (!session) return { lines: 0, hunks: 0 };

    let pendingLines = 0;
    for (const hunk of session.diffResult.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== DiffLineType.UNCHANGED && !session.accepted.has(line.lineNumber) && !session.rejected.has(line.lineNumber)) {
          pendingLines++;
        }
      }
    }

    const hunks = session.diffResult.hunks.filter(h => this.getHunkState(sessionId, h.id) === 'pending').length;
    return { lines: pendingLines, hunks };
  }

  // ============ Reset ============

  reset(sessionId: string): void {
    const session = this.pendingChanges.get(sessionId);
    if (session) {
      session.accepted.clear();
      session.rejected.clear();
    }
  }

  clearSession(sessionId: string): void {
    this.pendingChanges.delete(sessionId);
  }
}

// ============ Singleton ============

export const partialAcceptManager = new PartialAcceptManager();
