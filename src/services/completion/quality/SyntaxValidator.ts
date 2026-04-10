import { CompletionContext } from '../CompletionTypes';

export class SyntaxValidator {
  private static instance: SyntaxValidator;

  static getInstance(): SyntaxValidator {
    if (!SyntaxValidator.instance) {
      SyntaxValidator.instance = new SyntaxValidator();
    }
    return SyntaxValidator.instance;
  }

  validate(
    completion: string,
    context: CompletionContext
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const language = context.language;

    const brackets = this.checkBracketBalance(completion, context);
    if (!brackets.balanced) {
      if (brackets.unclosed.length > 0) {
        warnings.push(`Unclosed brackets: ${brackets.unclosed.join(', ')}`);
      }
      if (brackets.unexpected.length > 0) {
        errors.push(`Unexpected closing brackets: ${brackets.unexpected.join(', ')}`);
      }
    }

    const strings = this.checkStringClosure(completion, language);
    if (!strings.closed) {
      warnings.push(`Unclosed string at position ${strings.unclosedAt}`);
    }

    const statement = this.checkStatementCompleteness(completion, language);
    if (!statement.complete) {
      warnings.push(`Incomplete statement: ${statement.missingParts.join(', ')}`);
    }

    const truncation = this.detectTruncation(completion, language);
    if (truncation.truncated) {
      warnings.push(`Possible truncation: ${truncation.truncationType}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  checkBracketBalance(
    completion: string,
    context: CompletionContext
  ): { balanced: boolean; unclosed: string[]; unexpected: string[] } {
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    const unexpected: string[] = [];
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < completion.length; i++) {
      const ch = completion[i];
      const prev = i > 0 ? completion[i - 1] : '';

      if (inString) {
        if (ch === stringChar && prev !== '\\') inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (pairs[ch]) {
        stack.push(ch);
      } else if (ch === ')' || ch === ']' || ch === '}') {
        const expected = Object.entries(pairs).find(([, v]) => v === ch)?.[0];
        if (stack.length > 0 && stack[stack.length - 1] === expected) {
          stack.pop();
        } else {
          // May be closing a bracket from prefix context
          unexpected.push(ch);
        }
      }
    }

    const unclosed = stack.map((ch) => pairs[ch]);
    // Allow some unclosed brackets since they may be closed in suffix
    const balanced = stack.length <= 2 && unexpected.length === 0;

    return { balanced, unclosed, unexpected };
  }

  checkStringClosure(
    completion: string,
    language: string
  ): { closed: boolean; unclosedAt: number | null; delimiter: string | null } {
    let inString = false;
    let stringChar = '';
    let stringStart = 0;

    for (let i = 0; i < completion.length; i++) {
      const ch = completion[i];
      const prev = i > 0 ? completion[i - 1] : '';

      if (inString) {
        if (ch === stringChar && prev !== '\\') {
          inString = false;
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
        stringStart = i;
      }
    }

    return {
      closed: !inString,
      unclosedAt: inString ? stringStart : null,
      delimiter: inString ? stringChar : null,
    };
  }

  checkStatementCompleteness(
    completion: string,
    language: string
  ): { complete: boolean; missingParts: string[] } {
    const missingParts: string[] = [];
    const trimmed = completion.trim();

    if (!trimmed) return { complete: true, missingParts };

    // Check for trailing operators
    if (/[+\-*/%&|^=<>!,]\s*$/.test(trimmed)) {
      missingParts.push('expression after operator');
    }

    // Check for incomplete function calls
    if (/\(\s*$/.test(trimmed)) {
      missingParts.push('closing parenthesis');
    }

    // Check for incomplete arrow functions
    if (/=>\s*$/.test(trimmed)) {
      missingParts.push('arrow function body');
    }

    return { complete: missingParts.length === 0, missingParts };
  }

  detectTruncation(
    completion: string,
    language: string
  ): {
    truncated: boolean;
    truncationType: 'mid_word' | 'mid_statement' | 'mid_string' | 'mid_bracket' | null;
  } {
    const trimmed = completion.trimEnd();
    if (!trimmed) return { truncated: false, truncationType: null };

    // Mid-word truncation
    if (/\w$/.test(trimmed) && !/[;\n{}()\[\]]/.test(trimmed.slice(-2))) {
      return { truncated: true, truncationType: 'mid_word' };
    }

    // Mid-string truncation
    const stringCheck = this.checkStringClosure(trimmed, language);
    if (!stringCheck.closed) {
      return { truncated: true, truncationType: 'mid_string' };
    }

    // Mid-bracket truncation
    const bracketCheck = this.checkBracketBalance(trimmed, {} as CompletionContext);
    if (bracketCheck.unclosed.length > 2) {
      return { truncated: true, truncationType: 'mid_bracket' };
    }

    return { truncated: false, truncationType: null };
  }

  estimateValidityScore(completion: string, context: CompletionContext): number {
    const result = this.validate(completion, context);
    let score = 1.0;

    score -= result.errors.length * 0.3;
    score -= result.warnings.length * 0.1;

    return Math.max(0, Math.min(1, score));
  }

  fixMinorSyntaxIssues(completion: string, language: string): string {
    let result = completion;

    // Remove trailing operators
    result = result.replace(/[+\-*/%]\s*$/, '');

    // Remove consecutive blank lines
    result = result.replace(/\n{3,}/g, '\n\n');

    return result;
  }
}
