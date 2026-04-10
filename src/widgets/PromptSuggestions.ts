/**
 * Prompt Suggestions
 *
 * Smart prompt suggestions based on code analysis.
 */

import { InlineEditContext } from '../services/InlineEditService';
import { QuickAction } from './InlineEditInputWidget';

// ============ Types ============

export interface CodeAnalysis {
  hasComments: boolean;
  hasTypes: boolean;
  hasErrorHandling: boolean;
  complexity: number;
  lineCount: number;
  patterns: string[];
}

// ============ Prompt Suggestions ============

export class PromptSuggestions {

  // ============ Selection-Based Suggestions ============

  getSuggestionsForSelection(context: InlineEditContext): string[] {
    const suggestions: string[] = [];
    const analysis = this.analyzeCode(context.content, context.language);

    if (!analysis.hasComments && analysis.lineCount > 5) {
      suggestions.push('Add JSDoc documentation');
    }

    if (!analysis.hasErrorHandling && analysis.patterns.includes('async')) {
      suggestions.push('Add error handling with try-catch');
    }

    if (analysis.complexity > 5) {
      suggestions.push('Simplify this logic');
    }

    if (analysis.patterns.includes('magic_numbers')) {
      suggestions.push('Extract magic numbers into named constants');
    }

    if (analysis.lineCount > 50) {
      suggestions.push('Break into smaller functions');
    }

    if (!analysis.hasTypes && ['typescript', 'typescriptreact'].includes(context.language)) {
      suggestions.push('Add TypeScript type annotations');
    }

    if (analysis.patterns.includes('callback') && ['typescript', 'javascript'].includes(context.language)) {
      suggestions.push('Convert callbacks to async/await');
    }

    if (analysis.patterns.includes('var')) {
      suggestions.push('Replace var with const/let');
    }

    return suggestions;
  }

  // ============ Language-Based Suggestions ============

  getSuggestionsForLanguage(language: string): string[] {
    const langSuggestions: Record<string, string[]> = {
      typescript: ['Add strict types', 'Use interface instead of type', 'Add null checks'],
      javascript: ['Convert to TypeScript', 'Add JSDoc types', 'Use modern syntax'],
      typescriptreact: ['Convert to functional component', 'Add React.memo', 'Extract custom hook'],
      javascriptreact: ['Convert to functional component', 'Add PropTypes', 'Use hooks'],
      python: ['Add type hints', 'Convert to async', 'Add docstring'],
      rust: ['Add error handling with Result', 'Use pattern matching', 'Add lifetime annotations'],
      go: ['Add error handling', 'Add godoc comments', 'Use goroutines'],
      java: ['Add Javadoc', 'Use streams API', 'Add null checks'],
    };

    return langSuggestions[language] || [];
  }

  // ============ Contextual Suggestions ============

  getContextualSuggestions(
    context: InlineEditContext,
    history: Array<{ prompt: string; editType: string }>
  ): QuickAction[] {
    const selectionSuggestions = this.getSuggestionsForSelection(context);
    const langSuggestions = this.getSuggestionsForLanguage(context.language);

    // Combine and deduplicate
    const allSuggestions = [...selectionSuggestions, ...langSuggestions];
    const unique = [...new Set(allSuggestions)];

    return unique.slice(0, 5).map(suggestion => ({
      label: `$(lightbulb) ${suggestion}`,
      description: 'Suggested',
      icon: 'lightbulb',
      action: 'suggestion',
      prompt: suggestion,
    }));
  }

  // ============ Code Analysis ============

  analyzeCode(content: string, language: string): CodeAnalysis {
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Check for comments
    const hasComments = /\/\/|\/\*|#\s|"""|'''|\/\*\*/.test(content);

    // Check for types (TypeScript-specific)
    const hasTypes = /:\s*(string|number|boolean|any|void|Promise|Array|Record|Map|Set)\b/.test(content)
      || /interface\s|type\s/.test(content);

    // Check for error handling
    const hasErrorHandling = /try\s*\{|\.catch\(|except\s|rescue\s/.test(content);

    // Estimate complexity (simple heuristic)
    let complexity = 0;
    const complexityPatterns = [/if\s*\(/, /else\s/, /for\s*\(/, /while\s*\(/, /switch\s*\(/, /\?\s*.*:/, /&&|\|\|/];
    for (const pattern of complexityPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) complexity += matches.length;
    }

    // Detect patterns
    const patterns: string[] = [];
    if (/async\s/.test(content)) patterns.push('async');
    if (/callback|cb\)/.test(content)) patterns.push('callback');
    if (/\b\d{2,}\b/.test(content) && !/line|col|row|index/.test(content)) patterns.push('magic_numbers');
    if (/\bvar\s/.test(content)) patterns.push('var');
    if (/console\.(log|warn|error)/.test(content)) patterns.push('console_log');
    if (/TODO|FIXME|HACK|XXX/.test(content)) patterns.push('todo');

    return { hasComments, hasTypes, hasErrorHandling, complexity, lineCount, patterns };
  }
}
