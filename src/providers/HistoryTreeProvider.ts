import * as vscode from 'vscode';
import { ChatService, ChatHistoryItem } from '../services/ChatService';

export class HistoryTreeProvider implements vscode.TreeDataProvider<ChatHistoryItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly chatService: ChatService) {}

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ChatHistoryItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.title, vscode.TreeItemCollapsibleState.None);
    item.description = new Date(element.updatedAt).toLocaleDateString();
    item.iconPath = new vscode.ThemeIcon('comment');
    item.command = {
      command: 'inaCoding.openChatHistory',
      title: 'Open Chat',
      arguments: [element.id],
    };
    return item;
  }

  getChildren(): ChatHistoryItem[] {
    return this.chatService.history.slice(0, 20);
  }
}
