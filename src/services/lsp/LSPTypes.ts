import * as vscode from 'vscode';

export interface SymbolInfo {
  name: string;
  kind: vscode.SymbolKind;
  kindLabel: string;
  detail: string | null;
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  selectionRange: { startLine: number; startCol: number; endLine: number; endCol: number };
  containerName: string | null;
  children: SymbolInfo[] | null;
}

export interface TypeInfo {
  name: string;
  fullName: string;
  kind: TypeKind;
  members: TypeMember[] | null;
  parameters: TypeParameter[] | null;
  returnType: string | null;
  genericParams: string[] | null;
  baseTypes: string[] | null;
  implementedInterfaces: string[] | null;
  documentation: string | null;
  filePath: string;
  line: number;
}

export enum TypeKind {
  CLASS = 'class',
  INTERFACE = 'interface',
  TYPE_ALIAS = 'type',
  ENUM = 'enum',
  FUNCTION = 'function',
  METHOD = 'method',
  PROPERTY = 'property',
  VARIABLE = 'variable',
  PARAMETER = 'parameter',
  GENERIC = 'generic',
  UNION = 'union',
  INTERSECTION = 'intersection',
  LITERAL = 'literal',
  ARRAY = 'array',
  TUPLE = 'tuple',
  MAPPED = 'mapped',
  CONDITIONAL = 'conditional',
  UNKNOWN = 'unknown',
}

export interface TypeMember {
  name: string;
  kind: TypeKind;
  type: string;
  isOptional: boolean;
  isReadonly: boolean;
  isStatic: boolean;
  visibility: 'public' | 'private' | 'protected' | null;
  documentation: string | null;
  line: number | null;
}

export interface TypeParameter {
  name: string;
  type: string;
  isOptional: boolean;
  isRest: boolean;
  defaultValue: string | null;
}

export interface FunctionSignature {
  name: string;
  parameters: TypeParameter[];
  returnType: string;
  genericParams: string[] | null;
  overloads: FunctionSignature[] | null;
  documentation: string | null;
  isAsync: boolean;
  isGenerator: boolean;
  decorators: string[] | null;
  filePath: string;
  line: number;
}

export interface DefinitionLocation {
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  preview: string;
  symbolName: string;
  symbolKind: string;
}

export interface ReferenceInfo {
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  preview: string;
  isWrite: boolean;
  isDefinition: boolean;
  containerName: string | null;
}

export interface ReferenceGroup {
  filePath: string;
  references: ReferenceInfo[];
  count: number;
}

export interface DiagnosticInfo {
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  message: string;
  severity: DiagnosticSeverity;
  code: string | null;
  source: string | null;
  relatedInformation: { filePath: string; line: number; message: string }[] | null;
  tags: string[] | null;
}

export enum DiagnosticSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  HINT = 'hint',
}

export interface CallHierarchyItem {
  name: string;
  kind: string;
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  detail: string | null;
  callers: CallHierarchyItem[] | null;
  callees: CallHierarchyItem[] | null;
}

export interface TypeHierarchyItem {
  name: string;
  kind: string;
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  detail: string | null;
  parents: TypeHierarchyItem[] | null;
  children: TypeHierarchyItem[] | null;
}

export interface HoverInfo {
  content: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number } | null;
  language: string | null;
}

export interface CompletionContext {
  triggerKind: string;
  triggerCharacter: string | null;
  items: CompletionItemInfo[];
}

export interface CompletionItemInfo {
  label: string;
  kind: string;
  detail: string | null;
  documentation: string | null;
  insertText: string | null;
  sortText: string | null;
}

export interface LSPContextForAI {
  currentSymbol: SymbolInfo | null;
  currentType: TypeInfo | null;
  currentSignature: FunctionSignature | null;
  diagnostics: DiagnosticInfo[];
  relatedDefinitions: DefinitionLocation[];
  relatedReferences: ReferenceGroup[];
  callHierarchy: CallHierarchyItem | null;
  typeHierarchy: TypeHierarchyItem | null;
  fileSymbols: SymbolInfo[];
  importedTypes: TypeInfo[];
  summary: string;
}

export interface LSPCapabilities {
  hasDefinitionProvider: boolean;
  hasReferenceProvider: boolean;
  hasTypeDefinition: boolean;
  hasImplementation: boolean;
  hasCallHierarchy: boolean;
  hasTypeHierarchy: boolean;
  hasHover: boolean;
  hasSignatureHelp: boolean;
  hasDocumentSymbol: boolean;
  hasWorkspaceSymbol: boolean;
  hasDiagnostics: boolean;
  hasCodeAction: boolean;
  hasRename: boolean;
  hasInlayHints: boolean;
}

export type LSPEvent = 'diagnostics-changed' | 'symbols-changed' | 'definition-resolved' | 'references-found' | 'type-resolved';

export const LSP_CONSTANTS = {
  MAX_REFERENCES: 50,
  MAX_SYMBOLS_PER_FILE: 200,
  MAX_CALL_DEPTH: 3,
  MAX_TYPE_DEPTH: 3,
  HOVER_TIMEOUT_MS: 5000,
  DEFINITION_TIMEOUT_MS: 5000,
  REFERENCES_TIMEOUT_MS: 10000,
  CACHE_TTL_MS: 10000,
} as const;
