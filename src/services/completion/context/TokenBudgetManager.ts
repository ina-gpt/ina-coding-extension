import { TokenBudget, DEFAULT_TOKEN_BUDGET } from './ContextTypes';

export class TokenBudgetManager {
  private static instance: TokenBudgetManager;
  private defaultBudget: TokenBudget = { ...DEFAULT_TOKEN_BUDGET };
  private customBudgets: Map<string, Partial<TokenBudget>> = new Map();

  static getInstance(): TokenBudgetManager {
    if (!TokenBudgetManager.instance) {
      TokenBudgetManager.instance = new TokenBudgetManager();
    }
    return TokenBudgetManager.instance;
  }

  createBudget(total?: number): TokenBudget {
    if (!total || total === this.defaultBudget.total) {
      return { ...this.defaultBudget, remaining: this.defaultBudget.total };
    }

    // Scale allocations proportionally
    const ratio = total / this.defaultBudget.total;
    return {
      total,
      prefix: Math.floor(this.defaultBudget.prefix * ratio),
      suffix: Math.floor(this.defaultBudget.suffix * ratio),
      imports: Math.floor(this.defaultBudget.imports * ratio),
      relatedFiles: Math.floor(this.defaultBudget.relatedFiles * ratio),
      recentEdits: Math.floor(this.defaultBudget.recentEdits * ratio),
      remaining: total,
    };
  }

  allocate(
    budget: TokenBudget,
    section: keyof TokenBudget,
    tokensNeeded: number
  ): { allocated: number; remaining: number } {
    if (section === 'total' || section === 'remaining') {
      return { allocated: 0, remaining: budget.remaining };
    }

    const available = budget[section] as number;
    const allocated = Math.min(tokensNeeded, available, budget.remaining);

    budget[section] = (budget[section] as number) - allocated;
    budget.remaining -= allocated;

    return { allocated, remaining: budget.remaining };
  }

  reallocate(
    budget: TokenBudget,
    fromSection: keyof TokenBudget,
    toSection: keyof TokenBudget,
    amount: number
  ): boolean {
    if (
      fromSection === 'total' || fromSection === 'remaining' ||
      toSection === 'total' || toSection === 'remaining'
    ) {
      return false;
    }

    const available = budget[fromSection] as number;
    const transfer = Math.min(amount, available);
    if (transfer <= 0) return false;

    (budget[fromSection] as number) -= transfer;
    (budget[toSection] as number) += transfer;

    return true;
  }

  calculateOptimalAllocation(
    contextSizes: {
      prefix: number;
      suffix: number;
      imports: number;
      relatedFiles: number;
      recentEdits: number;
    },
    totalBudget: number
  ): TokenBudget {
    // Priority: prefix > suffix > relatedFiles > imports > recentEdits
    const priorities = [
      { key: 'prefix' as const, size: contextSizes.prefix, minPct: 0.3, maxPct: 0.6 },
      { key: 'suffix' as const, size: contextSizes.suffix, minPct: 0.1, maxPct: 0.25 },
      { key: 'relatedFiles' as const, size: contextSizes.relatedFiles, minPct: 0.05, maxPct: 0.25 },
      { key: 'imports' as const, size: contextSizes.imports, minPct: 0.03, maxPct: 0.1 },
      { key: 'recentEdits' as const, size: contextSizes.recentEdits, minPct: 0.02, maxPct: 0.1 },
    ];

    const budget = this.createBudget(totalBudget);

    // First pass: allocate minimums
    let allocated = 0;
    for (const p of priorities) {
      const minAlloc = Math.floor(totalBudget * p.minPct);
      const needed = Math.min(p.size, Math.floor(totalBudget * p.maxPct));
      const alloc = Math.max(minAlloc, Math.min(needed, totalBudget - allocated));
      (budget[p.key] as number) = alloc;
      allocated += alloc;
    }

    // Second pass: distribute remaining to sections that need it
    let remaining = totalBudget - allocated;
    for (const p of priorities) {
      if (remaining <= 0) break;
      const current = budget[p.key] as number;
      const max = Math.floor(totalBudget * p.maxPct);
      const needed = Math.min(p.size, max) - current;
      if (needed > 0) {
        const extra = Math.min(needed, remaining);
        (budget[p.key] as number) += extra;
        remaining -= extra;
      }
    }

    budget.remaining = remaining;
    return budget;
  }

  setLanguageOverride(language: string, overrides: Partial<TokenBudget>): void {
    this.customBudgets.set(language, overrides);
  }

  getLanguageOverride(language: string): Partial<TokenBudget> | null {
    return this.customBudgets.get(language) || null;
  }

  estimateTokens(text: string): number {
    // ~4 chars per token for code
    return Math.ceil(text.length / 4);
  }

  truncateToFit(
    text: string,
    maxTokens: number,
    strategy: 'end' | 'middle' | 'smart' = 'end'
  ): string {
    const currentTokens = this.estimateTokens(text);
    if (currentTokens <= maxTokens) return text;

    const maxChars = maxTokens * 4;

    switch (strategy) {
      case 'end':
        return text.slice(0, maxChars);

      case 'middle': {
        const half = Math.floor(maxChars / 2);
        return text.slice(0, half) + '\n// ...\n' + text.slice(-half);
      }

      case 'smart': {
        const lines = text.split('\n');

        // Preserve imports (first section)
        const importEnd = lines.findIndex(
          (l, i) => i > 0 && l.trim() !== '' && !l.trim().startsWith('import') && !l.trim().startsWith('from')
        );

        const importSection = importEnd > 0 ? lines.slice(0, importEnd).join('\n') : '';
        const importTokens = this.estimateTokens(importSection);

        // Fill rest with end of text
        const remainingBudget = maxTokens - importTokens;
        const restText = lines.slice(importEnd).join('\n');
        const restTruncated = restText.slice(-(remainingBudget * 4));

        return importSection + '\n// ...\n' + restTruncated;
      }
    }
  }

  getBudgetStats(
    budget: TokenBudget
  ): { total: number; used: number; usedPercent: number; bySection: Map<string, number> } {
    const used = budget.total - budget.remaining;
    const bySection = new Map<string, number>();
    bySection.set('prefix', budget.prefix);
    bySection.set('suffix', budget.suffix);
    bySection.set('imports', budget.imports);
    bySection.set('relatedFiles', budget.relatedFiles);
    bySection.set('recentEdits', budget.recentEdits);

    return {
      total: budget.total,
      used,
      usedPercent: budget.total > 0 ? (used / budget.total) * 100 : 0,
      bySection,
    };
  }

  resetBudget(budget: TokenBudget): void {
    const fresh = this.createBudget(budget.total);
    Object.assign(budget, fresh);
  }
}
