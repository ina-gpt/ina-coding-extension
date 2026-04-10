import * as vscode from 'vscode';
import { SuffixContext } from './ContextTypes';

export class SuffixExtractor {
  private static instance: SuffixExtractor;
  private maxTokens: number = 1500;
  private maxLines: number = 50;
  private preserveClosingBrackets: boolean = true;

  static getInstance(): SuffixExtractor {
    if (!SuffixExtractor.instance) {
      SuffixExtractor.instance = new SuffixExtractor();
    }
    return SuffixExtractor.instance;
  }

  extract(
    document: vscode.TextDocument,
    position: vscode.Position,
    tokenBudget: number
  ): SuffixContext {
    const effectiveBudget = Math.min(tokenBudget, this.maxTokens);
    const endLine = Math.min(document.lineCount - 1, position.line + this.maxLines);
    const range = new vscode.Range(
      position.line,
      position.character,
      endLine,
      document.lineAt(endLine).text.length
    );
    const fullText = document.getText(range);
    const allLines = fullText.split('\n');
    const estimatedTokens = this.estimateTokens(fullText);

    if (estimatedTokens <= effectiveBudget) {
      return {
        text: fullText,
        lines: allLines,
        tokens: estimatedTokens,
        truncated: false,
        firstCompleteStatement: this.findFirstCompleteStatement(allLines, document.languageId),
      };
    }

    const { text, lines, truncated } = this.smartTruncate(
      fullText,
      allLines,
      effectiveBudget,
      document.languageId,
      document,
      position
    );

    return {
      text,
      lines,
      tokens: this.estimateTokens(text),
      truncated,
      firstCompleteStatement: this.findFirstCompleteStatement(lines, document.languageId),
    };
  }

  smartTruncate(
    fullText: string,
    lines: string[],
    maxTokens: number,
    language: string,
    document: vscode.TextDocument,
    position: vscode.Position
  ): { text: string; lines: string[]; truncated: boolean } {
    // Step 1: Get prefix text for bracket analysis
    const prefixRange = new vscode.Range(
      Math.max(0, position.line - 50),
      0,
      position.line,
      position.character
    );
    const prefixText = document.getText(prefixRange);

    // Step 2: Find lines to preserve for closing brackets
    const bracketLines = this.preserveClosingBrackets
      ? this.findClosingBrackets(prefixText, lines)
      : [];

    // Step 3: Build result
    const result: string[] = [];
    let tokenCount = 0;

    // Always keep first few lines (immediate context)
    const firstStatementEnd = this.findFirstCompleteStatement(lines, language);
    const minKeepLines = Math.max(firstStatementEnd + 1, 3);

    for (let i = 0; i < lines.length; i++) {
      const lineTokens = this.estimateTokens(lines[i]);
      const isBracketLine = bracketLines.includes(i);
      const isEarlyLine = i < minKeepLines;

      if (isEarlyLine || isBracketLine) {
        result.push(lines[i]);
        tokenCount += lineTokens;
      } else if (tokenCount + lineTokens <= maxTokens) {
        result.push(lines[i]);
        tokenCount += lineTokens;
      } else {
        break;
      }
    }

    return {
      text: result.join('\n'),
      lines: result,
      truncated: result.length < lines.length,
    };
  }

  findFirstCompleteStatement(lines: string[], language: string): number {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      if (['javascript', 'typescript', 'typescriptreact', 'javascriptreact', 'java', 'c', 'cpp'].includes(language)) {
        if (trimmed.endsWith(';') || trimmed.endsWith('}') || trimmed.endsWith('{')) {
          return i;
        }
      } else if (language === 'python') {
        if (trimmed.endsWith(':') || (i > 0 && !lines[i].startsWith(' '))) {
          return i;
        }
      } else {
        if (trimmed.endsWith(';') || trimmed.endsWith('}')) {
          return i;
        }
      }
    }
    return Math.min(lines.length - 1, 2);
  }

  findClosingBrackets(prefixText: string, suffixLines: string[]): number[] {
    const depths = this.calculateBracketDepths(prefixText);
    return this.findMatchingClose(suffixLines, depths);
  }

  calculateBracketDepths(text: string): { braces: number; brackets: number; parens: number } {
    let braces = 0;
    let brackets = 0;
    let parens = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const prev = i > 0 ? text[i - 1] : '';

      if (inString) {
        if (ch === stringChar && prev !== '\\') inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
      else if (ch === '(') parens++;
      else if (ch === ')') parens--;
    }

    return {
      braces: Math.max(0, braces),
      brackets: Math.max(0, brackets),
      parens: Math.max(0, parens),
    };
  }

  findMatchingClose(
    lines: string[],
    openCounts: { braces: number; brackets: number; parens: number }
  ): number[] {
    const importantLines: number[] = [];
    let braces = openCounts.braces;
    let brackets = openCounts.brackets;
    let parens = openCounts.parens;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let lineHasClose = false;

      for (const ch of line) {
        if (ch === '}' && braces > 0) { braces--; lineHasClose = true; }
        else if (ch === ']' && brackets > 0) { brackets--; lineHasClose = true; }
        else if (ch === ')' && parens > 0) { parens--; lineHasClose = true; }
        else if (ch === '{') braces++;
        else if (ch === '[') brackets++;
        else if (ch === '(') parens++;
      }

      if (lineHasClose) importantLines.push(i);
      if (braces === 0 && brackets === 0 && parens === 0) break;
    }

    return importantLines;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  setMaxTokens(tokens: number): void {
    this.maxTokens = tokens;
  }

  setMaxLines(lines: number): void {
    this.maxLines = lines;
  }
}
