import { PlanStep } from '../planning/PlanningTypes';

// ============ Enums ============

export enum ExecutionState {
  IDLE = 'idle',
  PREPARING = 'preparing',
  EXECUTING = 'executing',
  PAUSED = 'paused',
  WAITING_APPROVAL = 'waiting_approval',
  ROLLING_BACK = 'rolling_back',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum RollbackType {
  FILE_RESTORE = 'file_restore',
  FILE_DELETE = 'file_delete',
  FILE_RENAME = 'file_rename',
  TERMINAL_UNDO = 'terminal_undo',
  COMPOSITE = 'composite',
}

// ============ Events ============

export type ExecutionEvent =
  | 'execution-start'
  | 'step-start'
  | 'step-progress'
  | 'step-complete'
  | 'step-failed'
  | 'step-skipped'
  | 'execution-pause'
  | 'execution-resume'
  | 'execution-complete'
  | 'execution-failed'
  | 'execution-cancelled'
  | 'rollback-start'
  | 'rollback-step'
  | 'rollback-complete'
  | 'approval-requested'
  | 'file-changed'
  | 'terminal-output';

// ============ Step Execution ============

export interface StepResult {
  success: boolean;
  filesChanged: string[];
  output: string;
  warnings: string[];
  artifacts: Record<string, any>;
}

export interface StepError {
  message: string;
  code: string;
  recoverable: boolean;
  suggestion: string | null;
  stack: string | null;
}

export interface RollbackData {
  stepId: string;
  type: RollbackType;
  originalContent: Map<string, string>;
  createdFiles: string[];
  renamedFiles: Array<{ from: string; to: string }>;
  deletedFiles: Map<string, string>;
  terminalCommands: string[];
}

export interface StepExecution {
  stepId: string;
  status: ExecutionState;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  result: StepResult | null;
  error: StepError | null;
  retryCount: number;
  output: string[];
  rollbackData: RollbackData | null;
}

// ============ Progress & Checkpoints ============

export interface ExecutionProgress {
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  percentage: number;
  currentStepDescription: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

export interface ExecutionCheckpoint {
  sessionId: string;
  stepIndex: number;
  timestamp: number;
  rollbackStack: RollbackData[];
  completedStepIds: string[];
}

// ============ Configuration ============

export interface ExecutionConfig {
  concurrentSteps: boolean;
  retryFailedSteps: boolean;
  maxRetries: number;
  pauseOnError: boolean;
  pauseBetweenSteps: boolean;
  stepTimeoutMs: number;
  requireApprovalPerStep: boolean;
  dryRun: boolean;
}

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  concurrentSteps: false,
  retryFailedSteps: true,
  maxRetries: 2,
  pauseOnError: true,
  pauseBetweenSteps: false,
  stepTimeoutMs: 120000,
  requireApprovalPerStep: false,
  dryRun: false,
};

// ============ Executor Interface ============

export interface ExecutionContext {
  workspaceRoot: string;
  sessionId: string;
  config: ExecutionConfig;
  abortSignal: AbortSignal;
  progress: (msg: string) => void;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  fileExists: (filePath: string) => Promise<boolean>;
}

export interface StepExecutor {
  execute(step: PlanStep, context: ExecutionContext): Promise<StepResult>;
  rollback(data: RollbackData): Promise<void>;
  canExecute(step: PlanStep): boolean;
  estimateDuration(step: PlanStep): number;
}

// ============ Execution Result ============

export interface ExecutionResult {
  sessionId: string;
  success: boolean;
  state: ExecutionState;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalSteps: number;
  duration: number;
  stepResults: Map<string, StepExecution>;
  filesChanged: string[];
  rollbackPerformed: boolean;
  summary: string;
}

export function buildExecutionSummary(result: ExecutionResult): string {
  const parts: string[] = [];
  parts.push(`Execution ${result.success ? 'completed' : 'failed'}`);
  parts.push(`${result.completedSteps}/${result.totalSteps} steps completed`);
  if (result.failedSteps > 0) parts.push(`${result.failedSteps} failed`);
  if (result.skippedSteps > 0) parts.push(`${result.skippedSteps} skipped`);
  parts.push(`Duration: ${Math.round(result.duration / 1000)}s`);
  if (result.filesChanged.length > 0) parts.push(`Files changed: ${result.filesChanged.length}`);
  if (result.rollbackPerformed) parts.push('Changes were rolled back');
  return parts.join(' | ');
}

export function formatExecutionReport(result: ExecutionResult): string {
  const lines: string[] = [];
  lines.push(`## Execution Report`);
  lines.push('');
  lines.push(`**Status:** ${result.success ? 'Success' : 'Failed'}`);
  lines.push(`**Duration:** ${Math.round(result.duration / 1000)}s`);
  lines.push(`**Steps:** ${result.completedSteps} completed, ${result.failedSteps} failed, ${result.skippedSteps} skipped (${result.totalSteps} total)`);
  lines.push('');

  if (result.filesChanged.length > 0) {
    lines.push('### Files Changed');
    for (const f of result.filesChanged) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  lines.push('### Step Details');
  for (const [stepId, exec] of result.stepResults) {
    const icon = exec.status === ExecutionState.COMPLETED ? '✅' : exec.status === ExecutionState.FAILED ? '❌' : '⏭️';
    lines.push(`${icon} **${stepId}** — ${exec.status}${exec.duration ? ` (${Math.round(exec.duration / 1000)}s)` : ''}`);
    if (exec.error) {
      lines.push(`  > Error: ${exec.error.message}`);
      if (exec.error.suggestion) lines.push(`  > Suggestion: ${exec.error.suggestion}`);
    }
  }

  if (result.rollbackPerformed) {
    lines.push('');
    lines.push('> ⚠️ All changes were rolled back due to errors.');
  }

  return lines.join('\n');
}
