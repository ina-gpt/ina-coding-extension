import * as vscode from 'vscode';
import { CompletionContext } from '../CompletionTypes';
import { HallucinationIssue } from './QualityTypes';

export class HallucinationDetector {
  private static instance: HallucinationDetector;
  private knownSymbols: Set<string> = new Set();
  private documentSymbolsCache: Map<string, { symbols: string[]; timestamp: number }> = new Map();
  private cacheTTL: number = 30000;

  static getInstance(): HallucinationDetector {
    if (!HallucinationDetector.instance) {
      HallucinationDetector.instance = new HallucinationDetector();
    }
    return HallucinationDetector.instance;
  }

  detect(
    completion: string,
    context: CompletionContext
  ): { isHallucination: boolean; confidence: number; issues: HallucinationIssue[] } {
    const issues: HallucinationIssue[] = [];

    issues.push(...this.checkUndefinedReferences(completion, context));
    issues.push(...this.checkAPIValidity(completion, context.language));

    const score = this.calculateHallucinationScore(issues);

    return {
      isHallucination: score > 0.7,
      confidence: score,
      issues,
    };
  }

  checkUndefinedReferences(
    completion: string,
    context: CompletionContext
  ): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];
    const identifiers = this.extractIdentifiers(completion);
    const known = this.getKnownSymbols(context);
    const stdlib = this.getStandardLibrarySymbols(context.language);

    for (const id of identifiers) {
      // Skip short identifiers, keywords, and common names
      if (id.length < 3) continue;
      if (this.isKeyword(id, context.language)) continue;
      if (this.isCommonName(id)) continue;
      if (known.has(id)) continue;
      if (stdlib.has(id)) continue;

      // Only flag if identifier looks like it should be defined
      if (this.isLikelyHallucination(id, context)) {
        issues.push({
          type: 'undefined_variable',
          symbol: id,
          position: completion.indexOf(id),
          suggestion: null,
        });
      }
    }

    return issues;
  }

  checkAPIValidity(completion: string, language: string): HallucinationIssue[] {
    const issues: HallucinationIssue[] = [];

    if (['javascript', 'typescript', 'typescriptreact', 'javascriptreact'].includes(language)) {
      const invalidAPIs: Array<{ pattern: RegExp; message: string; suggestion: string }> = [
        { pattern: /document\.getElement\b(?!ById|sByClassName|sByTagName|sByName)/, message: 'Invalid DOM API', suggestion: 'getElementById' },
        { pattern: /Array\.prototype\.flat\(\s*Infinity\s*\)/, message: 'flat(Infinity) can cause issues', suggestion: 'flat(10)' },
        { pattern: /\.trimLeft\b/, message: 'trimLeft is deprecated', suggestion: 'trimStart' },
        { pattern: /\.trimRight\b/, message: 'trimRight is deprecated', suggestion: 'trimEnd' },
      ];

      for (const api of invalidAPIs) {
        if (api.pattern.test(completion)) {
          issues.push({
            type: 'invalid_api',
            symbol: api.message,
            position: 0,
            suggestion: api.suggestion,
          });
        }
      }
    }

    return issues;
  }

  checkTypeConsistency(
    completion: string,
    context: CompletionContext
  ): HallucinationIssue[] {
    // Basic type consistency check - full implementation would need type info
    return [];
  }

  extractIdentifiers(code: string): string[] {
    const identifiers = new Set<string>();
    // Match word characters that look like identifiers
    const matches = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g);
    if (matches) {
      for (const m of matches) identifiers.add(m);
    }
    return [...identifiers];
  }

  getKnownSymbols(context: CompletionContext): Set<string> {
    const symbols = new Set<string>();

    // Extract from prefix
    const prefixIds = this.extractIdentifiers(context.prefix);
    for (const id of prefixIds) symbols.add(id);

    // Extract from suffix
    const suffixIds = this.extractIdentifiers(context.suffix);
    for (const id of suffixIds) symbols.add(id);

    return symbols;
  }

  getStandardLibrarySymbols(language: string): Set<string> {
    const stdlibs: Record<string, string[]> = {
      javascript: [
        'console', 'Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number',
        'Boolean', 'RegExp', 'Error', 'Map', 'Set', 'Promise', 'Symbol', 'Proxy',
        'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'setTimeout', 'setInterval',
        'clearTimeout', 'clearInterval', 'fetch', 'URL', 'URLSearchParams',
        'document', 'window', 'navigator', 'localStorage', 'sessionStorage',
        'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',
        'require', 'module', 'exports', 'process', 'Buffer', '__dirname', '__filename',
      ],
      python: [
        'print', 'len', 'range', 'int', 'str', 'float', 'bool', 'list', 'dict',
        'set', 'tuple', 'type', 'isinstance', 'issubclass', 'hasattr', 'getattr',
        'setattr', 'delattr', 'input', 'open', 'file', 'os', 'sys', 'math',
        'json', 're', 'datetime', 'collections', 'itertools', 'functools',
        'None', 'True', 'False', 'self', 'cls', 'super', 'property',
        'staticmethod', 'classmethod', 'abstractmethod', 'dataclass',
      ],
    };

    const symbols = stdlibs[language] || stdlibs.javascript || [];
    return new Set(symbols);
  }

  isLikelyHallucination(symbol: string, context: CompletionContext): boolean {
    // If the symbol looks like a method on a known object, it might be valid
    if (/^[a-z]/.test(symbol)) return false; // camelCase methods are common

    // Capital-starting names that aren't in context are suspicious
    if (/^[A-Z]/.test(symbol) && symbol.length > 3) return true;

    return false;
  }

  calculateHallucinationScore(issues: HallucinationIssue[]): number {
    if (issues.length === 0) return 0;
    return Math.min(1, issues.length * 0.25);
  }

  updateKnownSymbols(document: vscode.TextDocument): void {
    const text = document.getText();
    const ids = this.extractIdentifiers(text);
    for (const id of ids) this.knownSymbols.add(id);
  }

  private isKeyword(id: string, language: string): boolean {
    const keywords: Record<string, Set<string>> = {
      javascript: new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return', 'function', 'class', 'const', 'let', 'var', 'new', 'this', 'typeof', 'instanceof', 'void', 'delete', 'throw', 'try', 'catch', 'finally', 'import', 'export', 'default', 'from', 'as', 'async', 'await', 'yield', 'of', 'in']),
      python: new Set(['if', 'else', 'elif', 'for', 'while', 'def', 'class', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'is', 'in', 'global', 'nonlocal', 'assert', 'yield', 'async', 'await']),
    };

    const langKeywords = keywords[language] || keywords.javascript;
    return langKeywords?.has(id) || false;
  }

  private isCommonName(id: string): boolean {
    const common = new Set(['i', 'j', 'k', 'x', 'y', 'z', 'n', 'a', 'b', 'c', 'e', 'f', 'fn', 'cb', 'err', 'res', 'req', 'ctx', 'el', 'idx', 'key', 'val', 'item', 'data', 'result', 'value', 'index', 'count', 'name', 'type', 'id', 'args', 'opts', 'config', 'options', 'params', 'props', 'state', 'event', 'error', 'message', 'text', 'line', 'file', 'path']);
    return common.has(id);
  }
}
