// ============ Enums ============

export enum AgentMode {
  CHAT = 'chat',
  AGENT = 'agent',
  AUTO = 'auto',
}

export enum AgentStatus {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  PAUSED = 'paused',
  REVIEWING = 'reviewing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ============ Plan & Steps ============

export interface AgentStep {
  id: string;
  type: 'create' | 'edit' | 'delete' | 'rename' | 'move' | 'terminal' | 'test';
  filePath: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result: string | null;
  error: string | null;
}

export interface AgentPlan {
  steps: AgentStep[];
  description: string;
  affectedFiles: string[];
  estimatedTime: number;
  approved: boolean;
}

export interface AgentChange {
  filePath: string;
  type: 'create' | 'edit' | 'delete' | 'rename' | 'move';
  originalContent: string | null;
  newContent: string | null;
  diff: string | null;
  accepted: boolean;
}

// ============ Session ============

export interface AgentSession {
  id: string;
  mode: AgentMode;
  status: AgentStatus;
  plan: AgentPlan | null;
  changes: AgentChange[];
  startTime: number;
  endTime: number | null;
  prompt: string;
  context: Record<string, unknown>;
}

// ============ Capabilities & Config ============

export interface AgentCapability {
  name: string;
  description: string;
  requiresApproval: boolean;
}

export interface AgentConfig {
  autoDetect: boolean;
  autoDetectThreshold: number;
  requireApproval: boolean;
  maxFiles: number;
  maxSteps: number;
  allowTerminal: boolean;
  allowDelete: boolean;
  allowCreate: boolean;
  rollbackOnError: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  autoDetect: true,
  autoDetectThreshold: 0.7,
  requireApproval: true,
  maxFiles: 20,
  maxSteps: 50,
  allowTerminal: true,
  allowDelete: false,
  allowCreate: true,
  rollbackOnError: true,
};

// ============ Events ============

export type AgentEvent =
  | 'session-start'
  | 'session-end'
  | 'plan-ready'
  | 'step-start'
  | 'step-complete'
  | 'step-error'
  | 'approval-needed'
  | 'progress'
  | 'rollback';

// ============ Messages (Extension ↔ Webview) ============

export interface AgentMessage {
  type: 'setAgentMode' | 'agentModeChanged' | 'agentSessionUpdate' | 'toggleAgentMode';
  mode?: AgentMode;
  session?: AgentSession;
  status?: AgentStatus;
}

// ============ Helpers ============

const MULTI_FILE_PATTERNS = [
  /\bcreate\s+(?:a\s+)?(?:new\s+)?file/i,
  /\bcreate\s+(?:a\s+)?(?:new\s+)?folder/i,
  /\bdelete\s+(?:the\s+)?file/i,
  /\brename\s+(?:the\s+)?file/i,
  /\bmove\s+(?:the\s+)?file/i,
  /\bin\s+all\s+files/i,
  /\bacross\s+(?:the\s+)?project/i,
  /\bmultiple\s+files/i,
  /\bupdate\s+(?:all|every)\b/i,
  /\brefactor\s+(?:all|across)\b/i,
  /\badd\s+to\s+every\b/i,
  /\bmodify\s+both\b/i,
  /\bset\s+up\s+(?:routing|authentication|testing|ci|deployment)/i,
  /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:component|module|service|controller|model|page|route)/i,
  /\badd\s+(?:a\s+)?(?:new\s+)?(?:endpoint|api|feature|test\s+suite)/i,
  /\bscaffold\b/i,
  /\bgenerate\b/i,
  /\bbootstrap\b/i,
];

const FILE_PATH_PATTERN = /(?:[\w.-]+\/)+[\w.-]+\.\w+/g;

export function isMultiFileRequest(text: string): boolean {
  // Check keyword patterns
  if (MULTI_FILE_PATTERNS.some((p) => p.test(text))) return true;

  // Check for multiple file path references
  const filePaths = text.match(FILE_PATH_PATTERN);
  if (filePaths && filePaths.length >= 2) return true;

  return false;
}

export function extractFileReferences(text: string): string[] {
  const matches = text.match(FILE_PATH_PATTERN);
  return matches ? [...new Set(matches)] : [];
}
