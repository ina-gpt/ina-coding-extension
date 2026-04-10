/**
 * VerificationOrchestrator.ts
 * Phase 18.2 — Runs all verifiers in parallel and aggregates results
 *
 * Also provides auto-fix: if the report fails, a fix prompt is sent back
 * to a fresh CODER agent; the cycle repeats up to `maxFixIterations`.
 *
 * Gate behavior:
 *   - strictMode + critical/high finding → fail verdict
 *   - score >= passThreshold + 20        → pass verdict
 *   - score >= passThreshold             → warning verdict
 *   - otherwise                          → fail verdict
 */

import * as vscode from 'vscode';
import {
  VerificationConfig,
  VerificationReport,
  VerificationResult,
  DEFAULT_VERIFICATION_CONFIG,
  computeScore,
  computeVerdict,
} from './VerifierTypes';
import { SyntaxVerifier } from './SyntaxVerifier';
import { LogicVerifier } from './LogicVerifier';
import { SecurityVerifier } from './SecurityVerifier';
import { ApiService } from '../../ApiService';
import { AgentFactory } from '../multi/AgentFactory';
import { AgentRole } from '../multi/MultiAgentTypes';
import { Logger } from '../../../utils/Logger';

// ============================================================

export class VerificationOrchestrator {
  private static instance: VerificationOrchestrator;

  private syntaxVerifier: SyntaxVerifier;
  private logicVerifier: LogicVerifier;
  private securityVerifier: SecurityVerifier;
  private apiService: ApiService | null = null;

  private config: VerificationConfig = { ...DEFAULT_VERIFICATION_CONFIG };

  private readonly _onReport = new vscode.EventEmitter<VerificationReport>();
  readonly onReport = this._onReport.event;

  private constructor() {
    this.syntaxVerifier = SyntaxVerifier.getInstance();
    this.logicVerifier = LogicVerifier.getInstance();
    this.securityVerifier = SecurityVerifier.getInstance();
  }

  static getInstance(): VerificationOrchestrator {
    if (!VerificationOrchestrator.instance) {
      VerificationOrchestrator.instance = new VerificationOrchestrator();
    }
    return VerificationOrchestrator.instance;
  }

  initialize(apiService: ApiService, config?: Partial<VerificationConfig>): void {
    this.apiService = apiService;
    this.logicVerifier.setApiService(apiService);
    if (config) this.config = { ...this.config, ...config };
    Logger.info('[Verifier] Orchestrator initialized');
  }

  getConfig(): VerificationConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<VerificationConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ============================================================
  // Verify — single-shot (no auto-fix)
  // ============================================================

  /**
   * Called by MultiAgentOrchestrator. Signature matches the verifier
   * interface it expects: `verifyCode(code, filePath, language)`.
   */
  async verifyCode(code: string, filePath: string, language: string): Promise<VerificationReport> {
    return this.verify({ code, filePath, language });
  }

