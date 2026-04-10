/**
 * Phase 17.5 — Intelligent Context Window Manager
 * Priority-based budget allocation for context sources.
 */
import { ContextSource, ContextBudget, ContextWindowConfig, ContextVisualizationData, SOURCE_PRIORITIES, SEGMENT_COLORS } from './ContextBudgetTypes';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';

export class ContextWindowManager {
  private static instance: ContextWindowManager;
  private config: ContextWindowConfig;
  private lastBudget: ContextBudget | null = null;

  private constructor() {
    this.config = {
      modelContextWindow: ConfigManager.get<number>('context.modelContextWindow', 32768),
      responseReserve: ConfigManager.get<number>('context.responseReserve', 4096),
      systemPromptReserve: 2000,
      userMessageReserve: 1000,
    };
  }

  static getInstance(): ContextWindowManager {
    if (!ContextWindowManager.instance) ContextWindowManager.instance = new ContextWindowManager();
    return ContextWindowManager.instance;
  }

  allocate(requestedSources: { name: string; content: string }[]): ContextBudget {
    const totalBudget = this.config.modelContextWindow - this.config.systemPromptReserve - this.config.userMessageReserve - this.config.responseReserve;
    const allocated = new Map<string, number>();
    const used = new Map<string, number>();
    let remaining = totalBudget;

    const sources = requestedSources
      .map(s => {
        const prio = SOURCE_PRIORITIES[s.name] || { priority: 20, min: 0, max: 2000 };
        return { ...s, ...prio, tokenCount: this.estimateTokens(s.content) };
      })
      .sort((a, b) => a.priority - b.priority);

    // First pass: allocate minimums
    for (const src of sources) {
      const minAlloc = Math.min(src.min, src.tokenCount, remaining);
      allocated.set(src.name, minAlloc);
      remaining -= minAlloc;
    }

    // Second pass: distribute remaining
    for (const src of sources) {
      const current = allocated.get(src.name) || 0;
      const wantsMore = Math.min(src.tokenCount - current, src.max - current, remaining);
      if (wantsMore > 0) {
        allocated.set(src.name, current + wantsMore);
        remaining -= wantsMore;
      }
    }

    // Record used
    for (const src of sources) {
      const alloc = allocated.get(src.name) || 0;
      used.set(src.name, Math.min(src.tokenCount, alloc));
    }

    this.lastBudget = { totalBudget, allocated, used, remaining: Math.max(0, remaining), overflowed: remaining < 0 };
    return this.lastBudget;
  }

  buildContext(sources: { name: string; content: string }[]): { contextBlock: string; budget: ContextBudget } {
    const budget = this.allocate(sources);
    const blocks: string[] = [];
    for (const src of sources) {
      const alloc = budget.allocated.get(src.name) || 0;
      if (alloc <= 0 || !src.content) continue;
      const truncated = this.truncateToTokens(src.content, alloc);
      blocks.push(`<context source="${src.name}" tokens="${this.estimateTokens(truncated)}">\n${truncated}\n</context>`);
    }
    return { contextBlock: blocks.join('\n\n'), budget };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getVisualizationData(): ContextVisualizationData {
    if (!this.lastBudget) return { segments: [], totalUsed: 0, totalBudget: 0, utilizationPercent: 0, warnings: [] };
    const segments: ContextVisualizationData['segments'] = [];
    let totalUsed = 0;
    for (const [name, tokens] of this.lastBudget.used) {
      if (tokens <= 0) continue;
      totalUsed += tokens;
      segments.push({ name, tokens, percentage: 0, color: SEGMENT_COLORS[name] || SEGMENT_COLORS.DEFAULT });
    }
    for (const seg of segments) seg.percentage = Math.round((seg.tokens / Math.max(totalUsed, 1)) * 100);
    segments.sort((a, b) => b.tokens - a.tokens);
    const warnings: string[] = [];
    const util = Math.round((totalUsed / this.lastBudget.totalBudget) * 100);
    if (util > 90) warnings.push('Context window nearly full — some sources may be truncated');
    if (this.lastBudget.overflowed) warnings.push('Context overflowed — lowest priority sources were dropped');
    return { segments, totalUsed, totalBudget: this.lastBudget.totalBudget, utilizationPercent: util, warnings };
  }

  truncateToTokens(content: string, maxTokens: number, strategy: 'end' | 'middle' | 'smart' = 'end'): string {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) return content;
    if (strategy === 'middle') {
      const half = Math.floor(maxChars / 2);
      return content.substring(0, half) + '\n\n... [truncated] ...\n\n' + content.substring(content.length - half);
    }
    return content.substring(0, maxChars) + '\n... [truncated]';
  }

  suggestOptimizations(): string[] {
    const suggestions: string[] = [];
    if (!this.lastBudget) return suggestions;
    const activeTokens = this.lastBudget.used.get('ACTIVE_FILE') || 0;
    if (activeTokens > this.lastBudget.totalBudget * 0.4) {
      suggestions.push('Active file using >40% of budget — consider focusing on relevant functions');
    }
    return suggestions;
  }
}
