import * as vscode from 'vscode';

// ============ Enums ============

export enum CompletionTriggerKind {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
  TRIGGER_CHARACTER = 'triggerCharacter',
  CONTINUATION = 'continuation',
}

export enum CompletionStatus {
  IDLE = 'idle',
  PENDING = 'pending',
  FETCHING = 'fetching',
  DISPLAYING = 'displaying',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

// ============ Context Interfaces ============

export interface CursorContext {
  lineContent: string;
  linePrefix: string;
  lineSuffix: string;
  wordAtCursor: string;
  wordRange: vscode.Range | null;
  previousWord: string | null;
  nextWord: string | null;
  bracketDepth: number;
  parenDepth: number;
}

export interface RecentEdit {
  range: vscode.Range;
  text: string;
  timestamp: number;
}

export interface CompletionContext {
  triggerKind: CompletionTriggerKind;
  triggerCharacter: string | null;
  document: vscode.TextDocument;
  position: vscode.Position;
  prefix: string;
  suffix: string;
  prefixLines: string[];
  suffixLines: string[];
  language: string;
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  indentation: string;
  isInString: boolean;
  isInComment: boolean;
  isInImport: boolean;
  recentEdits: RecentEdit[];
  cursorContext: CursorContext;
}

// ============ Request/Response Interfaces ============

export interface CompletionRequest {
  id: string;
  context: CompletionContext;
  timestamp: number;
  abortController: AbortController;
}

export interface CompletionItem {
  id: string;
  insertText: string;
  displayText: string;
  range: vscode.Range;
  filterText: string;
  sortText: string;
  documentation: string | null;
  confidence: number;
  source: 'model' | 'cache' | 'fallback';
  tokens: number;
  latency: number;
}

export interface CompletionResponse {
  requestId: string;
  items: CompletionItem[];
  isIncomplete: boolean;
  timing: {
    total: number;
    model: number;
    processing: number;
  };
  cached: boolean;
  model: string;
}

// ============ Metrics & Config ============

export interface CompletionMetrics {
  totalRequests: number;
  acceptedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  averageLatency: number;
  cacheHitRate: number;
  acceptanceRate: number;
}

export interface CompletionConfig {
  enabled: boolean;
  debounceMs: number;
  maxCompletions: number;
  minConfidence: number;
  maxTokens: number;
  triggerCharacters: string[];
  disabledLanguages: string[];
  cacheEnabled: boolean;
  cacheTTLMs: number;
}

// ============ Constants ============

export const DEFAULT_TRIGGER_CHARACTERS: string[] = [
  '.', '(', '{', '[', ',', ':', '<', '"', "'", '/', '=', ' ', '\n',
];

export const DEFAULT_CONFIG: CompletionConfig = {
  enabled: true,
  debounceMs: 300,
  maxCompletions: 1,
  minConfidence: 0.3,
  maxTokens: 128,
  triggerCharacters: ['.', '(', '{', '[', ',', ':', ' '],
  disabledLanguages: ['plaintext', 'markdown', 'json'],
  cacheEnabled: true,
  cacheTTLMs: 60000,
};
