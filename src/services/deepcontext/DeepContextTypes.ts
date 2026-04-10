/**
 * Phase 17.2 — Deep Context Types
 * Transitive resolution of type definitions, implementations, references.
 */

// ---------------------------------------------------------------------------
// Core definition types
// ---------------------------------------------------------------------------

export interface DeepDefinition {
  symbol: string;
  kind:
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'variable'
    | 'method'
    | 'property'
    | 'enum';
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  depth: number;
  relatedTo: string | null;
}

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

export interface DeepContextResult {
  primary: DeepDefinition;
  transitive: DeepDefinition[];
  totalTokens: number;
  truncated: boolean;
  resolvedDepth: number;
  maxDepthReached: boolean;
}

// ---------------------------------------------------------------------------
// Resolution options
// ---------------------------------------------------------------------------

export interface DeepContextOptions {
  maxDepth: number;
  maxTransitiveResults: number;
  maxTokens: number;
  includeImplementations: boolean;
  includeCallers: boolean;
  includeParentTypes: boolean;
  includeUsedTypes: boolean;
  excludeStdLib: boolean;
  excludeNodeModules: boolean;
}

export const DEFAULT_DEEP_OPTIONS: DeepContextOptions = {
  maxDepth: 2,
  maxTransitiveResults: 15,
  maxTokens: 6000,
  includeImplementations: true,
  includeCallers: false,
  includeParentTypes: true,
  includeUsedTypes: true,
  excludeStdLib: true,
  excludeNodeModules: true,
};

// ---------------------------------------------------------------------------
// Reference types
// ---------------------------------------------------------------------------

export type UsageType =
  | 'call'
  | 'import'
  | 'type_ref'
  | 'assignment'
  | 'extends'
  | 'other';

export interface ReferenceInfo {
  line: number;
  column: number;
  context: string;
  usageType: UsageType;
}

export interface ReferenceGroup {
  filePath: string;
  references: ReferenceInfo[];
}

// ---------------------------------------------------------------------------
// Primitives to skip during dependency extraction
// ---------------------------------------------------------------------------

export const TS_PRIMITIVES = new Set([
  'string',
  'number',
  'boolean',
  'void',
  'null',
  'undefined',
  'any',
  'never',
  'unknown',
  'object',
  'symbol',
  'bigint',
]);

// ---------------------------------------------------------------------------
// Supported definition kinds mapped from vscode.SymbolKind numeric values
// ---------------------------------------------------------------------------

export const SYMBOL_KIND_MAP: Record<number, DeepDefinition['kind']> = {
  5: 'class',
  11: 'interface',
  12: 'function',
  13: 'variable',
  6: 'method',
  7: 'property',
  10: 'enum',
  26: 'type',
};

// ---------------------------------------------------------------------------
// Cache entry used by DeepMentionHandler
// ---------------------------------------------------------------------------

export interface DeepCacheEntry<T> {
  value: T;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Re-export convenience type for reference resolution
// ---------------------------------------------------------------------------

export interface ReferencesResult {
  groups: ReferenceGroup[];
  totalCount: number;
}
