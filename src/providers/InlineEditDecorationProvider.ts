/**
 * Inline Edit Decoration Provider
 *
 * Visual decorations for inline edit selection and status.
 */

import * as vscode from 'vscode';

// ============ Decoration Provider ============

export class InlineEditDecorationProvider {
  private static instance: InlineEditDecorationProvider;

  private selectionHighlight: vscode.TextEditorDecorationType;
  private editingIndicator: vscode.TextEditorDecorationType;
  private successIndicator: vscode.TextEditorDecorationType;
  private rejectIndicator: vscode.TextEditorDecorationType;

  private activeDecorations: Map<string, vscode.TextEditorDecorationType[]> = new Map();

  private constructor() {
    this.selectionHighlight = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor('editor.selectionBackground'),
      borderRadius: '2px',
      isWholeLine: false,
    });

    this.editingIndicator = vscode.window.createTextEditorDecorationType({
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: new vscode.ThemeColor('editorInfo.foreground'),
      isWholeLine: true,
      overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });

    this.successIndicator = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(40, 167, 69, 0.15)',
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: 'rgba(40, 167, 69, 0.6)',
      isWholeLine: true,
    });

    this.rejectIndicator = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(220, 53, 69, 0.15)',
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: 'rgba(220, 53, 69, 0.6)',
      isWholeLine: true,
    });
  }

  static getInstance(): InlineEditDecorationProvider {
    if (!InlineEditDecorationProvider.instance) {
      InlineEditDecorationProvider.instance = new InlineEditDecorationProvider();
    }
    return InlineEditDecorationProvider.instance;
  }

  // ============ Show Decorations ============

  showSelectionHighlight(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.setDecorations(this.selectionHighlight, [range]);
    this.trackDecoration(editor, this.selectionHighlight);
  }

  hideSelectionHighlight(editor: vscode.TextEditor): void {
    editor.setDecorations(this.selectionHighlight, []);
  }

  showEditingIndicator(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.setDecorations(this.editingIndicator, [range]);
    this.trackDecoration(editor, this.editingIndicator);
  }

  showSuccessIndicator(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.setDecorations(this.successIndicator, [range]);

    // Flash effect: remove after 300ms
    setTimeout(() => {
      editor.setDecorations(this.successIndicator, []);
    }, 300);
  }

  showRejectIndicator(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.setDecorations(this.rejectIndicator, [range]);

    // Flash effect: remove after 300ms
    setTimeout(() => {
      editor.setDecorations(this.rejectIndicator, []);
    }, 300);
  }

  // ============ Clear ============

  clearAllDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.selectionHighlight, []);
    editor.setDecorations(this.editingIndicator, []);
    editor.setDecorations(this.successIndicator, []);
    editor.setDecorations(this.rejectIndicator, []);

    const key = editor.document.uri.toString();
    this.activeDecorations.delete(key);
  }

  // ============ Tracking ============

  private trackDecoration(editor: vscode.TextEditor, type: vscode.TextEditorDecorationType): void {
    const key = editor.document.uri.toString();
    const existing = this.activeDecorations.get(key) || [];
    if (!existing.includes(type)) {
      existing.push(type);
      this.activeDecorations.set(key, existing);
    }
  }

  // ============ Dispose ============

  dispose(): void {
    this.selectionHighlight.dispose();
    this.editingIndicator.dispose();
    this.successIndicator.dispose();
    this.rejectIndicator.dispose();
    this.activeDecorations.clear();
  }
}
