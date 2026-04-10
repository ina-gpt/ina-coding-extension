/**
 * CandidateSelector.ts
 * Phase 18.4 — Pick the winning candidate
 *
 * Strategies:
 *   HIGHEST_SCORE      — max finalScore
 *   LOWEST_COMPLEXITY  — min cyclomatic complexity
 *   MOST_READABLE      — max readability
 *   CONSENSUS          — REVIEWER agent compares all
 *   HUMAN_PICK         — caller's responsibility (UI-driven)
 *
 * Tie-breaking: prefer the candidate with the smallest diff (changedLines).
 */

import * as vscode from 'vscode';
import { Candidate, SelectionStrategy, SelectionResult } from './BestOfNTypes';
import { AgentFactory } from '../multi/AgentFactory';
import { AgentRole } from '../multi/MultiAgentTypes';
import { ApiService } from '../../ApiService';
import { Logger } from '../../../utils/Logger';

// ============================================================

export class CandidateSelector {
  private static instance: CandidateSelector;

  private apiService: ApiService | null = null;

  private constructor() {}

  static getInstance(): CandidateSelector {
    if (!CandidateSelector.instance) {
      CandidateSelector.instance = new CandidateSelector();
    }
    return CandidateSelector.instance;
  }

  setApiService(api: ApiService): void {
    this.apiService = api;
  }

  // ============================================================
  // Entry point
  // ============================================================

  async select(candidates: Candidate[], strategy: SelectionStrategy): Promise<SelectionResult> {
    const startTime = Date.now();
    if (candidates.length === 0) {
      throw new Error('No candidates to select from');
    }
    if (candidates.length === 1) {
      return {
        winner: candidates[0],
        runners: [],
        strategy,
        rationale: 'Only one candidate available',
        durationMs: Date.now() - startTime,
      };
    }

    let winner: Candidate;
    let rationale: string;

    switch (strategy) {
      case SelectionStrategy.HIGHEST_SCORE:
        ({ winner, rationale } = this.selectHighestScore(candidates));
        break;
      case SelectionStrategy.LOWEST_COMPLEXITY:
        ({ winner, rationale } = this.selectLowestComplexity(candidates));
        break;
      case SelectionStrategy.MOST_READABLE:
        ({ winner, rationale } = this.selectMostReadable(candidates));
        break;
      case SelectionStrategy.CONSENSUS:
        ({ winner, rationale } = await this.selectConsensus(candidates));
        break;
      case SelectionStrategy.HUMAN_PICK:
        ({ winner, rationale } = await this.selectHumanPick(candidates));
        break;
      default:
        ({ winner, rationale } = this.selectHighestScore(candidates));
    }

    const runners = candidates.filter((c) => c.id !== winner.id);
    return {
      winner,
      runners,
      strategy,
      rationale,
      durationMs: Date.now() - startTime,
    };
  }

  // ============================================================
  // HIGHEST_SCORE
  // ============================================================

