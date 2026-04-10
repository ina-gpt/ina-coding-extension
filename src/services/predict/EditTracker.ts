/**
 * Phase 15.3 — Edit Tracker
 * Tracks user edits to detect patterns for prediction.
 */
import * as vscode from 'vscode';
import { EditEvent, EditType } from './PredictTypes';
import { Logger } from '../../utils/Logger';

export class EditTracker {
  private static instance: EditTracker;
  private editHistory: EditEvent[] = [];
  private recentEdits: EditEvent[] = [];
  private static MAX_HISTORY = 100;
  private static MAX_RECENT = 10;

  private constructor() {}
  static getInstance(): EditTracker {
    if (!EditTracker.instance) EditTracker.instance = new EditTracker();
    return EditTracker.instance;
  }

  trackEdit(event: vscode.TextDocumentChangeEvent): void {
    if (event.document.uri.scheme !== 'file') return;
    for (const change of event.contentChanges) {
      const oldText = event.document.getText(change.range) || '';
      const newText = change.text;
      if (oldText === newText) continue;
      if (newText.trim() === '' && oldText.trim() === '') continue;
      const editType = this.classifyEdit(change, event.document, oldText);
      const symbolName = this.extractSymbolName(oldText, newText, event.document, change.range.start);
      const edit: EditEvent = {
        timestamp: Date.now(),
        filePath: event.document.uri.fsPath,
        line: change.range.start.line,
        column: change.range.start.character,
        oldText,
        newText,
        editType,
        symbolName,
        scope: null,
      };
      this.editHistory.push(edit);
      if (this.editHistory.length > EditTracker.MAX_HISTORY) this.editHistory.shift();
      this.recentEdits.push(edit);
      if (this.recentEdits.length > EditTracker.MAX_RECENT) this.recentEdits.shift();
    }
  }

  getRecentEdits(count?: number): EditEvent[] {
    return this.recentEdits.slice(-(count || EditTracker.MAX_RECENT));
  }

  getEditsByType(type: EditType, windowMs: number = 60000): EditEvent[] {
    const cutoff = Date.now() - windowMs;
    return this.editHistory.filter(e => e.editType === type && e.timestamp > cutoff);
  }

  getEditPattern(): { type: EditType; oldSymbol: string; newSymbol: string; occurrences: number } | null {
    if (this.recentEdits.length < 2) return null;
    const renames = this.recentEdits.filter(e => e.editType === EditType.RENAME);
    if (renames.length >= 2) {
      const last = renames[renames.length - 1];
      const matching = renames.filter(e => e.oldText === last.oldText && e.newText === last.newText);
      if (matching.length >= 2) {
        return { type: EditType.RENAME, oldSymbol: last.oldText, newSymbol: last.newText, occurrences: matching.length };
      }
    }
    return null;
  }

  clearHistory(): void { this.editHistory = []; this.recentEdits = []; }

  private classifyEdit(change: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument, oldText: string): EditType {
    const newText = change.text;
    const line = document.lineAt(Math.min(change.range.start.line, document.lineCount - 1)).text;
    if (oldText.length > 0 && newText.length > 0 && /^\w+$/.test(oldText.trim()) && /^\w+$/.test(newText.trim())) return EditType.RENAME;
    if (/^\s*import\s/.test(newText)) return EditType.ADD_IMPORT;
    if (/:\s*\w+/.test(newText) && /:\s*\w+/.test(oldText) && oldText.includes(':') && newText.includes(':')) return EditType.CHANGE_TYPE;
    if (/[,(]\s*\w+/.test(newText) && line.includes('(')) return EditType.ADD_PARAMETER;
    if (/\btry\b|\bcatch\b/.test(newText)) return EditType.ADD_ERROR_HANDLING;
    if (newText.length > 0 && oldText.length === 0) return EditType.INSERT;
    if (newText.length === 0 && oldText.length > 0) return EditType.DELETE;
    if (newText.length > 0 && oldText.length > 0) return EditType.REPLACE;
    return EditType.GENERIC;
  }

  private extractSymbolName(oldText: string, newText: string, document: vscode.TextDocument, position: vscode.Position): string | null {
    const trimOld = oldText.trim();
    const trimNew = newText.trim();
    if (/^\w+$/.test(trimOld)) return trimOld;
    if (/^\w+$/.test(trimNew)) return trimNew;
    const wordRange = document.getWordRangeAtPosition(position);
    if (wordRange) return document.getText(wordRange);
    return null;
  }
}
