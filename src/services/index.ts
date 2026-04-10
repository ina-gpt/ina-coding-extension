// Core Services
export * from './LanguageDetector';
export * from './ActiveEditorTracker';
export * from './ContextProvider';

// Mention System
export * from './MentionParser';
export * from './MentionProvider';

// Content Services
export * from './TokenCounter';
export * from './ContentFetcher';
export * from './FolderTreeGenerator';
export * from './SymbolExtractor';
// Note: ContextWindowManager is exported from './context/ContextWindowManager' below (Phase 17.5)

// Code Chunking (selective exports to avoid name collisions)
export { codeChunker, CodeChunker, chunkProcessor, ChunkProcessor, astParser, ASTParser } from './chunking';
export { getLanguageDefinition, isLanguageSupported, LANGUAGE_DEFINITIONS } from './chunking';
export type { CodeChunk, ChunkType, ChunkingOptions, ChunkingResult, ProcessedChunk, ChunkBatch } from './chunking';

// Embedding Services
export * from './EmbeddingClient';
export * from './EmbeddingCache';

// Search
export * from './SearchClient';

// Index Management
export * from './IndexManagerClient';

// Inline Edit
export { InlineEditService, TriggerMode } from './InlineEditService';
export type { InlineEditContext, InlineEditSession } from './InlineEditService';
export { InlineEditTrigger } from './InlineEditTrigger';
export { SelectionExpander } from './SelectionExpander';
export { InlineEditHistory } from './InlineEditHistory';

// Edit Generation
export * from './EditGenerationClient';
export * from './EditResponseProcessor';
export * from './PartialResponseHandler';

// File Watching & Indexing
export * from './IgnoreManager';
export * from './ChangeQueue';
export * from './FileWatcher';
export * from './WorkspaceScanner';
export * from './IndexingCoordinator';

// Documentation
export { DocsClient } from './docs/DocsClient';
export { DocsAutoSuggestService } from './docs/DocsAutoSuggestService';
export { DocsMentionHandler } from './docs/DocsMentionHandler';

// Git Integration
export { GitCommandRunner } from './git/GitCommandRunner';
export { GitBranchService } from './git/GitBranchService';
export { GitLogService } from './git/GitLogService';
export { GitStatusService } from './git/GitStatusService';
export { GitDiffService } from './git/GitDiffService';
export { GitBlameService } from './git/GitBlameService';
export { GitPRService } from './git/GitPRService';
export { GitContextBuilder } from './git/GitContextBuilder';
export { GitWatcher } from './git/GitWatcher';
export { GitMentionHandler } from './git/GitMentionHandler';

// LSP Integration
export { LSPCapabilityDetector } from './lsp/LSPCapabilityDetector';
export { SymbolService } from './lsp/SymbolService';
export { TypeInfoService } from './lsp/TypeInfoService';
export { DefinitionService } from './lsp/DefinitionService';
export { ReferenceService } from './lsp/ReferenceService';
export { DiagnosticService } from './lsp/DiagnosticService';
export { CodeActionService } from './lsp/CodeActionService';
export { InlayHintService } from './lsp/InlayHintService';
export { LSPContextBuilder } from './lsp/LSPContextBuilder';
export { LSPMentionHandler } from './lsp/LSPMentionHandler';
export { LSPWatcher } from './lsp/LSPWatcher';

// Vision / Image Support
export { ImageCaptureService } from './vision/ImageCaptureService';
export { VisionClient } from './vision/VisionClient';
export { DesignToCodeService } from './vision/DesignToCodeService';
export { ImageAnnotationService } from './vision/ImageAnnotationService';

// Phase 6 — Tab Completion
export * from './completion';
// Note: completion/context and completion/ghosttext re-exported via './completion'
// Import directly from './completion/context' or './completion/ghosttext' if needed
// to avoid name collisions (FileContext, TokenBudget conflict with core services)

// Phase 7 — Agent Mode
export * from './agent';
export * from './agent/execution';
export * from './agent/fileops';
export * from './agent/terminal';
// Note: agent/planning re-exported via './agent'; import directly from
// './agent/planning' to avoid FileOperation collision with agent/fileops
// Note: agent/review re-exported via './agent'; import directly from
// './agent/review' to avoid FileChange collision with ChangeQueue

// Phase 9 — Rules
export * from './rules';

// Phase 10 — Cache
// Note: CacheConfig/CacheStats collide with EmbeddingCache. Import directly from './cache/CacheTypes'.
export { LRUCache, MultiTierCache, CacheKeyGenerator, CacheManager, CacheInvalidator, CacheMetrics } from './cache';

