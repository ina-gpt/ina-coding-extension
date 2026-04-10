import { Logger } from '../../../utils/Logger';
import { MergeConflict, DiffHunk } from './FileOpsTypes';

/**
 * Singleton for creating and applying unified diffs, plus 3-way merge.
 */
export class DiffPatcher {
    private static instance: DiffPatcher;
    private constructor() {}

    public static getInstance(): DiffPatcher {
        if (!DiffPatcher.instance) { DiffPatcher.instance = new DiffPatcher(); }
        return DiffPatcher.instance;
    }

    /** Generates standard unified diff format string with @@ -old +new @@ headers. */
    public createUnifiedDiff(original: string, modified: string, filePath: string): string {
        const hunks = this.computeHunks(original.split('\n'), modified.split('\n'));
        if (!hunks.length) { return ''; }
        const header = `--- a/${filePath}\n+++ b/${filePath}`;
        const body = hunks.map((h) =>
            [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines].join('\n')
        ).join('\n');
        return `${header}\n${body}`;
    }

    /** Parses hunks from a unified diff, applies them line by line, returns the result. */
    public applyUnifiedDiff(original: string, diff: string): { result: string; applied: number; rejected: number } {
        const hunks = this.parseDiffHunks(diff);
        const lines = original.split('\n');
        let applied = 0, rejected = 0, offset = 0;
        for (const hunk of hunks) {
            const r = this.applyHunk(lines, hunk, offset);
            if (r.success) { applied++; offset = r.newOffset; }
            else { rejected++; Logger.warn(`Failed to apply hunk at line ${hunk.oldStart}`); }
        }
        return { result: lines.join('\n'), applied, rejected };
    }

    /** Returns line-level diff: added, removed, and changed lines. */
    public createLineDiff(original: string, modified: string): { added: string[]; removed: string[]; changed: Array<{ line: number; old: string; new: string }> } {
        const origLines = original.split('\n'), modLines = modified.split('\n');
        const added: string[] = [], removed: string[] = [], changed: Array<{ line: number; old: string; new: string }> = [];
        const max = Math.max(origLines.length, modLines.length);
        for (let i = 0; i < max; i++) {
            const o = i < origLines.length ? origLines[i] : undefined;
            const m = i < modLines.length ? modLines[i] : undefined;
            if (o === undefined && m !== undefined) { added.push(m); }
            else if (o !== undefined && m === undefined) { removed.push(o); }
            else if (o !== m) { changed.push({ line: i + 1, old: o!, new: m! }); }
        }
        return { added, removed, changed };
    }

    /** Standard 3-way merge. Creates MergeConflict entries when both sides diverge. */
    public mergeThreeWay(base: string, local: string, remote: string): { result: string; conflicts: MergeConflict[] } {
        const bLines = base.split('\n'), lLines = local.split('\n'), rLines = remote.split('\n');
        const conflicts: MergeConflict[] = [], result: string[] = [];
        const max = Math.max(bLines.length, lLines.length, rLines.length);

        let i = 0;
        while (i < max) {
            const b = i < bLines.length ? bLines[i] : undefined;
            const l = i < lLines.length ? lLines[i] : undefined;
            const r = i < rLines.length ? rLines[i] : undefined;
            const lChanged = l !== b, rChanged = r !== b;

            if (!lChanged && !rChanged) { if (b !== undefined) { result.push(b); } i++; }
            else if (lChanged && !rChanged) { if (l !== undefined) { result.push(l); } i++; }
            else if (!lChanged && rChanged) { if (r !== undefined) { result.push(r); } i++; }
            else if (l === r) { if (l !== undefined) { result.push(l); } i++; }
            else {
                // Both changed differently — gather conflict region
                const start = i;
                const cBase: string[] = [], cLocal: string[] = [], cRemote: string[] = [];
                while (i < max) {
                    const bi = i < bLines.length ? bLines[i] : undefined;
                    const li = i < lLines.length ? lLines[i] : undefined;
                    const ri = i < rLines.length ? rLines[i] : undefined;
                    if ((li !== bi) && (ri !== bi) && (li !== ri)) {
                        if (bi !== undefined) { cBase.push(bi); }
                        if (li !== undefined) { cLocal.push(li); }
                        if (ri !== undefined) { cRemote.push(ri); }
                        i++;
                    } else { break; }
                }
                conflicts.push({
                    startLine: start + 1, endLine: i,
                    baseContent: cBase.join('\n'), localContent: cLocal.join('\n'), remoteContent: cRemote.join('\n')
                });
                result.push('<<<<<<< LOCAL', ...cLocal, '=======', ...cRemote, '>>>>>>> REMOTE');
            }
        }
        return { result: result.join('\n'), conflicts };
    }

