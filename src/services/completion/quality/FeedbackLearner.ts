import * as vscode from 'vscode';
import { CompletionItem, CompletionContext } from '../CompletionTypes';
import {
  CompletionFeedback,
  UserPreferences,
  PatternStats,
  LanguagePreference,
} from './QualityTypes';

export class FeedbackLearner implements vscode.Disposable {
  private feedbackHistory: CompletionFeedback[] = [];
  private userPreferences: UserPreferences;
  private maxHistorySize: number = 1000;
  private storageKey: string = 'inaCoding.completionFeedback';
  private prefsKey: string = 'inaCoding.completionPrefs';
  private context: vscode.ExtensionContext | null = null;

  constructor(context?: vscode.ExtensionContext) {
    this.userPreferences = {
      userId: 'local',
      acceptedPatterns: [],
      rejectedPatterns: [],
      languagePreferences: new Map(),
      averageAcceptLength: 30,
      preferredCompletionStyle: 'balanced',
    };

    if (context) {
      this.context = context;
      this.loadFromStorage();
    }
  }

  recordAcceptance(
    completion: CompletionItem,
    context: CompletionContext,
    editedText?: string
  ): void {
    const feedback: CompletionFeedback = {
      completionId: completion.id,
      completionText: completion.insertText,
      accepted: true,
      timestamp: Date.now(),
      context: {
        language: context.language,
        filePath: context.filePath,
        prefix: context.cursorContext.linePrefix,
        suffix: context.cursorContext.lineSuffix,
      },
      editedText: editedText || null,
      timeToDecision: 0,
      cursorMovedAfter: false,
    };

    this.feedbackHistory.push(feedback);
    this.updatePatterns(completion.insertText, context.language, true);
    this.updateLanguagePreference(context.language, true, completion.insertText);
    this.pruneOldFeedback(30);
    this.persistToStorage();
  }

  recordRejection(
    completion: CompletionItem,
    context: CompletionContext,
    timeVisible: number
  ): void {
    const feedback: CompletionFeedback = {
      completionId: completion.id,
      completionText: completion.insertText,
      accepted: false,
      timestamp: Date.now(),
      context: {
        language: context.language,
        filePath: context.filePath,
        prefix: context.cursorContext.linePrefix,
        suffix: context.cursorContext.lineSuffix,
      },
      editedText: null,
      timeToDecision: timeVisible,
      cursorMovedAfter: false,
    };

    this.feedbackHistory.push(feedback);
    this.updatePatterns(completion.insertText, context.language, false);
    this.updateLanguagePreference(context.language, false, completion.insertText);
    this.persistToStorage();
  }

  recordIgnored(completion: CompletionItem, context: CompletionContext): void {
    // Ignored completions have less impact than explicit rejections
    this.feedbackHistory.push({
      completionId: completion.id,
      completionText: completion.insertText,
      accepted: false,
      timestamp: Date.now(),
      context: {
        language: context.language,
        filePath: context.filePath,
        prefix: context.cursorContext.linePrefix,
        suffix: context.cursorContext.lineSuffix,
      },
      editedText: null,
      timeToDecision: -1, // -1 indicates ignored
      cursorMovedAfter: false,
    });
  }

  extractPatterns(completion: string, language: string): string[] {
    const patterns: string[] = [];
    const lines = completion.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;

      // Generalize to patterns
      let pattern = trimmed;
      // Replace identifiers with placeholders
      pattern = pattern.replace(/\b[a-z_$][a-zA-Z0-9_$]*\b/g, 'ID');
      // Replace string literals
      pattern = pattern.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, 'STR');
      // Replace numbers
      pattern = pattern.replace(/\b\d+\.?\d*\b/g, 'NUM');

