import { FileOperation } from '../fileops/FileOpsTypes';

// ============ Enums ============

export enum ReviewStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  APPROVED = 'approved',
  PARTIALLY_APPROVED = 'partially_approved',
  REJECTED = 'rejected',
  UNDONE = 'undone',
}

export enum ChangeStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  PARTIALLY_ACCEPTED = 'partially_accepted',
  REVERTED = 'reverted',
  MODIFIED_AFTER_REVIEW = 'modified_after_review',
}

export enum UndoScope {
  ALL = 'all',
  SINGLE_FILE = 'single_file',
  SINGLE_HUNK = 'single_hunk',
  SINCE_CHECKPOINT = 'since_checkpoint',
}

// ============ Review Session ============

export interface ReviewSession {
  id: string;
  agentSessionId: string;
  status: ReviewStatus;
  createdAt: number;
  resolvedAt: number | null;
  changes: ReviewableChange[];
  summary: ReviewSummary | null;
  decision: ReviewDecision | null;
  reviewNotes: string | null;
}

// ============ Reviewable Change ============

export interface ReviewableChange {
  id: string;
  filePath: string;
  operation: FileOperation;
  status: ChangeStatus;
  originalContent: string | null;
  newContent: string | null;
  diff: ReviewDiff | null;
  hunks: ReviewHunk[];
  accepted: boolean | null;
  revertible: boolean;
  metadata: {
    stepId: string;
    stepDescription: string;
    createdAt: number;
    fileSize: number;
    language: string | null;
  };
}

// ============ Diffs ============

export interface ReviewDiff {
  unified: string;
  stats: { additions: number; deletions: number; modifications: number };
  hunks: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }>;
  fileType: 'created' | 'modified' | 'deleted' | 'renamed' | 'moved';
}

export interface ReviewHunk {
  id: string;
  changeId: string;
  hunkIndex: number;
  startLineOld: number;
  endLineOld: number;
  startLineNew: number;
  endLineNew: number;
  content: string;
  accepted: boolean | null;
  context: { before: string[]; after: string[] };
}

// ============ Summary ============

export interface ReviewSummary {
  totalFiles: number;
  totalChanges: number;
  additions: number;
  deletions: number;
  modifications: number;
  newFiles: string[];
  deletedFiles: string[];
  modifiedFiles: string[];
  renamedFiles: Array<{ from: string; to: string }>;
  affectedDirectories: string[];
  riskAssessment: RiskAssessment;
  aiSummary: string | null;
  terminalResults: {
    commandsRun: number;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    buildSuccess: boolean | null;
    errorsFixed: number;
  } | null;
}

export interface RiskAssessment {
  level: 'low' | 'medium' | 'high';
  factors: string[];
  breakingChanges: string[];
  importChanges: Array<{ file: string; added: string[]; removed: string[] }>;
}

// ============ Decision ============

export interface ReviewDecision {
  type: 'accept-all' | 'reject-all' | 'partial';
  acceptedChanges: string[];
  rejectedChanges: string[];
  acceptedHunks: string[];
  rejectedHunks: string[];
  timestamp: number;
  notes: string | null;
}

// ============ Filter ============

export interface ReviewFilter {
  status: ChangeStatus | 'all';
  operation: FileOperation | 'all';
  directory: string | null;
  searchQuery: string | null;
  showOnlyRisky: boolean;
}

// ============ Undo ============

export interface UndoRequest {
  scope: UndoScope;
  targetId: string | null;
  checkpointId: string | null;
  confirmationRequired: boolean;
}

export interface UndoResult {
  success: boolean;
  filesReverted: string[];
  filesPartiallyReverted: string[];
  errors: string[];
  newState: ReviewableChange[];
}

// ============ Groups ============

export interface ChangeGroup {
  directory: string;
  changes: ReviewableChange[];
  stats: { additions: number; deletions: number };
}

// ============ Apply Result ============

export interface ApplyResult {
  applied: string[];
  reverted: string[];
  errors: string[];
}

// ============ Constants ============

export const REVIEW_CONSTANTS = {
  MAX_DIFF_SIZE_BYTES: 1048576,
  MAX_INLINE_PREVIEW_LINES: 200,
  REVIEW_TIMEOUT_MS: 1800000,
  AUTO_APPROVE_THRESHOLD_FILES: 3,
  SUMMARY_GENERATION_TIMEOUT_MS: 30000,
} as const;
