/**
 * Inline Edit Status Bar
 *
 * Status bar item showing inline edit state.
 */

import * as vscode from 'vscode';

// ============ Status Bar ============

export class InlineEditStatusBar implements vscode.Disposable {
  private static instance: InlineEditStatusBar;
  private statusBarItem: vscode.StatusBarItem;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      101
    );
    this.statusBarItem.command = 'inaCoding.inlineEdit';
    this.statusBarItem.name = 'INA Inline Edit';
    this.statusBarItem.hide();
  }

  static getInstance(): InlineEditStatusBar {
    if (!InlineEditStatusBar.instance) {
      InlineEditStatusBar.instance = new InlineEditStatusBar();
    }
    return InlineEditStatusBar.instance;
  }

  // ============ Show States ============

  show(state: 'ready' | 'input' | 'generating' | 'preview'): void {
    this.clearTimer();

    switch (state) {
      case 'ready':
        this.statusBarItem.text = '$(edit) INA Edit Ready';
        this.statusBarItem.color = undefined;
        this.statusBarItem.tooltip = 'INA Inline Edit - Press Cmd+K to edit';
        break;
      case 'input':
        this.statusBarItem.text = '$(pencil) INA: Enter instruction...';
        this.statusBarItem.color = new vscode.ThemeColor('charts.yellow');
        this.statusBarItem.tooltip = 'Type your edit instruction and press Enter';
        break;
      case 'generating':
        this.statusBarItem.text = '$(sync~spin) INA: Generating...';
        this.statusBarItem.color = new vscode.ThemeColor('charts.blue');
        this.statusBarItem.tooltip = 'AI is generating code changes...';
        break;
      case 'preview':
        this.statusBarItem.text = '$(git-compare) INA: Review changes';
        this.statusBarItem.color = new vscode.ThemeColor('charts.green');
        this.statusBarItem.tooltip = 'Review changes - Cmd+Enter to accept, Cmd+Backspace to reject';
        break;
    }

    this.statusBarItem.show();
  }

  hide(): void {
    this.clearTimer();
    this.statusBarItem.hide();
  }

  showTokenCount(count: number): void {
    this.statusBarItem.text = `$(sync~spin) INA: Generating... (${count} tokens)`;
  }

  showError(message: string): void {
    this.clearTimer();
    this.statusBarItem.text = `$(error) INA: ${message}`;
    this.statusBarItem.color = new vscode.ThemeColor('charts.red');
    this.statusBarItem.show();

    this.hideTimer = setTimeout(() => this.hide(), 3000);
  }

  showSuccess(message: string): void {
    this.clearTimer();
    this.statusBarItem.text = `$(check) INA: ${message}`;
    this.statusBarItem.color = new vscode.ThemeColor('charts.green');
    this.statusBarItem.show();

    this.hideTimer = setTimeout(() => this.hide(), 2000);
  }

  private clearTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  dispose(): void {
    this.clearTimer();
    this.statusBarItem.dispose();
  }
}
