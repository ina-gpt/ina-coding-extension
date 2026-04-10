export { FileOpsExecutor } from './FileOpsExecutor';
export { FileSecurityGuard } from './FileSecurityGuard';
export { ImportGraphAnalyzer } from './ImportGraphAnalyzer';
export { ConflictResolver } from './ConflictResolver';
export { MultiFileEditOrchestrator } from './MultiFileEditOrchestrator';
export { DiffPatcher } from './DiffPatcher';
export {
  FileOperation,
  ConflictResolution,
  PROTECTED_PATTERNS,
  BINARY_EXTENSIONS,
  MAX_FILE_SIZE,
  MAX_OPERATIONS_PER_BATCH,
  MAX_TOTAL_CONTENT_SIZE,
} from './FileOpsTypes';
export type {
  FileOpsRequest,
  FileOpEntry,
  FileOpResult,
  FileOpBatch,
  FileConflict,
  ImportReference,
  ImportUpdate,
  RenameImpact,
  DeleteImpact,
  FileSnapshot,
  MultiFileEditResult,
  PostExecutionValidation,
  MergeConflict,
  DiffHunk,
} from './FileOpsTypes';
