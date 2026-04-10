import * as vscode from 'vscode';
import { CompletionItem, CompletionContext } from '../CompletionTypes';
import {
  QualityScore,
  QualityReport,
  QualityCheck,
  QualityCheckResult,
  FilterReason,
  FormattingContext,
} from './QualityTypes';
import { ConfidenceScorer } from './ConfidenceScorer';
import { DuplicateDetector } from './DuplicateDetector';
import { IndentationManager } from './IndentationManager';
import { LanguageFormatter } from './LanguageFormatter';
import { SyntaxValidator } from './SyntaxValidator';
import { RepetitionDetector } from './RepetitionDetector';
import { HallucinationDetector } from './HallucinationDetector';
import { SafetyChecker } from './SafetyChecker';
import { FeedbackLearner } from './FeedbackLearner';
import { Logger } from '../../../utils/Logger';

interface QualityConfig {
  minConfidence: number;
  enableDeduplication: boolean;
  enableFormatting: boolean;
  enableSyntaxCheck: boolean;
  enableRepetitionCheck: boolean;
  enableSafetyCheck: boolean;
  enableLearning: boolean;
  maxCompletions: number;
}

interface QualityMetrics {
  totalProcessed: number;
  passedCount: number;
  filteredCount: number;
  filterReasons: Map<FilterReason, number>;
  averageScore: number;
  processingTimeMs: number;
}

const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  minConfidence: 0.3,
  enableDeduplication: true,
  enableFormatting: true,
  enableSyntaxCheck: true,
  enableRepetitionCheck: true,
  enableSafetyCheck: true,
  enableLearning: true,
  maxCompletions: 3,
};

export class QualityPipeline implements vscode.Disposable {
  private confidenceScorer: ConfidenceScorer;
  private duplicateDetector: DuplicateDetector;
  private indentationManager: IndentationManager;
  private languageFormatter: LanguageFormatter;
  private syntaxValidator: SyntaxValidator;
  private repetitionDetector: RepetitionDetector;
  private hallucinationDetector: HallucinationDetector;
  private safetyChecker: SafetyChecker;
  private feedbackLearner: FeedbackLearner;
  private config: QualityConfig;
  private metrics: QualityMetrics;

  constructor(context?: vscode.ExtensionContext) {
    this.confidenceScorer = ConfidenceScorer.getInstance();
    this.duplicateDetector = DuplicateDetector.getInstance();
    this.indentationManager = IndentationManager.getInstance();
    this.languageFormatter = LanguageFormatter.getInstance();
    this.syntaxValidator = SyntaxValidator.getInstance();
    this.repetitionDetector = RepetitionDetector.getInstance();
    this.hallucinationDetector = HallucinationDetector.getInstance();
    this.safetyChecker = SafetyChecker.getInstance();
    this.feedbackLearner = new FeedbackLearner(context);
    this.config = { ...DEFAULT_QUALITY_CONFIG };
    this.metrics = this.createEmptyMetrics();
  }

