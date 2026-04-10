/**
 * Diff Calculator
 *
 * Core diff calculation using Myers algorithm.
 */

import { v4 as uuidv4 } from 'uuid';
import { DiffResult, DiffLine, DiffHunk, DiffLineType } from './DiffTypes';

// ============ Diff Calculator ============

export class DiffCalculator {
  private lcsCache: Map<string, number[][]> = new Map();

  // ============ Main API ============

  calculateDiff(original: string, modified: string): DiffResult {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    const diffLines = this.myersDiff(originalLines, modifiedLines);
    const hunks = this.groupIntoHunks(diffLines, 3);
    const similarity = this.calculateSimilarity(original, modified);

    let additions = 0;
    let deletions = 0;
    let modifications = 0;

    for (const line of diffLines) {
      if (line.type === DiffLineType.ADDED) additions++;
      else if (line.type === DiffLineType.REMOVED) deletions++;
      else if (line.type === DiffLineType.MODIFIED) modifications++;
    }

    return {
      hunks,
      originalLines: originalLines.length,
      modifiedLines: modifiedLines.length,
      additions,
      deletions,
      modifications,
      similarity,
    };
  }

  calculateLineDiff(originalLine: string, modifiedLine: string): Array<{ type: 'same' | 'add' | 'remove'; text: string }> {
    const result: Array<{ type: 'same' | 'add' | 'remove'; text: string }> = [];

    // Word-level diff
    const originalWords = originalLine.split(/(\s+)/);
    const modifiedWords = modifiedLine.split(/(\s+)/);

    const lcs = this.findLCS(originalWords, modifiedWords);
    let oi = 0;
    let mi = 0;
    let li = 0;

    while (oi < originalWords.length || mi < modifiedWords.length) {
      if (li < lcs.length && oi < originalWords.length && originalWords[oi] === lcs[li] && mi < modifiedWords.length && modifiedWords[mi] === lcs[li]) {
        result.push({ type: 'same', text: lcs[li] });
        oi++;
        mi++;
        li++;
      } else if (li < lcs.length && mi < modifiedWords.length && modifiedWords[mi] !== lcs[li]) {
        result.push({ type: 'add', text: modifiedWords[mi] });
        mi++;
      } else if (li < lcs.length && oi < originalWords.length && originalWords[oi] !== lcs[li]) {
        result.push({ type: 'remove', text: originalWords[oi] });
        oi++;
      } else if (li >= lcs.length) {
        if (oi < originalWords.length) {
          result.push({ type: 'remove', text: originalWords[oi] });
          oi++;
        }
        if (mi < modifiedWords.length) {
          result.push({ type: 'add', text: modifiedWords[mi] });
          mi++;
        }
      } else {
        break;
      }
    }

    return result;
  }

  // ============ Myers Diff Algorithm ============

  private myersDiff(original: string[], modified: string[]): DiffLine[] {
    const n = original.length;
    const m = modified.length;
    const max = n + m;

    if (max === 0) return [];

    // Shortcut: identical
    if (original.join('\n') === modified.join('\n')) {
      return original.map((line, i) => ({
        lineNumber: i,
        originalLineNumber: i,
        modifiedLineNumber: i,
        type: DiffLineType.UNCHANGED,
        content: line,
        originalContent: null,
      }));
    }

    // Build edit graph using Myers algorithm
    const v: Map<number, number>[] = [];
    const trace: Map<number, number>[] = [];

    let found = false;
    let bestD = max;

    outer:
    for (let d = 0; d <= max; d++) {
      const vCurrent = new Map<number, number>(d > 0 ? v[d - 1] : undefined);

      for (let k = -d; k <= d; k += 2) {
        let x: number;
        if (k === -d || (k !== d && (vCurrent.get(k - 1) ?? 0) < (vCurrent.get(k + 1) ?? 0))) {
          x = vCurrent.get(k + 1) ?? 0;
        } else {
          x = (vCurrent.get(k - 1) ?? 0) + 1;
        }

        let y = x - k;

        // Follow diagonal (matching lines)
        while (x < n && y < m && original[x] === modified[y]) {
          x++;
          y++;
        }

        vCurrent.set(k, x);

        if (x >= n && y >= m) {
          v[d] = vCurrent;
          trace.push(new Map(vCurrent));
          bestD = d;
          found = true;
          break outer;
        }
      }

      v[d] = vCurrent;
      trace.push(new Map(vCurrent));
    }

    // Backtrack to find the edit script
    return this.backtrack(trace, original, modified, bestD);
  }

