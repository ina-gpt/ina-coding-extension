/**
 * Inline Edit History
 *
 * Track recent inline edit prompts for quick reuse.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface HistoryEntry {
  prompt: string;
  timestamp: number;
  language: string;
  accepted: boolean;
  editType: 'refactor' | 'fix' | 'explain' | 'generate' | 'other';
}

// ============ Constants ============

const STORAGE_KEY = 'inaCoding.inlineEditHistory';
const MAX_ENTRIES = 100;

// ============ Inline Edit History ============

export class InlineEditHistory {
  private static instance: InlineEditHistory;
  private entries: HistoryEntry[] = [];
  private context: vscode.ExtensionContext | null = null;

  private constructor() {}

  static getInstance(): InlineEditHistory {
    if (!InlineEditHistory.instance) {
      InlineEditHistory.instance = new InlineEditHistory();
    }
    return InlineEditHistory.instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.entries = context.globalState.get<HistoryEntry[]>(STORAGE_KEY, []);
  }

  // ============ CRUD ============

  addEntry(entry: Omit<HistoryEntry, 'timestamp'>): void {
    this.entries.push({
      ...entry,
      timestamp: Date.now(),
    });

    // Prune oldest
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    this.save();
  }

  getRecent(limit: number = 10): HistoryEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  getByLanguage(language: string, limit: number = 5): HistoryEntry[] {
    return this.entries
      .filter(e => e.language === language)
      .slice(-limit)
      .reverse();
  }

  getMostUsed(limit: number = 5): Array<{ prompt: string; count: number }> {
    const counts = new Map<string, number>();
    for (const entry of this.entries) {
      const key = entry.prompt.toLowerCase().trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([prompt, count]) => ({ prompt, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  search(query: string): HistoryEntry[] {
    const lower = query.toLowerCase();
    return this.entries
      .filter(e => e.prompt.toLowerCase().includes(lower))
      .reverse();
  }

  clear(): void {
    this.entries = [];
    this.save();
  }

  // ============ Enhanced Features ============

  getFrequentPrompts(limit: number = 5): Array<{ prompt: string; count: number; lastUsed: number }> {
    const groups = new Map<string, { count: number; lastUsed: number; prompt: string }>();

    for (const entry of this.entries) {
      const key = entry.prompt.toLowerCase().trim();
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        existing.lastUsed = Math.max(existing.lastUsed, entry.timestamp);
      } else {
        groups.set(key, { count: 1, lastUsed: entry.timestamp, prompt: entry.prompt });
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getSuggestedFromHistory(context: { language: string; filePath: string }): HistoryEntry[] {
    return this.entries
      .filter(e => e.language === context.language)
      .filter(e => e.accepted)
      .slice(-5)
      .reverse();
  }

  markAsAccepted(prompt: string): void {
    const entry = this.entries.find(e => e.prompt === prompt && !e.accepted);
    if (entry) { entry.accepted = true; this.save(); }
  }

  markAsRejected(prompt: string): void {
    const entry = this.entries.find(e => e.prompt === prompt);
    if (entry) { entry.accepted = false; this.save(); }
  }

  getStats(): { totalEntries: number; acceptRate: number; topCategories: Array<{ category: string; count: number }> } {
    const accepted = this.entries.filter(e => e.accepted).length;
    const catCounts = new Map<string, number>();
    for (const e of this.entries) {
      catCounts.set(e.editType, (catCounts.get(e.editType) || 0) + 1);
    }

    return {
      totalEntries: this.entries.length,
      acceptRate: this.entries.length > 0 ? accepted / this.entries.length : 0,
      topCategories: Array.from(catCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  // ============ Categorization ============

  static categorizePrompt(prompt: string): HistoryEntry['editType'] {
    const lower = prompt.toLowerCase();
    if (/refactor|rename|restructure|clean\s*up|simplify|extract|inline|move/.test(lower)) return 'refactor';
    if (/fix|bug|error|issue|correct|repair|patch|resolve/.test(lower)) return 'fix';
    if (/explain|what|why|how|describe|comment|document/.test(lower)) return 'explain';
    if (/add|create|generate|implement|write|build|make|insert/.test(lower)) return 'generate';
    return 'other';
  }

  // ============ Persistence ============

  private save(): void {
    if (this.context) {
      this.context.globalState.update(STORAGE_KEY, this.entries);
    }
  }
}
