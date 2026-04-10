/**
 * Diff Line Action Provider
 *
 * Hover provider for line-level accept/reject actions.
 */

import * as vscode from 'vscode';
import { DiffPreviewState, DiffLineType, DiffLine, DiffHunk } from '../services/diff/DiffTypes';

// ============ Diff Line Action Provider ============

export class DiffLineActionProvider implements vscode.HoverProvider {
  private activeState: DiffPreviewState | null = null;

  // ============ Hover Provider ============

  provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.Hover | null {
    if (!this.activeState) return null;

    const lineNumber = position.line;

    // Find the hunk and line at this position
    for (const hunk of this.activeState.diffResult.hunks) {
      for (const line of hunk.lines) {
        if (line.lineNumber === lineNumber && line.type !== DiffLineType.UNCHANGED) {
          return new vscode.Hover(
            this.createHoverContent(line, hunk),
            new vscode.Range(lineNumber, 0, lineNumber, document.lineAt(lineNumber).text.length)
          );
        }
      }
    }

    return null;
  }

  // ============ State ============

  setActiveState(state: DiffPreviewState | null): void {
    this.activeState = state;
  }

  // ============ Hover Content ============

  private createHoverContent(line: DiffLine, hunk: DiffHunk): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;

    // Status indicator
    switch (line.type) {
      case DiffLineType.ADDED:
        md.appendMarkdown('**$(add) Added Line**\n\n');
        break;
      case DiffLineType.REMOVED:
        md.appendMarkdown('**$(remove) Removed Line**\n\n');
        break;
      case DiffLineType.MODIFIED:
        md.appendMarkdown('**$(edit) Modified Line**\n\n');
        break;
    }

    // Show original for modified lines
    if (line.originalContent && line.type === DiffLineType.MODIFIED) {
      md.appendMarkdown('Original: `' + line.originalContent.trim() + '`\n\n');
    }

    // Action links
    const acceptLineUri = this.createCommandUri('inaCoding.acceptLine', [line.lineNumber]);
    const rejectLineUri = this.createCommandUri('inaCoding.rejectLine', [line.lineNumber]);
    const acceptHunkUri = this.createCommandUri('inaCoding.acceptHunk', [hunk.id]);
    const rejectHunkUri = this.createCommandUri('inaCoding.rejectHunk', [hunk.id]);

    md.appendMarkdown(`[$(check) Accept Line](${acceptLineUri}) | [$(close) Reject Line](${rejectLineUri})\n\n`);
    md.appendMarkdown(`[$(check-all) Accept Hunk](${acceptHunkUri}) | [$(close-all) Reject Hunk](${rejectHunkUri})`);

    return md;
  }

  // ============ Command URI ============

  private createCommandUri(command: string, args: any[]): string {
    return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
  }
}