  private backtrack(trace: Map<number, number>[], original: string[], modified: string[], bestD: number): DiffLine[] {
    const moves: Array<{ fromX: number; fromY: number; toX: number; toY: number }> = [];

    let x = original.length;
    let y = modified.length;

    for (let d = bestD; d > 0; d--) {
      const k = x - y;
      const prevV = trace[d - 1];

      let prevK: number;
      if (k === -d || (k !== d && (prevV?.get(k - 1) ?? 0) < (prevV?.get(k + 1) ?? 0))) {
        prevK = k + 1;
      } else {
        prevK = k - 1;
      }

      const prevX = prevV?.get(prevK) ?? 0;
      const prevY = prevX - prevK;

      // Follow diagonal back
      let cx = x;
      let cy = y;
      while (cx > prevX && cy > prevY && cx > 0 && cy > 0) {
        cx--;
        cy--;
      }

      moves.unshift({ fromX: prevX, fromY: prevY, toX: x, toY: y });

      x = prevX;
      y = prevY;
    }

    // Build diff lines from moves
    const diffLines: DiffLine[] = [];
    let origIdx = 0;
    let modIdx = 0;
    let lineNum = 0;

    for (const move of moves) {
      // Diagonal (unchanged) lines before this move
      while (origIdx < move.fromX && modIdx < move.fromY) {
        // This shouldn't normally happen in correct backtracking
        origIdx++;
        modIdx++;
      }

      // Add unchanged lines up to the move start
      while (origIdx < move.fromX && origIdx < original.length) {
        diffLines.push({
          lineNumber: lineNum++,
          originalLineNumber: origIdx,
          modifiedLineNumber: null,
          type: DiffLineType.REMOVED,
          content: original[origIdx],
          originalContent: original[origIdx],
        });
        origIdx++;
      }

      while (modIdx < move.fromY && modIdx < modified.length) {
        diffLines.push({
          lineNumber: lineNum++,
          originalLineNumber: null,
          modifiedLineNumber: modIdx,
          type: DiffLineType.ADDED,
          content: modified[modIdx],
          originalContent: null,
        });
        modIdx++;
      }

      // Process the move: diagonal then edit
      const diagEndX = Math.min(move.toX, original.length);
      const diagEndY = Math.min(move.toY, modified.length);

      // Check if it's an insertion (y increased) or deletion (x increased)
      if (move.fromX < diagEndX && move.fromY < diagEndY) {
        // Could be modification or diagonal followed by edit
        // Handle diagonal matches first
        let dx = move.fromX;
        let dy = move.fromY;

        while (dx < diagEndX && dy < diagEndY && original[dx] === modified[dy]) {
          diffLines.push({
            lineNumber: lineNum++,
            originalLineNumber: dx,
            modifiedLineNumber: dy,
            type: DiffLineType.UNCHANGED,
            content: original[dx],
            originalContent: null,
          });
          dx++;
          dy++;
        }

        // Remaining are edits
        while (dx < diagEndX) {
          diffLines.push({
            lineNumber: lineNum++,
            originalLineNumber: dx,
            modifiedLineNumber: null,
            type: DiffLineType.REMOVED,
            content: original[dx],
            originalContent: original[dx],
          });
          dx++;
        }

        while (dy < diagEndY) {
          diffLines.push({
            lineNumber: lineNum++,
            originalLineNumber: null,
            modifiedLineNumber: dy,
            type: DiffLineType.ADDED,
            content: modified[dy],
            originalContent: null,
          });
          dy++;
        }

        origIdx = diagEndX;
        modIdx = diagEndY;
      }
    }

    // Remaining unchanged lines
    while (origIdx < original.length && modIdx < modified.length) {
      diffLines.push({
        lineNumber: lineNum++,
        originalLineNumber: origIdx,
        modifiedLineNumber: modIdx,
        type: DiffLineType.UNCHANGED,
        content: original[origIdx],
        originalContent: null,
      });
      origIdx++;
      modIdx++;
    }

    // Remaining added/removed
    while (origIdx < original.length) {
      diffLines.push({
        lineNumber: lineNum++,
        originalLineNumber: origIdx,
        modifiedLineNumber: null,
        type: DiffLineType.REMOVED,
        content: original[origIdx],
        originalContent: original[origIdx],
      });
      origIdx++;
    }

    while (modIdx < modified.length) {
      diffLines.push({
        lineNumber: lineNum++,
        originalLineNumber: null,
        modifiedLineNumber: modIdx,
        type: DiffLineType.ADDED,
        content: modified[modIdx],
        originalContent: null,
      });
      modIdx++;
    }

    return diffLines;
  }

  // ============ Hunk Grouping ============

  private groupIntoHunks(lines: DiffLine[], contextLines: number = 3): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const changeIndices: number[] = [];

