import {
  FIMResponse,
  PostProcessingResult,
  PostProcessingRule,
  FIMQualityMetrics,
  getFIMTokens,
} from './FIMTypes';

export class FIMPostProcessor {
  private static instance: FIMPostProcessor;
  private rules: PostProcessingRule[] = [];
  private maxCompletionLines: number = 50;
  private maxCompletionChars: number = 2000;
  private trimTrailingWhitespace: boolean = true;
  private ensureBracketBalance: boolean = true;

  constructor() {
    this.initializeDefaultRules();
  }

  static getInstance(): FIMPostProcessor {
    if (!FIMPostProcessor.instance) {
      FIMPostProcessor.instance = new FIMPostProcessor();
    }
    return FIMPostProcessor.instance;
  }

  process(response: FIMResponse, language: string): PostProcessingResult {
    let text = response.completion;
    const rulesApplied: string[] = [];

    // Step 1: Remove special tokens
    text = this.removeSpecialTokens(text, response.model);

    // Step 2: Apply rules
    const sortedRules = [...this.rules].sort((a, b) => a.priority - b.priority);
    for (const rule of sortedRules) {
      if (rule.languages === '*' || rule.languages.includes(language)) {
        const before = text;
        text = text.replace(rule.pattern, rule.replacement);
        if (text !== before) {
          rulesApplied.push(rule.name);
        }
      }
    }

    // Step 3: Trim trailing whitespace
    const trimmed = this.trimTrailingWhitespace;
    if (trimmed) {
      text = this.trimTrailing(text);
    }

    // Step 4: Length limiting
    text = this.limitLength(text);

    // Step 5: Bracket balancing
    let bracketBalanced = true;
    if (this.ensureBracketBalance) {
      const result = this.balanceBrackets(text, language);
      text = result.text;
      bracketBalanced = result.balanced;
    }

    // Step 6: Indentation fix
    text = this.fixIndentation(text, language);

    return {
      original: response.completion,
      processed: text,
      rulesApplied,
      trimmed,
      bracketBalanced,
    };
  }

  assessQuality(text: string, language: string): FIMQualityMetrics {
    const lines = text.split('\n');
    const brackets = this.countBrackets(text);

    return {
      confidence: this.calculateConfidence(text, language),
      syntaxValid: this.basicSyntaxCheck(text, language),
      bracketBalanced: brackets.braces === 0 && brackets.parens === 0 && brackets.squares === 0,
      indentationConsistent: this.checkIndentation(lines),
      length: text.length,
      lineCount: lines.length,
      hasTrailingNewline: text.endsWith('\n'),
      containsSpecialTokens: this.hasSpecialTokens(text),
    };
  }

  private removeSpecialTokens(text: string, model: string): string {
    const tokens = getFIMTokens();

    // Remove all known FIM tokens
    let result = text;
    const tokensToRemove = [
      tokens.prefix, tokens.suffix, tokens.middle,
      tokens.endOfText,
    ];
    if (tokens.padding) tokensToRemove.push(tokens.padding);
    if (tokens.repository) tokensToRemove.push(tokens.repository);
    if (tokens.file) tokensToRemove.push(tokens.file);

    for (const token of tokensToRemove) {
      while (result.includes(token)) {
        result = result.replace(token, '');
      }
    }

    // Generic token pattern removal
    result = result.replace(/<\|[^>]+\|>/g, '');
    result = result.replace(/<｜[^｜]+｜>/g, '');

    return result;
  }

  private trimTrailing(text: string): string {
    const lines = text.split('\n');

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }

