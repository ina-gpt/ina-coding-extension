import { CompletionItem } from '../CompletionTypes';
import { DeduplicationResult } from './QualityTypes';

export class DuplicateDetector {
  private static instance: DuplicateDetector;
  private similarityThreshold: number = 0.85;

  static getInstance(): DuplicateDetector {
    if (!DuplicateDetector.instance) {
      DuplicateDetector.instance = new DuplicateDetector();
    }
    return DuplicateDetector.instance;
  }

  deduplicate(completions: CompletionItem[]): DeduplicationResult {
    const unique: CompletionItem[] = [];
    const duplicates: Array<{ item: CompletionItem; duplicateOf: string; similarity: number }> = [];

    for (const item of completions) {
      const dupes = this.findDuplicates(item.insertText, unique);
      if (dupes.length > 0) {
        const bestMatch = dupes[0];
        duplicates.push({
          item,
          duplicateOf: bestMatch.item.id,
          similarity: bestMatch.similarity,
        });
      } else {
        unique.push(item);
      }
    }

    return { unique, duplicates };
  }

  findDuplicates(
    completion: string,
    existing: CompletionItem[]
  ): Array<{ item: CompletionItem; similarity: number }> {
    const normalized = this.normalizeCompletion(completion);
    const matches: Array<{ item: CompletionItem; similarity: number }> = [];

    for (const item of existing) {
      const existingNormalized = this.normalizeCompletion(item.insertText);
      const similarity = this.calculateSimilarity(normalized, existingNormalized);

      if (similarity >= this.similarityThreshold) {
        matches.push({ item, similarity });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0;

    const maxLen = Math.max(a.length, b.length);
    if (maxLen > 500) {
      // For long strings, use prefix comparison for speed
      const prefixLen = Math.min(200, a.length, b.length);
      const prefixA = a.slice(0, prefixLen);
      const prefixB = b.slice(0, prefixLen);
      return 1 - this.levenshteinDistance(prefixA, prefixB) / prefixLen;
    }

    const distance = this.levenshteinDistance(a, b);
    return 1 - distance / maxLen;
  }

  normalizeCompletion(completion: string): string {
    return completion
      .replace(/\s+/g, ' ')
      .replace(/;\s*$/, '')
      .trim()
      .toLowerCase();
  }

  areSemanticallySimilar(a: string, b: string, language: string): boolean {
    const normA = this.normalizeCompletion(a);
    const normB = this.normalizeCompletion(b);

    if (normA === normB) return true;

    // Check commutative equivalence: a + b == b + a
    if (['javascript', 'typescript', 'python'].includes(language)) {
      const commOps = ['+', '*', '&&', '||', '&', '|', '==', '==='];
      for (const op of commOps) {
        const partsA = normA.split(` ${op} `);
        const partsB = normB.split(` ${op} `);
        if (partsA.length === 2 && partsB.length === 2) {
          if (partsA[0] === partsB[1] && partsA[1] === partsB[0]) return true;
        }
      }
    }

    return false;
  }

  findLongestCommonSubstring(a: string, b: string): string {
    const m = a.length;
    const n = b.length;
    let maxLen = 0;
    let endIdx = 0;

    // Use rolling array for memory efficiency
    const prev = new Array(n + 1).fill(0);
    const curr = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1] + 1;
          if (curr[j] > maxLen) {
            maxLen = curr[j];
            endIdx = i;
          }
        } else {
          curr[j] = 0;
        }
      }
      prev.splice(0, prev.length, ...curr);
      curr.fill(0);
    }

    return a.slice(endIdx - maxLen, endIdx);
  }

  selectBestFromDuplicates(duplicates: CompletionItem[]): CompletionItem {
    return duplicates.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.05) {
        return b.confidence - a.confidence;
      }
      return a.insertText.length - b.insertText.length;
    })[0];
  }

  setSimilarityThreshold(threshold: number): void {
    this.similarityThreshold = threshold;
  }

  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const temp = dp[j];
        dp[j] = a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
        prev = temp;
      }
    }

    return dp[n];
  }
}
