/**
 * Phase 1.3 — ConfigManager re-export barrel
 *
 * The canonical implementation lives at `src/utils/ConfigManager.ts`.
 * This file re-exports it at the `src/services/` path for consistency with
 * Phase 1 documentation and to give callers a single stable import path.
 *
 * Do NOT add logic here — edit `src/utils/ConfigManager.ts` instead.
 */
export {
  ConfigManager,
  CONFIG_DEFAULTS,
} from '../utils/ConfigManager';
export type {
  GeneralConfig,
  ApiConfig,
  ModelsConfig,
  ChatConfig,
  CompletionConfig,
  InlineEditConfig,
  IndexingConfig,
  PrivacyConfig,
  UIConfig,
  AdvancedConfig,
  FullConfig,
} from '../utils/ConfigManager';

export {
  CONFIG_PRESETS,
  getPreset,
} from '../utils/ConfigPresets';
export type { ConfigPreset } from '../utils/ConfigPresets';
