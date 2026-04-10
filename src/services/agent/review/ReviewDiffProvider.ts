import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ReviewableChange, ReviewHunk } from './ReviewTypes';
import { Logger } from '../../../utils/Logger';

/**
 * ReviewDiffProvider provides VS Code diff editor integration for reviewing
 * agent-made changes. It creates temporary files for original content and
 * opens VS Code's built-in diff viewer.
 */
export class ReviewDiffProvider {
  private static instance: ReviewDiffProvider;
  private activeDiffEditors: Map<string, { original: vscode.Uri; modified: vscode.Uri }> = new Map();
  private tempDir: string;

  private constructor() {
    this.tempDir = path.join(os.tmpdir(), 'ina-coding-review');
  }

  static getInstance(): ReviewDiffProvider {
    if (!ReviewDiffProvider.instance) {
      ReviewDiffProvider.instance = new ReviewDiffProvider();
    }
    return ReviewDiffProvider.instance;
  }

  /**
   * Show a diff view for a single change. For created files, shows the full file.
   * For deleted files, shows a preview of the original. For modified files,
   * opens VS Code's diff editor with original vs modified.
   */
  async showDiff(change: ReviewableChange): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      return;
    }

    if (change.operation === ('create' as any)) {
      return this.showCreatedFileFull(change);
    }

    if (change.operation === ('delete' as any)) {
      return this.showDeletedFilePreview(change);
    }

    // Create temp file with original content
    const originalUri = await this.createTempFile(
      change.originalContent || '',
      change.filePath,
      'original'
    );
    const modifiedUri = vscode.Uri.joinPath(ws.uri, change.filePath);

    const title = `${path.basename(change.filePath)} (Original \u2194 Modified)`;
    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
    this.activeDiffEditors.set(change.id, { original: originalUri, modified: modifiedUri });

    Logger.info('ReviewDiffProvider: Showing diff', { filePath: change.filePath });
  }

  /**
   * Show diffs for multiple changes, limited to 10 tabs to avoid overwhelming the editor.
   */
  async showMultiFileDiff(changes: ReviewableChange[]): Promise<void> {
    for (const change of changes.slice(0, 10)) {
      await this.showDiff(change);
    }
  }

  /**
   * Show a diff for a specific change and scroll to a particular hunk.
   */
  async showHunkDiff(change: ReviewableChange, hunkId: string): Promise<void> {
    await this.showDiff(change);

    // Try to scroll to hunk position
    const hunk = change.hunks.find((h) => h.id === hunkId);
    if (hunk) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const pos = new vscode.Position(Math.max(0, hunk.startLineNew - 1), 0);
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter
        );
      }
    }
  }

  /**
   * Show a newly created file in the editor with an informational message.
   */
  async showCreatedFileFull(change: ReviewableChange): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) {
      return;
    }

    const uri = vscode.Uri.joinPath(ws.uri, change.filePath);
    try {
      await vscode.window.showTextDocument(uri);
      vscode.window.showInformationMessage(`This file was created by the agent: ${change.filePath}`);
    } catch {
      // File may not be on disk yet; show from content
      if (change.newContent) {
        const tempUri = await this.createTempFile(change.newContent, change.filePath, 'created');
        await vscode.window.showTextDocument(tempUri);
      }
    }
  }

  /**
   * Show a preview of a file that was deleted by the agent.
   */
  async showDeletedFilePreview(change: ReviewableChange): Promise<void> {
    if (!change.originalContent) {
      return;
    }

    const tempUri = await this.createTempFile(change.originalContent, change.filePath, 'deleted');
    await vscode.window.showTextDocument(tempUri, { preview: true });
    vscode.window.showWarningMessage(`This file was deleted by the agent: ${change.filePath}`);
  }

  /**
   * Close all active diff editors and clean up temporary files.
   */
  closeAllDiffs(): void {
    this.activeDiffEditors.clear();
    this.cleanupTempFiles();
    Logger.info('ReviewDiffProvider: All diffs closed');
  }

  /**
   * Navigate to the next change in the active diff editor.
   */
  navigateToNextChange(): void {
    vscode.commands.executeCommand('workbench.action.editor.nextChange');
  }

  /**
   * Navigate to the previous change in the active diff editor.
   */
  navigateToPreviousChange(): void {
    vscode.commands.executeCommand('workbench.action.editor.previousChange');
  }

  /**
   * Create a temporary file with the given content for use in diff views.
   */
  private async createTempFile(content: string, fileName: string, prefix: string): Promise<vscode.Uri> {
    await fs.mkdir(this.tempDir, { recursive: true });
    const safeName = fileName.replace(/[/\\]/g, '_');
    const tempPath = path.join(this.tempDir, `${prefix}_${safeName}`);
    await fs.writeFile(tempPath, content, 'utf-8');
    return vscode.Uri.file(tempPath);
  }

  /**
   * Clean up all temporary files created for diff views.
   */
  private async cleanupTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        try {
          await fs.unlink(path.join(this.tempDir, file));
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch {
      // Temp directory may not exist
    }
  }

  dispose(): void {
    this.closeAllDiffs();
  }
}
