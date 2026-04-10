import * as vscode from 'vscode';
import { DiagnosticService } from '../services/lsp/DiagnosticService';

export class DiagnosticEnhancerProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  async provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): Promise<vscode.CodeAction[]> {
    const enabled = vscode.workspace.getConfiguration('inaCoding.lsp').get<boolean>('showDiagnosticActions', true);
    if (!enabled) return [];

    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Error || diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
        const fixAction = new vscode.CodeAction(`Fix with INA Coding AI`, vscode.CodeActionKind.QuickFix);
        fixAction.diagnostics = [diagnostic];
        fixAction.command = {
          command: 'inaCoding.fixErrorWithAI',
          title: 'Fix with AI',
          arguments: [document.uri, diagnostic],
        };
        actions.push(fixAction);

        const explainAction = new vscode.CodeAction(`Explain this error (INA)`, vscode.CodeActionKind.QuickFix);
        explainAction.diagnostics = [diagnostic];
        explainAction.command = {
          command: 'inaCoding.explainError',
          title: 'Explain Error',
          arguments: [document.uri, diagnostic],
        };
        actions.push(explainAction);
      }
    }

    return actions;
  }
}
