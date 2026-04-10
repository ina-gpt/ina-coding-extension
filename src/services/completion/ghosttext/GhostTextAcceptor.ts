import * as vscode from 'vscode';
import { GhostTextSessionManager } from './GhostTextSessionManager';
import { GhostTextRenderer } from './GhostTextRenderer';
import { GhostTextItem, PartialAcceptResult, AcceptMode } from './GhostTextTypes';

export class GhostTextAcceptor {
  private sessionManager: GhostTextSessionManager;
  private renderer: GhostTextRenderer;

  constructor(sessionManager: GhostTextSessionManager, renderer: GhostTextRenderer) {
    this.sessionManager = sessionManager;
    this.renderer = renderer;
  }

  async acceptFull(editor: vscode.TextEditor): Promise<boolean> {
    const session = this.sessionManager.getActiveSession();
    const item = this.sessionManager.getCurrentItem();
    if (!session || !item) return false;

    const remainingText = item.fullText.slice(session.partialAcceptPosition);
    if (!remainingText) return false;

    const insertPosition = session.partialAcceptPosition > 0
      ? editor.selection.active
      : item.position;

    const success = await this.insertText(editor, remainingText, insertPosition);
    if (success) {
      this.renderer.hide(editor, false);
      this.sessionManager.endSession('accepted');
    }
    return success;
  }

  async acceptWord(editor: vscode.TextEditor): Promise<PartialAcceptResult | null> {
    const session = this.sessionManager.getActiveSession();
    const item = this.sessionManager.getCurrentItem();
    if (!session || !item) return null;

    const remainingText = item.fullText.slice(session.partialAcceptPosition);
    if (!remainingText) return null;

    const wordEnd = this.findNextWordBoundary(remainingText, 0);
    const wordText = remainingText.slice(0, wordEnd);

    const insertPosition = session.partialAcceptPosition > 0
      ? editor.selection.active
      : item.position;

    const success = await this.insertText(editor, wordText, insertPosition);
    if (!success) return null;

    const newPartialPos = session.partialAcceptPosition + wordEnd;
    const isComplete = newPartialPos >= item.fullText.length;

    if (isComplete) {
      this.renderer.hide(editor, false);
      this.sessionManager.endSession('accepted');
    } else {
      this.sessionManager.updatePartialAcceptPosition(newPartialPos);
      this.renderer.updatePartialAccept(editor, item, newPartialPos);

      // Highlight accepted word
      const newCursorPos = editor.selection.active;
      const startPos = new vscode.Position(
        newCursorPos.line,
        newCursorPos.character - wordText.replace(/\n/g, '').length
      );
      this.renderer.highlightAccepted(editor, new vscode.Range(startPos, newCursorPos));
    }

    return {
      acceptedText: wordText,
      remainingText: item.fullText.slice(newPartialPos),
      newPosition: editor.selection.active,
      isComplete,
      mode: 'word',
    };
  }

  async acceptLine(editor: vscode.TextEditor): Promise<PartialAcceptResult | null> {
    const session = this.sessionManager.getActiveSession();
    const item = this.sessionManager.getCurrentItem();
    if (!session || !item) return null;

    const remainingText = item.fullText.slice(session.partialAcceptPosition);
    if (!remainingText) return null;

    const lineEnd = this.findNextLineBoundary(remainingText, 0);
    const lineText = remainingText.slice(0, lineEnd);

    const insertPosition = session.partialAcceptPosition > 0
      ? editor.selection.active
      : item.position;

    const success = await this.insertText(editor, lineText, insertPosition);
    if (!success) return null;

    const newPartialPos = session.partialAcceptPosition + lineEnd;
    const isComplete = newPartialPos >= item.fullText.length;

    if (isComplete) {
      this.renderer.hide(editor, false);
      this.sessionManager.endSession('accepted');
    } else {
      this.sessionManager.updatePartialAcceptPosition(newPartialPos);
      this.renderer.updatePartialAccept(editor, item, newPartialPos);
    }

    return {
      acceptedText: lineText,
      remainingText: item.fullText.slice(newPartialPos),
      newPosition: editor.selection.active,
      isComplete,
      mode: 'line',
    };
  }

