/**
 * Phase 17.2 — Deep Context
 * Barrel exports for the @Definitions deep context feature.
 */

export {
  DeepDefinition,
  DeepContextResult,
  DeepContextOptions,
  DEFAULT_DEEP_OPTIONS,
  ReferenceInfo,
  ReferenceGroup,
  ReferencesResult,
  DeepCacheEntry,
  UsageType,
  TS_PRIMITIVES,
  SYMBOL_KIND_MAP,
} from './DeepContextTypes';

export { DeepResolver } from './DeepResolver';
export { DeepContextFormatter } from './DeepContextFormatter';
export { DeepMentionHandler } from './DeepMentionHandler';
