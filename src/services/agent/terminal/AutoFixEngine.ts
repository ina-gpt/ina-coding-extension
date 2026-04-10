import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  AutoFixRequest,
  AutoFixResult,
  AutoFixStrategy,
  ParsedError,
  TerminalExecutionStatus,
} from './TerminalTypes';
import { CommandExecutor } from './CommandExecutor';
import { OutputParser } from './OutputParser';
import { FileOpsExecutor } from '../fileops/FileOpsExecutor';
import { ApiService, ChatMessage } from '../../ApiService';
import { Logger } from '../../../utils/Logger';
import { ConfigManager } from '../../../utils/ConfigManager';

// ============ Fix Types ============

interface FileFix {
  filePath: string;
  startLine: number;
  endLine: number;
  replacement: string;
}

export type AutoFixEvent =
  | 'fix-start'
  | 'fix-attempt'
  | 'fix-applied'
  | 'fix-verified'
  | 'fix-failed'
  | 'fix-complete';

// ============ AutoFixEngine ============

export class AutoFixEngine extends EventEmitter {
  private static instance: AutoFixEngine;
  private commandExecutor: CommandExecutor;
  private outputParser: OutputParser;
  private fileOpsExecutor: FileOpsExecutor;
  private apiService: ApiService | null = null;
  private isRunning = false;

  private constructor() {
    super();
    this.commandExecutor = CommandExecutor.getInstance();
    this.outputParser = OutputParser.getInstance();
    this.fileOpsExecutor = FileOpsExecutor.getInstance();
  }

  static getInstance(): AutoFixEngine {
    if (!AutoFixEngine.instance) {
      AutoFixEngine.instance = new AutoFixEngine();
    }
    return AutoFixEngine.instance;
  }

  setApiService(api: ApiService): void {
    this.apiService = api;
  }

  // ---- Main Entry Point ----

