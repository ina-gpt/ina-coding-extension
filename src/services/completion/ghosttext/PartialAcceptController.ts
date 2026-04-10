/**
 * Phase 17.4 — Partial Accept Visual Controller
 * Enhances ghost text with word-by-word/line-by-line visual feedback.
 */
import * as vscode from 'vscode';
import { Logger } from '../../../utils/Logger';

export class PartialAcceptController {
  private static instance: PartialAcceptController;
  private currentGhostText: string | null = null;
  private acceptedPortion = '';
  private remainingPortion = '';
  private wordBoundaries: number[] = [];
  private lineBoundaries: number[] = [];
  private currentWordIndex = 0;
  private insertPosition: vscode.Position | null = null;
  private currentEditor: vscode.TextEditor | null = null;

  private remainingDecorationType: vscode.TextEditorDecorationType;
  private highlightDecorationType: vscode.TextEditorDecorationType;

  private constructor() {
    this.remainingDecorationType = vscode.window.createTextEditorDecorationType({
      after: { color: 'rgba(128, 128, 128, 0.4)', fontStyle: 'italic' },
    });
    this.highlightDecorationType = vscode.window.createTextEditorDecorationType({
      after: { color: 'rgba(59, 130, 246, 0.7)', fontStyle: 'italic', textDecoration: 'underline' },
    });
  }

  static getInstance(): PartialAcceptController {
    if (!PartialAcceptController.instance) PartialAcceptController.instance = new PartialAcceptController();
    return PartialAcceptController.instance;
  }

  startPartialAccept(editor: vscode.TextEditor, ghostText: string, insertPosition: vscode.Position): void {
    this.reset();
    this.currentEditor = editor;
    this.currentGhostText = ghostText;
    this.insertPosition = insertPosition;
    this.acceptedPortion = '';
    this.remainingPortion = ghostText;
    this.wordBoundaries = this.computeWordBoundaries(ghostText);
    this.lineBoundaries = this.computeLineBoundaries(ghostText);
    this.currentWordIndex = 0;
    this.renderPartialState();
  }

  acceptNextWord(): boolean {
    if (!this.currentGhostText || !this.currentEditor || !this.insertPosition) return false;
    if (this.currentWordIndex >= this.wordBoundaries.length) return false;

    const start = this.currentWordIndex === 0 ? 0 : this.wordBoundaries[this.currentWordIndex - 1];
    const end = this.wordBoundaries[this.currentWordIndex];
    const word = this.currentGhostText.substring(start, end);

    const insertAt = this.currentEditor.document.positionAt(
      this.currentEditor.document.offsetAt(this.insertPosition) + this.acceptedPortion.length
    );

    this.currentEditor.edit(eb => { eb.insert(insertAt, word); }, { undoStopBefore: false, undoStopAfter: false });
    this.acceptedPortion += word;
    this.remainingPortion = this.currentGhostText.substring(end);
    this.currentWordIndex++;

    if (this.currentWordIndex >= this.wordBoundaries.length) {
      this.complete();
      return true;
    }
    this.renderPartialState();
    return true;
  }

  acceptNextLine(): boolean {
    if (!this.currentGhostText || !this.currentEditor || !this.insertPosition) return false;
    const currentPos = this.acceptedPortion.length;
    let nextLineEnd = this.currentGhostText.indexOf('\n', currentPos);
    if (nextLineEnd === -1) nextLineEnd = this.currentGhostText.length;
    else nextLineEnd += 1; // include newline

    const lineText = this.currentGhostText.substring(currentPos, nextLineEnd);
    const insertAt = this.currentEditor.document.positionAt(
      this.currentEditor.document.offsetAt(this.insertPosition) + this.acceptedPortion.length
    );

    this.currentEditor.edit(eb => { eb.insert(insertAt, lineText); }, { undoStopBefore: false, undoStopAfter: false });
    this.acceptedPortion += lineText;
    this.remainingPortion = this.currentGhostText.substring(nextLineEnd);

    // Update word index to match
    while (this.currentWordIndex < this.wordBoundaries.length && this.wordBoundaries[this.currentWordIndex] <= nextLineEnd) {
      this.currentWordIndex++;
    }

    if (this.remainingPortion.length === 0) { this.complete(); return true; }
    this.renderPartialState();
    return true;
  }