    // Trim trailing whitespace on each line (preserve indentation)
    return lines.map((l) => l.trimEnd()).join('\n');
  }

  private limitLength(text: string): string {
    // Limit by characters
    if (text.length > this.maxCompletionChars) {
      text = text.slice(0, this.maxCompletionChars);
      // Cut at last complete line
      const lastNewline = text.lastIndexOf('\n');
      if (lastNewline > 0) {
        text = text.slice(0, lastNewline);
      }
    }

    // Limit by lines
    const lines = text.split('\n');
    if (lines.length > this.maxCompletionLines) {
      text = lines.slice(0, this.maxCompletionLines).join('\n');
    }

    return text;
  }

  private balanceBrackets(
    text: string,
    language: string
  ): { text: string; balanced: boolean } {
    const counts = this.countBrackets(text);

    // If brackets are already balanced or we have too many closing, leave it
    if (
      counts.braces <= 0 && counts.parens <= 0 && counts.squares <= 0
    ) {
      return { text, balanced: true };
    }

    // If we have unclosed brackets, truncate at last complete statement
    if (counts.braces > 2 || counts.parens > 2 || counts.squares > 2) {
      const truncated = this.truncateAtLastComplete(text, language);
      return { text: truncated, balanced: false };
    }

    return { text, balanced: counts.braces <= 0 && counts.parens <= 0 && counts.squares <= 0 };
  }

  private truncateAtLastComplete(text: string, language: string): string {
    const semiLanguages = ['javascript', 'typescript', 'typescriptreact', 'javascriptreact',
      'java', 'c', 'cpp', 'go', 'rust', 'swift', 'kotlin', 'php'];

    if (semiLanguages.includes(language)) {
      const lastSemi = text.lastIndexOf(';');
      const lastBrace = text.lastIndexOf('}');
      const cutoff = Math.max(lastSemi, lastBrace);
      if (cutoff > 0) return text.slice(0, cutoff + 1);
    }

    // Fallback: cut at last newline in first half
    const lines = text.split('\n');
    if (lines.length > 2) {
      return lines.slice(0, Math.ceil(lines.length / 2)).join('\n');
    }

    return text;
  }

  private fixIndentation(text: string, language: string): string {
    const lines = text.split('\n');
    if (lines.length <= 1) return text;

    // Check first line indentation as reference
    const firstLineIndent = lines[0].match(/^(\s*)/)?.[1] || '';

    // Don't modify if first line has no indentation context
    if (firstLineIndent === '' && !lines[0].trim()) return text;

    // Detect mixed tabs/spaces and normalize
    const usesTabs = firstLineIndent.includes('\t');
    const usesSpaces = firstLineIndent.includes(' ');

    if (usesTabs && usesSpaces) {
      // Mixed indentation - normalize to spaces
      return lines.map((l) => l.replace(/\t/g, '  ')).join('\n');
    }

    return text;
  }

  private countBrackets(text: string): { braces: number; parens: number; squares: number } {
    let braces = 0;
    let parens = 0;
    let squares = 0;
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
      else if (ch === '(') parens++;
      else if (ch === ')') parens--;
      else if (ch === '[') squares++;
      else if (ch === ']') squares--;
    }

    return { braces, parens, squares };
  }

  private calculateConfidence(text: string, language: string): number {
    let score = 0.5;

    const length = text.length;
    if (length > 5 && length < 200) score += 0.2;
    else if (length >= 200 && length < 500) score += 0.1;
    else if (length < 3) score -= 0.3;

    if (this.basicSyntaxCheck(text, language)) score += 0.15;

    const lines = text.split('\n');
    if (lines.length > 1 && lines.length <= 5) score += 0.1;

    if (!this.hasSpecialTokens(text)) score += 0.05;

    return Math.max(0, Math.min(1, score));
  }

  private basicSyntaxCheck(text: string, language: string): boolean {
    const brackets = this.countBrackets(text);
    if (Math.abs(brackets.braces) > 3 || Math.abs(brackets.parens) > 3) return false;
    return true;
  }

  private checkIndentation(lines: string[]): boolean {
    if (lines.length <= 1) return true;

    let prevIndent = -1;
    for (const line of lines) {
      if (!line.trim()) continue;
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      if (prevIndent >= 0) {
        const diff = Math.abs(indent - prevIndent);
        if (diff > 8) return false; // Unreasonable indent jump
      }
      prevIndent = indent;
    }

    return true;
  }

  private hasSpecialTokens(text: string): boolean {
    return /<\|[^>]+\|>/g.test(text) || /<｜[^｜]+｜>/g.test(text);
  }

  private initializeDefaultRules(): void {
    this.rules = [
      {
        name: 'remove_markdown_fences',
        pattern: /^```\w*\n?|```$/gm,
        replacement: '',
        languages: '*',
        priority: 1,
      },
      {
        name: 'remove_trailing_comment_block',
        pattern: /\n\/\*\*[\s\S]*?\*\/\s*$/,
        replacement: '',
        languages: ['javascript', 'typescript', 'typescriptreact', 'javascriptreact', 'java', 'c', 'cpp'],
        priority: 5,
      },
      {
        name: 'remove_consecutive_blank_lines',
        pattern: /\n{3,}/g,
        replacement: '\n\n',
        languages: '*',
        priority: 10,
      },
    ];
  }

  addRule(rule: PostProcessingRule): void {
    this.rules.push(rule);
  }

  removeRule(name: string): void {
    this.rules = this.rules.filter((r) => r.name !== name);
  }

  setMaxCompletionLines(lines: number): void {
    this.maxCompletionLines = lines;
  }

  setMaxCompletionChars(chars: number): void {
    this.maxCompletionChars = chars;
  }

  setEnsureBracketBalance(enabled: boolean): void {
    this.ensureBracketBalance = enabled;
  }
}
