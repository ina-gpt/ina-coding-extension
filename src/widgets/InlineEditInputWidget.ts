/**
 * Inline Edit Input Widget
 *
 * Floating input widget for inline edit prompts.
 */

import * as vscode from 'vscode';
import { InlineEditSession } from '../services/InlineEditService';
import { InlineEditHistory } from '../services/InlineEditHistory';
import { InlineEditQuickPick, HistoryItem } from './InlineEditQuickPick';

// ============ Types ============

export interface QuickAction {
  label: string;
  description: string;
  icon: string;
  action: string;
  prompt?: string;
}

// ============ Constants ============

export const QUICK_ACTIONS: QuickAction[] = [
  { label: '$(edit) Refactor', description: 'Improve code structure', icon: 'edit', action: 'refactor', prompt: 'Refactor this code to be more readable and maintainable' },
  { label: '$(bug) Fix Bug', description: 'Fix issues in code', icon: 'bug', action: 'fix', prompt: 'Fix any bugs or issues in this code' },
  { label: '$(comment) Add Comments', description: 'Document the code', icon: 'comment', action: 'comment', prompt: 'Add clear comments explaining this code' },
  { label: '$(beaker) Add Tests', description: 'Generate unit tests', icon: 'beaker', action: 'test', prompt: 'Generate unit tests for this code' },
  { label: '$(zap) Optimize', description: 'Improve performance', icon: 'zap', action: 'optimize', prompt: 'Optimize this code for better performance' },
  { label: '$(shield) Add Error Handling', description: 'Add try-catch', icon: 'shield', action: 'error', prompt: 'Add proper error handling to this code' },
  { label: '$(symbol-type-parameter) Add Types', description: 'Add TypeScript types', icon: 'symbol-type-parameter', action: 'types', prompt: 'Add TypeScript type annotations to this code' },
  { label: '$(book) Explain', description: 'Explain what this does', icon: 'book', action: 'explain', prompt: 'Explain what this code does step by step' },
];

// ============ Input Widget ============

export class InlineEditInputWidget implements vscode.Disposable {
  private session: InlineEditSession;
  private history: InlineEditHistory;
  private disposables: vscode.Disposable[] = [];
  private isVisible = false;
  private resolvePromise: ((value: string | undefined) => void) | null = null;

  constructor(session: InlineEditSession, history: InlineEditHistory) {
    this.session = session;
    this.history = history;
  }

  // ============ Show/Hide ============

  async show(): Promise<string | undefined> {
    return new Promise<string | undefined>((resolve) => {
      this.resolvePromise = resolve;

      const inputBox = vscode.window.createInputBox();
      inputBox.title = 'INA: Edit with AI';
      inputBox.placeholder = 'Describe the changes you want... (\u2191 for history, Tab for actions)';
      inputBox.prompt = this.buildPromptInfo();
      inputBox.ignoreFocusOut = false;

      inputBox.buttons = [
        { iconPath: new vscode.ThemeIcon('history'), tooltip: 'Recent prompts' },
        { iconPath: new vscode.ThemeIcon('symbol-event'), tooltip: 'Quick actions' },
      ];

      this.disposables.push(
        inputBox.onDidAccept(() => {
          const value = inputBox.value.trim();
          if (value) {
            inputBox.hide();
            this.resolvePromise?.(value);
            this.resolvePromise = null;
          }
        }),

        inputBox.onDidHide(() => {
          if (this.resolvePromise) {
            this.resolvePromise(undefined);
            this.resolvePromise = null;
          }
          this.isVisible = false;
          inputBox.dispose();
        }),

        inputBox.onDidTriggerButton((button) => {
          if (button.tooltip === 'Recent prompts') {
            inputBox.hide();
            this.showHistory();
          } else if (button.tooltip === 'Quick actions') {
            inputBox.hide();
            this.showQuickActions();
          }
        }),

        inputBox.onDidChangeValue((value) => {
          // Could show inline suggestions here in future
        }),
      );

      this.isVisible = true;
      inputBox.show();
    });
  }

  hide(): void {
    if (this.resolvePromise) {
      this.resolvePromise(undefined);
      this.resolvePromise = null;
    }
  }

  // ============ Quick Actions ============

  async showQuickActions(): Promise<void> {
    const items = QUICK_ACTIONS.map(a => ({
      label: a.label,
      description: a.description,
      prompt: a.prompt || '',
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: 'INA: Quick Actions',
      placeHolder: 'Select an action...',
    });

    if (selected && selected.prompt) {
      this.resolvePromise?.(selected.prompt);
      this.resolvePromise = null;
    } else {
      // Re-show input
      const result = await this.show();
      if (result) {
        this.resolvePromise?.(result);
        this.resolvePromise = null;
      }
    }
  }

  // ============ History ============

  async showHistory(): Promise<void> {
    const entries = this.history.getRecent(20);

    if (entries.length === 0) {
      vscode.window.showInformationMessage('No edit history yet');
      const result = await this.show();
      return;
    }

    const items = InlineEditQuickPick.createHistoryItems(entries);

    const selected = await vscode.window.showQuickPick(items, {
      title: 'INA: Recent Prompts',
      placeHolder: 'Select a previous prompt...',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected) {
      this.resolvePromise?.(selected.prompt);
      this.resolvePromise = null;
    } else {
      const result = await this.show();
      if (result) {
        this.resolvePromise?.(result);
        this.resolvePromise = null;
      }
    }
  }

  // ============ Helpers ============

  private buildPromptInfo(): string {
    const ctx = this.session.context;
    const fileName = ctx.filePath.split('/').pop() || ctx.filePath;
    const lines = ctx.lineRange[1] - ctx.lineRange[0] + 1;
    return `${fileName} \u2022 ${ctx.language} \u2022 ${lines} line${lines > 1 ? 's' : ''} selected`;
  }

  getPromptWithContext(basePrompt: string): string {
    const ctx = this.session.context;
    const parts: string[] = [];

    if (ctx.language !== 'plaintext') {
      parts.push(`In ${ctx.language}`);
    }

    if (ctx.symbols.length > 0) {
      parts.push(`within ${ctx.symbols[0]}`);
    }

    if (parts.length > 0) {
      return `${parts.join(', ')}: ${basePrompt}`;
    }
    return basePrompt;
  }

  // ============ Dispose ============

  dispose(): void {
    this.hide();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
