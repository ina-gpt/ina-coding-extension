/**
 * Phase 17.1 — Shadow Tree Data Provider
 *
 * Implements vscode.TreeDataProvider to display shadow sessions and files
 * in the VS Code explorer sidebar. Shows file status with icons and
 * provides context values for right-click menu commands.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ShadowWorkspaceManager } from './ShadowWorkspaceManager';
import { ShadowFileStatus, ShadowSession } from './ShadowTypes';

/**
 * Tree item representing either a shadow session or a shadow file.
 */
export class ShadowTreeItem extends vscode.TreeItem {
  public readonly type: 'session' | 'file';
  public readonly sessionId: string;
  public readonly filePath: string | null;

  constructor(options: {
    label: string;
    type: 'session' | 'file';
    sessionId: string;
    filePath?: string;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    description?: string;
    tooltip?: string;
    iconPath?: vscode.ThemeIcon;
    contextValue?: string;
  }) {
    super(options.label, options.collapsibleState);
    this.type = options.type;
    this.sessionId = options.sessionId;
    this.filePath = options.filePath || null;
    this.description = options.description;
    this.tooltip = options.tooltip;
    this.iconPath = options.iconPath;
    this.contextValue = options.contextValue;
  }
}

export class ShadowTreeDataProvider implements vscode.TreeDataProvider<ShadowTreeItem> {
  private static instance: ShadowTreeDataProvider | null = null;

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ShadowTreeItem | undefined | null>();
  public readonly onDidChangeTreeData: vscode.Event<ShadowTreeItem | undefined | null> =
    this._onDidChangeTreeData.event;

  private readonly logger = Logger;
  private readonly manager: ShadowWorkspaceManager;

  private constructor() {
    this.manager = ShadowWorkspaceManager.getInstance();

    // Listen for all shadow workspace events and refresh the tree
    this.manager.on('*', () => {
      this.refresh();
    });
  }

  /**
   * Returns the singleton instance of ShadowTreeDataProvider.
   */
  public static getInstance(): ShadowTreeDataProvider {
    if (!ShadowTreeDataProvider.instance) {
      ShadowTreeDataProvider.instance = new ShadowTreeDataProvider();
    }
    return ShadowTreeDataProvider.instance;
  }

  /**
   * Refresh the entire tree view.
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Return the tree item for display.
   */
  public getTreeItem(element: ShadowTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree element.
   * - Root level: returns session items
   * - Session level: returns file items
   */
  public getChildren(element?: ShadowTreeItem): ShadowTreeItem[] {
    if (!element) {
      // Root level — list all sessions
      return this.getSessionItems();
    }

    if (element.type === 'session') {
      // Session level — list files in the session
      return this.getFileItems(element.sessionId);
    }

    return [];
  }

  /**
   * Build tree items for all shadow sessions.
   */
  private getSessionItems(): ShadowTreeItem[] {
    const sessions = this.manager.listSessions();

    if (sessions.length === 0) {
      return [];
    }

    return sessions.map((session) => {
      const fileCount = session.files.size;
      const statusIcon = this.getSessionIcon(session);
      const isActive = this.manager.getActiveSession()?.id === session.id;

      return new ShadowTreeItem({
        label: session.name,
        type: 'session',
        sessionId: session.id,
        collapsibleState: isActive
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed,
        description: `${fileCount} file${fileCount !== 1 ? 's' : ''} · ${session.status}`,
        tooltip: this.getSessionTooltip(session),
        iconPath: statusIcon,
        contextValue: `shadowSession:${session.status}`,
      });
    });
  }

  /**
   * Build tree items for all files in a session.
   */
  private getFileItems(sessionId: string): ShadowTreeItem[] {
    const session = this.manager.getSession(sessionId);
    if (!session) {
      return [];
    }

    const items: ShadowTreeItem[] = [];

    for (const [filePath, shadowFile] of session.files) {
      const fileName = filePath.split('/').pop() || filePath;
      const dirPath = filePath.split('/').slice(0, -1).join('/');
      const statusIcon = this.getFileStatusIcon(shadowFile.status);

      const item = new ShadowTreeItem({
        label: fileName,
        type: 'file',
        sessionId,
        filePath,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        description: dirPath ? `${dirPath} · ${shadowFile.status}` : shadowFile.status,
        tooltip: this.getFileTooltip(filePath, shadowFile.status, shadowFile.sourceOperation),
        iconPath: statusIcon,
        contextValue: `shadowFile:${shadowFile.status}`,
      });

      // Click to open diff preview
      item.command = {
        command: 'inaCoding.shadow.previewFile',
        title: 'Preview Shadow File',
        arguments: [sessionId, filePath],
      };

      items.push(item);
    }

    return items;
  }

  /**
   * Get the icon for a session based on its status.
   */
  private getSessionIcon(session: ShadowSession): vscode.ThemeIcon {
    switch (session.status) {
      case 'active':
        return new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.yellow'));
      case 'committed':
        return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
      case 'discarded':
        return new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
      case 'expired':
        return new vscode.ThemeIcon('clock', new vscode.ThemeColor('disabledForeground'));
      default:
        return new vscode.ThemeIcon('folder');
    }
  }

  /**
   * Get the icon for a file based on its review status.
   */
  private getFileStatusIcon(status: ShadowFileStatus): vscode.ThemeIcon {
    switch (status) {
      case ShadowFileStatus.PENDING:
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
      case ShadowFileStatus.ACCEPTED:
        return new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
      case ShadowFileStatus.REJECTED:
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      case ShadowFileStatus.EDITED:
        return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.blue'));
      case ShadowFileStatus.CONFLICT:
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
      default:
        return new vscode.ThemeIcon('file');
    }
  }

  /**
   * Build a tooltip string for a session.
   */
  private getSessionTooltip(session: ShadowSession): string {
    const created = new Date(session.createdAt).toLocaleString();
    const expires = new Date(session.expiresAt).toLocaleString();
    const lines = [
      `Session: ${session.name}`,
      `Status: ${session.status}`,
      `Source: ${session.sourceOperation}`,
      `Files: ${session.files.size}`,
      `Checkpoints: ${session.checkpoints.length}`,
      `Created: ${created}`,
      `Expires: ${expires}`,
    ];
    return lines.join('\n');
  }

  /**
   * Build a tooltip string for a file.
   */
  private getFileTooltip(
    filePath: string,
    status: ShadowFileStatus,
    sourceOperation: string
  ): string {
    return `${filePath}\nStatus: ${status}\nSource: ${sourceOperation}`;
  }

  /**
   * Register this provider as a tree view with VS Code.
   */
  public register(context: vscode.ExtensionContext): vscode.TreeView<ShadowTreeItem> {
    const treeView = vscode.window.createTreeView('inaCodingShadowWorkspace', {
      treeDataProvider: this,
      showCollapseAll: true,
    });

    context.subscriptions.push(treeView);
    context.subscriptions.push(this._onDidChangeTreeData);

    this.logger.info('[ShadowTree] Registered shadow workspace tree view');
    return treeView;
  }

  /**
   * Dispose of resources.
   */
  public dispose(): void {
    this._onDidChangeTreeData.dispose();
    ShadowTreeDataProvider.instance = null;
  }
}
