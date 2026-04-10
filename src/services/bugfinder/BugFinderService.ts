/**
 * Phase 15.5 — Bug Finder Service
 * Scans code for bugs using AI analysis, LSP diagnostics, and provides automated fixes.
 */
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { AuthService } from '../AuthService';
import { CodeSecurityGate } from '../codesec/CodeSecurityGate';
import {
  BugReport, BugFix, BugSeverity, BugCategory, ScanMode, ScanResult,
  ScanProgress, RawBugEntry, ProjectScanOptions,
  BUG_SCAN_PROMPT, SEVERITY_ORDER, isValidSeverity, isValidCategory,
} from './BugFinderTypes';

const MAX_FILE_SIZE = 100_000; // chars
const BATCH_SIZE = 5;

export class BugFinderService extends EventEmitter {
  private static instance: BugFinderService;

  private bugs: Map<string, BugReport> = new Map();
  private scanning = false;

  private constructor() {
    super();
  }

  static getInstance(): BugFinderService {
    if (!BugFinderService.instance) {
      BugFinderService.instance = new BugFinderService();
    }
    return BugFinderService.instance;
  }

  // ============ Public API ============

  /**
   * Scan the currently active editor file.
   */
  async scanCurrentFile(): Promise<ScanResult> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active editor');
    }
    const document = editor.document;
    const filePath = document.uri.fsPath;
    const code = document.getText();
    const startTime = Date.now();

    this.emitProgress({ phase: 'analyzing', current: 0, total: 1, currentFile: filePath });

    // Collect LSP diagnostics for merging
    const diagnostics = vscode.languages.getDiagnostics(document.uri);

    // Scan via AI
    const aiBugs = await this.analyzeCode(code, filePath, 0);

    // Merge with diagnostics to avoid duplicates
    const mergedBugs = this.mergeWithDiagnostics(aiBugs, diagnostics, filePath);

    // Sort by severity
    mergedBugs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    // Store
    for (const bug of mergedBugs) {
      this.bugs.set(bug.id, bug);
    }

    this.emitProgress({ phase: 'complete', current: 1, total: 1, currentFile: null });
    this.emit('bugsFound', mergedBugs, filePath);

    return {
      bugs: mergedBugs,
      filesScanned: 1,
      scanTimeMs: Date.now() - startTime,
      mode: ScanMode.CURRENT_FILE,
    };
  }

  /**
   * Scan files that have been changed (git modified/staged).
   */
  async scanChangedFiles(): Promise<ScanResult> {
    const startTime = Date.now();
    const changedFiles = await this.getChangedFiles();

    if (changedFiles.length === 0) {
      return { bugs: [], filesScanned: 0, scanTimeMs: Date.now() - startTime, mode: ScanMode.CHANGED_FILES };
    }

    this.emitProgress({ phase: 'collecting', current: 0, total: changedFiles.length, currentFile: null });

    const allBugs: BugReport[] = [];

    for (let i = 0; i < changedFiles.length; i++) {
      const filePath = changedFiles[i];
      this.emitProgress({ phase: 'analyzing', current: i, total: changedFiles.length, currentFile: filePath });

      try {
        const uri = vscode.Uri.file(filePath);
        const doc = await vscode.workspace.openTextDocument(uri);
        const code = doc.getText();
        const diagnostics = vscode.languages.getDiagnostics(uri);

        const bugs = await this.analyzeCode(code, filePath, 0);
        const merged = this.mergeWithDiagnostics(bugs, diagnostics, filePath);
        allBugs.push(...merged);
      } catch (err) {
        Logger.warn(`BugFinder: failed to scan changed file ${filePath}: ${err}`);
      }
    }

    allBugs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const bug of allBugs) {
      this.bugs.set(bug.id, bug);
    }

    this.emitProgress({ phase: 'complete', current: changedFiles.length, total: changedFiles.length, currentFile: null });
    this.emit('bugsFound', allBugs, null);

    return {
      bugs: allBugs,
      filesScanned: changedFiles.length,
      scanTimeMs: Date.now() - startTime,
      mode: ScanMode.CHANGED_FILES,
    };
  }

  /**
   * Scan all project files (with optional filters).
   */
  async scanProject(options?: ProjectScanOptions): Promise<ScanResult> {
    const startTime = Date.now();
    const include = options?.include ?? ['**/*.{ts,tsx,js,jsx,py,go,rs,java}'];
    const exclude = options?.exclude ?? ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'];
    const maxFiles = options?.maxFiles ?? 200;

    this.emitProgress({ phase: 'collecting', current: 0, total: 0, currentFile: null });

    // Collect files
    const files: vscode.Uri[] = [];
    for (const pattern of include) {
      const found = await vscode.workspace.findFiles(pattern, `{${exclude.join(',')}}`, maxFiles - files.length);
      files.push(...found);
      if (files.length >= maxFiles) { break; }
    }

    const total = Math.min(files.length, maxFiles);
    const allBugs: BugReport[] = [];

    // Process in batches
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = files.slice(i, Math.min(i + BATCH_SIZE, total));
      const batchPromises = batch.map(async (uri, idx) => {
        const fileIndex = i + idx;
        this.emitProgress({ phase: 'analyzing', current: fileIndex, total, currentFile: uri.fsPath });
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const code = doc.getText();
          if (code.length > MAX_FILE_SIZE) {
            Logger.info(`BugFinder: skipping large file ${uri.fsPath} (${code.length} chars)`);
            return [];
          }
          const diagnostics = vscode.languages.getDiagnostics(uri);
          const bugs = await this.analyzeCode(code, uri.fsPath, 0);
          return this.mergeWithDiagnostics(bugs, diagnostics, uri.fsPath);
        } catch (err) {
          Logger.warn(`BugFinder: failed to scan ${uri.fsPath}: ${err}`);
          return [];
        }
      });
      const batchResults = await Promise.all(batchPromises);
      for (const bugs of batchResults) {
        allBugs.push(...bugs);
      }
    }

    allBugs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const bug of allBugs) {
      this.bugs.set(bug.id, bug);
    }

    this.emitProgress({ phase: 'complete', current: total, total, currentFile: null });
    this.emit('bugsFound', allBugs, null);

    return {
      bugs: allBugs,
      filesScanned: total,
      scanTimeMs: Date.now() - startTime,
      mode: ScanMode.FULL_PROJECT,
    };
  }

  /**
   * Scan a specific selection of code.
   */
  async scanSelection(code: string, filePath: string, startLine: number): Promise<ScanResult> {
    const startTime = Date.now();
    this.emitProgress({ phase: 'analyzing', current: 0, total: 1, currentFile: filePath });

    const bugs = await this.analyzeCode(code, filePath, startLine);

    bugs.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    for (const bug of bugs) {
      this.bugs.set(bug.id, bug);
    }

    this.emitProgress({ phase: 'complete', current: 1, total: 1, currentFile: null });
    this.emit('bugsFound', bugs, filePath);

    return {
      bugs,
      filesScanned: 1,
      scanTimeMs: Date.now() - startTime,
      mode: ScanMode.SELECTION,
    };
  }

  /**
   * Apply a fix for a bug. If the bug already has a fix, apply it directly.
   * Otherwise, ask the AI to generate one.
   */
  async fixBug(bug: BugReport): Promise<BugFix> {
    bug.status = 'fixing';

    let fix = bug.fix;
    if (!fix) {
      fix = await this.generateFix(bug);
    }

    // Apply the fix to the document
    const uri = vscode.Uri.file(bug.filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const edit = new vscode.WorkspaceEdit();

    const startLine = Math.max(0, fix.startLine - 1);
    const endLine = Math.max(startLine, fix.endLine - 1);
    const range = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, doc.lineAt(Math.min(endLine, doc.lineCount - 1)).text.length),
    );

    edit.replace(uri, range, fix.code);
    await vscode.workspace.applyEdit(edit);

    bug.status = 'fixed';
    bug.fix = fix;
    Logger.info(`BugFinder: fixed bug "${bug.title}" in ${bug.filePath}`);

    return fix;
  }

  /**
   * Dismiss a bug so it is no longer shown.
   */
  dismissBug(bugId: string): void {
    const bug = this.bugs.get(bugId);
    if (bug) {
      bug.status = 'dismissed';
      Logger.info(`BugFinder: dismissed bug ${bugId}`);
    }
  }

  /**
   * Get all stored bugs, optionally filtered.
   */
  getBugs(filePath?: string): BugReport[] {
    const all = Array.from(this.bugs.values());
    if (filePath) {
      return all.filter(b => b.filePath === filePath && b.status !== 'dismissed');
    }
    return all.filter(b => b.status !== 'dismissed');
  }

  /**
   * Clear all stored bugs.
   */
  clearBugs(): void {
    this.bugs.clear();
  }

  get isScanning(): boolean {
    return this.scanning;
  }

  // ============ Private: AI Communication ============

  private async analyzeCode(code: string, filePath: string, baseLineOffset: number): Promise<BugReport[]> {
    // Sanitize code before sending
    const gate = CodeSecurityGate.getInstance();
    const scanResult = gate.scanOutgoingCode(code, filePath, 'bug-scan');
    if (scanResult.blocked) {
      Logger.warn(`BugFinder: code blocked by security gate for ${filePath}`);
      return [];
    }
    const safeCode = scanResult.sanitizedCode ?? code;

    try {
      this.scanning = true;
      const endpoint = ConfigManager.getApiEndpoint();
      const authService = AuthService.prototype; // resolved at call site
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };

      // Attempt to get auth headers if a global AuthService instance is available
      try {
        const authExt = (vscode.extensions.getExtension('ina.ina-coding')?.exports as { authService?: AuthService })?.authService;
        if (authExt && authExt.isAuthenticated) {
          const authHeaders = await authExt.getAuthHeaders();
          headers = { ...headers, ...authHeaders };
        }
      } catch {
        // Continue without auth headers — server may allow unauthenticated requests
      }

      const body = JSON.stringify({
        messages: [
          { role: 'system', content: BUG_SCAN_PROMPT },
          { role: 'user', content: `File: ${filePath}\n\n${safeCode}` },
        ],
        options: { temperature: 0.1 },
      });

      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers,
        body,
      });

      if (!response.ok) {
        Logger.error(`BugFinder: API returned ${response.status} for ${filePath}`);
        return [];
      }

      const data = await response.json() as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
      const content = data?.message?.content ?? data?.choices?.[0]?.message?.content ?? '';

      return this.parseBugResponse(content, filePath, baseLineOffset);
    } catch (err) {
      Logger.error(`BugFinder: analysis failed for ${filePath}: ${err}`);
      return [];
    } finally {
      this.scanning = false;
    }
  }

  private async generateFix(bug: BugReport): Promise<BugFix> {
    const endpoint = ConfigManager.getApiEndpoint();
    const fixPrompt = `You are a code fixer. Given the following bug report, generate a precise code fix.

Bug title: ${bug.title}
Bug description: ${bug.description}
Category: ${bug.category}
File: ${bug.filePath}
Lines: ${bug.startLine}-${bug.endLine}
Code snippet:
${bug.codeSnippet}

Suggestion: ${bug.suggestion}

Output ONLY a JSON object with:
{
  "description": "what the fix does",
  "code": "the replacement code (properly indented)",
  "startLine": ${bug.startLine},
  "endLine": ${bug.endLine}
}`;

    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a code fixer. Output ONLY valid JSON.' },
            { role: 'user', content: fixPrompt },
          ],
          options: { temperature: 0 },
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json() as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
      const content = data?.message?.content ?? data?.choices?.[0]?.message?.content ?? '';
      const parsed = this.extractJson(content) as Record<string, unknown> | null;
      if (parsed && typeof parsed === 'object' && 'code' in parsed) {
        return {
          description: String((parsed as Record<string, unknown>).description ?? 'Auto-generated fix'),
          code: String((parsed as Record<string, unknown>).code),
          startLine: Number((parsed as Record<string, unknown>).startLine ?? bug.startLine),
          endLine: Number((parsed as Record<string, unknown>).endLine ?? bug.endLine),
        };
      }
    } catch (err) {
      Logger.error(`BugFinder: fix generation failed: ${err}`);
    }

    // Fallback: return suggestion as description with empty code
    return {
      description: bug.suggestion,
      code: bug.codeSnippet,
      startLine: bug.startLine,
      endLine: bug.endLine,
    };
  }

  // ============ Private: Parsing ============

  private parseBugResponse(response: string, filePath: string, baseLineOffset: number): BugReport[] {
    const parsed = this.extractJson(response);
    if (!Array.isArray(parsed)) {
      Logger.warn('BugFinder: AI response was not a JSON array');
      return [];
    }

    const bugs: BugReport[] = [];

    for (const raw of parsed as RawBugEntry[]) {
      if (!raw || typeof raw !== 'object') { continue; }

      const severity = isValidSeverity(String(raw.severity ?? '')) ? raw.severity as BugSeverity : BugSeverity.MEDIUM;
      const category = isValidCategory(String(raw.category ?? '')) ? raw.category as BugCategory : BugCategory.CODE_SMELL;

      const startLine = (typeof raw.line === 'number' ? raw.line : 1) + baseLineOffset;
      const endLine = (typeof raw.endLine === 'number' ? raw.endLine : startLine) + baseLineOffset;

      let fix: BugFix | null = null;
      if (raw.fix && typeof raw.fix === 'object' && raw.fix.code) {
        fix = {
          description: String(raw.fix.description ?? ''),
          code: String(raw.fix.code),
          startLine: (raw.fix.startLine ?? startLine) + baseLineOffset,
          endLine: (raw.fix.endLine ?? endLine) + baseLineOffset,
        };
      }

      const id = crypto.randomUUID();

      bugs.push({
        id,
        filePath,
        startLine,
        endLine,
        severity,
        category,
        title: String(raw.title ?? 'Untitled bug'),
        description: String(raw.description ?? ''),
        suggestion: String(raw.suggestion ?? ''),
        codeSnippet: String(raw.codeSnippet ?? ''),
        fix,
        status: 'open',
      });
    }

    return bugs;
  }

  private extractJson(text: string): unknown {
    // Try direct parse first
    try {
      return JSON.parse(text);
    } catch {
      // Try to find JSON array or object in the text
    }

    // Strip markdown code fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch {
        // Continue to bracket matching
      }
    }

    // Find first [ ... ] or { ... }
    const arrayStart = text.indexOf('[');
    const objStart = text.indexOf('{');
    const start = arrayStart >= 0 && (objStart < 0 || arrayStart < objStart) ? arrayStart : objStart;
    if (start < 0) { return null; }

    const openChar = text[start];
    const closeChar = openChar === '[' ? ']' : '}';
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === openChar) { depth++; }
      if (text[i] === closeChar) { depth--; }
      if (depth === 0) {
        try {
          return JSON.parse(text.substring(start, i + 1));
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  // ============ Private: Diagnostics Merging ============

  private mergeWithDiagnostics(
    aiBugs: BugReport[],
    diagnostics: readonly vscode.Diagnostic[],
    filePath: string,
  ): BugReport[] {
    const merged = [...aiBugs];

    for (const diag of diagnostics) {
      // Skip hints and info-level diagnostics from LSP
      if (diag.severity === vscode.DiagnosticSeverity.Hint) { continue; }

      const diagLine = diag.range.start.line + 1; // 1-based

      // Check if any AI bug already covers this line with a similar message
      const isDuplicate = aiBugs.some(bug =>
        Math.abs(bug.startLine - diagLine) <= 2 &&
        (bug.title.toLowerCase().includes(diag.message.toLowerCase().substring(0, 20)) ||
         diag.message.toLowerCase().includes(bug.title.toLowerCase().substring(0, 20))),
      );

      if (isDuplicate) { continue; }

      // Convert LSP diagnostic to a BugReport
      const severity = diag.severity === vscode.DiagnosticSeverity.Error
        ? BugSeverity.HIGH
        : diag.severity === vscode.DiagnosticSeverity.Warning
          ? BugSeverity.MEDIUM
          : BugSeverity.LOW;

      merged.push({
        id: crypto.randomUUID(),
        filePath,
        startLine: diagLine,
        endLine: diag.range.end.line + 1,
        severity,
        category: BugCategory.CODE_SMELL,
        title: diag.message.length > 80 ? diag.message.substring(0, 77) + '...' : diag.message,
        description: `[LSP ${diag.source ?? 'diagnostic'}] ${diag.message}`,
        suggestion: 'Review the diagnostic and address the underlying issue.',
        codeSnippet: '',
        fix: null,
        status: 'open',
      });
    }

    return merged;
  }

  // ============ Private: Git Integration ============

  private async getChangedFiles(): Promise<string[]> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      const git = gitExtension?.getAPI(1);
      if (!git || git.repositories.length === 0) {
        Logger.warn('BugFinder: no git repository found');
        return [];
      }

      const repo = git.repositories[0];
      const changes = [
        ...repo.state.workingTreeChanges,
        ...repo.state.indexChanges,
      ];

      // Deduplicate by path
      const paths = new Set<string>();
      for (const change of changes) {
        if (change.uri?.fsPath) {
          paths.add(change.uri.fsPath);
        }
      }

      return Array.from(paths);
    } catch (err) {
      Logger.error(`BugFinder: failed to get changed files: ${err}`);
      return [];
    }
  }

  // ============ Private: Helpers ============

  private emitProgress(progress: ScanProgress): void {
    this.emit('scanProgress', progress);
  }
}
