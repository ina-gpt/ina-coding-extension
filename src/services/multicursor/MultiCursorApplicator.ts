/**
 * Multi-Cursor Applicator
 *
 * Safely applies edits to multiple cursor positions using bottom-to-top ordering.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { MultiCursorSession, CursorEdit, CursorPosition } from './MultiCursorTypes';

// ============ Multi-Cursor Applicator ============

export class MultiCursorApplicator {
  private static instance: MultiCursorApplicator;

  private constructor() {}

  static getInstance(): MultiCursorApplicator {
    if (!MultiCursorApplicator.instance) {
      MultiCursorApplicator.instance = new MultiCursorApplicator();
    }
    return MultiCursorApplicator.instance;
  }

  // ============ Apply All ============

  async applyAllEdits(editor: vscode.TextEditor, session: MultiCursorSession): Promise<boolean> {
    const validation = this.validateEditApplication(editor, session);
    if (!validation.valid) {
      Logger.warn(`Edit validation failed: ${validation.conflicts.join('; ')}`);
      return false;
    }

    const wsEdit = this.createAtomicEdit(session);
    const success = await vscode.workspace.applyEdit(wsEdit);

    if (success) {
      Logger.info(`Applied ${session.edits.size} edits atomically for session ${session.id}`);
    } else {
      Logger.error(`Failed to apply edits for session ${session.id}`);
    }

    return success;
  }

  // ============ Apply Single ============

  async applySingleEdit(editor: vscode.TextEditor, cursorEdit: CursorEdit, cursor: CursorPosition): Promise<boolean> {
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(editor.document.uri, cursor.range, cursorEdit.generatedContent);
    return vscode.workspace.applyEdit(wsEdit);
  }

  // ============ Position Shifts ============

  calculatePositionShifts(edits: CursorEdit[], cursors: CursorPosition[]): Map<string, { lineDelta: number; charDelta: number }> {
    const shifts = new Map<string, { lineDelta: number; charDelta: number }>();

    // Validate array alignment
    const count = Math.min(edits.length, cursors.length);
    if (edits.length !== cursors.length) {
      Logger.warn(`Position shift: array length mismatch (${cursors.length} cursors, ${edits.length} edits). Using first ${count}.`);
    }

    // Sort by position (top to bottom), pairing by index safely
    const sorted = cursors
      .slice(0, count)
      .map((cursor, i) => ({ cursor, edit: edits[i] }))
      .sort((a, b) => a.cursor.lineNumber - b.cursor.lineNumber);

    let cumulativeLineDelta = 0;

    for (const { cursor, edit } of sorted) {
      shifts.set(cursor.id, {
        lineDelta: cumulativeLineDelta,
        charDelta: 0,
      });

      if (edit && edit.status === 'accepted') {
        const originalLines = edit.originalContent.split('\n').length;
        const newLines = edit.generatedContent.split('\n').length;
        cumulativeLineDelta += newLines - originalLines;
      }
    }

    return shifts;
  }

  adjustRangeForShifts(
    range: vscode.Range,
    shifts: Map<string, { lineDelta: number; charDelta: number }>,
    currentCursorId: string
  ): vscode.Range {
    const shift = shifts.get(currentCursorId);
    if (!shift || shift.lineDelta === 0) return range;

    return new vscode.Range(
      new vscode.Position(range.start.line + shift.lineDelta, range.start.character + shift.charDelta),
      new vscode.Position(range.end.line + shift.lineDelta, range.end.character + shift.charDelta)
    );
  }

  // ============ Atomic Edit ============

  createAtomicEdit(session: MultiCursorSession): vscode.WorkspaceEdit {
    const wsEdit = new vscode.WorkspaceEdit();

    // Sort bottom-to-top to avoid line shift issues
    const editPairs = this.sortEditsBottomToTop(session);

    for (const { edit, cursor } of editPairs) {
      if (edit.status === 'accepted' && edit.generatedContent) {
        wsEdit.replace(session.editor.document.uri, cursor.range, edit.generatedContent);
      }
    }

    return wsEdit;
  }

  // ============ Revert ============

  async revertAllEdits(editor: vscode.TextEditor, session: MultiCursorSession): Promise<boolean> {
    const wsEdit = new vscode.WorkspaceEdit();

    const editPairs = this.sortEditsBottomToTop(session);

    for (const { edit, cursor } of editPairs) {
      if (edit.status === 'accepted') {
        // Calculate adjusted range (content may have changed)
        const originalLines = edit.originalContent.split('\n').length;
        const genLines = edit.generatedContent.split('\n').length;

        const endLine = cursor.range.start.line + genLines - 1;
        const endChar = edit.generatedContent.split('\n')[genLines - 1]?.length ?? 0;

        const currentRange = new vscode.Range(
          cursor.range.start,
          new vscode.Position(endLine, endChar)
        );

        wsEdit.replace(editor.document.uri, currentRange, edit.originalContent);
      }
    }

    return vscode.workspace.applyEdit(wsEdit);
  }

  async revertSingleEdit(editor: vscode.TextEditor, cursorEdit: CursorEdit, cursor: CursorPosition): Promise<boolean> {
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(editor.document.uri, cursor.range, cursorEdit.originalContent);
    return vscode.workspace.applyEdit(wsEdit);
  }

  // ============ Validation ============

  validateEditApplication(editor: vscode.TextEditor, session: MultiCursorSession): { valid: boolean; conflicts: string[] } {
    const conflicts: string[] = [];

    // Check for overlapping edits
    const sortedCursors = [...session.cursors].sort((a, b) => a.lineNumber - b.lineNumber);

    for (let i = 0; i < sortedCursors.length - 1; i++) {
      const current = sortedCursors[i];
      const next = sortedCursors[i + 1];

      if (current.range.end.line >= next.range.start.line) {
        const currentEdit = session.edits.get(current.id);
        const nextEdit = session.edits.get(next.id);

        if (currentEdit?.status === 'accepted' && nextEdit?.status === 'accepted') {
          conflicts.push(`Cursors #${current.index + 1} and #${next.index + 1} may overlap after editing`);
        }
      }
    }

    // Check document hasn't been externally modified
    // (Simple check - compare document version)

    return { valid: conflicts.length === 0, conflicts };
  }

  // ============ Sorting ============

  private sortEditsBottomToTop(session: MultiCursorSession): Array<{ edit: CursorEdit; cursor: CursorPosition }> {
    const pairs: Array<{ edit: CursorEdit; cursor: CursorPosition }> = [];

    for (const cursor of session.cursors) {
      const edit = session.edits.get(cursor.id);
      if (edit) {
        pairs.push({ edit, cursor });
      }
    }

    // Sort by line number descending (bottom-to-top)
    return pairs.sort((a, b) => {
      if (a.cursor.lineNumber !== b.cursor.lineNumber) {
        return b.cursor.lineNumber - a.cursor.lineNumber;
      }
      return b.cursor.column - a.cursor.column;
    });
  }
}
