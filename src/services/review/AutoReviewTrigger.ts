/**
 * Phase 27 — Auto Review Trigger
 *
 * Watches for git ref changes (new commits) and automatically
 * triggers ReviewEngine to review the latest changes.
 */

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { Logger } from '../../utils/Logger';

export class AutoReviewTrigger implements vscode.Disposable {
  private gitWatcher: vscode.FileSystemWatcher | null = null;
  private enabled: boolean;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastReviewedCommit = '';
  private configListener: vscode.Disposable;

  constructor(
    private reviewFn: (scope: { type: string; commitRange: string; autoTriggered: boolean }) => Promise<void>,
  ) {
    this.enabled = vscode.workspace
      .getConfiguration('inaCoding.review')
      .get<boolean>('autoOnPush', false);

    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('inaCoding.review.autoOnPush')) {
        this.enabled = vscode.workspace
          .getConfiguration('inaCoding.review')
          .get<boolean>('autoOnPush', false);
        if (this.enabled) this.startWatching();
        else this.stopWatching();
      }
    });

    if (this.enabled) this.startWatching();
  }

  private startWatching(): void {
    if (this.gitWatcher) return;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;

    for (const folder of folders) {
      const pattern = new vscode.RelativePattern(folder, '.git/refs/heads/**');
      this.gitWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.gitWatcher.onDidChange(() => this.onGitRefChanged(folder.uri.fsPath));
      this.gitWatcher.onDidCreate(() => this.onGitRefChanged(folder.uri.fsPath));
    }

    Logger.info('[AutoReview] Watching for git ref changes');
  }

  private stopWatching(): void {
    this.gitWatcher?.dispose();
    this.gitWatcher = null;
  }

  private onGitRefChanged(workspacePath: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runAutoReview(workspacePath), 2_000);
  }

  private async runAutoReview(workspacePath: string): Promise<void> {
    try {
      const currentCommit = child_process
        .execSync('git rev-parse HEAD', { cwd: workspacePath, encoding: 'utf8', timeout: 5_000 })
        .trim();

      if (currentCommit === this.lastReviewedCommit) return;
      this.lastReviewedCommit = currentCommit;

      const commitDepth = vscode.workspace
        .getConfiguration('inaCoding.review')
        .get<number>('autoReviewCommitDepth', 1);

      Logger.info(`[AutoReview] New commit ${currentCommit.substring(0, 8)} — starting review`);

      await this.reviewFn({
        type: 'commits',
        commitRange: `HEAD~${commitDepth}..HEAD`,
        autoTriggered: true,
      });

      const notify = vscode.workspace
        .getConfiguration('inaCoding.review')
        .get<boolean>('autoReviewNotify', true);

      if (notify) {
        const action = await vscode.window.showInformationMessage(
          `INA-7 Pro: Automatisches Code-Review für Commit ${currentCommit.substring(0, 8)} abgeschlossen.`,
          'Review anzeigen',
        );
        if (action === 'Review anzeigen') {
          vscode.commands.executeCommand('inaCoding.review.reviewChanges');
        }
      }
    } catch (err) {
      Logger.warn(`[AutoReview] Error: ${err}`);
    }
  }

  dispose(): void {
    this.configListener.dispose();
    this.stopWatching();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
