/**
 * InterpreterService.ts — Phase 23 Feature 2
 * Execute code snippets from chat in a REPL terminal
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

const REPL_COMMANDS: Record<string, string> = {
  javascript: 'node',
  typescript: 'npx tsx',
  python: 'python3',
  ruby: 'irb',
  php: 'php -a',
};

export class InterpreterService implements vscode.Disposable {
  private static _instance: InterpreterService;
  private replTerminals = new Map<string, vscode.Terminal>();
  private workspaceRoot: string;
  private disposables: vscode.Disposable[] = [];

  private constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.disposables.push(
      vscode.window.onDidCloseTerminal(t => {
        for (const [lang, term] of this.replTerminals) {
          if (term === t) { this.replTerminals.delete(lang); break; }
        }
      })
    );
  }

  static getInstance(workspaceRoot: string): InterpreterService {
    if (!InterpreterService._instance) InterpreterService._instance = new InterpreterService(workspaceRoot);
    return InterpreterService._instance;
  }

  async executeInREPL(code: string, language: string): Promise<{ output: string; success: boolean }> {
    const lang = language.toLowerCase();
    const timeout = ConfigManager.get<number>('interpreter.timeout', 30000);

    // For compiled/non-REPL languages, use temp file approach
    if (['go', 'rust', 'java', 'c', 'cpp'].includes(lang)) {
      return this.executeTempFile(code, lang);
    }

    // For REPL languages, use interactive terminal
    const terminal = this.getOrCreateREPL(lang);
    terminal.show(true);

    // Send code to terminal
    const lines = code.trim().split('\n');
    for (const line of lines) {
      terminal.sendText(line);
      // Small delay between lines for REPL processing
      await new Promise(r => setTimeout(r, 50));
    }

    // We can't directly capture terminal output in standard VS Code API
    // Return acknowledgment — output will appear in terminal
    return { output: `Code sent to ${lang} REPL. Check terminal for output.`, success: true };
  }

  private async executeTempFile(code: string, language: string): Promise<{ output: string; success: boolean }> {
    const ext: Record<string, string> = { go: '.go', rust: '.rs', java: '.java', c: '.c', cpp: '.cpp' };
    const runCmd: Record<string, string> = {
      go: 'go run', rust: 'rustc -o /tmp/ina_run && /tmp/ina_run', java: 'java',
    };

    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `ina_repl${ext[language] || '.txt'}`);

    try {
      fs.writeFileSync(tmpFile, code);
      const cmd = `${runCmd[language] || 'cat'} ${tmpFile}`;
      const terminal = vscode.window.createTerminal({ name: `INA Run (${language})`, cwd: this.workspaceRoot });
      terminal.show(true);
      terminal.sendText(cmd);
      return { output: `Running via: ${cmd}`, success: true };
    } catch (e: any) {
      return { output: `Error: ${e.message}`, success: false };
    }
  }

  private getOrCreateREPL(language: string): vscode.Terminal {
    let terminal = this.replTerminals.get(language);
    if (terminal && !terminal.exitStatus) return terminal;

    const cmd = REPL_COMMANDS[language] || 'node';
    terminal = vscode.window.createTerminal({
      name: `INA REPL (${language})`,
      cwd: this.workspaceRoot,
      shellPath: undefined,
    });
    terminal.sendText(cmd);
    this.replTerminals.set(language, terminal);
    return terminal;
  }

  stopREPL(language?: string): void {
    if (language) {
      const t = this.replTerminals.get(language);
      if (t) { t.dispose(); this.replTerminals.delete(language); }
    } else {
      for (const t of this.replTerminals.values()) t.dispose();
      this.replTerminals.clear();
    }
  }

  dispose(): void {
    this.stopREPL();
    this.disposables.forEach(d => d.dispose());
  }
}
