import * as vscode from 'vscode';
import * as path from 'path';
import { languageDetector } from './LanguageDetector';
import { contentFetcher } from './ContentFetcher';
import { tokenCounter } from './TokenCounter';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  signature?: string;
  documentation?: string;
  content?: string;
  range: SymbolRange;
  file: string;
  relativePath: string;
  language: string;
  children?: ExtractedSymbol[];
  metadata?: SymbolMetadata;
}

export type SymbolKind =
  | 'class' | 'interface' | 'function' | 'method' | 'property'
  | 'variable' | 'constant' | 'enum' | 'type' | 'module'
  | 'namespace' | 'constructor' | 'field' | 'unknown';

export interface SymbolRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface SymbolMetadata {
  isExported?: boolean;
  isAsync?: boolean;
  isStatic?: boolean;
  isPrivate?: boolean;
  modifiers?: string[];
  decorators?: string[];
}

export interface ExtractionOptions {
  includeContent?: boolean;
  includeDocumentation?: boolean;
  includeChildren?: boolean;
  maxDepth?: number;
  kinds?: SymbolKind[];
  maxTokensPerSymbol?: number;
  namePattern?: string | RegExp;
}

export interface SymbolSearchResult {
  symbol: ExtractedSymbol;
  score: number;
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy';
}

// ============ Constants ============

const DEFAULT_OPTIONS: ExtractionOptions = {
  includeContent: true,
  includeDocumentation: true,
  includeChildren: true,
  maxDepth: 3,
  maxTokensPerSymbol: 500,
};

const SYMBOL_KIND_MAP: Partial<Record<vscode.SymbolKind, SymbolKind>> = {
  [vscode.SymbolKind.Class]: 'class',
  [vscode.SymbolKind.Method]: 'method',
  [vscode.SymbolKind.Function]: 'function',
  [vscode.SymbolKind.Variable]: 'variable',
  [vscode.SymbolKind.Constant]: 'constant',
  [vscode.SymbolKind.Interface]: 'interface',
  [vscode.SymbolKind.Enum]: 'enum',
  [vscode.SymbolKind.Property]: 'property',
  [vscode.SymbolKind.Field]: 'field',
  [vscode.SymbolKind.Constructor]: 'constructor',
  [vscode.SymbolKind.Module]: 'module',
  [vscode.SymbolKind.Namespace]: 'namespace',
  [vscode.SymbolKind.Struct]: 'class',
  [vscode.SymbolKind.TypeParameter]: 'type',
};

// ============ Symbol Extractor ============

