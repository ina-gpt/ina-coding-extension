import { RollbackData } from '../execution/ExecutionTypes';

// ============ Enums ============

export enum FileOperation {
  CREATE = 'create',
  EDIT = 'edit',
  DELETE = 'delete',
  RENAME = 'rename',
  MOVE = 'move',
  COPY = 'copy',
  CREATE_FOLDER = 'create_folder',
  PATCH = 'patch',
  APPEND = 'append',
  PREPEND = 'prepend',
  INSERT_AT = 'insert_at',
  REPLACE_RANGE = 'replace_range',
}

export enum ConflictResolution {
  OVERWRITE = 'overwrite',
  SKIP = 'skip',
  RENAME_NEW = 'rename_new',
  MERGE = 'merge',
  ABORT = 'abort',
  ASK_USER = 'ask_user',
}

// ============ Request / Entry ============

export interface FileOpsRequest {
  operations: FileOpEntry[];
  sessionId: string;
  dryRun: boolean;
  atomic: boolean;
}

export interface FileOpEntry {
  id: string;
  operation: FileOperation;
  sourcePath: string;
  targetPath: string | null;
  content: string | null;
  insertPosition: { line: number; column: number } | null;
  replaceRange: { startLine: number; endLine: number } | null;
  appendContent: string | null;
  prependContent: string | null;
  patchDiff: string | null;
  description: string;
  dependencies: string[];
  metadata: Record<string, any>;
}

// ============ Result ============

export interface FileOpResult {
  id: string;
  operation: FileOperation;
  success: boolean;
  sourcePath: string;
  targetPath: string | null;
  error: string | null;
  rollbackData: RollbackData | null;
  diff: { added: number; removed: number; changed: number } | null;
  duration: number;
}

// ============ Batch ============

export interface FileOpBatch {
  id: string;
  operations: FileOpEntry[];
  results: FileOpResult[];
  status: 'pending' | 'executing' | 'completed' | 'partial' | 'failed' | 'rolledBack';
  startTime: number;
  endTime: number | null;
}

// ============ Conflicts ============

export interface FileConflict {
  operationId: string;
  type: 'already-exists' | 'not-found' | 'modified-externally' | 'locked' | 'circular-rename' | 'import-broken';
  description: string;
  resolution: ConflictResolution | null;
}

// ============ Import Graph ============

export interface ImportReference {
  fromFile: string;
  toFile: string;
  specifiers: string[];
  importStatement: string;
  lineNumber: number;
}

export interface ImportUpdate {
  filePath: string;
  oldImport: string;
  newImport: string;
  lineNumber: number;
}

export interface RenameImpact {
  affectedFiles: Array<{
    path: string;
    imports: ImportReference[];
    updatedImportStatement: string;
  }>;
  brokenImports: string[];
}

export interface DeleteImpact {
  dependentFiles: string[];
  brokenImports: ImportReference[];
  orphanedExports: string[];
}

// ============ Snapshots ============

export interface FileSnapshot {
  path: string;
  content: string;
  stat: { size: number; mtime: number };
  hash: string;
}

// ============ Multi-File Edit ============

export interface MultiFileEditResult {
  batch: FileOpBatch;
  importUpdates: ImportUpdate[];
  conflicts: FileConflict[];
  postValidation: PostExecutionValidation | null;
  summary: string;
}

export interface PostExecutionValidation {
  brokenImports: ImportReference[];
  typeErrors: string[];
  warnings: string[];
}

// ============ Merge ============

export interface MergeConflict {
  startLine: number;
  endLine: number;
  baseContent: string;
  localContent: string;
  remoteContent: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

// ============ Constants ============

export const PROTECTED_PATTERNS: string[] = [
  '.git/**',
  'node_modules/**',
  '.env',
  '.env.local',
  '.env.production',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.pem',
  '*.key',
  '*.cert',
  'id_rsa*',
  '.ssh/**',
];

export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.gz', '.tar', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.wasm', '.so', '.dll', '.dylib', '.exe',
  '.class', '.pyc', '.o', '.obj',
]);

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_OPERATIONS_PER_BATCH = 50;
export const MAX_TOTAL_CONTENT_SIZE = 50 * 1024 * 1024; // 50MB
