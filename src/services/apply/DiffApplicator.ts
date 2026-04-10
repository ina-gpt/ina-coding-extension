/**
 * Phase 15.2 — Diff Applicator
 * Surgically applies code changes to files.
 */
import * as vscode from 'vscode';
import { ApplyResult, ApplyStrategy, ApplyRegion } from './ApplyTypes';
import { Logger } from '../../utils/Logger';

export class DiffApplicator {
  private static instance: DiffApplicator;
  private undoCounter = 0;
  private constructor() {}
  static getInstance(): DiffApplicator {
    if (!DiffApplicator.instance) DiffApplicator.instance = new DiffApplicator();
    return DiffApplicator.instance;
  }

  async apply(filePath: string, code: string, strategy: ApplyStrategy): Promise<ApplyResult> {
    switch (strategy) {
      case 'replace': return this.replaceFile(filePath, code);
      case 'surgical': return this.surgicalReplace(filePath, code);
      case 'insert': return this.insertAtCursor(filePath, code);
      case 'create': return this.createFile(filePath, code);
      case 'append': return this.appendToFile(filePath, code);
      default: return { success: false, filePath, strategy, linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: `Unknown strategy: ${strategy}`, undoId: '' };
    }
  }

  async replaceFile(filePath: string, newContent: string): Promise<ApplyResult> {
    const undoId = `apply-${++this.undoCounter}`;
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const oldContent = doc.getText();
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), newContent);
      const ok = await vscode.workspace.applyEdit(edit);
      const added = newContent.split('\n').length;
      const removed = oldContent.split('\n').length;
      return { success: ok, filePath, strategy: 'replace', linesChanged: added, linesAdded: Math.max(0, added - removed), linesRemoved: Math.max(0, removed - added), error: ok ? null : 'Edit failed', undoId };
    } catch (e: any) {
      return { success: false, filePath, strategy: 'replace', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: e.message, undoId };
    }
  }

  async surgicalReplace(filePath: string, code: string): Promise<ApplyResult> {
    const undoId = `apply-${++this.undoCounter}`;
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const fileContent = doc.getText();
      const region = this.findMatchingRegion(fileContent, code);
      if (!region) {
        Logger.debug('[DiffApplicator] No matching region, appending');
        return this.appendToFile(filePath, code);
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(region.startLine, 0, region.endLine + 1, 0), code.endsWith('\n') ? code : code + '\n');
      const ok = await vscode.workspace.applyEdit(edit);
      const oldLines = region.endLine - region.startLine + 1;
      const newLines = code.split('\n').length;
      return { success: ok, filePath, strategy: 'surgical', linesChanged: newLines, linesAdded: Math.max(0, newLines - oldLines), linesRemoved: Math.max(0, oldLines - newLines), error: ok ? null : 'Edit failed', undoId };
    } catch (e: any) {
      return { success: false, filePath, strategy: 'surgical', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: e.message, undoId };
    }
  }

  async insertAtCursor(filePath: string, code: string): Promise<ApplyResult> {
    const undoId = `apply-${++this.undoCounter}`;
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const pos = editor.selection.active;
      await editor.edit(eb => { eb.insert(pos, code); });
      return { success: true, filePath, strategy: 'insert', linesChanged: code.split('\n').length, linesAdded: code.split('\n').length, linesRemoved: 0, error: null, undoId };
    } catch (e: any) {
      return { success: false, filePath, strategy: 'insert', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: e.message, undoId };
    }
  }

  async createFile(filePath: string, code: string): Promise<ApplyResult> {
    const undoId = `apply-${++this.undoCounter}`;
    try {
      const uri = vscode.Uri.file(filePath);
      const dirUri = vscode.Uri.file(filePath.substring(0, filePath.lastIndexOf('/')));
      try { await vscode.workspace.fs.createDirectory(dirUri); } catch {}
      await vscode.workspace.fs.writeFile(uri, Buffer.from(code, 'utf-8'));
      await vscode.window.showTextDocument(uri);
      return { success: true, filePath, strategy: 'create', linesChanged: code.split('\n').length, linesAdded: code.split('\n').length, linesRemoved: 0, error: null, undoId };
    } catch (e: any) {
      return { success: false, filePath, strategy: 'create', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: e.message, undoId };
    }
  }

  async appendToFile(filePath: string, code: string): Promise<ApplyResult> {
    const undoId = `apply-${++this.undoCounter}`;
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      const lastLine = doc.lineCount - 1;
      const insertPos = new vscode.Position(lastLine, doc.lineAt(lastLine).text.length);
      edit.insert(uri, insertPos, '\n\n' + code);
      const ok = await vscode.workspace.applyEdit(edit);
      return { success: ok, filePath, strategy: 'append', linesChanged: code.split('\n').length, linesAdded: code.split('\n').length, linesRemoved: 0, error: ok ? null : 'Edit failed', undoId };
    } catch (e: any) {
      return { success: false, filePath, strategy: 'append', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: e.message, undoId };
    }
  }

  findMatchingRegion(fileContent: string, codeBlock: string): ApplyRegion | null {
    const fileLines = fileContent.split('\n');
    const codeLines = codeBlock.split('\n');
    // Extract function/class name from code block
    const symbolMatch = codeBlock.match(/(?:(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let)\s+)(\w+)/);
    if (!symbolMatch) return null;
    const symbolName = symbolMatch[1];
    // Find symbol in file
    let startLine = -1;
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].includes(symbolName) && /(?:function|class|interface|type|const|let)\s/.test(fileLines[i])) {
        startLine = i;
        break;
      }
    }
    if (startLine === -1) return null;
    // Find end of symbol (bracket matching)
    let depth = 0;
    let endLine = startLine;
    let foundOpen = false;
    for (let i = startLine; i < fileLines.length; i++) {
      for (const ch of fileLines[i]) {
        if (ch === '{') { depth++; foundOpen = true; }
        if (ch === '}') depth--;
      }
      if (foundOpen && depth <= 0) { endLine = i; break; }
      if (i > startLine + 200) { endLine = i; break; }
    }
    return { startLine, endLine, content: fileLines.slice(startLine, endLine + 1).join('\n'), matchScore: 0.8 };
  }
}
