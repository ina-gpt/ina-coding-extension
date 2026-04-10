/**
 * ComplexityScanner.ts — Phase 20 Step 20.3
 * Compute cyclomatic complexity per file and function
 */

import * as fs from 'fs';
import * as path from 'path';
import { FileComplexity } from './AnalyticsTypes';
import { Logger } from '../../utils/Logger';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
const IGNORE = ['node_modules', 'dist', 'build', '.next', 'coverage', '.git', 'vendor', '__pycache__'];

export class ComplexityScanner {
  private root: string;

  constructor(workspaceRoot: string) { this.root = workspaceRoot; }

  scan(): FileComplexity[] {
    const files = this.walkFiles(this.root);
    const results: FileComplexity[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const relPath = path.relative(this.root, file);
        const lines = content.split('\n');
        const functions = this.extractFunctions(content, lines);
        const complexities = functions.map(f => this.computeComplexity(f.code));
        const maxNesting = functions.reduce((max, f) => Math.max(max, this.computeNesting(f.code)), 0);
        const total = complexities.reduce((s, c) => s + c, 0);
        const avg = complexities.length > 0 ? total / complexities.length : 0;
        const maxC = complexities.length > 0 ? Math.max(...complexities) : 0;
        const mi = this.maintainabilityIndex(lines.length, total, complexities.length);

        results.push({
          filePath: relPath,
          totalComplexity: total,
          functionCount: functions.length,
          avgComplexityPerFunction: Math.round(avg * 10) / 10,
          maxComplexity: maxC,
          maxNesting,
          lineCount: lines.length,
          hotspot: false,
          maintainabilityIndex: mi,
        });
      } catch { /* skip unreadable files */ }
    }

    // Mark hotspots (top 10%)
    results.sort((a, b) => b.totalComplexity - a.totalComplexity);
    const hotspotCount = Math.max(1, Math.ceil(results.length * 0.1));
    for (let i = 0; i < hotspotCount && i < results.length; i++) {
      if (results[i].totalComplexity > 0) results[i].hotspot = true;
    }

    return results;
  }

  private extractFunctions(content: string, lines: string[]): { code: string; start: number }[] {
    const functions: { code: string; start: number }[] = [];
    const patterns = [
      /(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)/g,
      /(?:export\s+)?(?:const|let)\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      /^\s+(?:async\s+)?\w+\s*\([^)]*\)\s*\{/gm,
      /^(?:async\s+)?def\s+\w+/gm,
      /^func\s+/gm,
    ];

    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(content)) !== null) {
        const startLine = content.slice(0, m.index).split('\n').length - 1;
        const endLine = this.findEnd(lines, startLine);
        functions.push({ code: lines.slice(startLine, endLine).join('\n'), start: startLine });
      }
    }

    return functions;
  }

  private findEnd(lines: string[], start: number): number {
    let depth = 0, started = false;
    for (let i = start; i < Math.min(start + 200, lines.length); i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
        if (started && depth === 0) return i + 1;
      }
    }
    // Python: indentation-based
    if (start < lines.length && /^\s*def\s/.test(lines[start])) {
      const indent = lines[start].match(/^(\s*)/)?.[1]?.length || 0;
      for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() && (lines[i].match(/^(\s*)/)?.[1]?.length || 0) <= indent) return i;
      }
    }
    return Math.min(start + 50, lines.length);
  }

  private computeComplexity(code: string): number {
    const patterns = [/\bif\s*\(/g, /\belse\s+if\b/g, /\bcase\s/g, /\bfor\s*\(/g, /\bwhile\s*\(/g, /\bdo\s*\{/g, /\bcatch\s*\(/g, /&&/g, /\|\|/g, /\?\s/g, /\?\./g, /\belif\b/g, /\bexcept\b/g];
    let complexity = 1;
    for (const p of patterns) complexity += (code.match(p) || []).length;
    return complexity;
  }

  private computeNesting(code: string): number {
    let max = 0, current = 0;
    for (const ch of code) {
      if (ch === '{' || ch === '(') { current++; max = Math.max(max, current); }
      if (ch === '}' || ch === ')') current--;
    }
    return max;
  }

  private maintainabilityIndex(loc: number, complexity: number, funcCount: number): number {
    if (loc === 0) return 100;
    const volume = loc * Math.log2(Math.max(1, funcCount + complexity));
    const mi = Math.max(0, (171 - 5.2 * Math.log(volume) - 0.23 * complexity - 16.2 * Math.log(loc)) * 100 / 171);
    return Math.round(mi);
  }

  private walkFiles(dir: string, depth: number = 0): string[] {
    if (depth > 8) return [];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORE.some(i => entry.name === i || entry.name.startsWith('.'))) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...this.walkFiles(full, depth + 1));
        else if (EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) results.push(full);
      }
    } catch { /* */ }
    return results;
  }
}
