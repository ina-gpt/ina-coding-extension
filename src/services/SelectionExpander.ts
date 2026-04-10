/**
 * Selection Expander
 *
 * Smart selection expansion for better edit context.
 */

import * as vscode from 'vscode';

// ============ Types ============

export interface ExpansionResult {
  selection: vscode.Selection;
  type: 'line' | 'block' | 'function' | 'class' | 'statement';
  confidence: number;
}

// ============ Selection Expander ============

export class SelectionExpander {

  // ============ Line Expansion ============

  expandToLine(document: vscode.TextDocument, position: vscode.Position): vscode.Selection {
    const line = document.lineAt(position.line);
    const firstNonWs = line.firstNonWhitespaceCharacterIndex;
    return new vscode.Selection(
      new vscode.Position(position.line, firstNonWs),
      new vscode.Position(position.line, line.text.length)
    );
  }

  // ============ Block Expansion ============

  expandToBlock(document: vscode.TextDocument, selection: vscode.Selection): vscode.Selection {
    const language = document.languageId;
    const useIndent = ['python', 'yaml', 'coffeescript', 'haml', 'slim', 'pug'].includes(language);

    if (useIndent) {
      return this.expandByIndentation(document, selection);
    }
    return this.expandByBraces(document, selection);
  }

  private expandByBraces(document: vscode.TextDocument, selection: vscode.Selection): vscode.Selection {
    const { start, end } = this.detectBlockBoundaries(document, selection.start.line);

    return new vscode.Selection(
      new vscode.Position(start, 0),
      new vscode.Position(end, document.lineAt(end).text.length)
    );
  }

  private expandByIndentation(document: vscode.TextDocument, selection: vscode.Selection): vscode.Selection {
    const startLine = selection.start.line;
    const baseIndent = document.lineAt(startLine).firstNonWhitespaceCharacterIndex;

    // Find header line (the line that starts this indented block)
    let blockStart = startLine;
    for (let i = startLine - 1; i >= 0; i--) {
      const line = document.lineAt(i);
      if (line.isEmptyOrWhitespace) continue;
      if (line.firstNonWhitespaceCharacterIndex < baseIndent) {
        blockStart = i;
        break;
      }
      blockStart = i;
    }

    // Find end of indented block
    let blockEnd = selection.end.line;
    for (let i = selection.end.line + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.isEmptyOrWhitespace) continue;
      if (line.firstNonWhitespaceCharacterIndex <= document.lineAt(blockStart).firstNonWhitespaceCharacterIndex) break;
      blockEnd = i;
    }

