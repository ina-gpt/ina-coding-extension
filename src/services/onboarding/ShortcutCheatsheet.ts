/**
 * Phase 11.2 — Shortcut Cheatsheet
 * Manages keyboard shortcuts reference, platform detection, and formatting.
 */
import * as vscode from 'vscode';
import { ShortcutCategory, ShortcutEntry } from './OnboardingTypes';
import { Logger } from '../../utils/Logger';

export class ShortcutCheatsheet {
  private static instance: ShortcutCheatsheet;
  private platform: 'mac' | 'windows' | 'linux';

  static getInstance(): ShortcutCheatsheet {
    if (!ShortcutCheatsheet.instance) {
      ShortcutCheatsheet.instance = new ShortcutCheatsheet();
    }
    return ShortcutCheatsheet.instance;
  }

  private constructor() {
    this.platform = this.detectPlatform();
  }

  getShortcuts(): ShortcutCategory[] {
    return [
      {
        name: 'Chat', icon: '$(comment-discussion)',
        shortcuts: [
          { keys: ['Cmd', 'L'], action: 'Open chat panel', description: 'Focus the INA Coding chat panel', context: null, category: 'Chat' },
          { keys: ['Cmd', 'Enter'], action: 'Send message', description: 'Send your message', context: 'Chat input focused', category: 'Chat' },
          { keys: ['Shift', 'Enter'], action: 'New line', description: 'Insert new line in chat input', context: 'Chat input focused', category: 'Chat' },
          { keys: ['Escape'], action: 'Stop generation', description: 'Stop the current AI response', context: 'While generating', category: 'Chat' },
          { keys: ['Cmd', 'N'], action: 'New conversation', description: 'Start a new chat conversation', context: null, category: 'Chat' },
          { keys: ['@'], action: 'Insert mention', description: 'Reference file, symbol, docs, git, etc.', context: 'Chat input focused', category: 'Chat' },
        ],
      },
      {
        name: 'Inline Edit', icon: '$(edit)',
        shortcuts: [
          { keys: ['Cmd', 'K'], action: 'Open inline edit', description: 'Edit selected code with AI', context: 'Code selected in editor', category: 'Inline Edit' },
          { keys: ['Enter'], action: 'Submit prompt', description: 'Submit the inline edit prompt', context: 'Inline edit prompt open', category: 'Inline Edit' },
          { keys: ['Escape'], action: 'Cancel edit', description: 'Cancel the inline edit', context: 'Inline edit prompt open', category: 'Inline Edit' },
          { keys: ['Cmd', 'Enter'], action: 'Accept changes', description: 'Accept the suggested changes', context: 'Inline edit preview', category: 'Inline Edit' },
          { keys: ['Cmd', 'Backspace'], action: 'Reject changes', description: 'Reject and discard changes', context: 'Inline edit preview', category: 'Inline Edit' },
          { keys: ['Tab'], action: 'Accept quick action', description: 'Accept an inline quick action', context: 'Quick action visible', category: 'Inline Edit' },
        ],
      },
      {
        name: 'Tab Completion', icon: '$(symbol-keyword)',
        shortcuts: [
          { keys: ['Tab'], action: 'Accept suggestion', description: 'Accept the full AI completion', context: 'Completion visible', category: 'Tab Completion' },
          { keys: ['Escape'], action: 'Dismiss suggestion', description: 'Dismiss the current completion', context: 'Completion visible', category: 'Tab Completion' },
          { keys: ['Cmd', '→'], action: 'Accept word', description: 'Accept completion word by word', context: 'Completion visible', category: 'Tab Completion' },
          { keys: ['Cmd', 'Shift', '→'], action: 'Accept line', description: 'Accept completion line by line', context: 'Completion visible', category: 'Tab Completion' },
          { keys: ['Alt', ']'], action: 'Next alternative', description: 'Cycle to next completion alternative', context: 'Completion visible', category: 'Tab Completion' },
          { keys: ['Alt', '['], action: 'Previous alternative', description: 'Cycle to previous alternative', context: 'Completion visible', category: 'Tab Completion' },
          { keys: ['Ctrl', 'Space'], action: 'Trigger manually', description: 'Manually trigger AI completion', context: 'Editor focused', category: 'Tab Completion' },
        ],
      },
      {
        name: 'Agent Mode', icon: '$(robot)',
        shortcuts: [
          { keys: ['Cmd', 'Shift', 'K'], action: 'Toggle agent mode', description: 'Switch between Chat/Agent/Auto modes', context: null, category: 'Agent Mode' },
          { keys: ['Cmd', 'Shift', 'Enter'], action: 'Approve plan', description: 'Approve the generated agent plan', context: 'Plan pending', category: 'Agent Mode' },
          { keys: ['Cmd', 'Shift', 'Backspace'], action: 'Reject plan', description: 'Reject and regenerate plan', context: 'Plan pending', category: 'Agent Mode' },
          { keys: ['Escape'], action: 'Pause execution', description: 'Pause the running execution', context: 'Agent executing', category: 'Agent Mode' },
          { keys: ['Cmd', 'Shift', 'R'], action: 'Rollback all', description: 'Rollback all agent changes', context: 'Reviewing changes', category: 'Agent Mode' },
        ],
      },
      {
        name: 'Navigation', icon: '$(search)',
        shortcuts: [
          { keys: ['Cmd', 'Shift', 'F'], action: 'Search codebase', description: 'Semantic search across your project', context: null, category: 'Navigation' },
          { keys: ['Cmd', 'Shift', 'S'], action: 'Search symbols', description: 'Search for symbols in workspace', context: null, category: 'Navigation' },
          { keys: ['Cmd', 'Alt', 'R'], action: 'Find references', description: 'Find references of symbol at cursor', context: 'Editor focused', category: 'Navigation' },
          { keys: ['Cmd', 'Alt', 'T'], action: 'Explain symbol', description: 'AI explanation of symbol at cursor', context: 'Editor focused', category: 'Navigation' },
          { keys: ['Cmd', 'Alt', 'E'], action: 'Explain error', description: 'AI explanation of error at cursor', context: 'Error diagnostic present', category: 'Navigation' },
        ],
      },
      {
        name: 'Panels', icon: '$(layout)',
        shortcuts: [
          { keys: ['Cmd', 'Shift', 'D'], action: 'Documentation panel', description: 'Open documentation search panel', context: null, category: 'Panels' },
          { keys: ['Cmd', 'Shift', 'G'], action: 'Git panel', description: 'Open git status and history', context: null, category: 'Panels' },
          { keys: ['Cmd', 'Shift', 'M'], action: 'Memory panel', description: 'View and manage AI memories', context: null, category: 'Panels' },
          { keys: ['Cmd', 'Shift', ','], action: 'Settings', description: 'Open INA Coding settings', context: null, category: 'Panels' },
        ],
      },
      {
        name: 'File Operations', icon: '$(files)',
        shortcuts: [
          { keys: ['Cmd', 'Shift', 'V'], action: 'Paste image', description: 'Paste image from clipboard into chat', context: 'Chat focused', category: 'File Operations' },
          { keys: ['Cmd', 'Shift', 'I'], action: 'Upload image', description: 'Upload image file for analysis', context: null, category: 'File Operations' },
          { keys: ['Cmd', 'Shift', 'R'], action: 'Project rules', description: 'Open or create project rules file', context: null, category: 'File Operations' },
        ],
      },
    ];
  }

