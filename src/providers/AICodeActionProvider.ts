/**
 * AICodeActionProvider.ts — Phase 23 Feature 4
 * Quick Fix integration: "INA-7 Pro: Fix this" and "Explain this error" in Cmd+.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/Logger';

export class AICodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    if (context.diagnostics.length === 0) return [];

    const actions: vscode.CodeAction[] = [];
    const firstDiag = context.diagnostics[0];
    const shortMsg = firstDiag.message.length > 60 ? firstDiag.message.slice(0, 57) + '...' : firstDiag.message;

    // "Fix this" action
    const fixAction = new vscode.CodeAction(
      `INA-7 Pro: Fix "${shortMsg}"`,
      vscode.CodeActionKind.QuickFix
    );
    fixAction.command = {
      command: 'inaCoding.quickFix',
      title: 'Fix with INA-7 Pro',
      arguments: [document.uri, range, context.diagnostics],
    };
    fixAction.diagnostics = [firstDiag];
    fixAction.isPreferred = false;
    actions.push(fixAction);

    // "Explain this error" action
    const explainAction = new vscode.CodeAction(
      `INA-7 Pro: Explain "${shortMsg}"`,
      vscode.CodeActionKind.QuickFix
    );
    explainAction.command = {
      command: 'inaCoding.explainError',
      title: 'Explain with INA-7 Pro',
      arguments: [document.uri, range, context.diagnostics],
    };
    explainAction.diagnostics = [firstDiag];
    actions.push(explainAction);

    return actions;
  }
}

export function registerAICodeActions(context: vscode.ExtensionContext, chatViewProvider: any): void {
  // Register code action provider for all file types
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      new AICodeActionProvider(),
      { providedCodeActionKinds: AICodeActionProvider.providedCodeActionKinds }
    )
  );

  // Command: Fix with AI
  context.subscriptions.push(
    vscode.commands.registerCommand('inaCoding.quickFix', async (
      uri: vscode.Uri, range: vscode.Range, diagnostics: vscode.Diagnostic[]
    ) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      const errorLine = range.start.line;
      const contextStart = Math.max(0, errorLine - 10);
      const contextEnd = Math.min(doc.lineCount, errorLine + 10);
      const surroundingCode = doc.getText(new vscode.Range(contextStart, 0, contextEnd, 0));
      const fileName = path.basename(uri.fsPath);
      const language = doc.languageId;

      const errorMessages = diagnostics.map(d => `[${d.source || 'lint'}] ${d.message}`).join('\n');
      const prompt = `Fix this error in ${fileName} (${language}) at line ${errorLine + 1}:\n\nErrors:\n${errorMessages}\n\nCode:\n\`\`\`${language}\n${surroundingCode}\n\`\`\`\n\nProvide ONLY the fixed code, no explanation.`;

      // Send to chat
      if (chatViewProvider?.addCodeToChat) {
        chatViewProvider.addCodeToChat(surroundingCode, language, fileName);
      }
      // Also open chat with the fix request
      await vscode.commands.executeCommand('inaCoding.openChat');
      try {
        chatViewProvider?._post?.({ type: 'addCodeToChat', code: `Fix: ${errorMessages}`, language: 'text', fileName: 'error' });
      } catch { /* */ }
    })
  );

  // Command: Explain error
  context.subscriptions.push(
    vscode.commands.registerCommand('inaCoding.explainError', async (
      uri: vscode.Uri, range: vscode.Range, diagnostics: vscode.Diagnostic[]
    ) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      const errorMessages = diagnostics.map(d => `${d.message} (${d.source || ''})`).join(', ');
      const fileName = path.basename(uri.fsPath);

      await vscode.commands.executeCommand('inaCoding.openChat');
      try {
        chatViewProvider?._post?.({ type: 'addCodeToChat', code: `Explain this error in ${fileName}: ${errorMessages}`, language: 'text', fileName: 'error-explain' });
      } catch { /* */ }
    })
  );
}
