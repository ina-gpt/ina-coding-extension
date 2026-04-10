/**
 * Inline Edit QuickPick
 *
 * QuickPick wrapper for history and actions.
 */

import * as vscode from 'vscode';
import { formatRelativeTime } from '../utils/timeFormatter';

// ============ Types ============

export interface HistoryItem extends vscode.QuickPickItem {
  prompt: string;
  timestamp: number;
  language: string;
  category: string;
}

// ============ QuickPick Wrapper ============

export class InlineEditQuickPick<T extends vscode.QuickPickItem> implements vscode.Disposable {
  private quickPick: vscode.QuickPick<T>;
  private disposables: vscode.Disposable[] = [];

  constructor(
    items: T[],
    options: {
      title: string;
      placeholder: string;
      matchOnDescription?: boolean;
      matchOnDetail?: boolean;
    }
  ) {
    this.quickPick = vscode.window.createQuickPick<T>();
    this.quickPick.title = options.title;
    this.quickPick.placeholder = options.placeholder;
    this.quickPick.matchOnDescription = options.matchOnDescription ?? true;
    this.quickPick.matchOnDetail = options.matchOnDetail ?? true;
    this.quickPick.items = items;
  }

  async show(): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      this.disposables.push(
        this.quickPick.onDidAccept(() => {
          const selected = this.quickPick.selectedItems[0];
          this.quickPick.hide();
          resolve(selected);
        }),
        this.quickPick.onDidHide(() => {
          resolve(undefined);
        }),
      );

      this.quickPick.show();
    });
  }

  hide(): void {
    this.quickPick.hide();
  }

  updateItems(items: T[]): void {
    this.quickPick.items = items;
  }

  // ============ Static Factories ============

  static createHistoryItems(entries: Array<{
    prompt: string;
    timestamp: number;
    language: string;
    editType: string;
  }>): HistoryItem[] {
    const categoryIcons: Record<string, string> = {
      refactor: '$(edit)',
      fix: '$(bug)',
      explain: '$(book)',
      generate: '$(add)',
      optimize: '$(zap)',
      document: '$(comment)',
      test: '$(beaker)',
      other: '$(terminal)',
    };

    return entries.map(entry => {
      const truncated = entry.prompt.length > 60
        ? entry.prompt.substring(0, 57) + '...'
        : entry.prompt;

      const icon = categoryIcons[entry.editType] || '$(terminal)';
      const timeStr = formatRelativeTime(entry.timestamp);

      return {
        label: `${icon} ${truncated}`,
        description: `${timeStr} \u2022 ${entry.language}`,
        detail: entry.prompt.length > 60 ? entry.prompt : undefined,
        prompt: entry.prompt,
        timestamp: entry.timestamp,
        language: entry.language,
        category: entry.editType,
      };
    });
  }

  static createActionItems(actions: Array<{
    label: string;
    description: string;
    prompt?: string;
  }>): vscode.QuickPickItem[] {
    return actions.map(a => ({
      label: a.label,
      description: a.description,
      detail: a.prompt,
    }));
  }

  // ============ Dispose ============

  dispose(): void {
    this.quickPick.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