  async process(
    completions: CompletionItem[],
    context: CompletionContext
  ): Promise<{ results: CompletionItem[]; reports: QualityReport[] }> {
    const startTime = Date.now();
    const reports: QualityReport[] = [];
    let items = [...completions];

    this.metrics.totalProcessed += items.length;

    // Step 1-2: Score and filter by confidence
    const userPrefs = this.config.enableLearning
      ? this.feedbackLearner.getUserPreferences()
      : undefined;

    items = items.filter((item) => {
      const score = this.confidenceScorer.calculateScore(item, context, userPrefs);
      const { pass, reason } = this.filterCompletion(item, context, score);

      if (!pass) {
        this.recordFilterReason(reason!);
        reports.push(this.createReport(item, score, false, reason));
      }

      // Update item confidence with calculated score
      item.confidence = score.overall;
      return pass;
    });

    // Step 3: Deduplicate
    if (this.config.enableDeduplication && items.length > 1) {
      const dedup = this.duplicateDetector.deduplicate(items);
      for (const dup of dedup.duplicates) {
        this.recordFilterReason(FilterReason.DUPLICATE);
      }
      items = dedup.unique;
    }

    // Step 4: Syntax validation
    if (this.config.enableSyntaxCheck) {
      items = items.filter((item) => {
        const result = this.syntaxValidator.validate(item.insertText, context);
        if (!result.valid) {
          // Try to fix minor issues
          const fixed = this.syntaxValidator.fixMinorSyntaxIssues(item.insertText, context.language);
          const recheck = this.syntaxValidator.validate(fixed, context);
          if (recheck.valid) {
            item.insertText = fixed;
            item.displayText = fixed;
            return true;
          }
          this.recordFilterReason(FilterReason.SYNTAX_ERROR);
          return false;
        }
        return true;
      });
    }

    // Step 5: Repetition check
    if (this.config.enableRepetitionCheck) {
      items = items.filter((item) => {
        const rep = this.repetitionDetector.detectRepetition(item.insertText);
        if (rep.isRepetitive && !this.repetitionDetector.isAcceptableRepetition(item.insertText, context)) {
          const cleaned = this.repetitionDetector.removeRepetition(item.insertText);
          if (cleaned.trim().length > 2) {
            item.insertText = cleaned;
            item.displayText = cleaned;
            return true;
          }
          this.recordFilterReason(FilterReason.REPETITIVE);
          return false;
        }
        return true;
      });
    }

    // Step 6: Safety check
    if (this.config.enableSafetyCheck) {
      items = items.filter((item) => {
        const safety = this.safetyChecker.check(item.insertText, context.language);
        if (safety.severity === 'danger') {
          this.recordFilterReason(FilterReason.UNSAFE_PATTERN);
          return false;
        }
        // Warnings don't filter but reduce score
        if (safety.severity === 'warning') {
          item.confidence *= 0.8;
        }
        return true;
      });
    }

    // Step 7-8: Fix indentation and apply formatting
    if (this.config.enableFormatting) {
      items = items.map((item) => this.formatCompletion(item, context));
    }

    // Step 9: Sort by final score
    items.sort((a, b) => b.confidence - a.confidence);

    // Step 10: Limit
    items = items.slice(0, this.config.maxCompletions);

    this.metrics.passedCount += items.length;
    this.metrics.filteredCount += completions.length - items.length;
    this.metrics.processingTimeMs = Date.now() - startTime;

    // Update average score
    if (items.length > 0) {
      const avgScore = items.reduce((sum, i) => sum + i.confidence, 0) / items.length;
      this.metrics.averageScore = (this.metrics.averageScore * 0.9) + (avgScore * 0.1);
    }

    return { results: items, reports };
  }

  processSync(
    completions: CompletionItem[],
    context: CompletionContext
  ): { results: CompletionItem[]; reports: QualityReport[] } {
    // Synchronous fast path - skip async operations
    const items = completions.filter((item) => {
      if (item.confidence < this.config.minConfidence) return false;
      if (item.insertText.trim().length < 2) return false;
      return true;
    });

    return { results: items.slice(0, this.config.maxCompletions), reports: [] };
  }

  scoreCompletion(completion: CompletionItem, context: CompletionContext): QualityScore {
    const userPrefs = this.config.enableLearning
      ? this.feedbackLearner.getUserPreferences()
      : undefined;
    return this.confidenceScorer.calculateScore(completion, context, userPrefs);
  }

  filterCompletion(
    completion: CompletionItem,
    context: CompletionContext,
    score: QualityScore
  ): { pass: boolean; reason: FilterReason | null } {
    if (score.overall < this.config.minConfidence) {
      return { pass: false, reason: FilterReason.LOW_CONFIDENCE };
    }
    if (completion.insertText.trim().length < 2) {
      return { pass: false, reason: FilterReason.TOO_SHORT };
    }
    if (completion.insertText.length > 2000) {
      return { pass: false, reason: FilterReason.TOO_LONG };
    }
    return { pass: true, reason: null };
  }

