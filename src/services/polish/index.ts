/**
 * Phase 17.7 — Polish module barrel
 */
export {
  TypingIndicator,
  MessageEditManager,
  RegenerateManager,
  ConversationBranchManager,
  InputHistory,
  PlaceholderRotation,
  SoundManager,
} from './MicroInteractions';
export type {
  EditableMessage,
  RegenerateContext,
  ConversationBranchSnapshot,
} from './MicroInteractions';

export { EnhancedCodeBlockFeatures } from './EnhancedCodeBlockFeatures';
export type { CodeBlockFeatures } from './EnhancedCodeBlockFeatures';

export { LinkPreview } from './LinkPreview';
export type { LinkPreviewCard } from './LinkPreview';