  getShortcutsForPlatform(): ShortcutCategory[] {
    const shortcuts = this.getShortcuts();
    if (this.platform !== 'mac') {
      return shortcuts.map(cat => ({
        ...cat,
        shortcuts: cat.shortcuts.map(s => ({
          ...s,
          keys: s.keys.map(k => k === 'Cmd' ? 'Ctrl' : k),
        })),
      }));
    }
    return shortcuts;
  }

  searchShortcuts(query: string): ShortcutEntry[] {
    const q = query.toLowerCase();
    const all = this.getShortcutsForPlatform().flatMap(c => c.shortcuts);
    return all.filter(s =>
      s.action.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.keys.join('+').toLowerCase().includes(q)
    );
  }

  getShortcutForCommand(commandId: string): ShortcutEntry | null {
    const all = this.getShortcutsForPlatform().flatMap(c => c.shortcuts);
    return all.find(s => s.action.toLowerCase().replace(/\s+/g, '') === commandId.toLowerCase().replace(/\s+/g, '')) || null;
  }

  formatForQuickPick(): vscode.QuickPickItem[] {
    return this.getShortcutsForPlatform().flatMap(cat =>
      cat.shortcuts.map(s => ({
        label: `${this.formatKeys(s.keys)} → ${s.action}`,
        description: s.description,
        detail: s.context ? `When: ${s.context}` : undefined,
      }))
    );
  }

  formatForMarkdown(): string {
    const categories = this.getShortcutsForPlatform();
    const lines: string[] = ['# INA Coding — Keyboard Shortcuts\n'];

    for (const cat of categories) {
      lines.push(`## ${cat.name}\n`);
      lines.push('| Shortcut | Action | Description |');
      lines.push('|----------|--------|-------------|');
      for (const s of cat.shortcuts) {
        const keys = s.keys.map(k => `\`${k}\``).join(' + ');
        lines.push(`| ${keys} | ${s.action} | ${s.description} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private formatKeys(keys: string[]): string {
    if (this.platform === 'mac') {
      const symbols: Record<string, string> = { Cmd: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃', Enter: '↩', Escape: '⎋', Tab: '⇥', Backspace: '⌫', '→': '→', '←': '←' };
      return keys.map(k => symbols[k] || k).join('');
    }
    return keys.join('+');
  }

  private detectPlatform(): 'mac' | 'windows' | 'linux' {
    const p = process.platform;
    if (p === 'darwin') return 'mac';
    if (p === 'win32') return 'windows';
    return 'linux';
  }
}
