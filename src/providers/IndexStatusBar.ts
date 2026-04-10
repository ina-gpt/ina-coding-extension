/**
 * Index Status Bar Provider
 *
 * Shows index status in VS Code status bar.
 */

import * as vscode from 'vscode';
import { indexManagerClient, QuickStats } from '../services/IndexManagerClient';

export class IndexStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.statusBarItem.command = 'inaCoding.showIndexPanel';
    this.statusBarItem.name = 'INA Coding Index';
    this.statusBarItem.text = '$(database) INA Index';
    this.statusBarItem.tooltip = 'INA Coding - Index Status';
    this.statusBarItem.show();

    this.disposables.push(
      indexManagerClient.onStatsUpdate(stats => this.updateStatusBar(stats))
    );

    indexManagerClient.startPolling(10000);
  }

  private updateStatusBar(stats: QuickStats): void {
    let icon: string;
    let color: vscode.ThemeColor | undefined;

    switch (stats.status) {
      case 'indexed':
        icon = '$(database)';
        color = undefined;
        break;
      case 'indexing':
        icon = '$(sync~spin)';
        color = new vscode.ThemeColor('charts.yellow');
        break;
      case 'outdated':
        icon = '$(database)';
        color = new vscode.ThemeColor('charts.orange');
        break;
      case 'empty':
        icon = '$(database)';
        color = new vscode.ThemeColor('descriptionForeground');
        break;
    }

    let text = `${icon} `;
    if (stats.status === 'indexing' && stats.progress !== undefined) {
      text += `${stats.progress}%`;
    } else if (stats.chunks > 0) {
      text += stats.chunks >= 1000 ? `${(stats.chunks / 1000).toFixed(1)}K` : `${stats.chunks}`;
    } else {
      text += 'Index';
    }

    this.statusBarItem.text = text;
    this.statusBarItem.color = color;

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`### INA Coding Index\n\n`);
    const emoji = { indexed: '✅', indexing: '🔄', outdated: '⚠️', empty: '📭' };
    md.appendMarkdown(`**Status:** ${emoji[stats.status]} ${stats.status}\n\n`);
    if (stats.chunks > 0) {
      md.appendMarkdown(`Files: ${stats.files} | Chunks: ${stats.chunks}\n\n`);
    }
    md.appendMarkdown('Click to manage index');
    this.statusBarItem.tooltip = md;
  }

  async refresh(): Promise<void> {
    await indexManagerClient.getQuickStats();
  }

  dispose(): void {
    indexManagerClient.stopPolling();
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
