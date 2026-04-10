/**
 * Multi-Cursor CodeLens Provider
 *
 * Shows accept/reject CodeLens actions for each cursor in a multi-cursor session.
 */

import * as vscode from 'vscode';
import { MultiCursorSession, CursorPosition, CursorEdit } from '../services/multicursor/MultiCursorTypes';

// ============ Multi-Cursor CodeLens Provider ============

export class MultiCursorCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private activeSession: MultiCursorSession | null = null;
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  // ============ Provide ============

  provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
    if (!this.activeSession) return [];

    const lenses: vscode.CodeLens[] = [];
    const session = this.activeSession;

    // Global actions at top
    const topRange = new vscode.Range(0, 0, 0, 0);

    lenses.push(new vscode.CodeLens(topRange, {
      title: `$(check-all) Accept All (${session.cursors.length} cursors)`,
      command: 'inaCoding.multiCursorAcceptAll',
      tooltip: 'Accept all cursor edits',
    }));

    lenses.push(new vscode.CodeLens(topRange, {
      title: '$(close-all) Reject All',
      command: 'inaCoding.multiCursorRejectAll',
      tooltip: 'Reject all cursor edits',
    }));

    lenses.push(new vscode.CodeLens(topRange, {
      title: `$(settings-gear) Mode: ${session.mode}`,
      command: 'inaCoding.multiCursorChangeMode',
      tooltip: `Current mode: ${session.mode}`,
    }));

    // Per-cursor actions
    for (const cursor of session.cursors) {
      const edit = session.edits.get(cursor.id);
      const cursorLenses = this.createCursorLenses(cursor, edit, cursor.index);
      lenses.push(...cursorLenses);
    }

    return lenses;
  }

  resolveCodeLens(codeLens: vscode.CodeLens, _token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }

  // ============ State ============

  setSession(session: MultiCursorSession | null): void {
    this.activeSession = session;
    this.onDidChangeCodeLensesEmitter.fire();
  }

  refresh(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  // ============ Per-Cursor Lenses ============

  private createCursorLenses(cursor: CursorPosition, edit: CursorEdit | undefined, index: number): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const line = Math.max(0, cursor.lineNumber);
    const range = new vscode.Range(line, 0, line, 0);

    const statusIcon = this.getStatusIcon(edit?.status || 'pending');

    lenses.push(new vscode.CodeLens(range, {
      title: `#${index + 1} ${statusIcon} Accept`,
      command: 'inaCoding.multiCursorAcceptOne',
      arguments: [cursor.id],
      tooltip: `Accept cursor #${index + 1} edit`,
    }));

    lenses.push(new vscode.CodeLens(range, {
      title: `#${index + 1} $(close) Reject`,
      command: 'inaCoding.multiCursorRejectOne',
      arguments: [cursor.id],
      tooltip: `Reject cursor #${index + 1} edit`,
    }));

    // Status info
    const statusText = edit?.status || 'pending';
    if (edit?.error) {
      lenses.push(new vscode.CodeLens(range, {
        title: `$(warning) Error: ${edit.error.substring(0, 40)}`,
        command: '',
        tooltip: edit.error,
      }));
    }

    return lenses;
  }

  private getStatusIcon(status: CursorEdit['status']): string {
    switch (status) {
      case 'pending': return '$(circle-outline)';
      case 'accepted': return '$(check)';
      case 'rejected': return '$(close)';
      case 'error': return '$(warning)';
      default: return '$(circle-outline)';
    }
  }

  // ============ Dispose ============

  dispose(): void {
    this.activeSession = null;
    this.onDidChangeCodeLensesEmitter.dispose();
  }
}
