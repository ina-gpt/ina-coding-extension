import { CompletionItem, CompletionContext } from '../CompletionTypes';
import { QualityScore, UserPreferences } from './QualityTypes';

export class ConfidenceScorer {
  private static instance: ConfidenceScorer;
  private minConfidence: number = 0.3;
  private weights = {
    modelScore: 0.4,
    lengthPenalty: 0.1,
    contextMatch: 0.25,
    patternBonus: 0.1,
    userHistory: 0.15,
  };

  static getInstance(): ConfidenceScorer {
    if (!ConfidenceScorer.instance) {
      ConfidenceScorer.instance = new ConfidenceScorer();
    }
    return ConfidenceScorer.instance;
  }

  calculateScore(
    completion: CompletionItem,
    context: CompletionContext,
    userPrefs?: UserPreferences
  ): QualityScore {
    const confidence = this.calculateModelConfidence(completion);
    const syntax = this.calculateLengthScore(completion.insertText, context);
    const relevance = this.calculateContextMatch(completion.insertText, context);
    const formatting = this.calculatePatternBonus(completion.insertText, context);
    const userPreference = userPrefs
      ? this.calculateUserHistoryScore(completion.insertText, userPrefs)
      : 0.5;

    const overall =
      this.weights.modelScore * confidence +
      this.weights.lengthPenalty * syntax +
      this.weights.contextMatch * relevance +
      this.weights.patternBonus * formatting +
      this.weights.userHistory * userPreference;

    return {
      overall: Math.max(0, Math.min(1, overall)),
      confidence,
      syntax,
      relevance,
      formatting,
      safety: 1.0, // Set by SafetyChecker separately
      userPreference,
    };
  }

  calculateModelConfidence(completion: CompletionItem): number {
    return completion.confidence || 0.5;
  }

  calculateLengthScore(completion: string, context: CompletionContext): number {
    const len = completion.length;
    if (len < 2) return 0.1;
    if (len < 5) return 0.3;
    if (len <= 200) return 0.9;
    if (len <= 500) return 0.7;
    return 0.5;
  }

  calculateContextMatch(completion: string, context: CompletionContext): number {
    let score = 0.5;
    const prefix = context.cursorContext.linePrefix;
    const words = prefix.split(/\s+/).filter(Boolean);

    // Check if completion uses symbols from context
    for (const word of words) {
      if (word.length > 2 && completion.includes(word)) {
        score += 0.05;
      }
    }

    // Check if indentation matches
    if (context.indentation) {
      const completionLines = completion.split('\n');
      if (completionLines.length > 1 && completionLines[1]?.startsWith(context.indentation)) {
        score += 0.1;
      }
    }

    // Check if completion follows prefix pattern
    if (prefix.endsWith('return ') && completion.trim().endsWith(';')) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  calculatePatternBonus(completion: string, context: CompletionContext): number {
    let bonus = 0.5;

    // Bonus for common idioms
    const idioms = [
      /^[\w.]+\(.*\);?$/,  // function call
      /^return\s+/,         // return statement
      /^\w+\s*=\s*/,        // assignment
      /^if\s*\(/,           // if statement
      /^for\s*\(/,          // for loop
      /^const\s+/,          // const declaration
    ];

    const firstLine = completion.split('\n')[0];
    for (const idiom of idioms) {
      if (idiom.test(firstLine.trim())) {
        bonus += 0.1;
        break;
      }
    }

    return Math.min(1, bonus);
  }

  calculateUserHistoryScore(completion: string, userPrefs: UserPreferences): number {
    let score = 0.5;

    // Boost accepted patterns
    for (const pattern of userPrefs.acceptedPatterns) {
      if (completion.includes(pattern.pattern) || new RegExp(pattern.pattern).test(completion)) {
        score += 0.1 * pattern.confidence;
      }
    }

    // Penalize rejected patterns
    for (const pattern of userPrefs.rejectedPatterns) {
      if (completion.includes(pattern.pattern) || new RegExp(pattern.pattern).test(completion)) {
        score -= 0.1 * pattern.confidence;
      }
    }

    // Adjust for preferred length
    const lenDiff = Math.abs(completion.length - userPrefs.averageAcceptLength);
    if (lenDiff < 20) score += 0.05;
    else if (lenDiff > 100) score -= 0.05;

    return Math.max(0, Math.min(1, score));
  }

  filterByConfidence(
    completions: CompletionItem[],
    minConfidence?: number
  ): {
    passed: CompletionItem[];
    filtered: Array<{ item: CompletionItem; score: number }>;
  } {
    const threshold = minConfidence ?? this.minConfidence;
    const passed: CompletionItem[] = [];
    const filtered: Array<{ item: CompletionItem; score: number }> = [];

    for (const item of completions) {
      const score = item.confidence || 0;
      if (score >= threshold) {
        passed.push(item);
      } else {
        filtered.push({ item, score });
      }
    }

    return { passed, filtered };
  }

  adjustConfidenceThreshold(acceptRate: number): void {
    if (acceptRate < 0.2) {
      this.minConfidence = Math.max(0.1, this.minConfidence - 0.05);
    } else if (acceptRate > 0.8) {
      this.minConfidence = Math.min(0.8, this.minConfidence + 0.05);
    }
  }

  setMinConfidence(confidence: number): void {
    this.minConfidence = confidence;
  }

  setWeights(weights: Partial<typeof this.weights>): void {
    Object.assign(this.weights, weights);
  }

  getScoreBreakdown(completion: CompletionItem, context: CompletionContext): QualityScore {
    return this.calculateScore(completion, context);
  }
}
