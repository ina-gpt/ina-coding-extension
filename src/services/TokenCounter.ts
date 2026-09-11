/**
 * Token Counter Service
 * Estimates token count using tiktoken-like approximation.
 * Used for context window management and budget allocation.
 */

import { contextWindowFor, defaultModel } from '../config/model-registry';

// ============ Types ============

export interface TokenCount {
  tokens: number;
  characters: number;
  words: number;
  lines: number;
}

export interface TokenBudget {
  total: number;
  used: number;
  remaining: number;
  allocations: Map<string, number>;
}

export interface ContentWithTokens {
  content: string;
  tokens: number;
  truncated: boolean;
  originalTokens?: number;
}

// ============ Constants ============

const CHARS_PER_TOKEN = {
  code: 3.5,
  prose: 4.0,
  mixed: 3.75,
  json: 3.0,
  markdown: 4.2,
};

/**
 * Context windows come from the model registry.
 *
 * This used to be a second table keyed by upstream model id, with the INA
 * display names bolted on beside them — two naming systems in one Record, both
 * of which had to be maintained by hand whenever a model changed. An id in
 * neither half silently got `default`, so a typo in a settings value was
 * indistinguishable from a supported model.
 */

// ============ Token Counter Class ============

export class TokenCounter {
  private model: string;
  private contextLimit: number;

  constructor(model: string = defaultModel('general').id) {
    this.model = model;
    this.contextLimit = contextWindowFor(model);
  }

  // ============ Basic Counting ============

