/**
 * DebtDetector.ts — Phase 20 Step 20.4
 * Automated technical debt detection
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DebtItem, DebtCategory, DebtSeverity } from './DebtTypes';
import { Logger } from '../../utils/Logger';

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
const IGNORE = ['node_modules', 'dist', 'build', '.next', '.git', 'coverage', 'vendor'];

export class DebtDetector {
  private root: string;

  constructor(workspaceRoot: string) { this.root = workspaceRoot; }

  detect(): DebtItem[] {
    const items: DebtItem[] = [];
    const files = this.walkFiles(this.root);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const relPath = path.relative(this.root, file);
        const lines = content.split('\n');

        items.push(...this.detectTodoFixme(relPath, lines));
        items.push(...this.detectDeprecatedAPIs(relPath, lines));
        items.push(...this.detectMissingDocs(relPath, lines));
        items.push(...this.detectPerformanceIssues(relPath, lines));
        items.push(...this.detectWorkarounds(relPath, lines));
        items.push(...this.detectInconsistency(relPath, lines));
        items.push(...this.detectDeadCode(relPath, lines));
      } catch { /* skip */ }
    }

    return this.deduplicate(items);
  }

  private detectTodoFixme(file: string, lines: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    const patterns: [RegExp, DebtSeverity][] = [
      [/\bFIXME\b/i, 'high'],
      [/\bHACK\b/i, 'high'],
      [/\bWORKAROUND\b/i, 'medium'],
      [/\bXXX\b/, 'medium'],
      [/\bTEMP\b/i, 'low'],
      [/\bTODO\b/i, 'low'],
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const [pattern, severity] of patterns) {
        if (pattern.test(lines[i]) && (lines[i].includes('//') || lines[i].includes('#') || lines[i].includes('*'))) {
          const comment = lines[i].replace(/^[^//#*]*[//#*]+\s*/, '').trim();
          items.push(this.createItem(DebtCategory.TODO_FIXME, pattern.source.replace(/\\b/g, ''), comment.slice(0, 120), file, i + 1, i + 1, severity));
          break;
        }
      }
    }
    return items;
  }

  private detectDeprecatedAPIs(file: string, lines: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    const deprecated: [RegExp, string][] = [
      [/\bcomponentWillMount\b/, 'React: componentWillMount is deprecated, use componentDidMount or useEffect'],
      [/\bcomponentWillReceiveProps\b/, 'React: componentWillReceiveProps is deprecated, use getDerivedStateFromProps'],
      [/\bfindDOMNode\b/, 'React: findDOMNode is deprecated, use refs'],
      [/\bfs\.exists\b/, 'Node.js: fs.exists is deprecated, use fs.access or fs.stat'],
      [/\burl\.parse\b/, 'Node.js: url.parse is deprecated, use new URL()'],
      [/\bnew Buffer\b/, 'Node.js: Buffer() constructor is deprecated, use Buffer.from/alloc'],
      [/\b@deprecated\b/, 'Using deprecated API'],
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const [pattern, message] of deprecated) {
        if (pattern.test(lines[i])) {
          items.push(this.createItem(DebtCategory.DEPRECATED_API, 'Deprecated API', message, file, i + 1, i + 1, 'medium'));
          break;
        }
      }
    }
    return items;
  }

  private detectMissingDocs(file: string, lines: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/^export\s+(?:async\s+)?function\s+\w+/.test(lines[i]) || /^export\s+class\s+\w+/.test(lines[i]) || /^export\s+interface\s+\w+/.test(lines[i])) {
        const prev = i > 0 ? lines[i - 1].trim() : '';
        if (!prev.startsWith('/**') && !prev.startsWith('//') && !prev.startsWith('*/') && !prev.startsWith('*')) {
          const name = lines[i].match(/(?:function|class|interface)\s+(\w+)/)?.[1] || 'export';
          items.push(this.createItem(DebtCategory.MISSING_DOCS, `Missing docs: ${name}`, `Exported ${name} has no documentation`, file, i + 1, i + 1, 'low'));
        }
      }
    }
    return items;
  }

  private detectPerformanceIssues(file: string, lines: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    const content = lines.join('\n');

    // Sync I/O in async context
    for (let i = 0; i < lines.length; i++) {
      if (/\breadFileSync\b|\bwriteFileSync\b|\bexecSync\b/.test(lines[i])) {
        // Check if inside async function
        for (let j = i; j >= Math.max(0, i - 20); j--) {
          if (/async\s+/.test(lines[j])) {
            items.push(this.createItem(DebtCategory.PERFORMANCE, 'Sync I/O in async context', 'Using synchronous file/exec operation inside async function blocks the event loop', file, i + 1, i + 1, 'medium'));
            break;
          }
        }
      }
    }

    // console.log left in production code
    if (!file.includes('.test.') && !file.includes('.spec.') && !file.includes('__tests__')) {
      for (let i = 0; i < lines.length; i++) {
        if (/console\.(log|debug|info)\(/.test(lines[i]) && !lines[i].includes('//')) {
          items.push(this.createItem(DebtCategory.PERFORMANCE, 'Console.log in production', 'Consider using a proper logger or removing debug output', file, i + 1, i + 1, 'low'));
        }
      }
    }

    return items;
  }

  private detectWorkarounds(file: string, lines: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    const patterns = [/\bworkaround\b/i, /\btemporary\b/i, /\bshould be replaced\b/i, /\bquick fix\b/i, /\bdirty\b/i];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('//') || lines[i].includes('#') || lines[i].includes('*')) {
        for (const p of patterns) {
          if (p.test(lines[i])) {
            items.push(this.createItem(DebtCategory.WORKAROUND, 'Workaround detected', lines[i].trim().slice(0, 120), file, i + 1, i + 1, 'medium'));
            break;
          }
        }
      }
    }
    return items;
  }

  private detectInconsistency(file: string, lines: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    let tabs = 0, spaces = 0, singles = 0, doubles = 0;

    for (const line of lines) {
      if (line.startsWith('\t')) tabs++;
      if (line.match(/^ {2,}/)) spaces++;
      singles += (line.match(/'/g) || []).length;
      doubles += (line.match(/"/g) || []).length;
    }

    if (tabs > 5 && spaces > 5) {
      items.push(this.createItem(DebtCategory.INCONSISTENCY, 'Mixed indentation', `File uses both tabs (${tabs}) and spaces (${spaces}) for indentation`, file, 1, 1, 'low'));
    }

    return items;
  }

  private detectDeadCode(file: string, lines: string[]): DebtItem[] {
    const items: DebtItem[] = [];
    for (let i = 0; i < lines.length; i++) {
      // Commented-out code blocks (3+ consecutive commented lines that look like code)
      if (/^\s*\/\/\s*(?:const|let|var|function|class|import|return|if|for)\s/.test(lines[i])) {
        let count = 1;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          if (/^\s*\/\//.test(lines[j])) count++;
          else break;
        }
        if (count >= 3) {
          items.push(this.createItem(DebtCategory.DEAD_CODE, 'Commented-out code', `${count} lines of commented-out code — remove or restore`, file, i + 1, i + count, 'low'));
          i += count;
        }
      }
    }
    return items;
  }

  private createItem(type: DebtCategory, title: string, description: string, file: string, startLine: number, endLine: number, severity: DebtSeverity): DebtItem {
    return {
      id: crypto.createHash('md5').update(`${file}:${startLine}:${type}:${title}`).digest('hex').slice(0, 16),
      type, title, description, file, startLine, endLine, severity,
      estimatedEffort: severity === 'critical' ? 4 : severity === 'high' ? 2 : severity === 'medium' ? 1 : 0.5,
      detectedAt: new Date().toISOString(),
      status: 'open', tags: [], relatedItems: [],
    };
  }

  private deduplicate(items: DebtItem[]): DebtItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
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
        else if (SOURCE_EXTS.includes(path.extname(entry.name).toLowerCase())) results.push(full);
      }
    } catch { /* */ }
    return results;
  }
}
