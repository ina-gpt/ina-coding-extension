/**
 * ComposerDiffEngine.ts
 * Phase 16.1 — Composer UI Enhancement
 *
 * Generates and manages diffs for the Composer experience.
 * Uses an LCS-based line diff algorithm and exposes utilities for
 * unified-diff formatting, side-by-side rendering, partial-hunk apply,
 * change summarization, and risk computation.
 */

import * as path from 'path';
import {
  DiffHunk,
  DiffLine,
  ComposerDiff,
  ComposerFileChange,
  ComposerRiskLevel,
} from './ComposerTypes';

export class ComposerDiffEngine {
  private static instance: ComposerDiffEngine;

  private constructor() {}

  static getInstance(): ComposerDiffEngine {
    if (!ComposerDiffEngine.instance) {
      ComposerDiffEngine.instance = new ComposerDiffEngine();
    }
    return ComposerDiffEngine.instance;
  }

  // ============================================================
  // Core diff computation (LCS based)
  // ============================================================

  /**
   * Compute a structured diff between original and new content.
   * Returns hunks plus aggregate add/remove counts.
   */
  computeDiff(originalContent: string, newContent: string): ComposerDiff {
    const originalLines = originalContent.split('\n');
    const newLines = newContent.split('\n');

    const ops = this.lcsDiff(originalLines, newLines);

    // Group consecutive non-equal ops into hunks (with a small context window)
    const hunks: DiffHunk[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'equal') {
        i++;
        continue;
      }

      // Find run of changes
      const runStart = i;
      let originalRunStart = ops[i].originalIndex;
      let modifiedRunStart = ops[i].modifiedIndex;
      const removedLines: string[] = [];
      const addedLines: string[] = [];

      while (i < ops.length && ops[i].type !== 'equal') {
        if (ops[i].type === 'remove') {
          removedLines.push(originalLines[ops[i].originalIndex]);
          linesRemoved++;
        } else if (ops[i].type === 'add') {
          addedLines.push(newLines[ops[i].modifiedIndex]);
          linesAdded++;
        }
        i++;
      }

      const originalEnd = originalRunStart + removedLines.length;
      const modifiedEnd = modifiedRunStart + addedLines.length;

      // Edge case: pure additions (no removed) — anchor original at modifiedRunStart
      if (removedLines.length === 0 && originalRunStart < 0) {
        originalRunStart = Math.max(0, modifiedRunStart);
      }

      hunks.push({
        startLineOriginal: Math.max(0, originalRunStart),
        endLineOriginal: Math.max(0, originalEnd),
        startLineModified: Math.max(0, modifiedRunStart),
        endLineModified: Math.max(0, modifiedEnd),
        originalContent: removedLines.join('\n'),
        modifiedContent: addedLines.join('\n'),
      });

      // runStart unused beyond loop bookkeeping
      void runStart;
    }

