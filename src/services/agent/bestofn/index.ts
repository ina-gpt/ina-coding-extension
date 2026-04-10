/**
 * Best-of-N service barrel — Phase 18.4
 */

export { BestOfNOrchestrator } from './BestOfNOrchestrator';
export { CandidateGenerator } from './CandidateGenerator';
export { CandidateScorer } from './CandidateScorer';
export { CandidateSelector } from './CandidateSelector';
export {
  SelectionStrategy,
  DEFAULT_BEST_OF_N_CONFIG,
} from './BestOfNTypes';
export type {
  Candidate,
  CandidateMetrics,
  BestOfNConfig,
  SelectionResult,
} from './BestOfNTypes';
export type { GenerationRequest } from './CandidateGenerator';
export type { BestOfNEvent, BestOfNRunResult } from './BestOfNOrchestrator';
