import * as vscode from 'vscode';
import { RULES_CONSTANTS } from '../services/rules/RulesTypes';

export class RulesCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.Refactor,
  ];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection
  ): vscode.CodeAction[] {
    if (!this.isRulesFile(document)) return [];

    const actions: vscode.CodeAction[] = [];
    const line = document.lineAt(range.start.line);
    const text = line.text.trim();

    // Add priority marker
    if ((text.startsWith('- ') || text.startsWith('* ')) && !text.includes('[!]') && !text.includes('[~]')) {
      const priorityAction = new vscode.CodeAction('Mark as high priority [!]', vscode.CodeActionKind.Refactor);
      const prefix = text.startsWith('- ') ? '- ' : '* ';
      const ruleText = text.substring(2);
      priorityAction.edit = new vscode.WorkspaceEdit();
      priorityAction.edit.replace(document.uri, line.range, `${prefix}[!] ${ruleText}`);
      actions.push(priorityAction);

      const disableAction = new vscode.CodeAction('Disable rule [~]', vscode.CodeActionKind.Refactor);
      disableAction.edit = new vscode.WorkspaceEdit();
      disableAction.edit.replace(document.uri, line.range, `${prefix}[~] ${ruleText}`);
      actions.push(disableAction);
    }

    // Remove priority/disabled marker
    if (text.includes('[!]')) {
      const removeAction = new vscode.CodeAction('Remove priority marker', vscode.CodeActionKind.QuickFix);
      removeAction.edit = new vscode.WorkspaceEdit();
      removeAction.edit.replace(document.uri, line.range, line.text.replace('[!] ', ''));
      actions.push(removeAction);
    }

    if (text.includes('[~]')) {
      const enableAction = new vscode.CodeAction('Enable rule (remove [~])', vscode.CodeActionKind.QuickFix);
      enableAction.edit = new vscode.WorkspaceEdit();
      enableAction.edit.replace(document.uri, line.range, line.text.replace('[~] ', ''));
      actions.push(enableAction);
    }

    // Add section header suggestions for empty lines
    if (text === '') {
      const addSection = new vscode.CodeAction('Add rules section', vscode.CodeActionKind.Refactor);
      addSection.command = {
        command: 'inaCoding.rules.addSection',
        title: 'Add Rules Section',
      };
      actions.push(addSection);
    }

    // Convert plain text to rule list item
    if (text && !text.startsWith('-') && !text.startsWith('*') && !text.startsWith('#') && !text.startsWith('---')) {
      const convertAction = new vscode.CodeAction('Convert to rule item', vscode.CodeActionKind.Refactor);
      convertAction.edit = new vscode.WorkspaceEdit();
      convertAction.edit.replace(document.uri, line.range, `- ${text}`);
      actions.push(convertAction);
    }

    return actions;
  }

  private isRulesFile(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.split('/').pop() || '';
    return fileName === RULES_CONSTANTS.FILE_NAME || (RULES_CONSTANTS.ALT_FILE_NAMES as readonly string[]).includes(fileName);
  }
}
