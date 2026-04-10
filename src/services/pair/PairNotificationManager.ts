/**
 * PairNotificationManager.ts — Phase 20 Step 20.1
 * Display proactive suggestions non-intrusively
 */

import * as vscode from 'vscode';
import { ProactiveSuggestion } from './PairTypes';
import { Logger } from '../../utils/Logger';

export class PairNotificationManager {
  private pendingSuggestions: ProactiveSuggestion[] = [];

  showSuggestion(suggestion: ProactiveSuggestion): void {
    this.pendingSuggestions.push(suggestion);

    switch (suggestion.priority) {
      case 'urgent':
        this.showModal(suggestion);
        break;
      case 'high':
        this.showNotification(suggestion);
        break;
      case 'medium':
        this.showNotification(suggestion);
        break;
      case 'low':
        this.showStatusBar(suggestion);
        break;
    }
  }

  private showNotification(suggestion: ProactiveSuggestion): void {
    const actions: string[] = [];
    if (suggestion.codeAction) actions.push('Apply Fix');
    actions.push('Dismiss');
    actions.push("Don't Show Again");

    vscode.window.showInformationMessage(
      `INA-7 Pro · ${suggestion.title}: ${suggestion.message}`,
      ...actions
    ).then(action => {
      if (action === 'Apply Fix' && suggestion.codeAction) {
        this.applyCodeAction(suggestion);
      } else if (action === "Don't Show Again") {
        this.onNeverShow?.(suggestion);
      }
      this.removePending(suggestion.id);
    });
  }

  private showModal(suggestion: ProactiveSuggestion): void {
    vscode.window.showWarningMessage(
      `INA-7 Pro · ${suggestion.title}\n\n${suggestion.message}`,
      { modal: true },
      'Fix Now'
    ).then(action => {
      if (action === 'Fix Now' && suggestion.codeAction) {
        this.applyCodeAction(suggestion);
      }
      this.removePending(suggestion.id);
    });
  }

  private showStatusBar(suggestion: ProactiveSuggestion): void {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 40);
    item.text = `$(lightbulb) ${suggestion.title}`;
    item.tooltip = suggestion.message;
    item.command = 'inaCoding.pair.showSuggestions';
    item.show();
    setTimeout(() => item.dispose(), Math.min(suggestion.expiresAfterMs, 30000));
  }

  private async applyCodeAction(suggestion: ProactiveSuggestion): Promise<void> {
    if (!suggestion.codeAction || !suggestion.file || !suggestion.line) return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    try {
      const line = suggestion.line - 1;
      const range = editor.document.lineAt(line).range;
      await editor.edit(builder => {
        builder.replace(range, suggestion.codeAction!);
      });
      vscode.window.showInformationMessage('INA-7 Pro · Fix applied');
    } catch (e) {
      Logger.error('[PairNotification] Failed to apply fix:', e);
    }
  }

  getPending(): ProactiveSuggestion[] {
    const now = Date.now();
    this.pendingSuggestions = this.pendingSuggestions.filter(s => now - s.timestamp < s.expiresAfterMs);
    return this.pendingSuggestions;
  }

  private removePending(id: string): void {
    this.pendingSuggestions = this.pendingSuggestions.filter(s => s.id !== id);
  }

  onNeverShow?: (suggestion: ProactiveSuggestion) => void;
}
