import { create } from 'zustand';
import type { ChatMessage, Conversation, MessageContext, ActiveContext, MentionData, MentionSuggestion, AgentMode, AgentSession, AgentPlanView, PlanStepView, ExecutionStateView, ExecutionProgressView, StepExecutionView, ExecutionResultView, FileOpBatchView, FileOpResultView, FileConflictView, ImportUpdateView, PostExecutionValidationView, TerminalExecutionView, ParsedErrorView, AutoFixResultView, ReviewSessionView, ReviewableChangeView, ReviewSummaryView, ReviewDecisionView, ReviewProgressView, ChangeStatusView, DocSourceView, DocSearchResultView, DocSuggestionView, DocCrawlProgressView, GitStatusView, GitCommitView, GitBlameLineView, GitPRContextView, LSPContextView, SymbolInfoView, DiagnosticInfoView, TypeInfoView, ReferenceGroupView, CallHierarchyItemView, ImageAttachmentView, VisionAnnotationView, VisionAnalysisView, DesignToCodeResponseView, DesignToCodeConfigView, RuleSectionView, RulesStatusView, GlobalPrefsView, GlobalCodingDefaultsView, GlobalResponseStyleView, GlobalRulesStatusView, MemoryView, MemorySearchResultView, ExtractedMemoryView, MemoryStatsView, CacheStatsData, RequestMetricsView, ThemeConfigView, ThemeInfoView, OnboardingStateView, TourStepView, TutorialProgressView, TutorialLessonView, ShortcutCategoryView, ProgressiveHintView, ChangelogEntryView, ShortcutDefinitionView, ShortcutProfileView, ShortcutConflictView, SystemStatusView, HealthReportView } from '@/types';
// Privacy types used inline
import { postMessage } from '@/utils/vscode';

interface StreamingInfo { messageId: string; startTime: number; tokensReceived: number; }

interface ChatStore {
  messages: ChatMessage[]; conversations: Conversation[]; currentConversationId: string | null;
  isStreaming: boolean; streamingInfo: StreamingInfo | null;
  inputValue: string; context: MessageContext | null; activeContext: ActiveContext | null;
  isContextEnabled: boolean;
  mentions: MentionData[]; mentionSuggestions: MentionSuggestion[]; isMentionLoading: boolean;
  config: unknown;
  error: string | null; canRetry: boolean;
  agentMode: AgentMode; agentSession: AgentSession | null; showAgentBanner: boolean;
  agentPlan: AgentPlanView | null;
  executionState: ExecutionStateView | null;
  executionProgress: ExecutionProgressView | null;
  stepExecutions: StepExecutionView[];
  showRollbackDialog: boolean;
  rollbackType: 'all' | 'last' | null;
  fileOpBatch: FileOpBatchView | null;
  fileConflicts: FileConflictView[];
  importUpdates: ImportUpdateView[];
  postValidation: PostExecutionValidationView | null;
  terminalExecutions: TerminalExecutionView[];
  currentTerminalExecution: TerminalExecutionView | null;
  terminalOutputLines: string[];
  autoFixInProgress: boolean;
  autoFixStatus: any | null;
  parsedErrors: ParsedErrorView[];
  reviewSession: ReviewSessionView | null;
  reviewChanges: ReviewableChangeView[];
  reviewSummary: ReviewSummaryView | null;
  reviewProgress: ReviewProgressView | null;
  isReviewSummaryLoading: boolean;
  showUndoDialog: boolean;
  undoScope: string | null;
  undoFilesAffected: string[];
  docSources: DocSourceView[];
  docSearchResults: DocSearchResultView[];
  docSuggestions: DocSuggestionView[];
  docCrawlProgress: DocCrawlProgressView | null;
  isDocsCrawling: boolean;
  gitStatus: GitStatusView | null;
  gitCommitLog: GitCommitView[];
  gitBlameCurrent: GitBlameLineView[] | null;
  gitPR: GitPRContextView | null;
  isGitLoading: boolean;
  gitBranchName: string | null;

  setGitStatus: (status: GitStatusView | null) => void;
  setGitCommitLog: (commits: GitCommitView[]) => void;
  appendGitCommits: (commits: GitCommitView[]) => void;
  setGitBlame: (blame: GitBlameLineView[] | null) => void;
  setGitPR: (pr: GitPRContextView | null) => void;
  requestGitStatus: () => void;
  requestGitLog: () => void;
  requestGitBlame: (filePath: string) => void;
  requestGitPR: () => void;
  switchBranch: (branchName?: string) => void;
  stageFile: (path: string) => void;
  unstageFile: (path: string) => void;
  stageAll: () => void;
  openGitDiff: (path: string) => void;
  insertGitMention: (subCommand: string) => void;
  toggleGitBlame: () => void;

  setDocSources: (sources: DocSourceView[]) => void;
  addDocSource: (source: { name: string; type: string; url?: string; localPath?: string; packageName?: string }) => void;
  removeDocSource: (sourceId: string) => void;
  startDocCrawl: (sourceId: string) => void;
  searchDocs: (query: string) => void;
  setDocSuggestions: (suggestions: DocSuggestionView[]) => void;
  setDocSearchResults: (results: DocSearchResultView[]) => void;
  setDocCrawlProgress: (progress: DocCrawlProgressView | null) => void;
  dismissDocSuggestions: () => void;
  insertDocMention: (source: string, topic?: string) => void;

  lspContext: LSPContextView | null;
  fileSymbols: SymbolInfoView[];
  fileDiagnostics: DiagnosticInfoView[];
  currentTypeInfo: TypeInfoView | null;
  currentReferences: ReferenceGroupView[];
  callHierarchy: CallHierarchyItemView | null;
  setLSPContext: (context: LSPContextView | null) => void;
  setFileSymbols: (symbols: SymbolInfoView[]) => void;
  setFileDiagnostics: (diagnostics: DiagnosticInfoView[]) => void;
  setCurrentType: (type: TypeInfoView | null) => void;
  setCurrentReferences: (refs: ReferenceGroupView[]) => void;
  setCallHierarchy: (hierarchy: CallHierarchyItemView | null) => void;
  requestLSPContext: () => void;
  requestDefinition: (filePath: string, line: number, col: number) => void;
  requestReferences: (filePath: string, line: number, col: number) => void;
  fixDiagnosticWithAI: (diagnostic: DiagnosticInfoView) => void;
  explainSymbol: (symbolName: string) => void;
  explainDiagnostic: (diagnostic: DiagnosticInfoView) => void;
  navigateToSymbol: (filePath: string, line: number) => void;
  pendingImages: ImageAttachmentView[];
  isAnalyzingImage: boolean;
  isDesignToCode: boolean;
  designToCodeResult: DesignToCodeResponseView | null;
  visionAnalysis: VisionAnalysisView | null;
  activeImageModal: ImageAttachmentView | null;
  activeAnnotationImage: ImageAttachmentView | null;
  addPendingImage: (image: ImageAttachmentView) => void;
  removePendingImage: (imageId: string) => void;
  clearPendingImages: () => void;
  setPendingImageAnnotations: (imageId: string, annotations: VisionAnnotationView[]) => void;
  setVisionAnalysis: (analysis: VisionAnalysisView | null) => void;
  setDesignToCodeResult: (result: DesignToCodeResponseView | null) => void;
  openImageModal: (image: ImageAttachmentView) => void;
  closeImageModal: () => void;
  openAnnotationEditor: (image: ImageAttachmentView) => void;
  closeAnnotationEditor: () => void;

  addMessage: (m: ChatMessage) => void; updateMessage: (id: string, u: Partial<ChatMessage>) => void;
  appendToMessage: (id: string, c: string) => void; setMessages: (m: ChatMessage[]) => void;
  clearMessages: () => void; setConversations: (c: Conversation[]) => void;
  updateConversationInList: (id: string, updates: Partial<Conversation>) => void;
  removeConversationFromList: (id: string) => void;
  loadConversation: (id: string) => void;
  startStreaming: (id: string) => void; stopStreaming: () => void;
  setInputValue: (v: string) => void; setContext: (c: MessageContext | null) => void;
  setActiveContext: (c: ActiveContext | null) => void; setContextEnabled: (enabled: boolean) => void;
  setMentions: (m: MentionData[]) => void; addMention: (m: MentionData) => void; removeMention: (i: number) => void;
  setMentionSuggestions: (s: MentionSuggestion[]) => void; setMentionLoading: (l: boolean) => void;
  setConfig: (c: unknown) => void; setError: (e: string | null, retry?: boolean) => void;
  sendMessage: (c: string) => void; stopGeneration: () => void;
  retryLastMessage: () => void; newChat: () => void;
  setAgentMode: (m: AgentMode) => void; setAgentSession: (s: AgentSession | null) => void;
  dismissAgentBanner: () => void; toggleAgentMode: () => void;
  setAgentPlan: (p: AgentPlanView | null) => void;
  updateAgentPlan: (u: Partial<AgentPlanView>) => void;
  updatePlanStep: (stepId: string, u: Partial<PlanStepView>) => void;
  setExecutionState: (s: ExecutionStateView | null) => void;
  setExecutionProgress: (p: ExecutionProgressView | null) => void;
  updateStepExecution: (e: StepExecutionView) => void;
  setStepExecutions: (e: StepExecutionView[]) => void;
  pauseExecution: () => void;
  resumeExecution: () => void;
  cancelExecution: () => void;
  skipStep: () => void;
  retryStep: (stepId: string) => void;
  rollbackAll: () => void;
  rollbackLast: () => void;
  showRollbackConfirm: (type: 'all' | 'last') => void;
  hideRollbackConfirm: () => void;
  setFileOpBatch: (b: FileOpBatchView | null) => void;
  updateFileOpResult: (r: FileOpResultView) => void;
  addFileConflict: (c: FileConflictView) => void;
  setImportUpdates: (u: ImportUpdateView[]) => void;
  setPostValidation: (v: PostExecutionValidationView | null) => void;
  resolveConflict: (operationId: string, resolution: string) => void;
  revertOperation: (operationId: string) => void;
  revertAllOps: () => void;
  viewFileDiff: (operationId: string) => void;
  clearFileOps: () => void;
  addTerminalExecution: (e: TerminalExecutionView) => void;
  updateTerminalExecution: (e: TerminalExecutionView) => void;
  appendTerminalOutput: (line: string) => void;
  clearTerminalOutput: () => void;
  setAutoFixStatus: (status: any | null) => void;
  setParsedErrors: (errors: ParsedErrorView[]) => void;
  setReviewSession: (s: ReviewSessionView | null) => void;
  setReviewChanges: (c: ReviewableChangeView[]) => void;
  updateChangeStatus: (changeId: string, status: ChangeStatusView) => void;
  setReviewSummary: (s: ReviewSummaryView | null) => void;
  setReviewSummaryLoading: (l: boolean) => void;
  setReviewProgress: (p: ReviewProgressView | null) => void;
  acceptAllChanges: () => void;
  rejectAllChanges: () => void;
  acceptChange: (changeId: string) => void;
  rejectChange: (changeId: string) => void;
  acceptHunk: (hunkId: string) => void;
  rejectHunk: (hunkId: string) => void;
  toggleChange: (changeId: string) => void;
  toggleHunk: (hunkId: string) => void;
  finalizeReview: (notes?: string) => void;
  showFileDiff: (changeId: string) => void;
  showHunkDiff: (changeId: string, hunkId: string) => void;
  undoAllChanges: () => void;
  undoFileChange: (changeId: string) => void;
  undoHunkChange: (hunkId: string, changeId: string) => void;
  addReviewNote: (note: string) => void;
  showUndoConfirm: (scope: string, files: string[]) => void;
  hideUndoConfirm: () => void;

