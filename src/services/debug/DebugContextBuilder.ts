/**
 * DebugContextBuilder.ts — Phase 19 Step 19.1
 * Builds rich context around parsed errors for AI analysis
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ParsedError, DebugContext, DebugConfig, DEFAULT_DEBUG_CONFIG } from './DebugTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export class DebugContextBuilder {
  private workspaceRoot: string;
  private config: DebugConfig;

  constructor(workspaceRoot: string, config?: Partial<DebugConfig>) {
    this.workspaceRoot = workspaceRoot;
    this.config = { ...DEFAULT_DEBUG_CONFIG, ...config };
  }

  async build(error: ParsedError): Promise<DebugContext> {
    const surroundingCode = new Map<string, { code: string; startLine: number; endLine: number }>();
    const gitBlame = new Map<string, { line: number; author: string; date: string; commit: string }[]>();

    const userFrames = error.stackFrames
      .filter(f => f.isUserCode)
      .slice(0, this.config.maxFrameDepth);

    let tokenBudgetRemaining = this.config.tokenBudget;

    for (let i = 0; i < userFrames.length; i++) {
      const frame = userFrames[i];
      const absPath = path.isAbsolute(frame.file) ? frame.file : path.join(this.workspaceRoot, frame.file);

      // Read surrounding code — more context for innermost frames
      const contextLines = i === 0 ? 20 : 10;
      const code = await this.readSurroundingCode(absPath, frame.line, contextLines);
      if (code) {
        const estimatedTokens = Math.ceil(code.code.length / 4);
        if (estimatedTokens < tokenBudgetRemaining) {
          surroundingCode.set(`${frame.file}:${frame.line}`, code);
          tokenBudgetRemaining -= estimatedTokens;
        }
      }

      // Git blame
      if (this.config.includeGitBlame) {
        const blame = await this.getGitBlame(absPath, frame.line, i === 0 ? 10 : 5);
        if (blame.length > 0) {
          gitBlame.set(`${frame.file}:${frame.line}`, blame);
        }
      }
    }

    // Recent changes
    let recentChanges = '';
    if (this.config.includeRecentChanges) {
      recentChanges = await this.getRecentChanges(userFrames.map(f => f.file));
    }

    // Project context
    const projectContext = await this.getProjectContext();

    return { error, surroundingCode, gitBlame, recentChanges, projectContext };
  }

  private async readSurroundingCode(filePath: string, line: number, contextLines: number): Promise<{ code: string; startLine: number; endLine: number } | null> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const startLine = Math.max(1, line - contextLines);
      const endLine = Math.min(lines.length, line + contextLines);
      const code = lines.slice(startLine - 1, endLine)
        .map((l, i) => {
          const lineNum = startLine + i;
          const marker = lineNum === line ? ' >>>' : '    ';
          return `${marker} ${lineNum}: ${l}`;
        })
        .join('\n');
      return { code, startLine, endLine };
    } catch {
      return null;
    }
  }

  private async getGitBlame(filePath: string, centerLine: number, range: number): Promise<{ line: number; author: string; date: string; commit: string }[]> {
    try {
      const start = Math.max(1, centerLine - range);
      const end = centerLine + range;
      const { stdout } = await execAsync(
        `git blame -L ${start},${end} --porcelain "${filePath}" 2>/dev/null`,
        { cwd: this.workspaceRoot, timeout: 5000 }
      );
      const results: { line: number; author: string; date: string; commit: string }[] = [];
      const commits = stdout.split(/^([0-9a-f]{40})/gm);
      let currentLine = start;
      for (let i = 1; i < commits.length; i += 2) {
        const hash = commits[i];
        const block = commits[i + 1] || '';
        const authorMatch = block.match(/^author (.+)$/m);
        const dateMatch = block.match(/^author-time (\d+)$/m);
        if (authorMatch) {
          results.push({
            line: currentLine,
            author: authorMatch[1],
            date: dateMatch ? new Date(parseInt(dateMatch[1], 10) * 1000).toISOString().split('T')[0] : '',
            commit: hash.substring(0, 8),
          });
        }
        currentLine++;
      }
      return results;
    } catch {
      return [];
    }
  }

  private async getRecentChanges(files: string[]): Promise<string> {
    try {
      const fileArgs = files.map(f => `"${f}"`).join(' ');
      const { stdout } = await execAsync(
        `git diff HEAD~3 -- ${fileArgs} 2>/dev/null | head -500`,
        { cwd: this.workspaceRoot, timeout: 5000 }
      );
      return stdout.slice(0, 4000);
    } catch {
      return '';
    }
  }

  private async getProjectContext(): Promise<{ dependencies?: Record<string, string>; tsConfig?: any }> {
    const result: { dependencies?: Record<string, string>; tsConfig?: any } = {};
    try {
      const pkgPath = path.join(this.workspaceRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        result.dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
      }
    } catch { /* */ }
    try {
      const tscPath = path.join(this.workspaceRoot, 'tsconfig.json');
      if (fs.existsSync(tscPath)) {
        const tsc = JSON.parse(fs.readFileSync(tscPath, 'utf-8'));
        result.tsConfig = { compilerOptions: tsc.compilerOptions };
      }
    } catch { /* */ }
    return result;
  }
}
