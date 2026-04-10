/**
 * Diff Decoration Manager
 *
 * Manages visual decorations for inline diff preview.
 */

import * as vscode from 'vscode';
import { DiffLineType, DiffResult, DiffPreviewState, DiffHunk } from './DiffTypes';

// ============ Diff Decoration Manager ============

export class DiffDecorationManager implements vscode.Disposable {
  private static instance: DiffDecorationManager;

  private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();
  private activeDecorations: Map<string, vscode.DecorationOptions[]> = new Map();
  private charDiffDecorations: Map<string, vscode.TextEditorDecorationType> = new Map();
  private hunkHighlight: vscode.TextEditorDecorationType | null = null;

  private constructor() {
    this.createDecorationTypes();
  }

  static getInstance(): DiffDecorationManager {
    if (!DiffDecorationManager.instance) {
      DiffDecorationManager.instance = new DiffDecorationManager();
    }
    return DiffDecorationManager.instance;
  }

  // ============ Decoration Types ============

  private createDecorationTypes(): void {
    this.decorationTypes.set('added', vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(46, 160, 67, 0.15)',
      isWholeLine: true,
      overviewRulerColor: '#2ea043',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    }));

    this.decorationTypes.set('removed', vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(248, 81, 73, 0.15)',
      isWholeLine: true,
      overviewRulerColor: '#f85149',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      textDecoration: 'line-through',
    }));

    this.decorationTypes.set('modified', vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(210, 153, 34, 0.15)',
      isWholeLine: true,
      overviewRulerColor: '#d29922',
    }));

    this.decorationTypes.set('addedGutter', vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterIcon('+', '#2ea043'),
      gutterIconSize: 'contain',
    }));

    this.decorationTypes.set('removedGutter', vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createGutterIcon('-', '#f85149'),
      gutterIconSize: 'contain',
    }));
  }

  // ============ Show Diff ============

  showInlineDiff(editor: vscode.TextEditor, diffResult: DiffResult, originalRange: vscode.Range): void {
    this.clearAllDecorations(editor);

    const addedRanges: vscode.DecorationOptions[] = [];
    const removedRanges: vscode.DecorationOptions[] = [];
    const modifiedRanges: vscode.DecorationOptions[] = [];
    const addedGutterRanges: vscode.DecorationOptions[] = [];
    const removedGutterRanges: vscode.DecorationOptions[] = [];

    const baseLineNumber = originalRange.start.line;

    for (const hunk of diffResult.hunks) {
      for (const line of hunk.lines) {
        const editorLine = baseLineNumber + line.lineNumber;
        if (editorLine < 0 || editorLine >= editor.document.lineCount) continue;

        const range = new vscode.Range(editorLine, 0, editorLine, editor.document.lineAt(editorLine).text.length);

        switch (line.type) {
          case DiffLineType.ADDED:
            addedRanges.push({ range, hoverMessage: `Added: ${line.content}` });
            addedGutterRanges.push({ range });
            break;
          case DiffLineType.REMOVED:
            removedRanges.push({ range, hoverMessage: `Removed: ${line.content}` });
            removedGutterRanges.push({ range });
            break;
          case DiffLineType.MODIFIED:
            modifiedRanges.push({ range, hoverMessage: `Modified: ${line.originalContent || ''} → ${line.content}` });
            addedGutterRanges.push({ range });
            break;
        }
      }
    }

    const addedType = this.decorationTypes.get('added');
    const removedType = this.decorationTypes.get('removed');
    const modifiedType = this.decorationTypes.get('modified');
    const addedGutterType = this.decorationTypes.get('addedGutter');
    const removedGutterType = this.decorationTypes.get('removedGutter');

    if (addedType) editor.setDecorations(addedType, addedRanges);
    if (removedType) editor.setDecorations(removedType, removedRanges);
    if (modifiedType) editor.setDecorations(modifiedType, modifiedRanges);
    if (addedGutterType) editor.setDecorations(addedGutterType, addedGutterRanges);
    if (removedGutterType) editor.setDecorations(removedGutterType, removedGutterRanges);
  }

  // ============ Character Diff ============

  showCharacterDiff(editor: vscode.TextEditor, line: number, originalLine: string, modifiedLine: string): void {
    // Find differing character ranges
    let start = 0;
    while (start < originalLine.length && start < modifiedLine.length && originalLine[start] === modifiedLine[start]) {
      start++;
    }

    let endOrig = originalLine.length - 1;
    let endMod = modifiedLine.length - 1;
    while (endOrig > start && endMod > start && originalLine[endOrig] === modifiedLine[endMod]) {
      endOrig--;
      endMod--;
    }

    if (start <= endMod) {
      // Dispose previous decoration for this line to prevent leaks
      const key = `charDiff-${line}`;
      const existing = this.charDiffDecorations.get(key);
      if (existing) {
        existing.dispose();
      }

      const charHighlight = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(210, 153, 34, 0.3)',
        borderRadius: '2px',
      });

      const range = new vscode.Range(line, start, line, endMod + 1);
      editor.setDecorations(charHighlight, [{ range }]);

      // Track for disposal
      this.charDiffDecorations.set(key, charHighlight);
      this.activeDecorations.set(key, [{ range }]);
    }
  }

  // ============ Hunk Highlighting ============

  highlightHunk(editor: vscode.TextEditor, hunkId: string, hunk: DiffHunk): void {
    this.unhighlightHunk(editor);

    this.hunkHighlight = vscode.window.createTextEditorDecorationType({
      border: '2px solid',
      borderColor: new vscode.ThemeColor('focusBorder'),
      isWholeLine: true,
    });

    const ranges = hunk.lines.map(line => {
      const editorLine = line.lineNumber;
      return { range: new vscode.Range(editorLine, 0, editorLine, 0) };
    });

    editor.setDecorations(this.hunkHighlight, ranges);
  }

  unhighlightHunk(editor: vscode.TextEditor): void {
    if (this.hunkHighlight) {
      editor.setDecorations(this.hunkHighlight, []);
      this.hunkHighlight.dispose();
      this.hunkHighlight = null;
    }
  }

  showAcceptedHunk(editor: vscode.TextEditor, hunk: DiffHunk): void {
    const flashType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(46, 160, 67, 0.3)',
      isWholeLine: true,
    });

    const ranges = hunk.lines
      .filter(l => l.type === DiffLineType.ADDED || l.type === DiffLineType.MODIFIED)
      .map(line => ({ range: new vscode.Range(line.lineNumber, 0, line.lineNumber, 0) }));

    editor.setDecorations(flashType, ranges);

    setTimeout(() => {
      editor.setDecorations(flashType, []);
      flashType.dispose();
    }, 300);
  }

  showRejectedHunk(editor: vscode.TextEditor, hunk: DiffHunk): void {
    const flashType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(248, 81, 73, 0.3)',
      isWholeLine: true,
    });

    const ranges = hunk.lines
      .filter(l => l.type !== DiffLineType.UNCHANGED)
      .map(line => ({ range: new vscode.Range(line.lineNumber, 0, line.lineNumber, 0) }));

    editor.setDecorations(flashType, ranges);

    setTimeout(() => {
      editor.setDecorations(flashType, []);
      flashType.dispose();
    }, 300);
  }

  // ============ Clear ============

  clearAllDecorations(editor: vscode.TextEditor): void {
    for (const [, decType] of this.decorationTypes) {
      editor.setDecorations(decType, []);
    }
    this.unhighlightHunk(editor);

    // Dispose and clear character diff decorations
    for (const decType of this.charDiffDecorations.values()) {
      decType.dispose();
    }
    this.charDiffDecorations.clear();
    this.activeDecorations.clear();
  }

  updateDecorations(editor: vscode.TextEditor, state: DiffPreviewState): void {
    this.showInlineDiff(
      editor,
      state.diffResult,
      new vscode.Range(0, 0, editor.document.lineCount - 1, 0)
    );
  }

  // ============ Gutter Icons ============

  private createGutterIcon(symbol: string, color: string): vscode.Uri {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" fill="${color}" opacity="0.3"/>
      <text x="8" y="12" text-anchor="middle" fill="${color}" font-size="12" font-weight="bold">${symbol}</text>
    </svg>`;

    return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  }

  // ============ Dispose ============

  dispose(): void {
    for (const [, decType] of this.decorationTypes) {
      decType.dispose();
    }
    this.decorationTypes.clear();

    // Safely dispose hunk highlight without requiring an editor reference
    if (this.hunkHighlight) {
      this.hunkHighlight.dispose();
      this.hunkHighlight = null;
    }

    // Dispose tracked character diff decorations
    for (const decType of this.charDiffDecorations.values()) {
      decType.dispose();
    }
    this.charDiffDecorations.clear();

    this.activeDecorations.clear();
  }
}
