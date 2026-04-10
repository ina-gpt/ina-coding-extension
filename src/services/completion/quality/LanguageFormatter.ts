import * as vscode from 'vscode';
import { FormattingRule, FormattingContext } from './QualityTypes';

interface LanguageFormattingConfig {
  semicolons: 'always' | 'never' | 'asi';
  trailingCommas: 'none' | 'es5' | 'all';
  quotes: 'single' | 'double' | 'backtick';
  bracketSpacing: boolean;
  arrowParens: 'always' | 'avoid';
  tabWidth: number;
  printWidth: number;
}

const DEFAULT_JS_CONFIG: LanguageFormattingConfig = {
  semicolons: 'always',
  trailingCommas: 'es5',
  quotes: 'single',
  bracketSpacing: true,
  arrowParens: 'always',
  tabWidth: 2,
  printWidth: 80,
};

export class LanguageFormatter {
  private static instance: LanguageFormatter;
  private rules: Map<string, FormattingRule[]> = new Map();
  private languageConfigs: Map<string, LanguageFormattingConfig> = new Map();

  constructor() {
    this.initializeJavaScriptRules();
    this.initializeTypeScriptRules();
    this.initializePythonRules();
    this.initializeGoRules();
    this.initializeRustRules();
  }

  static getInstance(): LanguageFormatter {
    if (!LanguageFormatter.instance) {
      LanguageFormatter.instance = new LanguageFormatter();
    }
    return LanguageFormatter.instance;
  }

  format(completion: string, language: string, context: FormattingContext): string {
    const rules = this.rules.get(language) || this.rules.get('javascript') || [];
    let result = completion;

    const sorted = [...rules].sort((a, b) => a.priority - b.priority);
    for (const rule of sorted) {
      result = this.applyRule(result, rule, context);
    }

    return result;
  }

  private initializeJavaScriptRules(): void {
    const rules: FormattingRule[] = [
      {
        name: 'remove_consecutive_blanks',
        language: 'javascript',
        pattern: /\n{3,}/g,
        replacement: '\n\n',
        priority: 1,
      },
      {
        name: 'bracket_spacing',
        language: 'javascript',
        pattern: /\{(\S)/g,
        replacement: '{ $1',
        priority: 5,
      },
      {
        name: 'bracket_spacing_close',
        language: 'javascript',
        pattern: /(\S)\}/g,
        replacement: '$1 }',
        priority: 5,
      },
    ];

    this.rules.set('javascript', rules);
    this.rules.set('javascriptreact', rules);
    this.languageConfigs.set('javascript', { ...DEFAULT_JS_CONFIG });
  }

  private initializeTypeScriptRules(): void {
    const jsRules = this.rules.get('javascript') || [];
    const tsRules: FormattingRule[] = [
      ...jsRules,
      {
        name: 'type_colon_spacing',
        language: 'typescript',
        pattern: /:\s{2,}/g,
        replacement: ': ',
        priority: 3,
      },
    ];

    this.rules.set('typescript', tsRules);
    this.rules.set('typescriptreact', tsRules);
    this.languageConfigs.set('typescript', { ...DEFAULT_JS_CONFIG });
  }

  private initializePythonRules(): void {
    this.rules.set('python', [
      {
        name: 'no_trailing_semicolons',
        language: 'python',
        pattern: /;(\s*$)/gm,
        replacement: '$1',
        priority: 1,
      },
      {
        name: 'colon_spacing',
        language: 'python',
        pattern: /(\w)\s*:\s*(\w)/g,
        replacement: '$1: $2',
        priority: 3,
      },
      {
        name: 'operator_spacing',
        language: 'python',
        pattern: /([^<>!=])=([^=])/g,
        replacement: '$1 = $2',
        priority: 5,
      },
    ]);
  }

  private initializeGoRules(): void {
    this.rules.set('go', [
      {
        name: 'remove_consecutive_blanks',
        language: 'go',
        pattern: /\n{3,}/g,
        replacement: '\n\n',
        priority: 1,
      },
    ]);
  }

  private initializeRustRules(): void {
    this.rules.set('rust', [
      {
        name: 'remove_consecutive_blanks',
        language: 'rust',
        pattern: /\n{3,}/g,
        replacement: '\n\n',
        priority: 1,
      },
    ]);
  }

  addRule(language: string, rule: FormattingRule): void {
    const existing = this.rules.get(language) || [];
    existing.push(rule);
    this.rules.set(language, existing);
  }

  removeRule(language: string, ruleName: string): void {
    const existing = this.rules.get(language) || [];
    this.rules.set(language, existing.filter((r) => r.name !== ruleName));
  }

  setLanguageConfig(language: string, config: Partial<LanguageFormattingConfig>): void {
    const existing = this.languageConfigs.get(language) || { ...DEFAULT_JS_CONFIG };
    this.languageConfigs.set(language, { ...existing, ...config });
  }

  getLanguageConfig(language: string): LanguageFormattingConfig {
    return this.languageConfigs.get(language) || { ...DEFAULT_JS_CONFIG };
  }

  detectFromDocument(document: vscode.TextDocument): LanguageFormattingConfig {
    const text = document.getText();
    const config: LanguageFormattingConfig = { ...DEFAULT_JS_CONFIG };

    // Detect semicolons
    const semiLines = (text.match(/;\s*$/gm) || []).length;
    const noSemiLines = (text.match(/[^;{}\s]\s*$/gm) || []).length;
    if (noSemiLines > semiLines * 2) config.semicolons = 'never';

    // Detect quotes
    const singleQuotes = (text.match(/'/g) || []).length;
    const doubleQuotes = (text.match(/"/g) || []).length;
    config.quotes = singleQuotes > doubleQuotes ? 'single' : 'double';

    // Detect trailing commas
    const trailingCommaMatches = text.match(/,\s*[\]})]/gm);
    const trailingCommas = trailingCommaMatches ? trailingCommaMatches.length : 0;
    if (trailingCommas > 5) config.trailingCommas = 'es5';

    return config;
  }

  applyRule(text: string, rule: FormattingRule, context: FormattingContext): string {
    if (context.isInString || context.isInComment) return text;

    if (typeof rule.replacement === 'string') {
      return text.replace(rule.pattern, rule.replacement);
    }
    return text.replace(rule.pattern, (match) =>
      (rule.replacement as (match: string, context: FormattingContext) => string)(match, context)
    );
  }
}
