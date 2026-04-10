import { CompletionContext } from '../CompletionTypes';

export class RepetitionDetector {
  private static instance: RepetitionDetector;
  private maxRepetitionRatio: number = 0.4;
  private minPatternLength: number = 3;

  static getInstance(): RepetitionDetector {
    if (!RepetitionDetector.instance) {
      RepetitionDetector.instance = new RepetitionDetector();
    }
    return RepetitionDetector.instance;
  }

  detectRepetition(completion: string): {
    isRepetitive: boolean;
    pattern: string | null;
    repetitions: number;
    ratio: number;
  } {
    const result = this.findRepeatingPattern(completion);
    if (!result) {
      return { isRepetitive: false, pattern: null, repetitions: 0, ratio: 0 };
    }

    const ratio = (result.count * result.pattern.length) / completion.length;
    return {
      isRepetitive: ratio > this.maxRepetitionRatio,
      pattern: result.pattern,
      repetitions: result.count,
      ratio,
    };
  }

  findRepeatingPattern(
    text: string
  ): { pattern: string; count: number; positions: number[] } | null {
    if (text.length < this.minPatternLength * 2) return null;

    // Try pattern lengths from minPatternLength to half the text
    for (let len = this.minPatternLength; len <= Math.floor(text.length / 2); len++) {
      const pattern = text.slice(0, len);
      let count = 0;
      const positions: number[] = [];

      for (let i = 0; i <= text.length - len; i += len) {
        if (text.slice(i, i + len) === pattern) {
          count++;
          positions.push(i);
        } else {
          break;
        }
      }

      if (count >= 3) {
        return { pattern, count, positions };
      }
    }

    // Check for line-level repetition
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length >= 3) {
      const lineCounts = new Map<string, number>();
      for (const line of lines) {
        const normalized = line.trim();
        lineCounts.set(normalized, (lineCounts.get(normalized) || 0) + 1);
      }

      for (const [line, count] of lineCounts) {
        if (count >= 3 && line.length >= this.minPatternLength) {
          return {
            pattern: line,
            count,
            positions: lines.reduce<number[]>((acc, l, i) => {
              if (l.trim() === line) acc.push(i);
              return acc;
            }, []),
          };
        }
      }
    }

    return null;
  }

  isLoopingPattern(completion: string, context: CompletionContext): boolean {
    // Common model looping patterns
    const loopPatterns = [
      /(.{5,}?)\1{2,}/,  // Same chunk repeated 3+ times
      /(\w+\s*,\s*)\1{4,}/,  // Repeated list items
      /(\w+\.\w+\(\);\s*)\1{2,}/,  // Repeated method calls
    ];

    return loopPatterns.some((p) => p.test(completion));
  }

  detectSequentialRepetition(completion: string): {
    hasRepetition: boolean;
    sequences: Array<{ text: string; count: number }>;
  } {
    const sequences: Array<{ text: string; count: number }> = [];
    const lines = completion.split('\n');

    let currentLine = '';
    let currentCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === currentLine && trimmed.length > 0) {
        currentCount++;
      } else {
        if (currentCount >= 3) {
          sequences.push({ text: currentLine, count: currentCount });
        }
        currentLine = trimmed;
        currentCount = 1;
      }
    }

    if (currentCount >= 3) {
      sequences.push({ text: currentLine, count: currentCount });
    }

    return { hasRepetition: sequences.length > 0, sequences };
  }

  detectStructuralRepetition(completion: string, language: string): boolean {
    const lines = completion.split('\n');
    if (lines.length < 6) return false;

    // Check for repeated function/block structures
    const structureStarts: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(function|def|fn|func|class|if|for|while)\s/.test(trimmed)) {
        structureStarts.push(trimmed.split(/\s+/)[0]);
      }
    }

    if (structureStarts.length >= 3) {
      const counts = new Map<string, number>();
      for (const s of structureStarts) counts.set(s, (counts.get(s) || 0) + 1);
      for (const [, count] of counts) {
        if (count >= 3) return true;
      }
    }

    return false;
  }

  calculateRepetitionScore(completion: string): number {
    const result = this.detectRepetition(completion);
    return result.ratio;
  }

  removeRepetition(completion: string): string {
    const result = this.findRepeatingPattern(completion);
    if (!result || result.count < 3) return completion;

    // Keep first two occurrences
    const patternLen = result.pattern.length;
    const keepLen = patternLen * 2;

    if (keepLen < completion.length) {
      return completion.slice(0, keepLen);
    }

    return completion;
  }

  isAcceptableRepetition(completion: string, context: CompletionContext): boolean {
    // Array initialization is acceptable repetition
    if (/^\s*\[/.test(context.cursorContext.linePrefix)) return true;

    // Object property repetition is acceptable
    if (/^\s*\{/.test(context.cursorContext.linePrefix)) return true;

    // Switch/case repetition is acceptable
    if (/case\s/.test(context.cursorContext.linePrefix)) return true;

    return false;
  }

  setMaxRepetitionRatio(ratio: number): void {
    this.maxRepetitionRatio = ratio;
  }
}