export class SymbolExtractor {
  private symbolCache: Map<string, { symbols: ExtractedSymbol[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000;

  // ============ Document Symbols ============

  async extractFromDocument(document: vscode.TextDocument, options: ExtractionOptions = {}): Promise<ExtractedSymbol[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const cacheKey = `${document.uri.toString()}:${document.version}`;
      const cached = this.symbolCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return this.filterSymbols(cached.symbols, opts);
      }

      const vscodeSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', document.uri
      );
      if (!vscodeSymbols) { return []; }

      const relativePath = vscode.workspace.asRelativePath(document.uri);
      const language = languageDetector.detectFromDocument(document);

      const symbols = await this.convertSymbols(vscodeSymbols, document, relativePath, language.id, opts, 0);
      this.symbolCache.set(cacheKey, { symbols, timestamp: Date.now() });

      return this.filterSymbols(symbols, opts);
    } catch (error) {
      Logger.error('Failed to extract symbols:', error);
      return [];
    }
  }

  async extractFromFile(filePath: string, options: ExtractionOptions = {}): Promise<ExtractedSymbol[]> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      return this.extractFromDocument(document, options);
    } catch (error) {
      Logger.error(`Failed to extract symbols from: ${filePath}`, error);
      return [];
    }
  }

  private async convertSymbols(
    vsSymbols: vscode.DocumentSymbol[], document: vscode.TextDocument,
    relativePath: string, language: string, opts: ExtractionOptions, depth: number
  ): Promise<ExtractedSymbol[]> {
    if (opts.maxDepth !== undefined && depth > opts.maxDepth) { return []; }

    const results: ExtractedSymbol[] = [];

    for (const vs of vsSymbols) {
      const kind = SYMBOL_KIND_MAP[vs.kind] || 'unknown';
      const symbol: ExtractedSymbol = {
        name: vs.name,
        kind,
        range: {
          startLine: vs.range.start.line + 1,
          startColumn: vs.range.start.character + 1,
          endLine: vs.range.end.line + 1,
          endColumn: vs.range.end.character + 1,
        },
        file: document.uri.fsPath,
        relativePath,
        language,
      };

      if (vs.detail) { symbol.signature = vs.detail; }

      if (opts.includeContent) {
        const content = document.getText(vs.range);
        if (opts.maxTokensPerSymbol) {
          const result = tokenCounter.truncateToFit(content, opts.maxTokensPerSymbol, { strategy: 'smart' });
          symbol.content = result.content;
        } else {
          symbol.content = content;
        }
      }

      if (opts.includeDocumentation) {
        symbol.documentation = this.extractDocumentation(document, vs.range.start.line);
      }

      symbol.metadata = this.extractMetadata(document, vs);

      if (opts.includeChildren && vs.children.length > 0) {
        symbol.children = await this.convertSymbols(vs.children, document, relativePath, language, opts, depth + 1);
      }

      results.push(symbol);
    }

    return results;
  }

  private extractDocumentation(document: vscode.TextDocument, symbolLine: number): string | undefined {
    const lines: string[] = [];
    let currentLine = symbolLine - 1;

    while (currentLine >= 0) {
      const text = document.lineAt(currentLine).text.trim();

      if (text.startsWith('/**') || text.startsWith('*') || text.startsWith('///') || text.startsWith('//') || text.startsWith('#')) {
        lines.unshift(text);
        currentLine--;
        if (text.startsWith('/**')) { break; }
      } else if (text === '' && lines.length > 0) {
        currentLine--;
      } else {
        break;
      }
    }

    if (lines.length === 0) { return undefined; }

    return lines
      .map(l => l.replace(/^\/\*\*?\s*/, '').replace(/^\*+\s?/, '').replace(/^\/\/+\s?/, '').replace(/^#+\s?/, '').replace(/\*\/$/, '').trim())
      .filter(l => l.length > 0)
      .join('\n');
  }

  private extractMetadata(document: vscode.TextDocument, vs: vscode.DocumentSymbol): SymbolMetadata {
    const line = document.lineAt(vs.range.start.line).text;
    const metadata: SymbolMetadata = {};

    if (/^export\s/.test(line) || /^pub\s/.test(line)) { metadata.isExported = true; }
    if (/\basync\b/.test(line)) { metadata.isAsync = true; }
    if (/\bstatic\b/.test(line)) { metadata.isStatic = true; }
    if (/\bprivate\b/.test(line) || line.includes('#')) { metadata.isPrivate = true; }

    const modifiers: string[] = [];
    for (const mod of ['public', 'private', 'protected', 'readonly', 'static', 'async', 'abstract', 'override']) {
      if (new RegExp(`\\b${mod}\\b`).test(line)) { modifiers.push(mod); }
    }
    if (modifiers.length > 0) { metadata.modifiers = modifiers; }

    return metadata;
  }

  // ============ Workspace Search ============

  async searchWorkspace(query: string, options: ExtractionOptions & { maxResults?: number } = {}): Promise<SymbolSearchResult[]> {
    const { maxResults = 20, ...extractOpts } = options;

    try {
      const vsSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider', query
      );
      if (!vsSymbols) { return []; }

      const results: SymbolSearchResult[] = [];

      for (const vs of vsSymbols.slice(0, maxResults)) {
        const relativePath = vscode.workspace.asRelativePath(vs.location.uri);
        const kind = SYMBOL_KIND_MAP[vs.kind] || 'unknown';

        const symbol: ExtractedSymbol = {
          name: vs.name,
          kind,
          range: {
            startLine: vs.location.range.start.line + 1,
            startColumn: vs.location.range.start.character + 1,
            endLine: vs.location.range.end.line + 1,
            endColumn: vs.location.range.end.character + 1,
          },
          file: vs.location.uri.fsPath,
          relativePath,
          language: languageDetector.detectFromExtension(path.extname(vs.location.uri.fsPath))?.id || 'unknown',
        };

        if (extractOpts.includeContent) {
          const fetched = await contentFetcher.fetchContext(
            vs.location.uri.fsPath, vs.location.range.start.line + 1, 10,
            { maxTokens: extractOpts.maxTokensPerSymbol || 500 }
          );
          if (fetched) { symbol.content = fetched.content; }
        }

        const score = this.matchScore(vs.name, query);
        const matchType = this.matchType(vs.name, query);
        results.push({ symbol, score, matchType });
      }

      results.sort((a, b) => b.score - a.score);
      return results;
    } catch (error) {
      Logger.error('Failed to search workspace symbols:', error);
      return [];
    }
  }

  async findByName(name: string, options: ExtractionOptions = {}): Promise<ExtractedSymbol | null> {
    const results = await this.searchWorkspace(name, { ...options, maxResults: 10 });
    const exact = results.find(r => r.matchType === 'exact');
    return exact?.symbol || results[0]?.symbol || null;
  }

  // ============ Formatting ============

  formatForPrompt(symbol: ExtractedSymbol, options: { includeContent?: boolean } = {}): string {
    const lines: string[] = [];
    lines.push(`<symbol name="${symbol.name}" kind="${symbol.kind}" file="${symbol.relativePath}" line="${symbol.range.startLine}">`);

    if (symbol.signature) { lines.push(`<signature>${symbol.signature}</signature>`); }
    if (symbol.documentation) { lines.push(`<documentation>${symbol.documentation}</documentation>`); }

    if (options.includeContent !== false && symbol.content) {
      lines.push('<content>');
      lines.push(symbol.content);
      lines.push('</content>');
    }

    if (symbol.children && symbol.children.length > 0) {
      lines.push('<children>');
      for (const child of symbol.children) { lines.push(`  - ${child.kind} ${child.name}`); }
      lines.push('</children>');
    }

    lines.push('</symbol>');
    return lines.join('\n');
  }

  formatSymbolList(symbols: ExtractedSymbol[]): string {
    return symbols.map(s => {
      const icon = this.kindIcon(s.kind);
      const loc = `${s.relativePath}:${s.range.startLine}`;
      let line = `${icon} ${s.name} (${loc})`;
      if (s.children && s.children.length > 0) {
        line += '\n' + s.children.slice(0, 5).map(c => `  ${this.kindIcon(c.kind)} ${c.name}`).join('\n');
        if (s.children.length > 5) { line += `\n  ... and ${s.children.length - 5} more`; }
      }
      return line;
    }).join('\n');
  }

  private kindIcon(kind: SymbolKind): string {
    const icons: Record<SymbolKind, string> = {
      class: 'C', interface: 'I', function: 'F', method: 'M', property: 'P',
      variable: 'V', constant: 'K', enum: 'E', type: 'T', module: 'Mod',
      namespace: 'NS', constructor: 'Ctor', field: 'Fld', unknown: '?',
    };
    return `[${icons[kind] || '?'}]`;
  }

  // ============ Utilities ============

  private filterSymbols(symbols: ExtractedSymbol[], opts: ExtractionOptions): ExtractedSymbol[] {
    let result = symbols;
    if (opts.kinds && opts.kinds.length > 0) { result = result.filter(s => opts.kinds!.includes(s.kind)); }
    if (opts.namePattern) {
      const regex = typeof opts.namePattern === 'string' ? new RegExp(opts.namePattern, 'i') : opts.namePattern;
      result = result.filter(s => regex.test(s.name));
    }
    return result;
  }

  private matchScore(name: string, query: string): number {
    const ln = name.toLowerCase(), lq = query.toLowerCase();
    if (ln === lq) { return 100; }
    if (ln.startsWith(lq)) { return 80; }
    if (ln.includes(lq)) { return 60; }
    let score = 0, qi = 0;
    for (const c of ln) { if (qi < lq.length && c === lq[qi]) { score += 10; qi++; } }
    return Math.min(score, 40);
  }

  private matchType(name: string, query: string): 'exact' | 'prefix' | 'contains' | 'fuzzy' {
    const ln = name.toLowerCase(), lq = query.toLowerCase();
    if (ln === lq) { return 'exact'; }
    if (ln.startsWith(lq)) { return 'prefix'; }
    if (ln.includes(lq)) { return 'contains'; }
    return 'fuzzy';
  }

  clearCache(): void { this.symbolCache.clear(); }
}

// ============ Singleton Export ============

export const symbolExtractor = new SymbolExtractor();
