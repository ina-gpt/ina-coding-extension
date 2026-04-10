import * as vscode from 'vscode';

// ============ Configuration ============

export interface GhostTextConfig {
  enabled: boolean;
  color: string;
  opacity: number;
  fontStyle: 'normal' | 'italic';
  showDelay: number;
  fadeInDuration: number;
  maxPreviewLines: number;
  enableWordAccept: boolean;
  enableLineAccept: boolean;
  enableCycling: boolean;
  cycleWithTab: boolean;
  dismissOnEdit: boolean;
  dismissOnCursorMove: boolean;
  showIndicator: boolean;
}

export const DEFAULT_GHOST_TEXT_CONFIG: GhostTextConfig = {
  enabled: true,
  color: '#808080',
  opacity: 0.6,
  fontStyle: 'italic',
  showDelay: 0,
  fadeInDuration: 150,
  maxPreviewLines: 10,
  enableWordAccept: true,
  enableLineAccept: true,
  enableCycling: true,
  cycleWithTab: false,
  dismissOnEdit: true,
  dismissOnCursorMove: true,
  showIndicator: true,
};

// ============ Style ============

export interface GhostTextStyle {
  color: string;
  opacity: number;
  fontStyle: 'normal' | 'italic';
  backgroundColor: string | null;
  border: string | null;
}

export const DEFAULT_GHOST_TEXT_STYLE: GhostTextStyle = {
  color: '#808080',
  opacity: 0.6,
  fontStyle: 'italic',
  backgroundColor: null,
  border: null,
};

// ============ Items & Sessions ============

export interface GhostTextItem {
  id: string;
  text: string;
  displayText: string;
  range: vscode.Range;
  position: vscode.Position;
  language: string;
  confidence: number;
  source: 'model' | 'cache' | 'fallback';
  lineCount: number;
  isTruncated: boolean;
  fullText: string;
  tokens: number;
}

export enum GhostTextSessionState {
  IDLE = 'idle',
  SHOWING = 'showing',
  PARTIAL_ACCEPT = 'partial_accept',
  ACCEPTING = 'accepting',
  DISMISSING = 'dismissing',
}

export interface GhostTextSession {
  id: string;
  items: GhostTextItem[];
  currentIndex: number;
  state: GhostTextSessionState;
  document: vscode.TextDocument;
  position: vscode.Position;
  startTime: number;
  endTime: number | null;
  partialAcceptPosition: number;
  acceptedText: string;
}

// ============ Accept/Dismiss ============

export type AcceptMode = 'full' | 'word' | 'line' | 'char' | 'toPosition';

export interface PartialAcceptResult {
  acceptedText: string;
  remainingText: string;
  newPosition: vscode.Position;
  isComplete: boolean;
  mode: AcceptMode;
}

export interface CycleResult {
  previousIndex: number;
  newIndex: number;
  totalCount: number;
  item: GhostTextItem;
}

// ============ Metrics ============

export interface GhostTextMetrics {
  totalShown: number;
  acceptedFull: number;
  acceptedPartial: number;
  dismissed: number;
  cycled: number;
  averageShowDuration: number;
  wordAcceptCount: number;
  lineAcceptCount: number;
  acceptanceRate: number;
}
