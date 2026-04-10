/**
 * TerminalCompletionProvider.ts — Phase 23 Feature 1
 * AI-powered tab completion in VS Code terminal via QuickPick fallback
 * (registerTerminalCompletionProvider is a proposed API, so we use Cmd+I in terminal)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class TerminalCompletionProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private recentCommands: string[] = [];
  private workspaceRoot: string;
  private apiEndpoint: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
  }

  register(context: vscode.ExtensionContext): void {
    // Track terminal output for history
    try {
      const onWrite = (vscode.window as any).onDidWriteTerminalData;
      if (onWrite) {
        this.disposables.push(onWrite((e: { terminal: vscode.Terminal; data: string }) => {
          const lines = e.data.split('\n').map(l => l.trim()).filter(l => l.length > 2 && l.startsWith('$'));
          for (const l of lines) this.addCommand(l.slice(1).trim());
        }));
      }
    } catch { /* proposed API */ }

    // Register command for Cmd+I in terminal to trigger completion
    this.disposables.push(
      vscode.commands.registerCommand('inaCoding.terminal.complete', async () => {
        if (!ConfigManager.get<boolean>('terminal.completionEnabled', true)) return;

        const terminal = vscode.window.activeTerminal;
        if (!terminal) { vscode.window.showWarningMessage('INA-7 Pro · No active terminal'); return; }

        const suggestions = await this.getSuggestions();
        if (suggestions.length === 0) { vscode.window.showInformationMessage('INA-7 Pro · No suggestions'); return; }

        const picked = await vscode.window.showQuickPick(
          suggestions.map(s => ({ label: s.command, description: s.description })),
          { placeHolder: 'INA-7 Pro · Terminal completion' }
        );

        if (picked) {
          terminal.sendText(picked.label, false);
        }
      })
    );
  }

  private async getSuggestions(): Promise<{ command: string; description: string }[]> {
    const suggestions: { command: string; description: string }[] = [];

    // Project-aware: npm scripts
    try {
      const pkgPath = path.join(this.workspaceRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        for (const [name] of Object.entries(pkg.scripts || {})) {
          suggestions.push({ command: `npm run ${name}`, description: `Script: ${name}` });
        }
      }
    } catch { /* */ }

    // Makefile targets
    try {
      const makefile = path.join(this.workspaceRoot, 'Makefile');
      if (fs.existsSync(makefile)) {
        const content = fs.readFileSync(makefile, 'utf-8');
        const targets = content.match(/^(\w+):/gm);
        if (targets) {
          for (const t of targets.slice(0, 10)) {
            suggestions.push({ command: `make ${t.replace(':', '')}`, description: 'Makefile target' });
          }
        }
      }
    } catch { /* */ }

    // Common commands
    suggestions.push(
      { command: 'git status', description: 'Show working tree status' },
      { command: 'git diff --staged', description: 'Show staged changes' },
      { command: 'git log --oneline -10', description: 'Recent commits' },
    );

    // Recent commands
    for (const cmd of this.recentCommands.slice(-5).reverse()) {
      suggestions.push({ command: cmd, description: 'Recent' });
    }

    return suggestions;
  }

  private addCommand(cmd: string): void {
    if (this.recentCommands.includes(cmd)) return;
    this.recentCommands.push(cmd);
    if (this.recentCommands.length > 50) this.recentCommands.shift();
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}
