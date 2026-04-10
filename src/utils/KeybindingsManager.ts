import * as vscode from 'vscode';
import { ConfigManager } from './ConfigManager';

export interface Keybinding {
  command: string;
  key: string;
  mac?: string;
  when?: string;
  description: string;
}

export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  { command: 'inaCoding.openChat', key: 'ctrl+shift+l', mac: 'cmd+shift+l', description: 'Open chat panel' },
  { command: 'inaCoding.inlineEdit', key: 'ctrl+k', mac: 'cmd+k', when: 'editorTextFocus', description: 'Inline edit selected code' },
  { command: 'inaCoding.explainCode', key: 'ctrl+shift+e', mac: 'cmd+shift+e', when: 'editorHasSelection', description: 'Explain selected code' },
  { command: 'inaCoding.acceptCompletion', key: 'tab', when: 'inaCoding.completionVisible && editorTextFocus', description: 'Accept completion suggestion' },
  { command: 'inaCoding.dismissCompletion', key: 'escape', when: 'inaCoding.completionVisible && editorTextFocus', description: 'Dismiss completion' },
  { command: 'inaCoding.nextCompletion', key: 'alt+]', when: 'inaCoding.completionVisible && editorTextFocus', description: 'Next completion alternative' },
  { command: 'inaCoding.prevCompletion', key: 'alt+[', when: 'inaCoding.completionVisible && editorTextFocus', description: 'Previous completion alternative' },
];

class KeybindingsManagerClass {
  initialize(_context: vscode.ExtensionContext) {
    // Reserved for future use
  }

  getKeybindings(): Keybinding[] {
    return DEFAULT_KEYBINDINGS;
  }

  formatKey(key: string): string {
    const isMac = process.platform === 'darwin';
    return key
      .replace(/ctrl/gi, isMac ? '⌃' : 'Ctrl')
      .replace(/cmd/gi, '⌘')
      .replace(/alt/gi, isMac ? '⌥' : 'Alt')
      .replace(/shift/gi, isMac ? '⇧' : 'Shift')
      .replace(/escape/gi, 'Esc')
      .replace(/tab/gi, '⇥');
  }

  async openKeybindingsEditor() {
    await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', 'inaCoding');
  }
}

export const KeybindingsManager = new KeybindingsManagerClass();
