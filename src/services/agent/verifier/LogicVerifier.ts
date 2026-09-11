/**
 * LogicVerifier.ts
 * Phase 18.2 — Uses a REVIEWER agent to analyze code logic
 *
 * Detects:
 *   - Infinite loops / unbounded recursion
 *   - Missing error handling
 *   - Race conditions (missing await, orphan promises)
 *   - Null / undefined risks
 *   - Intent drift (if `originalCode` is provided, compare with `code`)
 */

import { VerificationResult } from './VerifierTypes';
import { ApiService } from '../../ApiService';
import { Logger } from '../../../utils/Logger';
import { defaultModel } from '../../../config/model-registry';

// ============================================================

export interface LogicVerifierInput {
  code: string;
  filePath: string;
  language: string;
  /** Optional before-state for intent-drift detection */
  originalCode?: string;
  /** Task description the code was supposed to satisfy */
  taskDescription?: string;
}

export class LogicVerifier {
  private static instance: LogicVerifier;

  private apiService: ApiService | null = null;

  private constructor() {}

  static getInstance(): LogicVerifier {
    if (!LogicVerifier.instance) {
      LogicVerifier.instance = new LogicVerifier();
    }
    return LogicVerifier.instance;
  }

  setApiService(api: ApiService): void {
    this.apiService = api;
  }

  // ============================================================
  // Entry point
  // ============================================================

  async verify(input: LogicVerifierInput): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    // Fast-path heuristic checks (no model call)
    results.push(...this.heuristicChecks(input));

    // Deep AI-based review (only if API is wired)
    if (this.apiService) {
      try {
        const aiResults = await this.aiReview(input);
        results.push(...aiResults);
      } catch (e: any) {
        Logger.warn(`[LogicVerifier] AI review failed: ${String(e)}`);
        results.push({
          status: 'info',
          category: 'logic',
          severity: 'info',
          message: `AI review unavailable: ${e?.message ?? String(e)}`,
          file: input.filePath,
          line: 0,
          verifier: 'logic',
        });
      }
    }