// Phase 10 — Request Optimization
// Note: RequestPriority collides with CachePriority. Import from './requestopt/RequestOptTypes' directly.
export { RequestScheduler, ParallelExecutor, PriorityQueue, RequestDeduplicator, RequestThrottler, ConcurrencyController, StaleRequestDetector, RequestMetricsCollector } from './requestopt';

// Phase 10.3 — Offline Mode
// Note: ConnectionState may collide. Import from './offline/OfflineTypes' directly.
export { ConnectivityMonitor, OfflineQueue, SyncManager, LocalModelManager, GracefulDegradation, OfflineSearchFallback } from './offline';

// Phase 10.4 — Error Recovery
// Note: ErrorCategory/ErrorSeverity may collide. Import from './errors/ErrorTypes' directly.
export { ErrorClassifier, RetryEngine, CircuitBreaker, CircuitBreakerRegistry, FallbackManager, ErrorAnalyticsEngine, UserFeedbackCollector, SelfHealingEngine, ErrorRecoveryService } from './errors';

// Phase 11.1 — Themes
export { ThemeEngine, VSCodeThemeBridge } from './theme';

// Phase 11.4 — Status
export { StatusAggregator, StatusBarManager, TokenTracker, HealthDashboardService } from './status';

// Phase 11.3 — Shortcuts
export { ShortcutManager, QuickActionService, ShortcutConflictResolver } from './shortcuts';

// Phase 11.2 — Onboarding
export { OnboardingManager, FeatureTourService, ShortcutCheatsheet, InteractiveTutorial, ProgressiveHintService, WhatsNewService } from './onboarding';

// Phase 12.1 — Privacy
export { SecretDetector, DataEncryptionService, DataSanitizer, PrivacyModeManager, DataRetentionManager, TLSEnforcer, PrivacyAuditService } from './privacy';

// Phase 12.3 — Code Security
export { SensitiveFileDetector, CodeSecurityGate, EphemeralPolicyEnforcer, CodeTransmissionMonitor, GeneratedCodeScanner } from './codesec';

// Phase 13.2 — Editor Compatibility
export { EditorCompat } from './compat';
export type { EditorType, EditorCapabilities } from './compat';

// Phase 13.4 — Enterprise
export { EnterpriseClient } from './enterprise/EnterpriseClient';
export { SSOAuthHandler } from './enterprise/SSOAuthHandler';
export type { EnterpriseConfig, SSOProvider, UsageDashboard, ModelConfig, EnterpriseLicense, AdminDashboard, AdminSetting } from './enterprise/EnterpriseTypes';

// Phase 15.1 — Generate at Cursor
export { GenerateService } from './generate/GenerateService';
export { ScopeAnalyzer } from './generate/ScopeAnalyzer';
export { GeneratePromptBuilder } from './generate/GeneratePromptBuilder';
export type { GenerateContext, GenerateRequest, GenerateMode, GenerateHint } from './generate/GenerateTypes';

// Phase 15.2 — Auto-Apply
export { ApplyService } from './apply/ApplyService';
export { FileDetector } from './apply/FileDetector';
export { DiffApplicator } from './apply/DiffApplicator';
export type { ApplyResult, ApplyPreview, CodeBlockInfo } from './apply/ApplyTypes';

// Phase 15.3 — Predicted Next Edit
export { EditTracker } from './predict/EditTracker';
export { LocationPredictor } from './predict/LocationPredictor';
export { PredictionChainManager } from './predict/PredictionChainManager';
export type { PredictedEdit, PredictionChain, EditEvent } from './predict/PredictTypes';

// Phase 15.4 — Codebase RAG Search
export { CodebaseSearchClient } from './codebase/CodebaseSearchClient';
export { CodebaseMentionHandler } from './codebase/CodebaseMentionHandler';
export type { CodebaseSearchResult, CodebaseChunk, CodebaseFilter, CodebaseContext } from './codebase/CodebaseTypes';
export { CODEBASE_CONSTANTS } from './codebase/CodebaseTypes';

// Phase 15.5 — Bug Finder
export { BugFinderService } from './bugfinder/BugFinderService';
export { BugFinderDecorator } from './bugfinder/BugFinderDecorator';
export type { BugReport, ScanResult, ScanProgress, BugFix } from './bugfinder/BugFinderTypes';
export { BugSeverity, BugCategory, ScanMode } from './bugfinder/BugFinderTypes';

