/**
 * Verifier service barrel — Phase 18.2
 */

export { VerificationOrchestrator } from './VerificationOrchestrator';
export { SyntaxVerifier } from './SyntaxVerifier';
export { LogicVerifier } from './LogicVerifier';
export { SecurityVerifier } from './SecurityVerifier';
export {
  DEFAULT_VERIFICATION_CONFIG,
  SEVERITY_WEIGHTS,
  computeScore,
  computeVerdict,
} from './VerifierTypes';
export type {
  VerificationSeverity,
  VerificationCategory,
  VerificationStatus,
  VerificationResult,
  VerificationReport,
  VerificationConfig,
} from './VerifierTypes';
export type { LogicVerifierInput } from './LogicVerifier';
