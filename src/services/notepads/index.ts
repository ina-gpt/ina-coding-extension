/**
 * Notepads service barrel — Phase 16.4
 */

export { NotepadManager } from './NotepadManager';
export {
  NotepadType,
  DEFAULT_NOTEPAD_CONFIG,
  TYPE_EXTENSIONS,
  TYPE_LABELS,
  estimateTokens as estimateNotepadTokens,
} from './NotepadTypes';
export type {
  Notepad,
  NotepadConfig,
  NotepadIndex,
  NotepadIndexEntry,
} from './NotepadTypes';
