/**
 * Side-by-Side Diff Provider
 *
 * Uses VS Code's built-in diff editor for side-by-side comparison.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

// ============ Side-by-Side Diff Provider ============

export class SideBySideDiffProvider implements vscode.Disposable {
  private diffEditors: Map<string, { left: vscode.Uri; right: vscode.Uri }> = new Map();
  private tempDir: string;
  private initPromise: Promise<void>;

  constructor(storagePath: string) {
    this.tempDir = path.join(storagePath, 'diff-temp');
    // Track init promise so callers can await it if needed
    this.initPromise = this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      // Only ignore EEXIST — log other errors
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        console.warn('Failed to create diff temp dir:', error);
      }
    }
  }

  // ============ Show Diff ============

  async showSideBySideDiff(
    sessionId: string,
    original: string,
    modified: string,
    fileName: string,
    language: string
  ): Promise<void> {
    const ext = path.extname(fileName) || `.${language}`;
    const baseName = path.basename(fileName, ext);

    const leftUri = await this.createTempFile(sessionId, original, 'original', ext);
    const rightUri = await this.createTempFile(sessionId, modified, 'modified', ext);

    this.diffEditors.set(sessionId, { left: leftUri, right: rightUri });

    const title = `INA Edit: ${baseName}${ext} (Review Changes)`;

    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title, {
      preview: true,
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  // ============ Temp Files ============

  private async createTempFile(sessionId: string, content: string, suffix: string, extension: string): Promise<vscode.Uri> {
    await this.initPromise; // Ensure constructor's init completed
    const fileName = `${sessionId}-${suffix}${extension}`;
    const filePath = path.join(this.tempDir, fileName);
    await fs.writeFile(filePath, content, 'utf-8');
    return vscode.Uri.file(filePath);
  }

  // ============ Update ============

  async updateModifiedContent(sessionId: string, newContent: string): Promise<void> {
    const editors = this.diffEditors.get(sessionId);
    if (!editors) return;

    await fs.writeFile(editors.right.fsPath, newContent, 'utf-8');

    // Reopen to refresh
    await vscode.commands.executeCommand('vscode.diff',
      editors.left,
      editors.right,
      `INA Edit: (Review Changes)`,
      { preview: true }
    );
  }

  // ============ Close ============

  async closeDiffEditor(sessionId: string): Promise<void> {
    // Close any tab that matches our diff
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.label.includes('INA Edit:') && tab.label.includes('Review Changes')) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }

    this.cleanupTempFiles(sessionId);
  }

  isDiffEditorOpen(sessionId: string): boolean {
    return this.diffEditors.has(sessionId);
  }

  async focusDiffEditor(sessionId: string): Promise<void> {
    const editors = this.diffEditors.get(sessionId);
    if (!editors) return;

    await vscode.commands.executeCommand('vscode.diff',
      editors.left,
      editors.right,
      `INA Edit: (Review Changes)`,
      { preview: true }
    );
  }

  // ============ Content ============

  async getDiffEditorContent(sessionId: string): Promise<{ original: string; modified: string } | null> {
    const editors = this.diffEditors.get(sessionId);
    if (!editors) return null;

    try {
      const original = await fs.readFile(editors.left.fsPath, 'utf-8');
      const modified = await fs.readFile(editors.right.fsPath, 'utf-8');
      return { original, modified };
    } catch (error) {
      console.warn('Failed to read diff editor content:', error);
      return null;
    }
  }

  // ============ Cleanup ============

  cleanupTempFiles(sessionId: string): void {
    const editors = this.diffEditors.get(sessionId);
    if (!editors) return;

    fs.unlink(editors.left.fsPath).catch(() => {});
    fs.unlink(editors.right.fsPath).catch(() => {});
    this.diffEditors.delete(sessionId);
  }

  cleanupAllTempFiles(): void {
    for (const [sessionId] of this.diffEditors) {
      this.cleanupTempFiles(sessionId);
    }
    fs.rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
  }

  // ============ Dispose ============

  dispose(): void {
    this.cleanupAllTempFiles();
  }
}
