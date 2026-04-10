import * as vscode from 'vscode';
import { IndexingService } from '../services/IndexingService';

export class ProjectTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly indexingService: IndexingService) {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    const statusItem = new vscode.TreeItem(
      this.indexingService.isIndexing ? 'Indexing...' : 'Ready',
      vscode.TreeItemCollapsibleState.None
    );
    statusItem.iconPath = new vscode.ThemeIcon(
      this.indexingService.isIndexing ? 'sync~spin' : 'check'
    );
    items.push(statusItem);

    return items;
  }
}
