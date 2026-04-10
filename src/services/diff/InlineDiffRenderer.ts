/**
 * Inline Diff Renderer
 *
 * Renders inline diff directly in the editor.
 */

import * as vscode from 'vscode';
import { DiffResult, DiffLine, DiffLineType } from './DiffTypes';
import { DiffDecorationManager } from './DiffDecorationManager';

// ============ Inline Diff Renderer ============

export class InlineDiffRenderer implements vscode.Disposable {
  private originalContent: string = '';
  private modifiedContent: string = '';
  private decorationManager: DiffDecorationManager;
  private lineMapping: Map<number, { original: number | null; modified: number | null }> = new Map();

  constructor() {
    this.decorationManager = DiffDecorationManager.getInstance();
  }

  // ============ Render ============

  async renderInlineDiff(editor: vscode.TextEditor, original: string, modified: string, startLine: number): Promise<void> {
    this.originalContent = original;
    this.modifiedContent = modified;

    // Replace the selection content with the modified content
    const originalLines = original.split('\n');
    const endLine = startLine + originalLines.length - 1;
    const lastLineLength = editor.document.lineAt(Math.min(endLine, editor.document.lineCount - 1)).text.length;

    const range = new vscode.Range(startLine, 0, endLine, lastLineLength);

    await editor.edit(editBuilder => {
      editBuilder.replace(range, modified);
    });
  }

  // ============ Merged Content ============

  createMergedContent(original: string, modified: string): string {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');
    const merged: string[] = [];

    const maxLen = Math.max(origLines.length, modLines.length);

    for (let i = 0; i < maxLen; i++) {
      const origLine = origLines[i];
      const modLine = modLines[i];

      if (origLine === undefined) {
        merged.push(modLine); // added
      } else if (modLine === undefined) {
        merged.push(origLine); // will be shown as removed
      } else if (origLine === modLine) {
        merged.push(origLine);
      } else {
        merged.push(origLine); // removed
        merged.push(modLine); // added
      }
    }

    return merged.join('\n');
  }

  // ============ Line Mapping ============

  getLineMapping(diffResult: DiffResult): Map<number, { original: number | null; modified: number | null }> {
    const mapping = new Map<number, { original: number | null; modified: number | null }>();

    let previewLine = 0;
    for (const hunk of diffResult.hunks) {
      for (const line of hunk.lines) {
        mapping.set(previewLine, {
          original: line.originalLineNumber,
          modified: line.modifiedLineNumber,
        });
        previewLine++;
      }
    }

    this.lineMapping = mapping;
    return mapping;
  }

  // ============ Removed Lines ============

  showRemovedLines(editor: vscode.TextEditor, lines: DiffLine[]): void {
    const removedDecoration = vscode.window.createTextEditorDecorationType({
      opacity: '0.4',
      textDecoration: 'line-through',
      isWholeLine: true,
      backgroundColor: 'rgba(248, 81, 73, 0.1)',
    });

    const ranges = lines
      .filter(l => l.type === DiffLineType.REMOVED)
      .map(l => ({
        range: new vscode.Range(l.lineNumber, 0, l.lineNumber, 0),
      }));

    editor.setDecorations(removedDecoration, ranges);
  }

  // ============ Added Lines ============

  showAddedLines(editor: vscode.TextEditor, lines: DiffLine[]): void {
    const addedDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(46, 160, 67, 0.15)',
    });

    const ranges = lines
      .filter(l => l.type === DiffLineType.ADDED)
      .map(l => ({
        range: new vscode.Range(l.lineNumber, 0, l.lineNumber, 0),
      }));

    editor.setDecorations(addedDecoration, ranges);
  }

  // ============ Navigation ============

  scrollToFirstChange(editor: vscode.TextEditor, diffResult: DiffResult): void {
    if (diffResult.hunks.length === 0) return;

    const firstHunk = diffResult.hunks[0];
    const firstChangeLine = firstHunk.lines.find(l => l.type !== DiffLineType.UNCHANGED);

    if (firstChangeLine) {
      const position = new vscode.Position(firstChangeLine.lineNumber, 0);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    }
  }

  // ============ Transition ============

  async animateTransition(editor: vscode.TextEditor, fromContent: string, toContent: string): Promise<void> {
    const animateEnabled = vscode.workspace.getConfiguration('inaCoding.diff')
      .get<boolean>('animateTransitions', true);

    if (!animateEnabled) return;

    // Flash green briefly on accepted content
    const flashDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(46, 160, 67, 0.2)',
      isWholeLine: true,
    });

    const allLines: vscode.DecorationOptions[] = [];
    for (let i = 0; i < editor.document.lineCount; i++) {
      allLines.push({ range: new vscode.Range(i, 0, i, 0) });
    }

    editor.setDecorations(flashDecoration, allLines);

    await new Promise(resolve => setTimeout(resolve, 200));

    editor.setDecorations(flashDecoration, []);
    flashDecoration.dispose();
  }

  // ============ Dispose ============

  dispose(): void {
    this.lineMapping.clear();
  }
}
