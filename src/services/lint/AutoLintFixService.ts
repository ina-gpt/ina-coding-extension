/**
 * AutoLintFixService.ts — Phase 23 Feature 3
 * Iterate: run linter → send errors to LLM → apply fix → repeat until clean
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

const execAsync = promisify(exec);

interface LintError {
  file: string;
  line: number;
  column: number;
  message: string;
  ruleId: string;
  severity: string;
}

interface LinterConfig {
  name: string;
  command: string;
  parseOutput: (output: string) => LintError[];
}

export interface LintFixEvent {
  type: 'iteration' | 'fixing' | 'clean' | 'max-reached' | 'error';
  iteration: number;
  errorCount: number;
  message: string;
  errors?: LintError[];
}

export class AutoLintFixService {
  private workspaceRoot: string;
  private apiEndpoint: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
  }

  async *iterateUntilClean(file: string, maxIterations: number = 3, authHeaders: Record<string, string> = {}): AsyncGenerator<LintFixEvent> {
    const linter = await this.detectLinter();
    if (linter.name === 'none') {
      yield { type: 'error', iteration: 0, errorCount: 0, message: 'No linter detected' };
      return;
    }

    let prevErrorHash = '';

    for (let i = 1; i <= maxIterations; i++) {
      yield { type: 'iteration', iteration: i, errorCount: -1, message: `Lint iteration ${i}/${maxIterations}...` };

      const errors = await this.runLinter(linter, file);
      if (errors.length === 0) {
        yield { type: 'clean', iteration: i, errorCount: 0, message: 'No lint errors! Code is clean.' };
        return;
      }

      // Check for same errors repeating (avoid infinite loop)
      const errorHash = errors.map(e => `${e.line}:${e.ruleId}`).join(',');
      if (errorHash === prevErrorHash) {
        yield { type: 'max-reached', iteration: i, errorCount: errors.length, message: `Same ${errors.length} errors persist. Stopping.`, errors };
        return;
      }
      prevErrorHash = errorHash;

      yield { type: 'fixing', iteration: i, errorCount: errors.length, message: `Found ${errors.length} error(s). Asking INA-7 Pro to fix...`, errors };

      // Send to LLM for fixing
      const fixed = await this.requestFix(file, errors, authHeaders);
      if (fixed) {
        const absPath = path.isAbsolute(file) ? file : path.join(this.workspaceRoot, file);
        fs.writeFileSync(absPath, fixed, 'utf-8');
      }
    }

    yield { type: 'max-reached', iteration: maxIterations, errorCount: -1, message: `Max iterations (${maxIterations}) reached.` };
  }

  private async detectLinter(): Promise<LinterConfig> {
    const checks: [string, LinterConfig][] = [
      ['.eslintrc.js', { name: 'eslint', command: 'npx eslint --format json', parseOutput: this.parseESLint }],
      ['.eslintrc.json', { name: 'eslint', command: 'npx eslint --format json', parseOutput: this.parseESLint }],
      ['eslint.config.js', { name: 'eslint', command: 'npx eslint --format json', parseOutput: this.parseESLint }],
      ['eslint.config.mjs', { name: 'eslint', command: 'npx eslint --format json', parseOutput: this.parseESLint }],
    ];

    for (const [configFile, config] of checks) {
      if (fs.existsSync(path.join(this.workspaceRoot, configFile))) return config;
    }

    // Check package.json for eslint config
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.workspaceRoot, 'package.json'), 'utf-8'));
      if (pkg.eslintConfig || pkg.devDependencies?.eslint) {
        return { name: 'eslint', command: 'npx eslint --format json', parseOutput: this.parseESLint };
      }
    } catch { /* */ }

    return { name: 'none', command: '', parseOutput: () => [] };
  }

  private async runLinter(linter: LinterConfig, file: string): Promise<LintError[]> {
    try {
      const { stdout } = await execAsync(`${linter.command} "${file}" 2>/dev/null`, { cwd: this.workspaceRoot, timeout: 30000 });
      return linter.parseOutput(stdout);
    } catch (e: any) {
      // ESLint exits with code 1 when there are errors
      if (e.stdout) return linter.parseOutput(e.stdout);
      return [];
    }
  }

  private parseESLint(output: string): LintError[] {
    try {
      const data = JSON.parse(output);
      const errors: LintError[] = [];
      for (const file of data) {
        for (const msg of file.messages || []) {
          errors.push({
            file: file.filePath || '',
            line: msg.line || 1,
            column: msg.column || 1,
            message: msg.message || '',
            ruleId: msg.ruleId || '',
            severity: msg.severity === 2 ? 'error' : 'warning',
          });
        }
      }
      return errors;
    } catch {
      return [];
    }
  }

  private async requestFix(file: string, errors: LintError[], authHeaders: Record<string, string>): Promise<string | null> {
    const absPath = path.isAbsolute(file) ? file : path.join(this.workspaceRoot, file);
    let code: string;
    try { code = fs.readFileSync(absPath, 'utf-8'); } catch { return null; }

    const errorList = errors.map(e => `Line ${e.line}: [${e.ruleId}] ${e.message}`).join('\n');
    const prompt = `Fix these lint errors in this file. Return ONLY the complete fixed file content, no explanation.\n\nErrors:\n${errorList}\n\nCurrent code:\n\`\`\`\n${code}\n\`\`\``;

    try {
      const resp = await fetch(`${this.apiEndpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], stream: false }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const text = data.message?.content || data.content || '';
      const codeMatch = text.match(/```(?:\w+)?\n([\s\S]+?)```/);
      return codeMatch ? codeMatch[1] : (text.includes('\n') ? text : null);
    } catch {
      return null;
    }
  }
}
