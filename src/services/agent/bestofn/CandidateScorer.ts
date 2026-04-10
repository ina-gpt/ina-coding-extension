/**
 * CandidateScorer.ts
 * Phase 18.4 — Score candidates on multiple dimensions
 *
 * Dimensions:
 *   - verificationScore  (from VerificationOrchestrator)
 *   - complexity         (regex-based cyclomatic complexity)
 *   - readability        (line length + nesting depth + comment ratio + naming)
 *   - testsPassing       (count of test assertions covering the changed code)
 *   - changedLines       (diff size — used for tie-breaking)
 *
 * Aggregate score = weighted sum of normalized (0..100) sub-scores.
 */

import { Candidate, BestOfNConfig, CandidateMetrics } from './BestOfNTypes';
import { VerificationOrchestrator } from '../verifier/VerificationOrchestrator';
import { VerificationReport } from '../verifier/VerifierTypes';
import { Logger } from '../../../utils/Logger';

// ============================================================

export class CandidateScorer {
  private static instance: CandidateScorer;

  private verifier: VerificationOrchestrator;

  private constructor() {
    this.verifier = VerificationOrchestrator.getInstance();
  }

  static getInstance(): CandidateScorer {
    if (!CandidateScorer.instance) {
      CandidateScorer.instance = new CandidateScorer();
    }
    return CandidateScorer.instance;
  }

  // ============================================================
  // Entry point
  // ============================================================

  /**
   * Score a single candidate. Mutates `candidate.metrics`, `candidate.finalScore`,
   * `candidate.verificationScore` in place and returns the final score.
   */
  async score(candidate: Candidate, config: BestOfNConfig, originalCode?: string): Promise<number> {
    const language = (candidate.metadata.language as string) || 'typescript';

    // 1. Verification
    let report: VerificationReport | null = null;
    try {
      report = await this.verifier.verifyCode(candidate.code, candidate.filePath, language);
      candidate.verificationScore = report.score;
      candidate.verificationVerdict = report.verdict;
    } catch (e) {
      Logger.warn(`[BestOfN] Verifier failed on candidate ${candidate.id}: ${String(e)}`);
      candidate.verificationScore = 50; // neutral fallback
      candidate.verificationVerdict = 'warning';
    }

    // 2. Metrics
    candidate.metrics = this.computeMetrics(candidate.code, originalCode);

    // 3. Aggregate final score
    candidate.finalScore = this.aggregate(candidate, config);
    return candidate.finalScore;
  }

  /**
   * Score all candidates in parallel.
   */
  async scoreAll(
    candidates: Candidate[],
    config: BestOfNConfig,
    originalCode?: string
  ): Promise<Candidate[]> {
    await Promise.all(candidates.map((c) => this.score(c, config, originalCode)));
    return candidates;
  }

  // ============================================================
  // Metric computation
  // ============================================================

  private computeMetrics(code: string, originalCode?: string): CandidateMetrics {
    return {
      complexity: this.cyclomaticComplexity(code),
      readability: this.readabilityScore(code),
      performance: this.performanceHeuristic(code),
      testsPassing: this.countTestAssertions(code),
      changedLines: originalCode ? this.diffLineCount(originalCode, code) : code.split('\n').length,
    };
  }

