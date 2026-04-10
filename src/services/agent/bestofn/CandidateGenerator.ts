/**
 * CandidateGenerator.ts
 * Phase 18.4 — Generate N candidate solutions in parallel
 *
 * Spawns N CODER agents at different temperatures and/or with slightly
 * varied prompts, runs them concurrently, and returns the raw candidates.
 * Each candidate is scored/selected later by CandidateScorer/Selector.
 */

import { Candidate, BestOfNConfig } from './BestOfNTypes';
import { AgentFactory } from '../multi/AgentFactory';
import { AgentRole } from '../multi/MultiAgentTypes';
import { ApiService } from '../../ApiService';
import { Logger } from '../../../utils/Logger';

// ============================================================

export interface GenerationRequest {
  taskId: string;
  description: string;
  filePath: string;
  language: string;
  /** Optional existing code to modify (for edit-style tasks) */
  existingCode?: string;
  /** Optional extra context (dependency results, rules, etc.) */
  extraContext?: string;
}

// ============================================================

export class CandidateGenerator {
  private static instance: CandidateGenerator;

  private apiService: ApiService | null = null;
  private factory: AgentFactory;

  private constructor() {
    this.factory = AgentFactory.getInstance();
  }

  static getInstance(): CandidateGenerator {
    if (!CandidateGenerator.instance) {
      CandidateGenerator.instance = new CandidateGenerator();
    }
    return CandidateGenerator.instance;
  }

  setApiService(api: ApiService): void {
    this.apiService = api;
  }

  // ============================================================
  // Entry point
  // ============================================================

  /**
   * Generate `config.n` candidates concurrently. Each candidate is produced
   * by a fresh CODER agent with a different sampling temperature.
   */
  async generate(request: GenerationRequest, config: BestOfNConfig): Promise<Candidate[]> {
    if (!this.apiService) {
      throw new Error('CandidateGenerator not initialized (no ApiService)');
    }
    if (config.n < 1) throw new Error('n must be >= 1');

    const temperatures = this.computeTemperatures(config);
    Logger.info(`[BestOfN] Generating ${config.n} candidates at temps ${temperatures.join(', ')}`);

    // Fire all candidates in parallel with Promise.allSettled so one failure
    // doesn't abort the rest.
    const tasks = temperatures.map((temp, i) =>
      this.generateOne(request, temp, i, config)
    );
    const settled = await Promise.allSettled(tasks);

    const candidates: Candidate[] = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value) {
        candidates.push(res.value);
      } else if (res.status === 'rejected') {
        Logger.warn(`[BestOfN] candidate rejected: ${String(res.reason)}`);
      }
    }
    if (candidates.length === 0) {
      throw new Error('All candidates failed to generate');
    }
    return candidates;
  }

  // ============================================================
  // Single-candidate generation
  // ============================================================

  private async generateOne(
    request: GenerationRequest,
    temperature: number,
    index: number,
    config: BestOfNConfig
  ): Promise<Candidate | null> {
    if (!this.apiService) return null;

    const agent = this.factory.createAgent(AgentRole.CODER, {
      task: 'best-of-n',
      candidateIndex: index,
      temperature,
    });

    const userPrompt = this.buildPrompt(request, index);

    // Per-candidate timeout
    const timeoutSignal = new AbortController();
    const timer = setTimeout(() => timeoutSignal.abort(), config.candidateTimeoutMs);

    let raw = '';
    try {
      this.factory.setStatus(agent.id, 'working');
      for await (const chunk of this.apiService.chatStream(
        {
          messages: [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          options: {
            model: agent.model,
            temperature,
            maxTokens: Math.min(agent.tokenBudget, 4000),
          },
        } as any,
        timeoutSignal.signal
      )) {
        if (typeof chunk === 'string') raw += chunk;
      }
      this.factory.setStatus(agent.id, 'done');
    } catch (e: any) {
      this.factory.setStatus(agent.id, 'error');
      Logger.warn(`[BestOfN] candidate ${index} failed: ${e?.message ?? String(e)}`);
      this.factory.release(agent.id);
      clearTimeout(timer);
      return null;
    }
    clearTimeout(timer);

    const code = this.extractCode(raw);
    if (!code.trim()) {
      Logger.warn(`[BestOfN] candidate ${index} returned empty code`);
      this.factory.release(agent.id);
      return null;
    }

    const candidate: Candidate = {
      id: `cand_${Date.now()}_${index}`,
      code,
      agentId: agent.id,
      worktreeId: null, // populated by orchestrator if worktrees are used
      filePath: request.filePath,
      verificationScore: 0,
      verificationVerdict: 'warning',
      metrics: {
        complexity: 0,
        readability: 0,
        performance: 0,
        testsPassing: 0,
        changedLines: 0,
      },
      finalScore: 0,
      temperature,
      generatedAt: Date.now(),
      metadata: {
        language: request.language,
        description: request.description,
      },
    };

    this.factory.release(agent.id);
    return candidate;
  }

  // ============================================================
  // Prompt building
  // ============================================================

  /**
   * Build a prompt for candidate `index`. We slightly rephrase the prompt
   * across candidates to encourage the model to explore different paths.
   */
  private buildPrompt(request: GenerationRequest, index: number): string {
    const stylisticHints = [
      'Favor clarity and readability.',
      'Favor minimal diffs — change as little as possible.',
      'Favor performance and efficiency.',
      'Favor defensive coding with thorough error handling.',
      'Favor idiomatic patterns for the language.',
    ];
    const hint = stylisticHints[index % stylisticHints.length];

    const sections = [
      `Task: ${request.description}`,
      `File: ${request.filePath}`,
      `Language: ${request.language}`,
      `Style hint: ${hint}`,
      '',
    ];
    if (request.extraContext) {
      sections.push('### Context');
      sections.push(request.extraContext);
      sections.push('');
    }
    if (request.existingCode) {
      sections.push('### Current file contents');
      sections.push('```' + request.language);
      sections.push(request.existingCode.substring(0, 6000));
      sections.push('```');
      sections.push('');
    }
    sections.push(
      'Output ONLY the new file contents inside a single fenced code block. Do not add prose explanations.'
    );
    return sections.join('\n');
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** Compute N temperatures centered on baseTemperature with `spread`. */
  private computeTemperatures(config: BestOfNConfig): number[] {
    const out: number[] = [];
    if (config.n === 1) return [config.baseTemperature];
    const step = config.temperatureSpread / (config.n - 1);
    const start = config.baseTemperature - config.temperatureSpread / 2;
    for (let i = 0; i < config.n; i++) {
      out.push(Math.max(0, Math.min(1, start + step * i)));
    }
    return out;
  }

  /** Pull the first fenced code block out of a model response. */
  private extractCode(text: string): string {
    const m = text.match(/```(?:[a-zA-Z]+)?\s*\n?([\s\S]*?)```/);
    if (m) return m[1].trim();
    return text.trim();
  }
}
