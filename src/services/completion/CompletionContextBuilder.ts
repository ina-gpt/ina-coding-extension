import * as vscode from 'vscode';
import {
  CompletionContext,
  CompletionTriggerKind,
  CursorContext,
  RecentEdit,
} from './CompletionTypes';
import { ContextAggregator } from './context/ContextAggregator';
import { ContextFormatter } from './context/ContextFormatter';
import { PrefixExtractor } from './context/PrefixExtractor';
import { SuffixExtractor } from './context/SuffixExtractor';
import { ImportAnalyzer } from './context/ImportAnalyzer';
import {
  FullCompletionContext,
  ImportContext,
  RelatedFileContext,
} from './context/ContextTypes';

export class CompletionContextBuilder {
  private static instance: CompletionContextBuilder;

  private recentEdits: RecentEdit[] = [];
  private maxRecentEdits: number = 10;
  private maxPrefixLines: number = 50;
  private maxSuffixLines: number = 20;
  private maxPrefixChars: number = 8000;
  private maxSuffixChars: number = 3000;

  // Advanced context system
  private contextAggregator: ContextAggregator;
  private contextFormatter: ContextFormatter;
  private useAdvancedContext: boolean = true;

  constructor() {
    this.contextAggregator = new ContextAggregator();
    this.contextFormatter = ContextFormatter.getInstance();
  }

  static getInstance(): CompletionContextBuilder {
    if (!CompletionContextBuilder.instance) {
      CompletionContextBuilder.instance = new CompletionContextBuilder();
    }
    return CompletionContextBuilder.instance;
  }

  buildContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    triggerKind: CompletionTriggerKind,
    triggerCharacter: string | null
  ): CompletionContext {
    let prefix: string;
    let prefixLines: string[];
    let suffix: string;
    let suffixLines: string[];

    if (this.useAdvancedContext) {
      // Use advanced extractors for smarter truncation
      const prefixCtx = PrefixExtractor.getInstance().extract(document, position, this.maxPrefixChars / 4);
      const suffixCtx = SuffixExtractor.getInstance().extract(document, position, this.maxSuffixChars / 4);
      prefix = prefixCtx.text;
      prefixLines = prefixCtx.lines;
      suffix = suffixCtx.text;
      suffixLines = suffixCtx.lines;
    } else {
      const extracted = this.extractPrefix(document, position);
      prefix = extracted.text;
      prefixLines = extracted.lines;
      const suffixExtracted = this.extractSuffix(document, position);
      suffix = suffixExtracted.text;
      suffixLines = suffixExtracted.lines;
    }

    const cursorContext = this.buildCursorContext(document, position);
    const syntaxContext = this.detectSyntaxContext(document, position);

    const line = document.lineAt(position.line);
    const indentation = line.text.match(/^(\s*)/)?.[1] || '';

    return {
      triggerKind,
      triggerCharacter,
      document,
      position,
      prefix,
      suffix,
      prefixLines,
      suffixLines,
      language: document.languageId,
      filePath: document.fileName,
      lineNumber: position.line,
      columnNumber: position.character,
      indentation,
      isInString: syntaxContext.isInString,
      isInComment: syntaxContext.isInComment,
      isInImport: syntaxContext.isInImport,
      recentEdits: this.getRecentEdits(),
      cursorContext,
    };
  }

  async buildFullContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<FullCompletionContext> {
    return this.contextAggregator.gatherFullContext(document, position);
  }

  formatContextForPrompt(
    context: FullCompletionContext,
    format: 'fim' | 'instruction'
  ): { prefix: string; suffix: string } | string {
    if (format === 'fim') {
      return this.contextFormatter.formatForFIM(context);
    }
    return this.contextFormatter.formatForInstruction(context);
  }

  getImportContext(document: vscode.TextDocument): ImportContext {
    return ImportAnalyzer.getInstance().analyze(document);
  }

  async getRelatedFiles(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<RelatedFileContext> {
    const imports = this.getImportContext(document);
    const budget = { total: 8000, prefix: 4000, suffix: 1500, imports: 500, relatedFiles: 1500, recentEdits: 500, remaining: 8000 };
    return this.contextAggregator.gatherRelatedFiles(document, position, imports, budget);
  }

  extractPrefix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { text: string; lines: string[] } {
    const startLine = Math.max(0, position.line - this.maxPrefixLines);
    const range = new vscode.Range(startLine, 0, position.line, position.character);
    let text = document.getText(range);

    if (text.length > this.maxPrefixChars) {
      const truncated = text.slice(text.length - this.maxPrefixChars);
      const firstNewline = truncated.indexOf('\n');
      text = firstNewline >= 0 ? truncated.slice(firstNewline + 1) : truncated;
    }

    const lines = text.split('\n');
    return { text, lines };
  }

  extractSuffix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { text: string; lines: string[] } {
    const endLine = Math.min(document.lineCount - 1, position.line + this.maxSuffixLines);
    const range = new vscode.Range(
      position.line,
      position.character,
      endLine,
      document.lineAt(endLine).text.length
    );
    let text = document.getText(range);

    if (text.length > this.maxSuffixChars) {
      const truncated = text.slice(0, this.maxSuffixChars);
      const lastNewline = truncated.lastIndexOf('\n');
      text = lastNewline >= 0 ? truncated.slice(0, lastNewline) : truncated;
    }

    const lines = text.split('\n');
    return { text, lines };
  }

  buildCursorContext(document: vscode.TextDocument, position: vscode.Position): CursorContext {
    const line = document.lineAt(position.line);
    const lineContent = line.text;
    const linePrefix = lineContent.substring(0, position.character);
    const lineSuffix = lineContent.substring(position.character);

    const wordRange = document.getWordRangeAtPosition(position);
    const wordAtCursor = wordRange ? document.getText(wordRange) : '';

    let previousWord: string | null = null;
    if (position.character > 0) {
      const beforeCursor = linePrefix.trimEnd();
      const words = beforeCursor.split(/\s+/);
      if (words.length >= 2) {
        previousWord = words[words.length - 2];
      } else if (words.length === 1 && wordRange && wordRange.start.character > 0) {
        const prevPos = new vscode.Position(position.line, wordRange.start.character - 1);
        const prevWordRange = document.getWordRangeAtPosition(prevPos);
        if (prevWordRange) {
          previousWord = document.getText(prevWordRange);
        }
      }
    }

    let nextWord: string | null = null;
    const afterCursor = lineSuffix.trimStart();
    const nextWords = afterCursor.split(/\s+/);
    if (nextWords.length > 0 && nextWords[0]) {
      nextWord = nextWords[0];
    }

    let bracketDepth = 0;
    let parenDepth = 0;
    for (const ch of linePrefix) {
      if (ch === '{') bracketDepth++;
      else if (ch === '}') bracketDepth--;
      else if (ch === '(') parenDepth++;
      else if (ch === ')') parenDepth--;
    }

    return {
      lineContent,
      linePrefix,
      lineSuffix,
      wordAtCursor,
      wordRange: wordRange ?? null,
      previousWord,
      nextWord,
      bracketDepth,
      parenDepth,
    };
  }

  detectSyntaxContext(
    document: vscode.TextDocument,
    position: vscode.Position
  ): { isInString: boolean; isInComment: boolean; isInImport: boolean } {
    const lineText = document.lineAt(position.line).text;
    const linePrefix = lineText.substring(0, position.character);

    const isInComment =
      linePrefix.includes('//') ||
      linePrefix.includes('/*') ||
      linePrefix.trimStart().startsWith('*') ||
      linePrefix.trimStart().startsWith('#');

    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    for (let i = 0; i < position.character && i < lineText.length; i++) {
      const ch = lineText[i];
      const prev = i > 0 ? lineText[i - 1] : '';
      if (prev === '\\') continue;
      if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
      else if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
      else if (ch === '`' && !inSingle && !inDouble) inTemplate = !inTemplate;
    }
    const isInString = inSingle || inDouble || inTemplate;

    const trimmedLine = lineText.trimStart();
    const isInImport =
      trimmedLine.startsWith('import ') ||
      trimmedLine.startsWith('from ') ||
      trimmedLine.includes('require(') ||
      trimmedLine.startsWith('export ') ||
      trimmedLine.startsWith('using ');

    return { isInString, isInComment, isInImport };
  }

  recordEdit(edit: vscode.TextDocumentContentChangeEvent, document: vscode.TextDocument): void {
    const recentEdit: RecentEdit = {
      range: edit.range,
      text: edit.text,
      timestamp: Date.now(),
    };

    this.recentEdits.push(recentEdit);

    const cutoff = Date.now() - 30000;
    this.recentEdits = this.recentEdits.filter((e) => e.timestamp > cutoff);

    if (this.recentEdits.length > this.maxRecentEdits) {
      this.recentEdits = this.recentEdits.slice(-this.maxRecentEdits);
    }
  }

  getRecentEdits(maxAge: number = 30000): RecentEdit[] {
    const cutoff = Date.now() - maxAge;
    return this.recentEdits.filter((e) => e.timestamp > cutoff);
  }

  clearRecentEdits(): void {
    this.recentEdits = [];
  }

  setMaxPrefixLines(lines: number): void {
    this.maxPrefixLines = lines;
  }

  setMaxSuffixLines(lines: number): void {
    this.maxSuffixLines = lines;
  }

  setUseAdvancedContext(enabled: boolean): void {
    this.useAdvancedContext = enabled;
  }

  invalidateContextCache(filePath?: string): void {
    this.contextAggregator.invalidateCache(filePath);
  }

  dispose(): void {
    this.contextAggregator.dispose();
  }
}