// Phase 15.6 — AI Commit Message
export { CommitMessageGenerator } from './gitai/CommitMessageGenerator';
export { GitAIPanel } from './gitai/GitAIPanel';
export type { CommitMessageResult, CommitMessageConfig } from './gitai/GitAITypes';

// Phase 17.1 — Shadow Workspace
export { ShadowFileSystemProvider } from './shadow/ShadowFileSystemProvider';
export { ShadowWorkspaceManager } from './shadow/ShadowWorkspaceManager';
export { ShadowTreeDataProvider } from './shadow/ShadowTreeDataProvider';
export { ShadowIntegration } from './shadow/ShadowIntegration';
export type { ShadowFile, ShadowSession, ShadowCheckpoint, ShadowDiff, DiffHunk } from './shadow/ShadowTypes';
export { ShadowFileStatus } from './shadow/ShadowTypes';

// Phase 17.2 — Deep Context
export { DeepResolver } from './deepcontext/DeepResolver';
export { DeepContextFormatter } from './deepcontext/DeepContextFormatter';
export { DeepMentionHandler } from './deepcontext/DeepMentionHandler';
export type { DeepDefinition, DeepContextResult, DeepContextOptions, ReferenceGroup } from './deepcontext/DeepContextTypes';

// Phase 17.3 — Link Fetch
export { LinkFetchService } from './linkfetch/LinkFetchService';
export { LinkMentionHandler } from './linkfetch/LinkMentionHandler';
export type { FetchedPage, LinkFetchOptions } from './linkfetch/LinkFetchTypes';

// Phase 17.4 — Partial Accept
export { PartialAcceptController } from './completion/ghosttext/PartialAcceptController';

// Phase 17.5 — Context Window Manager
export { ContextWindowManager } from './context/ContextWindowManager';
export type { ContextBudget, ContextSource, ContextVisualizationData, ContextWindowConfig } from './context/ContextBudgetTypes';

// Phase 17.6 — Performance Benchmarking
export { BenchmarkRunner } from './benchmark/BenchmarkRunner';
export { BenchmarkReporter } from './benchmark/BenchmarkReporter';
export { PerformanceMonitor } from './benchmark/PerformanceMonitor';
export type { BenchmarkResult, BenchmarkSuite } from './benchmark/BenchmarkTypes';

// Phase 16.1 — Composer
export { ComposerSessionManager } from './composer/ComposerSessionManager';
export { ComposerDiffEngine } from './composer/ComposerDiffEngine';
export { ComposerLayout, DEFAULT_COMPOSER_CONFIG } from './composer/ComposerTypes';
export type {
  ComposerSession,
  ComposerStatus,
  ComposerCheckpoint,
  ComposerFileChange,
  ComposerMessage,
  ComposerStats,
  ComposerConfig,
  DiffHunk as ComposerDiffHunk,
} from './composer/ComposerTypes';

// Phase 16.2 — MCP Client
export { MCPClient } from './mcp/MCPClient';
export { MCPDiscovery } from './mcp/MCPDiscovery';
export { MCPToolExecutor } from './mcp/MCPToolExecutor';
export { registerBuiltinMCPServers } from './mcp/MCPBuiltinServers';
export {
  MCPCapability,
  BUILTIN_MCP_SERVERS,
  MCP_PROTOCOL_VERSION,
} from './mcp/MCPTypes';
export type {
  MCPServerConfig,
  MCPServerStatus,
  MCPTool,
  MCPResource,
  MCPToolCall,
  MCPToolResult,
} from './mcp/MCPTypes';

// Phase 16.3 — Web Search
export { WebSearchService } from './websearch/WebSearchService';
export { WebMentionHandler } from './websearch/WebMentionHandler';
export type {
  WebSearchResult,
  WebSearchResponse,
  WebSearchOptions,
  WebSearchContext,
} from './websearch/WebSearchTypes';

// Phase 16.4 — Notepads
export { NotepadManager } from './notepads/NotepadManager';
export { NotepadType, DEFAULT_NOTEPAD_CONFIG } from './notepads/NotepadTypes';
export type { Notepad, NotepadConfig } from './notepads/NotepadTypes';

// Phase 16.5 — History Search
export { HistorySearchService } from './history/HistorySearchService';
export type {
  HistorySearchResult,
  HistorySearchOptions,
  HistorySearchStats,
  ConversationSummary,
} from './history/HistorySearchTypes';

// Phase 16.6 — AutoFormat
export { AutoFormatService } from './autoformat/AutoFormatService';
export { KNOWN_FORMATTERS } from './autoformat/AutoFormatTypes';
export type {
  FormatterConfig,
  FormatterResult,
  AutoFormatOptions,
} from './autoformat/AutoFormatTypes';

