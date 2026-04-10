import * as vscode from 'vscode';
import { PrefixContext } from './ContextTypes';

export class PrefixExtractor {
  private static instance: PrefixExtractor;
  private maxTokens: number = 4000;
  private maxLines: number = 200;
  private preserveImportsWeight: number = 1.5;
  private preserveDeclarationsWeight: number = 1.3;

  static getInstance(): PrefixExtractor {
    if (!PrefixExtractor.instance) {
      PrefixExtractor.instance = new PrefixExtractor();
    }
    return PrefixExtractor.instance;
  }

  extract(
    document: vscode.TextDocument,
    position: vscode.Position,
    tokenBudget: number
  ): PrefixContext {
    const effectiveBudget = Math.min(tokenBudget, this.maxTokens);
    const startLine = Math.max(0, position.line - this.maxLines);
    const range = new vscode.Range(startLine, 0, position.line, position.character);
    const fullText = document.getText(range);
    const allLines = fullText.split('\n');
    const estimatedTokens = this.estimateTokens(fullText);

    if (estimatedTokens <= effectiveBudget) {
      return {
        text: fullText,
        lines: allLines,
        tokens: estimatedTokens,
        truncated: false,
        truncationPoint: null,
        lastCompleteStatement: this.findLastCompleteStatement(allLines, document.languageId),
        lastImportLine: this.findImportSection(allLines, document.languageId).end,
      };
    }

    // Smart truncation needed
    const { text, lines, truncationPoint } = this.smartTruncate(
      fullText,
      allLines,
      position,
      effectiveBudget,
      document.languageId
    );

    return {
      text,
      lines,
      tokens: this.estimateTokens(text),
      truncated: true,
      truncationPoint,
      lastCompleteStatement: this.findLastCompleteStatement(lines, document.languageId),
      lastImportLine: this.findImportSection(lines, document.languageId).end,
    };
  }

  smartTruncate(
    fullText: string,
    lines: string[],
    position: vscode.Position,
    maxTokens: number,
    language: string
  ): { text: string; lines: string[]; truncationPoint: number } {
    const result: string[] = [];
    let tokenCount = 0;

    // Step 1: Always preserve import section (first 50 lines max)
    const importSection = this.findImportSection(lines, language);
    const importLines: string[] = [];
    if (importSection.end > importSection.start) {
      for (let i = importSection.start; i <= Math.min(importSection.end, 50); i++) {
        if (i < lines.length) {
          importLines.push(lines[i]);
        }
      }
    }
    const importTokens = this.estimateTokens(importLines.join('\n'));

    // Step 2: Find containing declaration
    const cursorLineInArray = lines.length - 1; // cursor is at last line
    const declaration = this.findContainingDeclaration(lines, cursorLineInArray, language);

    // Step 3: Build result - imports + declaration context + most recent lines
    const remainingBudget = maxTokens - importTokens;
    const recentLines: string[] = [];
    let truncationPoint = lines.length;

    // Work backwards from cursor, collecting lines
    for (let i = lines.length - 1; i >= 0; i--) {
      // Skip lines already in imports
      if (i >= importSection.start && i <= importSection.end && importLines.length > 0) {
        continue;
      }

      const lineTokens = this.estimateTokens(lines[i]);
      if (tokenCount + lineTokens > remainingBudget) {
        truncationPoint = i + 1;
        break;
      }
      recentLines.unshift(lines[i]);
      tokenCount += lineTokens;
    }

    // Combine: imports + truncation marker + recent code
    if (importLines.length > 0 && truncationPoint > importSection.end) {
      result.push(...importLines);
      result.push('');
      result.push(`// ... (${truncationPoint - importSection.end - 1} lines truncated)`);
      result.push('');
    }
    result.push(...recentLines);

    return {
      text: result.join('\n'),
      lines: result,
      truncationPoint,
    };
  }

