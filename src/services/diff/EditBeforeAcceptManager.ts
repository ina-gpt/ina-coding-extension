/**
 * Edit Before Accept Manager
 *
 * Manages editing of generated code before accepting changes.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

// ============ Types ============

interface EditingSession {
  originalContent: string;
  originalModified: string;
  range: vscode.Range;
  disposables: vscode.Disposable[];
  statusBarItem: vscode.StatusBarItem | null;
  editDecoration: vscode.TextEditorDecorationType | null;
}

// ============ Edit Before Accept Manager ============

export class EditBeforeAcceptManager implements vscode.Disposable {
  private editingSessions: Map<string, EditingSession> = new Map();

  // ============ Start Editing ============

  async startEditing(sessionId: string, editor: vscode.TextEditor, modifiedContent: string, range: vscode.Range): Promise<void> {
    // Replace selection with modified content
    await editor.edit(editBuilder => {
      editBuilder.replace(range, modifiedContent);
    });

    // Calculate new range
    const modifiedLines = modifiedContent.split('\n');
    const newEndLine = range.start.line + modifiedLines.length - 1;
    const newEndChar = modifiedLines[modifiedLines.length - 1].length;
    const newRange = new vscode.Range(range.start, new vscode.Position(newEndLine, newEndChar));

    const disposables: vscode.Disposable[] = [];

    // Track changes
    const changeDisposable = this.trackChanges(sessionId, editor);
    disposables.push(changeDisposable);

    // Show editing indicator
    const statusBarItem = this.createEditingStatusBar();
    const editDecoration = this.createEditingDecoration(editor, newRange);

    this.editingSessions.set(sessionId, {
      originalContent: editor.document.getText(newRange),
      originalModified: modifiedContent,
      range: newRange,
      disposables,
      statusBarItem,
      editDecoration,
    });

    // Set context for keybindings
    vscode.commands.executeCommand('setContext', 'inaCoding.diffEditing', true);

    Logger.info(`Started editing mode for ${sessionId}`);
  }

  // ============ Finish Editing ============

  async finishEditing(sessionId: string): Promise<{ finalContent: string; wasModified: boolean } | null> {
    const session = this.editingSessions.get(sessionId);
    if (!session) return null;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const finalContent = editor.document.getText(session.range);
    const wasModified = finalContent !== session.originalModified;

    this.cleanupSession(sessionId);

    Logger.info(`Finished editing for ${sessionId}, modified: ${wasModified}`);
    return { finalContent, wasModified };
  }

  // ============ Cancel Editing ============

  async cancelEditing(sessionId: string): Promise<void> {
    const session = this.editingSessions.get(sessionId);
    if (!session) return;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      // Revert to original modified content
      await editor.edit(editBuilder => {
        editBuilder.replace(session.range, session.originalModified);
      });
    }

    this.cleanupSession(sessionId);
    Logger.info(`Cancelled editing for ${sessionId}`);
  }

  // ============ Queries ============

  isEditing(sessionId: string): boolean {
    return this.editingSessions.has(sessionId);
  }

  getEditedContent(sessionId: string): string | null {
    const session = this.editingSessions.get(sessionId);
    if (!session) return null;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    return editor.document.getText(session.range);
  }

  // ============ Change Tracking ============

  private trackChanges(sessionId: string, editor: vscode.TextEditor): vscode.Disposable {
    return vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document !== editor.document) return;

      const session = this.editingSessions.get(sessionId);
      if (!session) return;

      // Update range based on changes
      for (const change of e.contentChanges) {
        if (change.range.intersection(session.range)) {
          const lineDelta = change.text.split('\n').length - 1 - (change.range.end.line - change.range.start.line);
          const newEnd = new vscode.Position(
            session.range.end.line + lineDelta,
            session.range.end.character
          );
          session.range = new vscode.Range(session.range.start, newEnd);
        }
      }
    });
  }

  // ============ Visual Indicators ============

  private createEditingStatusBar(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1005);
    item.text = '$(edit) Editing AI suggestion...';
    item.tooltip = 'Press Cmd+Shift+Enter to finish editing, Escape to cancel';
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.show();
    return item;
  }

  private createEditingDecoration(editor: vscode.TextEditor, range: vscode.Range): vscode.TextEditorDecorationType {
    const decType = vscode.window.createTextEditorDecorationType({
      border: '1px dashed',
      borderColor: new vscode.ThemeColor('charts.yellow'),
      isWholeLine: true,
    });

    const decorationRange = new vscode.Range(range.start.line, 0, range.end.line, 0);
    editor.setDecorations(decType, [{ range: decorationRange }]);

    return decType;
  }

  // ============ Validation ============

  validateEditedContent(content: string, language: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check bracket balance
    let bracketCount = 0;
    let parenCount = 0;
    let squareCount = 0;
    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (const ch of content) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }

      if (inString) {
        if (ch === stringChar) inString = false;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === '{') bracketCount++;
      else if (ch === '}') bracketCount--;
      else if (ch === '(') parenCount++;
      else if (ch === ')') parenCount--;
      else if (ch === '[') squareCount++;
      else if (ch === ']') squareCount--;
    }

    if (bracketCount !== 0) errors.push(`Unbalanced curly braces: ${bracketCount > 0 ? 'missing }' : 'extra }'}`);
    if (parenCount !== 0) errors.push(`Unbalanced parentheses: ${parenCount > 0 ? 'missing )' : 'extra )'}`);
    if (squareCount !== 0) errors.push(`Unbalanced brackets: ${squareCount > 0 ? 'missing ]' : 'extra ]'}`);
    if (inString) errors.push('Unclosed string literal');

    return { valid: errors.length === 0, errors };
  }

  // ============ Cleanup ============

  private cleanupSession(sessionId: string): void {
    const session = this.editingSessions.get(sessionId);
    if (!session) return;

    for (const d of session.disposables) d.dispose();

    if (session.statusBarItem) {
      session.statusBarItem.dispose();
    }

    if (session.editDecoration) {
      session.editDecoration.dispose();
    }

    this.editingSessions.delete(sessionId);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffEditing', false);
  }

  // ============ Dispose ============

  dispose(): void {
    for (const [sessionId] of this.editingSessions) {
      this.cleanupSession(sessionId);
    }
  }
}