    // Find all changed line indices
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].type !== DiffLineType.UNCHANGED) {
        changeIndices.push(i);
      }
    }

    if (changeIndices.length === 0) return [];

    // Group consecutive changes (with context overlap)
    let groupStart = changeIndices[0];
    let groupEnd = changeIndices[0];

    const groups: Array<[number, number]> = [];

    for (let i = 1; i < changeIndices.length; i++) {
      if (changeIndices[i] - groupEnd <= contextLines * 2 + 1) {
        // Merge into current group
        groupEnd = changeIndices[i];
      } else {
        groups.push([groupStart, groupEnd]);
        groupStart = changeIndices[i];
        groupEnd = changeIndices[i];
      }
    }
    groups.push([groupStart, groupEnd]);

    // Create hunks with context
    for (const [start, end] of groups) {
      const hunkStart = Math.max(0, start - contextLines);
      const hunkEnd = Math.min(lines.length - 1, end + contextLines);

      const hunkLines = lines.slice(hunkStart, hunkEnd + 1);

      let hasAdded = false;
      let hasRemoved = false;
      for (const line of hunkLines) {
        if (line.type === DiffLineType.ADDED) hasAdded = true;
        if (line.type === DiffLineType.REMOVED) hasRemoved = true;
      }

      const hunkType = hasAdded && hasRemoved ? 'modification' : hasAdded ? 'addition' : 'deletion';

      const origStart = hunkLines.find(l => l.originalLineNumber !== null)?.originalLineNumber ?? 0;
      const origEnd = [...hunkLines].reverse().find(l => l.originalLineNumber !== null)?.originalLineNumber ?? origStart;
      const modStart = hunkLines.find(l => l.modifiedLineNumber !== null)?.modifiedLineNumber ?? 0;

      hunks.push({
        id: uuidv4(),
        startLine: hunkStart,
        endLine: hunkEnd,
        originalStartLine: origStart,
        originalEndLine: origEnd,
        lines: hunkLines,
        type: hunkType,
        selected: false,
        applied: false,
      });
    }

    return hunks;
  }

  // ============ Similarity ============

  calculateSimilarity(original: string, modified: string): number {
    if (original === modified) return 1;
    if (original.length === 0 && modified.length === 0) return 1;
    if (original.length === 0 || modified.length === 0) return 0;

    const maxLen = Math.max(original.length, modified.length);
    const distance = this.levenshteinDistance(original, modified);
    return 1 - (distance / maxLen);
  }

  private levenshteinDistance(a: string, b: string): number {
    // Optimized for large strings: use line-level comparison
    const aLines = a.split('\n');
    const bLines = b.split('\n');

    const m = aLines.length;
    const n = bLines.length;

    // Use two-row optimization
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);

    for (let j = 0; j <= n; j++) prev[j] = j;

    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        if (aLines[i - 1] === bLines[j - 1]) {
          curr[j] = prev[j - 1];
        } else {
          curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  // ============ LCS ============

  findLCS(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;

    // DP table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack
    const result: string[] = [];
    let i = m;
    let j = n;

    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return result;
  }

  // ============ Unified Diff ============

  createUnifiedDiff(result: DiffResult, fileName: string): string {
    const lines: string[] = [];
    lines.push(`--- a/${fileName}`);
    lines.push(`+++ b/${fileName}`);

    for (const hunk of result.hunks) {
      const origCount = hunk.lines.filter(l => l.type !== DiffLineType.ADDED).length;
      const modCount = hunk.lines.filter(l => l.type !== DiffLineType.REMOVED).length;
      lines.push(`@@ -${hunk.originalStartLine + 1},${origCount} +${(hunk.lines.find(l => l.modifiedLineNumber !== null)?.modifiedLineNumber ?? 0) + 1},${modCount} @@`);

      for (const line of hunk.lines) {
        switch (line.type) {
          case DiffLineType.UNCHANGED:
            lines.push(` ${line.content}`);
            break;
          case DiffLineType.ADDED:
            lines.push(`+${line.content}`);
            break;
          case DiffLineType.REMOVED:
            lines.push(`-${line.content}`);
            break;
          case DiffLineType.MODIFIED:
            lines.push(`-${line.originalContent || line.content}`);
            lines.push(`+${line.content}`);
            break;
        }
      }
    }

    return lines.join('\n');
  }

  // ============ Apply Hunks ============

  applyHunk(original: string, hunk: DiffHunk): string {
    const lines = original.split('\n');
    const result: string[] = [];

    let i = 0;

    // Lines before hunk
    while (i < hunk.originalStartLine && i < lines.length) {
      result.push(lines[i]);
      i++;
    }

    // Apply hunk changes
    for (const line of hunk.lines) {
      if (line.type === DiffLineType.UNCHANGED) {
        result.push(line.content);
        i++;
      } else if (line.type === DiffLineType.ADDED) {
        result.push(line.content);
      } else if (line.type === DiffLineType.REMOVED) {
        i++; // skip original line
      } else if (line.type === DiffLineType.MODIFIED) {
        result.push(line.content);
        i++;
      }
    }

    // Lines after hunk
    while (i < lines.length) {
      result.push(lines[i]);
      i++;
    }

    return result.join('\n');
  }

  applyHunks(original: string, hunks: DiffHunk[]): string {
    // Sort hunks by start line in reverse to avoid line shifts
    const sorted = [...hunks].sort((a, b) => b.originalStartLine - a.originalStartLine);

    let result = original;
    for (const hunk of sorted) {
      result = this.applyHunk(result, hunk);
    }

    return result;
  }
}

// ============ Singleton ============

export const diffCalculator = new DiffCalculator();
