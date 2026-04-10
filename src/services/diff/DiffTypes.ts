/**
 * Diff Types
 *
 * Type definitions for the diff preview system.
 */

import * as vscode from 'vscode';

// ============ Enums ============

export enum DiffLineType {
  UNCHANGED = 'unchanged',
  ADDED = 'added',
  REMOVED = 'removed',
  MODIFIED = 'modified',
}

export enum DiffViewMode {
  INLINE = 'inline',
  SIDE_BY_SIDE = 'sideBySide',
  UNIFIED = 'unified',
}

// ============ Core Types ============

export interface DiffLine {
  lineNumber: number;
  originalLineNumber: number | null;
  modifiedLineNumber: number | null;
  type: DiffLineType;
  content: string;
  originalContent: string | null;
}

export interface DiffHunk {
  id: string;
  startLine: number;
  endLine: number;
  originalStartLine: number;
  originalEndLine: number;
  lines: DiffLine[];
  type: 'addition' | 'deletion' | 'modification';
  selected: boolean;
  applied: boolean;
}

export interface DiffResult {
  hunks: DiffHunk[];
  originalLines: number;
  modifiedLines: number;
  additions: number;
  deletions: number;
  modifications: number;
  similarity: number;
}

// ============ State Types ============

export interface DiffPreviewState {
  sessionId: string;
  originalContent: string;
  modifiedContent: string;
  currentContent: string;
  diffResult: DiffResult;
  viewMode: DiffViewMode;
  selectedHunks: Set<string>;
  appliedHunks: Set<string>;
  isEditing: boolean;
  editedContent: string | null;
}

// ============ Action Types ============

export interface DiffAction {
  type: 'accept' | 'reject' | 'acceptHunk' | 'rejectHunk' | 'acceptLine' | 'rejectLine' | 'edit' | 'toggleHunk';
  target?: string | number;
}

// ============ Decoration Types ============

export interface DiffDecoration {
  range: vscode.Range;
  type: DiffLineType;
  hunkId: string;
  lineIndex: number;
}

// ============ Stats ============

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  totalLines: number;
}
