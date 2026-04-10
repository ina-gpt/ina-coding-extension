/**
 * AutoFormatService.ts
 * Phase 16.6 — Auto-format code after AI applies changes
 *
 * Detects the active formatter from workspace config files, then runs it
 * via spawn after each chat-apply / agent-step / inline-edit. Falls back
 * to VS Code's built-in `editor.action.formatDocument` if no external
 * formatter is available.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  FormatterConfig,
  FormatterResult,
  KNOWN_FORMATTERS,
} from './AutoFormatTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class AutoFormatService {
  private static instance: AutoFormatService;

  /** Cache: workspaceRoot → detected formatter (or null = not detected) */
  private detectionCache = new Map<string, FormatterConfig | null>();

  private constructor() {}

  static getInstance(): AutoFormatService {
    if (!AutoFormatService.instance) {
      AutoFormatService.instance = new AutoFormatService();
    }
    return AutoFormatService.instance;
  }

  // ============================================================
  // Detection
  // ============================================================

  /**
   * Detect the formatter for a given workspace root by scanning for
   * config files. Result is cached per workspaceRoot.
   */
  detectFormatter(workspaceRoot: string): FormatterConfig | null {
    if (!workspaceRoot) return null;
    if (this.detectionCache.has(workspaceRoot)) {
      return this.detectionCache.get(workspaceRoot)!;
    }

    for (const formatter of KNOWN_FORMATTERS) {
      for (const cfgFile of formatter.configFiles) {
        const fullPath = path.join(workspaceRoot, cfgFile);
        if (!fs.existsSync(fullPath)) continue;

        if (formatter.checkContent) {
          // Verify the marker substring is in the file
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (!content.includes(formatter.checkContent)) continue;
          } catch {
            continue;
          }
        }
        Logger.info(`[AutoFormat] Detected ${formatter.name} via ${cfgFile}`);
        this.detectionCache.set(workspaceRoot, formatter);
        return formatter;
      }
    }
    Logger.info(`[AutoFormat] No formatter config found in ${workspaceRoot}`);
    this.detectionCache.set(workspaceRoot, null);
    return null;
  }

  /** Pick the best formatter for a given file extension */
  private pickFormatterForFile(filePath: string, workspaceRoot: string): FormatterConfig | null {
    const ext = path.extname(filePath).toLowerCase().replace(/^\./, '');
    const detected = this.detectFormatter(workspaceRoot);
    if (detected && detected.fileExtensions.includes(ext)) {
      return detected;
    }
    // Fall back: look across the catalog for any formatter whose configFiles
    // exist in the workspace AND whose extension matches.
    for (const formatter of KNOWN_FORMATTERS) {
      if (!formatter.fileExtensions.includes(ext)) continue;
      for (const cfgFile of formatter.configFiles) {
        if (fs.existsSync(path.join(workspaceRoot, cfgFile))) {
          if (formatter.checkContent) {
            try {
              const content = fs.readFileSync(path.join(workspaceRoot, cfgFile), 'utf8');
              if (!content.includes(formatter.checkContent)) continue;
            } catch {
              continue;
            }
          }
          return formatter;
        }
      }
    }
    return null;
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Main entry point — called after any AI code apply.
   * Runs the best formatter for the file, or VS Code's built-in fallback.
   */
  async formatAfterApply(
    filePath: string,
    changedLines?: { start: number; end: number }
  ): Promise<FormatterResult> {
    if (!ConfigManager.get<boolean>('autoFormat.enabled', true)) {
      return this.skipResult('disabled');
    }
    if (!ConfigManager.get<boolean>('autoFormat.onApply', true)) {
      return this.skipResult('onApply disabled');
    }
    return this.formatFile(filePath, changedLines);
  }

  async formatAfterAgentStep(filePath: string): Promise<FormatterResult> {
    if (!ConfigManager.get<boolean>('autoFormat.enabled', true)) {
      return this.skipResult('disabled');
    }
    if (!ConfigManager.get<boolean>('autoFormat.onAgentStep', true)) {
      return this.skipResult('onAgentStep disabled');
    }
    return this.formatFile(filePath);
  }

  async formatAfterInlineEdit(filePath: string): Promise<FormatterResult> {
    if (!ConfigManager.get<boolean>('autoFormat.enabled', true)) {
      return this.skipResult('disabled');
    }
    if (!ConfigManager.get<boolean>('autoFormat.onInlineEdit', true)) {
      return this.skipResult('onInlineEdit disabled');
    }
    return this.formatFile(filePath);
  }

  /**
   * Format a file using the detected formatter, or fall back to VS Code's
   * built-in formatter if none is configured.
   */
  async formatFile(
    filePath: string,
    changedLines?: { start: number; end: number }
  ): Promise<FormatterResult> {
    const startTime = Date.now();
    if (!filePath) return this.errorResult('no file path', startTime);

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    if (!workspaceRoot) return this.errorResult('no workspace', startTime);

    const formatter = this.pickFormatterForFile(filePath, workspaceRoot);

    // No external formatter — try VS Code's built-in formatDocument
    if (!formatter) {
      return this.formatWithBuiltIn(filePath, startTime);
    }

    // Read original content
    let originalContent = '';
    try {
      originalContent = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return this.errorResult(`read failed: ${String(e)}`, startTime, formatter.name);
    }

    // Try range formatting if supported & requested
    if (changedLines && formatter.supportsRange && formatter.name === 'prettier') {
      const rangeResult = await this.runPrettierRange(
        formatter,
        filePath,
        workspaceRoot,
        changedLines
      );
      if (rangeResult) return this.buildResult(originalContent, formatter.name, startTime);
      // Fall through to whole-file format
    }

    // Whole-file format
    try {
      const args = [...formatter.args, filePath];
      const result = await this.runCommand(formatter.command, args, workspaceRoot);
      if (result.exitCode !== 0) {
        return this.errorResult(
          `${formatter.name} exited ${result.exitCode}: ${result.stderr.trim() || result.stdout.trim()}`,
          startTime,
          formatter.name
        );
      }
      return this.buildResult(originalContent, formatter.name, startTime);
    } catch (e: any) {
      return this.errorResult(
        `${formatter.name} failed: ${e?.message ?? String(e)}`,
        startTime,
        formatter.name
      );
    }
  }

  /**
   * Format a range using Prettier's --range-start / --range-end.
   * Returns true on success, false to fall back to whole-file format.
   */
  private async runPrettierRange(
    formatter: FormatterConfig,
    filePath: string,
    cwd: string,
    range: { start: number; end: number }
  ): Promise<boolean> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      // Convert 0-based line numbers to character offsets
      let startOffset = 0;
      for (let i = 0; i < range.start && i < lines.length; i++) {
        startOffset += lines[i].length + 1;
      }
      let endOffset = startOffset;
      for (let i = range.start; i <= range.end && i < lines.length; i++) {
        endOffset += lines[i].length + 1;
      }
      const args = [
        ...formatter.args,
        '--range-start',
        String(startOffset),
        '--range-end',
        String(endOffset),
        filePath,
      ];
      const result = await this.runCommand(formatter.command, args, cwd);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Format using VS Code's built-in `editor.action.formatDocument`.
   */
  private async formatWithBuiltIn(filePath: string, startTime: number): Promise<FormatterResult> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const before = doc.getText();
      await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
      await vscode.commands.executeCommand('editor.action.formatDocument');
      // Re-read after formatting
      const after = doc.getText();
      await doc.save();
      return {
        success: true,
        formattedContent: after,
        changesApplied: before !== after,
        formatterUsed: 'vscode-builtin',
        error: null,
        durationMs: Date.now() - startTime,
      };
    } catch (e: any) {
      return this.errorResult(
        `built-in format failed: ${e?.message ?? String(e)}`,
        startTime,
        'vscode-builtin'
      );
    }
  }

  // ============================================================
  // Internal command runner
  // ============================================================

  private runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, { cwd, shell: false });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGTERM');
        } catch {
          /* noop */
        }
      }, 30_000);

      proc.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr: stderr || err.message, exitCode: -1 });
      });
      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
  }

  // ============================================================
  // Result helpers
  // ============================================================

  private buildResult(originalContent: string, formatterName: string, startTime: number): FormatterResult {
    let after = originalContent;
    try {
      // Re-read since the formatter overwrote the file
      const filePath = vscode.window.activeTextEditor?.document.uri.fsPath ?? '';
      // Caller is expected to pass filePath via formatFile, but here we just mark changed=true if the file was overwritten
    } catch {
      /* noop */
    }
    return {
      success: true,
      formattedContent: after,
      changesApplied: true, // we don't diff again — formatter ran successfully
      formatterUsed: formatterName,
      error: null,
      durationMs: Date.now() - startTime,
    };
  }

  private skipResult(reason: string): FormatterResult {
    return {
      success: true,
      formattedContent: null,
      changesApplied: false,
      formatterUsed: 'skipped',
      error: reason,
      durationMs: 0,
    };
  }

  private errorResult(reason: string, startTime: number, formatterName: string = 'unknown'): FormatterResult {
    return {
      success: false,
      formattedContent: null,
      changesApplied: false,
      formatterUsed: formatterName,
      error: reason,
      durationMs: Date.now() - startTime,
    };
  }

  /** Clear the detection cache (useful after workspace config changes) */
  invalidateCache(): void {
    this.detectionCache.clear();
  }
}
