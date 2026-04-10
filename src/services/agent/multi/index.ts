/**
 * Multi-Agent service barrel — Phase 18.1
 */

export { MultiAgentOrchestrator } from './MultiAgentOrchestrator';
export { AgentFactory, DEFAULT_FACTORY_CONFIG } from './AgentFactory';
export { TaskGraph } from './TaskGraph';
export {
  AgentRole,
  ROLE_LABELS,
  DEFAULT_ORCHESTRATOR_CONFIG,
  createEmptyOrchestratorState,
  displayModel,
} from './MultiAgentTypes';
export type {
  AgentInstance,
  AgentStatus,
  AgentTask,
  TaskStatus,
  AgentMessageKind,
  AgentConversationMessage,
  AgentConversation,
  DelegationStrategy,
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorEventType,
  OrchestratorState,
} from './MultiAgentTypes';
export type { AgentFactoryConfig } from './AgentFactory';
export type { TaskGraphSnapshot } from './TaskGraph';
