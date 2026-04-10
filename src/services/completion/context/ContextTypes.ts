import * as vscode from 'vscode';
import { CursorContext } from '../CompletionTypes';

// ============ Prefix/Suffix Context ============

export interface PrefixContext {
  text: string;
  lines: string[];
  tokens: number;
  truncated: boolean;
  truncationPoint: number | null;
  lastCompleteStatement: number;
  lastImportLine: number;
}

export interface SuffixContext {
  text: string;
  lines: string[];
  tokens: number;
  truncated: boolean;
  firstCompleteStatement: number;
}

// ============ Import Context ============

export interface ImportSpecifier {
  name: string;
  alias: string | null;
  isType: boolean;
}

export interface ImportStatement {
  line: number;
  raw: string;
  type: 'esm' | 'commonjs' | 'python' | 'go' | 'rust' | 'java';
  source: string;
  specifiers: ImportSpecifier[];
  isDefault: boolean;
  isNamespace: boolean;
  isType: boolean;
  isDynamic: boolean;
}

export interface ImportContext {
  imports: ImportStatement[];
  totalCount: number;
  relevantImports: ImportStatement[];
  usedSymbols: string[];
  unusedImports: string[];
}

// ============ Related File Context ============

export interface RelatedFile {
  path: string;
  relativePath: string;
  language: string;
  similarity: number;
  relevanceScore: number;
  snippet: string;
  snippetRange: { start: number; end: number };
  symbols: string[];
  reason: 'import' | 'embedding' | 'same_directory' | 'recent_edit' | 'symbol_reference';
}

export interface RelatedFileContext {
  files: RelatedFile[];
  totalCount: number;
  maxIncluded: number;
  tokenBudget: number;
  tokensUsed: number;
}

// ============ Recent Edit Context ============

export interface SessionEdit {
  id: string;
  filePath: string;
  range: {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  };
  oldText: string;
  newText: string;
  timestamp: number;
  type: 'insert' | 'delete' | 'replace';
  language: string;
}

export interface EditPattern {
  pattern: string;
  frequency: number;
  lastOccurrence: number;
  examples: string[];
}

export interface RecentEditContext {
  edits: SessionEdit[];
  totalEdits: number;
  relevantEdits: SessionEdit[];
  editPatterns: EditPattern[];
}

// ============ File & Project Context ============

export interface DocumentSymbol {
  name: string;
  kind: string;
  range: { start: number; end: number };
  children: DocumentSymbol[];
}

export interface DiagnosticInfo {
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code: string | null;
}

export interface FileContext {
  path: string;
  relativePath: string;
  language: string;
  lineCount: number;
  size: number;
  lastModified: number;
  symbols: DocumentSymbol[];
  diagnostics: DiagnosticInfo[];
}

export interface ProjectContext {
  rootPath: string;
  name: string;
  type: 'node' | 'python' | 'rust' | 'go' | 'java' | 'unknown';
  configFiles: string[];
  dependencies: string[];
}

// ============ Token Budget ============

export interface TokenBudget {
  total: number;
  prefix: number;
  suffix: number;
  imports: number;
  relatedFiles: number;
  recentEdits: number;
  remaining: number;
}

export const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  total: 8000,
  prefix: 4000,
  suffix: 1500,
  imports: 500,
  relatedFiles: 1500,
  recentEdits: 500,
  remaining: 0,
};

// ============ Full Completion Context ============

export interface FullCompletionContext {
  prefix: PrefixContext;
  suffix: SuffixContext;
  imports: ImportContext;
  relatedFiles: RelatedFileContext;
  recentEdits: RecentEditContext;
  cursor: CursorContext;
  file: FileContext;
  project: ProjectContext;
  tokenBudget: TokenBudget;
}