  // Rules state & actions
  rulesActive: boolean;
  rulesSummary: string | null;
  rulesSections: RuleSectionView[];
  rulesErrors: string[];
  rulesLoading: boolean;
  rulesPreviewMode: 'sections' | 'preview';
  rulesPreviewText: string | null;
  setRulesStatus: (status: RulesStatusView) => void;
  setRulesPreviewMode: (mode: 'sections' | 'preview') => void;
  setRulesPreviewText: (text: string | null) => void;

  // Memory state & actions
  memories: MemoryView[];
  recalledMemories: MemorySearchResultView[];
  recentExtractions: ExtractedMemoryView[];
  memoryStats: MemoryStatsView | null;
  isAutoExtractEnabled: boolean;
  showMemoryPanel: boolean;
  setMemories: (memories: MemoryView[]) => void;
  setRecalledMemories: (memories: MemorySearchResultView[]) => void;
  setRecentExtractions: (extractions: ExtractedMemoryView[]) => void;
  setMemoryStats: (stats: MemoryStatsView | null) => void;
  addRecentExtraction: (extractions: ExtractedMemoryView[]) => void;
  removeRecentExtraction: (index: number) => void;
  setAutoExtractEnabled: (enabled: boolean) => void;
  setShowMemoryPanel: (show: boolean) => void;

  // Cache state & actions
  cacheStats: CacheStatsData | null;
  setCacheStats: (stats: CacheStatsData | null) => void;

  // Request metrics
  requestMetrics: RequestMetricsView | null;
  setRequestMetrics: (metrics: RequestMetricsView | null) => void;

  // Offline mode
  connectionState: string;
  connectionHealth: any | null;
  offlineQueue: any[];
  syncProgress: any | null;
  localModelAvailable: boolean;
  showOfflineBanner: boolean;
  offlineCapabilities: any[];
  setConnectionState: (state: string, health?: any) => void;
  setOfflineQueue: (queue: any[]) => void;
  setSyncProgress: (progress: any | null) => void;
  setLocalModelAvailable: (available: boolean) => void;
  dismissOfflineBanner: () => void;
  retryConnection: () => void;
  startSync: () => void;
  cancelSync: () => void;
  removeQueueItem: (id: string) => void;
  clearOfflineQueue: () => void;
  retryFailedQueue: () => void;
  downloadLocalModel: (modelName: string) => void;
  getOfflineCapabilities: () => void;

  // Error Recovery
  errorAnalytics: any | null;
  circuitBreakers: any[];
  showErrorDashboard: boolean;
  setErrorAnalytics: (analytics: any) => void;
  setCircuitBreakers: (breakers: any[]) => void;
  setShowErrorDashboard: (show: boolean) => void;
  requestErrorAnalytics: () => void;
  resetCircuitBreaker: (name: string) => void;
  resetAllCircuitBreakers: () => void;
  clearErrorHistory: () => void;
  runSelfHeal: () => void;
  generateBugReport: (errorId: string) => void;
  submitFeedback: (feedback: any) => void;
  submitResponseFeedback: (messageId: string, rating: 'good' | 'bad', comment?: string) => void;

  // Theme state & actions
  themeConfig: ThemeConfigView | null;
  activeThemeId: string;
  activeThemeMode: string;
  availableThemes: ThemeInfoView[];
  showThemeSettings: boolean;
  setThemeConfig: (config: ThemeConfigView | null) => void;
  setActiveTheme: (themeId: string, mode: string) => void;
  setAvailableThemes: (themes: ThemeInfoView[]) => void;
  setShowThemeSettings: (show: boolean) => void;
  requestTheme: () => void;
  requestAvailableThemes: () => void;
  applyTheme: (themeId: string) => void;
  applyThemeMode: (mode: string) => void;
  applyAccentColor: (color: string) => void;
  applyFontSize: (size: string) => void;
  applyBorderRadius: (level: string) => void;
  applyCompactMode: (compact: boolean) => void;

  // Global rules state & actions
  globalRulesActive: boolean;
  globalPrefs: GlobalPrefsView | null;
  globalCodingDefaults: GlobalCodingDefaultsView | null;
  globalResponseStyle: GlobalResponseStyleView | null;
  globalCustomInstructions: string[];
  globalRulesConflicts: { category: string; projectRule: string; globalRule: string; winner: string }[];
  setGlobalRulesStatus: (status: GlobalRulesStatusView) => void;

  // Onboarding state & actions
  showWelcome: boolean;
  onboardingState: OnboardingStateView | null;
  onboardingProgress: { completed: number; total: number; percentage: number } | null;
  activeTourStep: TourStepView | null;
  tourProgress: { current: number; total: number } | null;
  tutorialProgress: TutorialProgressView | null;
  activeLesson: TutorialLessonView | null;
  activeLessonStepIndex: number;
  tutorialLessons: TutorialLessonView[];
  shortcuts: ShortcutCategoryView[];
  shortcutsPlatform: string;
  activeHint: ProgressiveHintView | null;
  showWhatsNew: boolean;
  changelog: ChangelogEntryView[];
  changelogVersion: string;
  showShortcuts: boolean;
  showTutorial: boolean;
  setShowWelcome: (show: boolean) => void;
  setOnboardingState: (state: OnboardingStateView | null) => void;
  setOnboardingProgress: (progress: { completed: number; total: number; percentage: number } | null) => void;
  setActiveTourStep: (step: TourStepView | null, progress?: { current: number; total: number }) => void;
  setTutorialProgress: (progress: TutorialProgressView | null) => void;
  setActiveLesson: (lesson: TutorialLessonView | null, stepIndex?: number) => void;
  setTutorialLessons: (lessons: TutorialLessonView[]) => void;
  setShortcuts: (shortcuts: ShortcutCategoryView[], platform: string) => void;
  setActiveHint: (hint: ProgressiveHintView | null) => void;
  setShowWhatsNew: (show: boolean, changelog?: ChangelogEntryView[], version?: string) => void;
  setShowShortcuts: (show: boolean) => void;
  setShowTutorial: (show: boolean) => void;
  startTour: (tourId: string) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  skipTour: () => void;
  startTutorial: () => void;
  startLesson: (lessonId: string) => void;
  advanceTutorialStep: () => void;
  skipLesson: () => void;
  dismissHint: (hintId: string) => void;
  requestShortcuts: () => void;
  dismissWhatsNew: () => void;
  resetOnboarding: () => void;

  // Shortcut Manager state & actions
  shortcutDefinitions: ShortcutDefinitionView[];
  shortcutProfiles: ShortcutProfileView[];
  activeShortcutProfile: string;
  shortcutConflicts: ShortcutConflictView[];
  shortcutDisabledIds: string[];
  showShortcutManager: boolean;
  setShortcutDefinitions: (defs: ShortcutDefinitionView[], profiles: ShortcutProfileView[], activeProfile: string, disabled: string[]) => void;
  setShortcutConflicts: (conflicts: ShortcutConflictView[]) => void;
  setShowShortcutManager: (show: boolean) => void;
  requestShortcutDefinitions: () => void;

  // Status state & actions
  systemStatus: SystemStatusView | null;
  overallHealth: string | null;
  healthReport: HealthReportView | null;
  showHealthDashboard: boolean;
  showStatusDetail: string | null;
  setSystemStatus: (status: SystemStatusView) => void;
  setHealthReport: (report: HealthReportView | null) => void;
  setShowHealthDashboard: (show: boolean) => void;
  setShowStatusDetail: (section: string | null) => void;
  requestSystemStatus: () => void;
  resetTokenUsage: () => void;

  // Privacy state & actions
  privacyConfig: any | null;
  privacyMode: string;
  dataInventory: any[];
  privacyAuditLog: any[];
  showPrivacyDashboard: boolean;
  showPrivacyNotice: boolean;
  isDataEncrypted: boolean;
  keyFingerprint: string;
  setPrivacyConfig: (config: any) => void;
  setPrivacyMode: (mode: string) => void;
  setDataInventory: (inventory: any[]) => void;
  setPrivacyAuditLog: (log: any[]) => void;
  setShowPrivacyDashboard: (show: boolean) => void;
  setShowPrivacyNotice: (show: boolean) => void;
  // Access Control (Phase 12.2)
  apiKeys: any[];
  currentTeam: any | null;
  teamMembers: any[];
  auditLogs: any[];
  auditTotal: number;
  permissions: any[];
  rateLimitStatus: any | null;
  showAccessPanel: boolean;
  currentRole: string | null;
  setApiKeys: (keys: any[]) => void;
  setCurrentTeam: (team: any | null) => void;
  setTeamMembers: (members: any[]) => void;
  setAuditLogs: (logs: any[], total: number) => void;
  appendAuditLogs: (logs: any[]) => void;
  setPermissions: (permissions: any[]) => void;
  setRateLimitStatus: (status: any) => void;
  setShowAccessPanel: (show: boolean) => void;
  setCurrentRole: (role: string | null) => void;
  // Code Security (Phase 12.3)
  securityAlerts: any[];
  codeSecurityStats: any | null;
  sensitiveFileScanResult: any | null;
  transmissionReport: string | null;
  showCodeSecurityPanel: boolean;
  pendingSecretWarning: { detections: any[]; messageId: string } | null;
  pendingCodeWarning: { warnings: any[]; codeId: string; autoFix: string | null } | null;
  setSecurityAlerts: (alerts: any[]) => void;
  setCodeSecurityStats: (stats: any) => void;
  setSensitiveFileScanResult: (result: any | null) => void;
  setTransmissionReport: (report: string | null) => void;
  setShowCodeSecurityPanel: (show: boolean) => void;
  setPendingSecretWarning: (warning: { detections: any[]; messageId: string } | null) => void;
  setPendingCodeWarning: (warning: { warnings: any[]; codeId: string; autoFix: string | null } | null) => void;

  // Enterprise (Phase 13.4)
  adminDashboard: any | null;
  usageDashboard: any | null;
  ssoProviders: any[];
  registeredModels: any[];
  license: any | null;
  adminSettings: any[];
  adminUsers: { users: any[]; total: number } | null;
  showAdminPanel: boolean;
  setAdminDashboard: (data: any) => void;
  setUsageDashboard: (data: any) => void;
  setSSOProviders: (providers: any[]) => void;
  setRegisteredModels: (models: any[]) => void;
  setLicense: (license: any | null) => void;
  setAdminSettings: (settings: any[]) => void;
  setAdminUsers: (data: { users: any[]; total: number } | null) => void;
  setShowAdminPanel: (show: boolean) => void;

  // Apply (Phase 15.2)
  applyResults: Record<string, any>;
  setApplyResult: (codeBlockId: string, result: any) => void;

  // Predict (Phase 15.3)
  predictionChain: { active: boolean; current: number; total: number } | null;
  setPredictionChain: (chain: { active: boolean; current: number; total: number } | null) => void;

  // Link Fetch (Phase 17.3)
  fetchedLinks: any[];
  setFetchedLinks: (links: any[]) => void;

  // Context Visualization (Phase 17.5)
  contextVisualization: any | null;
  setContextVisualization: (data: any) => void;

  // Bug Finder (Phase 15.5)
  bugScanResult: any | null;
  bugScanProgress: any | null;
  showBugFinderPanel: boolean;
  setBugScanResult: (result: any | null) => void;
  setBugScanProgress: (progress: any | null) => void;
  setShowBugFinderPanel: (show: boolean) => void;
  scanCurrentFile: () => void;
  scanChangedFiles: () => void;
  scanProject: () => void;

  // AI Commit Message (Phase 15.6)
  commitMessage: any | null;
  isGeneratingCommit: boolean;
  setCommitMessage: (result: any | null) => void;
  setIsGeneratingCommit: (loading: boolean) => void;
  generateCommitMessage: (staged?: boolean) => void;

