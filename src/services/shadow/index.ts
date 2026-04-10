/**
 * Phase 17.1 — Shadow Workspace
 *
 * Barrel exports for the shadow workspace feature.
 */
export { ShadowFileSystemProvider } from './ShadowFileSystemProvider';
export { ShadowWorkspaceManager } from './ShadowWorkspaceManager';
export { ShadowTreeDataProvider, ShadowTreeItem } from './ShadowTreeDataProvider';
export { ShadowIntegration } from './ShadowIntegration';
export {
  ShadowFileStatus,
  ShadowFile,
  ShadowSession,
  ShadowCheckpoint,
  ShadowDiff,
  DiffHunk,
  ShadowWorkspaceEventType,
  ShadowWorkspaceEvent,
  ShadowConfig,
  DEFAULT_SHADOW_CONFIG,
} from './ShadowTypes';
