/**
 * Multi-Cursor Detector
 *
 * Detects and analyzes multiple cursor positions in the editor.
 */

import * as vscode from 'vscode';
import { CursorPosition, CursorContext, CursorPattern } from './MultiCursorTypes';

// ============ Multi-Cursor Detector ============

export class MultiCursorDetector {
  private static instance: MultiCursorDetector;

  private constructor() {}

  static getInstance(): MultiCursorDetector {
    if (!MultiCursorDetector.instance) {
      MultiCursorDetector.instance = new MultiCursorDetector();
    }
    return MultiCursorDetector.instance;
  }

  // ============ Detection ============

  detectCursors(editor: vscode.TextEditor): CursorPosition[] {
    const document = editor.document;
    const selections = editor.selections;

    const cursors: CursorPosition[] = [];

    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      const content = this.getSelectionContent(document, selection);
      const context = this.extractCursorContext(document, selection, 5);

      const hash = this.hashString(content + selection.start.line).substring(0, 4);

      cursors.push({
        id: `mc-${i}-${hash}`,
        index: i,
        selection,
        range: new vscode.Range(selection.start, selection.end),
        content,
        lineNumber: selection.start.line,
        column: selection.start.character,
        context,
      });
    }

    return this.sortCursorsByPosition(cursors);
  }

  hasMultipleCursors(editor: vscode.TextEditor): boolean {
    return editor.selections.length > 1;
  }

  // ============ Content Extraction ============

  getSelectionContent(document: vscode.TextDocument, selection: vscode.Selection): string {
    if (selection.isEmpty) {
      // Expand to word under cursor
      const wordRange = document.getWordRangeAtPosition(selection.active);
      if (wordRange) {
        return document.getText(wordRange);
      }
      // Fall back to line
      return document.lineAt(selection.active.line).text.trim();
    }
    return document.getText(selection);
  }

  // ============ Context Extraction ============

  extractCursorContext(document: vscode.TextDocument, selection: vscode.Selection, contextLines: number = 5): CursorContext {
    const line = selection.start.line;
    const lineText = document.lineAt(line).text;

    const beforeText = lineText.substring(0, selection.start.character);
    const afterText = lineText.substring(selection.end.character);

    const indentMatch = lineText.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : '';

    // Surrounding lines
    const startLine = Math.max(0, line - contextLines);
    const endLine = Math.min(document.lineCount - 1, line + contextLines);
    const surroundingLines: string[] = [];

    for (let i = startLine; i <= endLine; i++) {
      if (i !== line) {
        surroundingLines.push(document.lineAt(i).text);
      }
    }

    return {
      beforeText,
      afterText,
      lineContent: lineText,
      indentation,
      surroundingLines,
      containingSymbol: null, // Set asynchronously if needed
      language: document.languageId,
    };
  }

  // ============ Grouping ============

  groupSimilarCursors(cursors: CursorPosition[]): Map<string, CursorPosition[]> {
    const groups = new Map<string, CursorPosition[]>();

    for (const cursor of cursors) {
      const key = this.hashString(cursor.content);
      const group = groups.get(key) || [];
      group.push(cursor);
      groups.set(key, group);
    }

    return groups;
  }

  // ============ Pattern Analysis ============

  analyzeCursorPattern(cursors: CursorPosition[]): CursorPattern {
    if (cursors.length < 2) {
      return { type: 'mixed', similarity: 1, commonPrefix: '', commonSuffix: '' };
    }

    const contents = cursors.map(c => c.content);

    // Check if all same
    const allSame = contents.every(c => c === contents[0]);
    if (allSame) {
      return {
        type: 'same_content',
        similarity: 1,
        commonPrefix: contents[0],
        commonSuffix: contents[0],
      };
    }

    // Find common prefix/suffix
    const commonPrefix = this.findCommonPrefix(contents);
    const commonSuffix = this.findCommonSuffix(contents);

    // Check line pattern similarity
    const linePatterns = cursors.map(c => c.context.lineContent.replace(c.content, '___'));
    const samePattern = linePatterns.every(p => p === linePatterns[0]);

    // Calculate similarity
    let totalSimilarity = 0;
    for (let i = 1; i < contents.length; i++) {
      totalSimilarity += this.stringSimilarity(contents[0], contents[i]);
    }
    const avgSimilarity = totalSimilarity / (contents.length - 1);

    if (samePattern) {
      return {
        type: 'same_line_pattern',
        similarity: avgSimilarity,
        commonPrefix,
        commonSuffix,
      };
    }

    return {
      type: 'mixed',
      similarity: avgSimilarity,
      commonPrefix,
      commonSuffix,
    };
  }

  // ============ Validation ============

  validateCursors(cursors: CursorPosition[]): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (cursors.length < 2) {
      errors.push('Multi-cursor edit requires at least 2 cursors');
    }

    if (cursors.length > 50) {
      errors.push('Too many cursors (maximum 50)');
    } else if (cursors.length > 20) {
      warnings.push(`${cursors.length} cursors detected - generation may be slow`);
    }

    // Check for overlapping selections
    for (let i = 0; i < cursors.length; i++) {
      for (let j = i + 1; j < cursors.length; j++) {
        if (cursors[i].range.intersection(cursors[j].range)) {
          errors.push(`Cursors #${i + 1} and #${j + 1} have overlapping selections`);
        }
      }
    }

    // Check selection sizes
    for (const cursor of cursors) {
      if (cursor.content.length > 5000) {
        warnings.push(`Cursor #${cursor.index + 1} has a large selection (${cursor.content.length} chars)`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ============ Sorting ============

  sortCursorsByPosition(cursors: CursorPosition[]): CursorPosition[] {
    return [...cursors].sort((a, b) => {
      if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
      return a.column - b.column;
    });
  }

  sortCursorsBottomToTop(cursors: CursorPosition[]): CursorPosition[] {
    return [...cursors].sort((a, b) => {
      if (a.lineNumber !== b.lineNumber) return b.lineNumber - a.lineNumber;
      return b.column - a.column;
    });
  }

  // ============ Helpers ============

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  private findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (!strings[i].startsWith(prefix)) {
        prefix = prefix.slice(0, -1);
        if (prefix === '') return '';
      }
    }
    return prefix;
  }

  private findCommonSuffix(strings: string[]): string {
    if (strings.length === 0) return '';
    let suffix = strings[0];
    for (let i = 1; i < strings.length; i++) {
      while (!strings[i].endsWith(suffix)) {
        suffix = suffix.slice(1);
        if (suffix === '') return '';
      }
    }
    return suffix;
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const maxLen = Math.max(a.length, b.length);
    let matches = 0;
    const minLen = Math.min(a.length, b.length);

    for (let i = 0; i < minLen; i++) {
      if (a[i] === b[i]) matches++;
    }

    return matches / maxLen;
  }
}
