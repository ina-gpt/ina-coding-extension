import * as vscode from 'vscode';

export class CodeActionService {
  private static instance: CodeActionService;

  static getInstance(): CodeActionService {
    if (!CodeActionService.instance) {
      CodeActionService.instance = new CodeActionService();
    }
    return CodeActionService.instance;
  }

  async getCodeActions(document: vscode.TextDocument, range: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<vscode.CodeAction[]> {
    try {
      const context: vscode.CodeActionContext = { diagnostics: diagnostics || [], only: undefined, triggerKind: vscode.CodeActionTriggerKind.Invoke };
      const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', document.uri, range, undefined);
      return actions || [];
    } catch {
      return [];
    }
  }

  async getQuickFixes(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CodeAction[]> {
    const range = new vscode.Range(position, position);
    const actions = await this.getCodeActions(document, range);
    return actions.filter(a => a.kind?.value?.startsWith('quickfix'));
  }

  async getRefactorings(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[]> {
    const actions = await this.getCodeActions(document, range);
    return actions.filter(a => a.kind?.value?.startsWith('refactor'));
  }

  async applyCodeAction(action: vscode.CodeAction): Promise<void> {
    if (action.edit) {
      await vscode.workspace.applyEdit(action.edit);
    }
    if (action.command) {
      await vscode.commands.executeCommand(action.command.command, ...(action.command.arguments || []));
    }
  }

  async getAvailableActionsForDiagnostic(document: vscode.TextDocument, range: vscode.Range): Promise<{ title: string; kind: string; isPreferred: boolean }[]> {
    const actions = await this.getCodeActions(document, range);
    return actions.map(a => ({
      title: a.title,
      kind: a.kind?.value || 'unknown',
      isPreferred: a.isPreferred || false,
    }));
  }

  formatActionsForPrompt(actions: vscode.CodeAction[]): string {
    if (actions.length === 0) return 'No code actions available.';
    return `Available actions:\n${actions.map(a => `  - ${a.title} (${a.kind?.value || 'unknown'})`).join('\n')}`;
  }
}