  async attemptAutoFix(request: AutoFixRequest, workspaceRoot: string): Promise<AutoFixResult> {
    if (this.isRunning) {
      throw new Error('Auto-fix already in progress');
    }

    this.isRunning = true;
    this.emit('fix-start', { errorCount: request.errors.length, strategy: request.strategy });

    const result: AutoFixResult = {
      fixed: [],
      remaining: [...request.errors],
      filesModified: [],
      attempts: 0,
      success: false,
    };

    try {
      const maxAttempts = Math.min(request.maxAttempts, 5);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (result.remaining.length === 0) break;

        result.attempts = attempt;
        this.emit('fix-attempt', { attempt, remaining: result.remaining.length });
        Logger.info(`[AutoFixEngine] Attempt ${attempt}/${maxAttempts}, ${result.remaining.length} errors remaining`);

        let fixedInAttempt: ParsedError[] = [];

        // Route to specialized fixers based on error source
        const errorsBySource = this.groupErrorsBySource(result.remaining);

        for (const [source, errors] of errorsBySource.entries()) {
          try {
            let fixed: ParsedError[] = [];
            switch (source) {
              case 'tsc':
                fixed = await this.fixTypeScriptErrors(errors, workspaceRoot);
                break;
              case 'eslint':
                fixed = await this.fixESLintErrors(errors, workspaceRoot);
                break;
              case 'jest':
              case 'vitest':
              case 'mocha':
                fixed = await this.fixTestFailures(errors, workspaceRoot);
                break;
              case 'webpack':
              case 'nextjs':
                fixed = await this.fixBuildErrors(errors, workspaceRoot);
                break;
              default:
                fixed = await this.fixGenericErrors(errors, workspaceRoot);
                break;
            }
            fixedInAttempt.push(...fixed);
          } catch (err) {
            Logger.warn(`[AutoFixEngine] Error fixing ${source} errors:`, err);
          }
        }

        // Update result
        for (const fixedErr of fixedInAttempt) {
          const idx = result.remaining.findIndex(
            e => e.message === fixedErr.message && e.file === fixedErr.file && e.line === fixedErr.line
          );
          if (idx !== -1) {
            result.remaining.splice(idx, 1);
            result.fixed.push(fixedErr);
          }
        }

        // If no progress was made, stop
        if (fixedInAttempt.length === 0) {
          Logger.info('[AutoFixEngine] No progress made, stopping');
          break;
        }
      }

      result.success = result.remaining.length === 0;
      result.filesModified = [...new Set(result.fixed.filter(e => e.file).map(e => e.file!))];

      this.emit('fix-complete', {
        fixed: result.fixed.length,
        remaining: result.remaining.length,
        success: result.success,
      });

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  // ---- Specialized Fixers ----

  async fixTypeScriptErrors(errors: ParsedError[], workspaceRoot: string): Promise<ParsedError[]> {
    const fixed: ParsedError[] = [];

    // Group errors by type for batch handling
    const moduleNotFound = errors.filter(e => e.code === 'TS2307');
    const nameNotFound = errors.filter(e => e.code === 'TS2304');
    const otherErrors = errors.filter(e => e.code !== 'TS2307' && e.code !== 'TS2304');

    // TS2307: Module not found -> npm install
    for (const err of moduleNotFound) {
      const moduleMatch = /Cannot find module '([^']+)'/.exec(err.message);
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
          try {
            const pkgName = moduleName.startsWith('@')
              ? moduleName.split('/').slice(0, 2).join('/')
              : moduleName.split('/')[0];
            await this.commandExecutor.executeRaw(`npm install ${pkgName}`, workspaceRoot);
            fixed.push(err);
          } catch {
            Logger.debug(`[AutoFixEngine] Failed to install ${moduleName}`);
          }
        }
      }
    }

    // TS2304: Name not found -> attempt import addition via LLM
    if (nameNotFound.length > 0) {
      const llmFixed = await this.fixViaLLM(nameNotFound, workspaceRoot);
      fixed.push(...llmFixed);
    }

    // Other TS errors -> LLM
    if (otherErrors.length > 0) {
      const llmFixed = await this.fixViaLLM(otherErrors, workspaceRoot);
      fixed.push(...llmFixed);
    }

    return fixed;
  }

  async fixESLintErrors(errors: ParsedError[], workspaceRoot: string): Promise<ParsedError[]> {
    const fixed: ParsedError[] = [];
    const fixableErrors = errors.filter(e => e.fixable);
    const nonFixableErrors = errors.filter(e => !e.fixable);

    // Run eslint --fix for fixable rules
    if (fixableErrors.length > 0) {
      const files = [...new Set(fixableErrors.filter(e => e.file).map(e => e.file!))];
      for (const file of files) {
        try {
          await this.commandExecutor.executeRaw(`npx eslint --fix "${file}"`, workspaceRoot);
          const fileErrors = fixableErrors.filter(e => e.file === file);
          fixed.push(...fileErrors);
        } catch {
          Logger.debug(`[AutoFixEngine] eslint --fix failed for ${file}`);
        }
      }
    }

    // Use LLM for non-fixable errors
    if (nonFixableErrors.length > 0) {
      const llmFixed = await this.fixViaLLM(nonFixableErrors, workspaceRoot);
      fixed.push(...llmFixed);
    }

    return fixed;
  }

  async fixTestFailures(errors: ParsedError[], workspaceRoot: string): Promise<ParsedError[]> {
    // For test failures, send test and source files to LLM
    const fileContents: Map<string, string> = new Map();

    for (const err of errors) {
      if (!err.file) continue;

      const absPath = path.isAbsolute(err.file)
        ? err.file
        : path.join(workspaceRoot, err.file);

      if (!fileContents.has(absPath)) {
        try {
          const content = await fs.readFile(absPath, 'utf-8');
          fileContents.set(absPath, content);

          // Also try to read the source file for the test
          const sourceFile = this.guessSourceFile(absPath);
          if (sourceFile && !fileContents.has(sourceFile)) {
            try {
              const srcContent = await fs.readFile(sourceFile, 'utf-8');
              fileContents.set(sourceFile, srcContent);
            } catch {
              // Source file not found, continue
            }
          }
        } catch {
          Logger.debug(`[AutoFixEngine] Could not read ${absPath}`);
        }
      }
    }

    return this.fixViaLLM(errors, workspaceRoot, fileContents);
  }

  async fixBuildErrors(errors: ParsedError[], workspaceRoot: string): Promise<ParsedError[]> {
    const fixed: ParsedError[] = [];

    // Module not found -> npm install
    const moduleErrors = errors.filter(e => e.code === 'MODULE_NOT_FOUND');
    for (const err of moduleErrors) {
      const moduleMatch = /Module not found:\s*'([^']+)'/.exec(err.message);
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        if (!moduleName.startsWith('.')) {
          try {
            const pkgName = moduleName.startsWith('@')
              ? moduleName.split('/').slice(0, 2).join('/')
              : moduleName.split('/')[0];
            await this.commandExecutor.executeRaw(`npm install ${pkgName}`, workspaceRoot);
            fixed.push(err);
          } catch {
            Logger.debug(`[AutoFixEngine] Failed to install ${moduleName}`);
          }
        }
      }
    }

    // Syntax / other errors -> LLM
    const otherErrors = errors.filter(e => e.code !== 'MODULE_NOT_FOUND');
    if (otherErrors.length > 0) {
      const llmFixed = await this.fixViaLLM(otherErrors, workspaceRoot);
      fixed.push(...llmFixed);
    }

    return fixed;
  }

  private async fixGenericErrors(errors: ParsedError[], workspaceRoot: string): Promise<ParsedError[]> {
    return this.fixViaLLM(errors, workspaceRoot);
  }

  // ---- LLM-based Fix ----

  private async fixViaLLM(
    errors: ParsedError[],
    workspaceRoot: string,
    existingContents?: Map<string, string>
  ): Promise<ParsedError[]> {
    if (!this.apiService) {
      Logger.warn('[AutoFixEngine] API service not configured, cannot use LLM for fixes');
      return [];
    }

    // Read error context
    const fileContents = existingContents || new Map<string, string>();
    for (const err of errors) {
      if (!err.file) continue;
      const absPath = path.isAbsolute(err.file)
        ? err.file
        : path.join(workspaceRoot, err.file);

      if (!fileContents.has(absPath)) {
        const context = await this.readErrorContext(err, workspaceRoot, 20);
        if (context) {
          fileContents.set(absPath, context);
        }
      }
    }

    if (fileContents.size === 0) {
      Logger.debug('[AutoFixEngine] No file contents available for LLM fix');
      return [];
    }

    // Build prompt
    const { system, user } = this.buildFixPrompt(errors, fileContents);

    // Call LLM
    try {
      const response = await this.callLLM(system, user);

      // Parse fix JSON from response
      const fixes = this.parseFixResponse(response);
      if (fixes.length === 0) {
        Logger.debug('[AutoFixEngine] LLM returned no fixes');
        return [];
      }

      // Apply fixes
      await this.applyFixes(fixes, workspaceRoot);

      this.emit('fix-applied', { fixCount: fixes.length });

      // Assume fixed errors are the ones we sent to LLM
      // Actual verification happens in the main loop
      return errors;
    } catch (err) {
      Logger.warn('[AutoFixEngine] LLM fix failed:', err);
      return [];
    }
  }

  // ---- Prompt Building ----

  buildFixPrompt(
    errors: ParsedError[],
    fileContents: Map<string, string>
  ): { system: string; user: string } {
    const system = `You are an expert code fixer. Given error messages and file contents, output ONLY a JSON array of fixes.
Each fix must be an object with:
- "filePath": string (absolute path to the file)
- "startLine": number (1-based line number where the fix starts)
- "endLine": number (1-based line number where the fix ends, inclusive)
- "replacement": string (the replacement text for those lines)

Rules:
- Output ONLY valid JSON, no markdown, no explanation
- Preserve indentation and style of surrounding code
- Make minimal changes to fix the errors
- Do not introduce new issues`;

    const errorList = errors.map(e => {
      const loc = [e.file, e.line, e.column].filter(Boolean).join(':');
      return `- ${loc}: ${e.code ? `[${e.code}] ` : ''}${e.message}`;
    }).join('\n');

    const fileList = Array.from(fileContents.entries()).map(([filePath, content]) => {
      const lines = content.split('\n');
      const numbered = lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
      return `=== ${filePath} ===\n${numbered}`;
    }).join('\n\n');

    const user = `Fix the following errors:\n\n${errorList}\n\nFile contents:\n\n${fileList}`;

    return { system, user };
  }

  // ---- Fix Application ----

  async applyFixes(fixes: FileFix[], workspaceRoot: string): Promise<void> {
    // Group fixes by file
    const fixesByFile = new Map<string, FileFix[]>();
    for (const fix of fixes) {
      const absPath = path.isAbsolute(fix.filePath)
        ? fix.filePath
        : path.join(workspaceRoot, fix.filePath);
      const existing = fixesByFile.get(absPath) || [];
      existing.push({ ...fix, filePath: absPath });
      fixesByFile.set(absPath, existing);
    }

    // Apply fixes file by file, bottom-to-top to preserve line numbers
    for (const [filePath, fileFixes] of fixesByFile.entries()) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        // Sort fixes bottom-to-top so line numbers stay valid
        const sorted = fileFixes.sort((a, b) => b.startLine - a.startLine);

        for (const fix of sorted) {
          const startIdx = fix.startLine - 1;
          const endIdx = fix.endLine;
          const replacementLines = fix.replacement.split('\n');

          if (startIdx >= 0 && endIdx <= lines.length) {
            lines.splice(startIdx, endIdx - startIdx, ...replacementLines);
          } else {
            Logger.warn(`[AutoFixEngine] Invalid line range ${fix.startLine}-${fix.endLine} for ${filePath}`);
          }
        }

        await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
        Logger.info(`[AutoFixEngine] Applied ${fileFixes.length} fix(es) to ${filePath}`);
      } catch (err) {
        Logger.warn(`[AutoFixEngine] Failed to apply fixes to ${filePath}:`, err);
      }
    }
  }

  // ---- Verification ----

  async verifyFixes(originalCommand: string, workspaceRoot: string): Promise<{
    success: boolean;
    remainingErrors: ParsedError[];
  }> {
    try {
      const execution = await this.commandExecutor.executeRaw(originalCommand, workspaceRoot);
      const parsed = this.outputParser.parseOutput(execution);

      return {
        success: parsed.success,
        remainingErrors: parsed.errors,
      };
    } catch (err) {
      Logger.warn('[AutoFixEngine] Verification failed:', err);
      return {
        success: false,
        remainingErrors: [],
      };
    }
  }

  // ---- Helpers ----

  async readErrorContext(
    error: ParsedError,
    workspaceRoot: string,
    contextLines: number = 20
  ): Promise<string | null> {
    if (!error.file) return null;

    const absPath = path.isAbsolute(error.file)
      ? error.file
      : path.join(workspaceRoot, error.file);

    try {
      const content = await fs.readFile(absPath, 'utf-8');
      const lines = content.split('\n');

      if (error.line === null) {
        // Return entire file if no line number (up to reasonable limit)
        return lines.slice(0, 200).join('\n');
      }

      const start = Math.max(0, error.line - 1 - contextLines);
      const end = Math.min(lines.length, error.line + contextLines);
      return lines.slice(start, end).join('\n');
    } catch {
      return null;
    }
  }

  private groupErrorsBySource(errors: ParsedError[]): Map<string, ParsedError[]> {
    const groups = new Map<string, ParsedError[]>();
    for (const err of errors) {
      const existing = groups.get(err.source) || [];
      existing.push(err);
      groups.set(err.source, existing);
    }
    return groups;
  }

  private guessSourceFile(testFile: string): string | null {
    // Common patterns: foo.test.ts -> foo.ts, foo.spec.ts -> foo.ts
    const match = /^(.+)\.(?:test|spec)\.(ts|tsx|js|jsx)$/.exec(testFile);
    if (match) return `${match[1]}.${match[2]}`;

    // __tests__/foo.ts -> ../foo.ts
    const testDir = /__tests__\/(.+)$/.exec(testFile);
    if (testDir) return testFile.replace('__tests__/', '');

    return null;
  }

  private async callLLM(system: string, user: string): Promise<string> {
    if (!this.apiService) throw new Error('API service not set');

    let fullContent = '';

    for await (const chunk of this.apiService.chatStream(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }
    )) {
      if (typeof chunk === 'string') {
        fullContent += chunk;
      }
    }

    return fullContent;
  }

  private parseFixResponse(response: string): FileFix[] {
    try {
      // Try to extract JSON array from response
      let jsonStr = response.trim();

      // Strip markdown code fences if present
      const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(jsonStr);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      // Find JSON array
      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1) {
        jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        Logger.warn('[AutoFixEngine] LLM response is not an array');
        return [];
      }

      // Validate each fix
      return parsed.filter((fix: unknown): fix is FileFix => {
        if (!fix || typeof fix !== 'object') return false;
        const f = fix as Record<string, unknown>;
        return (
          typeof f.filePath === 'string' &&
          typeof f.startLine === 'number' &&
          typeof f.endLine === 'number' &&
          typeof f.replacement === 'string' &&
          f.startLine > 0 &&
          f.endLine >= f.startLine
        );
      });
    } catch (err) {
      Logger.warn('[AutoFixEngine] Failed to parse LLM fix response:', err);
      return [];
    }
  }

  dispose(): void {
    this.isRunning = false;
    this.apiService = null;
    this.removeAllListeners();
  }
}
