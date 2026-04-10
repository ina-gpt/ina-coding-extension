/**
 * Inline Edit CodeLens Provider
 *
 * Shows CodeLens hints on selection for inline edit.
 */

import * as vscode from 'vscode';
import { InlineEditService } from '../services/InlineEditService';

// ============ CodeLens Provider ============

export class InlineEditCodeLensProvider implements vscode.CodeLensProvider {
  private editService: InlineEditService;
  private onDidChangeEmitter = new vscode.EventEmitter<void>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSelection: vscode.Selection | null = null;
  private disposables: vscode.Disposable[] = [];

  readonly onDidChangeCodeLenses = this.onDidChangeEmitter.event;

  constructor(editService: InlineEditService) {
    this.editService = editService;

    // Listen for selection changes
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        const showCodeLens = vscode.workspace.getConfiguration('inaCoding.inlineEdit').get<boolean>('showCodeLens', true);
        if (!showCodeLens) return;

        if (this.debounceTimer) clearTimeout(this.debounceTimer);

        this.debounceTimer = setTimeout(() => {
          this.currentSelection = e.textEditor.selection;
          this.onDidChangeEmitter.fire();
        }, 300);
      })
    );
  }

  provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
    const showCodeLens = vscode.workspace.getConfiguration('inaCoding.inlineEdit').get<boolean>('showCodeLens', true);
    if (!showCodeLens) return [];

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) return [];

    const selection = this.currentSelection || editor.selection;
    if (selection.isEmpty) return [];

    // Only show for meaningful selections
    const text = document.getText(selection);
    if (text.length < 10 || text.length > 50000) return [];

    const lines = selection.end.line - selection.start.line;
    if (lines > 200) return [];

    const isMac = process.platform === 'darwin';
    const shortcut = isMac ? '\u2318K' : 'Ctrl+K';

    const codeLens = new vscode.CodeLens(
      new vscode.Range(selection.start, selection.start),
      {
        title: `$(edit) Edit with AI (${shortcut})`,
        command: 'inaCoding.inlineEdit',
        arguments: [{ source: 'codeLens' }],
      }
    );

    return [codeLens];
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.onDidChangeEmitter.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
