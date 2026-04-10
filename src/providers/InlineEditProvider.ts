import * as vscode from 'vscode';
import { ApiService } from '../services/ApiService';
import { Logger } from '../utils/Logger';

export class InlineEditProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly apiService: ApiService
  ) {}

  async showInlineEdit() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    const instruction = await vscode.window.showInputBox({
      prompt: 'What would you like to do?',
      placeHolder: 'e.g., "Add error handling" or "Convert to async/await"',
    });

    if (!instruction) {
      return;
    }

    const code = selectedText || editor.document.getText();
    const language = editor.document.languageId;

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'INA Coding: Editing...',
          cancellable: true,
        },
        async (_progress, token) => {
          let fullResponse = '';

          for await (const chunk of this.apiService.editStream({
            instruction,
            code,
            language,
            filename: editor.document.fileName,
            selection: selectedText ? {
              startLine: selection.start.line + 1,
              endLine: selection.end.line + 1,
            } : undefined,
          })) {
            if (token.isCancellationRequested) {
              return;
            }
            fullResponse += chunk;
          }

          const editedCode = this.extractCode(fullResponse);
          if (editedCode) {
            await this.showDiffAndApply(editor, selection.isEmpty ? undefined : selection, editedCode);
          }
        }
      );
    } catch (error) {
      Logger.error('Inline edit error:', error);
      vscode.window.showErrorMessage(`Edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractCode(response: string): string | null {
    const match = response.match(/```[\w]*\n([\s\S]*?)```/);
    if (match) {
      return match[1].trim();
    }
    return response.trim();
  }

  private async showDiffAndApply(
    editor: vscode.TextEditor,
    selection: vscode.Selection | undefined,
    newCode: string
  ) {
    const range = selection || new vscode.Range(
      0, 0,
      editor.document.lineCount - 1,
      editor.document.lineAt(editor.document.lineCount - 1).text.length
    );

    const result = await vscode.window.showInformationMessage(
      'Apply changes?',
      { modal: true },
      'Apply',
      'Copy to Clipboard'
    );

    if (result === 'Apply') {
      await editor.edit(editBuilder => {
        editBuilder.replace(range, newCode);
      });
    } else if (result === 'Copy to Clipboard') {
      await vscode.env.clipboard.writeText(newCode);
      vscode.window.showInformationMessage('Code copied to clipboard');
    }
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}
