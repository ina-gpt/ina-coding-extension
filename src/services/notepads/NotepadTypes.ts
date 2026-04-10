/**
 * NotepadTypes.ts
 * Phase 16.4 — Persistent scratch pads for pinned context
 */

export enum NotepadType {
  TEXT = 'text',
  CODE = 'code',
  API_SPEC = 'api',
  DATA = 'data',
  REQUIREMENTS = 'requirements',
}

export interface Notepad {
  id: string;
  name: string;
  type: NotepadType;
  content: string;
  /** Pinned = always included in chat context */
  isPinned: boolean;
  /** Attached = included in current conversation only */
  isAttached: boolean;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
  /** Path on disk if persisted as a workspace file */
  filePath: string | null;
}

export interface NotepadConfig {
  storageLocation: 'workspace' | 'global';
  workspaceDir: string;
  maxPinnedTokens: number;
  maxAttachedTokens: number;
}

export const DEFAULT_NOTEPAD_CONFIG: NotepadConfig = {
  storageLocation: 'workspace',
  workspaceDir: '.ina-coding/notepads',
  maxPinnedTokens: 2000,
  maxAttachedTokens: 4000,
};

/** File extension by notepad type — used when persisting to disk */
export const TYPE_EXTENSIONS: Record<NotepadType, string> = {
  [NotepadType.TEXT]: '.md',
  [NotepadType.CODE]: '.ts',
  [NotepadType.API_SPEC]: '.md',
  [NotepadType.DATA]: '.json',
  [NotepadType.REQUIREMENTS]: '.md',
};

/** Display label for each type */
export const TYPE_LABELS: Record<NotepadType, string> = {
  [NotepadType.TEXT]: 'Text',
  [NotepadType.CODE]: 'Code',
  [NotepadType.API_SPEC]: 'API Spec',
  [NotepadType.DATA]: 'Data',
  [NotepadType.REQUIREMENTS]: 'Requirements',
};

/** Notepad index file (relative to workspaceDir) */
export const NOTEPAD_INDEX_FILE = '.index.json';

/**
 * Persisted shape of a notepad in the index file (omits content,
 * which lives in the per-notepad file on disk).
 */
export interface NotepadIndexEntry {
  id: string;
  name: string;
  type: NotepadType;
  isPinned: boolean;
  isAttached: boolean;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
  filePath: string;
}

export interface NotepadIndex {
  version: number;
  notepads: NotepadIndexEntry[];
}

/** Lightweight token estimator (~4 chars per token) */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
