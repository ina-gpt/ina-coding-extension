/**
 * Diff CodeLens Provider
 *
 * Shows accept/reject CodeLens actions on each diff hunk.
 */

import * as vscode from 'vscode';
import { DiffPreviewState, DiffHunk, DiffLineType } from '../services/diff/DiffTypes';

// ============ Diff CodeLens Provider ============

export class DiffCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private diffState: Map<string, DiffPreviewState> = new Map();
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  // ============ Provide CodeLenses ============

  provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

    for (const [, state] of this.diffState) {
      // Global actions at top
      const topRange = new vscode.Range(0, 0, 0, 0);
      lenses.push(this.createAcceptAllLens(state, topRange));
      lenses.push(this.createRejectAllLens(state, topRange));
      lenses.push(this.createEditLens(topRange));
      lenses.push(this.createToggleViewLens(topRange));

      // Per-hunk actions
      for (const hunk of state.diffResult.hunks) {
        if (hunk.applied) continue;

        const hunkLine = Math.max(0, hunk.startLine);
        const range = new vscode.Range(hunkLine, 0, hunkLine, 0);

        lenses.push(this.createAcceptHunkLens(hunk, range));
        lenses.push(this.createRejectHunkLens(hunk, range));
        lenses.push(this.createHunkInfoLens(hunk, range));
      }
    }

    return lenses;
  }

  resolveCodeLens(codeLens: vscode.CodeLens, _token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }

  // ============ State Management ============

  setState(sessionId: string, state: DiffPreviewState): void {
    this.diffState.set(sessionId, state);
    this.onDidChangeCodeLensesEmitter.fire();
  }

  clearState(sessionId: string): void {
    this.diffState.delete(sessionId);
    this.onDidChangeCodeLensesEmitter.fire();
  }

  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  hasActiveState(): boolean {
    return this.diffState.size > 0;
  }

  // ============ Lens Creators ============

  private createAcceptAllLens(state: DiffPreviewState, range: vscode.Range): vscode.CodeLens {
    const pendingHunks = state.diffResult.hunks.filter(h => !h.applied).length;
    return new vscode.CodeLens(range, {
      title: `$(check) Accept All Changes (${pendingHunks})`,
      command: 'inaCoding.acceptInlineEdit',
      tooltip: 'Accept all changes',
    });
  }

  private createRejectAllLens(state: DiffPreviewState, range: vscode.Range): vscode.CodeLens {
    return new vscode.CodeLens(range, {
      title: '$(close) Reject All Changes',
      command: 'inaCoding.rejectInlineEdit',
      tooltip: 'Reject all changes and restore original',
    });
  }

  private createEditLens(range: vscode.Range): vscode.CodeLens {
    return new vscode.CodeLens(range, {
      title: '$(edit) Edit Before Accept',
      command: 'inaCoding.editBeforeAccept',
      tooltip: 'Edit the generated code before accepting',
    });
  }

  private createToggleViewLens(range: vscode.Range): vscode.CodeLens {
    return new vscode.CodeLens(range, {
      title: '$(split-horizontal) Side-by-Side View',
      command: 'inaCoding.toggleDiffView',
      tooltip: 'Toggle between inline and side-by-side diff view',
    });
  }

  private createAcceptHunkLens(hunk: DiffHunk, range: vscode.Range): vscode.CodeLens {
    return new vscode.CodeLens(range, {
      title: '$(check) Accept',
      command: 'inaCoding.acceptHunk',
      arguments: [hunk.id],
      tooltip: 'Accept this change',
    });
  }

  private createRejectHunkLens(hunk: DiffHunk, range: vscode.Range): vscode.CodeLens {
    return new vscode.CodeLens(range, {
      title: '$(close) Reject',
      command: 'inaCoding.rejectHunk',
      arguments: [hunk.id],
      tooltip: 'Reject this change',
    });
  }

  private createHunkInfoLens(hunk: DiffHunk, range: vscode.Range): vscode.CodeLens {
    const added = hunk.lines.filter(l => l.type === DiffLineType.ADDED).length;
    const removed = hunk.lines.filter(l => l.type === DiffLineType.REMOVED).length;
    return new vscode.CodeLens(range, {
      title: `+${added}/-${removed} lines`,
      command: '',
      tooltip: `${hunk.type}: ${added} additions, ${removed} deletions`,
    });
  }

  // ============ Dispose ============

  dispose(): void {
    this.diffState.clear();
    this.onDidChangeCodeLensesEmitter.dispose();
  }
}
