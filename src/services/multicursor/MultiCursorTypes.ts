/**
 * Multi-Cursor Types
 *
 * Type definitions for the multi-cursor edit system.
 */

import * as vscode from 'vscode';
import { DiffResult } from '../diff/DiffTypes';

// ============ Enums ============

export enum MultiCursorEditMode {
  IDENTICAL = 'identical',
  CONTEXTUAL = 'contextual',
  SEQUENTIAL = 'sequential',
}

export enum MultiCursorStatus {
  IDLE = 'idle',
  DETECTING = 'detecting',
  INPUT = 'input',
  GENERATING = 'generating',
  PREVIEW = 'preview',
  APPLYING = 'applying',
  COMPLETE = 'complete',
  CANCELLED = 'cancelled',
}

// ============ Cursor Types ============

export interface CursorContext {
  beforeText: string;
  afterText: string;
  lineContent: string;
  indentation: string;
  surroundingLines: string[];
  containingSymbol: string | null;
  language: string;
}

export interface CursorPosition {
  id: string;
  index: number;
  selection: vscode.Selection;
  range: vscode.Range;
  content: string;
  lineNumber: number;
  column: number;
  context: CursorContext;
}

// ============ Session Types ============

export interface MultiCursorSession {
  id: string;
  mode: MultiCursorEditMode;
  cursors: CursorPosition[];
  prompt: string;
  status: MultiCursorStatus;
  edits: Map<string, CursorEdit>;
  originalSelections: vscode.Selection[];
  editor: vscode.TextEditor;
  startTime: number;
}

// ============ Edit Types ============

export interface CursorEdit {
  cursorId: string;
  originalContent: string;
  generatedContent: string;
  diffResult: DiffResult | null;
  status: 'pending' | 'accepted' | 'rejected' | 'error';
  error: string | null;
  tokens: number;
  timing: number;
}

// ============ Result Types ============

export interface MultiCursorEditResult {
  sessionId: string;
  totalCursors: number;
  accepted: number;
  rejected: number;
  errors: number;
  edits: CursorEdit[];
  finalContent: string;
}

export interface MultiCursorProgress {
  current: number;
  total: number;
  currentCursorId: string;
  phase: 'generating' | 'applying';
  message: string;
}

// ============ Pattern Types ============

export interface CursorPattern {
  type: 'same_content' | 'same_line_pattern' | 'mixed';
  similarity: number;
  commonPrefix: string;
  commonSuffix: string;
}

// ============ Callbacks ============

export type CursorEditCallback = (cursorId: string, edit: CursorEdit) => void;