  count(text: string, contentType: keyof typeof CHARS_PER_TOKEN = 'mixed'): TokenCount {
    if (!text) {
      return { tokens: 0, characters: 0, words: 0, lines: 0 };
    }

    const characters = text.length;
    const words = text.split(/\s+/).filter(Boolean).length;
    const lines = text.split('\n').length;

    const charsPerToken = CHARS_PER_TOKEN[contentType];
    let tokens = Math.ceil(characters / charsPerToken);

    // Adjust for special patterns
    const codeBlocks = (text.match(/```/g) || []).length;
    tokens += Math.floor(codeBlocks / 2) * 4;

    const xmlTags = (text.match(/<\/?[\w-]+[^>]*>/g) || []).length;
    tokens += xmlTags * 2;

    return { tokens, characters, words, lines };
  }

  quickEstimate(text: string): number {
    if (!text) { return 0; }
    return Math.ceil(text.length / 4);
  }

  detectContentType(text: string): keyof typeof CHARS_PER_TOKEN {
    const codePatterns = [/^import\s+/m, /^export\s+/m, /^(const|let|var|function|class)\s+/m, /^def\s+/m, /^fn\s+/m];
    const codeScore = codePatterns.reduce((s, p) => s + (p.test(text) ? 1 : 0), 0);
    if (codeScore >= 2) { return 'code'; }

    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try { JSON.parse(text); return 'json'; } catch { /* not json */ }
    }

    if (/^#{1,6}\s/m.test(text)) { return 'markdown'; }

    return 'prose';
  }

  // ============ Budget Management ============

  createBudget(reservedForResponse: number = 4096): TokenBudget {
    const total = this.contextLimit - reservedForResponse;
    return { total, used: 0, remaining: total, allocations: new Map() };
  }

  allocate(budget: TokenBudget, key: string, tokens: number): boolean {
    if (tokens > budget.remaining) { return false; }
    budget.allocations.set(key, (budget.allocations.get(key) || 0) + tokens);
    budget.used += tokens;
    budget.remaining -= tokens;
    return true;
  }

  release(budget: TokenBudget, key: string, tokens?: number): void {
    const allocated = budget.allocations.get(key) || 0;
    const toRelease = tokens ?? allocated;
    if (toRelease > 0) {
      budget.allocations.set(key, allocated - toRelease);
      budget.used -= toRelease;
      budget.remaining += toRelease;
    }
  }

  // ============ Content Truncation ============

  truncateToFit(
    content: string,
    maxTokens: number,
    options: {
      strategy?: 'end' | 'middle' | 'smart';
      ellipsis?: string;
    } = {}
  ): ContentWithTokens {
    const { strategy = 'smart', ellipsis = '\n\n... [content truncated] ...\n\n' } = options;

    const contentType = this.detectContentType(content);
    const currentCount = this.count(content, contentType);

    if (currentCount.tokens <= maxTokens) {
      return { content, tokens: currentCount.tokens, truncated: false };
    }

    const ellipsisTokens = this.quickEstimate(ellipsis);
    const availableTokens = maxTokens - ellipsisTokens;
    const charsPerToken = CHARS_PER_TOKEN[contentType];

    let result: string;

    switch (strategy) {
      case 'end': {
        const cutChars = Math.floor(availableTokens * charsPerToken);
        let cutPoint = Math.min(content.length, cutChars);
        // Snap to line boundary
        const nextNewline = content.indexOf('\n', cutPoint);
        if (nextNewline !== -1 && nextNewline < cutPoint + 100) { cutPoint = nextNewline; }
        result = content.substring(0, cutPoint) + '\n... [truncated]';
        break;
      }

      case 'middle': {
        const totalChars = Math.floor(availableTokens * charsPerToken);
        const startChars = Math.floor(totalChars * 0.4);
        const endChars = Math.floor(totalChars * 0.3);
        result = content.substring(0, startChars) + ellipsis + content.substring(content.length - endChars);
        break;
      }

      case 'smart':
      default: {
        result = this.smartTruncate(content, availableTokens, ellipsis, contentType);
        break;
      }
    }

    const resultCount = this.count(result, contentType);
    return { content: result, tokens: resultCount.tokens, truncated: true, originalTokens: currentCount.tokens };
  }

  private smartTruncate(
    content: string,
    maxTokens: number,
    ellipsis: string,
    contentType: keyof typeof CHARS_PER_TOKEN
  ): string {
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Score each line by importance
    const scored = lines.map((line, index) => ({
      line,
      index,
      priority: this.getLinePriority(line, index, totalLines, contentType),
    }));

    // Sort by priority (highest first)
    scored.sort((a, b) => b.priority - a.priority);

    // Add lines until we hit the budget
    const included = new Set<number>();
    let currentTokens = 0;

    for (const { line, index } of scored) {
      const lineTokens = this.quickEstimate(line + '\n');
      if (currentTokens + lineTokens > maxTokens) { break; }
      included.add(index);
      currentTokens += lineTokens;
    }

    // Rebuild with truncation markers
    const result: string[] = [];
    let inGap = false;

    for (let i = 0; i < totalLines; i++) {
      if (included.has(i)) {
        if (inGap) {
          result.push(ellipsis.trim());
          inGap = false;
        }
        result.push(lines[i]);
      } else {
        inGap = true;
      }
    }

    return result.join('\n');
  }

  private getLinePriority(line: string, index: number, totalLines: number, contentType: keyof typeof CHARS_PER_TOKEN): number {
    let priority = 50;

    // Position-based
    if (index < 10) { priority += 30; }
    if (index >= totalLines - 5) { priority += 20; }

    // Content-based for code
    if (contentType === 'code') {
      if (/^(import|export|from|require)/.test(line)) { priority += 25; }
      if (/^(function|class|interface|type|const|let|var|def|fn|pub)/.test(line.trim())) { priority += 20; }
      if (/^(return|throw)/.test(line.trim())) { priority += 15; }
      if (/^\s*\/\//.test(line) || /^\s*#/.test(line)) { priority -= 10; }
      if (/^\s*$/.test(line)) { priority -= 20; }
    }

    return priority;
  }

  // ============ Utilities ============

  getContextLimit(): number { return this.contextLimit; }

  setModel(model: string): void {
    this.model = model;
    this.contextLimit = contextWindowFor(model);
  }

  fitsWithin(content: string, maxTokens: number): boolean {
    return this.quickEstimate(content) <= maxTokens;
  }

  formatCount(count: TokenCount): string {
    return `${count.tokens.toLocaleString()} tokens (${count.characters.toLocaleString()} chars, ${count.lines} lines)`;
  }
}

// ============ Singleton Export ============

export const tokenCounter = new TokenCounter();
