export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  error?: string;
  context?: MessageContext;
  images?: ImageAttachmentView[] | null;
}

export interface MessageContext {
  file?: string;
  selection?: { startLine: number; endLine: number; text: string };
  language?: string;
  referencedFiles?: string[];
  mentions?: { type: string; value: string; displayName: string }[];
}

export type MentionType =
  | 'file' | 'folder' | 'symbol' | 'docs' | 'web' | 'mcp' | 'notepad' | 'skill'
  | 'codebase' | 'selection' | 'terminal' | 'git' | 'problems';

export interface MentionData {
  type: MentionType;
  value: string;
  displayName: string;
  resolved?: boolean;
  error?: string;
}

export interface MentionSuggestion {
  type: MentionType;
  value: string;
  displayName: string;
  description?: string;
  icon: string;
  detail?: string;
  insertText: string;
  sortOrder: number;
}

export interface ActiveContext {
  activeFile: {
    path: string;
    relativePath: string;
    fileName: string;
    language: { id: string; name: string };
    cursorLine: number;
    cursorColumn: number;
    selectionRange?: {
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    };
    selectedContent?: string;
    surroundingContent?: string;
    isDirty: boolean;
    lineCount: number;
    currentSymbol?: string;
    symbolPath?: string[];
  } | null;
  diagnostics: {
    errors: number;
    warnings: number;
    hints: number;
    topIssues: { severity: 'error' | 'warning' | 'hint'; message: string; line: number }[];
  } | null;
  workspace?: {
    name: string;
    openFiles: string[];
  };
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
}

// ============ Agent Types ============

export type AgentMode = 'chat' | 'agent' | 'auto';

export type AgentStatus = 'idle' | 'planning' | 'executing' | 'paused' | 'reviewing' | 'completed' | 'failed' | 'cancelled';

export interface AgentSession {
  id: string;
  mode: AgentMode;
  status: AgentStatus;
  prompt: string;
  startTime: number;
  endTime: number | null;
  plan: { steps: { id: string; description: string; status: string }[]; description: string; affectedFiles: string[] } | null;
}

export interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

export interface FileInfo {
  path: string;
  name: string;
  isOpen: boolean;
}

export type ExtensionMessage =
  | { type: 'streamStart'; messageId: string }
  | { type: 'streamChunk'; messageId: string; content: string }
  | { type: 'streamEnd'; messageId: string; stopped?: boolean }
  | { type: 'streamError'; messageId: string; error: string; retryable?: boolean }
  | { type: 'loadHistory'; conversations: Conversation[] }
  | { type: 'loadConversation'; conversation: Conversation }
  | { type: 'config'; config: unknown }
  | { type: 'context'; context: MessageContext }
  | { type: 'activeContext'; context: ActiveContext }
  | { type: 'contextUpdate'; updateType: string; context: ActiveContext }
  | { type: 'mentionSuggestions'; suggestions: MentionSuggestion[] }
  | { type: 'mentionsResolved'; mentions: unknown[] }
  | { type: 'focusInput' }
  | { type: 'clearChat' }
  | { type: 'openFiles'; files: FileInfo[] }
  | { type: 'workspaceFiles'; files: FileInfo[] }
  | { type: 'fileContent'; path: string; content: string }
  | { type: 'applySuccess'; path: string }
  | { type: 'applyError'; error: string }
  | { type: 'fileCreated'; path: string }
  | { type: 'agentModeChanged'; mode: AgentMode }
  | { type: 'agentSessionUpdate'; session: AgentSession | null }
  | { type: 'agentPlanReady'; plan: AgentPlanView }
  | { type: 'agentPlanUpdate'; updates: Partial<AgentPlanView> }
  | { type: 'agentPlanStepUpdate'; stepId: string; updates: Partial<PlanStepView> }
  | { type: 'executionStart'; sessionId: string; totalSteps: number }
  | { type: 'executionProgress'; progress: ExecutionProgressView; state: ExecutionStateView }
  | { type: 'stepStart'; stepId: string; index: number; description: string }
  | { type: 'stepComplete'; stepId: string; result: StepExecutionView }
  | { type: 'stepFailed'; stepId: string; error: StepExecutionView }
  | { type: 'stepSkipped'; stepId: string; reason: string }
  | { type: 'executionComplete'; result: ExecutionResultView }
  | { type: 'executionFailed'; result: ExecutionResultView }
  | { type: 'executionCancelled'; result: ExecutionResultView }
  | { type: 'rollbackStart' }
  | { type: 'rollbackComplete'; success: boolean }
  | { type: 'fileOpsStarted'; batch: FileOpBatchView }
  | { type: 'fileOpProgress'; operationId: string; status: string }
  | { type: 'fileOpComplete'; result: FileOpResultView }
  | { type: 'fileOpFailed'; result: FileOpResultView }
  | { type: 'fileOpConflict'; conflict: FileConflictView }
  | { type: 'importUpdates'; updates: ImportUpdateView[] }
  | { type: 'postExecutionValidation'; validation: PostExecutionValidationView }
  | { type: 'terminalCommandStart'; execution: TerminalExecutionView }
  | { type: 'terminalCommandOutput'; executionId: string; line: string }
  | { type: 'terminalCommandComplete'; execution: TerminalExecutionView }
  | { type: 'terminalAutoFixStart'; errorCount: number }
  | { type: 'terminalAutoFixProgress'; status: any }
  | { type: 'terminalAutoFixComplete'; result: AutoFixResultView }
  | { type: 'reviewStarted'; session: ReviewSessionView }
  | { type: 'reviewUpdated'; changes: ReviewableChangeView[]; progress: ReviewProgressView }
  | { type: 'reviewSummaryReady'; summary: ReviewSummaryView }
  | { type: 'reviewCompleted'; decision: ReviewDecisionView; status: ReviewStatusView }
  | { type: 'changeDecided'; changeId: string; status: ChangeStatusView }
  | { type: 'undoPerformed'; result: { success: boolean; filesReverted: string[]; errors: string[] } }
  // Access Control (Phase 12.2)
  | { type: 'apiKeysLoaded'; keys: AccessApiKeyView[] }
  | { type: 'teamLoaded'; team: AccessTeamView | null; members: AccessTeamMemberView[] }
  | { type: 'auditLogsLoaded'; entries: AccessAuditLogView[]; total: number }
  | { type: 'rateLimitUpdated'; status: AccessRateLimitStatusView }
  | { type: 'permissionsLoaded'; permissions: AccessPermissionView[] }
  | { type: 'accessConfigUpdated'; config: { role: string | null; scopes: string[] } }
  | { type: 'apiKeyCreated'; key: string; apiKey: AccessApiKeyView }
  | { type: 'auditIntegrityResult'; result: { valid: boolean; brokenAt: number | null; totalChecked: number } }
  // Codebase Search (Phase 15.4)
  | { type: 'codebaseSearchResult'; result: CodebaseSearchResultView }
  // Bug Finder (Phase 15.5)
  | { type: 'bugScanStarted'; mode: ScanModeView }
  | { type: 'bugScanProgress'; progress: ScanProgressView }
  | { type: 'bugScanComplete'; result: ScanResultView }
  | { type: 'bugFixResult'; bugId: string; fixed: boolean; newCode?: string }
  | { type: 'showBugFinderPanel' }
  // AI Commit Message (Phase 15.6)
  | { type: 'commitMessageResult'; result: CommitMessageResultView }
  | { type: 'commitMessageGenerating' }
  // Shadow Workspace (Phase 17.1)
  | { type: 'shadowSessionCreated'; session: ShadowSessionView }
  | { type: 'shadowSessionUpdated'; session: ShadowSessionView; diffs: ShadowDiffView[]; stats: ShadowStatsView }
  | { type: 'shadowFileChanged'; sessionId: string; file: ShadowFileView }
  | { type: 'shadowSessionCommitted'; sessionId: string }
  | { type: 'shadowSessionDiscarded'; sessionId: string }
  | { type: 'showShadowPanel' }
  // Deep Context (Phase 17.2)
  | { type: 'deepContextResult'; result: DeepContextResultView }
  // Performance Benchmarking (Phase 17.6)
  | { type: 'benchmarkResult'; suite: BenchmarkSuiteView }
  | { type: 'benchmarkRunning'; category: string }
  | { type: 'performanceHealth'; report: any }
  // UX (Phase 17.7)
  | { type: 'aiTypingStarted' }
  | { type: 'aiTypingStopped' }
  // Composer (Phase 16.1)
  | { type: 'composerSessionCreated'; session: ComposerSession }
  | { type: 'composerStatusChanged'; sessionId: string; status: ComposerStatus; previousStatus: ComposerStatus }
  | { type: 'composerFileChanged'; sessionId: string; fileChange: ComposerFileChange; changeType: 'added' | 'updated' | 'removed' | 'accepted' | 'rejected' }
  | { type: 'composerProgressUpdate'; sessionId: string; stepIndex: number; totalSteps: number; currentStepDescription: string; status: ComposerStatus; percentComplete: number }
  | { type: 'composerCheckpointCreated'; sessionId: string; checkpoint: ComposerCheckpoint }
  | { type: 'composerSessionUpdated'; session: ComposerSession }
  // MCP (Phase 16.2)
  | { type: 'mcpServersChanged'; servers: MCPServerStatus[] }
  | { type: 'mcpToolsChanged'; tools: MCPTool[] }
  | { type: 'mcpToolCallResult'; result: MCPToolResult }
  // Web Search (Phase 16.3)
  | { type: 'webSearchResults'; query: string; response: WebSearchResponse }
  // Notepads (Phase 16.4)
  | { type: 'notepadsChanged'; notepads: Notepad[] }
  // History Search (Phase 16.5)
  | { type: 'historySearchResults'; results: HistorySearchResult[] }
  | { type: 'historyConversationsList'; conversations: ConversationSummary[] }
  | { type: 'historyStats'; stats: { totalConversations: number; totalMessages: number; oldestMessage: number | null; newestMessage: number | null } }
  | { type: 'historyConversationExported'; format: 'json' | 'md'; content: string }
  // AutoFormat (Phase 16.6)
  | { type: 'autoFormatResult'; filePath: string; result: FormatterResult }
  // AI Rename (Phase 16.7)
  | { type: 'renameSuggestions'; suggestions: RenameSuggestion[] };