  // Shadow Workspace (Phase 17.1)
  shadowSession: any | null;
  shadowDiffs: any[];
  shadowStats: any | null;
  showShadowPanel: boolean;
  setShadowSession: (session: any | null) => void;
  setShadowDiffs: (diffs: any[]) => void;
  setShadowStats: (stats: any | null) => void;
  setShowShadowPanel: (show: boolean) => void;
  acceptShadowFile: (sessionId: string, filePath: string) => void;
  rejectShadowFile: (sessionId: string, filePath: string) => void;
  acceptAllShadow: (sessionId: string) => void;
  rejectAllShadow: (sessionId: string) => void;

  // UX (Phase 17.7)
  isAITyping: boolean;
  messageHistory: string[];
  bookmarkedMessages: Set<string>;
  setIsAITyping: (typing: boolean) => void;
  addToMessageHistory: (msg: string) => void;
  toggleBookmark: (messageId: string) => void;

  // Benchmark (Phase 17.6)
  benchmarkSuite: any | null;
  isBenchmarkRunning: boolean;
  setBenchmarkSuite: (suite: any | null) => void;
  setIsBenchmarkRunning: (running: boolean) => void;
  runBenchmark: (category?: string) => void;

  // Notepads (Phase 16.4)
  notepads: any[];
  showNotepadPanel: boolean;
  setNotepads: (notepads: any[]) => void;
  setShowNotepadPanel: (show: boolean) => void;
  notepadList: () => void;
  notepadCreate: (name: string, type: any, content: string) => void;
  notepadDelete: (id: string) => void;
  notepadPin: (id: string) => void;
  notepadUnpin: (id: string) => void;
  notepadAttach: (id: string) => void;
  notepadDetach: (id: string) => void;
  notepadOpen: (id: string) => void;
  notepadUpdate: (id: string, content: string) => void;

  // History Search (Phase 16.5)
  historyResults: any[];
  historyConversations: any[];
  historyStats: any | null;
  showHistorySearchPanel: boolean;
  setHistoryResults: (results: any[]) => void;
  setHistoryConversations: (conversations: any[]) => void;
  setHistoryStats: (stats: any | null) => void;
  setShowHistorySearchPanel: (show: boolean) => void;
  historySearch: (query: string, options?: any) => void;
  historyListConversations: () => void;
  historyLoadConversation: (id: string) => void;
  historyDeleteConversation: (id: string) => void;
  historyExportConversation: (id: string, format: 'json' | 'md') => void;

  // MCP (Phase 16.2)
  mcpServers: any[];
  mcpTools: any[];
  showMCPPanel: boolean;
  setMCPServers: (servers: any[]) => void;
  setMCPTools: (tools: any[]) => void;
  setShowMCPPanel: (show: boolean) => void;
  mcpListServers: () => void;
  mcpConnectServer: (config: any) => void;
  mcpDisconnectServer: (serverName: string) => void;
  mcpAddServer: (config: any) => void;
  mcpRemoveServer: (serverName: string) => void;
  mcpCallTool: (serverName: string, toolName: string, args: Record<string, any>) => void;

  // Web Search (Phase 16.3)
  webSearchResults: any | null;
  setWebSearchResults: (results: any | null) => void;
  webSearch: (query: string, maxResults?: number) => void;

  // Composer (Phase 16.1)
  composerSession: any | null;
  composerLayout: any;
  showComposer: boolean;
  selectedComposerFile: string | null;
  setComposerSession: (session: any | null) => void;
  setComposerLayout: (layout: any) => void;
  setShowComposer: (show: boolean) => void;
  selectComposerFile: (filePath: string | null) => void;
  openComposer: (instruction: string) => void;
  closeComposer: () => void;
  startComposerPlanning: () => void;
  executeComposerPlan: () => void;
  sendComposerRefinement: (instruction: string) => void;
  acceptComposerFile: (filePath: string) => void;
  rejectComposerFile: (filePath: string) => void;
  acceptAllComposer: () => void;
  rejectAllComposer: () => void;
  acceptComposerHunk: (filePath: string, hunkIndex: number, accepted: boolean) => void;
  createComposerCheckpoint: (description: string) => void;
  restoreComposerCheckpoint: (checkpointId: string) => void;
  pauseComposer: () => void;
  resumeComposer: () => void;
}

