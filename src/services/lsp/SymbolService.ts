import * as vscode from 'vscode';
import { SymbolInfo, LSP_CONSTANTS } from './LSPTypes';

export class SymbolService {
  private static instance: SymbolService;
  private symbolCache: Map<string, { symbols: SymbolInfo[]; timestamp: number }> = new Map();

  static getInstance(): SymbolService {
    if (!SymbolService.instance) {
      SymbolService.instance = new SymbolService();
    }
    return SymbolService.instance;
  }

  async getDocumentSymbols(uri: vscode.Uri): Promise<SymbolInfo[]> {
    const key = uri.toString();
    const cached = this.symbolCache.get(key);
    if (cached && Date.now() - cached.timestamp < LSP_CONSTANTS.CACHE_TTL_MS) return cached.symbols;

    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri);
      if (!symbols) return [];

      const filePath = vscode.workspace.asRelativePath(uri);
      const result = symbols.map(s => this.convertDocumentSymbol(s, filePath)).slice(0, LSP_CONSTANTS.MAX_SYMBOLS_PER_FILE);
      this.symbolCache.set(key, { symbols: result, timestamp: Date.now() });
      return result;
    } catch {
      return [];
    }
  }

  async getWorkspaceSymbols(query: string): Promise<SymbolInfo[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', query);
      if (!symbols) return [];
      return symbols.slice(0, 50).map(s => this.convertSymbolInformation(s));
    } catch {
      return [];
    }
  }

  async getSymbolAtPosition(document: vscode.TextDocument, position: vscode.Position): Promise<SymbolInfo | null> {
    const symbols = await this.getDocumentSymbols(document.uri);
    return this.findInnermostSymbol(symbols, position.line, position.character);
  }

  async getSymbolByName(name: string, document?: vscode.TextDocument): Promise<SymbolInfo | null> {
    if (document) {
      const symbols = await this.getDocumentSymbols(document.uri);
      const found = this.findSymbolByName(symbols, name);
      if (found) return found;
    }
    const wsSymbols = await this.getWorkspaceSymbols(name);
    return wsSymbols.find(s => s.name === name) || wsSymbols[0] || null;
  }

  async getSymbolHierarchy(document: vscode.TextDocument, position: vscode.Position): Promise<SymbolInfo[]> {
    const symbols = await this.getDocumentSymbols(document.uri);
    const chain: SymbolInfo[] = [];
    this.buildHierarchyChain(symbols, position.line, position.character, chain);
    return chain;
  }

  async getExportedSymbols(uri: vscode.Uri): Promise<SymbolInfo[]> {
    const symbols = await this.getDocumentSymbols(uri);
    return symbols.filter(s => {
      const topLevel = s.range.startCol < 4;
      const exportable = [vscode.SymbolKind.Function, vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum, vscode.SymbolKind.Variable, vscode.SymbolKind.Constant].includes(s.kind);
      return topLevel && exportable;
    });
  }

  formatSymbolForPrompt(symbol: SymbolInfo, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    let line = `${prefix}${symbol.kindLabel} ${symbol.name}`;
    if (symbol.detail) line += `: ${symbol.detail}`;
    if (symbol.children) {
      for (const child of symbol.children) {
        line += '\n' + this.formatSymbolForPrompt(child, indent + 1);
      }
    }
    return line;
  }

  formatSymbolsForPrompt(symbols: SymbolInfo[], maxTokens: number = 500): string {
    const lines: string[] = [];
    let tokens = 0;
    for (const s of symbols) {
      const line = this.formatSymbolForPrompt(s);
      const lineTokens = Math.ceil(line.split(/\s+/).length * 1.3);
      if (tokens + lineTokens > maxTokens) break;
      lines.push(line);
      tokens += lineTokens;
    }
    return lines.join('\n');
  }

  private convertDocumentSymbol(symbol: vscode.DocumentSymbol, filePath: string): SymbolInfo {
    return {
      name: symbol.name,
      kind: symbol.kind,
      kindLabel: this.symbolKindToLabel(symbol.kind),
      detail: symbol.detail || null,
      filePath,
      range: { startLine: symbol.range.start.line, startCol: symbol.range.start.character, endLine: symbol.range.end.line, endCol: symbol.range.end.character },
      selectionRange: { startLine: symbol.selectionRange.start.line, startCol: symbol.selectionRange.start.character, endLine: symbol.selectionRange.end.line, endCol: symbol.selectionRange.end.character },
      containerName: null,
      children: symbol.children?.length ? symbol.children.map(c => this.convertDocumentSymbol(c, filePath)) : null,
    };
  }

  private convertSymbolInformation(symbol: vscode.SymbolInformation): SymbolInfo {
    const filePath = vscode.workspace.asRelativePath(symbol.location.uri);
    return {
      name: symbol.name,
      kind: symbol.kind,
      kindLabel: this.symbolKindToLabel(symbol.kind),
      detail: null,
      filePath,
      range: { startLine: symbol.location.range.start.line, startCol: symbol.location.range.start.character, endLine: symbol.location.range.end.line, endCol: symbol.location.range.end.character },
      selectionRange: { startLine: symbol.location.range.start.line, startCol: symbol.location.range.start.character, endLine: symbol.location.range.end.line, endCol: symbol.location.range.end.character },
      containerName: symbol.containerName || null,
      children: null,
    };
  }

  private symbolKindToLabel(kind: vscode.SymbolKind): string {
    const map: Record<number, string> = {
      [vscode.SymbolKind.File]: 'file', [vscode.SymbolKind.Module]: 'module', [vscode.SymbolKind.Namespace]: 'namespace',
      [vscode.SymbolKind.Package]: 'package', [vscode.SymbolKind.Class]: 'class', [vscode.SymbolKind.Method]: 'method',
      [vscode.SymbolKind.Property]: 'property', [vscode.SymbolKind.Field]: 'field', [vscode.SymbolKind.Constructor]: 'constructor',
      [vscode.SymbolKind.Enum]: 'enum', [vscode.SymbolKind.Interface]: 'interface', [vscode.SymbolKind.Function]: 'function',
      [vscode.SymbolKind.Variable]: 'variable', [vscode.SymbolKind.Constant]: 'const', [vscode.SymbolKind.String]: 'string',
      [vscode.SymbolKind.Number]: 'number', [vscode.SymbolKind.Boolean]: 'boolean', [vscode.SymbolKind.Array]: 'array',
      [vscode.SymbolKind.Object]: 'object', [vscode.SymbolKind.Key]: 'key', [vscode.SymbolKind.Null]: 'null',
      [vscode.SymbolKind.EnumMember]: 'enum-member', [vscode.SymbolKind.Struct]: 'struct', [vscode.SymbolKind.Event]: 'event',
      [vscode.SymbolKind.Operator]: 'operator', [vscode.SymbolKind.TypeParameter]: 'type-param',
    };
    return map[kind] || 'symbol';
  }

  private findInnermostSymbol(symbols: SymbolInfo[], line: number, col: number): SymbolInfo | null {
    for (const sym of symbols) {
      if (line >= sym.range.startLine && line <= sym.range.endLine) {
        if (sym.children) {
          const inner = this.findInnermostSymbol(sym.children, line, col);
          if (inner) return inner;
        }
        return sym;
      }
    }
    return null;
  }

  private findSymbolByName(symbols: SymbolInfo[], name: string): SymbolInfo | null {
    for (const sym of symbols) {
      if (sym.name === name) return sym;
      if (sym.children) {
        const found = this.findSymbolByName(sym.children, name);
        if (found) return found;
      }
    }
    return null;
  }

  private buildHierarchyChain(symbols: SymbolInfo[], line: number, col: number, chain: SymbolInfo[]): boolean {
    for (const sym of symbols) {
      if (line >= sym.range.startLine && line <= sym.range.endLine) {
        chain.push(sym);
        if (sym.children) this.buildHierarchyChain(sym.children, line, col, chain);
        return true;
      }
    }
    return false;
  }

  invalidateCache(filePath: string): void {
    for (const [key] of this.symbolCache) {
      if (key.includes(filePath)) this.symbolCache.delete(key);
    }
  }
}