// ============ Access Control Types (Webview) ============

export interface AccessApiKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  role: string;
  rateLimitTier: string;
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface AccessTeamView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  maxMembers: number;
  rateLimitTier: string;
}

export interface AccessTeamMemberView {
  id: string;
  userId: string;
  role: string;
  permissions: string[];
  joinedAt: string;
}

export interface AccessPermissionView {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isDefault: boolean;
  requiresRole: string | null;
}

export interface AccessAuditLogView {
  id: number;
  timestamp: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  severity: string;
  userId: string | null;
  ipAddress: string | null;
  statusCode: number | null;
  details: Record<string, any>;
}

export interface AccessRateLimitStatusView {
  tier: string;
  remaining: {
    perSecond: number;
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  usage: {
    total: number;
    byEndpoint: Record<string, number>;
    byHour: { hour: string; count: number }[];
  };
}

// ============ Plan Types (Webview) ============

export interface PlanStepView {
  id: string;
  type: string;
  filePath: string;
  description: string;
  status: string;
  risk?: string;
  dependencies?: string[];
  details?: string;
  targetPath?: string | null;
}

export interface AgentPlanView {
  description: string;
  steps: PlanStepView[];
  affectedFiles: string[];
  estimatedTime: number;
  approved: boolean;
  reasoning?: string;
  warnings?: string[];
  estimate?: {
    complexity: string;
    riskLevel: string;
    requiresTests: boolean;
  };
}

// ============ Execution Types (Webview) ============

export type ExecutionStateView = 'idle' | 'preparing' | 'executing' | 'paused' | 'waiting_approval' | 'rolling_back' | 'completed' | 'failed' | 'cancelled';

export interface ExecutionProgressView {
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

export interface StepExecutionView {
  stepId: string;
  status: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  retryCount: number;
  output: string[];
  error: { message: string; code: string; recoverable: boolean; suggestion: string | null } | null;
  result: { success: boolean; filesChanged: string[]; output: string; warnings: string[] } | null;
}

export interface ExecutionResultView {
  sessionId: string;
  success: boolean;
  state: string;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalSteps: number;
  duration: number;
  filesChanged: string[];
  rollbackPerformed: boolean;
  summary: string;
}

// ============ File Operations Types (Webview) ============

export interface FileOpEntryView {
  id: string;
  operation: string;
  sourcePath: string;
  targetPath: string | null;
  description: string;
  dependencies: string[];
}

export interface FileOpResultView {
  id: string;
  operation: string;
  success: boolean;
  sourcePath: string;
  targetPath: string | null;
  error: string | null;
  diff: { added: number; removed: number; changed: number } | null;
  duration: number;
}

export interface FileOpBatchView {
  id: string;
  operations: FileOpEntryView[];
  results: FileOpResultView[];
  status: 'pending' | 'executing' | 'completed' | 'partial' | 'failed' | 'rolledBack';
  startTime: number;
  endTime: number | null;
}

export interface FileConflictView {
  operationId: string;
  type: string;
  description: string;
  resolution: string | null;
}

export interface ImportUpdateView {
  filePath: string;
  oldImport: string;
  newImport: string;
}

export interface PostExecutionValidationView {
  brokenImports: Array<{ fromFile: string; toFile: string; importStatement: string }>;
  typeErrors: string[];
  warnings: string[];
}

// ============ Terminal Types (Webview) ============

export interface TerminalCommandView {
  id: string;
  command: string;
  description: string;
  category: string;
}

export interface TerminalExecutionView {
  id: string;
  command: TerminalCommandView;
  status: string;
  startTime: number;
  endTime: number | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  parsedResult: TerminalParsedResultView | null;
  retryCount: number;
  error: { message: string; code: string; recoverable: boolean; suggestion: string | null } | null;
}

export interface TerminalParsedResultView {
  success: boolean;
  summary: string;
  errors: ParsedErrorView[];
  warnings: Array<{ message: string; file: string | null; code: string | null; source: string }>;
  stats: { total: number | null; passed: number | null; failed: number | null; skipped: number | null; duration: number | null; coverage: number | null } | null;
  framework: string | null;
}

export interface ParsedErrorView {
  message: string;
  file: string | null;
  line: number | null;
  column: number | null;
  code: string | null;
  severity: 'error' | 'warning' | 'info';
  source: string;
  fixable: boolean;
  fixSuggestion: string | null;
}

export interface AutoFixResultView {
  fixed: ParsedErrorView[];
  remaining: ParsedErrorView[];
  filesModified: string[];
  attempts: number;
  success: boolean;
}

// ============ Review Types (Webview) ============

export type ReviewStatusView = 'pending' | 'in_progress' | 'approved' | 'partially_approved' | 'rejected' | 'undone';
export type ChangeStatusView = 'pending' | 'accepted' | 'rejected' | 'partially_accepted' | 'reverted';

export interface ReviewSessionView {
  id: string;
  agentSessionId: string;
  status: ReviewStatusView;
  createdAt: number;
  resolvedAt: number | null;
  changes: ReviewableChangeView[];
  summary: ReviewSummaryView | null;
  decision: ReviewDecisionView | null;
  reviewNotes: string | null;
}

export interface ReviewableChangeView {
  id: string;
  filePath: string;
  operation: string;
  status: ChangeStatusView;
  originalContent: string | null;
  newContent: string | null;
  diff: { unified: string; stats: { additions: number; deletions: number; modifications: number }; fileType: string } | null;
  hunks: ReviewHunkView[];
  accepted: boolean | null;
  revertible: boolean;
  metadata: { stepId: string; stepDescription: string; fileSize: number; language: string | null };
}

export interface ReviewHunkView {
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

export interface ReviewSummaryView {
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
  riskAssessment: { level: 'low' | 'medium' | 'high'; factors: string[]; breakingChanges: string[] };
  aiSummary: string | null;
  terminalResults: { commandsRun: number; testsRun: number; testsPassed: number; testsFailed: number; buildSuccess: boolean | null; errorsFixed: number } | null;
}

export interface ReviewDecisionView {
  type: 'accept-all' | 'reject-all' | 'partial';
  acceptedChanges: string[];
  rejectedChanges: string[];
  timestamp: number;
  notes: string | null;
}

// === Documentation Types ===

export interface DocSourceView {
  id: string;
  name: string;
  type: string;
  url: string | null;
  package_name: string | null;
  status: string;
  doc_count: number;
  chunk_count: number;
  last_indexed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface DocSearchResultView {
  chunk: {
    id: string;
    content: string;
    section_title: string | null;
    code_snippets: string[];
  };
  page: {
    url: string | null;
    title: string | null;
  };
  source: {
    name: string;
    type: string;
  };
  score: number;
  highlights: string[];
}

export interface DocSuggestionView {
  source: string;
  title: string;
  url: string | null;
  relevance: number;
  reason: string;
  snippet: string;
}

export interface DocCrawlProgressView {
  sourceId: string;
  status: string;
  pagesFound: number;
  pagesCrawled: number;
  chunksCreated: number;
  errors: string[];
  startedAt: number;
  estimatedRemaining: number | null;
}

// === Git Types ===

export interface GitBranchView {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface GitFileChangeView {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  oldPath: string | null;
}

export interface GitCommitView {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  subject: string;
  body: string;
  filesChanged: GitFileChangeView[];
  stats: { additions: number; deletions: number; filesChanged: number };
}

export interface GitStatusView {
  branch: GitBranchView;
  staged: GitFileChangeView[];
  unstaged: GitFileChangeView[];
  untracked: string[];
  conflicts: string[];
  stashes: { index: number; message: string; hash: string }[];
  isClean: boolean;
  isMerging: boolean;
  isRebasing: boolean;
}

export interface GitBlameLineView {
  lineNumber: number;
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  summary: string;
  content: string;
  isUncommitted: boolean;
}

export interface GitPRContextView {
  title: string | null;
  baseBranch: string;
  headBranch: string;
  commits: { shortHash: string; subject: string; author: string }[];
  filesChanged: GitFileChangeView[];
  diffStats: { additions: number; deletions: number; filesChanged: number };
}

// === LSP Types ===

export interface SymbolInfoView {
  name: string;
  kind: number;
  kindLabel: string;
  detail: string | null;
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  selectionRange: { startLine: number; startCol: number; endLine: number; endCol: number };
  children: SymbolInfoView[] | null;
}

export interface TypeInfoView {
  name: string;
  fullName: string;
  kind: string;
  members: { name: string; kind: string; type: string; isOptional: boolean; isReadonly: boolean; isStatic: boolean; visibility: string | null; documentation: string | null; line: number | null }[] | null;
  parameters: { name: string; type: string; isOptional: boolean; isRest: boolean; defaultValue: string | null }[] | null;
  returnType: string | null;
  genericParams: string[] | null;
  documentation: string | null;
  filePath: string;
  line: number;
}

export interface DiagnosticInfoView {
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  message: string;
  severity: string;
  code: string | null;
  source: string | null;
}

export interface ReferenceGroupView {
  filePath: string;
  references: { filePath: string; range: { startLine: number }; preview: string; isWrite: boolean }[];
  count: number;
}

export interface CallHierarchyItemView {
  name: string;
  kind: string;
  filePath: string;
  range: { startLine: number; startCol: number; endLine: number; endCol: number };
  detail: string | null;
  callers: CallHierarchyItemView[] | null;
  callees: CallHierarchyItemView[] | null;
}

export interface LSPContextView {
  currentSymbol: SymbolInfoView | null;
  currentType: TypeInfoView | null;
  diagnostics: DiagnosticInfoView[];
  fileSymbols: SymbolInfoView[];
  callHierarchy: CallHierarchyItemView | null;
  summary: string;
}

// === Vision/Image Types ===

export interface ImageAttachmentView {
  id: string;
  data: string;
  mimeType: string;
  fileName: string | null;
  width: number;
  height: number;
  sizeBytes: number;
  thumbnail: string | null;
  annotations: VisionAnnotationView[];
  source: string;
}

export interface VisionAnnotationView {
  type: 'rectangle' | 'circle' | 'arrow' | 'text' | 'highlight';
  coordinates: { x: number; y: number; width?: number; height?: number; x2?: number; y2?: number };
  label: string | null;
  color: string | null;
}

export interface VisionAnalysisView {
  description: string;
  elements: { type: string; label: string | null }[];
  colors: string[];
  layout: string;
  textContent: string[];
  codeSnippets: string[];
  suggestions: string[];
}

export interface DesignToCodeConfigView {
  framework: string;
  cssFramework: string;
  responsive: boolean;
  includeInteractivity: boolean;
  targetLanguage: string;
}

export interface DesignToCodeResponseView {
  code: string;
  framework: string;
  cssFramework: string;
  components: { name: string; code: string; filePath: string }[];
  dependencies: string[];
}

export interface ReviewProgressView {
  total: number;
  decided: number;
  accepted: number;
  rejected: number;
  pending: number;
}

// Rules types
export interface RuleSectionView {
  type: string;
  title: string;
  rules: string[];
  priority: boolean;
  disabled: boolean;
}

export interface RulesStatusView {
  active: boolean;
  summary: string | null;
  sections: RuleSectionView[];
  errors: string[];
}

export interface RulesTemplateView {
  name: string;
  description: string;
  language: string | null;
  framework: string | null;
}

// Global rules types
export interface GlobalPrefsView {
  displayName: string | null;
  preferredLanguage: string | null;
  preferredCodeLanguage: string | null;
  experienceLevel: string;
  timezone: string | null;
}

export interface GlobalCodingDefaultsView {
  indentation: 'spaces' | 'tabs';
  indentSize: number;
  quotes: 'single' | 'double';
  semicolons: boolean;
  trailingComma: 'none' | 'es5' | 'all';
  lineWidth: number;
  braceStyle: string;
  arrowParens: 'always' | 'avoid';
}

export interface GlobalResponseStyleView {
  verbosity: 'concise' | 'balanced' | 'detailed';
  tone: 'professional' | 'casual' | 'friendly' | 'technical';
  codeComments: 'none' | 'minimal' | 'moderate' | 'extensive';
  includeExplanations: boolean;
  showAlternatives: boolean;
  preferExamples: boolean;
  maxResponseLength: 'short' | 'medium' | 'long' | 'unlimited';
}

// Memory types
export interface MemoryView {
  id: string; type: string; scope: string; content: string; summary: string;
  source_type: string; source_message_id: string | null; source_chat_id: string | null;
  related_files: string[] | null; related_symbols: string[] | null;
  tags: string[] | null; confidence: number; access_count: number;
  last_accessed_at: string | null; is_active: boolean; is_pinned: boolean;
  superseded_by: string | null; metadata: Record<string, any>;
  created_at: string; updated_at: string;
}

export interface MemorySearchResultView {
  memory: MemoryView;
  score: number;
  relevanceReason: string;
}

export interface MemoryContextView {
  memories: MemorySearchResultView[];
  totalFound: number;
  tokensUsed: number;
}

export interface ExtractedMemoryView {
  type: string; content: string; summary: string; confidence: number;
  tags: string[]; relatedFiles: string[]; scope: string;
}

export interface MemoryStatsView {
  total: number;
  byType: Record<string, number>;
  byScope: Record<string, number>;
  avgConfidence: number;
  oldestMemory: string | null;
  newestMemory: string | null;
  mostAccessed: MemoryView[];
  leastConfident: MemoryView[];
}

// Request metrics types
export interface RequestMetricsView {
  totalRequests: number; activeRequests: number; queuedRequests: number;
  completedRequests: number; failedRequests: number; cancelledRequests: number;
  timedOutRequests: number; staleRequests: number;
  avgWaitTimeMs: number; avgExecutionTimeMs: number; avgTotalTimeMs: number;
  p50Ms: number; p95Ms: number; p99Ms: number;
  requestsPerMinute: number;
  byCategory: Record<string, { total: number; active: number; queued: number; avgMs: number; errorRate: number }>;
  batchesMerged: number; deduplicatedRequests: number; staleCancellations: number;
}

// Offline types
export type ConnectionStateView = 'online' | 'offline' | 'degraded' | 'reconnecting' | 'unknown';

export interface ConnectionHealthView {
  state: ConnectionStateView;
  targets: Record<string, { state: string; latencyMs: number | null; consecutiveFailures: number }>;
  lastCheckedAt: number;
  lastOnlineAt: number | null;
  downDurationMs: number | null;
  reconnectAttempts: number;
}

export interface OfflineQueueItemView {
  id: string;
  type: string;
  category: string;
  status: string;
  priority: number;
  createdAt: number;
  error: string | null;
  payload?: any;
}

export interface SyncProgressView {
  total: number;
  synced: number;
  failed: number;
  remaining: number;
  currentItem: string | null;
  startedAt: number;
  estimatedRemainingMs: number | null;
  errors: string[];
}

export interface OfflineCapabilityView {
  name: string;
  availableOffline: boolean;
  degradedOffline: boolean;
  description: string;
  fallbackBehavior: string;
}

export interface DegradedResponseMeta {
  source: 'cache' | 'local_model' | 'queued' | 'unavailable';
  quality: 'degraded' | 'cached' | 'none';
  warning: string | null;
}

// Error Recovery types
export interface ClassifiedErrorView {
  id: string;
  category: string;
  severity: string;
  message: string;
  userMessage: string;
  code: string | null;
  statusCode: number | null;
  retryable: boolean;
  fingerprint: string;
  timestamp: number;
}

export interface ErrorRecoveryResultView {
  recovered: boolean;
  fallbackUsed: boolean;
  fallbackSource: string | null;
  retried: boolean;
  retryAttempts: number;
  userNotified: boolean;
  queued: boolean;
  classifiedError: ClassifiedErrorView;
}

export interface ErrorAnalyticsView {
  totalErrors: number;
  errorsByCategory: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  errorRate: number;
  topErrors: { fingerprint: string; message: string; count: number; lastSeen: number }[];
  retrySuccessRate: number;
  fallbackUsageRate: number;
  circuitBreakerTrips: number;
  userFeedbackCount: number;
  feedbackSatisfaction: number;
  trendDirection: 'improving' | 'stable' | 'worsening';
}

export interface CircuitBreakerView {
  name: string;
  state: string;
  failures: number;
  lastFailure: number | null;
}

// Cache types
export interface CacheStatsData {
  caches: Record<string, { hits: number; misses: number; evictions: number; size: number; sizeBytes: number; maxSizeBytes: number; hitRate: number }>;
  totalSizeBytes: number;
  totalEntries: number;
  overallHitRate: number;
  recommendations?: string[];
}

export interface GlobalRulesStatusView {
  active: boolean;
  preferences: GlobalPrefsView | null;
  codingDefaults: GlobalCodingDefaultsView | null;
  responseStyle: GlobalResponseStyleView | null;
  customInstructions: string[];
  conflicts: { category: string; projectRule: string; globalRule: string; winner: string }[];
}

// === Theme Types ===

export interface ThemeConfigView {
  mode: string;
  customAccentColor: string | null;
  customThemeId: string | null;
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: string | null;
  codeFontFamily: string | null;
  borderRadius: 'none' | 'small' | 'medium' | 'large';
  compactMode: boolean;
  animateThemeChange: boolean;
  syncWithVSCode: boolean;
}

export interface ThemeInfoView {
  id: string;
  name: string;
  description: string;
  mode: string;
}

// === Onboarding Types ===

export interface OnboardingStateView {
  isFirstRun: boolean;
  completedSteps: string[];
  currentStep: string | null;
  startedAt: number | null;
  completedAt: number | null;
  skippedAt: number | null;
  dismissedHints: string[];
  seenFeatures: string[];
  toursCompleted: string[];
  tutorialProgress: TutorialProgressView | null;
}

export interface TourStepView {
  id: string;
  title: string;
  description: string;
  action: string | null;
  position: string;
  highlight: { type: string; color: string | null } | null;
  media: { type: string; inlineSvg: string | null; alt: string } | null;
  canSkip: boolean;
}

export interface TutorialProgressView {
  currentLesson: number;
  totalLessons: number;
  completedLessons: string[];
  score: number;
  startedAt: number;
}

export interface TutorialLessonView {
  id: string;
  title: string;
  description: string;
  objective: string;
  steps: { instruction: string; expectedAction: string; hint: string | null; autoComplete: boolean }[];
  successCriteria: string;
  reward: string | null;
}

export interface ShortcutCategoryView {
  name: string;
  icon: string;
  shortcuts: ShortcutEntryView[];
}

export interface ShortcutEntryView {
  keys: string[];
  action: string;
  description: string;
  context: string | null;
  category: string;
}

export interface ProgressiveHintView {
  id: string;
  message: string;
  actionLabel: string | null;
  actionCommand: string | null;
}

export interface ChangelogEntryView {
  type: 'feature' | 'fix' | 'improvement';
  title: string;
  description: string;
}

// === Shortcut Types ===

export interface ShortcutDefinitionView {
  id: string;
  command: string;
  keys: { mac: string; windows: string; linux: string; display: string };
  whenClause: string | null;
  description: string;
  category: string;
  isDefault: boolean;
  isCustom: boolean;
  isChord: boolean;
}

export interface ShortcutProfileView {
  id: string;
  name: string;
  description: string;
}

export interface ShortcutConflictView {
  shortcutId: string;
  conflictsWith: { source: string; command: string; keys: string };
  severity: 'blocking' | 'override' | 'context-safe';
  suggestion: string;
}

// === Status Types ===

export type OverallHealthView = 'healthy' | 'degraded' | 'unhealthy' | 'offline' | 'unknown';

export interface SystemStatusView {
  connection: { state: string; latencyMs: number | null; lastCheckedAt: number; target: string; uptime: number | null };
  model: { state: string; modelName: string | null; vramUsedMB: number | null; vramTotalMB: number | null; vramPercent: number | null; lastResponseMs: number | null; requestsActive: number; queueDepth: number };
  indexing: { state: string; progress: number | null; filesTotal: number | null; filesProcessed: number | null; chunksTotal: number | null; chunksProcessed: number | null; currentFile: string | null; estimatedRemainingMs: number | null; lastIndexedAt: number | null; errorMessage: string | null };
  requests: { active: number; queued: number; totalInSession: number; failedInSession: number; avgLatencyMs: number | null; requestsPerMinute: number; byCategory: Record<string, { active: number; queued: number }> };
  tokens: { sessionTokensIn: number; sessionTokensOut: number; sessionTotalTokens: number; estimatedCostUSD: number | null; lastRequestTokensIn: number | null; lastRequestTokensOut: number | null; contextWindowUsed: number | null; contextWindowMax: number | null; contextWindowPercent: number | null; dailyTokens: number; monthlyTokens: number };
  agent: { isActive: boolean; sessionId: string | null; status: string | null; currentStep: string | null; progress: number | null; filesChanged: number };
  git: { branch: string | null; isClean: boolean; changesCount: number; ahead: number; behind: number };
  diagnostics: { errors: number; warnings: number; infos: number; hints: number; filesWithErrors: number };
  memory: { memoriesCount: number; lastRecallCount: number | null; autoExtractEnabled: boolean };
  rules: { projectRulesActive: boolean; globalRulesActive: boolean; rulesCount: number; conflictsCount: number };
  cache: { hitRate: number; totalEntries: number; totalSizeMB: number; maxSizeMB: number };
  circuitBreakers: { total: number; closed: number; open: number; halfOpen: number; trippedNames: string[] };
  overall: OverallHealthView;
  timestamp: number;
}

export interface HealthReportView {
  overall: OverallHealthView;
  sections: { name: string; status: string; icon: string; details: { label: string; value: string; status: string; tooltip: string | null }[] }[];
  recommendations: string[];
  quickActions?: { label: string; command: string; icon: string }[];
  timestamp: number;
}

export type WebviewMessage =
  | { type: 'sendMessage'; content: string; context?: MessageContext }
  | { type: 'stopGeneration' }
  | { type: 'newChat' }
  | { type: 'loadConversation'; id: string }
  | { type: 'deleteConversation'; id: string }
  | { type: 'getHistory' }
  | { type: 'getConfig' }
  | { type: 'retry' }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'insertCode'; code: string }
  | { type: 'openFile'; path: string }
  | { type: 'ready' }
  | { type: 'getMentionSuggestions'; context: { query: string; type: string | null } }
  | { type: 'resolveMentions'; mentions: unknown[] }
  | { type: 'toggleAgentMode' }
  | { type: 'setAgentMode'; mode: AgentMode }
  | { type: 'approvePlan' }
  | { type: 'rejectPlan' }
  | { type: 'revisePlan'; feedback: string }
  | { type: 'pauseExecution' }
  | { type: 'resumeExecution' }
  | { type: 'cancelExecution' }
  | { type: 'skipStep' }
  | { type: 'retryStep'; stepId: string }
  | { type: 'rollbackAll' }
  | { type: 'rollbackLast' }
  | { type: 'resolveConflict'; operationId: string; resolution: string }
  | { type: 'revertOperation'; operationId: string }
  | { type: 'revertAllOps' }
  | { type: 'viewFileDiff'; operationId: string }
  | { type: 'runTerminalCommand'; command: string }
  | { type: 'cancelTerminalCommand'; executionId: string }
  | { type: 'triggerAutoFix'; errors: ParsedErrorView[] }
  | { type: 'retryCommand'; executionId: string }
  | { type: 'openFileAtLine'; path: string; line: number }
  | { type: 'runQuickCommand'; category: string }
  | { type: 'acceptAllChanges' }
  | { type: 'rejectAllChanges' }
  | { type: 'acceptChange'; changeId: string }
  | { type: 'rejectChange'; changeId: string }
  | { type: 'acceptHunk'; hunkId: string }
  | { type: 'rejectHunk'; hunkId: string }
  | { type: 'toggleChange'; changeId: string }
  | { type: 'toggleHunk'; hunkId: string }
  | { type: 'finalizeReview'; notes: string | null }
  | { type: 'showFileDiff'; changeId: string }
  | { type: 'showHunkDiff'; changeId: string; hunkId: string }
  | { type: 'showAllDiffs' }
  | { type: 'undoAllChanges' }
  | { type: 'undoFileChange'; changeId: string }
  | { type: 'undoHunkChange'; hunkId: string; changeId: string }
  | { type: 'addReviewNote'; note: string }
  | { type: 'getDocSources' }
  | { type: 'getBuiltins' }
  | { type: 'addDocSource'; source: { name: string; type: string; url?: string; localPath?: string; packageName?: string } }
  | { type: 'removeDocSource'; sourceId: string }
  | { type: 'startDocCrawl'; sourceId: string; config?: Record<string, unknown> }
  | { type: 'searchDocs'; query: string; sourceIds?: string[]; limit?: number }
  | { type: 'getDocSuggestions'; filePath: string; language: string; code: string; errors: string[]; imports: string[] }
  | { type: 'openDocsPanel' }
  | { type: 'insertDocMention'; source: string; topic?: string }
  | { type: 'requestGitStatus' }
  | { type: 'requestGitLog'; offset?: number }
  | { type: 'requestGitBlame'; filePath: string }
  | { type: 'requestGitDiff'; filePath?: string }
  | { type: 'requestGitPR' }
  | { type: 'switchBranch'; branchName?: string }
  | { type: 'stageFile'; path: string }
  | { type: 'unstageFile'; path: string }
  | { type: 'stageAll' }
  | { type: 'openGitDiff'; path: string }
  | { type: 'insertGitMention'; subCommand: string }
  | { type: 'toggleGitBlame' }
  | { type: 'requestLSPContext' }
  | { type: 'requestDefinition'; filePath: string; line: number; col: number }
  | { type: 'requestReferences'; filePath: string; line: number; col: number }
  | { type: 'requestTypeInfo'; filePath: string; line: number; col: number }
  | { type: 'requestCallHierarchy'; filePath: string; line: number; col: number }
  | { type: 'navigateToSymbol'; filePath: string; line: number }
  | { type: 'fixDiagnosticWithAI'; diagnostic: DiagnosticInfoView }
  | { type: 'explainSymbol'; symbolName: string }
  | { type: 'explainDiagnostic'; diagnostic: DiagnosticInfoView }
  | { type: 'imagesAdded'; images: ImageAttachmentView[] }
  | { type: 'imageRemoved'; imageId: string }
  | { type: 'imageAnnotated'; imageId: string; annotations: VisionAnnotationView[] }
  | { type: 'analyzeImage'; image: ImageAttachmentView; detailLevel?: string }
  | { type: 'designToCode'; image: ImageAttachmentView; config: DesignToCodeConfigView; additionalInstructions?: string }
  | { type: 'pasteImage' }
  | { type: 'uploadImages' }
  | { type: 'captureScreenshot' }
  | { type: 'processImage'; image: ImageAttachmentView; operations: string[] }
  | { type: 'insertGeneratedCode'; code: string }
  | { type: 'createComponentFiles'; components: { name: string; code: string; filePath: string }[] }
  | { type: 'getRulesStatus' }
  | { type: 'createRulesFile'; template?: string }
  | { type: 'openRulesFile' }
  | { type: 'toggleRules' }
  | { type: 'refreshRules' }
  | { type: 'getRulesPreview'; mode: string }
  | { type: 'showRulesPanel' }
  | { type: 'addRulesSection'; sectionType: string }
  | { type: 'getGlobalRulesStatus' }
  | { type: 'runGlobalRulesWizard' }
  | { type: 'openGlobalRulesFile' }
  | { type: 'deleteGlobalRules' }
  | { type: 'updateGlobalPreference'; key: string; value: string }
  | { type: 'updateGlobalCodingDefault'; key: string; value: string }
  | { type: 'updateGlobalResponseStyle'; key: string; value: string }
  // Memory
  | { type: 'requestMemories'; filters?: Record<string, any> }
  | { type: 'createMemory'; memory: Record<string, any> }
  | { type: 'updateMemory'; memoryId: string; updates: Record<string, any> }
  | { type: 'deleteMemory'; memoryId: string }
  | { type: 'searchMemories'; query: string; projectId?: string; limit?: number }
  | { type: 'pinMemory'; memoryId: string }
  | { type: 'unpinMemory'; memoryId: string }
  | { type: 'submitMemoryFeedback'; memoryId: string; feedbackType: string; context?: string }
  | { type: 'keepExtractedMemory'; extraction: Record<string, any> }
  | { type: 'discardExtractedMemory'; index: number }
  | { type: 'runMemoryMaintenance' }
  | { type: 'exportMemories'; format?: string }
  | { type: 'importMemories'; data: string }
  | { type: 'clearProjectMemories' }
  | { type: 'toggleAutoExtract'; enabled: boolean; showNotification?: boolean }
  | { type: 'openMemoryPanel' }
  | { type: 'explicitRemember'; content: string }
  | { type: 'explicitForget'; query: string }
  // Cache
  | { type: 'requestCacheStats' }
  | { type: 'clearCache'; cacheName: string }
  | { type: 'clearAllCaches' }
  | { type: 'pruneExpired' }
  // Request optimization
  | { type: 'requestStatsRequest' }
  | { type: 'cancelRequest'; requestId: string }
  | { type: 'cancelRequestCategory'; category: string }
  | { type: 'cancelAllRequests' }
  // Theme
  | { type: 'setTheme'; themeId: string }
  | { type: 'setThemeMode'; mode: string }
  | { type: 'setAccentColor'; color: string }
  | { type: 'setFontSize'; size: string }
  | { type: 'setBorderRadius'; level: string }
  | { type: 'setCompactMode'; compact: boolean }
  | { type: 'requestTheme' }
  | { type: 'requestAvailableThemes' }
  // Onboarding
  | { type: 'startOnboarding' }
  | { type: 'skipOnboarding' }
  | { type: 'completeOnboardingStep'; step: string }
  | { type: 'startTour'; tourId: string }
  | { type: 'nextTourStep' }
  | { type: 'prevTourStep' }
  | { type: 'skipTour' }
  | { type: 'startTutorial' }
  | { type: 'startLesson'; lessonId: string }
  | { type: 'advanceTutorialStep' }
  | { type: 'skipLesson' }
  | { type: 'dismissHint'; hintId: string }
  | { type: 'requestShortcuts' }
  | { type: 'dismissWhatsNew' }
  | { type: 'resetOnboarding' }
  | { type: 'applyOnboardingPrefs'; language: string; experience: string; showHints: boolean }
  // Shortcuts
  | { type: 'customizeShortcut'; shortcutId: string; newKeys: { mac: string; windows: string; linux: string; display: string } }
  | { type: 'resetShortcut'; shortcutId: string }
  | { type: 'resetAllShortcuts' }
  | { type: 'disableShortcut'; shortcutId: string }
  | { type: 'enableShortcut'; shortcutId: string }
  | { type: 'setShortcutProfile'; profileId: string }
  | { type: 'runShortcutAudit' }
  | { type: 'exportShortcutConfig' }
  | { type: 'importShortcutConfig'; json: string }
  | { type: 'requestShortcutDefinitions' }
  | { type: 'showQuickActions' }
  | { type: 'autoResolveConflicts' }
  // Status
  | { type: 'requestSystemStatus' }
  | { type: 'resetTokenUsage' }
  | { type: 'showHealthDashboard' }
  | { type: 'openStatusDetail'; section: string }
  // Privacy
  | { type: 'requestPrivacyConfig' }
  | { type: 'setPrivacyMode'; mode: string }
  | { type: 'updatePrivacyConfig'; path: string; value: any }
  | { type: 'deleteAllData' }
  | { type: 'exportAllData' }
  | { type: 'deleteDataCategory'; category: string }
  | { type: 'exportDataCategory'; category: string }
  | { type: 'runPrivacyAudit' }
  | { type: 'runCleanup' }
  | { type: 'showPrivacyDashboard' }
  | { type: 'acceptPrivacyNotice' }
  | { type: 'rotateEncryptionKey' }
  // Access Control (Phase 12.2)
  | { type: 'requestApiKeys' }
  | { type: 'createApiKey'; name: string; scopes: string[]; role: string; rateLimitTier: string; expiresInDays: number | null }
  | { type: 'revokeApiKey'; keyId: string; reason: string }
  | { type: 'rotateApiKey'; keyId: string }
  | { type: 'requestTeam' }
  | { type: 'createTeam'; name: string; slug: string; description: string | null; maxMembers: number }
  | { type: 'addTeamMember'; teamId: string; userId: string; role: string; permissions: string[] }
  | { type: 'removeTeamMember'; teamId: string; userId: string }
  | { type: 'requestAuditLogs'; filters: Record<string, string>; offset?: number }
  | { type: 'exportAuditLog'; format: string }
  | { type: 'verifyAuditIntegrity' }
  | { type: 'requestPermissions' }
  | { type: 'requestRateLimitStatus' }
  | { type: 'showAccessPanel' }
  // Code Security (Phase 12.3)
  | { type: 'scanWorkspace' }
  | { type: 'addSensitivePattern'; pattern: string }
  | { type: 'removeSensitivePattern'; pattern: string }
  | { type: 'requestSecurityAlerts' }
  | { type: 'dismissSecurityAlert'; alertId: string }
  | { type: 'getTransmissionReport' }
  | { type: 'resetTransmissionStats' }
  | { type: 'purgeServerData' }
  | { type: 'getCodeSecurityStats' }
  | { type: 'whitelistPattern'; alertId: string }
  | { type: 'showCodeSecurityPanel' }
  // Enterprise (Phase 13.4)
  | { type: 'requestAdminDashboard' }
  | { type: 'requestUsageDashboard'; days?: number }
  | { type: 'requestSSOProviders' }
  | { type: 'createSSOProvider'; config: any }
  | { type: 'deleteSSOProvider'; providerId: string }
  | { type: 'initiateSSOLogin'; providerId: string }
  | { type: 'requestModels' }
  | { type: 'registerModel'; config: any }
  | { type: 'deleteModel'; modelId: string }
  | { type: 'testModelConnection'; modelId: string }
  | { type: 'setDefaultModel'; modelId: string }
  | { type: 'requestAdminSettings' }
  | { type: 'updateAdminSetting'; key: string; value: any }
  | { type: 'requestUsers'; filters?: any }
  | { type: 'updateUser'; userId: string; updates: any }
  | { type: 'activateLicense'; licenseKey: string }
  | { type: 'requestLicense' }
  | { type: 'generateUsageReport'; format?: string; days?: number }
  | { type: 'showAdminPanel' }
  | { type: 'showModelRegistration' }
  | { type: 'showSSOWizard' }
  // Apply (Phase 15.2)
  | { type: 'applyCode'; code: string; language?: string; filename?: string; codeBlockId?: string; preferredFile?: string }
  | { type: 'applyCodeBlock'; code: string; language?: string; filename?: string; codeBlockId?: string }
  | { type: 'previewApply'; code: string; language?: string; filename?: string }
  | { type: 'createFileWithCode'; code: string; language?: string; suggestedFilename?: string }
  | { type: 'detectFileForCode'; code: string; language?: string; filename?: string }
  | { type: 'applyLastCodeBlock' }
  // Predict (Phase 15.3)
  | { type: 'acceptPrediction' }
  | { type: 'skipPrediction' }
  | { type: 'cancelPredictionChain' }
  | { type: 'viewPredictions' }
  // Codebase Search (Phase 15.4)
  | { type: 'searchCodebase'; query: string; filters?: any }
  // Bug Finder (Phase 15.5)
  | { type: 'scanCurrentFile' }
  | { type: 'scanChangedFiles' }
  | { type: 'scanProject' }
  | { type: 'fixBug'; bug: BugReportView }
  | { type: 'dismissBug'; bugId: string }
  | { type: 'openBugLocation'; filePath: string; line: number }
  | { type: 'showBugFinder' }
  // AI Commit Message (Phase 15.6)
  | { type: 'generateCommitMessage'; staged?: boolean }
  | { type: 'acceptCommitMessage'; message: string }
  // Shadow Workspace (Phase 17.1)
  | { type: 'acceptShadowFile'; sessionId: string; filePath: string }
  | { type: 'rejectShadowFile'; sessionId: string; filePath: string }
  | { type: 'acceptAllShadow'; sessionId: string }
  | { type: 'rejectAllShadow'; sessionId: string }
  | { type: 'previewShadowFile'; sessionId: string; filePath: string }
  | { type: 'editShadowFile'; sessionId: string; filePath: string; content: string }
  | { type: 'createShadowCheckpoint'; sessionId: string; description: string }
  | { type: 'restoreShadowCheckpoint'; sessionId: string; checkpointId: string }
  | { type: 'showShadowWorkspace' }
  // Deep Context (Phase 17.2)
  | { type: 'resolveDeepDef'; symbol: string; filePath: string; line: number; col: number }
  | { type: 'resolveDeepType'; symbol: string; filePath: string; line: number; col: number }
  | { type: 'resolveDeepRefs'; symbol: string; filePath: string; line: number; col: number }
  // Link Fetch (Phase 17.3)
  | { type: 'fetchLink'; url: string }
  // Context (Phase 17.5)
  | { type: 'requestContextVisualization' }
  // Performance Benchmarking (Phase 17.6)
  | { type: 'runBenchmark'; category?: string }
  // UX (Phase 17.7)
  | { type: 'editMessage'; messageId: string; newContent: string }
  | { type: 'regenerateMessage'; messageId: string }
  | { type: 'bookmarkMessage'; messageId: string }
  | { type: 'deleteMessage'; messageId: string }
  | { type: 'createBranch'; messageId: string }
  | { type: 'switchBranch'; branchId: string }
  // Composer (Phase 16.1)
  | { type: 'openComposer'; instruction: string }
  | { type: 'closeComposer' }
  | { type: 'startComposerPlanning'; sessionId: string }
  | { type: 'executeComposerPlan'; sessionId: string }
  | { type: 'refineComposer'; sessionId: string; instruction: string }
  | { type: 'acceptComposerFile'; sessionId: string; filePath: string }
  | { type: 'rejectComposerFile'; sessionId: string; filePath: string }
  | { type: 'acceptComposerAll'; sessionId: string }
  | { type: 'rejectComposerAll'; sessionId: string }
  | { type: 'acceptComposerHunk'; sessionId: string; filePath: string; hunkIndex: number; accepted: boolean }
  | { type: 'createComposerCheckpoint'; sessionId: string; description: string }
  | { type: 'restoreComposerCheckpoint'; sessionId: string; checkpointId: string }
  | { type: 'pauseComposer'; sessionId: string }
  | { type: 'resumeComposer'; sessionId: string }
  | { type: 'setComposerLayout'; layout: ComposerLayout }
  // MCP (Phase 16.2)
  | { type: 'mcpListServers' }
  | { type: 'mcpConnectServer'; config: any }
  | { type: 'mcpDisconnectServer'; serverName: string }
  | { type: 'mcpAddServer'; config: any }
  | { type: 'mcpRemoveServer'; serverName: string }
  | { type: 'mcpCallTool'; serverName: string; toolName: string; arguments: Record<string, any> }
  // Web Search (Phase 16.3)
  | { type: 'webSearch'; query: string; maxResults?: number }
  // Notepads (Phase 16.4)
  | { type: 'notepadList' }
  | { type: 'notepadCreate'; name: string; notepadType: NotepadType; content: string }
  | { type: 'notepadDelete'; id: string }
  | { type: 'notepadPin'; id: string }
  | { type: 'notepadUnpin'; id: string }
  | { type: 'notepadAttach'; id: string }
  | { type: 'notepadDetach'; id: string }
  | { type: 'notepadOpen'; id: string }
  | { type: 'notepadUpdate'; id: string; content: string }
  // History Search (Phase 16.5)
  | { type: 'historySearch'; query: string; options?: any }
  | { type: 'historyListConversations' }
  | { type: 'historyLoadConversation'; id: string }
  | { type: 'historyDeleteConversation'; id: string }
  | { type: 'historyExportConversation'; id: string; format: 'json' | 'md' }
  // AutoFormat (Phase 16.6)
  | { type: 'formatFile'; filePath: string }
  // AI Rename (Phase 16.7)
  | { type: 'aiRenameRequest'; uri?: string; line?: number; column?: number };

// ============ Codebase Search Types (Phase 15.4) ============

export interface CodebaseChunkView {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  relevanceScore: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
  symbols: string[];
}

export interface CodebaseSearchResultView {
  chunks: CodebaseChunkView[];
  totalMatches: number;
  searchTimeMs: number;
  query: string;
}

// ============ Bug Finder Types (Phase 15.5) ============

export type BugSeverityView = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type BugCategoryView = 'logic' | 'security' | 'performance' | 'type' | 'edge_case' | 'error_handling' | 'race' | 'memory' | 'null_ref' | 'dead_code' | 'code_smell';

export interface BugFixView {
  description: string;
  code: string;
  startLine: number;
  endLine: number;
}

export interface BugReportView {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  severity: BugSeverityView;
  category: BugCategoryView;
  title: string;
  description: string;
  suggestion: string;
  codeSnippet: string;
  fix: BugFixView | null;
  status: 'open' | 'fixing' | 'fixed' | 'dismissed';
}

export type ScanModeView = 'current' | 'changed' | 'full' | 'selection';

export interface ScanResultView {
  bugs: BugReportView[];
  filesScanned: number;
  scanTimeMs: number;
  mode: ScanModeView;
}

export interface ScanProgressView {
  phase: 'collecting' | 'analyzing' | 'complete';
  current: number;
  total: number;
  currentFile: string | null;
}

// ============ AI Commit Message Types (Phase 15.6) ============

export interface CommitMessageAlternativeView {
  summary: string;
  style: string;
}

export interface CommitMessageResultView {
  summary: string;
  body: string | null;
  type: string;
  scope: string | null;
  breaking: boolean;
  alternatives: CommitMessageAlternativeView[];
}

// ============ Shadow Workspace Types (Phase 17.1) ============

export type ShadowFileStatusView = 'pending' | 'accepted' | 'rejected' | 'edited' | 'conflict';

export interface ShadowFileView {
  filePath: string;
  status: ShadowFileStatusView;
  linesAdded: number;
  linesRemoved: number;
  sourceOperation: string;
}

export interface ShadowCheckpointView {
  id: string;
  timestamp: number;
  description: string;
}

export interface ShadowSessionView {
  id: string;
  name: string;
  status: 'active' | 'committed' | 'discarded' | 'expired';
  files: ShadowFileView[];
  checkpoints: ShadowCheckpointView[];
  createdAt: number;
  expiresAt: number;
  sourceOperation: string;
}

export interface ShadowDiffHunkView {
  startLineOriginal: number;
  endLineOriginal: number;
  startLineModified: number;
  endLineModified: number;
  originalContent: string;
  modifiedContent: string;
}

export interface ShadowDiffView {
  filePath: string;
  hunks: ShadowDiffHunkView[];
  linesAdded: number;
  linesRemoved: number;
  linesChanged: number;
}

export interface ShadowStatsView {
  totalFiles: number;
  pending: number;
  accepted: number;
  rejected: number;
  edited: number;
  linesAdded: number;
  linesRemoved: number;
}

// ============ Deep Context Types (Phase 17.2) ============

export interface DeepDefinitionView {
  symbol: string;
  kind: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  depth: number;
  relatedTo: string | null;
}

export interface DeepContextResultView {
  primary: DeepDefinitionView;
  transitive: DeepDefinitionView[];
  totalTokens: number;
  truncated: boolean;
  resolvedDepth: number;
}

export interface DeepReferenceGroupView {
  filePath: string;
  references: { line: number; column: number; context: string; usageType: string }[];
}

// ============ Benchmark Types (Phase 17.6) ============

export interface BenchmarkResultView {
  name: string;
  category: string;
  value: number;
  unit: string;
  target: number;
  status: 'pass' | 'warn' | 'fail';
  details: string | null;
}

export interface BenchmarkSuiteView {
  name: string;
  results: BenchmarkResultView[];
  totalPassed: number;
  totalWarned: number;
  totalFailed: number;
  runTimeMs: number;
  environment: { nodeVersion: string; vscodeVersion: string; platform: string };
}

// ============ Composer Types (Phase 16.1) ============

export type ComposerStatus =
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'refining'
  | 'completed'
  | 'failed'
  | 'paused';

export enum ComposerLayout {
  SIDEBAR = 'sidebar',
  PANEL = 'panel',
  FULLSCREEN = 'fullscreen',
  SPLIT = 'split',
}

export type ComposerDiffViewMode = 'inline' | 'side-by-side';
export type ComposerRiskLevel = 'low' | 'medium' | 'high';

export interface DiffHunk {
  startLineOriginal: number;
  endLineOriginal: number;
  startLineModified: number;
  endLineModified: number;
  originalContent: string;
  modifiedContent: string;
}

export interface DiffLine {
  lineNumber: number;
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  hunkIndex: number | null;
}

export interface ComposerDiff {
  hunks: DiffHunk[];
  linesAdded: number;
  linesRemoved: number;
}

export type ComposerFileChangeStatus = 'created' | 'modified' | 'deleted' | 'renamed';

export interface ComposerFileChange {
  filePath: string;
  status: ComposerFileChangeStatus;
  diff: ComposerDiff;
  originalContent: string | null;
  newContent: string;
  accepted: boolean | null;
  hunkAccepted?: boolean[];
  checkpointId: string;
  renamedFrom?: string;
  risk?: ComposerRiskLevel;
}

export type ComposerCheckpointType =
  | 'initial'
  | 'plan'
  | 'execution'
  | 'refinement'
  | 'manual';

export interface ComposerCheckpoint {
  id: string;
  index: number;
  description: string;
  timestamp: number;
  /** Serialized as Record on the wire (Map → object) */
  fileSnapshots: Record<string, string>;
  instruction: string;
  type: ComposerCheckpointType;
}

export type ComposerRefinementStatus =
  | 'pending'
  | 'planning'
  | 'executing'
  | 'completed'
  | 'failed';

export interface ComposerRefinement {
  id: string;
  instruction: string;
  timestamp: number;
  planDelta: any | null;
  status: ComposerRefinementStatus;
}

export type ComposerMessageRole =
  | 'user'
  | 'assistant'
  | 'system'
  | 'plan'
  | 'execution'
  | 'checkpoint';

export interface ComposerMessage {
  id: string;
  role: ComposerMessageRole;
  content: string;
  timestamp: number;
  metadata: Record<string, any>;
}

export interface ComposerStats {
  totalFiles: number;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  linesAdded: number;
  linesRemoved: number;
  planSteps: number;
  stepsCompleted: number;
  stepsFailed: number;
  executionTimeMs: number;
  refinementCount: number;
  checkpointCount: number;
}

export interface ComposerSession {
  id: string;
  status: ComposerStatus;
  instruction: string;
  refinements: ComposerRefinement[];
  plan: any | null;
  execution: any | null;
  fileChanges: ComposerFileChange[];
  checkpoints: ComposerCheckpoint[];
  currentCheckpointIndex: number;
  conversation: ComposerMessage[];
  stats: ComposerStats;
  createdAt: number;
  updatedAt: number;
}

export interface ComposerConfig {
  defaultLayout: ComposerLayout;
  autoCheckpoint: boolean;
  showFileTree: boolean;
  showTimeline: boolean;
  diffViewMode: ComposerDiffViewMode;
  maxRefinements: number;
  autoAcceptLowRisk: boolean;
}

// ============ MCP Types (Phase 16.2) ============

export interface MCPServerConfig {
  name: string;
  displayName: string;
  description?: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  transportType: 'stdio' | 'sse';
  url: string | null;
  enabled: boolean;
  autoStart: boolean;
  builtin?: boolean;
}

export interface MCPServerStatus {
  name: string;
  displayName: string;
  status: 'connected' | 'disconnected' | 'error' | 'starting';
  toolCount: number;
  resourceCount: number;
  lastError: string | null;
  pid: number | null;
  builtin: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
}

export interface MCPToolCall {
  toolName: string;
  serverName: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  toolName: string;
  serverName: string;
  result: any;
  isError: boolean;
  errorMessage: string | null;
  durationMs: number;
}

// ============ Web Search Types (Phase 16.3) ============

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
  totalResults: number;
  searchTimeMs: number;
  engine: string;
}

export interface WebSearchContext {
  formatted: string;
  tokenCount: number;
  results: WebSearchResult[];
}

// ============ Notepads (Phase 16.4) ============

export type NotepadType = 'text' | 'code' | 'api' | 'data' | 'requirements';

export interface Notepad {
  id: string;
  name: string;
  type: NotepadType;
  content: string;
  isPinned: boolean;
  isAttached: boolean;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
  filePath: string | null;
}

// ============ History Search (Phase 16.5) ============

export interface HistorySearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  messageRole: 'user' | 'assistant';
  content: string;
  matchSnippet: string;
  matchScore: number;
  timestamp: number;
}

export interface HistorySearchOptions {
  query: string;
  dateFrom: number | null;
  dateTo: number | null;
  role: 'user' | 'assistant' | 'all';
  hasCodeBlock: boolean | null;
  maxResults: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  firstMessageAt: number;
  lastMessageAt: number;
  preview: string;
}

// ============ AutoFormat (Phase 16.6) ============

export interface FormatterResult {
  success: boolean;
  formattedContent: string | null;
  changesApplied: boolean;
  formatterUsed: string;
  error: string | null;
  durationMs: number;
}

// ============ AI Rename (Phase 16.7) ============

export type NamingConvention =
  | 'camelCase'
  | 'PascalCase'
  | 'snake_case'
  | 'UPPER_SNAKE'
  | 'kebab-case'
  | 'unknown';

export interface RenameSuggestion {
  name: string;
  reason: string;
  confidence: number;
  convention: NamingConvention;
}
