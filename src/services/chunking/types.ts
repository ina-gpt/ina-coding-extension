/**
 * Code Chunking Types
 */

export type ChunkType =
  | 'function' | 'method' | 'class' | 'interface' | 'type' | 'enum'
  | 'module' | 'import' | 'export' | 'variable' | 'constant'
  | 'comment' | 'documentation' | 'block' | 'unknown';

export type ChunkingStrategy = 'ast' | 'semantic' | 'sliding' | 'hybrid';

export interface CodeChunk {
  id: string;
  type: ChunkType;
  content: string;
  language: string;
  file: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  name?: string;
  signature?: string;
  documentation?: string;
  parentName?: string;
  parentType?: ChunkType;
  tokens: number;
  characters: number;
  imports?: string[];
  dependencies?: string[];
  symbols?: SymbolReference[];
  overlapBefore?: string;
  overlapAfter?: string;
  depth: number;
  path: string[];
  children?: string[];
  embeddingText?: string;
  hash?: string;
}

export interface SymbolReference {
  name: string;
  type: 'call' | 'reference' | 'import' | 'export' | 'type';
  line: number;
  column: number;
}

export interface ASTNode {
  type: string;
  text: string;
  startPosition: Position;
  endPosition: Position;
  children: ASTNode[];
  namedChildren: ASTNode[];
  parent?: ASTNode;
  fieldName?: string;
}

export interface Position {
  row: number;
  column: number;
}

export interface ParseResult {
  tree: ASTNode;
  language: string;
  errors: ParseError[];
  duration: number;
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  type: 'error' | 'warning';
}

export interface ChunkingOptions {
  strategy: ChunkingStrategy;
  maxChunkTokens: number;
  minChunkTokens: number;
  targetChunkTokens: number;
  overlapTokens: number;
  overlapLines: number;
  includeImports: boolean;
  includeComments: boolean;
  includeDocumentation: boolean;
  maxDepth: number;
  flattenSmallChunks: boolean;
}

export interface ChunkingResult {
  chunks: CodeChunk[];
  stats: ChunkingStats;
  errors: ChunkingError[];
}

export interface ChunkingStats {
  totalChunks: number;
  byType: Record<string, number>;
  totalTokens: number;
  avgChunkTokens: number;
  maxChunkTokens: number;
  minChunkTokens: number;
  totalLines: number;
  processingTime: number;
}

export interface ChunkingError {
  file: string;
  line?: number;
  message: string;
  recoverable: boolean;
}

export interface LanguageDefinition {
  id: string;
  name: string;
  extensions: string[];
  parserName: string;
  nodeTypes: LanguageNodeTypes;
  patterns: LanguagePatterns;
}

export interface LanguageNodeTypes {
  function: string[];
  method?: string[];
  arrow_function?: string[];
  lambda?: string[];
  class: string[];
  interface?: string[];
  enum?: string[];
  type_alias?: string[];
  module?: string[];
  namespace?: string[];
  import: string[];
  export?: string[];
  variable: string[];
  constant?: string[];
  comment: string[];
  documentation?: string[];
  block?: string[];
}

export interface LanguagePatterns {
  functionName: (node: ASTNode) => string | undefined;
  className: (node: ASTNode) => string | undefined;
  functionSignature?: (node: ASTNode) => string | undefined;
  classSignature?: (node: ASTNode) => string | undefined;
  documentation?: (node: ASTNode, content: string) => string | undefined;
  importInfo?: (node: ASTNode) => ImportInfo | undefined;
}

export interface ImportInfo {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ProcessedChunk extends CodeChunk {
  searchableText: string;
  keywords: string[];
}

export interface ChunkBatch {
  chunks: CodeChunk[];
  file: string;
  language: string;
  totalTokens: number;
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  strategy: 'semantic',
  maxChunkTokens: 1500,
  minChunkTokens: 50,
  targetChunkTokens: 800,
  overlapTokens: 100,
  overlapLines: 5,
  includeImports: true,
  includeComments: true,
  includeDocumentation: true,
  maxDepth: 5,
  flattenSmallChunks: true,
};