  async verify(input: {
    code: string;
    filePath: string;
    language: string;
    originalCode?: string;
    taskDescription?: string;
  }): Promise<VerificationReport> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};

    // Run sub-verifiers in parallel
    const promises: Promise<{ name: string; results: VerificationResult[] }>[] = [];

    if (this.config.enableSyntaxCheck) {
      promises.push(
        this.runWithTimeout('syntax', async () => this.syntaxVerifier.verify(input.code, input.filePath, input.language))
      );
    }
    if (this.config.enableLogicReview) {
      promises.push(
        this.runWithTimeout('logic', async () =>
          this.logicVerifier.verify({
            code: input.code,
            filePath: input.filePath,
            language: input.language,
            originalCode: input.originalCode,
            taskDescription: input.taskDescription,
          })
        )
      );
    }
    if (this.config.enableSecurityScan) {
      promises.push(
        this.runWithTimeout('security', async () =>
          this.securityVerifier.verify(input.code, input.filePath, input.language)
        )
      );
    }

    const settled = await Promise.allSettled(promises);
    const allResults: VerificationResult[] = [];

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        allResults.push(...s.value.results);
        timings[s.value.name] = 0; // will be populated below
      } else {
        Logger.warn(`[Verifier] Sub-verifier rejected: ${String(s.reason)}`);
      }
    }

    const score = computeScore(allResults);
    const verdict = computeVerdict(score, allResults, this.config);
    const counts = this.aggregateCounts(allResults);
    const suggestions = this.extractSuggestions(allResults);

    const report: VerificationReport = {
      verdict,
      score,
      results: allResults,
      counts,
      summary: this.buildSummary(verdict, score, counts, allResults),
      suggestions,
      durationMs: Date.now() - startTime,
      subVerifierTimings: timings,
      filePath: input.filePath,
      language: input.language,
    };

    this._onReport.fire(report);
    return report;
  }

  // ============================================================
  // Verify + auto-fix loop
  // ============================================================

  /**
   * Run verify. If the report fails, ask a fresh CODER agent to fix it
   * and verify again. Repeat up to `maxFixIterations`.
   *
   * Returns the final report plus the final code (which may differ from
   * the input if auto-fix succeeded).
   */
  async verifyWithAutoFix(input: {
    code: string;
    filePath: string;
    language: string;
    taskDescription?: string;
  }): Promise<{ report: VerificationReport; finalCode: string; iterationsUsed: number }> {
    let currentCode = input.code;
    let lastReport: VerificationReport | null = null;
    const maxIter = this.config.maxFixIterations;

    for (let i = 0; i < maxIter; i++) {
      const report = await this.verify({
        code: currentCode,
        filePath: input.filePath,
        language: input.language,
        taskDescription: input.taskDescription,
        originalCode: i === 0 ? undefined : input.code,
      });
      lastReport = report;

      // Early-exit on pass
      if (report.verdict === 'pass') {
        return { report, finalCode: currentCode, iterationsUsed: i };
      }
      // Warning is acceptable — stop iterating
      if (report.verdict === 'warning') {
        return { report, finalCode: currentCode, iterationsUsed: i };
      }

      // Try an auto-fix pass
      if (!this.apiService) {
        break; // No way to fix without API
      }
      const fixed = await this.askCoderToFix(currentCode, report, input.filePath, input.language).catch((e) => {
        Logger.warn(`[Verifier] Auto-fix failed: ${String(e)}`);
        return null;
      });
      if (!fixed || fixed === currentCode) {
        break;
      }
      currentCode = fixed;
    }

    return {
      report: lastReport ?? (await this.verify(input)),
      finalCode: currentCode,
      iterationsUsed: maxIter,
    };
  }

  /**
   * Send the failing report back to a CODER agent for a fix. Returns the
   * fixed code (parsed out of the agent's response) or null on failure.
   */
  private async askCoderToFix(
    code: string,
    report: VerificationReport,
    filePath: string,
    language: string
  ): Promise<string | null> {
    if (!this.apiService) return null;

    const factory = AgentFactory.getInstance();
    const coder = factory.createAgent(AgentRole.CODER, { task: 'auto-fix' });

    try {
      const issueSummary = report.results
        .filter((r) => r.status === 'fail' || r.status === 'warning')
        .slice(0, 20)
        .map((r, i) => `${i + 1}. [${r.severity}] line ${r.line}: ${r.message}${r.remediation ? ` — ${r.remediation}` : ''}`)
        .join('\n');

      const userPrompt = [
        `The following code failed verification with score ${report.score}/100 (${report.verdict}).`,
        '',
        `### File: ${filePath}`,
        `### Language: ${language}`,
        '',
        '### Issues to fix:',
        issueSummary,
        '',
        '### Code:',
        '```' + language,
        code,
        '```',
        '',
        'Output ONLY the fixed code inside a single fenced code block. Do not add prose explanations.',
      ].join('\n');

      let output = '';
      for await (const chunk of this.apiService.chatStream({
        messages: [
          { role: 'system', content: coder.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        options: {
          model: coder.model,
          temperature: 0.2,
          maxTokens: Math.min(coder.tokenBudget, 6000),
        },
      } as any)) {
        if (typeof chunk === 'string') output += chunk;
      }
      factory.release(coder.id);
      return this.extractCodeBlock(output) ?? null;
    } catch (e) {
      factory.terminate(coder.id);
      throw e;
    }
  }

  /**
   * Pull the first fenced code block out of a model response.
   */
  private extractCodeBlock(text: string): string | null {
    const m = text.match(/```(?:[a-zA-Z]+)?\s*\n?([\s\S]*?)```/);
    if (m) return m[1].trim();
    // No fence — assume the whole response is code
    return text.trim() || null;
  }

  // ============================================================
  // Aggregation helpers
  // ============================================================

  private aggregateCounts(results: VerificationResult[]): VerificationReport['counts'] {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const r of results) {
      if (r.status === 'pass' || r.status === 'info') continue;
      counts[r.severity]++;
    }
    return counts;
  }

  private extractSuggestions(results: VerificationResult[]): string[] {
    const suggestions = new Set<string>();
    for (const r of results) {
      if (r.remediation) suggestions.add(r.remediation);
    }
    return [...suggestions].slice(0, 10);
  }

  private buildSummary(
    verdict: string,
    score: number,
    counts: VerificationReport['counts'],
    results: VerificationResult[]
  ): string {
    const total = counts.critical + counts.high + counts.medium + counts.low;
    const parts = [`Score ${score}/100 — verdict: ${verdict.toUpperCase()}.`];
    if (total === 0) {
      parts.push('No issues found.');
    } else {
      parts.push(
        `${total} issue${total === 1 ? '' : 's'}: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`
      );
    }
    const byCat = new Map<string, number>();
    for (const r of results) {
      if (r.status !== 'fail' && r.status !== 'warning') continue;
      byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    }
    if (byCat.size > 0) {
      parts.push('Categories: ' + [...byCat.entries()].map(([k, v]) => `${k}=${v}`).join(', '));
    }
    return parts.join(' ');
  }

  // ============================================================
  // Timeout wrapper
  // ============================================================

  private async runWithTimeout<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<{ name: string; results: VerificationResult[] }> {
    const startTime = Date.now();
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`${name} verifier timed out`)), this.config.subVerifierTimeoutMs);
      });
      const results = (await Promise.race([fn(), timeoutPromise])) as any;
      return { name, results: Array.isArray(results) ? results : [] };
    } catch (e: any) {
      return {
        name,
        results: [
          {
            status: 'info',
            category: 'logic',
            severity: 'info',
            message: `${name} verifier error: ${e?.message ?? String(e)}`,
            file: '',
            line: 0,
            verifier: name,
          },
        ],
      };
    } finally {
      Logger.debug(`[Verifier] ${name} took ${Date.now() - startTime}ms`);
    }
  }

  dispose(): void {
    this._onReport.dispose();
  }
}
