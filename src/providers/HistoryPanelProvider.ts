import * as vscode from 'vscode';
import { HistoryManager, Conversation, SearchResult, HistoryEvent } from '../services/HistoryManager';
import { Logger } from '../utils/Logger';

// ============ Tree Item ============

class HistoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly conversation: Conversation,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(conversation.title, collapsibleState);

    this.id = conversation.id;
    this.tooltip = this.createTooltip();
    this.description = this.createDescription();
    this.contextValue = this.createContextValue();

    if (conversation.pinned) {
      this.iconPath = new vscode.ThemeIcon('pinned');
    } else if (conversation.archived) {
      this.iconPath = new vscode.ThemeIcon('archive');
    } else {
      this.iconPath = new vscode.ThemeIcon('comment-discussion');
    }

    this.command = {
      command: 'inaCoding.loadConversation',
      title: 'Load Conversation',
      arguments: [conversation.id],
    };
  }

  private createTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${this.conversation.title}**\n\n`);
    md.appendMarkdown(`Messages: ${this.conversation.messages.length}\n\n`);
    md.appendMarkdown(`Created: ${new Date(this.conversation.createdAt).toLocaleString()}\n\n`);
    md.appendMarkdown(`Updated: ${new Date(this.conversation.updatedAt).toLocaleString()}`);

    if (this.conversation.tags?.length) {
      md.appendMarkdown(`\n\nTags: ${this.conversation.tags.join(', ')}`);
    }

    return md;
  }

  private createDescription(): string {
    const messageCount = this.conversation.messages.length;
    const date = new Date(this.conversation.updatedAt);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeStr: string;
    if (diffMins < 1) {
      timeStr = 'just now';
    } else if (diffMins < 60) {
      timeStr = `${diffMins}m ago`;
    } else if (diffHours < 24) {
      timeStr = `${diffHours}h ago`;
    } else if (diffDays < 7) {
      timeStr = `${diffDays}d ago`;
    } else {
      timeStr = date.toLocaleDateString();
    }

    return `${messageCount} msgs · ${timeStr}`;
  }

  private createContextValue(): string {
    const parts = ['conversation'];
    if (this.conversation.pinned) parts.push('pinned');
    if (this.conversation.archived) parts.push('archived');
    return parts.join('-');
  }
}

// ============ History Group ============

class HistoryGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly group: 'pinned' | 'today' | 'yesterday' | 'week' | 'month' | 'older' | 'archived',
    public readonly conversations: Conversation[]
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `group-${group}`;
    this.description = `${conversations.length}`;

    const icons: Record<string, string> = {
      pinned: 'pinned',
      today: 'calendar',
      yesterday: 'history',
      week: 'clock',
      month: 'calendar',
      older: 'archive',
      archived: 'archive',
    };
    this.iconPath = new vscode.ThemeIcon(icons[group] || 'folder');
  }
}

// ============ Tree Data Provider ============

export class HistoryTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private searchQuery: string = '';
  private searchResults: SearchResult[] = [];
  private showArchived: boolean = false;
  private groupByDate: boolean = true;

  constructor(private historyManager: HistoryManager) {
    historyManager.onChange(() => {
      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
    if (query) {
      this.searchResults = this.historyManager.search(query, { includeArchived: this.showArchived });
    } else {
      this.searchResults = [];
    }
    this.refresh();
  }

  toggleArchived(): void {
    this.showArchived = !this.showArchived;
    this.refresh();
  }

  toggleGrouping(): void {
    this.groupByDate = !this.groupByDate;
    this.refresh();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (!element) {
      return Promise.resolve(this.getRootItems());
    }

    if (element instanceof HistoryGroupItem) {
      return Promise.resolve(
        element.conversations.map(
          conv => new HistoryTreeItem(conv, vscode.TreeItemCollapsibleState.None)
        )
      );
    }

    return Promise.resolve([]);
  }

  private getRootItems(): vscode.TreeItem[] {
    if (this.searchQuery && this.searchResults.length > 0) {
      return this.searchResults.map(
        result => new HistoryTreeItem(result.conversation, vscode.TreeItemCollapsibleState.None)
      );
    }

    if (this.searchQuery && this.searchResults.length === 0) {
      const noResults = new vscode.TreeItem('No results found');
      noResults.iconPath = new vscode.ThemeIcon('search-stop');
      return [noResults];
    }

    const conversations = this.historyManager.getRecentConversations(100, this.showArchived);

    if (conversations.length === 0) {
      const empty = new vscode.TreeItem('No conversations yet');
      empty.iconPath = new vscode.ThemeIcon('comment');
      return [empty];
    }

    if (this.groupByDate) {
      return this.groupConversations(conversations);
    }

    return conversations.map(
      conv => new HistoryTreeItem(conv, vscode.TreeItemCollapsibleState.None)
    );
  }

  private groupConversations(conversations: Conversation[]): vscode.TreeItem[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 7 * 86400000;
    const monthAgo = today - 30 * 86400000;

    const pinned: Conversation[] = [];
    const todayConvs: Conversation[] = [];
    const yesterdayConvs: Conversation[] = [];
    const weekConvs: Conversation[] = [];
    const monthConvs: Conversation[] = [];
    const olderConvs: Conversation[] = [];
    const archived: Conversation[] = [];

    for (const conv of conversations) {
      if (conv.archived) {
        archived.push(conv);
      } else if (conv.pinned) {
        pinned.push(conv);
      } else if (conv.updatedAt >= today) {
        todayConvs.push(conv);
      } else if (conv.updatedAt >= yesterday) {
        yesterdayConvs.push(conv);
      } else if (conv.updatedAt >= weekAgo) {
        weekConvs.push(conv);
      } else if (conv.updatedAt >= monthAgo) {
        monthConvs.push(conv);
      } else {
        olderConvs.push(conv);
      }
    }

    const items: vscode.TreeItem[] = [];

    if (pinned.length > 0) {
      items.push(new HistoryGroupItem('Pinned', 'pinned', pinned));
    }
    if (todayConvs.length > 0) {
      items.push(new HistoryGroupItem('Today', 'today', todayConvs));
    }
    if (yesterdayConvs.length > 0) {
      items.push(new HistoryGroupItem('Yesterday', 'yesterday', yesterdayConvs));
    }
    if (weekConvs.length > 0) {
      items.push(new HistoryGroupItem('This Week', 'week', weekConvs));
    }
    if (monthConvs.length > 0) {
      items.push(new HistoryGroupItem('This Month', 'month', monthConvs));
    }
    if (olderConvs.length > 0) {
      items.push(new HistoryGroupItem('Older', 'older', olderConvs));
    }
    if (this.showArchived && archived.length > 0) {
      items.push(new HistoryGroupItem('Archived', 'archived', archived));
    }

    return items;
  }
}

// ============ History Panel Provider ============

export class HistoryPanelProvider {
  private treeProvider: HistoryTreeDataProvider;
  private treeView: vscode.TreeView<vscode.TreeItem>;

  constructor(
    private context: vscode.ExtensionContext,
    private historyManager: HistoryManager
  ) {
    this.treeProvider = new HistoryTreeDataProvider(historyManager);

    this.treeView = vscode.window.createTreeView('inaCoding.historyView', {
      treeDataProvider: this.treeProvider,
      showCollapseAll: true,
    });

    this.registerCommands();
  }

  refresh(): void {
    this.treeProvider.refresh();
  }

  private registerCommands(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.searchHistory', () => {
        this.showSearchBox();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.refreshHistory', () => {
        this.treeProvider.refresh();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.toggleArchivedHistory', () => {
        this.treeProvider.toggleArchived();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.exportHistory', () => {
        this.exportHistory();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.importHistory', () => {
        this.importHistory();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.clearAllHistory', () => {
        this.clearAllHistory();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.clearOldHistory', () => {
        this.clearOldHistory();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.pinConversation', (item: HistoryTreeItem) => {
        if (item?.conversation) {
          this.historyManager.togglePin(item.conversation.id);
        }
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.archiveConversation', (item: HistoryTreeItem) => {
        if (item?.conversation) {
          this.historyManager.toggleArchive(item.conversation.id);
        }
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.deleteConversation', (item: HistoryTreeItem) => {
        if (item?.conversation) {
          this.deleteConversation(item.conversation);
        }
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.renameConversation', (item: HistoryTreeItem) => {
        if (item?.conversation) {
          this.renameConversation(item.conversation);
        }
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.exportConversation', (item: HistoryTreeItem) => {
        if (item?.conversation) {
          this.exportSingleConversation(item.conversation);
        }
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showHistoryStats', () => {
        this.showStats();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.loadConversation', (id: string) => {
        this.historyManager.setCurrentConversation(id);
      })
    );
  }

  // ============ Search ============

  private showSearchBox(): void {
    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = 'Search chat history...';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    quickPick.onDidChangeValue(value => {
      this.treeProvider.setSearchQuery(value);

      if (value) {
        const results = this.historyManager.search(value, { limit: 20 });
        quickPick.items = results.map(r => ({
          label: r.conversation.title,
          description: `${r.conversation.messages.length} messages`,
          detail: r.matches[0]?.highlight || '',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          id: r.conversation.id,
        } as any));
      } else {
        quickPick.items = [];
      }
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected && (selected as any).id) {
        vscode.commands.executeCommand('inaCoding.loadConversation', (selected as any).id);
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => {
      this.treeProvider.setSearchQuery('');
      quickPick.dispose();
    });

    quickPick.show();
  }

  // ============ Export ============

  private async exportHistory(): Promise<void> {
    const format = await vscode.window.showQuickPick(
      [
        { label: 'JSON', value: 'json', description: 'Machine-readable format' },
        { label: 'Markdown', value: 'markdown', description: 'Human-readable format' },
        { label: 'HTML', value: 'html', description: 'Web page format' },
      ],
      { placeHolder: 'Select export format' }
    );

    if (!format) return;

    const includeMetadata = await vscode.window.showQuickPick(
      [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
      { placeHolder: 'Include metadata (timestamps, tokens, etc.)?' }
    );

    if (includeMetadata === undefined) return;

    try {
      const content = await this.historyManager.export({
        format: format.value as 'json' | 'markdown' | 'html',
        includeMetadata: includeMetadata.value,
        includeContext: includeMetadata.value,
      });

      const extensions: Record<string, string> = {
        json: 'json',
        markdown: 'md',
        html: 'html',
      };

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`ina-coding-history.${extensions[format.value]}`),
        filters: {
          [format.label]: [extensions[format.value]],
        },
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage(`History exported to ${uri.fsPath}`);
      }
    } catch (error) {
      Logger.error('Export failed:', error);
      vscode.window.showErrorMessage(`Export failed: ${error}`);
    }
  }

  private async exportSingleConversation(conversation: Conversation): Promise<void> {
    const content = await this.historyManager.export({
      format: 'markdown',
      includeMetadata: false,
      includeContext: true,
      conversationIds: [conversation.id],
    });

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${conversation.title.replace(/[^a-z0-9]/gi, '_')}.md`),
      filters: { 'Markdown': ['md'] },
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      vscode.window.showInformationMessage('Conversation exported');
    }
  }

  // ============ Import ============

  private async importHistory(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'JSON': ['json'] },
    });

    if (!uris || uris.length === 0) return;

    try {
      const content = await vscode.workspace.fs.readFile(uris[0]);
      const result = await this.historyManager.import(Buffer.from(content).toString('utf8'), 'json');

      if (result.imported > 0) {
        vscode.window.showInformationMessage(`Imported ${result.imported} conversations`);
      }

      if (result.errors.length > 0) {
        vscode.window.showWarningMessage(`Import errors: ${result.errors.join(', ')}`);
      }

      this.treeProvider.refresh();
    } catch (error) {
      Logger.error('Import failed:', error);
      vscode.window.showErrorMessage(`Import failed: ${error}`);
    }
  }

  // ============ Delete/Clear ============

  private async deleteConversation(conversation: Conversation): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete "${conversation.title}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      this.historyManager.deleteConversation(conversation.id);
      vscode.window.showInformationMessage('Conversation deleted');
    }
  }

  private async clearAllHistory(): Promise<void> {
    const stats = this.historyManager.getStats();
    const confirm = await vscode.window.showWarningMessage(
      `Delete all ${stats.totalConversations} conversations? This cannot be undone.`,
      { modal: true },
      'Delete All'
    );

    if (confirm === 'Delete All') {
      this.historyManager.clearAll();
      vscode.window.showInformationMessage('All history cleared');
    }
  }

  private async clearOldHistory(): Promise<void> {
    const days = await vscode.window.showInputBox({
      prompt: 'Delete conversations older than how many days?',
      value: '30',
      validateInput: value => {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) return 'Enter a positive number';
        return null;
      },
    });

    if (!days) return;

    const deleted = this.historyManager.clearOld(parseInt(days));
    vscode.window.showInformationMessage(`Deleted ${deleted} old conversations`);
  }

  // ============ Rename ============

  private async renameConversation(conversation: Conversation): Promise<void> {
    const newTitle = await vscode.window.showInputBox({
      prompt: 'Enter new title',
      value: conversation.title,
      validateInput: value => {
        if (!value.trim()) return 'Title is required';
        return null;
      },
    });

    if (newTitle) {
      this.historyManager.updateConversation(conversation.id, { title: newTitle.trim() });
    }
  }

  // ============ Stats ============

  private async showStats(): Promise<void> {
    const stats = this.historyManager.getStats();

    const sizeStr = stats.storageSize < 1024 * 1024
      ? `${Math.round(stats.storageSize / 1024)} KB`
      : `${(stats.storageSize / (1024 * 1024)).toFixed(2)} MB`;

    const oldestDate = stats.oldestConversation
      ? new Date(stats.oldestConversation).toLocaleDateString()
      : 'N/A';

    const message = [
      `Chat History Statistics`,
      ``,
      `Conversations: ${stats.totalConversations}`,
      `Total Messages: ${stats.totalMessages}`,
      `Storage Used: ${sizeStr}`,
      `Oldest: ${oldestDate}`,
    ].join('\n');

    vscode.window.showInformationMessage(message, { modal: true });
  }

  dispose(): void {
    this.treeView.dispose();
  }
}
