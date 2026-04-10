import { AgentStep, AgentPlan, AgentConfig } from '../AgentTypes';

// ============ Request/Response ============

export interface PlanRequest {
  prompt: string;
  context: {
    files?: string[];
    currentFile?: string;
    currentFileContent?: string;
    selection?: string;
    mentions?: Array<{ type: string; value: string }>;
    workspaceRoot?: string;
    workspaceFiles?: string[];
    gitStatus?: string;
  };
  agentConfig: AgentConfig;
  sessionId: string;
}

export interface PlanResponse {
  plan: AgentPlan;
  reasoning: string;
  alternatives: AgentPlan[];
  warnings: string[];
}

// ============ Extended Step ============

export interface PlanStep extends AgentStep {
  order: number;
  dependencies: string[];
  estimatedDuration: number;
  rollbackAction: string | null;
  validation: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  risk: 'low' | 'medium' | 'high';
  details: string;
  targetPath: string | null;
}

// ============ Validation ============

export interface PlanValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

// ============ File Operations ============

export type FileOperation = 'create' | 'edit' | 'delete' | 'rename' | 'move' | 'copy';

export interface FileChange {
  operation: FileOperation;
  sourcePath: string;
  targetPath: string | null;
  description: string;
  contentSummary: string;
  dependencies: string[];
}

// ============ Dependency Graph ============

export interface PlanDependencyGraph {
  nodes: Map<string, PlanStep>;
  edges: Map<string, string[]>;
}

// ============ Estimation ============

export interface PlanEstimate {
  totalSteps: number;
  totalFiles: number;
  estimatedDurationMs: number;
  complexity: 'low' | 'medium' | 'high' | 'very-high';
  riskLevel: 'safe' | 'moderate' | 'risky';
  requiresTests: boolean;
}

// ============ Prompts ============

export interface PlanningPromptTemplate {
  systemPrompt: string;
  userPromptTemplate: string;
  outputFormat: string;
}

// ============ Revision ============

export interface PlanRevision {
  originalPlan: AgentPlan;
  feedback: string;
  revisedPlan: AgentPlan;
}

// ============ Constants ============

export const PLANNING_CONSTANTS = {
  MAX_PLAN_STEPS: 50,
  MAX_FILES_PER_PLAN: 20,
  MAX_RETRIES: 2,
  PLANNING_TIMEOUT_MS: 60000,
  MIN_CONFIDENCE: 0.6,
} as const;
