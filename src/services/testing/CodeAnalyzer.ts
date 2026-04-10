/**
 * CodeAnalyzer.ts — Phase 19 Step 19.2
 * Analyzes functions for test generation: params, types, side effects, complexity
 */

import * as fs from 'fs';
import * as path from 'path';
import { FunctionAnalysis } from './TestGenTypes';
import { Logger } from '../../utils/Logger';

export class CodeAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  analyzeFile(filePath: string): FunctionAnalysis[] {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath);
    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(this.workspaceRoot, absPath);
    const ext = path.extname(filePath);

    if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
      return this.analyzeJavaScriptFile(content, lines, relativePath);
    }
    if (ext === '.py') {
      return this.analyzePythonFile(content, lines, relativePath);
    }
    if (ext === '.go') {
      return this.analyzeGoFile(content, lines, relativePath);
    }

    return this.analyzeGenericFile(content, lines, relativePath);
  }

  analyzeFunction(filePath: string, functionName: string): FunctionAnalysis | null {
    const functions = this.analyzeFile(filePath);
    return functions.find(f => f.name === functionName) || null;
  }

  private analyzeJavaScriptFile(content: string, lines: string[], file: string): FunctionAnalysis[] {
    const results: FunctionAnalysis[] = [];

    // Match: export function, export const fn =, function, const fn =, class methods
    const patterns = [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/gm,
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=]+))?\s*=>/gm,
      /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*\{/gm,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) continue;

        const startLine = content.slice(0, match.index).split('\n').length;
        const endLine = this.findBlockEnd(lines, startLine - 1);
        const code = lines.slice(startLine - 1, endLine).join('\n');
        const params = this.parseParams(match[2]);
        const returnType = match[3]?.trim();
        const isAsync = /async/.test(match[0]);
        const isExported = /export/.test(match[0]);

        results.push({
          name,
          file,
          startLine,
          endLine,
          code,
          params,
          returnType,
          isAsync,
          isExported,
          sideEffects: this.detectSideEffects(code),
          dependencies: this.extractImportsUsed(content, code),
          branches: this.countBranches(code),
          complexity: this.approximateComplexity(code),
        });
      }
    }

    return results;
  }

  private analyzePythonFile(content: string, lines: string[], file: string): FunctionAnalysis[] {
    const results: FunctionAnalysis[] = [];
    const pattern = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\S+))?\s*:/gm;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (name.startsWith('_') && name !== '__init__') continue;

      const startLine = content.slice(0, match.index).split('\n').length;
      const endLine = this.findPythonBlockEnd(lines, startLine - 1);
      const code = lines.slice(startLine - 1, endLine).join('\n');

      results.push({
        name, file, startLine, endLine, code,
        params: this.parseParams(match[2]),
        returnType: match[3],
        isAsync: /async/.test(match[0]),
        isExported: !name.startsWith('_'),
        sideEffects: this.detectSideEffects(code),
        dependencies: [],
        branches: this.countBranches(code),
        complexity: this.approximateComplexity(code),
      });
    }

    return results;
  }

  private analyzeGoFile(content: string, lines: string[], file: string): FunctionAnalysis[] {
    const results: FunctionAnalysis[] = [];
    const pattern = /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]*)\)\s*(?:\(([^)]*)\)|(\w+))?\s*\{/gm;

    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.slice(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, startLine - 1);
      const code = lines.slice(startLine - 1, endLine).join('\n');

      results.push({
        name, file, startLine, endLine, code,
        params: this.parseParams(match[2]),
        returnType: match[3] || match[4],
        isAsync: false,
        isExported: name[0] === name[0].toUpperCase(),
        sideEffects: this.detectSideEffects(code),
        dependencies: [],
        branches: this.countBranches(code),
        complexity: this.approximateComplexity(code),
      });
    }

    return results;
  }

  private analyzeGenericFile(content: string, lines: string[], file: string): FunctionAnalysis[] {
    // Minimal generic extraction
    const results: FunctionAnalysis[] = [];
    const pattern = /(?:function|def|func|fn)\s+(\w+)\s*\(([^)]*)\)/gm;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const startLine = content.slice(0, match.index).split('\n').length;
      results.push({
        name: match[1], file, startLine, endLine: startLine + 10,
        code: lines.slice(startLine - 1, startLine + 10).join('\n'),
        params: this.parseParams(match[2]), isAsync: false, isExported: true,
        sideEffects: [], dependencies: [], branches: 1, complexity: 1,
      });
    }
    return results;
  }

  private parseParams(raw: string): { name: string; type?: string }[] {
    if (!raw.trim()) return [];
    return raw.split(',').map(p => {
      const parts = p.trim().replace(/\s*=\s*.*$/, '').split(/:\s*/);
      return { name: parts[0].replace(/^\.{3}/, '').trim(), type: parts[1]?.trim() };
    }).filter(p => p.name && p.name !== 'self' && p.name !== 'cls');
  }

  private findBlockEnd(lines: string[], startIdx: number): number {
    let depth = 0;
    let started = false;
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
      const line = lines[i];
      if (line.trim() === '') continue;
      const currentIndent = line.match(/^(\s*)/)?.[1]?.length || 0;
      if (currentIndent <= indent) return i;
    }
    return lines.length;
  }

  private detectSideEffects(code: string): string[] {
    const effects: string[] = [];
    if (/\bfs\b|readFile|writeFile|readdir|mkdir|unlink/.test(code)) effects.push('file_io');
    if (/\bfetch\b|axios|http\.|request\(|\.get\(|\.post\(/.test(code)) effects.push('network');
    if (/\bquery\b|\.execute|\.findOne|\.save|\.create|\.delete|\.update/.test(code)) effects.push('database');
    if (/console\.|logger\.|Logger\./.test(code)) effects.push('logging');
    if (/process\.exit|process\.env/.test(code)) effects.push('process');
    return effects;
  }

  private extractImportsUsed(fileContent: string, functionCode: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRegex.exec(fileContent)) !== null) {
      const moduleName = m[1];
      // Check if the imported module's identifiers are used in the function
      const importedNames = m[0].match(/\{([^}]+)\}/)?.[1]?.split(',').map(s => s.trim().split(/\s+as\s+/).pop()!) || [];
      for (const name of importedNames) {
        if (name && functionCode.includes(name)) {
          imports.push(moduleName);
          break;
        }
      }
    }
    return [...new Set(imports)];
  }

  private countBranches(code: string): number {
    const branchPatterns = [/\bif\s*\(/g, /\belse\b/g, /\bcase\s/g, /\?\s/g, /\|\|/g, /&&/g, /\bcatch\s*\(/g];
    let count = 1;
    for (const p of branchPatterns) {
      const matches = code.match(p);
      if (matches) count += matches.length;
    }
    return count;
  }

  private approximateComplexity(code: string): number {
    return this.countBranches(code) + (code.split('\n').length > 30 ? 2 : 0);
  }
}