// Phase 16.7 — AI Rename
export { AIRenameProvider } from './rename/AIRenameProvider';
export type {
  RenameSuggestion,
  RenameContext,
  NamingConvention,
} from './rename/AIRenameTypes';

// Phase 18.1 — Multi-Agent Orchestrator
export { MultiAgentOrchestrator } from './agent/multi/MultiAgentOrchestrator';
export { AgentFactory as MultiAgentFactory } from './agent/multi/AgentFactory';
export { TaskGraph as MultiAgentTaskGraph } from './agent/multi/TaskGraph';
export {
  AgentRole as MultiAgentRole,
  ROLE_LABELS as MULTI_AGENT_ROLE_LABELS,
  DEFAULT_ORCHESTRATOR_CONFIG,
  displayModel,
} from './agent/multi/MultiAgentTypes';
export type {
  AgentInstance as MultiAgentInstance,
  AgentTask as MultiAgentTask,
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorState,
  DelegationStrategy,
} from './agent/multi/MultiAgentTypes';

// Phase 18.2 — Verifier Agent
export { VerificationOrchestrator } from './agent/verifier/VerificationOrchestrator';
export { SyntaxVerifier } from './agent/verifier/SyntaxVerifier';
export { LogicVerifier } from './agent/verifier/LogicVerifier';
export { SecurityVerifier } from './agent/verifier/SecurityVerifier';
export {
  DEFAULT_VERIFICATION_CONFIG,
  computeScore as computeVerifierScore,
  computeVerdict as computeVerifierVerdict,
} from './agent/verifier/VerifierTypes';
export type {
  VerificationResult,
  VerificationReport,
  VerificationConfig,
  VerificationSeverity,
  VerificationCategory,
} from './agent/verifier/VerifierTypes';

// Phase 18.3 — Git Worktree Isolation
export { WorktreeManager } from './agent/worktree/WorktreeManager';
export { IsolatedExecutor } from './agent/worktree/IsolatedExecutor';
export {
  DEFAULT_WORKTREE_CONFIG,
  generateWorktreeId,
} from './agent/worktree/WorktreeTypes';
export type {
  WorktreeInstance,
  WorktreeConfig,
  WorktreeStatus,
  WorktreeEvent,
  WorktreeEventType,
  MergeStrategy,
  MergeResult,
} from './agent/worktree/WorktreeTypes';
export type {
  IsolatedTaskInput,
  IsolatedTaskResult,
  IsolatedExecutorOptions,
} from './agent/worktree/IsolatedExecutor';

// Phase 18.4 — Best-of-N Selection
export { BestOfNOrchestrator } from './agent/bestofn/BestOfNOrchestrator';
export { CandidateGenerator } from './agent/bestofn/CandidateGenerator';
export { CandidateScorer } from './agent/bestofn/CandidateScorer';
export { CandidateSelector } from './agent/bestofn/CandidateSelector';
export {
  SelectionStrategy,
  DEFAULT_BEST_OF_N_CONFIG,
} from './agent/bestofn/BestOfNTypes';
export type {
  Candidate,
  CandidateMetrics,
  BestOfNConfig,
  SelectionResult,
} from './agent/bestofn/BestOfNTypes';
export type { GenerationRequest } from './agent/bestofn/CandidateGenerator';
export type { BestOfNEvent, BestOfNRunResult } from './agent/bestofn/BestOfNOrchestrator';

// Phase 18.5 — Async Sessions
export { AsyncSessionClient } from './agent/async/AsyncSessionClient';
export { AsyncSessionSync } from './agent/async/AsyncSessionSync';
export type {
  AsyncSessionStatus,
  AsyncSessionSummary,
  AsyncSessionDetails,
  AsyncSessionResultView,
  AsyncProgressEvent,
} from './agent/async/AsyncSessionClient';
export type { AsyncSyncApplyResult } from './agent/async/index';

// Phase 19B — Cloud Agents + Marketplace
export { SkillClient } from './marketplace/SkillClient';
export { CloudAgentClient } from './marketplace/CloudAgentClient';
export { SkillUIProvider, SkillTreeItem } from './marketplace/SkillUIProvider';
export type {
  SkillCategoryView,
  SkillView,
  InstalledSkillView,
  SkillExecutionEvent,
} from './marketplace/SkillClient';
export type {
  CloudAgentStatusView,
  CloudAgentView,
  CloudAgentSystemStatusView,
  CloudAgentEventView,
} from './marketplace/CloudAgentClient';
