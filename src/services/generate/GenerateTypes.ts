/**
 * Phase 15.1 — Generate Code at Cursor Types
 */

export enum GenerateMode {
  EDIT = 'edit',
  GENERATE = 'generate',
  COMPLETE_FUNCTION = 'complete_function',
  IMPLEMENT_INTERFACE = 'implement_interface',
  ADD_METHOD = 'add_method',
}

export interface ScopeInfo {
  type: 'file' | 'class' | 'function' | 'method' | 'block' | 'object' | 'array';
  name: string | null;
  startLine: number;
  endLine: number;
  parentScope: ScopeInfo | null;
  existingMembers: string[];
}

export interface GenerateContext {
  mode: GenerateMode;
  filePath: string;
  language: string;
  cursorLine: number;
  cursorColumn: number;
  prefix: string;
  suffix: string;
  currentScope: ScopeInfo | null;
  nearbySymbols: { name: string; kind: string; detail: string }[];
  imports: string[];
  diagnostics: { message: string; line: number }[];
}

export interface GenerateRequest {
  prompt: string;
  context: GenerateContext;
  options: GenerateOptions;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  includeImports?: boolean;
  followRules?: boolean;
  stream?: boolean;
}

export interface GenerateResult {
  code: string;
  imports: string[];
  explanation: string | null;
  confidence: number;
  alternatives: string[];
}

export interface GenerateHint {
  label: string;
  icon: string;
  prompt: string;
  description: string;
}

export const CLASS_HINTS: GenerateHint[] = [
  { label: 'Add method', icon: '$(symbol-method)', prompt: 'Add a method that ', description: 'Add a new method to this class' },
  { label: 'Add property', icon: '$(symbol-property)', prompt: 'Add a property ', description: 'Add a new property' },
  { label: 'Add constructor', icon: '$(symbol-constructor)', prompt: 'Add constructor with parameters', description: 'Add constructor' },
];

export const FILE_HINTS: GenerateHint[] = [
  { label: 'Add function', icon: '$(symbol-function)', prompt: 'Create a function that ', description: 'Add a new function' },
  { label: 'Add class', icon: '$(symbol-class)', prompt: 'Create a class ', description: 'Add a new class' },
  { label: 'Add interface', icon: '$(symbol-interface)', prompt: 'Create an interface for ', description: 'Add interface' },
  { label: 'Add type', icon: '$(symbol-type-parameter)', prompt: 'Create a type ', description: 'Add type definition' },
];

export const FUNCTION_HINTS: GenerateHint[] = [
  { label: 'Error handling', icon: '$(warning)', prompt: 'Add try-catch error handling', description: 'Wrap in error handling' },
  { label: 'Validation', icon: '$(shield)', prompt: 'Add input validation for ', description: 'Add parameter validation' },
  { label: 'Logging', icon: '$(output)', prompt: 'Add logging statements', description: 'Add logging' },
];

export const TEST_HINTS: GenerateHint[] = [
  { label: 'Add test case', icon: '$(beaker)', prompt: 'Add a test case for ', description: 'Add test' },
  { label: 'Add describe block', icon: '$(symbol-namespace)', prompt: 'Add describe block for ', description: 'Add test suite' },
];

export const REACT_HINTS: GenerateHint[] = [
  { label: 'Add useState', icon: '$(symbol-variable)', prompt: 'Add useState hook for ', description: 'Add state hook' },
  { label: 'Add useEffect', icon: '$(sync)', prompt: 'Add useEffect hook that ', description: 'Add effect hook' },
  { label: 'Add handler', icon: '$(symbol-event)', prompt: 'Add event handler for ', description: 'Add event handler' },
];
