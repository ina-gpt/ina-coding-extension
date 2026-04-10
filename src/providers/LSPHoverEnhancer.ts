import * as vscode from 'vscode';
import { LSPContextBuilder } from '../services/lsp/LSPContextBuilder';
import { TypeInfoService } from '../services/lsp/TypeInfoService';
import { SymbolService } from '../services/lsp/SymbolService';
import { Logger } from '../utils/Logger';

export class LSPHoverEnhancer {
  private contextBuilder: LSPContextBuilder;

  constructor() {
    this.contextBuilder = LSPContextBuilder.getInstance();
  }

  async explainSymbolAtCursor(): Promise<{ symbol: string; type: string; context: string } | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const position = editor.selection.active;
    const wordRange = editor.document.getWordRangeAtPosition(position);
    if (!wordRange) return null;

    const symbolName = editor.document.getText(wordRange);

    try {
      const [symbol, type, context] = await Promise.all([
        SymbolService.getInstance().getSymbolAtPosition(editor.document, position),
        TypeInfoService.getInstance().getTypeAtPosition(editor.document, position),
        this.contextBuilder.buildContextForChat(editor.document, position),
      ]);

      const typeStr = type ? TypeInfoService.getInstance().formatTypeForPrompt(type) : 'unknown type';
      const contextStr = this.contextBuilder.formatCompactSummary(context);

      return {
        symbol: symbolName,
        type: typeStr,
        context: contextStr,
      };
    } catch (e) {
      Logger.warn('Explain symbol failed:', e);
      return { symbol: symbolName, type: 'unknown', context: '' };
    }
  }

  async explainErrorAtCursor(): Promise<{ error: string; code: string; context: string } | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;

    const position = editor.selection.active;
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const errorAtCursor = diagnostics.find(d =>
      d.severity === vscode.DiagnosticSeverity.Error &&
      d.range.contains(position)
    );

    if (!errorAtCursor) {
      const nearestError = diagnostics
        .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
        .sort((a, b) => Math.abs(a.range.start.line - position.line) - Math.abs(b.range.start.line - position.line))[0];
      if (!nearestError) return null;

      return {
        error: nearestError.message,
        code: nearestError.code ? String(typeof nearestError.code === 'object' ? nearestError.code.value : nearestError.code) : '',
        context: `Line ${nearestError.range.start.line + 1} in ${vscode.workspace.asRelativePath(editor.document.uri)}`,
      };
    }

    return {
      error: errorAtCursor.message,
      code: errorAtCursor.code ? String(typeof errorAtCursor.code === 'object' ? errorAtCursor.code.value : errorAtCursor.code) : '',
      context: `Line ${errorAtCursor.range.start.line + 1} in ${vscode.workspace.asRelativePath(editor.document.uri)}`,
    };
  }
}
