/**
 * Phase 15.2 — Auto-Apply Code Types
 */

export type ApplyStrategy = 'replace' | 'insert' | 'surgical' | 'create' | 'append';

export interface ApplyTarget {
  filePath: string | null;
  matchMethod: 'explicit' | 'filename_match' | 'content_match' | 'language_match' | 'new_file' | 'user_selected';
  confidence: number;
  alternatives: { filePath: string; confidence: number; reason: string }[];
}

export interface ApplyRegion {
  startLine: number;
  endLine: number;
  content: string;
  matchScore: number;
}

export interface ApplyResult {
  success: boolean;
  filePath: string;
  strategy: ApplyStrategy;
  linesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  error: string | null;
  undoId: string;
}

export interface ApplyPreview {
  targetFile: ApplyTarget;
  strategy: ApplyStrategy;
  diff: string;
  beforeContent: string;
  afterContent: string;
  regions: ApplyRegion[];
}

export interface CodeBlockInfo {
  code: string;
  language: string | null;
  filename: string | null;
  isComplete: boolean;
  hasFileHeader: boolean;
}
