/**
 * Phase 11.3 — Quick Action Service
 * Provides quick-access commands via keyboard shortcuts.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ShortcutManager } from './ShortcutManager';

export class QuickActionService {
  private static instance: QuickActionService;
  private recentCommands: { command: string; title: string; lastUsed: number }[] = [];

  static getInstance(): QuickActionService {
    if (!QuickActionService.instance) {
      QuickActionService.instance = new QuickActionService();
    }
    return QuickActionService.instance;
  }

  private constructor() {}

  async showCommandPalette(): Promise<void> {
    const sm = ShortcutManager.getInstance();
    const shortcuts = sm.getAllShortcuts();

    const categories = new Map<string, typeof shortcuts>();
    for (const s of shortcuts) {
      const list = categories.get(s.category) || [];
      list.push(s);
      categories.set(s.category, list);
    }

    const items: vscode.QuickPickItem[] = [];
    // Recent commands first
    if (this.recentCommands.length > 0) {
      items.push({ label: 'Recent', kind: vscode.QuickPickItemKind.Separator });
      for (const rc of this.recentCommands.slice(0, 5)) {
        const sc = sm.getByCommand(rc.command);
        items.push({ label: rc.title, description: sc ? sc.keys.display : '', detail: rc.command });
      }
    }

    // By category
    const categoryLabels: Record<string, string> = {
      chat: 'Chat', inline_edit: 'Inline Edit', completion: 'Completion', agent: 'Agent', navigation: 'Navigation',
      search: 'Search', panels: 'Panels', git: 'Git', file_ops: 'File Operations', general: 'General',
    };

    for (const [cat, scs] of categories) {
      items.push({ label: categoryLabels[cat] || cat, kind: vscode.QuickPickItemKind.Separator });
      for (const s of scs) {
        items.push({ label: s.description, description: s.keys.display, detail: s.command });
      }
    }

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Type to search INA Coding commands...',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (pick && pick.detail) {
      this.trackCommandUsage(pick.detail, pick.label);
      vscode.commands.executeCommand(pick.detail);
    }
  }

  async showQuickQuestion(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.selection;
    const hasSelection = selection && !selection.isEmpty;

    const prompt = hasSelection ? 'Ask about this code:' : 'Quick question:';
    const input = await vscode.window.showInputBox({
      prompt,
      placeHolder: hasSelection ? 'e.g., "What does this do?" or "How can I improve this?"' : 'e.g., "How do I..."',
    });

    if (!input) return;

    let message = input;
    if (hasSelection && editor) {
      const selectedText = editor.document.getText(selection);
      const lang = editor.document.languageId;
      message = `${input}\n\n\`\`\`${lang}\n${selectedText}\n\`\`\``;
    }

    // Open chat and send
    await vscode.commands.executeCommand('inaCoding.openChat');
    // Send via the chat view provider
    await vscode.commands.executeCommand('inaCoding.sendMessageDirect', message);
  }

  async showCodeActions(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showInformationMessage('Select code first, then use code actions');
      return;
    }

    const actions = [
      { label: '$(lightbulb) Explain Code', description: 'Cmd+K Cmd+E', command: 'inaCoding.explainCode' },
      { label: '$(edit) Refactor Code', description: 'Cmd+K Cmd+R', command: 'inaCoding.refactorCode' },
      { label: '$(debug-alt) Fix Code', description: 'Cmd+K Cmd+F', command: 'inaCoding.fixCode' },
      { label: '$(beaker) Generate Tests', description: 'Cmd+K Cmd+T', command: 'inaCoding.generateTests' },
      { label: '$(book) Generate Docs', description: 'Cmd+K Cmd+D', command: 'inaCoding.addDocumentation' },
      { label: '$(zap) Optimize Code', description: 'Cmd+K Cmd+O', command: 'inaCoding.optimizeSelection' },
      { label: '$(comment-discussion) Send to Chat', description: 'Cmd+Shift+;', command: 'inaCoding.sendSelectionToChat' },
      { label: '$(pencil) Inline Edit', description: 'Cmd+K', command: 'inaCoding.inlineEdit' },
    ];

    const pick = await vscode.window.showQuickPick(actions, {
      placeHolder: 'Choose an action for the selected code',
    });

    if (pick) {
      this.trackCommandUsage(pick.command, pick.label.replace(/\$\([^)]+\)\s*/g, ''));
      vscode.commands.executeCommand(pick.command);
    }
  }

  private trackCommandUsage(command: string, title: string): void {
    const idx = this.recentCommands.findIndex(c => c.command === command);
    if (idx >= 0) this.recentCommands.splice(idx, 1);
    this.recentCommands.unshift({ command, title, lastUsed: Date.now() });
    if (this.recentCommands.length > 20) this.recentCommands.pop();
  }
}
