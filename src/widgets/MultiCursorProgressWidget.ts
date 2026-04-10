/**
 * Multi-Cursor Progress Widget
 *
 * Progress display for multi-cursor edit operations.
 */

import * as vscode from 'vscode';
import {
  MultiCursorSession, MultiCursorProgress, MultiCursorEditResult, CursorPosition,
} from '../services/multicursor/MultiCursorTypes';

// ============ Multi-Cursor Progress Widget ============

export class MultiCursorProgressWidget implements vscode.Disposable {
  private progressBar: vscode.StatusBarItem;
  private cursorIndicator: vscode.StatusBarItem;
  private minimapDecorations: vscode.TextEditorDecorationType[] = [];

  constructor() {
    this.progressBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
    this.progressBar.name = 'INA Multi-Cursor Progress';

    this.cursorIndicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 199);
    this.cursorIndicator.name = 'INA Multi-Cursor Count';
  }

  // ============ Progress Display ============

  showProgress(session: MultiCursorSession): void {
    this.progressBar.text = `$(sync~spin) Editing ${session.cursors.length} cursors...`;
    this.progressBar.tooltip = `Mode: ${session.mode} | Session: ${session.id.substring(0, 8)}`;
    this.progressBar.show();

    this.showCursorCount(session.cursors.length);
  }

  updateProgress(progress: MultiCursorProgress): void {
    this.progressBar.text = `$(sync~spin) ${progress.message}`;
    this.progressBar.tooltip = `${progress.current}/${progress.total} - ${progress.phase}`;
  }

  showGenerating(cursorIndex: number, total: number): void {
    this.progressBar.text = `$(loading~spin) Generating edit ${cursorIndex}/${total}...`;
    this.progressBar.show();
  }

  showApplying(cursorIndex: number, total: number): void {
    this.progressBar.text = `$(loading~spin) Applying edit ${cursorIndex}/${total}...`;
    this.progressBar.show();
  }

  // ============ Complete / Error ============

  showComplete(result: MultiCursorEditResult): void {
    this.progressBar.text = `$(check) ${result.accepted} accepted, ${result.rejected} rejected`;
    if (result.errors > 0) {
      this.progressBar.text += `, ${result.errors} errors`;
    }
    this.progressBar.color = new vscode.ThemeColor('charts.green');
    this.progressBar.show();

    setTimeout(() => this.hide(), 3000);
  }

  showError(message: string): void {
    this.progressBar.text = `$(error) ${message}`;
    this.progressBar.color = new vscode.ThemeColor('charts.red');
    this.progressBar.show();

    setTimeout(() => this.hide(), 5000);
  }

  // ============ Cursor Count ============

  showCursorCount(count: number): void {
    this.cursorIndicator.text = `$(list-selection) ${count} cursors`;
    this.cursorIndicator.tooltip = `${count} active cursors for multi-cursor edit`;
    this.cursorIndicator.show();
  }

  // ============ Minimap ============

  createMinimap(editor: vscode.TextEditor, cursors: CursorPosition[]): void {
    this.clearMinimap(editor);

    const decType = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: '#4CAF50',
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });

    const ranges = cursors.map(c => ({
      range: c.range,
      hoverMessage: `Cursor #${c.index + 1}`,
    }));

    editor.setDecorations(decType, ranges);
    this.minimapDecorations.push(decType);
  }

  private clearMinimap(editor: vscode.TextEditor): void {
    for (const dec of this.minimapDecorations) {
      editor.setDecorations(dec, []);
      dec.dispose();
    }
    this.minimapDecorations = [];
  }

  // ============ Hide ============

  hide(): void {
    this.progressBar.hide();
    this.progressBar.color = undefined;
    this.cursorIndicator.hide();
  }

  // ============ Dispose ============

  dispose(): void {
    this.progressBar.dispose();
    this.cursorIndicator.dispose();
    for (const dec of this.minimapDecorations) dec.dispose();
  }
}