const genId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [], conversations: [], currentConversationId: null,
  isStreaming: false, streamingInfo: null, inputValue: '', context: null,
  activeContext: null, isContextEnabled: true,
  mentions: [], mentionSuggestions: [], isMentionLoading: false,
  config: {}, error: null, canRetry: false,
  agentMode: 'chat' as AgentMode, agentSession: null, showAgentBanner: true, agentPlan: null,
  executionState: null, executionProgress: null, stepExecutions: [], showRollbackDialog: false, rollbackType: null,
  fileOpBatch: null, fileConflicts: [], importUpdates: [], postValidation: null,
  terminalExecutions: [], currentTerminalExecution: null, terminalOutputLines: [], autoFixInProgress: false, autoFixStatus: null, parsedErrors: [],
  reviewSession: null, reviewChanges: [], reviewSummary: null, reviewProgress: null, isReviewSummaryLoading: false, showUndoDialog: false, undoScope: null, undoFilesAffected: [],
  docSources: [], docSearchResults: [], docSuggestions: [], docCrawlProgress: null, isDocsCrawling: false,
  gitStatus: null, gitCommitLog: [], gitBlameCurrent: null, gitPR: null, isGitLoading: false, gitBranchName: null,
  rulesActive: false, rulesSummary: null, rulesSections: [], rulesErrors: [], rulesLoading: false, rulesPreviewMode: 'sections' as const, rulesPreviewText: null,
  memories: [] as MemoryView[], recalledMemories: [] as MemorySearchResultView[], recentExtractions: [] as ExtractedMemoryView[], memoryStats: null as MemoryStatsView | null, isAutoExtractEnabled: true, showMemoryPanel: false,
  cacheStats: null as CacheStatsData | null,
  requestMetrics: null as RequestMetricsView | null,
  connectionState: 'unknown', connectionHealth: null, offlineQueue: [] as any[], syncProgress: null, localModelAvailable: false, showOfflineBanner: true, offlineCapabilities: [] as any[],
  errorAnalytics: null, circuitBreakers: [] as any[], showErrorDashboard: false,
  themeConfig: null as ThemeConfigView | null, activeThemeId: 'ina-dark', activeThemeMode: 'dark', availableThemes: [] as ThemeInfoView[], showThemeSettings: false,
  globalRulesActive: false, globalPrefs: null, globalCodingDefaults: null, globalResponseStyle: null, globalCustomInstructions: [], globalRulesConflicts: [],
  showWelcome: false, onboardingState: null, onboardingProgress: null,
  activeTourStep: null, tourProgress: null,
  tutorialProgress: null, activeLesson: null, activeLessonStepIndex: 0, tutorialLessons: [],
  shortcuts: [], shortcutsPlatform: 'mac', activeHint: null,
  showWhatsNew: false, changelog: [], changelogVersion: '', showShortcuts: false, showTutorial: false,
  shortcutDefinitions: [], shortcutProfiles: [], activeShortcutProfile: 'default', shortcutConflicts: [], shortcutDisabledIds: [], showShortcutManager: false,
  systemStatus: null as SystemStatusView | null, overallHealth: null, healthReport: null as HealthReportView | null, showHealthDashboard: false, showStatusDetail: null as string | null,
  privacyConfig: null, privacyMode: 'standard', dataInventory: [], privacyAuditLog: [], showPrivacyDashboard: false, showPrivacyNotice: false, isDataEncrypted: true, keyFingerprint: '',
  // Access Control (Phase 12.2)
  apiKeys: [], currentTeam: null, teamMembers: [], auditLogs: [], auditTotal: 0, permissions: [], rateLimitStatus: null, showAccessPanel: false, currentRole: null,
  securityAlerts: [], codeSecurityStats: null, sensitiveFileScanResult: null, transmissionReport: null, showCodeSecurityPanel: false, pendingSecretWarning: null, pendingCodeWarning: null,
  // Enterprise (Phase 13.4)
  adminDashboard: null, usageDashboard: null, ssoProviders: [], registeredModels: [], license: null, adminSettings: [], adminUsers: null, showAdminPanel: false,
  // Apply (Phase 15.2)
  applyResults: {},
  setApplyResult: (codeBlockId, result) => set((s) => ({ applyResults: { ...s.applyResults, [codeBlockId]: result } })),
  // Predict (Phase 15.3)
  predictionChain: null,
  setPredictionChain: (chain) => set({ predictionChain: chain }),
  // Link Fetch (Phase 17.3)
  fetchedLinks: [] as any[],
  setFetchedLinks: (links: any[]) => set({ fetchedLinks: links }),
  // Context Visualization (Phase 17.5)
  contextVisualization: null as any,
  setContextVisualization: (data: any) => set({ contextVisualization: data }),
  // Bug Finder (Phase 15.5)
  bugScanResult: null, bugScanProgress: null, showBugFinderPanel: false,
  setBugScanResult: (result) => set({ bugScanResult: result }),
  setBugScanProgress: (progress) => set({ bugScanProgress: progress }),
  setShowBugFinderPanel: (show) => set({ showBugFinderPanel: show }),
  scanCurrentFile: () => postMessage({ type: 'scanCurrentFile' } as any),
  scanChangedFiles: () => postMessage({ type: 'scanChangedFiles' } as any),
  scanProject: () => postMessage({ type: 'scanProject' } as any),
  // AI Commit Message (Phase 15.6)
  commitMessage: null, isGeneratingCommit: false,
  setCommitMessage: (result) => set({ commitMessage: result }),
  setIsGeneratingCommit: (loading) => set({ isGeneratingCommit: loading }),
  generateCommitMessage: (staged) => { set({ isGeneratingCommit: true }); postMessage({ type: 'generateCommitMessage', staged } as any); },
  // Shadow Workspace (Phase 17.1)
  shadowSession: null, shadowDiffs: [], shadowStats: null, showShadowPanel: false,
  setShadowSession: (session) => set({ shadowSession: session }),
  setShadowDiffs: (diffs) => set({ shadowDiffs: diffs }),
  setShadowStats: (stats) => set({ shadowStats: stats }),
  setShowShadowPanel: (show) => set({ showShadowPanel: show }),
  acceptShadowFile: (sessionId, filePath) => postMessage({ type: 'acceptShadowFile', sessionId, filePath } as any),
  rejectShadowFile: (sessionId, filePath) => postMessage({ type: 'rejectShadowFile', sessionId, filePath } as any),
  acceptAllShadow: (sessionId) => postMessage({ type: 'acceptAllShadow', sessionId } as any),
  rejectAllShadow: (sessionId) => postMessage({ type: 'rejectAllShadow', sessionId } as any),
  // UX (Phase 17.7)
  isAITyping: false, messageHistory: [] as string[], bookmarkedMessages: new Set<string>(),
  setIsAITyping: (typing) => set({ isAITyping: typing }),
  addToMessageHistory: (msg) => set((s) => ({ messageHistory: [msg, ...s.messageHistory].slice(0, 50) })),
  toggleBookmark: (messageId) => set((s) => { const bm = new Set(s.bookmarkedMessages); if (bm.has(messageId)) bm.delete(messageId); else bm.add(messageId); return { bookmarkedMessages: bm }; }),
  // Benchmark (Phase 17.6)
  benchmarkSuite: null, isBenchmarkRunning: false,
  setBenchmarkSuite: (suite) => set({ benchmarkSuite: suite }),
  setIsBenchmarkRunning: (running) => set({ isBenchmarkRunning: running }),
  runBenchmark: (category) => { set({ isBenchmarkRunning: true }); postMessage({ type: 'runBenchmark', category } as any); },

  // Notepads (Phase 16.4)
  notepads: [] as any[],
  showNotepadPanel: false,
  setNotepads: (notepads) => set({ notepads }),
  setShowNotepadPanel: (show) => set({ showNotepadPanel: show }),
  notepadList: () => postMessage({ type: 'notepadList' } as any),
  notepadCreate: (name, type, content) => postMessage({ type: 'notepadCreate', name, notepadType: type, content } as any),
  notepadDelete: (id) => postMessage({ type: 'notepadDelete', id } as any),
  notepadPin: (id) => postMessage({ type: 'notepadPin', id } as any),
  notepadUnpin: (id) => postMessage({ type: 'notepadUnpin', id } as any),
  notepadAttach: (id) => postMessage({ type: 'notepadAttach', id } as any),
  notepadDetach: (id) => postMessage({ type: 'notepadDetach', id } as any),
  notepadOpen: (id) => postMessage({ type: 'notepadOpen', id } as any),
  notepadUpdate: (id, content) => postMessage({ type: 'notepadUpdate', id, content } as any),

  // History Search (Phase 16.5)
  historyResults: [] as any[],
  historyConversations: [] as any[],
  historyStats: null as any,
  showHistorySearchPanel: false,
  setHistoryResults: (results) => set({ historyResults: results }),
  setHistoryConversations: (conversations) => set({ historyConversations: conversations }),
  setHistoryStats: (stats) => set({ historyStats: stats }),
  setShowHistorySearchPanel: (show) => { set({ showHistorySearchPanel: show }); if (show) postMessage({ type: 'historyListConversations' } as any); },
  historySearch: (query, options) => postMessage({ type: 'historySearch', query, options } as any),
  historyListConversations: () => postMessage({ type: 'historyListConversations' } as any),
  historyLoadConversation: (id) => postMessage({ type: 'historyLoadConversation', id } as any),
  historyDeleteConversation: (id) => postMessage({ type: 'historyDeleteConversation', id } as any),
  historyExportConversation: (id, format) => postMessage({ type: 'historyExportConversation', id, format } as any),

  // MCP (Phase 16.2)
  mcpServers: [] as any[],
  mcpTools: [] as any[],
  showMCPPanel: false,
  setMCPServers: (servers) => set({ mcpServers: servers }),
  setMCPTools: (tools) => set({ mcpTools: tools }),
  setShowMCPPanel: (show) => set({ showMCPPanel: show }),
  mcpListServers: () => postMessage({ type: 'mcpListServers' } as any),
  mcpConnectServer: (config) => postMessage({ type: 'mcpConnectServer', config } as any),
  mcpDisconnectServer: (serverName) => postMessage({ type: 'mcpDisconnectServer', serverName } as any),
  mcpAddServer: (config) => postMessage({ type: 'mcpAddServer', config } as any),
  mcpRemoveServer: (serverName) => postMessage({ type: 'mcpRemoveServer', serverName } as any),
  mcpCallTool: (serverName, toolName, args) => postMessage({ type: 'mcpCallTool', serverName, toolName, arguments: args } as any),

  // Web Search (Phase 16.3)
  webSearchResults: null as any,
  setWebSearchResults: (results) => set({ webSearchResults: results }),
  webSearch: (query, maxResults) => postMessage({ type: 'webSearch', query, maxResults } as any),

  // Composer (Phase 16.1)
  composerSession: null,
  composerLayout: 'fullscreen',
  showComposer: false,
  selectedComposerFile: null,
  setComposerSession: (session) => set({ composerSession: session }),
  setComposerLayout: (layout) => { set({ composerLayout: layout }); postMessage({ type: 'setComposerLayout', layout } as any); },
  setShowComposer: (show) => set({ showComposer: show }),
  selectComposerFile: (filePath) => set({ selectedComposerFile: filePath }),
  openComposer: (instruction) => { set({ showComposer: true }); postMessage({ type: 'openComposer', instruction } as any); },
  closeComposer: () => { set({ showComposer: false, composerSession: null }); postMessage({ type: 'closeComposer' } as any); },
  startComposerPlanning: () => { const s = get().composerSession; if (s) postMessage({ type: 'startComposerPlanning', sessionId: s.id } as any); },
  executeComposerPlan: () => { const s = get().composerSession; if (s) postMessage({ type: 'executeComposerPlan', sessionId: s.id } as any); },
  sendComposerRefinement: (instruction) => { const s = get().composerSession; if (s) postMessage({ type: 'refineComposer', sessionId: s.id, instruction } as any); },
  acceptComposerFile: (filePath) => { const s = get().composerSession; if (s) postMessage({ type: 'acceptComposerFile', sessionId: s.id, filePath } as any); },
  rejectComposerFile: (filePath) => { const s = get().composerSession; if (s) postMessage({ type: 'rejectComposerFile', sessionId: s.id, filePath } as any); },
  acceptAllComposer: () => { const s = get().composerSession; if (s) postMessage({ type: 'acceptComposerAll', sessionId: s.id } as any); },
  rejectAllComposer: () => { const s = get().composerSession; if (s) postMessage({ type: 'rejectComposerAll', sessionId: s.id } as any); },
  acceptComposerHunk: (filePath, hunkIndex, accepted) => { const s = get().composerSession; if (s) postMessage({ type: 'acceptComposerHunk', sessionId: s.id, filePath, hunkIndex, accepted } as any); },
  createComposerCheckpoint: (description) => { const s = get().composerSession; if (s) postMessage({ type: 'createComposerCheckpoint', sessionId: s.id, description } as any); },
  restoreComposerCheckpoint: (checkpointId) => { const s = get().composerSession; if (s) postMessage({ type: 'restoreComposerCheckpoint', sessionId: s.id, checkpointId } as any); },
  pauseComposer: () => { const s = get().composerSession; if (s) postMessage({ type: 'pauseComposer', sessionId: s.id } as any); },
  resumeComposer: () => { const s = get().composerSession; if (s) postMessage({ type: 'resumeComposer', sessionId: s.id } as any); },

  setAdminDashboard: (data) => set({ adminDashboard: data }),
  setUsageDashboard: (data) => set({ usageDashboard: data }),
  setSSOProviders: (providers) => set({ ssoProviders: providers }),
  setRegisteredModels: (models) => set({ registeredModels: models }),
  setLicense: (license) => set({ license }),
  setAdminSettings: (settings) => set({ adminSettings: settings }),
  setAdminUsers: (data) => set({ adminUsers: data }),
  setShowAdminPanel: (show) => set({ showAdminPanel: show }),

  setGitStatus: (gitStatus) => set({ gitStatus, gitBranchName: gitStatus?.branch?.name || null }),
  setGitCommitLog: (gitCommitLog) => set({ gitCommitLog }),
  appendGitCommits: (commits) => set((s) => ({ gitCommitLog: [...s.gitCommitLog, ...commits] })),
  setGitBlame: (gitBlameCurrent) => set({ gitBlameCurrent }),
  setGitPR: (gitPR) => set({ gitPR }),
  requestGitStatus: () => { postMessage({ type: 'requestGitStatus' } as any); },
  requestGitLog: () => { postMessage({ type: 'requestGitLog' } as any); },
  requestGitBlame: (filePath) => { postMessage({ type: 'requestGitBlame', filePath } as any); },
  requestGitPR: () => { postMessage({ type: 'requestGitPR' } as any); },
  switchBranch: (branchName) => { postMessage({ type: 'switchBranch', branchName } as any); },
  stageFile: (path) => { postMessage({ type: 'stageFile', path } as any); },
  unstageFile: (path) => { postMessage({ type: 'unstageFile', path } as any); },
  stageAll: () => { postMessage({ type: 'stageAll' } as any); },
  openGitDiff: (path) => { postMessage({ type: 'openGitDiff', path } as any); },
  insertGitMention: (subCommand) => { postMessage({ type: 'insertGitMention', subCommand } as any); },
  toggleGitBlame: () => { postMessage({ type: 'toggleGitBlame' } as any); },

  // LSP state & actions
  lspContext: null as LSPContextView | null,
  fileSymbols: [] as SymbolInfoView[],
  fileDiagnostics: [] as DiagnosticInfoView[],
  currentTypeInfo: null as TypeInfoView | null,
  currentReferences: [] as ReferenceGroupView[],
  callHierarchy: null as CallHierarchyItemView | null,

  setLSPContext: (lspContext: LSPContextView | null) => set({ lspContext, fileSymbols: lspContext?.fileSymbols || [], fileDiagnostics: lspContext?.diagnostics || [], currentTypeInfo: lspContext?.currentType || null, callHierarchy: lspContext?.callHierarchy || null }),
  setFileSymbols: (fileSymbols: SymbolInfoView[]) => set({ fileSymbols }),
  setFileDiagnostics: (fileDiagnostics: DiagnosticInfoView[]) => set({ fileDiagnostics }),
  setCurrentType: (currentTypeInfo: TypeInfoView | null) => set({ currentTypeInfo }),
  setCurrentReferences: (currentReferences: ReferenceGroupView[]) => set({ currentReferences }),
  setCallHierarchy: (callHierarchy: CallHierarchyItemView | null) => set({ callHierarchy }),
  requestLSPContext: () => { postMessage({ type: 'requestLSPContext' } as any); },
  requestDefinition: (filePath: string, line: number, col: number) => { postMessage({ type: 'requestDefinition', filePath, line, col } as any); },
  requestReferences: (filePath: string, line: number, col: number) => { postMessage({ type: 'requestReferences', filePath, line, col } as any); },
  fixDiagnosticWithAI: (diagnostic: DiagnosticInfoView) => { postMessage({ type: 'fixDiagnosticWithAI', diagnostic } as any); },
  explainSymbol: (symbolName: string) => { postMessage({ type: 'explainSymbol', symbolName } as any); },
  explainDiagnostic: (diagnostic: DiagnosticInfoView) => { postMessage({ type: 'explainDiagnostic', diagnostic } as any); },
  navigateToSymbol: (filePath: string, line: number) => { postMessage({ type: 'navigateToSymbol', filePath, line } as any); },

  // Vision state & actions
  pendingImages: [] as ImageAttachmentView[],
  isAnalyzingImage: false,
  isDesignToCode: false,
  designToCodeResult: null as DesignToCodeResponseView | null,
  visionAnalysis: null as VisionAnalysisView | null,
  activeImageModal: null as ImageAttachmentView | null,
  activeAnnotationImage: null as ImageAttachmentView | null,
  addPendingImage: (image: ImageAttachmentView) => set((s) => ({ pendingImages: [...s.pendingImages, image].slice(0, 5) })),
  removePendingImage: (imageId: string) => set((s) => ({ pendingImages: s.pendingImages.filter(i => i.id !== imageId) })),
  clearPendingImages: () => set({ pendingImages: [] }),
  setPendingImageAnnotations: (imageId: string, annotations: VisionAnnotationView[]) => set((s) => ({
    pendingImages: s.pendingImages.map(i => i.id === imageId ? { ...i, annotations } : i),
  })),
  setVisionAnalysis: (visionAnalysis: VisionAnalysisView | null) => set({ visionAnalysis, isAnalyzingImage: false }),
  setDesignToCodeResult: (designToCodeResult: DesignToCodeResponseView | null) => set({ designToCodeResult, isDesignToCode: false }),
  openImageModal: (activeImageModal: ImageAttachmentView) => set({ activeImageModal }),
  closeImageModal: () => set({ activeImageModal: null }),
  openAnnotationEditor: (activeAnnotationImage: ImageAttachmentView) => set({ activeAnnotationImage }),
  closeAnnotationEditor: () => set({ activeAnnotationImage: null }),

  setDocSources: (docSources) => set({ docSources }),
  addDocSource: (source) => { postMessage({ type: 'addDocSource', source } as any); },
  removeDocSource: (sourceId) => { postMessage({ type: 'removeDocSource', sourceId } as any); },
  startDocCrawl: (sourceId) => { postMessage({ type: 'startDocCrawl', sourceId } as any); },
  searchDocs: (query) => { postMessage({ type: 'searchDocs', query } as any); },
  setDocSuggestions: (docSuggestions) => set({ docSuggestions }),
  setDocSearchResults: (docSearchResults) => set({ docSearchResults }),
  setDocCrawlProgress: (docCrawlProgress) => set({ docCrawlProgress, isDocsCrawling: docCrawlProgress !== null }),
  dismissDocSuggestions: () => set({ docSuggestions: [] }),
  insertDocMention: (source, topic) => { postMessage({ type: 'insertDocMention', source, topic } as any); },

  // Rules actions
  setRulesStatus: (status: RulesStatusView) => set({ rulesActive: status.active, rulesSummary: status.summary, rulesSections: status.sections, rulesErrors: status.errors, rulesLoading: false }),
  setRulesPreviewMode: (rulesPreviewMode) => set({ rulesPreviewMode }),
  setRulesPreviewText: (rulesPreviewText) => set({ rulesPreviewText }),

  // Memory actions
  setMemories: (memories: MemoryView[]) => set({ memories }),
  setRecalledMemories: (recalledMemories: MemorySearchResultView[]) => set({ recalledMemories }),
  setRecentExtractions: (recentExtractions: ExtractedMemoryView[]) => set({ recentExtractions }),
  setMemoryStats: (memoryStats: MemoryStatsView | null) => set({ memoryStats }),
  addRecentExtraction: (extractions: ExtractedMemoryView[]) => set((s) => ({ recentExtractions: [...extractions, ...s.recentExtractions].slice(0, 20) })),
  removeRecentExtraction: (index: number) => set((s) => ({ recentExtractions: s.recentExtractions.filter((_, i) => i !== index) })),
  setAutoExtractEnabled: (isAutoExtractEnabled: boolean) => set({ isAutoExtractEnabled }),
  setShowMemoryPanel: (showMemoryPanel: boolean) => set({ showMemoryPanel }),

  // Cache actions
  setCacheStats: (cacheStats: CacheStatsData | null) => set({ cacheStats }),

  // Request metrics actions
  setRequestMetrics: (requestMetrics: RequestMetricsView | null) => set({ requestMetrics }),

  // Offline mode actions
  setConnectionState: (state: string, health?: any) => set({ connectionState: state, connectionHealth: health, showOfflineBanner: state !== 'online' && state !== 'unknown' }),
  setOfflineQueue: (queue: any[]) => set({ offlineQueue: queue }),
  setSyncProgress: (progress: any | null) => set({ syncProgress: progress }),
  setLocalModelAvailable: (available: boolean) => set({ localModelAvailable: available }),
  dismissOfflineBanner: () => set({ showOfflineBanner: false }),
  retryConnection: () => { postMessage({ type: 'retryConnection' }); },
  startSync: () => { postMessage({ type: 'startSync' }); },
  cancelSync: () => { postMessage({ type: 'cancelSync' }); },
  removeQueueItem: (id: string) => { postMessage({ type: 'removeQueueItem', itemId: id }); },
  clearOfflineQueue: () => { postMessage({ type: 'clearQueue' }); },
  retryFailedQueue: () => { postMessage({ type: 'retryFailedQueue' }); },
  downloadLocalModel: (modelName: string) => { postMessage({ type: 'downloadLocalModel', modelName }); },
  getOfflineCapabilities: () => { postMessage({ type: 'getOfflineCapabilities' }); },

  // Error Recovery actions
  setErrorAnalytics: (analytics: any) => set({ errorAnalytics: analytics }),
  setCircuitBreakers: (breakers: any[]) => set({ circuitBreakers: breakers }),
  setShowErrorDashboard: (show: boolean) => set({ showErrorDashboard: show }),
  requestErrorAnalytics: () => { postMessage({ type: 'requestErrorAnalytics' }); },
  resetCircuitBreaker: (name: string) => { postMessage({ type: 'resetCircuitBreaker', name }); },
  resetAllCircuitBreakers: () => { postMessage({ type: 'resetAllCircuitBreakers' }); },
  clearErrorHistory: () => { postMessage({ type: 'clearErrorHistory' }); },
  runSelfHeal: () => { postMessage({ type: 'runSelfHeal' }); },
  generateBugReport: (errorId: string) => { postMessage({ type: 'generateBugReport', errorId }); },
  submitFeedback: (feedback: any) => { postMessage({ type: 'submitFeedback', feedback }); },
  submitResponseFeedback: (messageId: string, rating: 'good' | 'bad', comment?: string) => { postMessage({ type: 'submitResponseFeedback', messageId, rating, comment }); },

  // Theme actions
  setThemeConfig: (themeConfig: ThemeConfigView | null) => set({ themeConfig }),
  setActiveTheme: (themeId: string, mode: string) => set({ activeThemeId: themeId, activeThemeMode: mode }),
  setAvailableThemes: (availableThemes: ThemeInfoView[]) => set({ availableThemes }),
  setShowThemeSettings: (showThemeSettings: boolean) => set({ showThemeSettings }),
  requestTheme: () => { postMessage({ type: 'requestTheme' } as any); },
  requestAvailableThemes: () => { postMessage({ type: 'requestAvailableThemes' } as any); },
  applyTheme: (themeId: string) => { postMessage({ type: 'setTheme', themeId } as any); },
  applyThemeMode: (mode: string) => { postMessage({ type: 'setThemeMode', mode } as any); },
  applyAccentColor: (color: string) => { postMessage({ type: 'setAccentColor', color } as any); },
  applyFontSize: (size: string) => { postMessage({ type: 'setFontSize', size } as any); },
  applyBorderRadius: (level: string) => { postMessage({ type: 'setBorderRadius', level } as any); },
  applyCompactMode: (compact: boolean) => { postMessage({ type: 'setCompactMode', compact } as any); },

  // Global rules actions
  setGlobalRulesStatus: (status: GlobalRulesStatusView) => set({
    globalRulesActive: status.active,
    globalPrefs: status.preferences,
    globalCodingDefaults: status.codingDefaults,
    globalResponseStyle: status.responseStyle,
    globalCustomInstructions: status.customInstructions,
    globalRulesConflicts: status.conflicts,
  }),

  // Onboarding actions
  setShowWelcome: (showWelcome: boolean) => set({ showWelcome }),
  setOnboardingState: (onboardingState: OnboardingStateView | null) => set({ onboardingState }),
  setOnboardingProgress: (onboardingProgress) => set({ onboardingProgress }),
  setActiveTourStep: (step, progress) => set({ activeTourStep: step, tourProgress: progress || null }),
  setTutorialProgress: (tutorialProgress) => set({ tutorialProgress }),
  setActiveLesson: (lesson, stepIndex) => set({ activeLesson: lesson, activeLessonStepIndex: stepIndex ?? 0 }),
  setTutorialLessons: (tutorialLessons) => set({ tutorialLessons }),
  setShortcuts: (shortcuts, platform) => set({ shortcuts, shortcutsPlatform: platform }),
  setActiveHint: (activeHint) => set({ activeHint }),
  setShowWhatsNew: (show, changelog, version) => set({ showWhatsNew: show, ...(changelog ? { changelog } : {}), ...(version ? { changelogVersion: version } : {}) }),
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  setShowTutorial: (showTutorial) => set({ showTutorial }),
  startTour: (tourId) => { postMessage({ type: 'startTour', tourId } as any); },
  nextTourStep: () => { postMessage({ type: 'nextTourStep' } as any); },
  prevTourStep: () => { postMessage({ type: 'prevTourStep' } as any); },
  skipTour: () => { postMessage({ type: 'skipTour' } as any); set({ activeTourStep: null, tourProgress: null }); },
  startTutorial: () => { postMessage({ type: 'startTutorial' } as any); },
  startLesson: (lessonId) => { postMessage({ type: 'startLesson', lessonId } as any); },
  advanceTutorialStep: () => { postMessage({ type: 'advanceTutorialStep' } as any); },
  skipLesson: () => { postMessage({ type: 'skipLesson' } as any); set({ activeLesson: null, activeLessonStepIndex: 0 }); },
  dismissHint: (hintId) => { postMessage({ type: 'dismissHint', hintId } as any); set({ activeHint: null }); },
  requestShortcuts: () => { postMessage({ type: 'requestShortcuts' } as any); },
  dismissWhatsNew: () => { postMessage({ type: 'dismissWhatsNew' } as any); set({ showWhatsNew: false }); },
  resetOnboarding: () => { postMessage({ type: 'resetOnboarding' } as any); },

  // Shortcut Manager actions
  setShortcutDefinitions: (defs, profiles, activeProfile, disabled) => set({ shortcutDefinitions: defs, shortcutProfiles: profiles, activeShortcutProfile: activeProfile, shortcutDisabledIds: disabled }),
  setShortcutConflicts: (shortcutConflicts) => set({ shortcutConflicts }),
  setShowShortcutManager: (showShortcutManager) => set({ showShortcutManager }),
  requestShortcutDefinitions: () => { postMessage({ type: 'requestShortcutDefinitions' } as any); },

  // Status actions
  setSystemStatus: (status: SystemStatusView) => set({ systemStatus: status, overallHealth: status.overall }),
  setHealthReport: (healthReport: HealthReportView | null) => set({ healthReport }),
  setShowHealthDashboard: (showHealthDashboard: boolean) => set({ showHealthDashboard }),
  setShowStatusDetail: (showStatusDetail: string | null) => set({ showStatusDetail }),
  requestSystemStatus: () => { postMessage({ type: 'requestSystemStatus' } as any); },
  resetTokenUsage: () => { postMessage({ type: 'resetTokenUsage' } as any); },

  // Privacy actions
  setPrivacyConfig: (config: any) => set({ privacyConfig: config, privacyMode: config?.mode || 'standard', isDataEncrypted: config?.encryption?.encryptAtRest || false }),
  setPrivacyMode: (mode: string) => set({ privacyMode: mode }),
  setDataInventory: (dataInventory: any[]) => set({ dataInventory }),
  setPrivacyAuditLog: (privacyAuditLog: any[]) => set({ privacyAuditLog }),
  setShowPrivacyDashboard: (showPrivacyDashboard: boolean) => set({ showPrivacyDashboard }),
  setShowPrivacyNotice: (showPrivacyNotice: boolean) => set({ showPrivacyNotice }),
  // Access Control (Phase 12.2)
  setApiKeys: (apiKeys) => set({ apiKeys }),
  setCurrentTeam: (currentTeam) => set({ currentTeam }),
  setTeamMembers: (teamMembers) => set({ teamMembers }),
  setAuditLogs: (auditLogs, auditTotal) => set({ auditLogs, auditTotal }),
  appendAuditLogs: (logs) => set((s) => ({ auditLogs: [...s.auditLogs, ...logs] })),
  setPermissions: (permissions) => set({ permissions }),
  setRateLimitStatus: (rateLimitStatus) => set({ rateLimitStatus }),
  setShowAccessPanel: (showAccessPanel) => set({ showAccessPanel }),
  setCurrentRole: (currentRole) => set({ currentRole }),
  // Code Security actions
  setSecurityAlerts: (securityAlerts) => set({ securityAlerts }),
  setCodeSecurityStats: (codeSecurityStats) => set({ codeSecurityStats }),
  setSensitiveFileScanResult: (sensitiveFileScanResult) => set({ sensitiveFileScanResult }),
  setTransmissionReport: (transmissionReport) => set({ transmissionReport }),
  setShowCodeSecurityPanel: (showCodeSecurityPanel) => set({ showCodeSecurityPanel }),
  setPendingSecretWarning: (pendingSecretWarning) => set({ pendingSecretWarning }),
  setPendingCodeWarning: (pendingCodeWarning) => set({ pendingCodeWarning }),

  addMessage: (m) => set((s) => ({ messages: [...s.messages, m], error: null })),
  updateMessage: (id, u) => set((s) => ({ messages: s.messages.map((m) => m.id === id ? { ...m, ...u } : m) })),
  appendToMessage: (id, c) => set((s) => ({
    messages: s.messages.map((m) => m.id === id ? { ...m, content: m.content + c } : m),
    streamingInfo: s.streamingInfo ? { ...s.streamingInfo, tokensReceived: s.streamingInfo.tokensReceived + 1 } : null,
  })),
  setMessages: (messages) => set({ messages, error: null }),
  clearMessages: () => set({ messages: [], currentConversationId: null, error: null }),
  setConversations: (conversations) => set({ conversations }),
  updateConversationInList: (id, updates) => set((s) => ({
    conversations: s.conversations.map((conv) => conv.id === id ? { ...conv, ...updates } : conv),
  })),
  removeConversationFromList: (id) => set((s) => ({
    conversations: s.conversations.filter((conv) => conv.id !== id),
  })),
  loadConversation: (id) => {
    postMessage({ type: 'loadConversation', id });
  },
  startStreaming: (id) => set({ isStreaming: true, streamingInfo: { messageId: id, startTime: Date.now(), tokensReceived: 0 }, error: null, canRetry: false }),
  stopStreaming: () => set({ isStreaming: false, streamingInfo: null }),
  setInputValue: (v) => set({ inputValue: v }),
  setContext: (c) => set({ context: c }),
  setActiveContext: (c) => set({ activeContext: c }),
  setContextEnabled: (enabled) => set({ isContextEnabled: enabled }),
  setMentions: (mentions) => set({ mentions }),
  addMention: (m) => set((s) => {
    const exists = s.mentions.some(x => x.type === m.type && x.value === m.value);
    return exists ? {} : { mentions: [...s.mentions, m] };
  }),
  removeMention: (i) => set((s) => ({ mentions: s.mentions.filter((_, idx) => idx !== i) })),
  setMentionSuggestions: (mentionSuggestions) => set({ mentionSuggestions, isMentionLoading: false }),
  setMentionLoading: (isMentionLoading) => set({ isMentionLoading }),
  setConfig: (c) => set({ config: c }),
  setError: (e, r = false) => set({ error: e, canRetry: r }),

  setAgentMode: (mode) => set({ agentMode: mode, showAgentBanner: mode !== 'chat' }),
  setAgentSession: (session) => set({ agentSession: session }),
  dismissAgentBanner: () => set({ showAgentBanner: false }),
  toggleAgentMode: () => { postMessage({ type: 'toggleAgentMode' }); },
  setAgentPlan: (agentPlan) => set({ agentPlan }),
  updateAgentPlan: (u) => set((s) => ({ agentPlan: s.agentPlan ? { ...s.agentPlan, ...u } : null })),
  updatePlanStep: (stepId, u) => set((s) => ({
    agentPlan: s.agentPlan ? { ...s.agentPlan, steps: s.agentPlan.steps.map((step) => step.id === stepId ? { ...step, ...u } : step) } : null,
  })),
  setExecutionState: (executionState) => set({ executionState }),
  setExecutionProgress: (executionProgress) => set({ executionProgress }),
  updateStepExecution: (e) => set((s) => {
    const idx = s.stepExecutions.findIndex((x) => x.stepId === e.stepId);
    if (idx >= 0) {
      const updated = [...s.stepExecutions];
      updated[idx] = e;
      return { stepExecutions: updated };
    }
    return { stepExecutions: [...s.stepExecutions, e] };
  }),
  setStepExecutions: (stepExecutions) => set({ stepExecutions }),
  pauseExecution: () => { postMessage({ type: 'pauseExecution' }); },
  resumeExecution: () => { postMessage({ type: 'resumeExecution' }); },
  cancelExecution: () => { postMessage({ type: 'cancelExecution' }); },
  skipStep: () => { postMessage({ type: 'skipStep' }); },
  retryStep: (stepId) => { postMessage({ type: 'retryStep', stepId } as any); },
  rollbackAll: () => { postMessage({ type: 'rollbackAll' }); },
  rollbackLast: () => { postMessage({ type: 'rollbackLast' }); },
  showRollbackConfirm: (rollbackType) => set({ showRollbackDialog: true, rollbackType }),
  hideRollbackConfirm: () => set({ showRollbackDialog: false, rollbackType: null }),
  setFileOpBatch: (fileOpBatch) => set({ fileOpBatch }),
  updateFileOpResult: (r) => set((s) => {
    if (!s.fileOpBatch) return {};
    const results = [...s.fileOpBatch.results];
    const idx = results.findIndex(x => x.id === r.id);
    if (idx >= 0) results[idx] = r; else results.push(r);
    return { fileOpBatch: { ...s.fileOpBatch, results } };
  }),
  addFileConflict: (c) => set((s) => ({ fileConflicts: [...s.fileConflicts, c] })),
  setImportUpdates: (importUpdates) => set({ importUpdates }),
  setPostValidation: (postValidation) => set({ postValidation }),
  resolveConflict: (operationId, resolution) => { postMessage({ type: 'resolveConflict', operationId, resolution } as any); },
  revertOperation: (operationId) => { postMessage({ type: 'revertOperation', operationId } as any); },
  revertAllOps: () => { postMessage({ type: 'revertAllOps' } as any); },
  viewFileDiff: (operationId) => { postMessage({ type: 'viewFileDiff', operationId } as any); },
  clearFileOps: () => set({ fileOpBatch: null, fileConflicts: [], importUpdates: [], postValidation: null }),
  addTerminalExecution: (e) => set((s) => ({ terminalExecutions: [...s.terminalExecutions, e] })),
  updateTerminalExecution: (e) => set((s) => ({
    terminalExecutions: s.terminalExecutions.map(t => t.id === e.id ? e : t),
    currentTerminalExecution: s.currentTerminalExecution?.id === e.id ? e : s.currentTerminalExecution,
  })),
  appendTerminalOutput: (line) => set((s) => ({ terminalOutputLines: [...s.terminalOutputLines, line] })),
  clearTerminalOutput: () => set({ terminalOutputLines: [] }),
  setAutoFixStatus: (autoFixStatus) => set({ autoFixStatus, autoFixInProgress: autoFixStatus !== null }),
  setParsedErrors: (parsedErrors) => set({ parsedErrors }),
  setReviewSession: (reviewSession) => set({ reviewSession, reviewChanges: reviewSession?.changes || [], isReviewSummaryLoading: reviewSession !== null && !reviewSession.summary }),
  setReviewChanges: (reviewChanges) => set({ reviewChanges }),
  updateChangeStatus: (changeId, status) => set((s) => ({ reviewChanges: s.reviewChanges.map(c => c.id === changeId ? { ...c, status } : c) })),
  setReviewSummary: (reviewSummary) => set({ reviewSummary, isReviewSummaryLoading: false }),
  setReviewSummaryLoading: (isReviewSummaryLoading) => set({ isReviewSummaryLoading }),
  setReviewProgress: (reviewProgress) => set({ reviewProgress }),
  acceptAllChanges: () => { postMessage({ type: 'acceptAllChanges' } as any); },
  rejectAllChanges: () => { postMessage({ type: 'rejectAllChanges' } as any); },
  acceptChange: (changeId) => { postMessage({ type: 'acceptChange', changeId } as any); },
  rejectChange: (changeId) => { postMessage({ type: 'rejectChange', changeId } as any); },
  acceptHunk: (hunkId) => { postMessage({ type: 'acceptHunk', hunkId } as any); },
  rejectHunk: (hunkId) => { postMessage({ type: 'rejectHunk', hunkId } as any); },
  toggleChange: (changeId) => { postMessage({ type: 'toggleChange', changeId } as any); },
  toggleHunk: (hunkId) => { postMessage({ type: 'toggleHunk', hunkId } as any); },
  finalizeReview: (notes) => { postMessage({ type: 'finalizeReview', notes: notes || null } as any); },
  showFileDiff: (changeId) => { postMessage({ type: 'showFileDiff', changeId } as any); },
  showHunkDiff: (changeId, hunkId) => { postMessage({ type: 'showHunkDiff', changeId, hunkId } as any); },
  undoAllChanges: () => { postMessage({ type: 'undoAllChanges' } as any); },
  undoFileChange: (changeId) => { postMessage({ type: 'undoFileChange', changeId } as any); },
  undoHunkChange: (hunkId, changeId) => { postMessage({ type: 'undoHunkChange', hunkId, changeId } as any); },
  addReviewNote: (note) => { postMessage({ type: 'addReviewNote', note } as any); },
  showUndoConfirm: (undoScope, undoFilesAffected) => set({ showUndoDialog: true, undoScope, undoFilesAffected }),
  hideUndoConfirm: () => set({ showUndoDialog: false, undoScope: null, undoFilesAffected: [] }),

  sendMessage: (content) => {
    const { context, mentions, isStreaming, pendingImages } = get();
    if (isStreaming || !content.trim()) { return; }

    const msgContext: MessageContext | undefined = context || mentions.length > 0
      ? {
          ...context,
          mentions: mentions.length > 0 ? mentions.map(m => ({ type: m.type, value: m.value, displayName: m.displayName })) : undefined,
        }
      : undefined;

    const images = pendingImages.length > 0 ? pendingImages : undefined;
    const user: ChatMessage = { id: genId(), role: 'user', content: content.trim(), timestamp: Date.now(), status: 'complete', context: msgContext, images: images || null };
    const assistant: ChatMessage = { id: genId(), role: 'assistant', content: '', timestamp: Date.now(), status: 'streaming' };

    set((s) => ({
      messages: [...s.messages, user, assistant], inputValue: '', context: null, mentions: [], pendingImages: [],
      isStreaming: true, streamingInfo: { messageId: assistant.id, startTime: Date.now(), tokensReceived: 0 },
      error: null, canRetry: false,
    }));

    postMessage({ type: 'sendMessage', content: content.trim(), context: msgContext, images } as any);
  },

  stopGeneration: () => {
    const { streamingInfo } = get();
    if (streamingInfo) {
      set((s) => ({
        messages: s.messages.map((m) => m.id === streamingInfo.messageId ? { ...m, status: 'complete' as const, content: m.content + '\n\n*[Stopped]*' } : m),
        isStreaming: false, streamingInfo: null,
      }));
    }
    postMessage({ type: 'stopGeneration' });
  },

  retryLastMessage: () => {
    const { messages, isStreaming, canRetry } = get();
    if (isStreaming || !canRetry) { return; }
    set({ error: null, canRetry: false });
    postMessage({ type: 'retry' });
  },

  newChat: () => {
    set({ messages: [], currentConversationId: null, context: null, error: null, canRetry: false });
    postMessage({ type: 'newChat' });
  },
}));

