/**
 * Diff Gutter Provider
 *
 * Gutter icons for diff lines with visual state indicators.
 */

import * as vscode from 'vscode';
import { DiffLineType, DiffResult } from '../services/diff/DiffTypes';

// ============ Diff Gutter Provider ============

export class DiffGutterProvider implements vscode.Disposable {
  private gutterDecorations: Map<string, vscode.TextEditorDecorationType> = new Map();

  constructor() {
    this.createGutterTypes();
  }

  // ============ Create Types ============

  private createGutterTypes(): void {
    this.gutterDecorations.set('added', vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterSvg('added', 'pending'),
      gutterIconSize: 'contain',
    }));

    this.gutterDecorations.set('removed', vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterSvg('removed', 'pending'),
      gutterIconSize: 'contain',
    }));

    this.gutterDecorations.set('modified', vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterSvg('modified', 'pending'),
      gutterIconSize: 'contain',
    }));

    this.gutterDecorations.set('accepted', vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterSvg('added', 'accepted'),
      gutterIconSize: 'contain',
    }));

    this.gutterDecorations.set('rejected', vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterSvg('removed', 'rejected'),
      gutterIconSize: 'contain',
    }));
  }

  // ============ Show ============

  showGutterIcons(editor: vscode.TextEditor, diffResult: DiffResult): void {
    this.clearGutterIcons(editor);

    const addedRanges: vscode.DecorationOptions[] = [];
    const removedRanges: vscode.DecorationOptions[] = [];
    const modifiedRanges: vscode.DecorationOptions[] = [];

    for (const hunk of diffResult.hunks) {
      for (const line of hunk.lines) {
        if (line.lineNumber < 0 || line.lineNumber >= editor.document.lineCount) continue;

        const range = new vscode.Range(line.lineNumber, 0, line.lineNumber, 0);

        switch (line.type) {
          case DiffLineType.ADDED:
            addedRanges.push({ range });
            break;
          case DiffLineType.REMOVED:
            removedRanges.push({ range });
            break;
          case DiffLineType.MODIFIED:
            modifiedRanges.push({ range });
            break;
        }
      }
    }

    const added = this.gutterDecorations.get('added');
    const removed = this.gutterDecorations.get('removed');
    const modified = this.gutterDecorations.get('modified');

    if (added) editor.setDecorations(added, addedRanges);
    if (removed) editor.setDecorations(removed, removedRanges);
    if (modified) editor.setDecorations(modified, modifiedRanges);
  }

  // ============ Update ============

  updateGutterIcon(editor: vscode.TextEditor, lineNumber: number, state: 'pending' | 'accepted' | 'rejected'): void {
    const decType = this.gutterDecorations.get(state);
    if (!decType) return;

    const range = new vscode.Range(lineNumber, 0, lineNumber, 0);
    editor.setDecorations(decType, [{ range }]);
  }

  // ============ Clear ============

  clearGutterIcons(editor: vscode.TextEditor): void {
    for (const [, decType] of this.gutterDecorations) {
      editor.setDecorations(decType, []);
    }
  }

  // ============ SVG Creation ============

  private createGutterSvg(type: DiffLineType | string, state: 'pending' | 'accepted' | 'rejected'): vscode.Uri {
    let symbol: string;
    let color: string;

    if (state === 'accepted') {
      symbol = '\u2713';
      color = '#2ea043';
    } else if (state === 'rejected') {
      symbol = '\u2717';
      color = '#f85149';
    } else {
      switch (type) {
        case 'added':
        case DiffLineType.ADDED:
          symbol = '+';
          color = '#2ea043';
          break;
        case 'removed':
        case DiffLineType.REMOVED:
          symbol = '-';
          color = '#f85149';
          break;
        case 'modified':
        case DiffLineType.MODIFIED:
          symbol = '~';
          color = '#d29922';
          break;
        default:
          symbol = ' ';
          color = '#6e7681';
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="${color}" opacity="0.25"/>
      <text x="8" y="12" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold">${symbol}</text>
    </svg>`;

    return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  }

  // ============ Dispose ============

  dispose(): void {
    for (const [, decType] of this.gutterDecorations) {
      decType.dispose();
    }
    this.gutterDecorations.clear();
  }
}
