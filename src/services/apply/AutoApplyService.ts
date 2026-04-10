/**
 * Phase 15.2 — AutoApplyService (alias)
 *
 * The concrete implementation lives in `ApplyService.ts` (this class and the
 * "AutoApply" name are aliases for the same singleton). This file exists so
 * that the Phase 15.2 spec filename is discoverable in the codebase and so
 * external callers can use either `ApplyService` or `AutoApplyService`
 * without breaking.
 *
 * Do NOT add logic here — edit `ApplyService.ts` instead.
 */

export { ApplyService as AutoApplyService } from './ApplyService';
export type { ApplyResult, ApplyPreview, ApplyStrategy, CodeBlockInfo } from './ApplyTypes';