export function handleExtensionMessage(msg: { type: string; [k: string]: unknown }): void {
  const s = useChatStore.getState();
  switch (msg.type) {
    case 'streamStart': {
      // Use extension's messageId — update the pre-created assistant message
      const extMsgId = msg.messageId as string;
      const info = s.streamingInfo;
      if (info && info.messageId !== extMsgId) {
        // Reassign the pre-created assistant message to match extension's ID
        s.updateMessage(info.messageId, { id: extMsgId } as any);
        s.startStreaming(extMsgId);
      }
      break;
    }
    case 'streamChunk': if (msg.messageId && msg.content) { s.appendToMessage(msg.messageId as string, msg.content as string); } break;
    case 'streamEnd': if (msg.messageId) { s.updateMessage(msg.messageId as string, { status: 'complete' }); } s.stopStreaming(); break;
    case 'streamError': if (msg.messageId) { s.updateMessage(msg.messageId as string, { status: 'error', error: msg.error as string }); } s.stopStreaming(); s.setError(msg.error as string, msg.retryable as boolean); break;
    case 'loadHistory': s.setConversations(msg.conversations as Conversation[]); break;
    case 'loadConversation': if (msg.conversation) { const c = msg.conversation as Conversation; s.setMessages(c.messages); } break;
    case 'config': s.setConfig(msg.config); break;
    case 'context': s.setContext(msg.context as MessageContext); break;
    case 'activeContext': s.setActiveContext(msg.context as ActiveContext); break;
    case 'mentionSuggestions': s.setMentionSuggestions((msg.suggestions as MentionSuggestion[]) || []); break;
    case 'contextUpdate': if (msg.updateType === 'full' || msg.updateType === 'selection') { s.setActiveContext(msg.context as ActiveContext); } break;
    case 'clearChat': s.clearMessages(); break;
    case 'conversationUpdated': s.updateConversationInList(msg.id as string, msg.updates as Partial<Conversation>); break;
    case 'conversationDeleted': s.removeConversationFromList(msg.id as string); break;
    case 'agentModeChanged': s.setAgentMode(msg.mode as AgentMode); break;
    case 'agentSessionUpdate': s.setAgentSession(msg.session as AgentSession | null); break;
    case 'agentPlanReady': s.setAgentPlan(msg.plan as AgentPlanView); break;
    case 'agentPlanUpdate': s.updateAgentPlan(msg.updates as Partial<AgentPlanView>); break;
    case 'agentPlanStepUpdate': s.updatePlanStep(msg.stepId as string, msg.updates as Partial<PlanStepView>); break;
    case 'executionStart': s.setExecutionState('executing'); s.setStepExecutions([]); break;
    case 'executionProgress': s.setExecutionProgress(msg.progress as ExecutionProgressView); s.setExecutionState(msg.state as ExecutionStateView); break;
    case 'stepStart': s.updateStepExecution({ stepId: msg.stepId as string, status: 'executing', startTime: Date.now(), endTime: null, duration: null, retryCount: 0, output: [], error: null, result: null }); break;
    case 'stepComplete': s.updateStepExecution(msg.result as StepExecutionView); break;
    case 'stepFailed': s.updateStepExecution(msg.error as StepExecutionView); break;
    case 'stepSkipped': s.updateStepExecution({ stepId: msg.stepId as string, status: 'skipped', startTime: 0, endTime: null, duration: null, retryCount: 0, output: [], error: null, result: null }); break;
    case 'executionComplete': s.setExecutionState('completed'); break;
    case 'executionFailed': s.setExecutionState('failed'); break;
    case 'executionCancelled': s.setExecutionState('cancelled'); break;
    case 'rollbackStart': s.setExecutionState('rolling_back'); break;
    case 'rollbackComplete': s.setExecutionState('failed'); break;
    case 'fileOpsStarted': s.setFileOpBatch(msg.batch as FileOpBatchView); break;
    case 'fileOpComplete': s.updateFileOpResult(msg.result as FileOpResultView); break;
    case 'fileOpFailed': s.updateFileOpResult(msg.result as FileOpResultView); break;
    case 'fileOpConflict': s.addFileConflict(msg.conflict as FileConflictView); break;
    case 'importUpdates': s.setImportUpdates(msg.updates as ImportUpdateView[]); break;
    case 'postExecutionValidation': s.setPostValidation(msg.validation as PostExecutionValidationView); break;
    case 'terminalCommandStart': { const exec = msg.execution as TerminalExecutionView; s.addTerminalExecution(exec); useChatStore.setState({ currentTerminalExecution: exec }); s.clearTerminalOutput(); break; }
    case 'terminalCommandOutput': s.appendTerminalOutput(msg.line as string); break;
    case 'terminalCommandComplete': { const exec2 = msg.execution as TerminalExecutionView; s.updateTerminalExecution(exec2); useChatStore.setState({ currentTerminalExecution: null }); if (exec2.parsedResult) { s.setParsedErrors(exec2.parsedResult.errors as ParsedErrorView[]); } break; }
    case 'terminalAutoFixStart': s.setAutoFixStatus({ status: 'fixing', totalCount: msg.errorCount as number, fixedCount: 0, attempt: 1, maxAttempts: 3, currentFile: null, modifiedFiles: [] }); break;
    case 'terminalAutoFixProgress': s.setAutoFixStatus(msg.status); break;
    case 'terminalAutoFixComplete': s.setAutoFixStatus(null); break;
    case 'reviewStarted': s.setReviewSession(msg.session as ReviewSessionView); break;
    case 'reviewUpdated': s.setReviewChanges(msg.changes as ReviewableChangeView[]); s.setReviewProgress(msg.progress as ReviewProgressView); break;
    case 'reviewSummaryReady': s.setReviewSummary(msg.summary as ReviewSummaryView); break;
    case 'reviewCompleted': s.setReviewSession(null); break;
    case 'changeDecided': s.updateChangeStatus(msg.changeId as string, msg.status as ChangeStatusView); break;
    case 'undoPerformed': s.setReviewSession(null); break;
    case 'docsSourcesUpdated': s.setDocSources(msg.sources as DocSourceView[]); break;
    case 'docsCrawlProgress': s.setDocCrawlProgress(msg.progress as DocCrawlProgressView); break;
    case 'docsCrawlComplete': s.setDocCrawlProgress(null); break;
    case 'docsSuggestionsReady': s.setDocSuggestions(msg.suggestions as DocSuggestionView[]); break;
    case 'docsSearchResults': s.setDocSearchResults(msg.results as DocSearchResultView[]); break;
    case 'gitStatusUpdated': s.setGitStatus(msg.status as GitStatusView); break;
    case 'gitBranchChanged': useChatStore.setState({ gitBranchName: msg.branch as string }); break;
    case 'gitCommitLog': if (msg.append) { s.appendGitCommits(msg.commits as GitCommitView[]); } else { s.setGitCommitLog(msg.commits as GitCommitView[]); } break;
    case 'gitBlameResult': s.setGitBlame(msg.blame as GitBlameLineView[]); break;
    case 'gitPRContext': s.setGitPR(msg.pr as GitPRContextView); break;
    case 'lspContextUpdated': useChatStore.setState({ lspContext: msg.context as LSPContextView, fileSymbols: (msg.context as any)?.fileSymbols || [], fileDiagnostics: (msg.context as any)?.diagnostics || [], currentTypeInfo: (msg.context as any)?.currentType || null, callHierarchy: (msg.context as any)?.callHierarchy || null }); break;
    case 'lspSymbolsUpdated': useChatStore.setState({ fileSymbols: msg.symbols as SymbolInfoView[] }); break;
    case 'lspDiagnosticsChanged': useChatStore.setState({ fileDiagnostics: msg.diagnostics as DiagnosticInfoView[] }); break;
    case 'lspDefinitionResult': break;
    case 'lspReferencesResult': useChatStore.setState({ currentReferences: msg.references as ReferenceGroupView[] }); break;
    case 'lspTypeResult': useChatStore.setState({ currentTypeInfo: (msg.typeInfo || msg.type) as unknown as TypeInfoView }); break;
    case 'visionAnalysisResult': useChatStore.setState({ visionAnalysis: msg.analysis as VisionAnalysisView, isAnalyzingImage: false }); break;
    case 'designToCodeProgress': useChatStore.setState({ isDesignToCode: true }); break;
    case 'designToCodeComplete': useChatStore.setState({ designToCodeResult: msg.result as DesignToCodeResponseView, isDesignToCode: false }); break;
    case 'imageProcessed': {
      const processed = msg.image as ImageAttachmentView;
      useChatStore.setState(state => ({ pendingImages: state.pendingImages.map(i => i.id === processed.id ? processed : i) }));
      break;
    }
    case 'rulesStatus': s.setRulesStatus(msg.status as RulesStatusView); break;
    case 'rulesPreviewText': s.setRulesPreviewText(msg.text as string); break;
    case 'rulesChanged': s.setRulesStatus(msg.status as RulesStatusView); break;
    case 'globalRulesStatus': s.setGlobalRulesStatus(msg.status as GlobalRulesStatusView); break;
    case 'globalRulesChanged': s.setGlobalRulesStatus(msg.status as GlobalRulesStatusView); break;
    // Memory
    case 'memoriesList': s.setMemories(msg.memories as MemoryView[]); break;
    case 'memoriesRecalled': s.setRecalledMemories(msg.memories as MemorySearchResultView[]); break;
    case 'memoryCreated': s.setMemories([msg.memory as MemoryView, ...s.memories]); break;
    case 'memoryUpdated': s.setMemories(s.memories.map(m => m.id === (msg.memory as MemoryView).id ? msg.memory as MemoryView : m)); break;
    case 'memoryDeleted': s.setMemories(s.memories.filter(m => m.id !== msg.memoryId)); break;
    case 'memoryExtractionComplete': s.addRecentExtraction(msg.extractions as ExtractedMemoryView[]); break;
    case 'memoryStats': s.setMemoryStats(msg.stats as MemoryStatsView); break;
    case 'memorySearchResults': s.setMemories(msg.memories as MemoryView[]); break;
    case 'autoExtractChanged': s.setAutoExtractEnabled(msg.enabled as boolean); break;
    case 'cacheStatsUpdated': s.setCacheStats(msg.stats as CacheStatsData); break;
    case 'requestMetricsUpdated': s.setRequestMetrics(msg.metrics as RequestMetricsView); break;
    // Offline
    case 'connectivityChanged': s.setConnectionState(msg.state as string, msg.health); break;
    case 'offlineQueueUpdated': s.setOfflineQueue(msg.queue as any[]); break;
    case 'syncProgress': s.setSyncProgress(msg.progress); break;
    case 'syncComplete': s.setSyncProgress(msg.progress); break;
    case 'localModelStatus': s.setLocalModelAvailable(msg.available as boolean); break;
    case 'offlineCapabilities': useChatStore.setState({ offlineCapabilities: (msg.capabilities as any[]) || [] }); break;
    // Error Recovery
    case 'errorAnalyticsUpdated': s.setErrorAnalytics(msg.analytics); break;
    case 'circuitBreakerUpdate': s.setCircuitBreakers(msg.breakers as any[]); break;
    case 'errorRecovered': break; // handled inline in messages
    case 'errorFatal': break; // handled inline in messages
    case 'selfHealExecuted': break; // notification shown by extension
    case 'bugReportGenerated': break; // handled by extension (opens document)
    // Theme
    case 'themeUpdated': {
      s.setActiveTheme(msg.themeId as string, msg.mode as string);
      s.setThemeConfig(msg.config as ThemeConfigView);
      // Inject CSS into DOM
      const css = (msg.css as string || '') + '\n' + (msg.vscodeSyncCSS as string || '');
      let el = document.getElementById('ina-theme-vars');
      if (!el) { el = document.createElement('style'); el.id = 'ina-theme-vars'; document.head.appendChild(el); }
      el.textContent = css;
      break;
    }
    case 'availableThemes': s.setAvailableThemes(msg.themes as ThemeInfoView[]); break;
    case 'openThemeSettings': s.setShowThemeSettings(true); break;
    // Onboarding
    case 'showWelcome': s.setShowWelcome(true); break;
    case 'onboardingStateUpdated': s.setOnboardingState(msg.state as OnboardingStateView); s.setOnboardingProgress(msg.progress as any); break;
    case 'tourStepChanged': s.setActiveTourStep(msg.step as TourStepView, msg.progress as any); break;
    case 'tourCompleted': s.setActiveTourStep(null); break;
    case 'tourSkipped': s.setActiveTourStep(null); break;
    case 'tutorialStarted': s.setTutorialProgress(msg.progress as TutorialProgressView); s.setTutorialLessons(msg.lessons as TutorialLessonView[]); s.setShowTutorial(true); break;
    case 'lessonStarted': s.setActiveLesson(msg.lesson as TutorialLessonView, 0); break;
    case 'lessonStepAdvanced': s.setActiveLesson(msg.lesson as TutorialLessonView, msg.stepIndex as number); break;
    case 'lessonCompleted': s.setActiveLesson(null); s.setTutorialProgress(msg.progress as TutorialProgressView); break;
    case 'tutorialCompleted': s.setTutorialProgress(msg.progress as TutorialProgressView); s.setActiveLesson(null); break;
    case 'hintAvailable': s.setActiveHint(msg.hint as ProgressiveHintView); break;
    case 'shortcutsData': s.setShortcuts(msg.shortcuts as ShortcutCategoryView[], msg.platform as string); s.setShowShortcuts(true); break;
    case 'whatsNewData': s.setShowWhatsNew(true, msg.changelog as ChangelogEntryView[], msg.version as string); break;
    // Shortcuts
    case 'shortcutsUpdated': s.setShortcutDefinitions(msg.shortcuts as ShortcutDefinitionView[], msg.profiles as ShortcutProfileView[], msg.activeProfileId as string, msg.disabledIds as string[]); break;
    case 'shortcutConflicts': s.setShortcutConflicts(msg.conflicts as ShortcutConflictView[]); break;
    case 'shortcutProfileChanged': s.setShortcutDefinitions(msg.shortcuts as ShortcutDefinitionView[], msg.profiles as ShortcutProfileView[], msg.activeProfileId as string, msg.disabledIds as string[]); break;
    case 'openShortcutManager': s.setShowShortcutManager(true); break;
    // Status
    case 'systemStatusUpdated': s.setSystemStatus(msg.status as SystemStatusView); break;
    case 'healthChanged': useChatStore.setState({ overallHealth: msg.health as string }); break;
    case 'healthReportReady': s.setHealthReport(msg.report as HealthReportView); s.setShowHealthDashboard(true); break;
    case 'tokenUsageUpdated': {
      const cur = s.systemStatus;
      if (cur) s.setSystemStatus({ ...cur, tokens: { ...cur.tokens, ...(msg.tokens as any) } });
      break;
    }
    // Privacy
    case 'privacyConfigUpdated': s.setPrivacyConfig(msg.config); if (msg.inventory) s.setDataInventory(msg.inventory as any[]); if (msg.auditLog) s.setPrivacyAuditLog(msg.auditLog as any[]); if (msg.keyFingerprint) useChatStore.setState({ keyFingerprint: msg.keyFingerprint as string }); break;
    case 'privacyModeChanged': s.setPrivacyMode(msg.mode as string); break;
    case 'showPrivacyNotice': s.setShowPrivacyNotice(true); break;
    case 'showPrivacyDashboard': s.setShowPrivacyDashboard(true); break;
    case 'dataDeleted': break; // handled via notification
    case 'cleanupResult': break; // handled via notification
    case 'secretDetected': break; // handled via notification in messages
    // Access Control (Phase 12.2)
    case 'apiKeysLoaded': s.setApiKeys((msg as any).keys || []); break;
    case 'teamLoaded': s.setCurrentTeam((msg as any).team || null); s.setTeamMembers((msg as any).members || []); break;
    case 'auditLogsLoaded': s.setAuditLogs((msg as any).entries || [], (msg as any).total || 0); break;
    case 'rateLimitUpdated': s.setRateLimitStatus((msg as any).status || null); break;
    case 'permissionsLoaded': s.setPermissions((msg as any).permissions || []); break;
    case 'accessConfigUpdated': s.setCurrentRole((msg as any).config?.role || null); break;
    case 'apiKeyCreated': break; // handled via apiKeysLoaded refresh
    case 'auditIntegrityResult': break; // handled in AccessControlPanel state
    case 'showAccessPanel': s.setShowAccessPanel(true); break;
    // Code Security (Phase 12.3)
    case 'securityAlert': { const alerts = [...useChatStore.getState().securityAlerts, msg.alert]; s.setSecurityAlerts(alerts as any[]); break; }
    case 'secretDetectedInCode': { const alerts2 = [...useChatStore.getState().securityAlerts, msg.alert]; s.setSecurityAlerts(alerts2 as any[]); break; }
    case 'codeSecurityStatsUpdated': s.setSecurityAlerts((msg as any).alerts || []); s.setCodeSecurityStats((msg as any).stats || null); break;
    case 'sensitiveFileScanResult': s.setSensitiveFileScanResult((msg as any).result || null); s.setShowCodeSecurityPanel(true); break;
    case 'transmissionReport': s.setTransmissionReport((msg as any).report || null); s.setShowCodeSecurityPanel(true); break;
    case 'serverPurgeResult': break; // handled via notification
    case 'showCodeSecurityPanel': s.setShowCodeSecurityPanel(true); break;
    case 'generatedCodeWarning': s.setPendingCodeWarning({ warnings: (msg as any).warnings, codeId: (msg as any).codeId, autoFix: (msg as any).autoFix }); break;
    // Enterprise (Phase 13.4)
    case 'adminDashboardData': s.setAdminDashboard((msg as any).dashboard); break;
    case 'usageDashboardData': s.setUsageDashboard((msg as any).dashboard); break;
    case 'ssoProvidersLoaded': s.setSSOProviders((msg as any).providers || []); break;
    case 'modelsLoaded': s.setRegisteredModels((msg as any).models || []); break;
    case 'licenseStatus': s.setLicense((msg as any).license); break;
    case 'adminSettingsLoaded': s.setAdminSettings((msg as any).settings || []); break;
    case 'usersLoaded': s.setAdminUsers((msg as any).data || null); break;
    case 'showAdminPanel': s.setShowAdminPanel(true); break;
    // Apply (Phase 15.2)
    case 'applyResult': { const m = msg as any; if (m.codeBlockId) s.setApplyResult(m.codeBlockId, m.result); break; }
    case 'applyPreviewResult': break; // handled by component state
    case 'fileDetectionResult': break; // handled by component state
    // Predict (Phase 15.3)
    case 'predictionChainStarted': s.setPredictionChain((msg as any).chain); break;
    case 'predictionChainUpdated': s.setPredictionChain((msg as any).chain); break;
    case 'predictionChainCompleted': s.setPredictionChain(null); break;
    case 'predictionChainCancelled': s.setPredictionChain(null); break;
    // Bug Finder (Phase 15.5)
    case 'bugScanStarted': s.setBugScanProgress({ phase: 'collecting', current: 0, total: 0, currentFile: null }); break;
    case 'bugScanProgress': s.setBugScanProgress(msg.progress); break;
    case 'bugScanComplete': s.setBugScanResult(msg.result); s.setBugScanProgress(null); break;
    case 'bugFixResult': { const sr = s.bugScanResult as any; if (sr) { s.setBugScanResult({ ...sr, bugs: sr.bugs.map((b: any) => b.id === msg.bugId ? { ...b, status: (msg as any).fixed ? 'fixed' : 'open' } : b) }); } break; }
    case 'showBugFinderPanel': s.setShowBugFinderPanel(true); break;
    // AI Commit Message (Phase 15.6)
    case 'commitMessageGenerating': s.setIsGeneratingCommit(true); break;
    case 'commitMessageResult': s.setCommitMessage((msg as any).result); s.setIsGeneratingCommit(false); break;
    // Shadow Workspace (Phase 17.1)
    case 'shadowSessionCreated': s.setShadowSession((msg as any).session); s.setShowShadowPanel(true); break;
    case 'shadowSessionUpdated': s.setShadowSession((msg as any).session); s.setShadowDiffs((msg as any).diffs || []); s.setShadowStats((msg as any).stats || null); break;
    case 'shadowFileChanged': { const ss = s.shadowSession as any; if (ss && ss.id === (msg as any).sessionId) { const files = [...(ss.files || [])]; const idx = files.findIndex((f: any) => f.filePath === (msg as any).file.filePath); if (idx >= 0) files[idx] = (msg as any).file; else files.push((msg as any).file); s.setShadowSession({ ...ss, files }); } break; }
    case 'shadowSessionCommitted': s.setShadowSession(null); s.setShadowDiffs([]); s.setShadowStats(null); break;
    case 'shadowSessionDiscarded': s.setShadowSession(null); s.setShadowDiffs([]); s.setShadowStats(null); break;
    case 'showShadowPanel': s.setShowShadowPanel(true); break;
    // Deep Context (Phase 17.2)
    case 'deepContextResult': break; // handled inline in chat context
    // Link Fetch (Phase 17.3)
    case 'linkFetched': { const links = [...useChatStore.getState().fetchedLinks]; if ((msg as any).page) links.push((msg as any).page); s.setFetchedLinks(links); break; }
    // Context Visualization (Phase 17.5)
    case 'contextVisualization': s.setContextVisualization((msg as any).data); break;
    // Performance Benchmarking (Phase 17.6)
    case 'benchmarkResult': s.setBenchmarkSuite((msg as any).suite); s.setIsBenchmarkRunning(false); break;
    case 'benchmarkRunning': s.setIsBenchmarkRunning(true); break;
    // UX (Phase 17.7)
    case 'aiTypingStarted': s.setIsAITyping(true); break;
    case 'aiTypingStopped': s.setIsAITyping(false); break;
    // MCP (Phase 16.2)
    case 'mcpServersChanged': s.setMCPServers((msg as any).servers || []); break;
    case 'mcpToolsChanged': s.setMCPTools((msg as any).tools || []); break;
    case 'mcpToolCallResult': /* handled inline by component */ break;
    // Web Search (Phase 16.3)
    case 'webSearchResults': s.setWebSearchResults((msg as any).response); break;
    // Notepads (Phase 16.4)
    case 'notepadsChanged': s.setNotepads((msg as any).notepads || []); break;
    // History Search (Phase 16.5)
    case 'historySearchResults': s.setHistoryResults((msg as any).results || []); break;
    case 'historyConversationsList': s.setHistoryConversations((msg as any).conversations || []); break;
    case 'historyStats': s.setHistoryStats((msg as any).stats || null); break;
    case 'historyConversationExported': /* handled by component (saved to file by extension) */ break;
    // AutoFormat (Phase 16.6) — handled inline (notification only)
    case 'autoFormatResult': break;
    // AI Rename (Phase 16.7) — handled inline by editor command
    case 'renameSuggestions': break;
    // Composer (Phase 16.1)
    case 'composerSessionCreated':
    case 'composerSessionUpdated':
      s.setComposerSession((msg as any).session);
      s.setShowComposer(true);
      break;
    case 'composerStatusChanged': {
      const cs = s.composerSession;
      if (cs && cs.id === (msg as any).sessionId) {
        s.setComposerSession({ ...cs, status: (msg as any).status });
      }
      break;
    }
    case 'composerFileChanged': {
      const cs = s.composerSession;
      if (cs && cs.id === (msg as any).sessionId) {
        const fc = (msg as any).fileChange;
        const changeType = (msg as any).changeType;
        const fileChanges = [...(cs.fileChanges || [])];
        const idx = fileChanges.findIndex((f: any) => f.filePath === fc.filePath);
        if (changeType === 'removed' && idx >= 0) {
          fileChanges.splice(idx, 1);
        } else if (idx >= 0) {
          fileChanges[idx] = fc;
        } else {
          fileChanges.push(fc);
        }
        s.setComposerSession({ ...cs, fileChanges });
      }
      break;
    }
    case 'composerProgressUpdate': {
      const cs = s.composerSession;
      if (cs && cs.id === (msg as any).sessionId) {
        s.setComposerSession({
          ...cs,
          status: (msg as any).status,
          stats: { ...cs.stats, stepsCompleted: (msg as any).stepIndex + 1 },
        });
      }
      break;
    }
    case 'composerCheckpointCreated': {
      const cs = s.composerSession;
      if (cs && cs.id === (msg as any).sessionId) {
        const checkpoints = [...(cs.checkpoints || []), (msg as any).checkpoint];
        s.setComposerSession({
          ...cs,
          checkpoints,
          currentCheckpointIndex: checkpoints.length - 1,
        });
      }
      break;
    }
  }
}
