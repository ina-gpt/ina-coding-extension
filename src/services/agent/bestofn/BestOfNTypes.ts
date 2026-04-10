/**
 * BestOfNTypes.ts
 * Phase 18.4 — Best-of-N Selection type definitions
 *
 * Generate N candidate solutions in parallel, score each on multiple
 * dimensions, then pick the winner using a selection strategy.
 */

// ============================================================

export interface CandidateMetrics {
  /** Cyclomatic complexity (lower = better) */
  complexity: number;
  /** Readability heuristic score 0..100 (higher = better) */
  readability: number;
  /** Estimated performance score 0..100 (higher = better) */
  performance: number;
  /** Number of tests covering the changed code (0 if no tests present) */
  testsPassing: number;
  /** Total number of changed lines (lower = smaller change = usually better) */
  changedLines: number;
}

export interface Candidate {
  id: string;
  /** Raw code produced by the CODER agent */
  code: string;
  /** Agent instance id that produced this candidate */
  agentId: string;
  /** Optional worktree id where this candidate lives (for parallel isolation) */
  worktreeId: string | null;
  /** Optional file path the candidate targets */
  filePath: string;
  /** Verification score 0..100 from the Verifier */
  verificationScore: number;
  /** Verification verdict */
  verificationVerdict: 'pass' | 'warning' | 'fail';
  /** Per-dimension metrics */
  metrics: CandidateMetrics;
  /** Final aggregate score 0..100 (computed by scorer) */
  finalScore: number;
  /** Temperature the agent was sampled at (for diversity) */
  temperature: number;
  /** Epoch ms of generation */
  generatedAt: number;
  /** Free-form metadata */
  metadata: Record<string, unknown>;
}

// ============================================================
// Selection strategy
// ============================================================

export enum SelectionStrategy {
  HIGHEST_SCORE = 'highest_score',
  LOWEST_COMPLEXITY = 'lowest_complexity',
  MOST_READABLE = 'most_readable',
  /** Ask the REVIEWER agent to compare candidates and pick */
  CONSENSUS = 'consensus',
  /** Present to user — caller must surface the UI */
  HUMAN_PICK = 'human_pick',
}

// ============================================================
// Config
// ============================================================

export interface BestOfNConfig {
  /** Number of candidates to generate */
  n: number;
  strategy: SelectionStrategy;
  /** Weight sum should equal 1.0 */
  weightScore: number;
  weightComplexity: number;
  weightReadability: number;
  weightTests: number;
  /** Temperature spread — e.g. 0.3 means candidates sampled at [t, t±0.15, ...] */
  temperatureSpread: number;
  /** Base temperature the middle candidate is sampled at */
  baseTemperature: number;
  /** Timeout per candidate in ms */
  candidateTimeoutMs: number;
  /** Use isolated worktrees for each candidate (default true) */
  useWorktrees: boolean;
}

export const DEFAULT_BEST_OF_N_CONFIG: BestOfNConfig = {
  n: 3,
  strategy: SelectionStrategy.HIGHEST_SCORE,
  weightScore: 0.4,
  weightComplexity: 0.2,
  weightReadability: 0.2,
  weightTests: 0.2,
  temperatureSpread: 0.3,
  baseTemperature: 0.3,
  candidateTimeoutMs: 120_000,
  useWorktrees: true,
};

// ============================================================
// Selection result
// ============================================================

export interface SelectionResult {
  winner: Candidate;
  runners: Candidate[];
  strategy: SelectionStrategy;
  /** Why this candidate won (diff of scores, REVIEWER rationale, etc.) */
  rationale: string;
  durationMs: number;
}