    return { hunks, linesAdded, linesRemoved };
  }

  /**
   * Apply only the accepted hunks to the original content (partial accept).
   * `acceptedHunks[i]` corresponds to `hunks[i]`. Rejected hunks are dropped
   * (i.e. the original lines are kept unchanged).
   */
  applyHunks(originalContent: string, hunks: DiffHunk[], acceptedHunks: boolean[]): string {
    if (hunks.length === 0) return originalContent;

    const originalLines = originalContent.split('\n');
    const result: string[] = [];
    let cursor = 0;

    // Sort hunks by original start line to process in order
    const sortedIdx = hunks
      .map((_, i) => i)
      .sort((a, b) => hunks[a].startLineOriginal - hunks[b].startLineOriginal);

    for (const idx of sortedIdx) {
      const hunk = hunks[idx];
      const accepted = acceptedHunks[idx] === true;

      // Copy unchanged lines before this hunk
      while (cursor < hunk.startLineOriginal && cursor < originalLines.length) {
        result.push(originalLines[cursor]);
        cursor++;
      }

      if (accepted) {
        // Replace original range with the modified content
        if (hunk.modifiedContent.length > 0) {
          result.push(...hunk.modifiedContent.split('\n'));
        }
        cursor = hunk.endLineOriginal;
      } else {
        // Keep the original lines for this hunk
        while (cursor < hunk.endLineOriginal && cursor < originalLines.length) {
          result.push(originalLines[cursor]);
          cursor++;
        }
      }
    }

    // Tail
    while (cursor < originalLines.length) {
      result.push(originalLines[cursor]);
      cursor++;
    }

    return result.join('\n');
  }

  // ============================================================
  // Formatting helpers
  // ============================================================

  /**
   * Format the diff as a standard unified diff string.
   */
  formatUnifiedDiff(diff: { hunks: DiffHunk[] }, filePath: string): string {
    const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
    for (const hunk of diff.hunks) {
      const oCount = hunk.endLineOriginal - hunk.startLineOriginal;
      const mCount = hunk.endLineModified - hunk.startLineModified;
      lines.push(
        `@@ -${hunk.startLineOriginal + 1},${oCount} +${hunk.startLineModified + 1},${mCount} @@`
      );
      if (hunk.originalContent) {
        for (const l of hunk.originalContent.split('\n')) lines.push(`-${l}`);
      }
      if (hunk.modifiedContent) {
        for (const l of hunk.modifiedContent.split('\n')) lines.push(`+${l}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * Render the diff for a side-by-side view. Each side gets a parallel array
   * of `DiffLine`s with matching indexes (alignment).
   */
  formatSideBySide(diff: { hunks: DiffHunk[] }): { left: DiffLine[]; right: DiffLine[] } {
    const left: DiffLine[] = [];
    const right: DiffLine[] = [];

    diff.hunks.forEach((hunk, hunkIndex) => {
      const removed = hunk.originalContent ? hunk.originalContent.split('\n') : [];
      const added = hunk.modifiedContent ? hunk.modifiedContent.split('\n') : [];
      const max = Math.max(removed.length, added.length);

      for (let i = 0; i < max; i++) {
        const r = removed[i];
        const a = added[i];

        if (r !== undefined && a !== undefined) {
          // Modified line
          left.push({
            lineNumber: hunk.startLineOriginal + i + 1,
            content: r,
            type: 'modified',
            hunkIndex,
          });
          right.push({
            lineNumber: hunk.startLineModified + i + 1,
            content: a,
            type: 'modified',
            hunkIndex,
          });
        } else if (r !== undefined) {
          // Pure removal
          left.push({
            lineNumber: hunk.startLineOriginal + i + 1,
            content: r,
            type: 'removed',
            hunkIndex,
          });
          right.push({
            lineNumber: 0,
            content: '',
            type: 'unchanged',
            hunkIndex,
          });
        } else if (a !== undefined) {
          // Pure addition
          left.push({
            lineNumber: 0,
            content: '',
            type: 'unchanged',
            hunkIndex,
          });
          right.push({
            lineNumber: hunk.startLineModified + i + 1,
            content: a,
            type: 'added',
            hunkIndex,
          });
        }
      }
    });

    return { left, right };
  }

  /**
   * Human-readable summary across all file changes.
   */
  summarizeChanges(fileChanges: ComposerFileChange[]): string {
    let created = 0;
    let modified = 0;
    let deleted = 0;
    let added = 0;
    let removed = 0;

    for (const fc of fileChanges) {
      if (fc.status === 'created') created++;
      else if (fc.status === 'modified') modified++;
      else if (fc.status === 'deleted') deleted++;
      added += fc.diff.linesAdded;
      removed += fc.diff.linesRemoved;
    }

    const fileParts: string[] = [];
    if (modified) fileParts.push(`Modified ${modified} file${modified === 1 ? '' : 's'}`);
    if (created) fileParts.push(`created ${created} file${created === 1 ? '' : 's'}`);
    if (deleted) fileParts.push(`deleted ${deleted} file${deleted === 1 ? '' : 's'}`);

    const fileSummary = fileParts.length > 0 ? fileParts.join(', ') + '.' : 'No file changes.';
    return `${fileSummary} +${added} lines, -${removed} lines.`;
  }

  /**
   * Compute risk for a single file change.
   * - low: pure additions, small change
   * - medium: modifications, moderate size
   * - high: large deletions, security-sensitive paths, or config files
   */
  computeRisk(fileChange: ComposerFileChange): ComposerRiskLevel {
    const { diff, filePath, status } = fileChange;
    const totalLines = diff.linesAdded + diff.linesRemoved;
    const baseName = path.basename(filePath).toLowerCase();
    const lower = filePath.toLowerCase();

    const sensitive =
      lower.includes('.env') ||
      lower.includes('secret') ||
      lower.includes('credential') ||
      lower.includes('private') ||
      baseName === 'package.json' ||
      baseName === 'package-lock.json' ||
      baseName === 'yarn.lock' ||
      baseName === 'tsconfig.json' ||
      baseName.endsWith('.config.js') ||
      baseName.endsWith('.config.ts') ||
      lower.includes('/auth/') ||
      lower.includes('/security/');

    if (status === 'deleted' && totalLines > 50) return 'high';
    if (sensitive) return 'high';
    if (diff.linesRemoved > 50 || totalLines > 200) return 'high';
    if (diff.linesRemoved > 0 || totalLines > 30) return 'medium';
    if (diff.linesAdded > 0 && diff.linesRemoved === 0) return 'low';
    return 'medium';
  }

  // ============================================================
  // Internal — LCS based diff
  // ============================================================

  private lcsDiff(
    original: string[],
    modified: string[]
  ): Array<{ type: 'equal' | 'add' | 'remove'; originalIndex: number; modifiedIndex: number }> {
    const m = original.length;
    const n = modified.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (original[i - 1] === modified[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack
    const ops: Array<{
      type: 'equal' | 'add' | 'remove';
      originalIndex: number;
      modifiedIndex: number;
    }> = [];

    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (original[i - 1] === modified[j - 1]) {
        ops.unshift({ type: 'equal', originalIndex: i - 1, modifiedIndex: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        ops.unshift({ type: 'remove', originalIndex: i - 1, modifiedIndex: j });
        i--;
      } else {
        ops.unshift({ type: 'add', originalIndex: i, modifiedIndex: j - 1 });
        j--;
      }
    }
    while (i > 0) {
      i--;
      ops.unshift({ type: 'remove', originalIndex: i, modifiedIndex: 0 });
    }
    while (j > 0) {
      j--;
      ops.unshift({ type: 'add', originalIndex: 0, modifiedIndex: j });
    }

    return ops;
  }
}
