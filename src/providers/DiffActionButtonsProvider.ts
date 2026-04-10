/**
 * Diff Action Buttons Provider
 *
 * Floating action buttons and status bar buttons for diff preview.
 */

import * as vscode from 'vscode';
import { DiffPreviewState } from '../services/diff/DiffTypes';

// ============ Diff Action Buttons Provider ============

export class DiffActionButtonsProvider implements vscode.Disposable {
  private statusBarItems: vscode.StatusBarItem[] = [];
  private decorationType: vscode.TextEditorDecorationType | null = null;

  constructor() {
    this.createStatusBarButtons();
  }

  // ============ Inline Decoration Buttons ============

  showActionButtons(editor: vscode.TextEditor, range: vscode.Range, state: DiffPreviewState): void {
    this.hideActionButtons(editor);

    const isMac = process.platform === 'darwin';
    const acceptKey = isMac ? '\u2318Y' : 'Ctrl+Y';
    const rejectKey = isMac ? '\u2318N' : 'Ctrl+Shift+N';

    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` \u2713 Accept (${acceptKey})  \u2717 Reject (${rejectKey})  \u270f Edit  \u21c4 Split `,
        color: new vscode.ThemeColor('editorWidget.foreground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorWidget.border'),
        margin: '0 0 0 20px',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    const lastLine = new vscode.Range(range.end, range.end);
    editor.setDecorations(this.decorationType, [lastLine]);
  }

  hideActionButtons(editor: vscode.TextEditor): void {
    if (this.decorationType) {
      editor.setDecorations(this.decorationType, []);
      this.decorationType.dispose();
      this.decorationType = null;
    }
  }

  updateButtonState(editor: vscode.TextEditor, state: DiffPreviewState): void {
    if (state.isEditing) {
      this.hideActionButtons(editor);
      this.hideStatusBarButtons();
    } else {
      this.showStatusBarButtons();
    }
  }

  // ============ Status Bar Buttons ============

  private createStatusBarButtons(): void {
    const acceptBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1003);
    acceptBtn.text = '$(check) Accept';
    acceptBtn.command = 'inaCoding.acceptInlineEdit';
    acceptBtn.tooltip = 'Accept all changes';
    acceptBtn.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

    const rejectBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1002);
    rejectBtn.text = '$(close) Reject';
    rejectBtn.command = 'inaCoding.rejectInlineEdit';
    rejectBtn.tooltip = 'Reject all changes';

    const editBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1001);
    editBtn.text = '$(edit) Edit';
    editBtn.command = 'inaCoding.editBeforeAccept';
    editBtn.tooltip = 'Edit before accepting';

    const splitBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    splitBtn.text = '$(split-horizontal) Split View';
    splitBtn.command = 'inaCoding.toggleDiffView';
    splitBtn.tooltip = 'Toggle diff view mode';

    this.statusBarItems = [acceptBtn, rejectBtn, editBtn, splitBtn];
  }

  showStatusBarButtons(): void {
    for (const item of this.statusBarItems) {
      item.show();
    }
  }

  hideStatusBarButtons(): void {
    for (const item of this.statusBarItems) {
      item.hide();
    }
  }

  // ============ Dispose ============

  dispose(): void {
    if (this.decorationType) {
      this.decorationType.dispose();
    }
    for (const item of this.statusBarItems) {
      item.dispose();
    }
  }
}
