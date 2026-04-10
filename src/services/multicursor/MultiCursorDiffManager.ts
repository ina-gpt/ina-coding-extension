/**
 * Multi-Cursor Diff Manager
 *
 * Manages diff previews and visual indicators for multiple cursors.
 */

import * as vscode from 'vscode';
import { DiffCalculator, diffCalculator } from '../diff/DiffCalculator';
import { MultiCursorSession, CursorPosition, CursorEdit } from './MultiCursorTypes';

// ============ Color Palette ============

const CURSOR_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#9C27B0',
  '#00BCD4', '#E91E63', '#FFEB3B', '#795548',
];

// ============ Multi-Cursor Diff Manager ============

export class MultiCursorDiffManager implements vscode.Disposable {
  private calculator: DiffCalculator;
  private activeDecorations: Map<string, vscode.TextEditorDecorationType[]> = new Map();
  private cursorBadges: Map<string, vscode.TextEditorDecorationType> = new Map();

  constructor() {
    this.calculator = diffCalculator;
  }

  // ============ Show All ============

  showAllDiffPreviews(editor: vscode.TextEditor, session: MultiCursorSession): void {
    this.clearAllPreviews(editor);

    for (let i = 0; i < session.cursors.length; i++) {
      const cursor = session.cursors[i];
      const edit = session.edits.get(cursor.id);
      if (!edit || edit.status === 'error') continue;

      const color = this.getCursorColor(i);
      this.highlightCursor(editor, cursor.id, cursor, color, i);

      if (edit.generatedContent) {
        this.showSingleDiffPreview(editor, cursor.id, cursor, edit, color);
      }
    }
  }

  // ============ Single Diff ============

  showSingleDiffPreview(editor: vscode.TextEditor, cursorId: string, cursor: CursorPosition, edit: CursorEdit, color?: string): void {
    if (!edit.generatedContent) return;

    const cursorColor = color || CURSOR_COLORS[cursor.index % CURSOR_COLORS.length];

    // Calculate diff
    if (!edit.diffResult) {
      edit.diffResult = this.calculator.calculateDiff(edit.originalContent, edit.generatedContent);
    }

    // Show added decoration
    const addedType = vscode.window.createTextEditorDecorationType({
      backgroundColor: `${cursorColor}22`,
      isWholeLine: true,
      overviewRulerColor: cursorColor,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      after: {
        contentText: ` [#${cursor.index + 1}]`,
        color: cursorColor,
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    const range = cursor.range;
    editor.setDecorations(addedType, [{ range }]);

    const decorations = this.activeDecorations.get(cursorId) || [];
    decorations.push(addedType);
    this.activeDecorations.set(cursorId, decorations);
  }

  // ============ Cursor Highlighting ============

  highlightCursor(editor: vscode.TextEditor, cursorId: string, cursor: CursorPosition, color: string, index?: number): void {
    this.unhighlightCursor(editor, cursorId);

    const badge = vscode.window.createTextEditorDecorationType({
      before: {
        contentText: `#${(index ?? cursor.index) + 1}`,
        color: '#ffffff',
        backgroundColor: color,
        margin: '0 4px 0 0',
        fontWeight: 'bold',
        border: `1px solid ${color}`,
      },
      border: `2px solid ${color}`,
      borderRadius: '2px',
      isWholeLine: false,
    });

    editor.setDecorations(badge, [{ range: cursor.range }]);
    this.cursorBadges.set(cursorId, badge);
  }

  unhighlightCursor(editor: vscode.TextEditor, cursorId: string): void {
    const badge = this.cursorBadges.get(cursorId);
    if (badge) {
      editor.setDecorations(badge, []);
      badge.dispose();
      this.cursorBadges.delete(cursorId);
    }
  }

  // ============ Status Indicators ============

  showCursorAccepted(editor: vscode.TextEditor, cursorId: string, cursor: CursorPosition): void {
    const flashType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(46, 160, 67, 0.3)',
      isWholeLine: true,
      before: {
        contentText: '\u2713',
        color: '#2ea043',
        fontWeight: 'bold',
        margin: '0 4px 0 0',
      },
    });

    editor.setDecorations(flashType, [{ range: cursor.range }]);

    setTimeout(() => {
      editor.setDecorations(flashType, []);
      flashType.dispose();
    }, 300);
  }

  showCursorRejected(editor: vscode.TextEditor, cursorId: string, cursor: CursorPosition): void {
    const flashType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(248, 81, 73, 0.3)',
      isWholeLine: true,
      before: {
        contentText: '\u2717',
        color: '#f85149',
        fontWeight: 'bold',
        margin: '0 4px 0 0',
      },
    });

    editor.setDecorations(flashType, [{ range: cursor.range }]);

    setTimeout(() => {
      editor.setDecorations(flashType, []);
      flashType.dispose();
    }, 300);
  }

  showCursorError(editor: vscode.TextEditor, cursorId: string, cursor: CursorPosition, message: string): void {
    const errorType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(248, 81, 73, 0.1)',
      border: '1px dashed',
      borderColor: new vscode.ThemeColor('errorForeground'),
      after: {
        contentText: ` \u26a0 ${message}`,
        color: new vscode.ThemeColor('errorForeground'),
        fontStyle: 'italic',
        fontWeight: 'normal',
      },
    });

    editor.setDecorations(errorType, [{ range: cursor.range }]);

    const decorations = this.activeDecorations.get(cursorId) || [];
    decorations.push(errorType);
    this.activeDecorations.set(cursorId, decorations);
  }

  updateCursorStatus(editor: vscode.TextEditor, cursorId: string, cursor: CursorPosition, status: CursorEdit['status']): void {
    switch (status) {
      case 'accepted':
        this.showCursorAccepted(editor, cursorId, cursor);
        break;
      case 'rejected':
        this.showCursorRejected(editor, cursorId, cursor);
        break;
      case 'error':
        this.showCursorError(editor, cursorId, cursor, 'Generation failed');
        break;
    }
  }

  // ============ Navigation ============

  navigateToCursor(editor: vscode.TextEditor, cursorId: string, cursor: CursorPosition): void {
    const position = cursor.range.start;
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(cursor.range, vscode.TextEditorRevealType.InCenter);

    // Brief highlight
    const flashType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(255, 255, 0, 0.2)',
      isWholeLine: true,
    });

    editor.setDecorations(flashType, [{ range: cursor.range }]);

    setTimeout(() => {
      editor.setDecorations(flashType, []);
      flashType.dispose();
    }, 500);
  }

  // ============ Clear ============

  clearAllPreviews(editor: vscode.TextEditor): void {
    for (const [, decorations] of this.activeDecorations) {
      for (const dec of decorations) {
        editor.setDecorations(dec, []);
        dec.dispose();
      }
    }
    this.activeDecorations.clear();

    for (const [, badge] of this.cursorBadges) {
      editor.setDecorations(badge, []);
      badge.dispose();
    }
    this.cursorBadges.clear();
  }

  // ============ Helpers ============

  private getCursorColor(index: number): string {
    return CURSOR_COLORS[index % CURSOR_COLORS.length];
  }

  // ============ Dispose ============

  dispose(): void {
    for (const [, decorations] of this.activeDecorations) {
      for (const dec of decorations) dec.dispose();
    }
    for (const [, badge] of this.cursorBadges) badge.dispose();
    this.activeDecorations.clear();
    this.cursorBadges.clear();
  }
}
