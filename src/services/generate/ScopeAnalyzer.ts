/**
 * Phase 15.1 — Scope Analyzer
 * Analyzes cursor position to determine code generation context.
 */
import * as vscode from 'vscode';
import { ScopeInfo, GenerateHint, GenerateMode, CLASS_HINTS, FILE_HINTS, FUNCTION_HINTS, TEST_HINTS, REACT_HINTS } from './GenerateTypes';
import { Logger } from '../../utils/Logger';

export class ScopeAnalyzer {
  private static instance: ScopeAnalyzer;
  private constructor() {}
  static getInstance(): ScopeAnalyzer {
    if (!ScopeAnalyzer.instance) ScopeAnalyzer.instance = new ScopeAnalyzer();
    return ScopeAnalyzer.instance;
  }

  async analyzeScope(document: vscode.TextDocument, position: vscode.Position): Promise<ScopeInfo> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri);
      if (symbols?.length) {
        const scope = this.findEnclosingSymbol(symbols, position);
        if (scope) return scope;
      }
    } catch (e) {
      Logger.debug('[ScopeAnalyzer] Symbol provider failed, using bracket analysis');
    }
    return this.analyzeBrackets(document, position);
  }

  private findEnclosingSymbol(symbols: vscode.DocumentSymbol[], position: vscode.Position, parent: ScopeInfo | null = null): ScopeInfo | null {
    for (const sym of symbols) {
      if (sym.range.contains(position)) {
        const scope: ScopeInfo = {
          type: this.symbolKindToScopeType(sym.kind),
          name: sym.name,
          startLine: sym.range.start.line,
          endLine: sym.range.end.line,
          parentScope: parent,
          existingMembers: sym.children?.map(c => c.name) || [],
        };
        const child = this.findEnclosingSymbol(sym.children || [], position, scope);
        return child || scope;
      }
    }
    return null;
  }

  private symbolKindToScopeType(kind: vscode.SymbolKind): ScopeInfo['type'] {
    switch (kind) {
      case vscode.SymbolKind.Class: case vscode.SymbolKind.Struct: return 'class';
      case vscode.SymbolKind.Function: return 'function';
      case vscode.SymbolKind.Method: case vscode.SymbolKind.Constructor: return 'method';
      case vscode.SymbolKind.Object: case vscode.SymbolKind.Namespace: case vscode.SymbolKind.Module: return 'object';
      case vscode.SymbolKind.Array: return 'array';
      default: return 'block';
    }
  }

  private analyzeBrackets(document: vscode.TextDocument, position: vscode.Position): ScopeInfo {
    let depth = 0;
    let scopeStart = 0;
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text;
      for (let j = (i === position.line ? position.character : line.length) - 1; j >= 0; j--) {
        if (line[j] === '}') depth++;
        if (line[j] === '{') { if (depth === 0) { scopeStart = i; break; } depth--; }
      }
      if (depth < 0) break;
    }
    const scopeLine = document.lineAt(scopeStart).text.trim();
    const type: ScopeInfo['type'] = /\bclass\b/.test(scopeLine) ? 'class' : /\bfunction\b|\=>/.test(scopeLine) ? 'function' : 'block';
    const nameMatch = scopeLine.match(/(?:class|function|const|let|var)\s+(\w+)/);
    return { type, name: nameMatch?.[1] || null, startLine: scopeStart, endLine: position.line + 50, parentScope: null, existingMembers: [] };
  }

  getContextHints(scope: ScopeInfo, language: string): GenerateHint[] {
    const hints: GenerateHint[] = [];
    const isTest = language.includes('test') || language.includes('spec');
    const isReact = language === 'typescriptreact' || language === 'javascriptreact';
    if (isTest) { hints.push(...TEST_HINTS); return hints; }
    if (scope.type === 'class') hints.push(...CLASS_HINTS);
    else if (scope.type === 'function' || scope.type === 'method') hints.push(...FUNCTION_HINTS);
    else hints.push(...FILE_HINTS);
    if (isReact) hints.push(...REACT_HINTS);
    return hints;
  }

  async getNearbySymbols(document: vscode.TextDocument, position: vscode.Position, range: number = 30): Promise<{ name: string; kind: string; detail: string }[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', document.uri);
      if (!symbols) return [];
      const nearby: { name: string; kind: string; detail: string }[] = [];
      const flatten = (syms: vscode.DocumentSymbol[]) => {
        for (const s of syms) {
          if (Math.abs(s.range.start.line - position.line) <= range) {
            nearby.push({ name: s.name, kind: vscode.SymbolKind[s.kind], detail: s.detail });
          }
          if (s.children) flatten(s.children);
        }
      };
      flatten(symbols);
      return nearby;
    } catch { return []; }
  }

  async detectGenerateMode(document: vscode.TextDocument, position: vscode.Position): Promise<GenerateMode> {
    const scope = await this.analyzeScope(document, position);
    if (scope.type === 'class') return GenerateMode.ADD_METHOD;
    if (scope.type === 'function' || scope.type === 'method') return GenerateMode.COMPLETE_FUNCTION;
    return GenerateMode.GENERATE;
  }

  getExistingImports(document: vscode.TextDocument): string[] {
    const imports: string[] = [];
    for (let i = 0; i < Math.min(document.lineCount, 50); i++) {
      const line = document.lineAt(i).text;
      if (/^\s*(import |const \w+ = require|from )/.test(line) || /^import /.test(line)) {
        imports.push(line.trim());
      }
      if (i > 5 && !/^\s*(import|\/\/|\/\*|\*|from|export|'use )/.test(line) && line.trim().length > 0) break;
    }
    return imports;
  }
}