    return results;
  }

  // ============================================================
  // Heuristic checks (fast, no model call)
  // ============================================================

  private heuristicChecks(input: LogicVerifierInput): VerificationResult[] {
    const results: VerificationResult[] = [];
    const { code, filePath, language } = input;
    const lines = code.split('\n');

    // Check 1: `while (true)` without break/return inside
    lines.forEach((line, i) => {
      const match = line.match(/while\s*\(\s*true\s*\)|for\s*\(\s*;\s*;\s*\)/);
      if (!match) return;
      // Look ahead for break/return within the next 40 lines
      const block = lines.slice(i, Math.min(lines.length, i + 40)).join('\n');
      if (!/\b(break|return|throw)\b/.test(block)) {
        results.push({
          status: 'warning',
          category: 'logic',
          severity: 'high',
          message: 'Infinite loop: no break / return / throw in body',
          file: filePath,
          line: i + 1,
          verifier: 'logic',
          ruleId: 'infinite-loop',
          remediation: 'Add a terminating condition or break statement',
        });
      }
    });

    // Check 2: unhandled promise (orphan `await` missing, or `.then` without `.catch`)
    if (language.includes('ts') || language.includes('js')) {
      lines.forEach((line, i) => {
        // .then() without .catch() on the same chain
        if (/\.then\s*\(/.test(line) && !/\.catch\s*\(/.test(code)) {
          results.push({
            status: 'warning',
            category: 'logic',
            severity: 'medium',
            message: 'Promise chain missing .catch handler',
            file: filePath,
            line: i + 1,
            verifier: 'logic',
            ruleId: 'missing-catch',
          });
        }
      });

      // async function without try/catch
      const asyncFnRe = /async\s+(?:function\s+(\w+)|(\w+)\s*=)|async\s*\([^)]*\)\s*=>/g;
      let m: RegExpExecArray | null;
      while ((m = asyncFnRe.exec(code)) !== null) {
        const startIdx = m.index;
        const endIdx = Math.min(code.length, startIdx + 2000);
        const fnBody = code.substring(startIdx, endIdx);
        if (!/try\s*\{/.test(fnBody) && /\bawait\s/.test(fnBody)) {
          const lineNum = code.substring(0, startIdx).split('\n').length;
          results.push({
            status: 'warning',
            category: 'logic',
            severity: 'low',
            message: 'async function contains await but no try/catch',
            file: filePath,
            line: lineNum,
            verifier: 'logic',
            ruleId: 'async-no-try',
            remediation: 'Wrap await calls in try/catch to handle rejection',
          });
        }
      }
    }

    // Check 3: null-access risks (TS/JS heuristic)
    if (language.includes('ts') || language.includes('js')) {
      lines.forEach((line, i) => {
        // property access on a function return without optional chaining
        if (/\)\.\w+\.\w+/.test(line) && !/\?\./.test(line)) {
          results.push({
            status: 'info',
            category: 'logic',
            severity: 'low',
            message: 'Deep property access without optional chaining — possible null/undefined risk',
            file: filePath,
            line: i + 1,
            verifier: 'logic',
            ruleId: 'no-optional-chain',
          });
        }
      });
    }

    // Check 4: unused `await` (fire-and-forget async calls)
    lines.forEach((line, i) => {
      if (/^\s*[a-zA-Z_$][\w$]*\s*\(/.test(line)) {
        const asyncHint = /async|Promise|\.then\(/;
        // Heuristic only: we can't type-check without a compiler, so we flag only obvious cases
        if (asyncHint.test(line) && !/await/.test(line) && !/return/.test(line)) {
          // Only flag inside an async function (previous lines contain async)
          const before = lines.slice(Math.max(0, i - 20), i).join('\n');
          if (/\basync\b/.test(before)) {
            results.push({
              status: 'info',
              category: 'logic',
              severity: 'low',
              message: 'Possible missing `await` on async call',
              file: filePath,
              line: i + 1,
              verifier: 'logic',
              ruleId: 'missing-await',
            });
          }
        }
      }
    });

    return results;
  }

  // ============================================================
  // AI review (REVIEWER agent)
  // ============================================================

  private async aiReview(input: LogicVerifierInput): Promise<VerificationResult[]> {
    if (!this.apiService) return [];

    const systemPrompt = `You are the LOGIC REVIEWER for INA Coding. Review the user's code for logical correctness.

Focus ONLY on logic issues: infinite loops, missing error handling, race conditions, null/undefined risks, off-by-one errors, incorrect conditions, intent drift.

Do NOT comment on style, formatting, or security.

Output format — ONLY a JSON object, no prose:
{
  "issues": [
    {
      "severity": "critical"|"high"|"medium"|"low"|"info",
      "line": <number>,
      "title": "...",
      "description": "...",
      "remediation": "..."
    }
  ]
}`;

    const userPrompt = [
      `Task: ${input.taskDescription ?? '(unspecified)'}`,
      `File: ${input.filePath}`,
      `Language: ${input.language}`,
      input.originalCode ? `\n### Original code\n\`\`\`${input.language}\n${input.originalCode.substring(0, 3000)}\n\`\`\`` : '',
      `\n### New code\n\`\`\`${input.language}\n${input.code.substring(0, 6000)}\n\`\`\``,
    ]
      .filter(Boolean)
      .join('\n');

    let raw = '';
    for await (const chunk of this.apiService.chatStream({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        model: defaultModel('general').id,
        temperature: 0.3,
        maxTokens: 2000,
      },
    } as any)) {
      if (typeof chunk === 'string') raw += chunk;
    }

    return this.parseAIResponse(raw, input.filePath);
  }

  private parseAIResponse(raw: string, filePath: string): VerificationResult[] {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return [];
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return [];
      }
    }
    const issues = parsed?.issues;
    if (!Array.isArray(issues)) return [];

    return issues
      .filter((i) => i && typeof i === 'object')
      .map((i) => ({
        status: 'warning' as const,
        category: 'logic' as const,
        severity: this.normalizeSeverity(i.severity),
        message: `${i.title ?? 'Issue'}: ${i.description ?? ''}`.trim(),
        file: filePath,
        line: Number.isFinite(i.line) ? Number(i.line) : 0,
        verifier: 'logic',
        ruleId: 'ai-review',
        remediation: i.remediation,
      }));
  }

  private normalizeSeverity(s: any): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    const v = String(s ?? '').toLowerCase();
    if (v === 'critical' || v === 'high' || v === 'medium' || v === 'low' || v === 'info') {
      return v as any;
    }
    return 'medium';
  }
}
