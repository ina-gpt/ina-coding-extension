/**
 * CollabTreeView.ts — Phase 20 Step 20.5
 * Tree view showing collaboration session info in Explorer sidebar
 */

import * as vscode from 'vscode';
import { CollabClient } from './CollabClient';
import { Logger } from '../../utils/Logger';

export class CollabTreeItem extends vscode.TreeItem {
  constructor(label: string, description?: string, collapsible?: vscode.TreeItemCollapsibleState, icon?: string) {
    super(label, collapsible || vscode.TreeItemCollapsibleState.None);
    this.description = description;
    if (icon) this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class CollabTreeView implements vscode.TreeDataProvider<CollabTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<CollabTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.refreshTimer = setInterval(() => this._onDidChangeTreeData.fire(undefined), 5000);
  }

  register(): vscode.Disposable[] {
    const treeView = vscode.window.createTreeView('inaCoding.collabTreeView', {
      treeDataProvider: this,
      showCollapseAll: false,
    });
    this.disposables.push(treeView);
    return this.disposables;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: CollabTreeItem): CollabTreeItem {
    return element;
  }

  getChildren(element?: CollabTreeItem): CollabTreeItem[] {
    const client = CollabClient.getInstance();
    const session = client.currentSession;

    if (!element) {
      if (!session) {
        return [
          new CollabTreeItem('Start Session', 'Create a new collaboration session', undefined, 'add'),
          new CollabTreeItem('Join Session', 'Enter a session code', undefined, 'plug'),
        ];
      }

      return [
        new CollabTreeItem(`Session: ${session.code}`, session.title, vscode.TreeItemCollapsibleState.Expanded, 'organization'),
        new CollabTreeItem('Participants', `${session.participants?.length || 0}`, vscode.TreeItemCollapsibleState.Expanded, 'people'),
      ];
    }

    if (element.label === 'Participants' && session?.participants) {
      return session.participants.map((p: any) => {
        const role = p.role === 'host' ? '★' : p.role === 'editor' ? '✎' : '👁';
        return new CollabTreeItem(`${role} ${p.name}`, p.currentFile || '', undefined, p.isOnline ? 'circle-filled' : 'circle-outline');
      });
    }

    return [];
  }

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this._onDidChangeTreeData.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