  async acceptChar(editor: vscode.TextEditor): Promise<PartialAcceptResult | null> {
    const session = this.sessionManager.getActiveSession();
    const item = this.sessionManager.getCurrentItem();
    if (!session || !item) return null;

    const remainingText = item.fullText.slice(session.partialAcceptPosition);
    if (!remainingText) return null;

    const charText = remainingText[0];
    const insertPosition = session.partialAcceptPosition > 0
      ? editor.selection.active
      : item.position;

    const success = await this.insertText(editor, charText, insertPosition);
    if (!success) return null;

    const newPartialPos = session.partialAcceptPosition + 1;
    const isComplete = newPartialPos >= item.fullText.length;

    if (isComplete) {
      this.renderer.hide(editor, false);
      this.sessionManager.endSession('accepted');
    } else {
      this.sessionManager.updatePartialAcceptPosition(newPartialPos);
      this.renderer.updatePartialAccept(editor, item, newPartialPos);
    }

    return {
      acceptedText: charText,
      remainingText: item.fullText.slice(newPartialPos),
      newPosition: editor.selection.active,
      isComplete,
      mode: 'char',
    };
  }

  async acceptToPosition(
    editor: vscode.TextEditor,
    targetPosition: number
  ): Promise<PartialAcceptResult | null> {
    const session = this.sessionManager.getActiveSession();
    const item = this.sessionManager.getCurrentItem();
    if (!session || !item) return null;

    const clampedPos = Math.min(targetPosition, item.fullText.length);
    const text = item.fullText.slice(session.partialAcceptPosition, clampedPos);
    if (!text) return null;

    const insertPosition = session.partialAcceptPosition > 0
      ? editor.selection.active
      : item.position;

    const success = await this.insertText(editor, text, insertPosition);
    if (!success) return null;

    const isComplete = clampedPos >= item.fullText.length;

    if (isComplete) {
      this.renderer.hide(editor, false);
      this.sessionManager.endSession('accepted');
    } else {
      this.sessionManager.updatePartialAcceptPosition(clampedPos);
      this.renderer.updatePartialAccept(editor, item, clampedPos);
    }

    return {
      acceptedText: text,
      remainingText: item.fullText.slice(clampedPos),
      newPosition: editor.selection.active,
      isComplete,
      mode: 'toPosition',
    };
  }

  private async insertText(
    editor: vscode.TextEditor,
    text: string,
    position: vscode.Position
  ): Promise<boolean> {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(editor.document.uri, position, text);
    return vscode.workspace.applyEdit(edit);
  }

  private findNextWordBoundary(text: string, fromPosition: number): number {
    let pos = fromPosition;

    // Skip leading whitespace
    while (pos < text.length && /\s/.test(text[pos])) {
      pos++;
    }

    // If we hit a newline, return that as word boundary
    if (pos > fromPosition && text.slice(fromPosition, pos).includes('\n')) {
      return text.indexOf('\n', fromPosition) + 1;
    }

    // Find end of word
    while (pos < text.length && /\w/.test(text[pos])) {
      pos++;
    }

    // If no word chars found, take next non-whitespace chunk
    if (pos === fromPosition) {
      while (pos < text.length && !/\s/.test(text[pos]) && !/\w/.test(text[pos])) {
        pos++;
      }
    }

    // Minimum 1 character
    return Math.max(pos, fromPosition + 1);
  }

  private findNextLineBoundary(text: string, fromPosition: number): number {
    const newlineIdx = text.indexOf('\n', fromPosition);
    if (newlineIdx === -1) return text.length;
    return newlineIdx + 1;
  }

  getAcceptableChunks(
    item: GhostTextItem
  ): Array<{ type: 'word' | 'line'; text: string; start: number; end: number }> {
    const chunks: Array<{ type: 'word' | 'line'; text: string; start: number; end: number }> = [];
    let pos = 0;

    while (pos < item.fullText.length) {
      const lineEnd = this.findNextLineBoundary(item.fullText, pos);
      chunks.push({
        type: 'line',
        text: item.fullText.slice(pos, lineEnd),
        start: pos,
        end: lineEnd,
      });
      pos = lineEnd;
    }

    return chunks;
  }

  previewAccept(mode: AcceptMode): string | null {
    const session = this.sessionManager.getActiveSession();
    const item = this.sessionManager.getCurrentItem();
    if (!session || !item) return null;

    const remaining = item.fullText.slice(session.partialAcceptPosition);
    if (!remaining) return null;

    switch (mode) {
      case 'full':
        return remaining;
      case 'word':
        return remaining.slice(0, this.findNextWordBoundary(remaining, 0));
      case 'line':
        return remaining.slice(0, this.findNextLineBoundary(remaining, 0));
      case 'char':
        return remaining[0];
      default:
        return null;
    }
  }
}
