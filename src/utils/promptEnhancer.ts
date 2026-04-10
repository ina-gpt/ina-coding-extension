/**
 * Prompt Enhancer Utility
 *
 * Enhances user prompts with context information.
 */

import { InlineEditContext } from '../services/InlineEditService';

export function enhancePrompt(userPrompt: string, context: InlineEditContext): string {
  const parts: string[] = [];

  if (context.language && context.language !== 'plaintext') {
    parts.push(`In ${context.language}`);
  }

  if (context.symbols.length > 0) {
    parts.push(`within ${context.symbols[0]}`);
  }

  if (parts.length > 0) {
    return `${parts.join(', ')}: ${userPrompt}`;
  }

  return userPrompt;
}

export function detectPromptIntent(
  prompt: string
): 'refactor' | 'fix' | 'explain' | 'generate' | 'optimize' | 'document' | 'test' | 'other' {
  const lower = prompt.toLowerCase();

  if (/refactor|clean|improve|simplify|restructure|rename|extract|inline/.test(lower)) return 'refactor';
  if (/fix|bug|error|issue|problem|broken|incorrect|wrong/.test(lower)) return 'fix';
  if (/explain|what|how|why|describe|understand/.test(lower)) return 'explain';
  if (/add|create|generate|implement|write|build|make|insert|new/.test(lower)) return 'generate';
  if (/optimize|performance|faster|efficient|speed|reduce|minimize/.test(lower)) return 'optimize';
  if (/comment|document|jsdoc|docstring|annotate/.test(lower)) return 'document';
  if (/test|spec|unit\s*test|coverage|assertion/.test(lower)) return 'test';

  return 'other';
}

export function suggestPromptImprovements(prompt: string): string[] {
  const suggestions: string[] = [];

  if (prompt.length < 10) {
    suggestions.push('Be more specific about what changes you want');
  }

  if (!/\b(should|must|need|want|make|add|remove|change|convert|fix)\b/i.test(prompt)) {
    suggestions.push('Use action words like "add", "fix", "convert", "remove"');
  }

  if (prompt.length > 200) {
    suggestions.push('Consider breaking into multiple smaller edits');
  }

  return suggestions;
}

export function truncatePrompt(prompt: string, maxLength: number): string {
  if (prompt.length <= maxLength) return prompt;

  // Try to truncate at a sentence boundary
  const truncated = prompt.substring(0, maxLength);
  const lastSentence = truncated.lastIndexOf('. ');
  if (lastSentence > maxLength * 0.6) {
    return truncated.substring(0, lastSentence + 1);
  }

  // Truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}
