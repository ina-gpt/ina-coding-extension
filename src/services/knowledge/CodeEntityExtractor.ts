/**
 * CodeEntityExtractor.ts — Phase 19 Step 19.4
 * Extract code entities (classes, functions, interfaces) from source files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CodeEntity, EntityType } from './KnowledgeTypes';
import { Logger } from '../../utils/Logger';

export class CodeEntityExtractor {
  private workspaceRoot: string;
  private cache = new Map<string, { mtime: number; entities: CodeEntity[] }>();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  extract(filePath: string): CodeEntity[] {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath);
    const relPath = path.relative(this.workspaceRoot, absPath);

    // Check cache
    try {
      const stat = fs.statSync(absPath);
      const cached = this.cache.get(relPath);
      if (cached && cached.mtime === stat.mtimeMs) return cached.entities;
    } catch { return []; }

    let content: string;
    try { content = fs.readFileSync(absPath, 'utf-8'); } catch { return []; }
    const lines = content.split('\n');
    const ext = path.extname(filePath).toLowerCase();
    let entities: CodeEntity[];

    if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
      entities = this.extractTypeScript(content, lines, relPath);
    } else if (ext === '.py') {
      entities = this.extractPython(content, lines, relPath);
    } else if (ext === '.go') {
      entities = this.extractGo(content, lines, relPath);
    } else {
      entities = [];
    }

    // File entity
    entities.unshift({
      id: this.makeId(relPath, 'file', relPath),
      type: 'file',
      name: path.basename(relPath),
      filePath: relPath,
      startLine: 1,
      endLine: lines.length,
      isExported: true,
    });

    // Cache
    try {
      const stat = fs.statSync(absPath);
      this.cache.set(relPath, { mtime: stat.mtimeMs, entities });
    } catch { /* */ }

    return entities;
  }

  extractAll(files: string[]): CodeEntity[] {
    const all: CodeEntity[] = [];
    for (const f of files) {
      all.push(...this.extract(f));
    }
    return all;
  }

  private extractTypeScript(content: string, lines: string[], file: string): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const patterns: [RegExp, EntityType][] = [
      [/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, 'class'],
      [/^(?:export\s+)?interface\s+(\w+)/gm, 'interface'],
      [/^(?:export\s+)?enum\s+(\w+)/gm, 'enum'],
      [/^(?:export\s+)?type\s+(\w+)\s*=/gm, 'type_alias'],
      [/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, 'function'],
      [/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/gm, 'function'],
      [/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*[^(]/gm, 'variable'],
    ];

    for (const [pattern, type] of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) continue;
        const startLine = content.slice(0, match.index).split('\n').length;
        const endLine = type === 'class' || type === 'interface' || type === 'enum'
          ? this.findBlockEnd(lines, startLine - 1)
          : (type === 'function' ? this.findBlockEnd(lines, startLine - 1) : startLine);
        const docstring = this.extractDocstring(lines, startLine - 2);
        const isExported = /export/.test(match[0]);
        const complexity = type === 'function' || type === 'method'
          ? this.computeComplexity(lines.slice(startLine - 1, endLine).join('\n'))
          : undefined;
        const signature = lines[startLine - 1]?.trim().replace(/\{?\s*$/, '').trim();

        entities.push({
          id: this.makeId(file, type, name),
          type, name, filePath: file, startLine, endLine,
          signature, docstring, complexity, isExported,
        });
      }
    }

    // Methods inside classes
    const methodPattern = /^\s+(?:(?:public|private|protected|static|async|readonly)\s+)*(\w+)\s*\([^)]*\)/gm;
    let m;
    while ((m = methodPattern.exec(content)) !== null) {
      const name = m[1];
      if (['constructor', 'if', 'for', 'while', 'switch'].includes(name)) continue;
      const startLine = content.slice(0, m.index).split('\n').length;
      entities.push({
        id: this.makeId(file, 'method', name + ':' + startLine),
        type: 'method', name, filePath: file,
        startLine, endLine: this.findBlockEnd(lines, startLine - 1),
        complexity: this.computeComplexity(lines.slice(startLine - 1, Math.min(startLine + 30, lines.length)).join('\n')),
      });
    }

    return entities;
  }

  private extractPython(content: string, lines: string[], file: string): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const classPattern = /^class\s+(\w+)/gm;
    const funcPattern = /^(?:async\s+)?def\s+(\w+)/gm;

    let m;
    while ((m = classPattern.exec(content)) !== null) {
      const startLine = content.slice(0, m.index).split('\n').length;
      entities.push({
        id: this.makeId(file, 'class', m[1]),
        type: 'class', name: m[1], filePath: file,
        startLine, endLine: this.findPythonBlockEnd(lines, startLine - 1),
        docstring: this.extractPythonDocstring(lines, startLine),
      });
    }
    while ((m = funcPattern.exec(content)) !== null) {
      const name = m[1];
      if (name.startsWith('_') && name !== '__init__') continue;
      const startLine = content.slice(0, m.index).split('\n').length;
      entities.push({
        id: this.makeId(file, 'function', name),
        type: 'function', name, filePath: file,
        startLine, endLine: this.findPythonBlockEnd(lines, startLine - 1),
        complexity: this.computeComplexity(lines.slice(startLine - 1, startLine + 20).join('\n')),
      });
    }
    return entities;
  }

  private extractGo(content: string, lines: string[], file: string): CodeEntity[] {
    const entities: CodeEntity[] = [];
    const funcPattern = /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/gm;
    const typePattern = /^type\s+(\w+)\s+(struct|interface)/gm;

    let m;
    while ((m = typePattern.exec(content)) !== null) {
      const startLine = content.slice(0, m.index).split('\n').length;
      entities.push({
        id: this.makeId(file, m[2] === 'interface' ? 'interface' : 'class', m[1]),
        type: m[2] === 'interface' ? 'interface' : 'class', name: m[1], filePath: file,
        startLine, endLine: this.findBlockEnd(lines, startLine - 1),
        isExported: m[1][0] === m[1][0].toUpperCase(),
      });
    }
    while ((m = funcPattern.exec(content)) !== null) {
      const startLine = content.slice(0, m.index).split('\n').length;
      entities.push({
        id: this.makeId(file, 'function', m[1]),
        type: 'function', name: m[1], filePath: file,
        startLine, endLine: this.findBlockEnd(lines, startLine - 1),
        isExported: m[1][0] === m[1][0].toUpperCase(),
        complexity: this.computeComplexity(lines.slice(startLine - 1, startLine + 20).join('\n')),
      });
    }
    return entities;
  }

  private findBlockEnd(lines: string[], startIdx: number): number {
    let depth = 0, started = false;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
        if (started && depth === 0) return i + 1;
      }
    }
    return Math.min(startIdx + 50, lines.length);
  }

  private findPythonBlockEnd(lines: string[], startIdx: number): number {
    const indent = lines[startIdx]?.match(/^(\s*)/)?.[1]?.length || 0;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      if ((lines[i].match(/^(\s*)/)?.[1]?.length || 0) <= indent) return i;
    }
    return lines.length;
  }

  private extractDocstring(lines: string[], lineIdx: number): string | undefined {
    if (lineIdx < 0) return undefined;
    const line = lines[lineIdx]?.trim();
    if (line?.startsWith('/**') || line?.startsWith('///') || line?.startsWith('//')) {
      const comments: string[] = [];
      for (let i = lineIdx; i >= Math.max(0, lineIdx - 10); i--) {
        const l = lines[i]?.trim();
        if (l?.startsWith('*') || l?.startsWith('//') || l?.startsWith('/**')) {
          comments.unshift(l.replace(/^\*\s*|^\/\/\s*|^\/\*\*\s*|\*\/$/g, '').trim());
        } else break;
      }
      return comments.filter(Boolean).join(' ').slice(0, 300) || undefined;
    }
    return undefined;
  }

  private extractPythonDocstring(lines: string[], startLine: number): string | undefined {
    const nextLine = lines[startLine]?.trim();
    if (nextLine?.startsWith('"""') || nextLine?.startsWith("'''")) {
      const quote = nextLine.slice(0, 3);
      if (nextLine.endsWith(quote) && nextLine.length > 6) return nextLine.slice(3, -3);
      const parts: string[] = [nextLine.slice(3)];
      for (let i = startLine + 1; i < Math.min(startLine + 10, lines.length); i++) {
        if (lines[i].includes(quote)) { parts.push(lines[i].replace(quote, '')); break; }
        parts.push(lines[i].trim());
      }
      return parts.filter(Boolean).join(' ').slice(0, 300) || undefined;
    }
    return undefined;
  }

  private computeComplexity(code: string): number {
    const branches = [/\bif\s*\(/g, /\belse\b/g, /\bcase\s/g, /\bcatch\s/g, /\?\s/g, /\|\|/g, /&&/g];
    let complexity = 1;
    for (const p of branches) { complexity += (code.match(p) || []).length; }
    return complexity;
  }

  private makeId(file: string, type: string, name: string): string {
    return crypto.createHash('md5').update(`${file}:${type}:${name}`).digest('hex').slice(0, 16);
  }

  clearCache(): void { this.cache.clear(); }
}