  undoLastWord(): boolean {
    if (!this.currentGhostText || !this.currentEditor || this.currentWordIndex <= 0) return false;
    this.currentWordIndex--;
    const newEnd = this.currentWordIndex === 0 ? 0 : this.wordBoundaries[this.currentWordIndex - 1];
    const oldEnd = this.wordBoundaries[this.currentWordIndex];
    const wordToRemove = this.currentGhostText.substring(newEnd, oldEnd);

    const insertOffset = this.currentEditor.document.offsetAt(this.insertPosition!) + newEnd;
    const removeStart = this.currentEditor.document.positionAt(insertOffset);
    const removeEnd = this.currentEditor.document.positionAt(insertOffset + wordToRemove.length);

    this.currentEditor.edit(eb => { eb.delete(new vscode.Range(removeStart, removeEnd)); }, { undoStopBefore: false, undoStopAfter: false });
    this.acceptedPortion = this.currentGhostText.substring(0, newEnd);
    this.remainingPortion = this.currentGhostText.substring(newEnd);
    this.renderPartialState();
    return true;
  }

  acceptAll(): void {
    if (!this.currentEditor || !this.insertPosition || !this.remainingPortion) return;
    const insertAt = this.currentEditor.document.positionAt(
      this.currentEditor.document.offsetAt(this.insertPosition) + this.acceptedPortion.length
    );
    this.currentEditor.edit(eb => { eb.insert(insertAt, this.remainingPortion); });
    this.complete();
  }

  reject(): void { this.reset(); }

  isActive(): boolean { return this.currentGhostText !== null; }

  getStatus(): { acceptedWords: number; totalWords: number; acceptedLines: number; totalLines: number } {
    return {
      acceptedWords: this.currentWordIndex,
      totalWords: this.wordBoundaries.length,
      acceptedLines: (this.acceptedPortion.match(/\n/g) || []).length,
      totalLines: this.lineBoundaries.length,
    };
  }

  private renderPartialState(): void {
    if (!this.currentEditor || !this.insertPosition) return;
    // Show remaining as ghost decoration after the accepted portion
    const insertOffset = this.currentEditor.document.offsetAt(this.insertPosition) + this.acceptedPortion.length;
    const pos = this.currentEditor.document.positionAt(insertOffset);

    // Highlight next word
    const nextWordEnd = this.currentWordIndex < this.wordBoundaries.length
      ? this.wordBoundaries[this.currentWordIndex] - (this.currentWordIndex > 0 ? this.wordBoundaries[this.currentWordIndex - 1] : 0)
      : 0;
    const nextWord = this.remainingPortion.substring(0, nextWordEnd);
    const rest = this.remainingPortion.substring(nextWordEnd);

    if (nextWord) {
      this.currentEditor.setDecorations(this.highlightDecorationType, [{
        range: new vscode.Range(pos, pos),
        renderOptions: { after: { contentText: nextWord } },
      }]);
    }
    if (rest) {
      const afterPos = this.currentEditor.document.positionAt(insertOffset);
      this.currentEditor.setDecorations(this.remainingDecorationType, [{
        range: new vscode.Range(afterPos, afterPos),
        renderOptions: { after: { contentText: rest.split('\n')[0] } },
      }]);
    }
  }

  private complete(): void {
    this.clearDecorations();
    this.currentGhostText = null;
    this.currentEditor = null;
    this.insertPosition = null;
  }

  private reset(): void {
    this.clearDecorations();
    this.currentGhostText = null;
    this.acceptedPortion = '';
    this.remainingPortion = '';
    this.wordBoundaries = [];
    this.lineBoundaries = [];
    this.currentWordIndex = 0;
    this.currentEditor = null;
    this.insertPosition = null;
  }

  private clearDecorations(): void {
    if (this.currentEditor) {
      this.currentEditor.setDecorations(this.remainingDecorationType, []);
      this.currentEditor.setDecorations(this.highlightDecorationType, []);
    }
  }

  private computeWordBoundaries(text: string): number[] {
    const boundaries: number[] = [];
    const regex = /\b|\s+|(?<=[a-z])(?=[A-Z])|[.,;:!?(){}[\]]/g;
    let match;
    let lastEnd = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastEnd) { boundaries.push(match.index); lastEnd = match.index; }
    }
    if (text.length > lastEnd) boundaries.push(text.length);
    // Ensure at least some boundaries exist
    if (boundaries.length === 0 && text.length > 0) boundaries.push(text.length);
    return boundaries;
  }

  private computeLineBoundaries(text: string): number[] {
    const boundaries: number[] = [];
    let idx = 0;
    while (true) {
      idx = text.indexOf('\n', idx);
      if (idx === -1) break;
      boundaries.push(idx + 1);
      idx++;
    }
    if (text.length > 0 && (boundaries.length === 0 || boundaries[boundaries.length - 1] < text.length)) {
      boundaries.push(text.length);
    }
    return boundaries;
  }

  dispose(): void {
    this.reset();
    this.remainingDecorationType.dispose();
    this.highlightDecorationType.dispose();
  }
}