  findLastCompleteStatement(lines: string[], language: string): number {
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      if (['javascript', 'typescript', 'typescriptreact', 'javascriptreact', 'java', 'c', 'cpp', 'rust', 'go'].includes(language)) {
        if (trimmed.endsWith(';') || trimmed.endsWith('}') || trimmed.endsWith('{')) {
          return i;
        }
      } else if (language === 'python') {
        // In Python, a non-indented non-empty line after code is a statement boundary
        if (trimmed.endsWith(':') || !lines[i].startsWith(' ')) {
          return i;
        }
      } else {
        if (trimmed.endsWith(';') || trimmed.endsWith('}') || trimmed.endsWith(')')) {
          return i;
        }
      }
    }
    return -1;
  }

  findImportSection(lines: string[], language: string): { start: number; end: number } {
    let start = -1;
    let end = -1;

    const importPatterns: Record<string, RegExp[]> = {
      javascript: [/^\s*import\s/, /^\s*const\s+.*=\s*require\(/, /^\s*export\s+.*from\s/],
      typescript: [/^\s*import\s/, /^\s*const\s+.*=\s*require\(/, /^\s*export\s+.*from\s/],
      typescriptreact: [/^\s*import\s/, /^\s*const\s+.*=\s*require\(/],
      javascriptreact: [/^\s*import\s/, /^\s*const\s+.*=\s*require\(/],
      python: [/^\s*import\s/, /^\s*from\s+\w+\s+import/],
      go: [/^\s*import\s/],
      rust: [/^\s*use\s/, /^\s*extern\s+crate/],
      java: [/^\s*import\s/],
    };

    const patterns = importPatterns[language] || importPatterns.javascript;

    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const isImport = patterns.some((p) => p.test(lines[i]));
      const isContinuation = lines[i].trim().startsWith('}') && start >= 0;
      const isMultiLine = start >= 0 && end >= 0 && i === end + 1 &&
        (lines[i].trim().startsWith(',') || lines[i].trim().startsWith('}'));

      if (isImport || isContinuation || isMultiLine) {
        if (start === -1) start = i;
        end = i;
      } else if (start >= 0 && end >= 0 && lines[i].trim() === '') {
        // Allow blank lines within import section
        continue;
      } else if (start >= 0 && end >= 0) {
        break; // End of import section
      }
    }

    return { start: start === -1 ? 0 : start, end: end === -1 ? 0 : end };
  }

  findContainingDeclaration(
    lines: string[],
    cursorLine: number,
    language: string
  ): { start: number; end: number; type: string } | null {
    const declarationPatterns = [
      /^\s*(export\s+)?(async\s+)?function\s/,
      /^\s*(export\s+)?(default\s+)?class\s/,
      /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/,
      /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?function/,
      /^\s*(public|private|protected|static)?\s*(async\s+)?\w+\s*\(/,
      /^\s*def\s+\w+/,  // Python
      /^\s*func\s+\w+/,  // Go
      /^\s*(pub\s+)?fn\s+\w+/,  // Rust
    ];

    // Walk backwards from cursor to find containing declaration
    for (let i = cursorLine; i >= 0; i--) {
      for (const pattern of declarationPatterns) {
        if (pattern.test(lines[i])) {
          // Found declaration start, estimate end by indentation
          const indent = lines[i].match(/^(\s*)/)?.[1].length || 0;
          let end = cursorLine;
          for (let j = i + 1; j < lines.length; j++) {
            const lineIndent = lines[j].match(/^(\s*)/)?.[1].length || 0;
            if (lines[j].trim() && lineIndent <= indent && j > i + 1) {
              end = j - 1;
              break;
            }
            end = j;
          }

          let type = 'function';
          if (/class\s/.test(lines[i])) type = 'class';
          else if (/const\s/.test(lines[i])) type = 'arrow_function';

          return { start: i, end, type };
        }
      }
    }

    return null;
  }

  estimateTokens(text: string): number {
    // ~4 chars per token for code
    return Math.ceil(text.length / 4);
  }

  setMaxTokens(tokens: number): void {
    this.maxTokens = tokens;
  }

  setMaxLines(lines: number): void {
    this.maxLines = lines;
  }
}
