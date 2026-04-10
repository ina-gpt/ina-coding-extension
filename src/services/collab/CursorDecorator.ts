/**
 * CursorDecorator.ts — Phase 20 Step 20.5
 * Show remote participants' cursors and selections in the editor
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

interface ParticipantCursor {
  userId: string;
  name: string;
  color: string;
  file: string;
  line: number;
  column: number;
  selectionStart?: { line: number; column: number };
  selectionEnd?: { line: number; column: number };
  isTyping: boolean;
  lastUpdate: number;
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export class CursorDecorator implements vscode.Disposable {
  private cursors = new Map<string, ParticipantCursor>();
  private decorationTypes = new Map<string, { cursor: vscode.TextEditorDecorationType; selection: vscode.TextEditorDecorationType; label: vscode.TextEditorDecorationType }>();
  private updateTimer?: ReturnType<typeof setInterval>;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.updateTimer = setInterval(() => this.refresh(), 100);
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
    );
  }

  updateCursor(cursor: ParticipantCursor): void {
    this.cursors.set(cursor.userId, { ...cursor, lastUpdate: Date.now() });
    this.ensureDecorationType(cursor.userId, cursor.color, cursor.name);
    this.refresh();
  }

  removeCursor(userId: string): void {
    this.cursors.delete(userId);
    const types = this.decorationTypes.get(userId);
    if (types) {
      types.cursor.dispose();
      types.selection.dispose();
      types.label.dispose();
      this.decorationTypes.delete(userId);
    }
    this.refresh();
  }

  private ensureDecorationType(userId: string, color: string, name: string): void {
    if (this.decorationTypes.has(userId)) return;

    const cursor = vscode.window.createTextEditorDecorationType({
      borderWidth: '0 0 0 2px',
      borderStyle: 'solid',
      borderColor: color,
      isWholeLine: false,
    });

    const selection = vscode.window.createTextEditorDecorationType({
      backgroundColor: `${color}30`,
      isWholeLine: false,
    });

    const label = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ${name}`,
        color,
        fontWeight: '600',
        margin: '0 0 0 4px',
      },
    });

    this.decorationTypes.set(userId, { cursor, selection, label });
  }

  private refresh(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const currentFile = vscode.workspace.asRelativePath(editor.document.uri);
    const now = Date.now();

    for (const [userId, cursor] of this.cursors) {
      const types = this.decorationTypes.get(userId);
      if (!types) continue;

      if (cursor.file !== currentFile) {
        // Not in the same file — clear decorations
        editor.setDecorations(types.cursor, []);
        editor.setDecorations(types.selection, []);
        editor.setDecorations(types.label, []);
        continue;
      }

      // Cursor position
      const pos = new vscode.Position(cursor.line, cursor.column);
      const cursorRange = new vscode.Range(pos, pos.translate(0, 1));
      editor.setDecorations(types.cursor, [cursorRange]);

      // Label (fade after 3s)
      if (now - cursor.lastUpdate < 3000) {
        editor.setDecorations(types.label, [new vscode.Range(pos, pos)]);
      } else {
        editor.setDecorations(types.label, []);
      }

      // Selection
      if (cursor.selectionStart && cursor.selectionEnd) {
        const selRange = new vscode.Range(
          new vscode.Position(cursor.selectionStart.line, cursor.selectionStart.column),
          new vscode.Position(cursor.selectionEnd.line, cursor.selectionEnd.column)
        );
        editor.setDecorations(types.selection, [selRange]);
      } else {
        editor.setDecorations(types.selection, []);
      }
    }
  }

  getParticipantColor(index: number): string {
    return COLORS[index % COLORS.length];
  }

  getCursorCount(): number {
    return this.cursors.size;
  }

  dispose(): void {
    if (this.updateTimer) clearInterval(this.updateTimer);
    for (const types of this.decorationTypes.values()) {
      types.cursor.dispose();
      types.selection.dispose();
      types.label.dispose();
    }
    this.decorationTypes.clear();
    this.cursors.clear();
    this.disposables.forEach(d => d.dispose());
  }
}