      if (pattern.length >= 5) {
        patterns.push(pattern);
      }
    }

    return [...new Set(patterns)];
  }

  getAcceptedPatterns(language: string, limit: number = 10): PatternStats[] {
    return this.userPreferences.acceptedPatterns
      .filter((p) => p.contexts.includes(language))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getRejectedPatterns(language: string, limit: number = 10): PatternStats[] {
    return this.userPreferences.rejectedPatterns
      .filter((p) => p.contexts.includes(language))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  calculatePatternScore(completion: string, language: string): number {
    const patterns = this.extractPatterns(completion, language);
    let score = 0;

    for (const pattern of patterns) {
      const accepted = this.userPreferences.acceptedPatterns.find((p) => p.pattern === pattern);
      const rejected = this.userPreferences.rejectedPatterns.find((p) => p.pattern === pattern);

      if (accepted) score += 0.1 * accepted.confidence;
      if (rejected) score -= 0.1 * rejected.confidence;
    }

    return Math.max(-1, Math.min(1, score));
  }

  getLanguagePreferences(language: string): LanguagePreference {
    return this.userPreferences.languagePreferences.get(language) || {
      language,
      acceptRate: 0.5,
      avgLength: 30,
      preferredIndentation: 'spaces',
      indentSize: 2,
      semicolons: true,
      trailingCommas: false,
    };
  }

  updateLanguagePreference(language: string, accepted: boolean, completion: string): void {
    const pref = this.getLanguagePreferences(language);
    const total = this.feedbackHistory.filter(
      (f) => f.context.language === language
    ).length;
    const acceptedCount = this.feedbackHistory.filter(
      (f) => f.context.language === language && f.accepted
    ).length;

    pref.acceptRate = total > 0 ? acceptedCount / total : 0.5;

    if (accepted) {
      pref.avgLength = (pref.avgLength * 0.9) + (completion.length * 0.1);
    }

    this.userPreferences.languagePreferences.set(language, pref);
  }

  predictAcceptance(completion: CompletionItem, context: CompletionContext): number {
    const patternScore = this.calculatePatternScore(completion.insertText, context.language);
    const langPref = this.getLanguagePreferences(context.language);

    let prediction = langPref.acceptRate;
    prediction += patternScore * 0.3;

    // Length preference
    const lenDiff = Math.abs(completion.insertText.length - langPref.avgLength);
    if (lenDiff < 20) prediction += 0.05;
    else if (lenDiff > 100) prediction -= 0.1;

    return Math.max(0, Math.min(1, prediction));
  }

  getAcceptanceRate(language?: string): number {
    const relevant = language
      ? this.feedbackHistory.filter((f) => f.context.language === language)
      : this.feedbackHistory;

    if (relevant.length === 0) return 0.5;
    return relevant.filter((f) => f.accepted).length / relevant.length;
  }

  getAverageTimeToDecision(): number {
    const decisions = this.feedbackHistory.filter((f) => f.timeToDecision > 0);
    if (decisions.length === 0) return 0;
    return decisions.reduce((sum, f) => sum + f.timeToDecision, 0) / decisions.length;
  }

  getUserPreferences(): UserPreferences {
    return this.userPreferences;
  }

  clearHistory(): void {
    this.feedbackHistory = [];
    this.userPreferences.acceptedPatterns = [];
    this.userPreferences.rejectedPatterns = [];
    this.userPreferences.languagePreferences.clear();
    this.persistToStorage();
  }

  pruneOldFeedback(maxAgeDays: number): void {
    const cutoff = Date.now() - maxAgeDays * 86400000;
    this.feedbackHistory = this.feedbackHistory.filter((f) => f.timestamp >= cutoff);

    if (this.feedbackHistory.length > this.maxHistorySize) {
      this.feedbackHistory = this.feedbackHistory.slice(-this.maxHistorySize);
    }
  }

  private updatePatterns(completion: string, language: string, accepted: boolean): void {
    const patterns = this.extractPatterns(completion, language);
    const target = accepted
      ? this.userPreferences.acceptedPatterns
      : this.userPreferences.rejectedPatterns;

    for (const pattern of patterns) {
      const existing = target.find((p) => p.pattern === pattern);
      if (existing) {
        existing.count++;
        existing.lastSeen = Date.now();
        existing.confidence = Math.min(1, existing.count / 20);
        if (!existing.contexts.includes(language)) existing.contexts.push(language);
      } else {
        target.push({
          pattern,
          count: 1,
          lastSeen: Date.now(),
          confidence: 0.1,
          contexts: [language],
        });
      }
    }

    // Limit pattern storage
    if (target.length > 200) {
      target.sort((a, b) => b.count - a.count);
      target.length = 200;
    }
  }

  private persistToStorage(): void {
    if (!this.context) return;

    try {
      this.context.globalState.update(this.storageKey,
        this.feedbackHistory.slice(-500)
      );

      const prefsData = {
        ...this.userPreferences,
        languagePreferences: Object.fromEntries(this.userPreferences.languagePreferences),
      };
      this.context.globalState.update(this.prefsKey, prefsData);
    } catch {
      // Storage error - silently continue
    }
  }

  private loadFromStorage(): void {
    if (!this.context) return;

    try {
      const history = this.context.globalState.get<CompletionFeedback[]>(this.storageKey);
      if (history) this.feedbackHistory = history;

      const prefs = this.context.globalState.get<Record<string, unknown>>(this.prefsKey);
      if (prefs) {
        this.userPreferences = {
          ...this.userPreferences,
          acceptedPatterns: (prefs.acceptedPatterns as PatternStats[]) || [],
          rejectedPatterns: (prefs.rejectedPatterns as PatternStats[]) || [],
          averageAcceptLength: (prefs.averageAcceptLength as number) || 30,
          preferredCompletionStyle: (prefs.preferredCompletionStyle as 'balanced') || 'balanced',
        };

        const langPrefs = prefs.languagePreferences as Record<string, LanguagePreference>;
        if (langPrefs) {
          this.userPreferences.languagePreferences = new Map(Object.entries(langPrefs));
        }
      }
    } catch {
      // Storage error - use defaults
    }
  }

  dispose(): void {
    this.persistToStorage();
  }
}
