import * as vscode from 'vscode';
import { CompletionContext } from '../CompletionTypes';

export class IndentationManager {
  private static instance: IndentationManager;
  private defaultIndentSize: number = 2;
  private defaultUseTabs: boolean = false;

  static getInstance(): IndentationManager {
    if (!IndentationManager.instance) {
      IndentationManager.instance = new IndentationManager();
    }
    return IndentationManager.instance;
  }

  detectIndentation(document: vscode.TextDocument): { useTabs: boolean; size: number } {
    let tabCount = 0;
    let spaceCount = 0;
    const spaceSizes: number[] = [];
    const linesToCheck = Math.min(document.lineCount, 100);

    for (let i = 0; i < linesToCheck; i++) {
      const line = document.lineAt(i).text;
      if (!line.trim()) continue;

      const indent = line.match(/^(\s+)/);
      if (indent) {
        if (indent[1].includes('\t')) tabCount++;
        else {
          spaceCount++;
          spaceSizes.push(indent[1].length);
        }
      }
    }

    const useTabs = tabCount > spaceCount;

    // Determine indent size from most common difference
    let size = this.defaultIndentSize;
    if (spaceSizes.length > 1) {
      const diffs: number[] = [];
      for (let i = 1; i < spaceSizes.length; i++) {
        const diff = Math.abs(spaceSizes[i] - spaceSizes[i - 1]);
        if (diff > 0 && diff <= 8) diffs.push(diff);
      }
      if (diffs.length > 0) {
        const counts = new Map<number, number>();
        for (const d of diffs) counts.set(d, (counts.get(d) || 0) + 1);
        size = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    return { useTabs, size };
  }

  detectLineIndentation(line: string): { level: number; char: string; raw: string } {
    const match = line.match(/^(\s*)/);
    const raw = match?.[1] || '';
    const char = raw.includes('\t') ? '\t' : ' ';
    const level = char === '\t' ? raw.length : Math.floor(raw.length / this.defaultIndentSize);
    return { level, char, raw };
  }

  fixIndentation(
    completion: string,
    context: CompletionContext,
    targetIndent: string
  ): string {
    const lines = completion.split('\n');
    if (lines.length <= 1) return completion;

    // First line is continuation of current line, don't adjust
    const result = [lines[0]];

    // Detect completion's own indentation style
    const baseIndent = this.inferIndentFromContext(context.prefix);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        result.push('');
        continue;
      }

      const lineIndent = this.detectLineIndentation(line);
      // Calculate relative indent from completion's base
      const relativeLevel = lineIndent.level;

      // Apply target indentation style
      const newIndent = targetIndent + this.makeIndent(relativeLevel, targetIndent);
      result.push(newIndent + line.trimStart());
    }

    return result.join('\n');
  }

  normalizeIndentation(
    text: string,
    fromStyle: { useTabs: boolean; size: number },
    toStyle: { useTabs: boolean; size: number }
  ): string {
    if (fromStyle.useTabs === toStyle.useTabs && fromStyle.size === toStyle.size) {
      return text;
    }

    return text.split('\n').map((line) => {
      const match = line.match(/^(\s*)(.*)/);
      if (!match) return line;

      const [, indent, content] = match;
      if (!indent) return line;

      // Convert to spaces first
      let spaces: number;
      if (fromStyle.useTabs) {
        spaces = indent.split('\t').length * fromStyle.size -
          (fromStyle.size - indent.replace(/\t/g, '').length);
      } else {
        spaces = indent.length;
      }

      // Convert to target style
      if (toStyle.useTabs) {
        const tabs = Math.floor(spaces / toStyle.size);
        const remaining = spaces % toStyle.size;
        return '\t'.repeat(tabs) + ' '.repeat(remaining) + content;
      }
      return ' '.repeat(spaces) + content;
    }).join('\n');
  }

  calculateExpectedIndentation(context: CompletionContext): string {
    const { bracketDepth, parenDepth, linePrefix } = context.cursorContext;
    const currentIndent = context.indentation;
    const indentUnit = this.inferIndentFromContext(context.prefix);

    // If line ends with opening bracket, expect +1 indent
    const trimmedPrefix = linePrefix.trimEnd();
    if (trimmedPrefix.endsWith('{') || trimmedPrefix.endsWith('(') || trimmedPrefix.endsWith('[')) {
      return currentIndent + indentUnit;
    }

    return currentIndent;
  }

  isIndentationCorrect(completion: string, context: CompletionContext): boolean {
    const issues = this.getIndentationIssues(completion, context);
    return issues.length === 0;
  }

  getIndentationIssues(completion: string, context: CompletionContext): string[] {
    const issues: string[] = [];
    const lines = completion.split('\n');
    if (lines.length <= 1) return issues;

    const docIndent = context.indentation;
    const usesTabs = docIndent.includes('\t');
    const usesSpaces = docIndent.includes(' ') && !docIndent.includes('\t');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const indent = line.match(/^(\s*)/)?.[1] || '';
      if (usesTabs && indent.includes(' ') && !indent.includes('\t')) {
        issues.push(`Line ${i + 1}: uses spaces but document uses tabs`);
      }
      if (usesSpaces && indent.includes('\t')) {
        issues.push(`Line ${i + 1}: uses tabs but document uses spaces`);
      }
    }

    return issues;
  }

  adjustBracketIndentation(
    completion: string,
    language: string,
    baseIndent: string
  ): string {
    const lines = completion.split('\n');
    const result: string[] = [];
    let depth = 0;
    const indentUnit = '  ';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        result.push('');
        continue;
      }

      // Decrease before closing brackets
      if (/^[}\])]/.test(trimmed)) depth--;

      result.push(baseIndent + indentUnit.repeat(Math.max(0, depth)) + trimmed);

      // Increase after opening brackets
      const opens = (trimmed.match(/[{[(]/g) || []).length;
      const closes = (trimmed.match(/[}\])]/g) || []).length;
      depth += opens - closes;
      if (/^[}\])]/.test(trimmed)) depth += 1; // Undo the pre-decrease for this line
    }

    return result.join('\n');
  }

  inferIndentFromContext(prefix: string): string {
    const lines = prefix.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const indent = lines[i].match(/^(\s+)/);
      if (indent) {
        const raw = indent[1];
        if (raw.includes('\t')) return '\t';
        const size = raw.length;
        if (size >= 2) return ' '.repeat(Math.min(size, 4));
      }
    }
    return '  ';
  }

  private makeIndent(level: number, unit: string): string {
    if (level <= 0) return '';
    return unit.repeat(level);
  }

  setDefaults(useTabs: boolean, size: number): void {
    this.defaultUseTabs = useTabs;
    this.defaultIndentSize = size;
  }
}
