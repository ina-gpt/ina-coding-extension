/**
 * SyntaxVerifier.ts
 * Phase 18.2 — Runs a compile/lint pass against changed files
 *
 * Supports:
 *   - TypeScript: `tsc --noEmit` on a tmp file
 *   - JavaScript: basic pattern checks
 *   - Python / Go / Rust: pattern checks (compile-free)
 *
 * Additionally flags common patterns that are technically valid but
 * problematic: unused imports, unreachable code, any-typed variables.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { VerificationResult } from './VerifierTypes';
import { Logger } from '../../../utils/Logger';

// ============================================================

export class SyntaxVerifier {
  private static instance: SyntaxVerifier;

  private constructor() {}

  static getInstance(): SyntaxVerifier {
    if (!SyntaxVerifier.instance) {
      SyntaxVerifier.instance = new SyntaxVerifier();
    }
    return SyntaxVerifier.instance;
  }

  /**
   * Verify a single file's syntax. Uses the language to pick the best
   * strategy — only TypeScript currently compiles; the rest rely on
   * pattern heuristics.
   */
  async verify(
    code: string,
    filePath: string,
    language: string
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const lang = language.toLowerCase();

    // TypeScript / TSX: actually compile
    if (lang === 'typescript' || lang === 'tsx' || lang === 'ts') {
      const tscResults = await this.runTsc(code, filePath);
      results.push(...tscResults);
    } else if (lang === 'javascript' || lang === 'jsx' || lang === 'js') {
      // Use `node --check` for JS
      const nodeResults = await this.runNodeCheck(code, filePath);
      results.push(...nodeResults);
    }

    // Pattern checks (all languages)
    results.push(...this.checkPatterns(code, filePath, lang));

    return results;
  }

  // ============================================================
  // tsc --noEmit
  // ============================================================

  private async runTsc(code: string, filePath: string): Promise<VerificationResult[]> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ina-syntax-'));
    const tmpFile = path.join(tmpDir, path.basename(filePath).replace(/\.tsx?$/, '.ts'));
    try {
      fs.writeFileSync(tmpFile, code, 'utf8');
      const { stdout, stderr, exitCode } = await this.runCommand(
        'npx',
        [
          '--no-install',
          'tsc',
          '--noEmit',
          '--target',
          'es2020',
          '--module',
          'commonjs',
          '--strict',
          '--skipLibCheck',
          '--allowJs',
          '--esModuleInterop',
          tmpFile,
        ],
        tmpDir,
        30_000
      );

      if (exitCode === 0) {
        return [
          {
            status: 'pass',
            category: 'syntax',
            severity: 'info',
            message: 'TypeScript compile passed',
            file: filePath,
            line: 0,
            verifier: 'syntax',
          },
        ];
      }

      const output = (stdout + '\n' + stderr).trim();
      return this.parseTscOutput(output, filePath, tmpFile);
    } catch (e: any) {
      Logger.warn(`[SyntaxVerifier] tsc failed: ${String(e)}`);
      return [
        {
          status: 'info',
          category: 'syntax',
          severity: 'info',
          message: `tsc unavailable: ${e?.message ?? String(e)}`,
          file: filePath,
          line: 0,
          verifier: 'syntax',
        },
      ];
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Parse tsc output of the form:
   *   /tmp/x.ts(12,5): error TS2304: Cannot find name 'foo'.
   */
  private parseTscOutput(output: string, filePath: string, tmpFile: string): VerificationResult[] {
    const results: VerificationResult[] = [];
    const re = /(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(output)) !== null) {
      const [, , lineStr, colStr, kind, ruleId, message] = match;
      results.push({
        status: 'fail',
        category: 'syntax',
        severity: kind === 'error' ? 'high' : 'medium',
        message: message.trim(),
        file: filePath,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        verifier: 'syntax',
        ruleId,
      });
    }
    // If no structured errors but exitCode was non-zero, emit a generic failure
    if (results.length === 0 && output.length > 0) {
      results.push({
        status: 'fail',
        category: 'syntax',
        severity: 'high',
        message: output.substring(0, 300),
        file: filePath,
        line: 0,
        verifier: 'syntax',
      });
    }
    return results;
  }

  // ============================================================
  // node --check (JS)
  // ============================================================

  private async runNodeCheck(code: string, filePath: string): Promise<VerificationResult[]> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ina-syntax-'));
    const tmpFile = path.join(tmpDir, path.basename(filePath).replace(/\.jsx?$/, '.js'));
    try {
      fs.writeFileSync(tmpFile, code, 'utf8');
      const { stderr, exitCode } = await this.runCommand('node', ['--check', tmpFile], tmpDir, 15_000);
      if (exitCode === 0) {
        return [
          {
            status: 'pass',
            category: 'syntax',
            severity: 'info',
            message: 'node --check passed',
            file: filePath,
            line: 0,
            verifier: 'syntax',
          },
        ];
      }
      // Parse "SyntaxError: foo at /tmp/x.js:12"
      const match = stderr.match(/:(\d+)$/m);
      return [
        {
          status: 'fail',
          category: 'syntax',
          severity: 'high',
          message: stderr.split('\n').slice(0, 3).join(' ').substring(0, 300),
          file: filePath,
          line: match ? parseInt(match[1], 10) : 0,
          verifier: 'syntax',
        },
      ];
    } catch (e: any) {
      return [
        {
          status: 'info',
          category: 'syntax',
          severity: 'info',
          message: `node --check unavailable: ${e?.message ?? String(e)}`,
          file: filePath,
          line: 0,
          verifier: 'syntax',
        },
      ];
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* noop */
      }
    }
  }

  // ============================================================
  // Pattern checks (cross-language)
  // ============================================================

  private checkPatterns(code: string, filePath: string, language: string): VerificationResult[] {
    const results: VerificationResult[] = [];
    const lines = code.split('\n');

    // Check 1: any-typed variables (TS/TSX only)
    if (language.includes('ts')) {
      lines.forEach((line, i) => {
        if (/:\s*any\b/.test(line) && !/\beslint-disable\b/.test(line)) {
          results.push({
            status: 'warning',
            category: 'syntax',
            severity: 'low',
            message: 'Usage of `any` type — consider a more specific type',
            file: filePath,
            line: i + 1,
            verifier: 'syntax',
            ruleId: 'no-any',
          });
        }
      });
    }

    // Check 2: unreachable code after return/throw
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (/^\s*(return|throw)\b/.test(trimmed)) {
        // Look ahead for non-closing-brace content at the same indentation
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const next = lines[j];
          if (!next.trim()) continue;
          if (next.trim() === '}') break;
          const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
          if (nextIndent >= indent && !/^\s*(\}|\/\/|\/\*)/.test(next)) {
            results.push({
              status: 'warning',
              category: 'syntax',
              severity: 'medium',
              message: 'Possible unreachable code after return/throw',
              file: filePath,
              line: j + 1,
              verifier: 'syntax',
              ruleId: 'unreachable',
            });
            break;
          }
        }
      }
    });

    // Check 3: unused imports (TS/JS heuristic)
    if (language.includes('ts') || language.includes('js')) {
      const importRe = /^import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/;
      lines.forEach((line, i) => {
        const m = line.match(importRe);
        if (!m) return;
        const named = m[1] ? m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim()) : [];
        const defaultName = m[2];
        const imports = [...named, ...(defaultName ? [defaultName] : [])].filter(Boolean);
        for (const name of imports) {
          if (!name) continue;
          // Count occurrences outside the import line
          const body = lines.slice(0, i).concat(lines.slice(i + 1)).join('\n');
          const re = new RegExp(`\\b${name}\\b`);
          if (!re.test(body)) {
            results.push({
              status: 'warning',
              category: 'syntax',
              severity: 'low',
              message: `Unused import: ${name}`,
              file: filePath,
              line: i + 1,
              verifier: 'syntax',
              ruleId: 'unused-import',
            });
          }
        }
      });
    }

    return results;
  }

  // ============================================================
  // Command runner
  // ============================================================

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, { cwd, shell: false });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGTERM');
        } catch {
          /* noop */
        }
      }, timeoutMs);

      proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: stderr || err.message, exitCode: -1 });
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
  }
}
