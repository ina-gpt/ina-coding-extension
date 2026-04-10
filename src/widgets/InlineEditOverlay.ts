/**
 * Inline Edit Overlay
 *
 * Overlay decoration showing input hint near selection.
 */

import * as vscode from 'vscode';

// ============ Overlay ============

export class InlineEditOverlay implements vscode.Disposable {
  private static instance: InlineEditOverlay;
  private activeDecoration: vscode.TextEditorDecorationType | null = null;
  private activeEditor: vscode.TextEditor | undefined;

  private constructor() {}

  static getInstance(): InlineEditOverlay {
    if (!InlineEditOverlay.instance) {
      InlineEditOverlay.instance = new InlineEditOverlay();
    }
    return InlineEditOverlay.instance;
  }

  // ============ Show ============

  showAtSelection(editor: vscode.TextEditor, range: vscode.Range): void {
    this.hide();

    const isMac = process.platform === 'darwin';
    const shortcut = isMac ? '\u2318K' : 'Ctrl+K';

    this.activeDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ${shortcut} to edit \u2022 ESC to cancel `,
        color: new vscode.ThemeColor('editorWidget.foreground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorWidget.border'),
        margin: '0 0 0 10px',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    this.activeEditor = editor;
    const firstLine = new vscode.Range(range.start, range.start);
    editor.setDecorations(this.activeDecoration, [firstLine]);
  }

  showInputIndicator(editor: vscode.TextEditor, range: vscode.Range): void {
    this.hide();

    this.activeDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ' \u270f\ufe0f Type your instruction... ',
        color: new vscode.ThemeColor('editorWidget.foreground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorInfo.foreground'),
        margin: '0 0 0 10px',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    this.activeEditor = editor;
    const firstLine = new vscode.Range(range.start, range.start);
    editor.setDecorations(this.activeDecoration, [firstLine]);
  }

  showGeneratingIndicator(editor: vscode.TextEditor, range: vscode.Range): void {
    this.hide();

    this.activeDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ' \u23f3 Generating... ',
        color: new vscode.ThemeColor('editorWidget.foreground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorInfo.foreground'),
        margin: '0 0 0 10px',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    this.activeEditor = editor;
    const firstLine = new vscode.Range(range.start, range.start);
    editor.setDecorations(this.activeDecoration, [firstLine]);
  }

  // ============ Progress & Status ============

  updateProgress(editor: vscode.TextEditor, range: vscode.Range, partialCode: string): void {
    this.hide();

    const lines = partialCode.split('\n').length;
    const chars = partialCode.length;

    this.activeDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` \u23f3 Generating... (${lines} lines, ${chars} chars) `,
        color: new vscode.ThemeColor('editorWidget.foreground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('editorInfo.foreground'),
        margin: '0 0 0 10px',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    this.activeEditor = editor;
    const firstLine = new vscode.Range(range.start, range.start);
    editor.setDecorations(this.activeDecoration, [firstLine]);
  }

  showError(editor: vscode.TextEditor, range: vscode.Range, message: string): void {
    this.hide();

    this.activeDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` \u274c ${message} `,
        color: new vscode.ThemeColor('errorForeground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('errorForeground'),
        margin: '0 0 0 10px',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    this.activeEditor = editor;
    const firstLine = new vscode.Range(range.start, range.start);
    editor.setDecorations(this.activeDecoration, [firstLine]);

    // Auto-hide after 5 seconds
    setTimeout(() => this.hide(), 5000);
  }

  showRetrying(editor: vscode.TextEditor, range: vscode.Range): void {
    this.hide();

    this.activeDecoration = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ' \ud83d\udd04 Retrying... ',
        color: new vscode.ThemeColor('editorWidget.foreground'),
        backgroundColor: new vscode.ThemeColor('editorWidget.background'),
        border: '1px solid',
        borderColor: new vscode.ThemeColor('charts.yellow'),
        margin: '0 0 0 10px',
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    this.activeEditor = editor;
    const firstLine = new vscode.Range(range.start, range.start);
    editor.setDecorations(this.activeDecoration, [firstLine]);
  }

  // ============ Hide ============

  hide(): void {
    if (this.activeDecoration && this.activeEditor) {
      this.activeEditor.setDecorations(this.activeDecoration, []);
      this.activeDecoration.dispose();
      this.activeDecoration = null;
    }
  }

  // ============ Dispose ============

  dispose(): void {
    this.hide();
  }
}
