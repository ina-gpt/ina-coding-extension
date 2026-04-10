/**
 * Phase 15.5 — Bug Finder
 * Barrel exports for the Bug Finder module.
 */
export {
  BugReport,
  BugFix,
  BugSeverity,
  BugCategory,
  ScanMode,
  ScanResult,
  ScanProgress,
  ProjectScanOptions,
  RawBugEntry,
  SEVERITY_ORDER,
  BUG_SCAN_PROMPT,
  isValidSeverity,
  isValidCategory,
} from './BugFinderTypes';

export { BugFinderService } from './BugFinderService';
export { BugFinderDecorator } from './BugFinderDecorator';