    /** Parses a unified diff string into DiffHunk[]. */
    public parseDiffHunks(diff: string): DiffHunk[] {
        const hunks: DiffHunk[] = [];
        let current: DiffHunk | null = null;
        for (const line of diff.split('\n')) {
            const m = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
            if (m) {
                if (current) { hunks.push(current); }
                current = {
                    oldStart: +m[1], oldLines: m[2] ? +m[2] : 1,
                    newStart: +m[3], newLines: m[4] ? +m[4] : 1, lines: []
                };
            } else if (current && (line[0] === '+' || line[0] === '-' || line[0] === ' ')) {
                current.lines.push(line);
            }
        }
        if (current) { hunks.push(current); }
        return hunks;
    }

    /** Applies a single hunk to lines (in place). Returns success and new offset. */
    public applyHunk(lines: string[], hunk: DiffHunk, offset: number): { success: boolean; newOffset: number } {
        const start = hunk.oldStart - 1 + offset;
        // Verify context/removal lines match
        const expected = hunk.lines.filter((l) => l[0] === ' ' || l[0] === '-');
        for (let i = 0; i < expected.length; i++) {
            if (start + i >= lines.length || lines[start + i] !== expected[i].slice(1)) {
                return { success: false, newOffset: offset };
            }
        }
        // Apply: collect removals and additions
        const removals: number[] = [], additions: Array<{ idx: number; text: string }> = [];
        let li = start;
        for (const hl of hunk.lines) {
            if (hl[0] === ' ') { li++; }
            else if (hl[0] === '-') { removals.push(li); li++; }
            else if (hl[0] === '+') { additions.push({ idx: li, text: hl.slice(1) }); }
        }
        for (let i = removals.length - 1; i >= 0; i--) { lines.splice(removals[i], 1); }
        for (let i = 0; i < additions.length; i++) {
            lines.splice(additions[i].idx - removals.length + i, 0, additions[i].text);
        }
        return { success: true, newOffset: offset + additions.length - removals.length };
    }

    // ── Private ──

    private computeHunks(orig: string[], mod: string[]): DiffHunk[] {
        const hunks: DiffHunk[] = [];
        const ctx = 3;
        let i = 0, j = 0;

        while (i < orig.length || j < mod.length) {
            if (i < orig.length && j < mod.length && orig[i] === mod[j]) { i++; j++; continue; }
            const oStart = Math.max(1, i - ctx + 1), nStart = Math.max(1, j - ctx + 1);
            const hLines: string[] = [];
            for (let c = Math.max(0, i - ctx); c < i; c++) { hLines.push(' ' + orig[c]); }

            while (i < orig.length || j < mod.length) {
                if (i < orig.length && j < mod.length && orig[i] === mod[j]) {
                    let mc = 0;
                    while (i + mc < orig.length && j + mc < mod.length && orig[i + mc] === mod[j + mc] && mc <= ctx * 2) { mc++; }
                    if (mc > ctx * 2) {
                        for (let c = 0; c < ctx; c++) { hLines.push(' ' + orig[i + c]); }
                        i += ctx; j += ctx; break;
                    }
                    for (let c = 0; c < mc; c++) { hLines.push(' ' + orig[i]); i++; j++; }
                } else if (i < orig.length && (j >= mod.length || orig[i] !== mod[j])) {
                    hLines.push('-' + orig[i]); i++;
                } else { hLines.push('+' + mod[j]); j++; }
            }

            const oldCount = hLines.filter((l) => l[0] === ' ' || l[0] === '-').length;
            const newCount = hLines.filter((l) => l[0] === ' ' || l[0] === '+').length;
            hunks.push({ oldStart: oStart, oldLines: oldCount, newStart: nStart, newLines: newCount, lines: hLines });
        }
        return hunks;
    }
}

export default DiffPatcher.getInstance();
