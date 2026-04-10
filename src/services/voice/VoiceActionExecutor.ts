/**
 * VoiceActionExecutor.ts — Phase 20 Step 20.2
 * Execute parsed voice intents as VS Code actions
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { VoiceIntent, VoiceIntentType } from './VoiceTypes';
import { Logger } from '../../utils/Logger';

export class VoiceActionExecutor {
  private lastAction: VoiceIntent | null = null;

  async execute(intent: VoiceIntent): Promise<{ success: boolean; message: string }> {
    this.lastAction = intent;
    Logger.info(`[VoiceAction] Executing: ${intent.type}`, intent.parsed);

    try {
      switch (intent.type) {
        case VoiceIntentType.WRITE_CODE:
          return this.writeCode(intent.parsed.description);
        case VoiceIntentType.GO_TO_FILE:
          return this.goToFile(intent.parsed.filename);
        case VoiceIntentType.GO_TO_FUNCTION:
          return this.goToFunction(intent.parsed.functionName);
        case VoiceIntentType.EDIT_LINE:
          return this.editLine(intent.parsed.line, intent.parsed.from, intent.parsed.to);
        case VoiceIntentType.RUN_COMMAND:
          return this.runCommand(intent.parsed.command);
        case VoiceIntentType.ASK_QUESTION:
          return this.askQuestion(intent.parsed.question);
        case VoiceIntentType.DICTATE_COMMENT:
          return this.dictateComment(intent.parsed.comment);
        case VoiceIntentType.RENAME_VARIABLE:
          return this.renameVariable(intent.parsed.from, intent.parsed.to);
        case VoiceIntentType.DELETE_LINES:
          return this.deleteLines(intent.parsed.startLine, intent.parsed.endLine);
        case VoiceIntentType.UNDO:
          await vscode.commands.executeCommand('undo');
          return { success: true, message: 'Undone' };
        case VoiceIntentType.REDO:
          await vscode.commands.executeCommand('redo');
          return { success: true, message: 'Redone' };
        case VoiceIntentType.EXPLAIN_CODE:
          return this.explainCode(intent.parsed.query);
        case VoiceIntentType.FIX_ERROR:
          await vscode.commands.executeCommand('inaCoding.debug.analyzeTerminal');
          return { success: true, message: 'Analyzing error...' };
        case VoiceIntentType.GENERATE_TEST:
          await vscode.commands.executeCommand('inaCoding.testGen.generateForFile');
          return { success: true, message: 'Generating tests...' };
        default:
          return { success: false, message: `Unknown intent: ${intent.type}` };
      }
    } catch (e: any) {
      Logger.error('[VoiceAction] Execution failed:', e);
      return { success: false, message: e.message || 'Action failed' };
    }
  }

  private async writeCode(description: string): Promise<{ success: boolean; message: string }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { success: false, message: 'No active editor' };
    // Route to chat for code generation
    await vscode.commands.executeCommand('inaCoding.openChat');
    // Send the description as a chat message
    await vscode.commands.executeCommand('inaCoding.sendMessage', `Write code: ${description}`);
    return { success: true, message: `Generating: ${description}` };
  }

  private async goToFile(filename: string): Promise<{ success: boolean; message: string }> {
    const files = await vscode.workspace.findFiles(`**/*${filename}*`, '**/node_modules/**', 10);
    if (files.length === 0) return { success: false, message: `File "${filename}" not found` };
    if (files.length === 1) {
      await vscode.window.showTextDocument(files[0]);
      return { success: true, message: `Opened ${path.basename(files[0].fsPath)}` };
    }
    const items = files.map(f => ({ label: path.basename(f.fsPath), description: vscode.workspace.asRelativePath(f), uri: f }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: `Multiple matches for "${filename}"` });
    if (picked) {
      await vscode.window.showTextDocument((picked as any).uri);
      return { success: true, message: `Opened ${picked.label}` };
    }
    return { success: false, message: 'Cancelled' };
  }

  private async goToFunction(functionName: string): Promise<{ success: boolean; message: string }> {
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', functionName);
    if (!symbols || symbols.length === 0) return { success: false, message: `Function "${functionName}" not found` };
    const sym = symbols[0];
    const doc = await vscode.workspace.openTextDocument(sym.location.uri);
    await vscode.window.showTextDocument(doc, { selection: sym.location.range });
    return { success: true, message: `Jumped to ${functionName}` };
  }

  private async editLine(line: number, from: string, to: string): Promise<{ success: boolean; message: string }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { success: false, message: 'No active editor' };
    const lineText = editor.document.lineAt(line - 1).text;
    if (!lineText.includes(from)) return { success: false, message: `"${from}" not found on line ${line}` };
    const newText = lineText.replace(from, to);
    await editor.edit(b => b.replace(editor.document.lineAt(line - 1).range, newText));
    return { success: true, message: `Line ${line}: replaced "${from}" with "${to}"` };
  }

  private async runCommand(command: string): Promise<{ success: boolean; message: string }> {
    // Map common voice commands to actual terminal commands
    const cmdMap: Record<string, string> = {
      'tests': 'npm test', 'test': 'npm test', 'build': 'npm run build',
      'install': 'npm install', 'lint': 'npm run lint', 'dev': 'npm run dev',
    };
    const actualCmd = cmdMap[command.toLowerCase()] || command;
    const terminal = vscode.window.createTerminal('INA Voice');
    terminal.show();
    terminal.sendText(actualCmd);
    return { success: true, message: `Running: ${actualCmd}` };
  }

  private async askQuestion(question: string): Promise<{ success: boolean; message: string }> {
    await vscode.commands.executeCommand('inaCoding.openChat');
    await vscode.commands.executeCommand('inaCoding.sendMessage', question);
    return { success: true, message: 'Question sent to INA-7 Pro' };
  }

  private async dictateComment(comment: string): Promise<{ success: boolean; message: string }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { success: false, message: 'No active editor' };
    const line = editor.selection.active.line;
    const indent = editor.document.lineAt(line).text.match(/^(\s*)/)?.[1] || '';
    await editor.edit(b => b.insert(new vscode.Position(line, 0), `${indent}// ${comment}\n`));
    return { success: true, message: 'Comment added' };
  }

  private async renameVariable(from: string, to: string): Promise<{ success: boolean; message: string }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { success: false, message: 'No active editor' };
    const text = editor.document.getText();
    const idx = text.indexOf(from);
    if (idx < 0) return { success: false, message: `"${from}" not found` };
    const pos = editor.document.positionAt(idx);
    editor.selection = new vscode.Selection(pos, pos.translate(0, from.length));
    await vscode.commands.executeCommand('editor.action.rename');
    return { success: true, message: `Renaming ${from} to ${to}` };
  }

  private async deleteLines(startLine: number, endLine: number): Promise<{ success: boolean; message: string }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return { success: false, message: 'No active editor' };
    const confirm = await vscode.window.showWarningMessage(`Delete lines ${startLine}-${endLine}?`, 'Yes', 'No');
    if (confirm !== 'Yes') return { success: false, message: 'Cancelled' };
    const range = new vscode.Range(startLine - 1, 0, endLine, 0);
    await editor.edit(b => b.delete(range));
    return { success: true, message: `Deleted lines ${startLine}-${endLine}` };
  }

  private async explainCode(query: string): Promise<{ success: boolean; message: string }> {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.document.getText(editor.selection);
    const text = selection || query || 'this code';
    await vscode.commands.executeCommand('inaCoding.openChat');
    await vscode.commands.executeCommand('inaCoding.sendMessage', `Explain: ${text}`);
    return { success: true, message: 'Explaining code...' };
  }
}
