/**
 * BestOfNOrchestrator.ts
 * Phase 18.4 — Full Best-of-N pipeline
 *
 * generate → score → select → apply
 *
 * Hooks into MultiAgentOrchestrator: when a task is flagged high-risk,
 * the orchestrator can call `runForTask()` to produce N candidates,
 * pick a winner, and return it in place of a normal single-shot CODER call.
 */

import * as vscode from 'vscode';
import {
  BestOfNConfig,
  Candidate,
  DEFAULT_BEST_OF_N_CONFIG,
  SelectionResult,
  SelectionStrategy,
} from './BestOfNTypes';
import { CandidateGenerator, GenerationRequest } from './CandidateGenerator';
import { CandidateScorer } from './CandidateScorer';
import { CandidateSelector } from './CandidateSelector';
import { IsolatedExecutor, IsolatedExecutorOptions } from '../worktree/IsolatedExecutor';
import { WorktreeManager } from '../worktree/WorktreeManager';
import { ApiService } from '../../ApiService';
import { Logger } from '../../../utils/Logger';

// ============================================================

export interface BestOfNEvent {
  type:
    | 'started'
    | 'candidate-generated'
    | 'candidate-scored'
    | 'selection-started'
    | 'selection-completed'
    | 'completed'
    | 'failed';
  timestamp: number;
  message?: string;
  candidate?: Candidate;
  data?: any;
}

export interface BestOfNRunResult {
  selection: SelectionResult;
  allCandidates: Candidate[];
  durationMs: number;
}

// ============================================================

export class BestOfNOrchestrator {
  private static instance: BestOfNOrchestrator;

  private generator: CandidateGenerator;
  private scorer: CandidateScorer;
  private selector: CandidateSelector;
  private worktreeManager: WorktreeManager;
  private isolatedExecutor: IsolatedExecutor;
  private apiService: ApiService | null = null;
  private config: BestOfNConfig = { ...DEFAULT_BEST_OF_N_CONFIG };

  private readonly _onEvent = new vscode.EventEmitter<BestOfNEvent>();
  readonly onEvent = this._onEvent.event;

  private constructor() {
    this.generator = CandidateGenerator.getInstance();
    this.scorer = CandidateScorer.getInstance();
    this.selector = CandidateSelector.getInstance();
    this.worktreeManager = WorktreeManager.getInstance();
    this.isolatedExecutor = IsolatedExecutor.getInstance();
  }

  static getInstance(): BestOfNOrchestrator {
    if (!BestOfNOrchestrator.instance) {
      BestOfNOrchestrator.instance = new BestOfNOrchestrator();
    }
    return BestOfNOrchestrator.instance;
  }

  initialize(apiService: ApiService, config?: Partial<BestOfNConfig>): void {
    this.apiService = apiService;
    this.generator.setApiService(apiService);
    this.selector.setApiService(apiService);
    if (config) this.config = { ...this.config, ...config };
    Logger.info('[BestOfN] Orchestrator initialized');
  }

  getConfig(): BestOfNConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<BestOfNConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ============================================================
  // Main pipeline
  // ============================================================

