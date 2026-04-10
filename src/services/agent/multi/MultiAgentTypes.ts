/**
 * MultiAgentTypes.ts
 * Phase 18.1 — Multi-Agent Orchestrator type definitions
 *
 * The orchestrator decomposes a user request into a DAG of tasks and
 * dispatches them to specialized agent instances (PLANNER, CODER, REVIEWER,
 * TESTER, REFACTORER, SECURITY_AUDITOR). All model calls are routed through
 * INA-7 Pro on the INA GPT backend — no raw model names ever leak to the UI.
 */

// ============================================================
// Roles
// ============================================================

export enum AgentRole {
  PLANNER = 'planner',
  CODER = 'coder',
  REVIEWER = 'reviewer',
  TESTER = 'tester',
  REFACTORER = 'refactorer',
  SECURITY_AUDITOR = 'security_auditor',
}

/** Display label shown in the UI. Always branded as INA-7 Pro. */
export const ROLE_LABELS: Record<AgentRole, string> = {
  [AgentRole.PLANNER]: 'INA-7 Pro · Planner',
  [AgentRole.CODER]: 'INA-7 Pro · Coder',
  [AgentRole.REVIEWER]: 'INA-7 Pro · Reviewer',
  [AgentRole.TESTER]: 'INA-7 Pro · Tester',
  [AgentRole.REFACTORER]: 'INA-7 Pro · Refactorer',
  [AgentRole.SECURITY_AUDITOR]: 'INA-7 Pro · Security Auditor',
};

// ============================================================
// Agent instance
// ============================================================

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'done' | 'error';

export interface AgentInstance {
  id: string;
  role: AgentRole;
  status: AgentStatus;
  /**
   * Opaque model identifier passed to the backend. The UI always shows
   * "INA-7 Pro" regardless of this value.
   */
  model: string;
  systemPrompt: string;
  /** Arbitrary per-agent context carried between tasks */
  context: Record<string, unknown>;
  /** Max output tokens this agent may use across all its tasks */
  tokenBudget: number;
  /** Tokens consumed so far */
  tokensUsed: number;
  /** Number of tasks currently assigned (for load-balanced delegation) */
  activeTaskCount: number;
  /** Epoch ms of last task completion — used for idle reuse */
  lastUsedAt: number;
  createdAt: number;
}

// ============================================================
// Tasks
// ============================================================

export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export interface AgentTask {
  id: string;
  description: string;
  /** Role required to execute this task (factory picks/spawns an agent) */
  requiredRole: AgentRole;
  /** Currently assigned agent id (null until dispatched) */
  assignedAgent: string | null;
  /** IDs of tasks that must complete before this one can run */
  dependencies: string[];
  status: TaskStatus;
  /** Raw output from the agent (typically a JSON string or code block) */
  result: string | null;
  /** Structured result parsed from `result` (if applicable) */
  parsedResult: any | null;
  error: string | null;
  /** Number of retries performed so far */
  retries: number;
  /** Execution wall-clock time in ms */
  durationMs: number;
  /** Tokens consumed by this task */
  tokensUsed: number;
  /** Priority hint for scheduling (higher = earlier) */
  priority: number;
  /** Free-form metadata attached by the planner */
  metadata: Record<string, unknown>;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

// ============================================================
// Inter-agent conversation protocol
// ============================================================

export type AgentMessageKind =
  | 'task-assigned'
  | 'task-result'
  | 'clarification-request'
  | 'clarification-response'
  | 'context-share'
  | 'error-report';

export interface AgentConversationMessage {
  id: string;
  kind: AgentMessageKind;
  fromAgent: string;
  toAgent: string;
  taskId: string | null;
  content: string;
  timestamp: number;
}

export interface AgentConversation {
  id: string;
  participants: string[];
  messages: AgentConversationMessage[];
  startedAt: number;
}

// ============================================================
// Orchestrator config
// ============================================================

export type DelegationStrategy = 'round-robin' | 'specialist' | 'load-balanced';

export interface OrchestratorConfig {
  /** Maximum concurrent agents executing tasks at any moment */
  maxConcurrentAgents: number;
  /** Per-task timeout in ms */
  taskTimeout: number;
  /** Max retries per task before giving up */
  maxRetries: number;
  /** How to pick an agent when multiple are eligible */
  delegationStrategy: DelegationStrategy;
  /** Global token budget across all agents (0 = unlimited) */
  globalTokenBudget: number;
  /** Whether to call the Verifier Agent after CODER tasks */
  autoVerify: boolean;
  /** Base delay for exponential backoff (ms) */
  retryBaseDelayMs: number;
  /** Cap on backoff delay (ms) */
  retryMaxDelayMs: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxConcurrentAgents: 4,
  taskTimeout: 120_000,
  maxRetries: 3,
  delegationStrategy: 'specialist',
  globalTokenBudget: 0,
  autoVerify: true,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 30_000,
};

// ============================================================
// Events
// ============================================================

export type OrchestratorEventType =
  | 'graph-decomposed'
  | 'execution-started'
  | 'task-assigned'
  | 'task-started'
  | 'task-progress'
  | 'task-completed'
  | 'task-failed'
  | 'task-retried'
  | 'agent-spawned'
  | 'agent-terminated'
  | 'verification-started'
  | 'verification-completed'
  | 'execution-paused'
  | 'execution-resumed'
  | 'execution-completed'
  | 'execution-failed'
  | 'execution-cancelled';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp: number;
  taskId?: string;
  agentId?: string;
  agentRole?: AgentRole;
  message?: string;
  /** Structured payload (task result, verification report, etc.) */
  data?: any;
}

// ============================================================
// Execution state snapshot (for UI)
// ============================================================

export interface OrchestratorState {
  status: 'idle' | 'decomposing' | 'executing' | 'paused' | 'completed' | 'failed' | 'cancelled';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeAgents: number;
  totalTokensUsed: number;
  startedAt: number | null;
  completedAt: number | null;
}

// ============================================================
// Helpers
// ============================================================

export function createEmptyOrchestratorState(): OrchestratorState {
  return {
    status: 'idle',
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    activeAgents: 0,
    totalTokensUsed: 0,
    startedAt: null,
    completedAt: null,
  };
}

/** UI-friendly display name for any agent/task. Always brand-safe. */
export function displayModel(_raw: string): string {
  return 'INA-7 Pro';
}
