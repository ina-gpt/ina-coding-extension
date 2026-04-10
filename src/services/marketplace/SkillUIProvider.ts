/**
 * SkillUIProvider.ts
 * Phase 19B Step 19.2 — VS Code TreeView for INA-7 Pro Skills
 *
 * Adds an "INA Skills" view to the activity bar with three sections:
 *   - Built-in
 *   - Installed
 *   - "Browse Marketplace…" action
 *
 * Right-click context actions: Run, Configure, Uninstall, View Details.
 */

import * as vscode from 'vscode';
import { SkillClient, SkillView, InstalledSkillView } from './SkillClient';
import { Logger } from '../../utils/Logger';

// ============================================================

export type SkillTreeItemType = 'section' | 'skill' | 'action';

export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly itemType: SkillTreeItemType,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly skill: SkillView | null = null,
    public readonly sectionId: string | null = null
  ) {
    super(label, collapsibleState);
    if (itemType === 'skill' && skill) {
      this.tooltip = skill.description;
      this.description = `v${skill.version}${skill.builtin ? ' · built-in' : ''}`;
      this.iconPath = new vscode.ThemeIcon(skill.builtin ? 'sparkle' : 'tools');
      this.contextValue = skill.builtin ? 'skill-builtin' : 'skill-user';
    } else if (itemType === 'section') {
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'skill-section';
    } else if (itemType === 'action') {
      this.iconPath = new vscode.ThemeIcon('search');
      this.contextValue = 'skill-action';
    }
  }
}

// ============================================================

export class SkillUIProvider implements vscode.TreeDataProvider<SkillTreeItem> {
  private static instance: SkillUIProvider;

  private client: SkillClient;
  private builtinCache: SkillView[] = [];
  private installedCache: SkillView[] = [];
  private lastRefresh = 0;

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<SkillTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private constructor() {
    this.client = SkillClient.getInstance();
  }

  static getInstance(): SkillUIProvider {
    if (!SkillUIProvider.instance) {
      SkillUIProvider.instance = new SkillUIProvider();
    }
    return SkillUIProvider.instance;
  }

  /**
   * Register the tree view + drag-and-drop handler. Returns disposables
   * the caller pushes onto the extension subscription list.
   */
  register(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    const treeView = vscode.window.createTreeView('inaCoding.skillsView', {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: this.createDragAndDropController(),
    });
    disposables.push(treeView);
    return disposables;
  }

  refresh(): void {
    this.lastRefresh = 0;
    this._onDidChangeTreeData.fire();
  }

  // ============================================================
  // TreeDataProvider impl
  // ============================================================

  getTreeItem(element: SkillTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SkillTreeItem): Promise<SkillTreeItem[]> {
    // Root: 3 sections
    if (!element) {
      return [
        new SkillTreeItem(
          'section',
          'Built-in',
          vscode.TreeItemCollapsibleState.Expanded,
          null,
          'builtin'
        ),
        new SkillTreeItem(
          'section',
          'Installed',
          vscode.TreeItemCollapsibleState.Expanded,
          null,
          'installed'
        ),
        new SkillTreeItem(
          'action',
          '$(search) Browse Marketplace…',
          vscode.TreeItemCollapsibleState.None,
          null,
          'browse'
        ),
      ];
    }

    if (element.itemType === 'action') return [];

    // Refresh caches if stale (>30s)
    if (Date.now() - this.lastRefresh > 30_000) {
      await this.refreshCaches();
    }

    if (element.sectionId === 'builtin') {
      return this.builtinCache.map(
        (s) => new SkillTreeItem('skill', `${s.icon} ${s.name}`, vscode.TreeItemCollapsibleState.None, s)
      );
    }
    if (element.sectionId === 'installed') {
      if (this.installedCache.length === 0) {
        const empty = new vscode.TreeItem('No installed skills', vscode.TreeItemCollapsibleState.None);
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty as any];
      }
      return this.installedCache.map(
        (s) => new SkillTreeItem('skill', `${s.icon} ${s.name}`, vscode.TreeItemCollapsibleState.None, s)
      );
    }
    return [];
  }

  // ============================================================
  // Cache loading
  // ============================================================

  private async refreshCaches(): Promise<void> {
    try {
      this.builtinCache = await this.client.getBuiltinSkills();
    } catch (e) {
      Logger.warn(`[SkillUIProvider] builtin fetch failed: ${String(e)}`);
      this.builtinCache = [];
    }
    try {
      const installed: InstalledSkillView[] = await this.client.getInstalled();
      this.installedCache = installed.map((i) => i.skill).filter((s): s is SkillView => s !== null);
    } catch (e) {
      Logger.warn(`[SkillUIProvider] installed fetch failed: ${String(e)}`);
      this.installedCache = [];
    }
    this.lastRefresh = Date.now();
  }

  // ============================================================
  // Drag-and-drop — accept .ina-skill files dropped on the tree
  // ============================================================

  private createDragAndDropController(): vscode.TreeDragAndDropController<SkillTreeItem> {
    return {
      dropMimeTypes: ['text/uri-list', 'application/vnd.code.tree.inaCoding.skillsView'],
      dragMimeTypes: [],
      handleDrag: () => {
        /* not implemented — we only accept drops */
      },
      handleDrop: async (_target, sources) => {
        const uriItem = sources.get('text/uri-list');
        if (!uriItem) return;
        const uriList = (await uriItem.asString()).split('\n');
        for (const line of uriList) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (!trimmed.endsWith('.ina-skill') && !trimmed.endsWith('.json')) continue;
          try {
            const uri = vscode.Uri.parse(trimmed);
            await this.client.importSkill(uri.fsPath);
            vscode.window.showInformationMessage(
              `INA-7 Pro · Imported skill from ${uri.path.split('/').pop()}`
            );
            this.refresh();
          } catch (e: any) {
            vscode.window.showErrorMessage(`Import failed: ${e?.message ?? String(e)}`);
          }
        }
      },
    };
  }
}