  /**
   * Run the full pipeline. Returns the winning candidate plus all runners
   * (which the caller can present to the user as alternatives).
   */
  async run(
    request: GenerationRequest,
    overrideConfig?: Partial<BestOfNConfig>
  ): Promise<BestOfNRunResult> {
    if (!this.apiService) {
      throw new Error('BestOfNOrchestrator not initialized');
    }
    const config = { ...this.config, ...overrideConfig };
    const startTime = Date.now();

    this.emit({
      type: 'started',
      timestamp: Date.now(),
      message: `Generating ${config.n} candidates`,
    });

    // ========== 1. Generate N candidates ==========
    let candidates: Candidate[];
    try {
      candidates = await this.generator.generate(request, config);
    } catch (e: any) {
      this.emit({
        type: 'failed',
        timestamp: Date.now(),
        message: `Generation failed: ${e?.message ?? String(e)}`,
      });
      throw e;
    }

    // Optionally assign each candidate to its own worktree for isolation
    if (config.useWorktrees) {
      await this.attachWorktreesToCandidates(candidates, request).catch((e) =>
        Logger.warn(`[BestOfN] worktree attach failed: ${String(e)}`)
      );
    }

    for (const c of candidates) {
      this.emit({
        type: 'candidate-generated',
        timestamp: Date.now(),
        candidate: c,
      });
    }

    // ========== 2. Score each candidate ==========
    try {
      await this.scorer.scoreAll(candidates, config, request.existingCode);
    } catch (e: any) {
      Logger.warn(`[BestOfN] Scoring failed: ${String(e)}`);
    }
    for (const c of candidates) {
      this.emit({
        type: 'candidate-scored',
        timestamp: Date.now(),
        candidate: c,
        data: { finalScore: c.finalScore, metrics: c.metrics },
      });
    }

    // ========== 3. Select winner ==========
    this.emit({
      type: 'selection-started',
      timestamp: Date.now(),
      message: `Strategy: ${config.strategy}`,
    });
    const selection = await this.selector.select(candidates, config.strategy);
    this.emit({
      type: 'selection-completed',
      timestamp: Date.now(),
      candidate: selection.winner,
      data: { rationale: selection.rationale, runners: selection.runners.length },
    });

    // ========== 4. Cleanup non-winning worktrees ==========
    if (config.useWorktrees) {
      await this.cleanupRunnerWorktrees(selection).catch((e) =>
        Logger.warn(`[BestOfN] runner cleanup failed: ${String(e)}`)
      );
    }

    const result: BestOfNRunResult = {
      selection,
      allCandidates: candidates,
      durationMs: Date.now() - startTime,
    };

    this.emit({
      type: 'completed',
      timestamp: Date.now(),
      message: `Winner: ${selection.winner.id} — score ${selection.winner.finalScore}/100`,
      data: result,
    });
    return result;
  }

  // ============================================================
  // High-risk task detection (MultiAgentOrchestrator integration)
  // ============================================================

  /**
   * Invoked by MultiAgentOrchestrator when a task is flagged as high risk.
   * Runs best-of-N and returns the winning code to be used as the task result.
   *
   * Returns null if the pipeline failed — caller should fall back to a normal
   * single-shot CODER call.
   */
  async runForTask(input: {
    taskId: string;
    description: string;
    filePath: string;
    language: string;
    existingCode?: string;
    extraContext?: string;
  }): Promise<string | null> {
    try {
      const result = await this.run({
        taskId: input.taskId,
        description: input.description,
        filePath: input.filePath,
        language: input.language,
        existingCode: input.existingCode,
        extraContext: input.extraContext,
      });
      return result.selection.winner.code;
    } catch (e: any) {
      Logger.warn(`[BestOfN] runForTask failed: ${String(e)}`);
      return null;
    }
  }

  /** Determine whether a task should use best-of-N based on its risk level. */
  shouldUseBestOfN(task: { metadata?: Record<string, unknown> }): boolean {
    if (!task.metadata) return false;
    const risk = (task.metadata.risk as string) ?? 'low';
    return risk === 'high' || risk === 'critical';
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async attachWorktreesToCandidates(
    candidates: Candidate[],
    request: GenerationRequest
  ): Promise<void> {
    // Create a worktree per candidate in parallel
    const tasks = candidates.map(async (c, i) => {
      try {
        const wt = await this.worktreeManager.create(undefined, {
          label: `${request.description.substring(0, 30)} · cand ${i + 1}`,
        });
        c.worktreeId = wt.id;
        // Write the candidate's code into the worktree so the user can
        // diff / inspect it later if needed.
        if (request.filePath) {
          IsolatedExecutor.writeFileInWorktree(wt.path, request.filePath, c.code);
        }
      } catch (e) {
        Logger.warn(`[BestOfN] Failed to attach worktree to candidate ${c.id}: ${String(e)}`);
      }
    });
    await Promise.allSettled(tasks);
  }

  private async cleanupRunnerWorktrees(selection: SelectionResult): Promise<void> {
    for (const runner of selection.runners) {
      if (!runner.worktreeId) continue;
      await this.worktreeManager.abandon(runner.worktreeId).catch(() => null);
    }
  }

  private emit(event: BestOfNEvent): void {
    this._onEvent.fire(event);
  }

  dispose(): void {
    this._onEvent.dispose();
  }
}