  /**
   * Approximate cyclomatic complexity by counting decision points.
   * Token set inspired by ESLint's `complexity` rule.
   */
  private cyclomaticComplexity(code: string): number {
    // Start at 1 for the linear path
    let complexity = 1;
    // Decision tokens — each adds one path
    const patterns: RegExp[] = [
      /\bif\s*\(/g,
      /\belse\s+if\b/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\bcase\s+/g,
      /\bcatch\s*\(/g,
      /\b(&&|\|\|)\b/g,
      /\?\s*[^:]+:/g, // ternary
    ];
    for (const p of patterns) {
      const matches = code.match(p);
      if (matches) complexity += matches.length;
    }
    return complexity;
  }

  /**
   * Readability heuristic 0..100, based on:
   *   - avg line length (shorter = better, but not too short)
   *   - max nesting depth (shallower = better)
   *   - comment ratio (some comments = better, too many = worse)
   *   - naming convention (snake/camel/Pascal consistency)
   */
  private readabilityScore(code: string): number {
    const lines = code.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return 0;

    // 1. avg line length — target 40..80 chars
    const avgLen = lines.reduce((s, l) => s + l.length, 0) / lines.length;
    const lenScore = avgLen < 40 ? 70 : avgLen <= 80 ? 100 : Math.max(0, 100 - (avgLen - 80) * 2);

    // 2. nesting depth — count leading spaces/tabs
    let maxDepth = 0;
    for (const line of lines) {
      const match = line.match(/^(\s*)/);
      const spaces = match ? match[1].replace(/\t/g, '  ').length : 0;
      const depth = Math.floor(spaces / 2);
      if (depth > maxDepth) maxDepth = depth;
    }
    const depthScore = maxDepth < 4 ? 100 : Math.max(0, 100 - (maxDepth - 4) * 15);

    // 3. comment ratio — ideal 5..20%
    const commentLines = lines.filter((l) => /^\s*(\/\/|#|\/\*|\*)/.test(l)).length;
    const ratio = commentLines / lines.length;
    const commentScore =
      ratio < 0.02 ? 60 : ratio <= 0.2 ? 100 : Math.max(0, 100 - (ratio - 0.2) * 300);

    // 4. naming consistency — count name styles
    const identifiers = code.match(/\b[a-zA-Z_$][\w$]{2,}\b/g) ?? [];
    let camel = 0;
    let snake = 0;
    let pascal = 0;
    for (const id of identifiers) {
      if (/^[A-Z][a-zA-Z0-9]*$/.test(id)) pascal++;
      else if (/^[a-z][a-zA-Z0-9]*$/.test(id)) camel++;
      else if (/^[a-z][a-z0-9_]*$/.test(id)) snake++;
    }
    const total = camel + snake + pascal;
    const maxStyle = Math.max(camel, snake, pascal);
    const namingScore = total > 0 ? (maxStyle / total) * 100 : 50;

    return Math.round((lenScore + depthScore + commentScore + namingScore) / 4);
  }

  /**
   * Performance heuristic — looks for obvious antipatterns and subtracts points.
   */
  private performanceHeuristic(code: string): number {
    let score = 100;
    // Nested loops
    const nestedLoops = code.match(/for\s*\([^)]*\)[\s\S]{0,200}?for\s*\(/g);
    if (nestedLoops) score -= nestedLoops.length * 5;
    // .forEach + .filter + .map chain (often O(3n))
    const chains = code.match(/\.(?:filter|map|forEach|reduce)\s*\([^)]*\)\s*\.(?:filter|map|forEach|reduce)/g);
    if (chains) score -= chains.length * 3;
    // Synchronous file I/O in async contexts
    const syncFsInAsync =
      /\basync\s+function[\s\S]{0,500}?\b(readFileSync|writeFileSync|existsSync|statSync)\b/.test(code);
    if (syncFsInAsync) score -= 10;
    // JSON.parse(JSON.stringify(...)) clone
    if (/JSON\.parse\s*\(\s*JSON\.stringify/.test(code)) score -= 5;
    return Math.max(0, score);
  }

  /**
   * Count test assertions (expect / assert / should / etc.) — if the
   * candidate contains its own tests. A crude proxy for test coverage.
   */
  private countTestAssertions(code: string): number {
    const patterns = [
      /\bexpect\s*\(/g,
      /\bassert\.\w+\s*\(/g,
      /\bshould\.\w+/g,
      /\.toBe\b/g,
      /\.toEqual\b/g,
      /\.toHaveBeenCalled/g,
    ];
    let count = 0;
    for (const p of patterns) {
      const matches = code.match(p);
      if (matches) count += matches.length;
    }
    return count;
  }

  /**
   * Very crude line-diff count — number of lines that differ between two versions.
   */
  private diffLineCount(a: string, b: string): number {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    const setA = new Set(aLines);
    const setB = new Set(bLines);
    let diff = 0;
    for (const line of aLines) if (!setB.has(line)) diff++;
    for (const line of bLines) if (!setA.has(line)) diff++;
    return diff;
  }

  // ============================================================
  // Aggregate score
  // ============================================================

  /**
   * Combine sub-scores into a final 0..100 score using config weights.
   * All sub-scores are normalized to 0..100 first.
   */
  private aggregate(candidate: Candidate, config: BestOfNConfig): number {
    // Normalize complexity — assume 1..40 range, invert so lower is better
    const normComplexity = Math.max(0, 100 - candidate.metrics.complexity * 2);
    // Tests: cap at 20 tests = 100 points
    const normTests = Math.min(100, candidate.metrics.testsPassing * 5);

    const score =
      candidate.verificationScore * config.weightScore +
      normComplexity * config.weightComplexity +
      candidate.metrics.readability * config.weightReadability +
      normTests * config.weightTests;

    return Math.round(Math.max(0, Math.min(100, score)));
  }
}
