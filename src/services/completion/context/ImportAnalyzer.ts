import * as vscode from 'vscode';
import { ImportContext, ImportStatement, ImportSpecifier } from './ContextTypes';
import { CursorContext } from '../CompletionTypes';

export class ImportAnalyzer {
  private static instance: ImportAnalyzer;
  private importPatterns: Map<string, RegExp[]>;

  constructor() {
    this.importPatterns = new Map([
      ['javascript', [
        /^import\s+(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]+\}|\w+))?\s+from\s+['"]([^'"]+)['"]/,
        /^import\s+['"]([^'"]+)['"]/,
        /^(?:const|let|var)\s+(?:\{[^}]+\}|\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/,
        /^import\s*\(\s*['"]([^'"]+)['"]\s*\)/,
      ]],
      ['typescript', [
        /^import\s+(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]+\}|\w+))?\s+from\s+['"]([^'"]+)['"]/,
        /^import\s+['"]([^'"]+)['"]/,
        /^(?:const|let|var)\s+(?:\{[^}]+\}|\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/,
      ]],
      ['python', [
        /^import\s+(\w+(?:\.\w+)*)/,
        /^from\s+(\w+(?:\.\w+)*)\s+import/,
      ]],
      ['go', [
        /^import\s+"([^"]+)"/,
        /^import\s+\w+\s+"([^"]+)"/,
      ]],
      ['rust', [
        /^use\s+([\w:]+)/,
        /^extern\s+crate\s+(\w+)/,
      ]],
      ['java', [
        /^import\s+(?:static\s+)?([\w.]+)/,
      ]],
    ]);

    // Aliases
    this.importPatterns.set('typescriptreact', this.importPatterns.get('typescript')!);
    this.importPatterns.set('javascriptreact', this.importPatterns.get('javascript')!);
  }

  static getInstance(): ImportAnalyzer {
    if (!ImportAnalyzer.instance) {
      ImportAnalyzer.instance = new ImportAnalyzer();
    }
    return ImportAnalyzer.instance;
  }

  analyze(document: vscode.TextDocument): ImportContext {
    const language = document.languageId;
    const imports: ImportStatement[] = [];

    // Scan document for imports (limit to first 100 lines for performance)
    const maxScanLines = Math.min(document.lineCount, 100);
    for (let i = 0; i < maxScanLines; i++) {
      const lineText = document.lineAt(i).text.trim();
      if (!lineText) continue;

      const parsed = this.parseImportLine(lineText, i, language);
      if (parsed) {
        imports.push(parsed);
      }
    }

    const usedSymbols = this.findUsedSymbols(document, imports);
    const unusedImports = this.identifyUnusedImports(imports, usedSymbols);

    return {
      imports,
      totalCount: imports.length,
      relevantImports: imports, // Will be refined by getRelevantImports
      usedSymbols,
      unusedImports,
    };
  }

  parseImportLine(
    line: string,
    lineNumber: number,
    language: string
  ): ImportStatement | null {
    const patterns = this.importPatterns.get(language) || this.importPatterns.get('javascript')!;

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const source = match[1] || '';
        const specifiers = this.extractSpecifiers(line, language);
        const isDefault = /^import\s+\w+\s+from/.test(line) && !/^import\s+\{/.test(line);
        const isNamespace = /\*\s+as\s+/.test(line);
        const isType = /^import\s+type\s/.test(line);
        const isDynamic = /import\s*\(/.test(line);

        let type: ImportStatement['type'] = 'esm';
        if (/require\(/.test(line)) type = 'commonjs';
        else if (language === 'python') type = 'python';
        else if (language === 'go') type = 'go';
        else if (language === 'rust') type = 'rust';
        else if (language === 'java') type = 'java';

        return {
          line: lineNumber,
          raw: line,
          type,
          source,
          specifiers,
          isDefault,
          isNamespace,
          isType,
          isDynamic,
        };
      }
    }

    return null;
  }

  extractSpecifiers(importText: string, language: string): ImportSpecifier[] {
    const specifiers: ImportSpecifier[] = [];

    // Extract default import
    const defaultMatch = importText.match(/^import\s+(\w+)\s*(?:,|\s+from)/);
    if (defaultMatch && !importText.startsWith('import {') && !importText.startsWith('import type')) {
      specifiers.push({ name: defaultMatch[1], alias: null, isType: false });
    }

    // Extract named imports { a, b as c, type D }
    const namedMatch = importText.match(/\{([^}]+)\}/);
    if (namedMatch) {
      const items = namedMatch[1].split(',');
      for (const item of items) {
        const trimmed = item.trim();
        if (!trimmed) continue;

        const isType = trimmed.startsWith('type ');
        const clean = isType ? trimmed.replace(/^type\s+/, '') : trimmed;

        const asMatch = clean.match(/^(\w+)\s+as\s+(\w+)$/);
        if (asMatch) {
          specifiers.push({ name: asMatch[1], alias: asMatch[2], isType });
        } else {
          specifiers.push({ name: clean, alias: null, isType });
        }
      }
    }

    // Extract namespace import: * as name
    const nsMatch = importText.match(/\*\s+as\s+(\w+)/);
    if (nsMatch) {
      specifiers.push({ name: '*', alias: nsMatch[1], isType: false });
    }

    // Python: from X import a, b, c
    if (language === 'python') {
      const pyMatch = importText.match(/from\s+\S+\s+import\s+(.+)/);
      if (pyMatch) {
        const items = pyMatch[1].split(',');
        for (const item of items) {
          const trimmed = item.trim();
          const asMatch = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
          if (asMatch) {
            specifiers.push({ name: asMatch[1], alias: asMatch[2], isType: false });
          } else if (trimmed) {
            specifiers.push({ name: trimmed, alias: null, isType: false });
          }
        }
      }
    }

    return specifiers;
  }

  findUsedSymbols(document: vscode.TextDocument, imports: ImportStatement[]): string[] {
    const usedSymbols: Set<string> = new Set();
    const allSymbolNames: Set<string> = new Set();

    // Collect all imported symbol names
    for (const imp of imports) {
      for (const spec of imp.specifiers) {
        const name = spec.alias || spec.name;
        if (name !== '*') allSymbolNames.add(name);
      }
    }

    // Scan document body for usage (skip import section)
    const startLine = Math.max(...imports.map((i) => i.line), 0) + 1;
    for (let i = startLine; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;
      for (const symbol of allSymbolNames) {
        // Check if symbol appears as a word (not part of another word)
        const regex = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (regex.test(lineText)) {
          usedSymbols.add(symbol);
        }
      }
    }

    return [...usedSymbols];
  }

  identifyUnusedImports(imports: ImportStatement[], usedSymbols: string[]): string[] {
    const usedSet = new Set(usedSymbols);
    const unused: string[] = [];

    for (const imp of imports) {
      // Side-effect imports (import 'x') are always "used"
      if (imp.specifiers.length === 0 && !imp.isDefault && !imp.isNamespace) {
        continue;
      }

      const anyUsed = imp.specifiers.some((s) => {
        const name = s.alias || s.name;
        return name === '*' || usedSet.has(name);
      });

      if (!anyUsed) {
        unused.push(imp.source);
      }
    }

    return unused;
  }

  getRelevantImports(
    imports: ImportStatement[],
    cursorContext: CursorContext
  ): ImportStatement[] {
    // All non-type imports are relevant for completions
    // Type imports are relevant if cursor is in type position
    return imports.filter((imp) => {
      if (!imp.isType) return true;

      // Check if cursor is in a type position
      const linePrefix = cursorContext.linePrefix;
      const typeIndicators = [':', '<', 'extends', 'implements', 'as', 'type', 'interface'];
      return typeIndicators.some((t) => linePrefix.includes(t));
    });
  }

  formatForPrompt(imports: ImportStatement[], maxTokens: number): string {
    const lines: string[] = [];
    let tokenCount = 0;

    for (const imp of imports) {
      const lineTokens = Math.ceil(imp.raw.length / 4);
      if (tokenCount + lineTokens > maxTokens) break;
      lines.push(imp.raw);
      tokenCount += lineTokens;
    }

    return lines.join('\n');
  }
}
