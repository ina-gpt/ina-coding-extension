/**
 * DuplicationDetector.ts — Phase 20 Step 20.3
 * Detect code duplication using rolling hash
 */

import * as fs from 'fs';
import * as path from 'path';
import { DuplicationReport } from './AnalyticsTypes';
import { Logger } from '../../utils/Logger';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];
const IGNORE = ['node_modules', 'dist', 'build', '.next', '.git', 'coverage'];

export class DuplicationDetector {
  private root: string;
  private minLines: number;

  constructor(workspaceRoot: string, minLines: number = 6) {
    this.root = workspaceRoot;
    this.minLines = minLines;
  }

  detect(): DuplicationReport[] {
    const files = this.walkSourceFiles(this.root);
    const hashIndex = new Map<string, { file: string; line: number }[]>();
    const results: DuplicationReport[] = [];

    // Build hash index
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const relPath = path.relative(this.root, file);
        const lines = content.split('\n');
        const normalized = lines.map(l => this.normalize(l));

        for (let i = 0; i <= normalized.length - this.minLines; i++) {
          const block = normalized.slice(i, i + this.minLines).join('\n');
          if (block.trim().length < 20) continue; // Skip trivial blocks
          const hash = this.hash(block);
          if (!hashIndex.has(hash)) hashIndex.set(hash, []);
          hashIndex.get(hash)!.push({ file: relPath, line: i + 1 });
        }
      } catch { /* */ }
    }

    // Find duplicates
    const seen = new Set<string>();
    for (const [, locations] of hashIndex) {
      if (locations.length < 2) continue;

      for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
          const a = locations[i];
          const b = locations[j];
          if (a.file === b.file && Math.abs(a.line - b.line) < this.minLines) continue;

          const key = `${a.file}:${a.line}-${b.file}:${b.line}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // Extend match
          const extendedLines = this.extendMatch(a.file, a.line, b.file, b.line);

          // Skip test files
          if (a.file.includes('.test.') || a.file.includes('.spec.') || b.file.includes('.test.') || b.file.includes('.spec.')) continue;

          results.push({
            blockA: { file: a.file, startLine: a.line, endLine: a.line + extendedLines - 1 },
            blockB: { file: b.file, startLine: b.line, endLine: b.line + extendedLines - 1 },
            similarity: 100,
            lineCount: extendedLines,
            language: this.detectLanguage(a.file),
          });
        }
      }
    }

    return results.sort((a, b) => b.lineCount - a.lineCount).slice(0, 50);
  }

  private extendMatch(fileA: string, lineA: number, fileB: string, lineB: number): number {
    try {
      const absA = path.join(this.root, fileA);
      const absB = path.join(this.root, fileB);
      const linesA = fs.readFileSync(absA, 'utf-8').split('\n');
      const linesB = fs.readFileSync(absB, 'utf-8').split('\n');

      let extended = this.minLines;
      while (lineA + extended - 1 < linesA.length && lineB + extended - 1 < linesB.length) {
        if (this.normalize(linesA[lineA + extended - 1]) !== this.normalize(linesB[lineB + extended - 1])) break;
        extended++;
      }
      return extended;
    } catch {
      return this.minLines;
    }
  }

  private normalize(line: string): string {
    return line
      .replace(/\/\/.*$/, '')          // strip line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
      .replace(/\s+/g, ' ')            // normalize whitespace
      .replace(/['"`]/g, '"')          // normalize quotes
      .trim();
  }

  private hash(text: string): string {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return h.toString(36);
  }

  private detectLanguage(file: string): string {
    const ext = path.extname(file).toLowerCase();
    const map: Record<string, string> = { '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.py': 'python', '.go': 'go', '.rs': 'rust' };
    return map[ext] || 'unknown';
  }

  private walkSourceFiles(dir: string, depth: number = 0): string[] {
    if (depth > 6) return [];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORE.some(i => entry.name === i || entry.name.startsWith('.'))) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...this.walkSourceFiles(full, depth + 1));
        else if (EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) results.push(full);
      }
    } catch { /* */ }
    return results;
  }
}