    return new vscode.Selection(
      new vscode.Position(blockStart, 0),
      new vscode.Position(blockEnd, document.lineAt(blockEnd).text.length)
    );
  }

  // ============ Function/Class Expansion ============

  async expandToFunction(document: vscode.TextDocument, selection: vscode.Selection): Promise<vscode.Selection> {
    const symbol = await this.findContainingSymbol(document, selection.active, [
      vscode.SymbolKind.Function,
      vscode.SymbolKind.Method,
    ]);

    if (symbol) {
      return new vscode.Selection(symbol.range.start, symbol.range.end);
    }

    // Fallback to block expansion
    return this.expandToBlock(document, selection);
  }

  async expandToClass(document: vscode.TextDocument, selection: vscode.Selection): Promise<vscode.Selection> {
    const symbol = await this.findContainingSymbol(document, selection.active, [
      vscode.SymbolKind.Class,
      vscode.SymbolKind.Interface,
      vscode.SymbolKind.Struct,
    ]);

    if (symbol) {
      return new vscode.Selection(symbol.range.start, symbol.range.end);
    }

    return this.expandToBlock(document, selection);
  }

  // ============ Statement Expansion ============

  expandToStatement(document: vscode.TextDocument, selection: vscode.Selection): vscode.Selection {
    const startLine = selection.start.line;
    let endLine = selection.end.line;

    // Scan forward to find statement end (semicolon, closing brace, or blank line)
    for (let i = endLine; i < document.lineCount; i++) {
      const text = document.lineAt(i).text.trimEnd();
      if (text.endsWith(';') || text.endsWith('}') || text.endsWith(')') || text === '') {
        endLine = i;
        break;
      }
      endLine = i;
    }

    // Scan backward to find statement start
    let stmtStart = startLine;
    for (let i = startLine - 1; i >= 0; i--) {
      const text = document.lineAt(i).text.trimEnd();
      if (text.endsWith(';') || text.endsWith('{') || text.endsWith(':') || text === '') {
        stmtStart = i + 1;
        break;
      }
      stmtStart = i;
    }

    return new vscode.Selection(
      new vscode.Position(stmtStart, 0),
      new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
  }

  // ============ Shrink ============

  shrinkToMeaningful(document: vscode.TextDocument, selection: vscode.Selection): vscode.Selection {
    let startLine = selection.start.line;
    let endLine = selection.end.line;

    // Skip leading empty lines
    while (startLine < endLine && document.lineAt(startLine).isEmptyOrWhitespace) {
      startLine++;
    }

    // Skip trailing empty lines
    while (endLine > startLine && document.lineAt(endLine).isEmptyOrWhitespace) {
      endLine--;
    }

    return new vscode.Selection(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
  }

  // ============ Block Boundary Detection ============

  detectBlockBoundaries(document: vscode.TextDocument, line: number): { start: number; end: number } {
    // Scan up for block start
    let braceCount = 0;
    let blockStart = line;

    for (let i = line; i >= 0; i--) {
      const text = document.lineAt(i).text;
      for (let j = text.length - 1; j >= 0; j--) {
        if (text[j] === '}') braceCount++;
        else if (text[j] === '{') {
          braceCount--;
          if (braceCount < 0) {
            blockStart = i;
            braceCount = 0;
            // Done scanning up
            i = -1; // break outer
            break;
          }
        }
      }
    }

    // Scan down for block end
    braceCount = 0;
    let blockEnd = line;
    for (let i = blockStart; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      for (const ch of text) {
        if (ch === '{') braceCount++;
        else if (ch === '}') {
          braceCount--;
          if (braceCount === 0 && i > blockStart) {
            return { start: blockStart, end: i };
          }
        }
      }
    }

    return { start: blockStart, end: blockEnd };
  }

  // ============ Bracket Matching ============

  findMatchingBracket(
    document: vscode.TextDocument,
    position: vscode.Position,
    openChar: string,
    closeChar: string
  ): vscode.Position | null {
    const text = document.lineAt(position.line).text;
    const charAtPos = text[position.character];

    if (charAtPos === openChar) {
      // Search forward
      let count = 0;
      for (let line = position.line; line < document.lineCount; line++) {
        const lineText = document.lineAt(line).text;
        const startCol = line === position.line ? position.character : 0;
        for (let col = startCol; col < lineText.length; col++) {
          if (lineText[col] === openChar) count++;
          else if (lineText[col] === closeChar) {
            count--;
            if (count === 0) return new vscode.Position(line, col);
          }
        }
      }
    } else if (charAtPos === closeChar) {
      // Search backward
      let count = 0;
      for (let line = position.line; line >= 0; line--) {
        const lineText = document.lineAt(line).text;
        const startCol = line === position.line ? position.character : lineText.length - 1;
        for (let col = startCol; col >= 0; col--) {
          if (lineText[col] === closeChar) count++;
          else if (lineText[col] === openChar) {
            count--;
            if (count === 0) return new vscode.Position(line, col);
          }
        }
      }
    }

    return null;
  }

  // ============ Helpers ============

  private async findContainingSymbol(
    document: vscode.TextDocument,
    position: vscode.Position,
    kinds: vscode.SymbolKind[]
  ): Promise<vscode.DocumentSymbol | null> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', document.uri
      );
      if (!symbols) return null;
      return this.searchSymbols(symbols, position, kinds);
    } catch {
      return null;
    }
  }

  private searchSymbols(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position,
    kinds: vscode.SymbolKind[]
  ): vscode.DocumentSymbol | null {
    for (const s of symbols) {
      if (s.range.contains(position)) {
        const child = this.searchSymbols(s.children, position, kinds);
        if (child) return child;
        if (kinds.includes(s.kind)) return s;
      }
    }
    return null;
  }
}