  formatCompletion(completion: CompletionItem, context: CompletionContext): CompletionItem {
    let text = completion.insertText;

    // Fix indentation
    text = this.indentationManager.fixIndentation(text, context, context.indentation);

    // Apply language formatting
    const fmtContext: FormattingContext = {
      indentation: context.indentation,
      lineContent: context.cursorContext.lineContent,
      language: context.language,
      isInString: context.isInString,
      isInComment: context.isInComment,
      bracketDepth: context.cursorContext.bracketDepth,
    };
    text = this.languageFormatter.format(text, context.language, fmtContext);

    return { ...completion, insertText: text, displayText: text };
  }

  recordFeedback(
    completion: CompletionItem,
    context: CompletionContext,
    accepted: boolean,
    editedText?: string
  ): void {
    if (!this.config.enableLearning) return;

    if (accepted) {
      this.feedbackLearner.recordAcceptance(completion, context, editedText);
    } else {
      this.feedbackLearner.recordRejection(completion, context, 0);
    }

    // Adjust confidence threshold based on acceptance rate
    const acceptRate = this.feedbackLearner.getAcceptanceRate(context.language);
    this.confidenceScorer.adjustConfidenceThreshold(acceptRate);
  }

  getMetrics(): QualityMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = this.createEmptyMetrics();
  }

  updateConfig(config: Partial<QualityConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.minConfidence !== undefined) {
      this.confidenceScorer.setMinConfidence(config.minConfidence);
    }
  }

  getConfig(): QualityConfig {
    return { ...this.config };
  }

  generateQualityReport(completion: CompletionItem, context: CompletionContext): QualityReport {
    const score = this.scoreCompletion(completion, context);
    const checks: QualityCheck[] = [];

    // Run all checks
    const syntaxResult = this.syntaxValidator.validate(completion.insertText, context);
    checks.push({
      name: 'syntax',
      result: syntaxResult.valid ? QualityCheckResult.PASS : QualityCheckResult.WARN,
      reason: syntaxResult.errors.join('; ') || null,
      score: syntaxResult.valid ? 1 : 0.5,
      details: { errors: syntaxResult.errors, warnings: syntaxResult.warnings },
    });

    const repResult = this.repetitionDetector.detectRepetition(completion.insertText);
    checks.push({
      name: 'repetition',
      result: repResult.isRepetitive ? QualityCheckResult.FAIL : QualityCheckResult.PASS,
      reason: repResult.pattern ? `Repeating: ${repResult.pattern}` : null,
      score: 1 - repResult.ratio,
      details: { ratio: repResult.ratio, pattern: repResult.pattern },
    });

    const safetyResult = this.safetyChecker.check(completion.insertText, context.language);
    checks.push({
      name: 'safety',
      result: safetyResult.safe ? QualityCheckResult.PASS : QualityCheckResult.FAIL,
      reason: safetyResult.issues.map((i) => i.message).join('; ') || null,
      score: this.safetyChecker.getSafetyScore(completion.insertText, context.language),
      details: { issues: safetyResult.issues },
    });

    return this.createReport(completion, score, true, null, checks);
  }

  private createReport(
    item: CompletionItem,
    score: QualityScore,
    passed: boolean,
    filterReason: FilterReason | null,
    checks?: QualityCheck[]
  ): QualityReport {
    return {
      completion: item.insertText,
      originalScore: item.confidence,
      adjustedScore: score.overall,
      checks: checks || [],
      passed,
      filterReason,
      suggestions: [],
    };
  }

  private createEmptyMetrics(): QualityMetrics {
    return {
      totalProcessed: 0,
      passedCount: 0,
      filteredCount: 0,
      filterReasons: new Map(),
      averageScore: 0,
      processingTimeMs: 0,
    };
  }

  private recordFilterReason(reason: FilterReason): void {
    const current = this.metrics.filterReasons.get(reason) || 0;
    this.metrics.filterReasons.set(reason, current + 1);
  }

  dispose(): void {
    this.feedbackLearner.dispose();
  }
}