  private selectHighestScore(candidates: Candidate[]): { winner: Candidate; rationale: string } {
    const sorted = [...candidates].sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      // Tie-break by smaller diff
      return a.metrics.changedLines - b.metrics.changedLines;
    });
    const winner = sorted[0];
    const rationale = `Highest final score: ${winner.finalScore}/100 (runners: ${sorted
      .slice(1)
      .map((c) => c.finalScore)
      .join(', ')})`;
    return { winner, rationale };
  }

  // ============================================================
  // LOWEST_COMPLEXITY
  // ============================================================

  private selectLowestComplexity(candidates: Candidate[]): { winner: Candidate; rationale: string } {
    const sorted = [...candidates].sort((a, b) => {
      if (a.metrics.complexity !== b.metrics.complexity) {
        return a.metrics.complexity - b.metrics.complexity;
      }
      // Tie-break by higher verification score
      return b.verificationScore - a.verificationScore;
    });
    const winner = sorted[0];
    const rationale = `Lowest cyclomatic complexity: ${winner.metrics.complexity}`;
    return { winner, rationale };
  }

  // ============================================================
  // MOST_READABLE
  // ============================================================

  private selectMostReadable(candidates: Candidate[]): { winner: Candidate; rationale: string } {
    const sorted = [...candidates].sort((a, b) => {
      if (b.metrics.readability !== a.metrics.readability) {
        return b.metrics.readability - a.metrics.readability;
      }
      return a.metrics.changedLines - b.metrics.changedLines;
    });
    const winner = sorted[0];
    const rationale = `Highest readability: ${winner.metrics.readability}/100`;
    return { winner, rationale };
  }

  // ============================================================
  // CONSENSUS — ask the REVIEWER agent to pick
  // ============================================================

  private async selectConsensus(
    candidates: Candidate[]
  ): Promise<{ winner: Candidate; rationale: string }> {
    if (!this.apiService) {
      Logger.warn('[BestOfN] Consensus strategy requested but no ApiService — falling back to highest score');
      return this.selectHighestScore(candidates);
    }

    const factory = AgentFactory.getInstance();
    const reviewer = factory.createAgent(AgentRole.REVIEWER, { task: 'best-of-n-consensus' });

    // Build a prompt listing all candidates with truncated code
    const blocks = candidates
      .map(
        (c, i) =>
          `### Candidate ${i + 1} (id: ${c.id})
score: ${c.finalScore}/100 | complexity: ${c.metrics.complexity} | readability: ${c.metrics.readability}

\`\`\`
${c.code.substring(0, 2500)}
\`\`\``
      )
      .join('\n\n');

    const userPrompt = [
      'You are comparing multiple candidate solutions for the same task. Pick the BEST one based on correctness, clarity, maintainability, and adherence to project conventions.',
      '',
      'Respond with ONLY a JSON object:',
      '{ "winnerIndex": <1-based number>, "rationale": "..." }',
      '',
      'Candidates:',
      '',
      blocks,
    ].join('\n');

    let raw = '';
    try {
      for await (const chunk of this.apiService.chatStream({
        messages: [
          { role: 'system', content: reviewer.systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        options: {
          model: reviewer.model,
          temperature: 0.3,
          maxTokens: 600,
        },
      } as any)) {
        if (typeof chunk === 'string') raw += chunk;
      }
    } catch (e) {
      factory.terminate(reviewer.id);
      Logger.warn(`[BestOfN] Consensus REVIEWER failed: ${String(e)}`);
      return this.selectHighestScore(candidates);
    }
    factory.release(reviewer.id);

    // Parse the JSON
    const cleaned = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) return this.selectHighestScore(candidates);
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return this.selectHighestScore(candidates);
      }
    }

    const idx = Number(parsed?.winnerIndex);
    if (!Number.isFinite(idx) || idx < 1 || idx > candidates.length) {
      return this.selectHighestScore(candidates);
    }
    return {
      winner: candidates[idx - 1],
      rationale: `REVIEWER consensus: ${parsed.rationale ?? '(no rationale provided)'}`,
    };
  }

  // ============================================================
  // HUMAN_PICK — present side-by-side and wait
  // ============================================================

  private async selectHumanPick(
    candidates: Candidate[]
  ): Promise<{ winner: Candidate; rationale: string }> {
    const items: Array<vscode.QuickPickItem & { candidate: Candidate }> = candidates.map((c, i) => ({
      label: `Candidate ${i + 1}`,
      description: `score ${c.finalScore}/100 · complexity ${c.metrics.complexity} · readability ${c.metrics.readability}`,
      detail: c.code.substring(0, 160).replace(/\n/g, ' '),
      candidate: c,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'INA-7 Pro · Select the winning candidate',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) {
      // User cancelled — fall back to highest score
      return this.selectHighestScore(candidates);
    }
    return {
      winner: picked.candidate,
      rationale: 'Selected by user',
    };
  }
}
