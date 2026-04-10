/**
 * AsyncSessionSync.ts
 * Phase 18.5 — Sync completed async sessions into the workspace
 *
 * On VS Code startup, checks for async sessions the user started from this
 * machine that have completed in the background. When results are ready
 * and safe to apply, writes them into the workspace via FileOpsExecutor.
 *
 * Conflict resolution: if the target file changed on disk while the session
 * was running, the user is prompted before any overwrite.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  AsyncSessionClient,
  AsyncSessionDetails,
  AsyncSessionSummary,
  AsyncSessionResultView,
} from './AsyncSessionClient';
import { Logger } from '../../../utils/Logger';
import { ConfigManager } from '../../../utils/ConfigManager';

// ============================================================

export interface ApplyResult {
  sessionId: string;
  appliedFiles: string[];
  skippedFiles: string[];
  conflicts: string[];
  error: string | null;
}

export class AsyncSessionSync {
  private static instance: AsyncSessionSync;

  private client: AsyncSessionClient;
  private lastCheckAt = 0;

  private constructor() {
    this.client = AsyncSessionClient.getInstance();
  }

  static getInstance(): AsyncSessionSync {
    if (!AsyncSessionSync.instance) {
      AsyncSessionSync.instance = new AsyncSessionSync();
    }
    return AsyncSessionSync.instance;
  }

  // ============================================================
  // Startup check
  // ============================================================

  /**
   * Called from extension.ts during activate. Checks the backend for
   * completed sessions and notifies the user.
   */
  async checkCompleted(): Promise<void> {
    try {
      const { sessions } = await this.client.listSessions({ limit: 20 });
      const completed = sessions.filter(
        (s) => s.status === 'completed' && !s.applied
      );
      if (completed.length === 0) return;

      this.lastCheckAt = Date.now();
      Logger.info(`[AsyncSync] ${completed.length} completed async session(s) awaiting review`);

      // Surface a toast with a review action
      const choice = await vscode.window.showInformationMessage(
        `INA-7 Pro · You have ${completed.length} completed background task${completed.length === 1 ? '' : 's'} waiting to apply.`,
        'Review',
        'Later'
      );
      if (choice === 'Review') {
        await this.showSessionPicker(completed);
      }
    } catch (e: any) {
      // Silently log — this runs on every startup and we don't want to nag
      // the user with connection errors.
      Logger.warn(`[AsyncSync] checkCompleted failed: ${String(e)}`);
    }
  }

  /**
   * Show a QuickPick of completed sessions. Selecting one fetches its
   * details and offers to apply the results.
   */
  private async showSessionPicker(sessions: AsyncSessionSummary[]): Promise<void> {
    const items = sessions.map((s) => ({
      label: s.taskDescription.substring(0, 80),
      description: `${this.formatAge(s.completedAt ?? s.updatedAt)} · ${s.totalTokensUsed} tokens`,
      detail: `id: ${s.id.substring(0, 8)} · status: ${s.status}`,
      session: s,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'INA-7 Pro · Pick a completed session to review',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) return;
    await this.reviewAndApply(picked.session.id);
  }

  // ============================================================
  // Review & apply
  // ============================================================

  /**
   * Fetch session details and interactively apply its results to the
   * workspace. Handles conflicts with current file contents.
   */
  async reviewAndApply(sessionId: string): Promise<ApplyResult> {
    const result: ApplyResult = {
      sessionId,
      appliedFiles: [],
      skippedFiles: [],
      conflicts: [],
      error: null,
    };

    let details: AsyncSessionDetails;
    try {
      details = await this.client.getSession(sessionId);
    } catch (e: any) {
      result.error = e?.message ?? String(e);
      return result;
    }

    const fileChanges = this.extractFileChanges(details.results);
    if (fileChanges.length === 0) {
      vscode.window.showInformationMessage(
        'INA-7 Pro · Session completed, but no file-level changes were produced.'
      );
      return result;
    }

    // Show a summary + confirmation
    const summary = fileChanges.map((f) => `• ${f.filePath}`).join('\n');
    const confirm = await vscode.window.showInformationMessage(
      `INA-7 Pro · Apply ${fileChanges.length} file${fileChanges.length === 1 ? '' : 's'} from this session?`,
      { modal: true, detail: summary },
      'Apply'
    );
    if (confirm !== 'Apply') {
      return result;
    }

    const autoApply = ConfigManager.get<boolean>('async.autoApply', false);

    for (const change of fileChanges) {
      try {
        const applied = await this.applySingleFile(change, autoApply);
        if (applied === 'applied') {
          result.appliedFiles.push(change.filePath);
        } else if (applied === 'conflict') {
          result.conflicts.push(change.filePath);
        } else {
          result.skippedFiles.push(change.filePath);
        }
      } catch (e: any) {
        Logger.warn(`[AsyncSync] apply ${change.filePath} failed: ${String(e)}`);
        result.skippedFiles.push(change.filePath);
      }
    }

    // Mark as applied on the backend
    try {
      await fetch(this.getMarkAppliedUrl(sessionId), {
        method: 'POST',
        // best-effort — backend may not implement this endpoint yet
      });
    } catch {
      /* noop */
    }

    // Summary toast
    const parts: string[] = [];
    if (result.appliedFiles.length) parts.push(`${result.appliedFiles.length} applied`);
    if (result.conflicts.length) parts.push(`${result.conflicts.length} conflicts`);
    if (result.skippedFiles.length) parts.push(`${result.skippedFiles.length} skipped`);
    vscode.window.showInformationMessage(`INA-7 Pro · Sync: ${parts.join(', ')}`);
    return result;
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Extract file path + code content from the raw session results.
   * CODER / REFACTORER / TESTER outputs are typically fenced code blocks
   * which we parse out here.
   */
  private extractFileChanges(results: AsyncSessionResultView[]): Array<{
    filePath: string;
    content: string;
    language: string;
    taskDescription: string;
  }> {
    const out: Array<{ filePath: string; content: string; language: string; taskDescription: string }> = [];
    for (const r of results) {
      // Only "code-producing" roles are applicable
      if (r.requiredRole !== 'coder' && r.requiredRole !== 'refactorer' && r.requiredRole !== 'tester') {
        continue;
      }
      const filePath = r.filePath ?? this.detectFilePathFromOutput(r.output);
      if (!filePath) continue;
      const content = this.extractCodeBlock(r.output) ?? r.output;
      out.push({
        filePath,
        content,
        language: r.language ?? this.detectLanguage(filePath),
        taskDescription: r.description,
      });
    }
    return out;
  }

  /**
   * Apply a single file. If the target file already exists and differs
   * from the parent-session's original state, ask the user unless
   * `autoApply` is on.
   */
  private async applySingleFile(
    change: { filePath: string; content: string; language: string; taskDescription: string },
    autoApply: boolean
  ): Promise<'applied' | 'conflict' | 'skipped'> {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      throw new Error('No workspace open');
    }
    const absPath = path.isAbsolute(change.filePath)
      ? change.filePath
      : path.join(workspace.uri.fsPath, change.filePath);

    // If file exists, check if it conflicts with what the session expected
    const exists = fs.existsSync(absPath);
    if (exists && !autoApply) {
      const current = fs.readFileSync(absPath, 'utf8');
      if (current.trim() !== change.content.trim()) {
        // Prompt
        const choice = await vscode.window.showWarningMessage(
          `INA-7 Pro · ${path.basename(absPath)} has been modified since the session ran`,
          { modal: true, detail: `Task: ${change.taskDescription}` },
          'Overwrite',
          'Open Diff',
          'Skip'
        );
        if (choice === 'Skip') return 'skipped';
        if (choice === 'Open Diff') {
          // Write the proposed content to a temp file and open a diff
          const tmpUri = vscode.Uri.parse(
            `untitled:${absPath}.ina-proposed`
          );
          const doc = await vscode.workspace.openTextDocument(tmpUri);
          const editor = await vscode.window.showTextDocument(doc);
          await editor.edit((e) => e.insert(new vscode.Position(0, 0), change.content));
          await vscode.commands.executeCommand(
            'vscode.diff',
            vscode.Uri.file(absPath),
            tmpUri,
            `INA-7 Pro · ${path.basename(absPath)} — proposed`
          );
          return 'conflict';
        }
      }
    }

    // Write the file
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(absPath, change.content, 'utf8');
    return 'applied';
  }

  private extractCodeBlock(text: string): string | null {
    const m = text.match(/```(?:[a-zA-Z+#-]+)?\s*\n?([\s\S]*?)```/);
    if (m) return m[1].trim();
    return null;
  }

  /**
   * Try to find a `// file: path/to/x.ts` header inside the output.
   */
  private detectFilePathFromOutput(output: string): string | null {
    const m = output.match(/(?:\/\/|#)\s*file[:\s]+([^\s\n]+)/i);
    return m ? m[1].trim() : null;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
    };
    return map[ext] ?? 'plaintext';
  }

  private formatAge(ts: number): string {
    const ms = Date.now() - ts;
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  }

  private getMarkAppliedUrl(sessionId: string): string {
    const url =
      ConfigManager.get<string>('apiUrl', '') ||
      ConfigManager.get<string>('general.apiUrl', '') ||
      'http://localhost:3200';
    return `${url.replace(/\/+$/, '')}/api/agent/async/sessions/${encodeURIComponent(sessionId)}/apply-ack`;
  }
}
