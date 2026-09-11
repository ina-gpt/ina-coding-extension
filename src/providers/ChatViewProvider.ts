import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { HistoryManager, MessageContext, HistoryEvent } from '../services/HistoryManager';
import { ApiService, ChatContext, StreamMetadata } from '../services/ApiService';
import { ContextProvider, ChatContext as ActiveChatContext } from '../services/ContextProvider';
import { mentionParser, MentionContext } from '../services/MentionParser';
import { mentionProvider } from '../services/MentionProvider';
import { AgentModeManager } from '../services/agent/AgentModeManager';
import { AgentSessionManager } from '../services/agent/AgentSessionManager';
import { AgentDetector } from '../services/agent/AgentDetector';
import { AgentMode } from '../services/agent/AgentTypes';
import { PlanningService } from '../services/agent/planning/PlanningService';
import { ExecutionEngine } from '../services/agent/execution/ExecutionEngine';
import { DEFAULT_EXECUTION_CONFIG } from '../services/agent/execution/ExecutionTypes';
import { MultiFileEditOrchestrator } from '../services/agent/fileops/MultiFileEditOrchestrator';
import { TerminalIntegrationService } from '../services/agent/terminal/TerminalIntegrationService';
import { ReviewService } from '../services/agent/review/ReviewService';
import { DocsClient } from '../services/docs/DocsClient';
import { DocsAutoSuggestService } from '../services/docs/DocsAutoSuggestService';
import { DocsMentionHandler } from '../services/docs/DocsMentionHandler';
import { GitContextBuilder } from '../services/git/GitContextBuilder';
import { GitStatusService } from '../services/git/GitStatusService';
import { GitLogService } from '../services/git/GitLogService';
import { GitBlameService } from '../services/git/GitBlameService';
import { GitDiffService } from '../services/git/GitDiffService';
import { GitPRService } from '../services/git/GitPRService';
import { GitBranchService } from '../services/git/GitBranchService';
import { GitWatcher } from '../services/git/GitWatcher';
import { GitMentionHandler } from '../services/git/GitMentionHandler';
import { LSPContextBuilder } from '../services/lsp/LSPContextBuilder';
import { DiagnosticService } from '../services/lsp/DiagnosticService';
import { SymbolService } from '../services/lsp/SymbolService';
import { DefinitionService } from '../services/lsp/DefinitionService';
import { ReferenceService } from '../services/lsp/ReferenceService';
import { TypeInfoService } from '../services/lsp/TypeInfoService';
import { LSPWatcher } from '../services/lsp/LSPWatcher';
import { RulesInjector } from '../services/rules/RulesInjector';
import { RulesFileManager } from '../services/rules/RulesFileManager';
import { RulesTemplateService } from '../services/rules/RulesTemplateService';
import { RULES_CONSTANTS } from '../services/rules/RulesTypes';
import { GlobalRulesFileManager } from '../services/rules/GlobalRulesFileManager';
import { GlobalRulesSetupWizard } from '../services/rules/GlobalRulesSetupWizard';
import { RulesMerger } from '../services/rules/RulesMerger';
import { MemoryClient } from '../services/memory/MemoryClient';
import { MemoryAutoExtractor } from '../services/memory/MemoryAutoExtractor';
import { MemoryContextInjector } from '../services/memory/MemoryContextInjector';
import { CacheManager } from '../services/cache/CacheManager';
import { CacheMetrics } from '../services/cache/CacheMetrics';
import { RequestScheduler } from '../services/requestopt/RequestScheduler';
import { ParallelExecutor } from '../services/requestopt/ParallelExecutor';
import { ConnectivityMonitor } from '../services/offline/ConnectivityMonitor';
import { GracefulDegradation } from '../services/offline/GracefulDegradation';
import { OfflineQueue } from '../services/offline/OfflineQueue';
import { SyncManager } from '../services/offline/SyncManager';
import { LocalModelManager } from '../services/offline/LocalModelManager';
import { ErrorRecoveryService } from '../services/errors/ErrorRecoveryService';
import { ErrorAnalyticsEngine } from '../services/errors/ErrorAnalyticsEngine';
import { UserFeedbackCollector } from '../services/errors/UserFeedbackCollector';
import { SelfHealingEngine } from '../services/errors/SelfHealingEngine';
import { CircuitBreakerRegistry } from '../services/errors/CircuitBreakerRegistry';
import { ThemeEngine } from '../services/theme/ThemeEngine';
import { StatusAggregator } from '../services/status/StatusAggregator';
import { TokenTracker } from '../services/status/TokenTracker';
import { HealthDashboardService } from '../services/status/HealthDashboardService';
import { ShortcutManager } from '../services/shortcuts/ShortcutManager';
import { QuickActionService } from '../services/shortcuts/QuickActionService';
import { ShortcutConflictResolver } from '../services/shortcuts/ShortcutConflictResolver';
import { OnboardingManager } from '../services/onboarding/OnboardingManager';
import { FeatureTourService } from '../services/onboarding/FeatureTourService';
import { ShortcutCheatsheet } from '../services/onboarding/ShortcutCheatsheet';
import { InteractiveTutorial } from '../services/onboarding/InteractiveTutorial';
import { ProgressiveHintService } from '../services/onboarding/ProgressiveHintService';
import { WhatsNewService } from '../services/onboarding/WhatsNewService';
import { ImageCaptureService } from '../services/vision/ImageCaptureService';
import { VisionClient } from '../services/vision/VisionClient';
import { DesignToCodeService } from '../services/vision/DesignToCodeService';
import { ImageAnnotationService } from '../services/vision/ImageAnnotationService';
import { SecretDetector } from '../services/privacy/SecretDetector';
import { DataEncryptionService } from '../services/privacy/DataEncryptionService';
import { AccessClient as AccessClientImport } from '../services/access/AccessClient';
import { ApiKeyStore as ApiKeyStoreImport } from '../services/access/ApiKeyStore';
import { EnterpriseClient } from '../services/enterprise/EnterpriseClient';
import { ApplyService } from '../services/apply/ApplyService';
import { FileDetector } from '../services/apply/FileDetector';
import { DiffApplicator } from '../services/apply/DiffApplicator';
import { LinkFetchService } from '../services/linkfetch/LinkFetchService';
import { ContextWindowManager } from '../services/context/ContextWindowManager';
import { DataSanitizer } from '../services/privacy/DataSanitizer';
import { PrivacyModeManager } from '../services/privacy/PrivacyModeManager';
import { DataRetentionManager } from '../services/privacy/DataRetentionManager';
import { PrivacyAuditService } from '../services/privacy/PrivacyAuditService';
import { CodeSecurityGate } from '../services/codesec/CodeSecurityGate';
import { SensitiveFileDetector } from '../services/codesec/SensitiveFileDetector';
import { EphemeralPolicyEnforcer } from '../services/codesec/EphemeralPolicyEnforcer';
import { CodeTransmissionMonitor } from '../services/codesec/CodeTransmissionMonitor';
import { GeneratedCodeScanner } from '../services/codesec/GeneratedCodeScanner';
import { CodebaseSearchClient } from '../services/codebase/CodebaseSearchClient';
import { CodebaseMentionHandler } from '../services/codebase/CodebaseMentionHandler';
import { BugFinderService } from '../services/bugfinder/BugFinderService';
import { CommitMessageGenerator } from '../services/gitai/CommitMessageGenerator';
import { ShadowWorkspaceManager } from '../services/shadow/ShadowWorkspaceManager';
import { DeepMentionHandler } from '../services/deepcontext/DeepMentionHandler';
import { BenchmarkRunner } from '../services/benchmark/BenchmarkRunner';
import { PerformanceMonitor } from '../services/benchmark/PerformanceMonitor';
import { ComposerSessionManager } from '../services/composer/ComposerSessionManager';
import { ComposerDiffEngine } from '../services/composer/ComposerDiffEngine';
import { ComposerLayout, toSessionView } from '../services/composer/ComposerTypes';
import { MCPClient } from '../services/mcp/MCPClient';
import { MCPDiscovery } from '../services/mcp/MCPDiscovery';
import { MCPToolExecutor } from '../services/mcp/MCPToolExecutor';
import { AsyncSessionClient } from '../services/agent/async/AsyncSessionClient';
import { WebSearchService } from '../services/websearch/WebSearchService';
import { WebMentionHandler } from '../services/websearch/WebMentionHandler';
import { NotepadManager } from '../services/notepads/NotepadManager';
import { NotepadType } from '../services/notepads/NotepadTypes';
import { HistorySearchService } from '../services/history/HistorySearchService';
import { AutoFormatService } from '../services/autoformat/AutoFormatService';
import { AIRenameProvider } from '../services/rename/AIRenameProvider';
import { SuggestedFilesProvider } from '../services/context/SuggestedFilesProvider';
import { Logger } from '../utils/Logger';
import { ConfigManager } from '../utils/ConfigManager';

interface StreamingState {
  messageId: string;
  content: string;
  abortController: AbortController;
  startTime: number;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'inaCoding.chatView';
  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _streaming: StreamingState | null = null;
  private _retryCount = 0;
  /** Feature 5 — when set, the next _send call uses this model instead of the configured default */
  private _overrideModel: string | undefined;
  private _contextProvider: ContextProvider;
  private _suggestedFilesProvider = new SuggestedFilesProvider();
  private _suggestDebounce: ReturnType<typeof setTimeout> | undefined;
  private _agentModeManager: AgentModeManager;
  private _agentSessionManager: AgentSessionManager;
  private _agentDetector: AgentDetector;
  private _planningService: PlanningService;
  private _executionEngine: ExecutionEngine;
  private _multiFileOrchestrator: MultiFileEditOrchestrator;
  private _terminalService: TerminalIntegrationService;
  private _reviewService: ReviewService;
  private _composerManager: ComposerSessionManager;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly historyManager: HistoryManager,
    private readonly apiService: ApiService
  ) {
    this._extensionUri = context.extensionUri;
    this._agentModeManager = AgentModeManager.getInstance();
    this._agentSessionManager = AgentSessionManager.getInstance();
    this._agentDetector = AgentDetector.getInstance();
    this._planningService = PlanningService.getInstance();
    this._planningService.setApiService(apiService);
    this._executionEngine = ExecutionEngine.getInstance();
    this._multiFileOrchestrator = MultiFileEditOrchestrator.getInstance();
    this._terminalService = TerminalIntegrationService.getInstance();
    this._terminalService.setApiService(apiService);
    this._reviewService = ReviewService.getInstance();
    this._reviewService.setApiService(apiService);
    this._composerManager = ComposerSessionManager.getInstance();
    this._wireExecutionEvents();
    this._wireFileOpsEvents();
    this._wireTerminalEvents();
    this._wireReviewEvents();
    this._wireComposerEvents();
    this._wireMCPEvents();
    this._wireNotepadEvents();

    // Initialize context provider
    this._contextProvider = new ContextProvider();

    // Listen to context changes and send to webview
    this._contextProvider.onContextChange((ctx) => {
      this._sendActiveContext(ctx);
    });

    // Listen to history changes
    historyManager.onChange((event: HistoryEvent) => {
      this._handleHistoryEvent(event);
    });

    // Listen to agent mode changes
    this._agentModeManager.onModeChange((mode) => {
      this._post({ type: 'agentModeChanged', mode });
    });

    // Listen to agent session status changes
    this._agentSessionManager.onStatusChange(({ session }) => {
      this._post({ type: 'agentSessionUpdate', session });
    });
    this._agentSessionManager.onSessionEnd((session) => {
      this._post({ type: 'agentSessionUpdate', session: null });
    });
  }

  private _handleHistoryEvent(event: HistoryEvent): void {
    switch (event.type) {
      case 'created':
      case 'updated':
      case 'deleted':
      case 'switched':
      case 'cleared':
        this._sendHistory();
        if (event.type === 'switched' || event.type === 'created') {
          this._loadCurrent();
        }
        break;
    }
  }

  public resolveWebviewView(webviewView: vscode.WebviewView, _ctx: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist'),
        vscode.Uri.joinPath(this._extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(this._onMessage.bind(this), undefined, this.context.subscriptions);
    webviewView.onDidChangeVisibility(() => { if (webviewView.visible) { this._sendConfig(); this._loadCurrent(); } });
    Logger.info('ChatViewProvider initialized');
  }

  private async _onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'ready': this._sendConfig(); this._sendHistory(); this._loadCurrent(); break;
      case 'sendMessage': await this._send(msg.content as string, msg.context as MessageContext | undefined); break;
      case 'stopGeneration': this._stop(); break;
      case 'newChat': this.historyManager.createConversation(); this._sendHistory(); this._post({ type: 'clearChat' }); break;
      case 'loadConversation': this.historyManager.setCurrentConversation(msg.id as string); this._loadCurrent(); break;
      case 'deleteConversation': this.historyManager.deleteConversation(msg.id as string); this._sendHistory(); break;
      case 'pinConversation': this.historyManager.togglePin(msg.id as string); this._sendHistory(); break;
      case 'renameConversation': this.historyManager.updateConversation(msg.id as string, { title: msg.title as string }); this._sendHistory(); break;
      case 'exportConversation': await this._exportConversation(msg.id as string); break;
      case 'forkConversation': await this._handleForkConversation(msg.messageId as string); break;
      case 'copyAsMarkdown': await this._handleCopyAsMarkdown(msg.messageId as string); break;
      case 'dropFiles': await this._handleDropFiles((msg as any).uris as string[]); break;
      case 'getAvailableModels': this._sendAvailableModels(); break;
      case 'retryWithModel': await this._handleRetryWithModel(msg.messageId as string, (msg as any).model as string); break;
      case 'getHistory': this._sendHistory(); break;
      case 'getConfig': this._sendConfig(); break;
      case 'copyToClipboard': await vscode.env.clipboard.writeText(msg.text as string); break;
      case 'insertCode': await this._insertCode(msg.code as string); break;
      case 'openFile': await this._openFile(msg.path as string); break;
      case 'retry': await this._retry(); break;
      case 'applyCode': this._sendOpenFiles(); break;
      case 'createFileWithCode': await this._createFileWithCode(msg.code as string, msg.language as string, msg.suggestedFilename as string | undefined); break;
      case 'getOpenFiles': this._sendOpenFiles(); break;
      case 'getWorkspaceFiles': await this._sendWorkspaceFiles(msg.query as string); break;
      case 'getFileContent': await this._sendFileContent(msg.path as string); break;
      case 'applyCodeToFile': await this._applyCodeToFile(msg.path as string, msg.code as string); break;
      case 'createNewFile': await this._createNewFile(msg.filename as string, msg.code as string); break;
      case 'getMentionSuggestions': await this._handleMentionSuggestions(msg.context as { query: string; type: string | null }); break;
      case 'inputChanged': await this._handleInputChanged(msg.text as string); break;
      case 'resolveMentions': await this._handleResolveMentions(msg.mentions as any[]); break;
      case 'toggleAgentMode': this._agentModeManager.toggleAgentMode(); break;
      case 'setAgentMode': this._agentModeManager.setMode(msg.mode as AgentMode); break;
      case 'approvePlan': this._handleApprovePlan(); break;
      case 'runPlanInBackground': await this._handleRunInBackground(); break;
      case 'rejectPlan': this._handleRejectPlan(); break;
      case 'revisePlan': await this._handleRevisePlan(msg.feedback as string); break;
      case 'pauseExecution': this._executionEngine.pause(); break;
      case 'resumeExecution': this._executionEngine.resume(); break;
      case 'cancelExecution': this._executionEngine.cancel(); break;
      case 'skipStep': this._executionEngine.skipCurrentStep(); break;
      case 'rollbackAll': await this._executionEngine.rollbackAndStop(); break;
      case 'rollbackLast': await this._executionEngine.rollbackLastStep(); break;
      case 'resolveConflict': Logger.info('Conflict resolved', { operationId: msg.operationId, resolution: msg.resolution }); break;
      case 'revertOperation': Logger.info('Revert single operation', { operationId: msg.operationId }); break;
      case 'revertAllOps': await this._handleRevertAllOps(); break;
      case 'viewFileDiff': await this._handleViewFileDiff(msg.operationId as string); break;
      case 'runTerminalCommand': await this._handleRunTerminalCommand(msg.command as string); break;
      case 'cancelTerminalCommand': this._terminalService.dispose(); break;
      case 'triggerAutoFix': await this._handleAutoFix(msg.errors as any[]); break;
      case 'retryCommand': await this._handleRunTerminalCommand((msg as any).command || ''); break;
      case 'openFileAtLine': await this._openFileAtLine(msg.path as string, msg.line as number); break;
      case 'runQuickCommand': await this._handleQuickCommand(msg.category as string); break;
      case 'acceptAllChanges': await this._reviewService.acceptAll(); break;
      case 'rejectAllChanges': await this._reviewService.rejectAll(); break;
      case 'acceptChange': this._reviewService.acceptChange(msg.changeId as string); break;
      case 'rejectChange': this._reviewService.rejectChange(msg.changeId as string); break;
      case 'acceptHunk': this._reviewService.acceptHunk(msg.hunkId as string); break;
      case 'rejectHunk': this._reviewService.rejectHunk(msg.hunkId as string); break;
      case 'toggleChange': this._reviewService.toggleChange(msg.changeId as string); break;
      case 'toggleHunk': this._reviewService.toggleHunk(msg.hunkId as string); break;
      case 'finalizeReview': await this._reviewService.finalizeReview(msg.notes as string | undefined); break;
      case 'showFileDiff': await this._reviewService.showFileDiff(msg.changeId as string); break;
      case 'showHunkDiff': await this._reviewService.showHunkDiff(msg.changeId as string, msg.hunkId as string); break;
      case 'showAllDiffs': await this._reviewService.showAllDiffs(); break;
      case 'undoAllChanges': await this._reviewService.undoAll(); break;
      case 'undoFileChange': await this._reviewService.undoFile(msg.changeId as string); break;
      case 'undoHunkChange': await this._reviewService.undoHunk(msg.hunkId as string, msg.changeId as string); break;
      case 'addReviewNote': break;
      // Documentation handlers
      case 'getDocSources': await this._handleGetDocSources(); break;
      case 'addDocSource': await this._handleAddDocSource(msg.source as any); break;
      case 'removeDocSource': await this._handleRemoveDocSource(msg.sourceId as string); break;
      case 'startDocCrawl': await this._handleStartDocCrawl(msg.sourceId as string, msg.config as any); break;
      case 'searchDocs': await this._handleSearchDocs(msg.query as string, msg.sourceIds as string[] | undefined, msg.limit as number | undefined); break;
      case 'getDocSuggestions': await this._handleGetDocSuggestions(msg as any); break;
      case 'insertDocMention': this._handleInsertDocMention(msg.source as string, msg.topic as string | undefined); break;
      // Git handlers
      case 'requestGitStatus': await this._handleGitStatus(); break;
      case 'requestGitLog': await this._handleGitLog(msg.offset as number | undefined); break;
      case 'requestGitBlame': await this._handleGitBlame(msg.filePath as string); break;
      case 'requestGitDiff': await this._handleGitDiff(msg.filePath as string | undefined); break;
      case 'requestGitPR': await this._handleGitPR(); break;
      case 'switchBranch': await this._handleSwitchBranch(msg.branchName as string | undefined); break;
      case 'stageFile': await this._handleStageFile(msg.path as string); break;
      case 'unstageFile': await this._handleUnstageFile(msg.path as string); break;
      case 'stageAll': await this._handleStageAll(); break;
      case 'openGitDiff': await this._handleOpenGitDiff(msg.path as string); break;
      case 'insertGitMention': this._post({ type: 'insertMention', mention: `@git:${msg.subCommand || ''}` }); break;
      case 'toggleGitBlame': vscode.commands.executeCommand('inaCoding.showGitBlame'); break;
      // LSP handlers
      case 'requestLSPContext': await this._handleRequestLSPContext(); break;
      case 'requestDefinition': await this._handleRequestDefinition(msg.filePath as string, msg.line as number, msg.col as number); break;
      case 'requestReferences': await this._handleRequestReferences(msg.filePath as string, msg.line as number, msg.col as number); break;
      case 'requestTypeInfo': await this._handleRequestTypeInfo(msg.filePath as string, msg.line as number, msg.col as number); break;
      case 'requestCallHierarchy': await this._handleRequestCallHierarchy(msg.filePath as string, msg.line as number, msg.col as number); break;
      case 'navigateToSymbol': await this._handleNavigateToSymbol(msg.filePath as string, msg.line as number); break;
      case 'fixDiagnosticWithAI': await this._handleFixDiagnosticWithAI(msg.diagnostic as any); break;
      case 'explainSymbol': await this._handleExplainSymbol(msg.symbolName as string); break;
      case 'explainDiagnostic': await this._handleExplainDiagnostic(msg.diagnostic as any); break;
      // Vision handlers
      case 'pasteImage': await this._handlePasteImage(); break;
      case 'uploadImages': await this._handleUploadImages(); break;
      case 'captureScreenshot': await this._handleCaptureScreenshot(); break;
      case 'analyzeImage': await this._handleAnalyzeImage(msg.image as any, msg.detailLevel as string); break;
      case 'designToCode': await this._handleDesignToCode(msg.image as any, msg.config as any, msg.additionalInstructions as string); break;
      case 'insertGeneratedCode': await this._handleInsertGeneratedCode(msg.code as string); break;
      case 'createComponentFiles': await this._handleCreateComponentFiles(msg.components as any[]); break;
      // Rules
      case 'getRulesStatus': this._sendRulesStatus(); break;
      case 'createRulesFile': await this._handleCreateRulesFile(msg.template as string | undefined); break;
      case 'openRulesFile': await this._handleOpenRulesFile(); break;
      case 'toggleRules': this._handleToggleRules(); break;
      case 'refreshRules': await this._handleRefreshRules(); break;
      case 'getRulesPreview': this._handleRulesPreview(msg.mode as string); break;
      case 'showRulesPanel': vscode.commands.executeCommand('inaCoding.rules.showPanel'); break;
      // Global rules
      case 'getGlobalRulesStatus': this._sendGlobalRulesStatus(); break;
      case 'runGlobalRulesWizard': GlobalRulesSetupWizard.getInstance().runWizard().then(() => this._sendGlobalRulesStatus()); break;
      case 'openGlobalRulesFile': this._handleOpenGlobalRulesFile(); break;
      case 'deleteGlobalRules': this._handleDeleteGlobalRules(); break;
      case 'updateGlobalPreference': this._handleUpdateGlobalPreference(msg.key as string, msg.value as string); break;
      case 'updateGlobalCodingDefault': this._handleUpdateGlobalSection('Coding Defaults', msg.key as string, msg.value as string); break;
      case 'updateGlobalResponseStyle': this._handleUpdateGlobalSection('Response Style', msg.key as string, msg.value as string); break;
      // Memory
      case 'requestMemories': this._handleRequestMemories(msg.filters as any); break;
      case 'createMemory': this._handleCreateMemory(msg.memory as any); break;
      case 'updateMemory': MemoryClient.getInstance().updateMemory(msg.memoryId as string, msg.updates as any).then(m => this._post({ type: 'memoryUpdated', memory: m })).catch(e => Logger.debug('Memory update failed:', e)); break;
      case 'deleteMemory': MemoryClient.getInstance().deleteMemory(msg.memoryId as string).then(() => this._post({ type: 'memoryDeleted', memoryId: msg.memoryId })).catch(e => Logger.debug('Memory delete failed:', e)); break;
      case 'searchMemories': MemoryClient.getInstance().searchMemories(msg.query as string, msg.projectId as string, msg.limit as number).then(r => this._post({ type: 'memorySearchResults', memories: (r.results || []).map((x: any) => x.memory || x) })).catch(e => Logger.debug('Memory search failed:', e)); break;
      case 'pinMemory': MemoryClient.getInstance().pinMemory(msg.memoryId as string).catch(e => Logger.debug('Pin failed:', e)); break;
      case 'unpinMemory': MemoryClient.getInstance().unpinMemory(msg.memoryId as string).catch(e => Logger.debug('Unpin failed:', e)); break;
      case 'submitMemoryFeedback': MemoryClient.getInstance().submitFeedback(msg.memoryId as string, msg.feedbackType as any, msg.context as string).catch(e => Logger.debug('Feedback failed:', e)); break;
      case 'keepExtractedMemory': this._handleCreateMemory(msg.extraction as any); break;
      case 'discardExtractedMemory': break; // no-op
      case 'runMemoryMaintenance': MemoryClient.getInstance().runMaintenance().then(r => { this._post({ type: 'memoryStats', stats: r }); vscode.window.showInformationMessage('Memory maintenance complete'); }).catch(e => Logger.debug('Maintenance failed:', e)); break;
      case 'exportMemories': MemoryClient.getInstance().exportMemories(undefined, (msg.format as any) || 'json').then(d => { const text = JSON.stringify(d.data || d, null, 2); vscode.workspace.openTextDocument({ content: text, language: 'json' }).then(doc => vscode.window.showTextDocument(doc)); }).catch(e => Logger.debug('Export failed:', e)); break;
      case 'clearProjectMemories': this._handleClearProjectMemories(); break;
      case 'toggleAutoExtract': { const ae = MemoryAutoExtractor.getInstance(); if (msg.enabled) ae.enable(); else ae.disable(); this._post({ type: 'autoExtractChanged', enabled: ae.isEnabled() }); break; }
      case 'openMemoryPanel': this._handleRequestMemories(); break;
      // Cache
      case 'requestCacheStats': this._sendCacheStats(); break;
      case 'clearCache': { const c = CacheManager.getInstance().getCache(msg.cacheName as string); if (c) c.clear(); this._sendCacheStats(); break; }
      case 'clearAllCaches': CacheManager.getInstance().invalidateAll(); this._sendCacheStats(); break;
      case 'pruneExpired': CacheManager.getInstance().pruneAll(); this._sendCacheStats(); break;
      // Request optimization
      case 'requestStatsRequest': this._post({ type: 'requestMetricsUpdated', metrics: RequestScheduler.getInstance().getMetrics() }); break;
      case 'cancelRequest': RequestScheduler.getInstance().cancelRequest(msg.requestId as string); break;
      case 'cancelRequestCategory': RequestScheduler.getInstance().cancelByCategory(msg.category as any); break;
      case 'cancelAllRequests': RequestScheduler.getInstance().cancelAll(); break;
      // Offline mode
      case 'requestConnectivity': {
        const cm = ConnectivityMonitor.getInstance();
        this._post({ type: 'connectivityChanged', state: cm.getState(), health: cm.getHealth() });
        break;
      }
      case 'retryConnection': ConnectivityMonitor.getInstance().forceCheck().then(h => this._post({ type: 'connectivityChanged', state: h.state, health: h })).catch(() => {}); break;
      case 'startSync': SyncManager.getInstance().startSync().then(p => this._post({ type: 'syncComplete', progress: p })).catch(e => Logger.debug('Sync failed:', e)); break;
      case 'cancelSync': SyncManager.getInstance().cancelSync(); break;
      case 'removeQueueItem': OfflineQueue.getInstance().removeItem(msg.itemId as string); this._post({ type: 'offlineQueueUpdated', queue: OfflineQueue.getInstance().getQueue() }); break;
      case 'clearQueue': OfflineQueue.getInstance().clearQueue(); this._post({ type: 'offlineQueueUpdated', queue: [] }); break;
      case 'retryFailedQueue': SyncManager.getInstance().retryFailed().then(p => this._post({ type: 'syncComplete', progress: p })).catch(() => {}); break;
      case 'getOfflineCapabilities': { const gd = GracefulDegradation.getInstance(); this._post({ type: 'offlineCapabilities', ...gd.getOfflineStatus() }); break; }
      case 'downloadLocalModel': {
        const lm = LocalModelManager.getInstance();
        (async () => {
          for await (const p of lm.downloadModel(msg.modelName as string)) {
            this._post({ type: 'localModelDownloadProgress', ...p });
          }
          this._post({ type: 'localModelStatus', available: lm.isAvailable(), models: lm.getAvailableModels(), selected: lm.getSelectedModel() });
        })().catch(e => Logger.debug('Model download failed:', e));
        break;
      }
      case 'explicitRemember': MemoryAutoExtractor.getInstance().handleExplicitRemember(msg.content as string, {}).then(m => { if (m) this._post({ type: 'memoryCreated', memory: m }); }).catch(e => Logger.debug('Remember failed:', e)); break;
      case 'explicitForget': MemoryAutoExtractor.getInstance().handleExplicitForget(msg.query as string).catch(e => Logger.debug('Forget failed:', e)); break;
      // Error Recovery
      case 'submitFeedback': UserFeedbackCollector.getInstance().submitFeedback(msg.feedback as any); break;
      case 'submitResponseFeedback': UserFeedbackCollector.getInstance().submitResponseFeedback(msg.messageId as string, msg.rating as any, msg.comment as string); break;
      case 'requestErrorAnalytics': this._post({ type: 'errorAnalyticsUpdated', analytics: ErrorAnalyticsEngine.getInstance().getAnalytics() }); break;
      case 'resetCircuitBreaker': { const cb = CircuitBreakerRegistry.getInstance().get(msg.name as string); if (cb) cb.reset(); this._post({ type: 'circuitBreakerUpdate', breakers: CircuitBreakerRegistry.getInstance().getStatusArray() }); break; }
      case 'resetAllCircuitBreakers': CircuitBreakerRegistry.getInstance().resetAll(); this._post({ type: 'circuitBreakerUpdate', breakers: CircuitBreakerRegistry.getInstance().getStatusArray() }); break;
      case 'clearErrorHistory': ErrorAnalyticsEngine.getInstance().clearHistory(); this._post({ type: 'errorAnalyticsUpdated', analytics: ErrorAnalyticsEngine.getInstance().getAnalytics() }); break;
      case 'runSelfHeal': SelfHealingEngine.getInstance().checkAndHeal().then(r => { this._post({ type: 'selfHealExecuted', result: r }); vscode.window.showInformationMessage(`Self-heal: ${r.successes} fixes, ${r.failures} failed`); }).catch(() => {}); break;
      case 'generateBugReport': UserFeedbackCollector.getInstance().collectBugReport(msg.errorId as string).then(report => this._post({ type: 'bugReportGenerated', report })).catch(() => {}); break;
      case 'openErrorDashboard': this._post({ type: 'errorAnalyticsUpdated', analytics: ErrorAnalyticsEngine.getInstance().getAnalytics() }); this._post({ type: 'circuitBreakerUpdate', breakers: CircuitBreakerRegistry.getInstance().getStatusArray() }); break;
      // Theme
      case 'setTheme': { const te = ThemeEngine.getInstance(); te.setTheme(msg.themeId as string); const tw = te.getThemeForWebview(); this._post({ type: 'themeUpdated', ...tw }); break; }
      case 'setThemeMode': { const te = ThemeEngine.getInstance(); te.setMode(msg.mode as any); const tw = te.getThemeForWebview(); this._post({ type: 'themeUpdated', ...tw }); break; }
      case 'setAccentColor': { const te = ThemeEngine.getInstance(); te.setAccentColor(msg.color as string); const tw = te.getThemeForWebview(); this._post({ type: 'themeUpdated', ...tw }); break; }
      case 'setFontSize': { const te = ThemeEngine.getInstance(); te.setFontSize(msg.size as any); const tw = te.getThemeForWebview(); this._post({ type: 'themeUpdated', ...tw }); break; }
      case 'setBorderRadius': { const te = ThemeEngine.getInstance(); te.setBorderRadius(msg.level as any); const tw = te.getThemeForWebview(); this._post({ type: 'themeUpdated', ...tw }); break; }
      case 'setCompactMode': { const te = ThemeEngine.getInstance(); te.setCompactMode(msg.compact as boolean); const tw = te.getThemeForWebview(); this._post({ type: 'themeUpdated', ...tw }); break; }
      case 'requestTheme': { const tw = ThemeEngine.getInstance().getThemeForWebview(); this._post({ type: 'themeUpdated', ...tw }); break; }
      case 'requestAvailableThemes': { const themes = ThemeEngine.getInstance().getAvailableThemes().map(t => ({ id: t.id, name: t.name, description: t.description, mode: t.mode })); this._post({ type: 'availableThemes', themes }); break; }
      // Onboarding
      case 'startOnboarding': OnboardingManager.getInstance().startOnboarding(); break;
      case 'skipOnboarding': OnboardingManager.getInstance().skipOnboarding(); this._post({ type: 'onboardingStateUpdated', state: OnboardingManager.getInstance().getState(), progress: OnboardingManager.getInstance().getProgress() }); break;
      case 'completeOnboardingStep': OnboardingManager.getInstance().completeStep(msg.step as any); this._post({ type: 'onboardingStateUpdated', state: OnboardingManager.getInstance().getState(), progress: OnboardingManager.getInstance().getProgress() }); break;
      case 'startTour': {
        const fts = FeatureTourService.getInstance();
        fts.startTour(msg.tourId as string);
        const step = fts.getCurrentTourStep();
        const prog = fts.getTourProgress();
        if (step && prog) this._post({ type: 'tourStepChanged', step, progress: prog });
        break;
      }
      case 'nextTourStep': {
        const fts = FeatureTourService.getInstance();
        fts.nextStep();
        if (fts.isInTour()) {
          this._post({ type: 'tourStepChanged', step: fts.getCurrentTourStep(), progress: fts.getTourProgress() });
        } else {
          this._post({ type: 'tourCompleted' });
        }
        break;
      }
      case 'prevTourStep': {
        const fts = FeatureTourService.getInstance();
        fts.previousStep();
        this._post({ type: 'tourStepChanged', step: fts.getCurrentTourStep(), progress: fts.getTourProgress() });
        break;
      }
      case 'skipTour': FeatureTourService.getInstance().skipTour(); this._post({ type: 'tourSkipped' }); break;
      case 'startTutorial': {
        const tut = InteractiveTutorial.getInstance();
        tut.startTutorial();
        this._post({ type: 'tutorialStarted', progress: tut.getProgress(), lessons: tut.getLessons().map(l => ({ ...l, steps: l.steps.map(s => ({ instruction: s.instruction, expectedAction: s.expectedAction, hint: s.hint, autoComplete: s.autoComplete })) })) });
        break;
      }
      case 'startLesson': {
        const tut = InteractiveTutorial.getInstance();
        tut.startLesson(msg.lessonId as string);
        const lesson = tut.getCurrentLesson();
        if (lesson) this._post({ type: 'lessonStarted', lesson: { ...lesson, steps: lesson.steps.map(s => ({ instruction: s.instruction, expectedAction: s.expectedAction, hint: s.hint, autoComplete: s.autoComplete })) } });
        break;
      }
      case 'advanceTutorialStep': {
        const tut = InteractiveTutorial.getInstance();
        tut.advanceStep();
        const curLesson = tut.getCurrentLesson();
        if (curLesson) {
          this._post({ type: 'lessonStepAdvanced', lesson: { ...curLesson, steps: curLesson.steps.map(s => ({ instruction: s.instruction, expectedAction: s.expectedAction, hint: s.hint, autoComplete: s.autoComplete })) }, stepIndex: tut.getCurrentStepIndex() });
        } else {
          this._post({ type: 'lessonCompleted', progress: tut.getProgress() });
        }
        break;
      }
      case 'skipLesson': InteractiveTutorial.getInstance().skipLesson(); break;
      case 'dismissHint': ProgressiveHintService.getInstance().dismissHint(msg.hintId as string); break;
      case 'requestShortcuts': {
        const sc = ShortcutCheatsheet.getInstance();
        this._post({ type: 'shortcutsData', shortcuts: sc.getShortcutsForPlatform(), platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux' });
        break;
      }
      case 'dismissWhatsNew': WhatsNewService.getInstance().markAsSeen(); break;
      case 'resetOnboarding': OnboardingManager.getInstance().resetOnboarding(); this._post({ type: 'onboardingStateUpdated', state: OnboardingManager.getInstance().getState(), progress: OnboardingManager.getInstance().getProgress() }); break;
      case 'requestWhatsNew': {
        const wn = WhatsNewService.getInstance();
        this._post({ type: 'whatsNewData', changelog: wn.getChangelog(), version: wn.getVersion() });
        break;
      }
      case 'applyOnboardingPrefs': {
        Logger.info(`[Onboarding] Prefs applied: lang=${msg.language}, exp=${msg.experience}`);
        break;
      }
      // Shortcuts
      case 'requestShortcutDefinitions': {
        const data = ShortcutManager.getInstance().getShortcutsForWebview();
        this._post({ type: 'shortcutsUpdated', ...data });
        break;
      }
      case 'customizeShortcut': {
        const sm = ShortcutManager.getInstance();
        const result = sm.customizeShortcut(msg.shortcutId as string, msg.newKeys as any);
        if (result.conflicts.length > 0) this._post({ type: 'shortcutConflicts', conflicts: result.conflicts });
        this._post({ type: 'shortcutsUpdated', ...sm.getShortcutsForWebview() });
        break;
      }
      case 'resetShortcut': ShortcutManager.getInstance().resetShortcut(msg.shortcutId as string); this._post({ type: 'shortcutsUpdated', ...ShortcutManager.getInstance().getShortcutsForWebview() }); break;
      case 'resetAllShortcuts': ShortcutManager.getInstance().resetAllShortcuts(); this._post({ type: 'shortcutsUpdated', ...ShortcutManager.getInstance().getShortcutsForWebview() }); break;
      case 'disableShortcut': ShortcutManager.getInstance().disableShortcut(msg.shortcutId as string); this._post({ type: 'shortcutsUpdated', ...ShortcutManager.getInstance().getShortcutsForWebview() }); break;
      case 'enableShortcut': ShortcutManager.getInstance().enableShortcut(msg.shortcutId as string); this._post({ type: 'shortcutsUpdated', ...ShortcutManager.getInstance().getShortcutsForWebview() }); break;
      case 'setShortcutProfile': ShortcutManager.getInstance().setProfile(msg.profileId as string); this._post({ type: 'shortcutsUpdated', ...ShortcutManager.getInstance().getShortcutsForWebview() }); break;
      case 'runShortcutAudit': { const conflicts = ShortcutConflictResolver.getInstance().runFullAudit(); this._post({ type: 'shortcutConflicts', conflicts }); break; }
      case 'exportShortcutConfig': { const json = ShortcutManager.getInstance().exportConfiguration(); this._post({ type: 'shortcutConfigExported', json }); break; }
      case 'importShortcutConfig': ShortcutManager.getInstance().importConfiguration(msg.json as string); this._post({ type: 'shortcutsUpdated', ...ShortcutManager.getInstance().getShortcutsForWebview() }); break;
      case 'autoResolveConflicts': { const res = ShortcutConflictResolver.getInstance().autoResolveConflicts((msg as any).conflicts || []); this._post({ type: 'shortcutConflicts', conflicts: res.remaining }); break; }
      case 'showQuickActions': QuickActionService.getInstance().showCodeActions(); break;
      // Status
      case 'requestSystemStatus': {
        const status = StatusAggregator.getInstance().collectStatus();
        this._post({ type: 'systemStatusUpdated', status });
        break;
      }
      case 'resetTokenUsage': {
        TokenTracker.getInstance().resetSession();
        const status = StatusAggregator.getInstance().collectStatus();
        this._post({ type: 'systemStatusUpdated', status });
        break;
      }
      case 'showHealthDashboard': {
        const report = HealthDashboardService.getInstance().getHealthReport();
        const quickActions = HealthDashboardService.getInstance().getQuickActions();
        this._post({ type: 'healthReportReady', report: { ...report, quickActions } });
        break;
      }
      case 'openStatusDetail': {
        const status = StatusAggregator.getInstance().collectStatus();
        this._post({ type: 'systemStatusUpdated', status });
        break;
      }
      // Privacy
      case 'requestPrivacyConfig': {
        const pmm = PrivacyModeManager.getInstance();
        const config = pmm.getConfig();
        const inventory = pmm.getDataInventory();
        const auditLog = pmm.getAuditLog();
        const enc = DataEncryptionService.getInstance();
        const keyFingerprint = enc.getKeyFingerprint();
        this._post({ type: 'privacyConfigUpdated', config, inventory, auditLog, keyFingerprint });
        break;
      }
      case 'setPrivacyMode': {
        const pmm2 = PrivacyModeManager.getInstance();
        pmm2.setMode(msg.mode as any);
        this._post({ type: 'privacyModeChanged', mode: msg.mode });
        break;
      }
      case 'updatePrivacyConfig': {
        const pmm3 = PrivacyModeManager.getInstance();
        pmm3.updateConfig(msg.config as any);
        const updatedConfig = pmm3.getConfig();
        this._post({ type: 'privacyConfigUpdated', config: updatedConfig, inventory: pmm3.getDataInventory(), auditLog: pmm3.getAuditLog(), keyFingerprint: DataEncryptionService.getInstance().getKeyFingerprint() });
        break;
      }
      case 'deleteAllData': {
        const drm = DataRetentionManager.getInstance();
        await drm.deleteAllUserData();
        this._post({ type: 'privacyConfigUpdated', config: PrivacyModeManager.getInstance().getConfig(), inventory: PrivacyModeManager.getInstance().getDataInventory(), auditLog: PrivacyModeManager.getInstance().getAuditLog(), keyFingerprint: DataEncryptionService.getInstance().getKeyFingerprint() });
        break;
      }
      case 'exportAllData': {
        const drm2 = DataRetentionManager.getInstance();
        const exportData = await drm2.exportAllUserData();
        this._post({ type: 'dataExported', data: exportData });
        break;
      }
      case 'deleteDataCategory': {
        const drm3 = DataRetentionManager.getInstance();
        await drm3.deleteCategory(msg.category as string);
        this._post({ type: 'privacyConfigUpdated', config: PrivacyModeManager.getInstance().getConfig(), inventory: PrivacyModeManager.getInstance().getDataInventory(), auditLog: PrivacyModeManager.getInstance().getAuditLog(), keyFingerprint: DataEncryptionService.getInstance().getKeyFingerprint() });
        break;
      }
      case 'runPrivacyAudit': {
        const audit = PrivacyAuditService.getInstance();
        const auditResult = await audit.runFullAudit();
        this._post({ type: 'privacyConfigUpdated', config: PrivacyModeManager.getInstance().getConfig(), inventory: PrivacyModeManager.getInstance().getDataInventory(), auditLog: PrivacyModeManager.getInstance().getAuditLog(), keyFingerprint: DataEncryptionService.getInstance().getKeyFingerprint() });
        break;
      }
      case 'runCleanup': {
        const drm4 = DataRetentionManager.getInstance();
        await drm4.cleanupExpiredData();
        this._post({ type: 'privacyConfigUpdated', config: PrivacyModeManager.getInstance().getConfig(), inventory: PrivacyModeManager.getInstance().getDataInventory(), auditLog: PrivacyModeManager.getInstance().getAuditLog(), keyFingerprint: DataEncryptionService.getInstance().getKeyFingerprint() });
        break;
      }
      case 'acceptPrivacyNotice': {
        const pmm4 = PrivacyModeManager.getInstance();
        pmm4.grantConsent('data_processing');
        pmm4.grantConsent('ai_context');
        break;
      }
      case 'rotateEncryptionKey': {
        await DataEncryptionService.getInstance().rotateKey();
        this._post({ type: 'privacyConfigUpdated', config: PrivacyModeManager.getInstance().getConfig(), inventory: PrivacyModeManager.getInstance().getDataInventory(), auditLog: PrivacyModeManager.getInstance().getAuditLog(), keyFingerprint: DataEncryptionService.getInstance().getKeyFingerprint() });
        break;
      }
      // Code Security (Phase 12.3)
      case 'scanWorkspace': {
        const scanResult = await SensitiveFileDetector.getInstance().scanWorkspace();
        this._post({ type: 'sensitiveFileScanResult', result: scanResult });
        break;
      }
      case 'addSensitivePattern': {
        SensitiveFileDetector.getInstance().addCustomPattern(msg.pattern as string);
        break;
      }
      case 'removeSensitivePattern': {
        SensitiveFileDetector.getInstance().removeCustomPattern(msg.pattern as string);
        break;
      }
      case 'getSecurityAlerts': case 'requestSecurityAlerts': {
        const alerts = CodeSecurityGate.getInstance().getAlerts();
        const stats = CodeSecurityGate.getInstance().getStats();
        this._post({ type: 'codeSecurityStatsUpdated', alerts, stats });
        break;
      }
      case 'dismissSecurityAlert': {
        CodeSecurityGate.getInstance().dismissAlert(msg.alertId as string);
        this._post({ type: 'codeSecurityStatsUpdated', alerts: CodeSecurityGate.getInstance().getAlerts(), stats: CodeSecurityGate.getInstance().getStats() });
        break;
      }
      case 'getTransmissionReport': {
        const report = CodeTransmissionMonitor.getInstance().generateTransmissionReport();
        this._post({ type: 'transmissionReport', report });
        break;
      }
      case 'resetTransmissionStats': {
        CodeTransmissionMonitor.getInstance().resetSession();
        break;
      }
      case 'purgeServerData': {
        const purgeResult = await EphemeralPolicyEnforcer.getInstance().purgeServerData('');
        this._post({ type: 'serverPurgeResult', result: purgeResult });
        break;
      }
      case 'getCodeSecurityStats': {
        this._post({ type: 'codeSecurityStatsUpdated', alerts: CodeSecurityGate.getInstance().getAlerts(), stats: CodeSecurityGate.getInstance().getStats() });
        break;
      }
      case 'whitelistPattern': {
        // Add pattern to whitelist
        break;
      }
      // Access Control (Phase 12.2)
      case 'requestApiKeys': await this._handleAccessRequest('listKeys', null, 'apiKeysLoaded', (d: any) => ({ keys: d })); break;
      case 'createApiKey': await this._handleAccessRequest('createKey', msg, 'apiKeyCreated', (d: any) => ({ key: d.key, apiKey: d.apiKey })); break;
      case 'revokeApiKey': await this._handleAccessRequest('revokeKey', msg, 'apiKeysLoaded', () => ({})); break;
      case 'rotateApiKey': await this._handleAccessRequest('rotateKey', msg, 'apiKeyCreated', (d: any) => ({ key: d.key, apiKey: d.apiKey })); break;
      case 'requestTeam': await this._handleAccessRequest('listTeams', null, 'teamLoaded', (d: any) => ({ team: d[0]?.team || null, members: [] })); break;
      case 'requestAuditLogs': await this._handleAccessRequest('getAuditLogs', msg, 'auditLogsLoaded', (d: any) => d); break;
      case 'exportAuditLog': await this._handleAccessExport(msg.format as string); break;
      case 'verifyAuditIntegrity': await this._handleAccessRequest('verifyIntegrity', null, 'auditIntegrityResult', (d: any) => ({ result: d })); break;
      case 'requestPermissions': await this._handleAccessRequest('getPermissions', null, 'permissionsLoaded', (d: any) => ({ permissions: d })); break;
      case 'requestRateLimitStatus': await this._handleAccessRequest('getRateLimitStatus', null, 'rateLimitUpdated', (d: any) => ({ status: d })); break;
      case 'showAccessPanel': this._post({ type: 'showAccessPanel' }); break;

      // Enterprise (Phase 13.4)
      case 'requestAdminDashboard': await this._handleEnterprise('GET', '/api/enterprise/admin', null, 'adminDashboardData', d => ({ dashboard: d })); break;
      case 'requestAdminSettings': await this._handleEnterprise('GET', '/api/enterprise/admin/settings', null, 'adminSettingsLoaded', d => ({ settings: d.settings })); break;
      case 'updateAdminSetting': await this._handleEnterprise('PATCH', '/api/enterprise/admin/settings', { key: (msg as any).key, value: (msg as any).value }, 'adminSettingUpdated', d => d); break;
      case 'requestUsers': {
        const f = (msg as any).filters || {};
        const q = new URLSearchParams();
        if (f.search) q.set('search', f.search);
        if (f.role) q.set('role', f.role);
        if (f.limit) q.set('limit', String(f.limit));
        if (f.offset) q.set('offset', String(f.offset));
        await this._handleEnterprise('GET', `/api/enterprise/admin/users?${q}`, null, 'usersLoaded', d => ({ data: d }));
        break;
      }
      case 'updateUser': await this._handleEnterprise('PATCH', '/api/enterprise/admin/users', { userId: (msg as any).userId, ...(msg as any).updates }, 'userUpdated', d => d); break;
      case 'requestSSOProviders': await this._handleEnterprise('GET', '/api/enterprise/sso/providers?teamId=default', null, 'ssoProvidersLoaded', d => ({ providers: d.providers || [] })); break;
      case 'createSSOProvider': await this._handleEnterprise('POST', '/api/enterprise/sso/providers', (msg as any).config, 'ssoProviderCreated', d => d); break;
      case 'deleteSSOProvider': await this._handleEnterprise('DELETE', `/api/enterprise/sso/providers/${(msg as any).providerId}`, null, 'ssoProviderDeleted', d => d); break;
      case 'initiateSSOLogin': await this._handleEnterprise('GET', `/api/enterprise/sso/login?provider_id=${(msg as any).providerId}`, null, 'ssoLoginUrl', d => d); break;
      case 'requestModels': await this._handleEnterprise('GET', '/api/enterprise/models', null, 'modelsLoaded', d => ({ models: d.models || [] })); break;
      case 'registerModel': await this._handleEnterprise('POST', '/api/enterprise/models', (msg as any).config, 'modelRegistered', d => d); break;
      case 'deleteModel': await this._handleEnterprise('DELETE', `/api/enterprise/models/${(msg as any).modelId}`, null, 'modelDeleted', d => d); break;
      case 'testModelConnection': await this._handleEnterprise('GET', `/api/enterprise/models/${(msg as any).modelId}/health`, null, 'modelHealthResult', d => d); break;
      case 'setDefaultModel': await this._handleEnterprise('PATCH', `/api/enterprise/models/${(msg as any).modelId}`, { isDefault: true }, 'defaultModelSet', d => d); break;
      case 'requestUsageDashboard': {
        const days = (msg as any).days || 30;
        await this._handleEnterprise('GET', `/api/enterprise/analytics?days=${days}`, null, 'usageDashboardData', d => ({ dashboard: d }));
        break;
      }
      case 'generateUsageReport': {
        const now = new Date();
        const daysBack = (msg as any).days || 30;
        const config = { periodType: 'daily', startDate: new Date(Date.now() - daysBack * 86400000).toISOString(), endDate: now.toISOString(), format: (msg as any).format || 'json' };
        await this._handleEnterprise('POST', '/api/enterprise/analytics/report', config, 'usageReportGenerated', d => ({ report: d }));
        break;
      }
      case 'requestLicense': await this._handleEnterprise('GET', '/api/enterprise/admin/license', null, 'licenseStatus', d => ({ license: d.license })); break;
      case 'activateLicense': await this._handleEnterprise('POST', '/api/enterprise/admin/license', { licenseKey: (msg as any).licenseKey }, 'licenseActivated', d => ({ license: d.license })); break;
      case 'showAdminPanel': this._post({ type: 'showAdminPanel' }); break;
      case 'showModelRegistration': this._post({ type: 'showModelRegistration' }); break;
      case 'showSSOWizard': this._post({ type: 'showSSOWizard' }); break;

      // Auto-Apply (Phase 15.2)
      case 'applyCode':
      case 'applyCodeBlock': {
        const m = msg as any;
        const applyService = ApplyService.getInstance();
        const codeBlock = { code: m.code, language: m.language || null, filename: m.filename || null, isComplete: false, hasFileHeader: !!m.filename };
        const result = await applyService.applyCodeBlock(codeBlock, { preferredFile: m.preferredFile });
        this._post({ type: 'applyResult', result, codeBlockId: m.codeBlockId });

        // Phase 16.6 — auto-format after apply
        if (result?.success && result.filePath) {
          try {
            const formatResult = await AutoFormatService.getInstance().formatAfterApply(
              result.filePath
            );
            if (formatResult.success && formatResult.changesApplied) {
              this._post({ type: 'autoFormatResult', filePath: result.filePath, result: formatResult });
            }
          } catch (e) {
            Logger.warn(`[AutoFormat] post-apply failed: ${String(e)}`);
          }
        }
        break;
      }
      case 'previewApply': {
        const m = msg as any;
        const applyService = ApplyService.getInstance();
        const codeBlock = { code: m.code, language: m.language || null, filename: m.filename || null, isComplete: false, hasFileHeader: !!m.filename };
        const preview = await applyService.previewApply(codeBlock);
        this._post({ type: 'applyPreviewResult', preview });
        break;
      }
      case 'detectFileForCode': {
        const m = msg as any;
        const detector = FileDetector.getInstance();
        const target = await detector.detectTarget({ code: m.code, language: m.language || null, filename: m.filename || null, isComplete: false, hasFileHeader: false });
        this._post({ type: 'fileDetectionResult', target });
        break;
      }
      case 'createFileWithCode': {
        const m = msg as any;
        const applicator = DiffApplicator.getInstance();
        const suggestedName = m.suggestedFilename || `new-file.${m.language || 'txt'}`;
        const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(suggestedName), filters: { 'All': ['*'] } });
        if (uri) {
          const result = await applicator.createFile(uri.fsPath, m.code);
          this._post({ type: 'applyResult', result });
        }
        break;
      }
      // Link Fetch (Phase 17.3)
      case 'fetchLink': {
        try {
          const page = await LinkFetchService.getInstance().fetch((msg as any).url);
          this._post({ type: 'linkFetched', page });
        } catch (e: any) {
          this._post({ type: 'linkFetched', error: e.message });
        }
        break;
      }
      // Context Visualization (Phase 17.5)
      case 'requestContextVisualization': {
        const viz = ContextWindowManager.getInstance().getVisualizationData();
        this._post({ type: 'contextVisualization', data: viz });
        break;
      }
      // Bug Finder (Phase 15.5)
      case 'scanCurrentFile': {
        this._post({ type: 'bugScanStarted', mode: 'current' });
        try {
          const bugFinder = BugFinderService.getInstance();
          bugFinder.on('scanProgress', (progress: any) => this._post({ type: 'bugScanProgress', progress }));
          const result = await bugFinder.scanCurrentFile();
          this._post({ type: 'bugScanComplete', result });
        } catch (e: any) {
          Logger.error('Bug scan failed:', e);
          this._post({ type: 'bugScanComplete', result: { bugs: [], filesScanned: 0, scanTimeMs: 0, mode: 'current' } });
        }
        break;
      }
      case 'scanChangedFiles': {
        this._post({ type: 'bugScanStarted', mode: 'changed' });
        try {
          const bugFinder = BugFinderService.getInstance();
          const result = await bugFinder.scanChangedFiles();
          this._post({ type: 'bugScanComplete', result });
        } catch (e: any) {
          Logger.error('Bug scan changed files failed:', e);
          this._post({ type: 'bugScanComplete', result: { bugs: [], filesScanned: 0, scanTimeMs: 0, mode: 'changed' } });
        }
        break;
      }
      case 'scanProject': {
        this._post({ type: 'bugScanStarted', mode: 'full' });
        try {
          const bugFinder = BugFinderService.getInstance();
          bugFinder.on('scanProgress', (progress: any) => this._post({ type: 'bugScanProgress', progress }));
          const result = await bugFinder.scanProject();
          this._post({ type: 'bugScanComplete', result });
        } catch (e: any) {
          Logger.error('Bug scan project failed:', e);
          this._post({ type: 'bugScanComplete', result: { bugs: [], filesScanned: 0, scanTimeMs: 0, mode: 'full' } });
        }
        break;
      }
      case 'fixBug': {
        const bug = (msg as any).bug;
        try {
          const bugFinder = BugFinderService.getInstance();
          const fix = await bugFinder.fixBug(bug);
          this._post({ type: 'bugFixResult', bugId: bug.id, fixed: !!fix.code, newCode: fix.code });
          if (fix.code) {
            vscode.window.showInformationMessage(`Bug fixed: ${bug.title}`);
          }
        } catch (e: any) {
          Logger.error('Bug fix failed:', e);
          this._post({ type: 'bugFixResult', bugId: bug.id, fixed: false });
        }
        break;
      }
      case 'dismissBug': {
        BugFinderService.getInstance().dismissBug(msg.bugId as string);
        break;
      }
      case 'openBugLocation': {
        await this._openFileAtLine(msg.filePath as string, msg.line as number);
        break;
      }
      case 'showBugFinder': {
        this._post({ type: 'showBugFinderPanel' });
        break;
      }
      // AI Commit Message (Phase 15.6)
      case 'generateCommitMessage': {
        this._post({ type: 'commitMessageGenerating' });
        try {
          const generator = CommitMessageGenerator.getInstance();
          const result = await generator.generate({ staged: (msg as any).staged });
          this._post({ type: 'commitMessageResult', result });
        } catch (e: any) {
          Logger.error('Commit message generation failed:', e);
          this._post({ type: 'commitMessageResult', result: { summary: 'Error generating commit message', body: e.message, type: 'chore', scope: null, breaking: false, alternatives: [] } });
        }
        break;
      }
      case 'acceptCommitMessage': {
        const { GitAIPanel } = require('../services/gitai/GitAIPanel');
        GitAIPanel.getInstance().autoFillCommitInput(msg.message as string);
        break;
      }
      // Shadow Workspace (Phase 17.1)
      case 'acceptShadowFile': {
        const sm = ShadowWorkspaceManager.getInstance();
        await sm.acceptFile(msg.sessionId as string, msg.filePath as string);
        this._sendShadowUpdate(msg.sessionId as string);
        break;
      }
      case 'rejectShadowFile': {
        const sm = ShadowWorkspaceManager.getInstance();
        sm.rejectFile(msg.sessionId as string, msg.filePath as string);
        this._sendShadowUpdate(msg.sessionId as string);
        break;
      }
      case 'acceptAllShadow': {
        const sm = ShadowWorkspaceManager.getInstance();
        await sm.acceptAll(msg.sessionId as string);
        this._post({ type: 'shadowSessionCommitted', sessionId: msg.sessionId as string });
        break;
      }
      case 'rejectAllShadow': {
        const sm = ShadowWorkspaceManager.getInstance();
        sm.rejectAll(msg.sessionId as string);
        this._post({ type: 'shadowSessionDiscarded', sessionId: msg.sessionId as string });
        break;
      }
      case 'previewShadowFile': {
        const sm = ShadowWorkspaceManager.getInstance();
        await sm.previewFile(msg.sessionId as string, msg.filePath as string);
        break;
      }
      case 'editShadowFile': {
        const sm = ShadowWorkspaceManager.getInstance();
        sm.editShadowFile(msg.sessionId as string, msg.filePath as string, (msg as any).content as string);
        this._sendShadowUpdate(msg.sessionId as string);
        break;
      }
      case 'createShadowCheckpoint': {
        const sm = ShadowWorkspaceManager.getInstance();
        sm.createCheckpoint(msg.sessionId as string, (msg as any).description as string || 'Manual checkpoint');
        this._sendShadowUpdate(msg.sessionId as string);
        break;
      }
      case 'restoreShadowCheckpoint': {
        const sm = ShadowWorkspaceManager.getInstance();
        sm.restoreCheckpoint(msg.sessionId as string, (msg as any).checkpointId as string);
        this._sendShadowUpdate(msg.sessionId as string);
        break;
      }
      case 'showShadowWorkspace': {
        const sm = ShadowWorkspaceManager.getInstance();
        const active = sm.getActiveSession();
        if (active) {
          this._sendShadowUpdate(active.id);
        }
        this._post({ type: 'showShadowPanel' });
        break;
      }
      // Deep Context (Phase 17.2)
      case 'resolveDeepDef':
      case 'resolveDeepType':
      case 'resolveDeepRefs': {
        // Handled via mention resolution in _send(), not directly from webview
        break;
      }
      // Performance Benchmarking (Phase 17.6)
      case 'runBenchmark': {
        this._post({ type: 'benchmarkRunning', category: (msg as any).category || 'all' });
        try {
          const runner = BenchmarkRunner.getInstance();
          const suite = (msg as any).category
            ? { name: (msg as any).category, results: await runner.runCategory((msg as any).category), totalPassed: 0, totalWarned: 0, totalFailed: 0, runTimeMs: 0, environment: {} }
            : await runner.runAll();
          this._post({ type: 'benchmarkResult', suite });
        } catch (e: any) {
          Logger.error('Benchmark failed:', e);
        }
        break;
      }
      // UX (Phase 17.7)
      case 'editMessage': {
        // Re-send from this point — delete subsequent messages and re-trigger
        Logger.info(`[UX] Edit message: ${msg.messageId}`);
        break;
      }
      case 'regenerateMessage': {
        Logger.info(`[UX] Regenerate from message: ${msg.messageId}`);
        break;
      }
      case 'bookmarkMessage': {
        Logger.info(`[UX] Bookmark message: ${msg.messageId}`);
        break;
      }
      case 'deleteMessage': {
        Logger.info(`[UX] Delete message: ${msg.messageId}`);
        break;
      }
      // Composer (Phase 16.1)
      case 'openComposer': {
        try {
          const session = this._composerManager.createSession((msg as any).instruction as string);
          this._post({ type: 'composerSessionCreated', session: toSessionView(session) });
          // Auto-start planning
          this._composerManager.startPlanning(session.id).catch((e) =>
            Logger.error('[Composer] startPlanning failed:', e)
          );
        } catch (e: any) {
          Logger.error('[Composer] openComposer failed:', e);
          vscode.window.showErrorMessage(`Composer failed to open: ${e?.message ?? String(e)}`);
        }
        break;
      }
      case 'closeComposer': {
        const active = this._composerManager.getActiveSession();
        if (active) this._composerManager.closeSession(active.id);
        vscode.commands.executeCommand('setContext', 'inaCoding.composerActive', false);
        break;
      }
      case 'startComposerPlanning': {
        try {
          await this._composerManager.startPlanning((msg as any).sessionId as string);
        } catch (e: any) {
          Logger.error('[Composer] planning failed:', e);
        }
        break;
      }
      case 'executeComposerPlan': {
        try {
          await this._composerManager.executePlan((msg as any).sessionId as string);
        } catch (e: any) {
          Logger.error('[Composer] execute failed:', e);
        }
        break;
      }
      case 'refineComposer': {
        try {
          await this._composerManager.refine(
            (msg as any).sessionId as string,
            (msg as any).instruction as string
          );
        } catch (e: any) {
          Logger.error('[Composer] refine failed:', e);
        }
        break;
      }
      case 'acceptComposerFile': {
        this._composerManager.acceptFile((msg as any).sessionId, (msg as any).filePath);
        break;
      }
      case 'rejectComposerFile': {
        this._composerManager.rejectFile((msg as any).sessionId, (msg as any).filePath);
        break;
      }
      case 'acceptComposerAll': {
        await this._composerManager.acceptAll((msg as any).sessionId);
        break;
      }
      case 'rejectComposerAll': {
        await this._composerManager.rejectAll((msg as any).sessionId);
        break;
      }
      case 'acceptComposerHunk': {
        this._composerManager.acceptByHunk(
          (msg as any).sessionId,
          (msg as any).filePath,
          (msg as any).hunkIndex,
          (msg as any).accepted
        );
        break;
      }
      case 'createComposerCheckpoint': {
        this._composerManager.createCheckpoint(
          (msg as any).sessionId,
          (msg as any).description as string
        );
        break;
      }
      case 'restoreComposerCheckpoint': {
        await this._composerManager.restoreCheckpoint(
          (msg as any).sessionId,
          (msg as any).checkpointId
        );
        break;
      }
      case 'pauseComposer': {
        this._composerManager.pauseExecution((msg as any).sessionId);
        break;
      }
      case 'resumeComposer': {
        await this._composerManager.resumeExecution((msg as any).sessionId);
        break;
      }
      case 'setComposerLayout': {
        // Persist layout preference
        try {
          await ConfigManager.set('composer.defaultLayout', (msg as any).layout);
        } catch (e) {
          Logger.warn(`[Composer] persist layout failed: ${String(e)}`);
        }
        break;
      }
      // ========== MCP (Phase 16.2) ==========
      case 'mcpListServers': {
        const client = MCPClient.getInstance();
        this._post({ type: 'mcpServersChanged', servers: client.getServerStatuses() });
        this._post({ type: 'mcpToolsChanged', tools: client.listTools() });
        break;
      }
      case 'mcpConnectServer': {
        try {
          const client = MCPClient.getInstance();
          const config = (msg as any).config;
          // Look up existing config by name (e.g. for builtin reconnects)
          const existing = client.getServer(config?.name);
          if (existing && existing.status === 'connected') break;
          await client.connect(config);
          this._post({ type: 'mcpServersChanged', servers: client.getServerStatuses() });
          this._post({ type: 'mcpToolsChanged', tools: client.listTools() });
        } catch (e: any) {
          Logger.error('[MCP] connect failed:', e);
          vscode.window.showErrorMessage(`MCP connect failed: ${e?.message ?? String(e)}`);
        }
        break;
      }
      case 'mcpDisconnectServer': {
        const client = MCPClient.getInstance();
        client.disconnect((msg as any).serverName);
        this._post({ type: 'mcpServersChanged', servers: client.getServerStatuses() });
        this._post({ type: 'mcpToolsChanged', tools: client.listTools() });
        break;
      }
      case 'mcpAddServer': {
        try {
          const client = MCPClient.getInstance();
          const config = (msg as any).config;
          await client.connect({
            displayName: config.name,
            transportType: 'stdio',
            url: null,
            env: {},
            args: [],
            enabled: true,
            autoStart: true,
            capabilities: [],
            ...config,
          });
          this._post({ type: 'mcpServersChanged', servers: client.getServerStatuses() });
          this._post({ type: 'mcpToolsChanged', tools: client.listTools() });
        } catch (e: any) {
          Logger.error('[MCP] add server failed:', e);
          vscode.window.showErrorMessage(`Failed to add MCP server: ${e?.message ?? String(e)}`);
        }
        break;
      }
      case 'mcpRemoveServer': {
        const client = MCPClient.getInstance();
        client.disconnect((msg as any).serverName);
        this._post({ type: 'mcpServersChanged', servers: client.getServerStatuses() });
        this._post({ type: 'mcpToolsChanged', tools: client.listTools() });
        break;
      }
      case 'mcpCallTool': {
        try {
          const executor = MCPToolExecutor.getInstance();
          const result = await executor.executeToolCall({
            serverName: (msg as any).serverName,
            toolName: (msg as any).toolName,
            arguments: (msg as any).arguments || {},
          });
          this._post({ type: 'mcpToolCallResult', result });
        } catch (e: any) {
          Logger.error('[MCP] tool call failed:', e);
        }
        break;
      }
      // ========== Web Search (Phase 16.3) ==========
      case 'webSearch': {
        try {
          const svc = WebSearchService.getInstance();
          const response = await svc.search((msg as any).query, {
            maxResults: (msg as any).maxResults ?? 5,
          });
          this._post({ type: 'webSearchResults', query: (msg as any).query, response });
        } catch (e: any) {
          Logger.error('[WebSearch] failed:', e);
          this._post({
            type: 'webSearchResults',
            query: (msg as any).query,
            response: {
              results: [],
              query: (msg as any).query,
              totalResults: 0,
              searchTimeMs: 0,
              engine: 'error',
            },
          });
        }
        break;
      }
      // ========== Notepads (Phase 16.4) ==========
      case 'notepadList': {
        const npMgr = NotepadManager.getInstance();
        this._post({ type: 'notepadsChanged', notepads: npMgr.getAll() });
        break;
      }
      case 'notepadCreate': {
        try {
          const npMgr = NotepadManager.getInstance();
          await npMgr.create(
            (msg as any).name,
            (msg as any).notepadType as NotepadType,
            (msg as any).content || ''
          );
        } catch (e: any) {
          Logger.error('[Notepads] create failed:', e);
          vscode.window.showErrorMessage(`Notepad create failed: ${e?.message ?? String(e)}`);
        }
        break;
      }
      case 'notepadDelete': {
        await NotepadManager.getInstance().delete((msg as any).id);
        break;
      }
      case 'notepadPin': {
        NotepadManager.getInstance().pin((msg as any).id);
        break;
      }
      case 'notepadUnpin': {
        NotepadManager.getInstance().unpin((msg as any).id);
        break;
      }
      case 'notepadAttach': {
        NotepadManager.getInstance().attach((msg as any).id);
        break;
      }
      case 'notepadDetach': {
        NotepadManager.getInstance().detach((msg as any).id);
        break;
      }
      case 'notepadOpen': {
        await NotepadManager.getInstance().openInEditor((msg as any).id);
        break;
      }
      case 'notepadUpdate': {
        await NotepadManager.getInstance().update((msg as any).id, (msg as any).content);
        break;
      }
      // ========== Interpreter/REPL (Phase 23) ==========
      case 'executeInREPL': {
        try {
          const { InterpreterService } = require('../services/terminal/InterpreterService');
          const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
          const interp = InterpreterService.getInstance(wsRoot);
          const result = await interp.executeInREPL((msg as any).code, (msg as any).language || 'javascript');
          this._post({ type: 'replResult', output: result.output, success: result.success });
        } catch (e: any) {
          Logger.error('[REPL] error:', e);
          this._post({ type: 'replResult', output: e.message || 'REPL error', success: false });
        }
        break;
      }
      // ========== Collaboration (Phase 19B Step 19.5) ==========
      case 'startCollabSession': {
        try {
          await vscode.commands.executeCommand('inaCoding.collab.start');
        } catch (e: any) {
          Logger.error('[Collab] start failed:', e);
        }
        break;
      }
      case 'joinCollabSession': {
        try {
          await vscode.commands.executeCommand('inaCoding.collab.join', (msg as any).code);
        } catch (e: any) {
          Logger.error('[Collab] join failed:', e);
        }
        break;
      }
      case 'leaveCollabSession': {
        try {
          await vscode.commands.executeCommand('inaCoding.collab.leave');
        } catch (e: any) {
          Logger.error('[Collab] leave failed:', e);
        }
        break;
      }
      case 'sendCollabMessage': {
        try {
          const { CollabClient } = require('../services/collab/CollabClient');
          const client = CollabClient.getInstance();
          await client.sendMessage((msg as any).messageType || 'text', (msg as any).content);
        } catch (e: any) {
          Logger.error('[Collab] send message failed:', e);
        }
        break;
      }
      case 'shareFileToCollab': {
        try {
          await vscode.commands.executeCommand('inaCoding.collab.shareFile');
        } catch (e: any) {
          Logger.error('[Collab] share file failed:', e);
        }
        break;
      }
      case 'updateCollabNotepad': {
        try {
          const { CollabClient } = require('../services/collab/CollabClient');
          const client = CollabClient.getInstance();
          await client.updateNotepad((msg as any).id, (msg as any).content, (msg as any).title);
        } catch (e: any) {
          Logger.error('[Collab] notepad update failed:', e);
        }
        break;
      }
      // ========== History Search (Phase 16.5) ==========
      case 'historySearch': {
        try {
          const svc = HistorySearchService.getInstance();
          const results = svc.search({
            query: (msg as any).query,
            ...(msg as any).options,
          });
          this._post({ type: 'historySearchResults', results });
        } catch (e: any) {
          Logger.error('[HistorySearch] failed:', e);
          this._post({ type: 'historySearchResults', results: [] });
        }
        break;
      }
      case 'historyListConversations': {
        const svc = HistorySearchService.getInstance();
        const conversations = svc.getConversations(50);
        const stats = svc.getStats();
        this._post({ type: 'historyConversationsList', conversations });
        this._post({ type: 'historyStats', stats });
        break;
      }
      case 'historyLoadConversation': {
        try {
          const id = (msg as any).id as string;
          this.historyManager.setCurrentConversation(id);
          this._loadCurrent();
          this._post({ type: 'historyConversationLoaded', id });
        } catch (e: any) {
          Logger.error('[HistorySearch] load failed:', e);
        }
        break;
      }
      case 'historyDeleteConversation': {
        const id = (msg as any).id as string;
        HistorySearchService.getInstance().deleteConversation(id);
        this._sendHistory();
        // Refresh list
        const svc = HistorySearchService.getInstance();
        this._post({ type: 'historyConversationsList', conversations: svc.getConversations(50) });
        this._post({ type: 'historyStats', stats: svc.getStats() });
        break;
      }
      case 'historyExportConversation': {
        try {
          const id = (msg as any).id as string;
          const format = (msg as any).format as 'json' | 'md';
          const content = HistorySearchService.getInstance().exportConversation(id, format);
          const ext = format === 'md' ? 'md' : 'json';
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`conversation-${id.substring(0, 8)}.${ext}`),
            filters: format === 'md' ? { Markdown: ['md'] } : { JSON: ['json'] },
          });
          if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
          }
        } catch (e: any) {
          Logger.error('[HistorySearch] export failed:', e);
        }
        break;
      }
      // ========== AutoFormat (Phase 16.6) ==========
      case 'formatFile': {
        try {
          const result = await AutoFormatService.getInstance().formatFile((msg as any).filePath);
          this._post({ type: 'autoFormatResult', filePath: (msg as any).filePath, result });
        } catch (e: any) {
          Logger.error('[AutoFormat] failed:', e);
        }
        break;
      }
      // ========== AI Rename (Phase 16.7) ==========
      case 'aiRenameRequest': {
        try {
          const m = msg as any;
          const uri = m.uri ? vscode.Uri.parse(m.uri) : undefined;
          const pos =
            typeof m.line === 'number' && typeof m.column === 'number'
              ? new vscode.Position(m.line, m.column)
              : undefined;
          await AIRenameProvider.getInstance().runInteractive(uri, pos);
        } catch (e: any) {
          Logger.error('[AIRename] failed:', e);
        }
        break;
      }
    }
  }

  private _sendShadowUpdate(sessionId: string): void {
    try {
      const sm = ShadowWorkspaceManager.getInstance();
      const session = sm.getSession(sessionId);
      if (!session) return;
      const diffs = sm.getAllDiffs(sessionId);
      const stats = sm.getSessionStats(sessionId);
      const files = Array.from(session.files.values()).map(f => ({
        filePath: f.realUri.fsPath,
        status: f.status,
        linesAdded: 0,
        linesRemoved: 0,
        sourceOperation: f.sourceOperation,
      }));
      this._post({
        type: 'shadowSessionUpdated',
        session: {
          id: session.id,
          name: session.name,
          status: session.status,
          files,
          checkpoints: session.checkpoints.map(c => ({ id: c.id, timestamp: c.timestamp, description: c.description })),
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          sourceOperation: session.sourceOperation,
        },
        diffs,
        stats,
      });
    } catch (e) {
      Logger.debug('Shadow update failed:', e);
    }
  }

  // ============ Access Control Helpers (Phase 12.2) ============

  private async _handleAccessRequest(method: string, params: any, responseType: string, transform: (d: any) => any): Promise<void> {
    try {
      const client = AccessClientImport.getInstance();
      let data: any;
      switch (method) {
        case 'listKeys': data = await client.listKeys(); break;
        case 'createKey': data = await client.createKey({ name: params.name, scopes: params.scopes, role: params.role, rateLimitTier: params.rateLimitTier, expiresInDays: params.expiresInDays || null }); break;
        case 'revokeKey': await client.revokeKey(params.keyId, params.reason || 'Revoked'); data = await client.listKeys(); break;
        case 'rotateKey': data = await client.rotateKey(params.keyId); break;
        case 'listTeams': data = await client.listTeams(); break;
        case 'getAuditLogs': data = await client.getAuditLogs(params.filters); break;
        case 'verifyIntegrity': data = await client.verifyAuditIntegrity(); break;
        case 'getPermissions': data = await client.getPermissions(); break;
        case 'getRateLimitStatus': data = await client.getRateLimitStatus(); break;
        default: return;
      }
      this._post({ type: responseType, ...transform(data) });
    } catch (err: any) {
      Logger.error(`Access control error (${method}):`, err);
    }
  }

  private async _handleAccessExport(format: string): Promise<void> {
    try {
      const client = AccessClientImport.getInstance();
      const data = await client.exportAuditLog(format);
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`audit-log.${format}`),
        filters: format === 'csv' ? { 'CSV': ['csv'] } : { 'JSON': ['json'] },
      });
      if (uri) {
        const fsP = require('fs/promises');
        await fsP.writeFile(uri.fsPath, data);
        vscode.window.showInformationMessage(`Audit log exported to ${uri.fsPath}`);
      }
    } catch (err: any) {
      Logger.error('Audit export error:', err);
    }
  }

  // ============ Enterprise Helpers (Phase 13.4) ============

  private async _handleEnterprise(method: string, path: string, body: any, responseType: string, transform: (d: any) => any): Promise<void> {
    try {
      let data: any;
      const endpoint = ConfigManager.getApiEndpoint();
      const apiKeyStore = ApiKeyStoreImport.getInstance();
      const key = await apiKeyStore.getKey();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) headers['x-api-key'] = key;

      const res = await fetch(`${endpoint}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `${res.status} ${res.statusText}`);
      }
      data = await res.json();
      this._post({ type: responseType, ...transform(data) });
    } catch (err: any) {
      Logger.error(`Enterprise request error (${method} ${path}):`, err);
      this._post({ type: responseType, error: err.message });
    }
  }

  // ============ Streaming Chat ============

  private async _send(content: string, context?: MessageContext): Promise<void> {
    if (!content.trim()) { return; }

    // Check offline/degraded state
    const connectivity = ConnectivityMonitor.getInstance();
    if (connectivity.isOffline() || connectivity.isDegraded()) {
      const gd = GracefulDegradation.getInstance();
      const degradedResult = await gd.handleChatRequest('', content, context);
      if (degradedResult.source !== 'normal') {
        // Handle offline response
        const messageId = `msg_offline_${Date.now()}`;
        this._post({ type: 'streamStart', messageId });
        if (degradedResult.content) {
          this._post({ type: 'streamChunk', messageId, content: degradedResult.content });
        }
        this._post({
          type: 'streamEnd', messageId,
          degradedSource: degradedResult.source,
          degradedQuality: degradedResult.quality,
          degradedWarning: degradedResult.warning,
        });
        if (degradedResult.content) {
          const chat = this.historyManager.getOrCreateCurrentConversation();
          this.historyManager.addMessage(chat.id, { role: 'user', content: content.trim(), context });
          this.historyManager.addMessage(chat.id, { role: 'assistant', content: degradedResult.content });
        }
        return;
      }
    }

    // Check if we should use agent mode
    const shouldAgent = this._agentModeManager.shouldUseAgent(content);
    if (shouldAgent) {
      Logger.info('Agent mode triggered for message', { content: content.slice(0, 100) });
      this._agentSessionManager.createSession(content, this._agentModeManager.getMode() as any);
      this._post({ type: 'agentSessionUpdate', session: this._agentSessionManager.getActiveSession() });
      // Generate plan in background — don't block the normal chat response
      this.generatePlan(content).catch((err) => {
        Logger.error('Background plan generation failed:', err);
      });
    }

    // Parse and resolve mentions from user content
    const parseResult = mentionParser.parse(content);
    let mentionContextStr = '';
    if (parseResult.mentions.length > 0) {
      try {
        const resolvedMentions = await Promise.all(
          parseResult.mentions.map(async (m) => {
            const resolution = await mentionProvider.resolveMention(m);
            return { ...m, resolved: resolution };
          })
        );
        mentionContextStr = resolvedMentions
          .filter(m => m.resolved && !m.resolved.error)
          .map(m => mentionParser.formatMentionForPrompt(m))
          .join('\n\n');
      } catch (error) {
        Logger.debug('Mention resolution failed:', error);
      }
    }

    const chat = this.historyManager.getOrCreateCurrentConversation();
    this.historyManager.addMessage(chat.id, { role: 'user', content: content.trim(), context });

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const abortController = new AbortController();
    this._streaming = { messageId, content: '', abortController, startTime: Date.now() };

    this._post({ type: 'streamStart', messageId });
    this._post({ type: 'aiTypingStarted' });

    try {
      const chatContext = await this._buildEnhancedContext(context);

      // Inject mention context into referencedFiles if available
      if (mentionContextStr) {
        chatContext.referencedFiles = chatContext.referencedFiles || [];
        chatContext.referencedFiles.push(mentionContextStr);
      }

      // Gather rules, notepads, and memories in parallel
      const parallelExecutor = ParallelExecutor.getInstance();
      const contextSources = await parallelExecutor.gatherContext([
        {
          name: 'rules',
          fn: () => {
            const merger = RulesMerger.getInstance();
            const merged = merger.getMergedRules();
            return Promise.resolve(merged.mergedContext.forChat || null);
          },
          timeoutMs: 200,
          optional: true,
        },
        {
          name: 'notepads',
          fn: () => {
            // Phase 16.4 — pinned + attached notepads, after rules, before memory
            try {
              const npContent = NotepadManager.getInstance().getContextContent();
              return Promise.resolve(npContent || null);
            } catch {
              return Promise.resolve(null);
            }
          },
          timeoutMs: 200,
          optional: true,
        },
        {
          name: 'memory',
          fn: async () => {
            const memInjector = MemoryContextInjector.getInstance();
            const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath || null;
            const memoryText = await memInjector.injectMemories('', content, {
              currentFile: currentFile ? vscode.workspace.asRelativePath(currentFile) : undefined,
              mode: 'chat',
            });
            // Send recalled memories to webview for indicator
            const recalled = memInjector.getLastRecalledMemories();
            if (recalled && recalled.memories.length > 0) {
              this._post({ type: 'memoriesRecalled', memories: recalled.memories });
            }
            return memoryText;
          },
          timeoutMs: 1000,
          optional: true,
        },
      ]);

      chatContext.referencedFiles = chatContext.referencedFiles || [];
      if (contextSources.rules) {
        chatContext.referencedFiles.push(contextSources.rules);
      }
      if (contextSources.notepads) {
        chatContext.referencedFiles.push(contextSources.notepads);
      }
      if (contextSources.memory) {
        chatContext.referencedFiles.push(contextSources.memory);
      }

      const messages = chat.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      let fullContent = '';

      // Feature 5 — if _overrideModel is set, use it for this one request.
      //
      // The override comes from the webview's retry picker, which now posts an
      // INA model id. The two-step translation that used to live here — a local
      // map from picker id to INA display name, then ConfigManager's map from
      // display name to an upstream id — is gone with the upstream map itself.
      // resolveModelId still migrates a value written by an older build, so a
      // conversation restored from previous state keeps working.
      const resolvedModel = this._overrideModel
        ? ConfigManager.resolveModelId(this._overrideModel, 'general')
        : ConfigManager.getChatModel();
      for await (const chunk of this.apiService.chatStream(
        { messages, context: chatContext, options: { model: resolvedModel, temperature: ConfigManager.getChat().temperature, maxTokens: ConfigManager.getChat().maxTokens } },
        abortController.signal
      )) {
        if (typeof chunk === 'string') {
          if (!fullContent) {
            this._post({ type: 'aiTypingStopped' });
          }
          fullContent += chunk;
          this._streaming.content = fullContent;
          this._post({ type: 'streamChunk', messageId, content: chunk });
        }
      }

      this.historyManager.addMessage(chat.id, { role: 'assistant', content: fullContent });
      this._post({ type: 'streamEnd', messageId });
      this._retryCount = 0;

      // Auto-extract memories from conversation turn
      try {
        const autoExtractor = MemoryAutoExtractor.getInstance();
        // Check for explicit remember/forget
        const rememberReq = autoExtractor.detectExplicitRememberRequest(content);
        if (rememberReq.isRememberRequest && rememberReq.content) {
          const mem = await autoExtractor.handleExplicitRemember(rememberReq.content, { chatId: chat.id, messageId });
          if (mem) this._post({ type: 'memoryCreated', memory: mem });
        }
        const forgetReq = autoExtractor.detectExplicitForgetRequest(content);
        if (forgetReq.isForgetRequest && forgetReq.query) {
          await autoExtractor.handleExplicitForget(forgetReq.query);
        }
        // Background extraction
        const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
        autoExtractor.onConversationTurn(content, fullContent, {
          chatId: chat.id, messageId,
          currentFile: currentFile ? vscode.workspace.asRelativePath(currentFile) : undefined,
        });
      } catch (e) {
        Logger.debug('Memory extraction skipped:', e);
      }

    } catch (error) {
      Logger.error('Chat stream error:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const retryable = this._isRetryable(error);
      this._post({ type: 'streamError', messageId, error: errMsg, retryable });
    } finally {
      this._streaming = null;
      this._sendHistory();
    }
  }

  private _stop(): void {
    if (!this._streaming) { return; }
    this._streaming.abortController.abort();

    if (this._streaming.content) {
      const chat = this.historyManager.getCurrentConversation();
      if (chat) { this.historyManager.addMessage(chat.id, { role: 'assistant', content: this._streaming.content + '\n\n*[Stopped]*' }); }
    }

    this._post({ type: 'streamEnd', messageId: this._streaming.messageId, stopped: true });
    this._streaming = null;
  }

  private async _retry(): Promise<void> {
    if (this._retryCount >= 3) { vscode.window.showErrorMessage('Maximum retry attempts reached'); return; }
    const chat = this.historyManager.getCurrentConversation();
    if (!chat) { return; }
    const lastUser = [...chat.messages].reverse().find(m => m.role === 'user');
    if (lastUser) { this._retryCount++; await this._send(lastUser.content, lastUser.context); }
  }

  /**
   * Feature 5 — Retry a specific AI message with a different model.
   * The requested `model` ID is stashed on the provider before we call
   * `_send`; `_send` picks it up for this single request and then clears it.
   */
  private async _handleRetryWithModel(messageId: string, model: string): Promise<void> {
    const chat = this.historyManager.getCurrentConversation();
    if (!chat) { return; }
    // Find the user turn that produced the target assistant message
    const targetIdx = chat.messages.findIndex(m => m.id === messageId);
    const priorUser = targetIdx > 0
      ? [...chat.messages.slice(0, targetIdx)].reverse().find(m => m.role === 'user')
      : [...chat.messages].reverse().find(m => m.role === 'user');
    if (!priorUser) { return; }
    this._retryCount = Math.min(this._retryCount, 2);
    this._overrideModel = model;
    try {
      await this._send(priorUser.content, priorUser.context);
    } finally {
      this._overrideModel = undefined;
    }
  }

  private _isRetryable(error: unknown): boolean {
    if (!(error instanceof Error)) { return false; }
    const m = error.message.toLowerCase();
    return m.includes('timeout') || m.includes('network') || m.includes('connection') || m.includes('503') || m.includes('502') || m.includes('429');
  }

  private _buildContext(msgCtx?: MessageContext): ChatContext {
    const ctx: ChatContext = {};
    const editor = vscode.window.activeTextEditor;
    if (msgCtx?.file) { ctx.currentFile = msgCtx.file; }
    if (msgCtx?.selection?.text) { ctx.selectedText = msgCtx.selection.text; }
    if (!ctx.currentFile && editor) { ctx.currentFile = vscode.workspace.asRelativePath(editor.document.uri); }
    if (!ctx.selectedText && editor && !editor.selection.isEmpty) {
      ctx.selectedText = editor.document.getText(editor.selection);
      ctx.cursorPosition = { line: editor.selection.start.line + 1, column: editor.selection.start.character };
    }
    return ctx;
  }

  private async _buildEnhancedContext(msgCtx?: MessageContext): Promise<ChatContext> {
    // Start with basic context
    const ctx = this._buildContext(msgCtx);

    // Enhance with ContextProvider data
    try {
      const richContext = await this._contextProvider.getContext({
        includeSelection: true,
        includeSurrounding: true,
        includeDiagnostics: true,
        includeSymbols: true,
      });

      // Add surrounding content and symbol info to enrich the context
      if (richContext.activeFile) {
        if (!ctx.currentFile) {
          ctx.currentFile = richContext.activeFile.relativePath;
        }
        if (!ctx.selectedText && richContext.activeFile.selectedContent) {
          ctx.selectedText = richContext.activeFile.selectedContent;
        }
        if (!ctx.cursorPosition && richContext.activeFile.cursorLine) {
          ctx.cursorPosition = {
            line: richContext.activeFile.cursorLine,
            column: richContext.activeFile.cursorColumn,
          };
        }
      }
    } catch (error) {
      Logger.debug('Enhanced context failed, using basic context:', error);
    }

    return ctx;
  }

  // ============ Mention Handling ============

  private async _handleMentionSuggestions(context: { query: string; type: string | null }): Promise<void> {
    try {
      const mentionCtx: MentionContext = {
        query: context.query,
        type: context.type as any,
        startIndex: 0,
        isComplete: false,
      };
      const suggestions = await mentionProvider.getSuggestions(mentionCtx);
      this._post({
        type: 'mentionSuggestions',
        suggestions: suggestions.map(s => ({
          type: s.type, value: s.value, displayName: s.displayName,
          description: s.description, icon: s.icon, detail: s.detail,
          insertText: s.insertText, sortOrder: s.sortOrder,
        })),
      });
    } catch (error) {
      Logger.error('Failed to get mention suggestions:', error);
      this._post({ type: 'mentionSuggestions', suggestions: [] });
    }
  }

  /** Phase 28 — Suggested Files: debounced handler for user input changes */
  private async _handleInputChanged(text: string): Promise<void> {
    if (!vscode.workspace.getConfiguration('inaCoding.context').get<boolean>('suggestedFiles', true)) return;
    if (this._suggestDebounce) clearTimeout(this._suggestDebounce);
    this._suggestDebounce = setTimeout(async () => {
      try {
        const currentFile = vscode.window.activeTextEditor?.document.uri.fsPath;
        const suggestions = await this._suggestedFilesProvider.getSuggestedFiles(currentFile, text || '');
        this._post({ type: 'suggestedFiles', files: suggestions });
      } catch { this._post({ type: 'suggestedFiles', files: [] }); }
    }, 500);
  }

  private async _handleResolveMentions(mentions: any[]): Promise<void> {
    try {
      const resolved = await Promise.all(
        mentions.map(async (m) => {
          const resolution = await mentionProvider.resolveMention(m);
          return { ...m, resolved: resolution };
        })
      );
      this._post({ type: 'mentionsResolved', mentions: resolved });
    } catch (error) {
      Logger.error('Failed to resolve mentions:', error);
    }
  }

  // ============ Active Context ============

  private _sendActiveContext(ctx: ActiveChatContext): void {
    this._post({
      type: 'activeContext',
      context: {
        activeFile: ctx.activeFile ? {
          path: ctx.activeFile.path,
          relativePath: ctx.activeFile.relativePath,
          fileName: ctx.activeFile.fileName,
          language: ctx.activeFile.language,
          cursorLine: ctx.activeFile.cursorLine,
          cursorColumn: ctx.activeFile.cursorColumn,
          selectionRange: ctx.activeFile.selectionRange,
          selectedContent: ctx.activeFile.selectedContent,
          surroundingContent: ctx.activeFile.surroundingContent,
          isDirty: ctx.activeFile.isDirty,
          lineCount: ctx.activeFile.lineCount,
          currentSymbol: ctx.activeFile.currentSymbol,
          symbolPath: ctx.activeFile.symbolPath,
        } : null,
        diagnostics: ctx.diagnostics,
        workspace: ctx.workspace ? {
          name: ctx.workspace.name,
          openFiles: ctx.workspace.openFiles,
        } : undefined,
      },
    });
  }

  public getContextProvider(): ContextProvider {
    return this._contextProvider;
  }

  // ============ Data ============

  private _sendHistory(): void {
    const conversations = this.historyManager.getRecentConversations(50);
    this._post({
      type: 'loadHistory',
      conversations: conversations.map(c => ({
        id: c.id, title: c.title, updatedAt: c.updatedAt,
        messageCount: c.messages.length, pinned: c.pinned,
        archived: c.archived, tags: c.tags,
      })),
    });
  }

  private _loadCurrent(): void {
    const chat = this.historyManager.getCurrentConversation();
    if (chat) { this._post({ type: 'loadConversation', conversation: chat }); }
  }

  private async _exportConversation(id: string): Promise<void> {
    try {
      const content = await this.historyManager.export({
        format: 'markdown', includeMetadata: false,
        includeContext: true, conversationIds: [id],
      });
      const conv = this.historyManager.getConversation(id);
      const filename = conv ? conv.title.replace(/[^a-z0-9]/gi, '_') : 'conversation';
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${filename}.md`),
        filters: { 'Markdown': ['md'] },
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage('Conversation exported');
      }
    } catch (error) {
      Logger.error('Export failed:', error);
    }
  }

  // ============ Feature 1 — Fork Conversation ============

  /**
   * Fork the current conversation from the clicked message: copies messages
   * up to and including the given message ID into a brand-new conversation,
   * switches to it, and pushes the new history to the webview.
   */
  private async _handleForkConversation(messageId: string): Promise<void> {
    try {
      const source = this.historyManager.getCurrentConversation();
      if (!source) { return; }
      const idx = source.messages.findIndex(m => m.id === messageId);
      if (idx < 0) {
        vscode.window.showWarningMessage('INA-7 Pro: message not found to fork from');
        return;
      }
      const forkedMessages = source.messages.slice(0, idx + 1);
      const forked = this.historyManager.createConversation(
        `Fork of ${source.title} — ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      );
      for (const msg of forkedMessages) {
        this.historyManager.addMessage(forked.id, {
          role: msg.role,
          content: msg.content,
          context: msg.context,
        });
      }
      this.historyManager.setCurrentConversation(forked.id);
      this._loadCurrent();
      this._sendHistory();
      this._post({ type: 'chatForked', conversationId: forked.id });
      vscode.window.showInformationMessage(`INA-7 Pro · Forked conversation (${forkedMessages.length} messages)`);
    } catch (error) {
      Logger.error('Fork conversation failed:', error);
    }
  }

  // ============ Feature 2 — Copy as Markdown ============

  /**
   * Format a single message (or the full visible transcript if messageId is
   * empty) as clean Markdown and copy it to the clipboard via vscode.env.
   */
  private async _handleCopyAsMarkdown(messageId: string): Promise<void> {
    const conv = this.historyManager.getCurrentConversation();
    if (!conv) { return; }
    const msg = conv.messages.find(m => m.id === messageId);
    if (!msg) {
      vscode.window.showWarningMessage('INA-7 Pro: message not found');
      return;
    }
    const md = this._formatMessageAsMarkdown(msg);
    await vscode.env.clipboard.writeText(md);
    vscode.window.showInformationMessage('INA-7 Pro · Copied as Markdown');
  }

  private _formatMessageAsMarkdown(msg: { role: string; content: string; timestamp?: number }): string {
    const header = msg.role === 'user' ? '**You**' : '**INA-7 Pro**';
    const timestamp = msg.timestamp ? ` · ${new Date(msg.timestamp).toLocaleString()}` : '';
    // content is assumed to be markdown already (from the model); we just
    // wrap it with a header and trailing rule so it pastes cleanly.
    return `${header}${timestamp}\n\n${msg.content.trim()}\n\n---\n`;
  }

  // ============ Feature 3 — Add code selection to chat ============

  /**
   * Invoked from the editor/context menu command `inaCoding.addToChat`.
   * Pushes the selected code + filename to the chat webview as a prefilled
   * code block in the input box.
   */
  public addCodeToChat(code: string, language: string, fileName: string): void {
    this._post({ type: 'addCodeToChat', code, language, fileName });
    // Ensure the chat panel is visible
    vscode.commands.executeCommand('inaCodingChat.focus').then(undefined, () => {});
  }

  // ============ Feature 4 — Drop files onto chat ============

  /**
   * Reads the dropped file URIs (sent from the webview drag-drop handler),
   * caps each file at MAX_DROP_FILE_BYTES, and pushes the contents back to
   * the webview so the user sees filename + content chips in the input.
   */
  private async _handleDropFiles(uriList: string[]): Promise<void> {
    const MAX_DROP_FILES = 10;
    const MAX_DROP_FILE_BYTES = 10 * 1024; // 10 KB per file
    const payloads: { name: string; relativePath: string; content: string; language: string; truncated: boolean }[] = [];
    for (const uri of uriList.slice(0, MAX_DROP_FILES)) {
      try {
        const parsed = vscode.Uri.parse(uri);
        const stat = await vscode.workspace.fs.stat(parsed);
        if (stat.type !== vscode.FileType.File) { continue; }
        const buf = await vscode.workspace.fs.readFile(parsed);
        const truncated = buf.byteLength > MAX_DROP_FILE_BYTES;
        const slice = truncated ? buf.slice(0, MAX_DROP_FILE_BYTES) : buf;
        const content = Buffer.from(slice).toString('utf8');
        const doc = await vscode.workspace.openTextDocument(parsed).then(d => d, () => null);
        payloads.push({
          name: path.basename(parsed.fsPath),
          relativePath: vscode.workspace.asRelativePath(parsed),
          content,
          language: doc?.languageId ?? 'plaintext',
          truncated,
        });
      } catch (err) {
        Logger.warn(`[dropFiles] failed to read ${uri}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this._post({ type: 'filesDropped', files: payloads });
  }

  // ============ Feature 5 — Available models + retry with different model ============

  private _getAvailableModels(): { id: string; label: string; description?: string }[] {
    // Primary list — surfaced as "INA-7 Pro (...)" so the user never sees
    // upstream vendor names. Resolved to real model IDs server-side.
    const configured = ConfigManager.getAll().models;
    const models = [
      { id: 'ina-7-pro-code', label: 'INA-7 Pro (Code)', description: 'Best for code generation and refactoring' },
      { id: 'ina-7-pro-chat', label: 'INA-7 Pro (Chat)', description: 'Best for general questions and explanations' },
      { id: 'ina-7-lite',     label: 'INA-7 Lite',        description: 'Faster but less capable — use for quick questions' },
    ];
    // If the user has a custom model configured, offer it too.
    if (configured?.customChat && !models.find(m => m.id === configured.customChat)) {
      models.push({ id: configured.customChat, label: `Custom · ${configured.customChat}`, description: 'User-configured model' });
    }
    return models;
  }

  private _sendAvailableModels(): void {
    this._post({ type: 'availableModels', models: this._getAvailableModels() });
  }

  private _sendConfig(): void { this._post({ type: 'config', config: ConfigManager.getAll() }); }

  // ============ Code Operations ============

  private async _insertCode(code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    await editor.edit(b => { editor.selection.isEmpty ? b.insert(editor.selection.active, code) : b.replace(editor.selection, code); });
  }

  private async _openFile(filePath: string): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) { return; }
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(ws.uri, filePath));
      await vscode.window.showTextDocument(doc);
    } catch (error) { Logger.error('Failed to open file:', error); }
  }

  // ============ File Operations ============

  private _sendOpenFiles(): void {
    const openEditors = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .filter(t => t.input instanceof vscode.TabInputText)
      .map(t => {
        const input = t.input as vscode.TabInputText;
        return { path: vscode.workspace.asRelativePath(input.uri), name: input.uri.path.split('/').pop() || '', isOpen: true };
      });
    this._post({ type: 'openFiles', files: openEditors });
  }

  private async _sendWorkspaceFiles(query: string): Promise<void> {
    try {
      const pattern = query ? `**/*${query}*` : '**/*.{js,ts,jsx,tsx,py,go,rs,java,cpp,c,h,html,css,json,yaml,yml,md}';
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
      this._post({ type: 'workspaceFiles', files: files.map(f => ({ path: vscode.workspace.asRelativePath(f), name: f.path.split('/').pop() || '', isOpen: false })) });
    } catch (error) { Logger.error('Failed to get workspace files:', error); }
  }

  private async _sendFileContent(filePath: string): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) { return; }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(ws.uri, filePath));
      this._post({ type: 'fileContent', path: filePath, content: doc.getText() });
    } catch (error) {
      Logger.error('Failed to get file content:', error);
      this._post({ type: 'applyError', error: `Failed to read file: ${filePath}` });
    }
  }

  private async _applyCodeToFile(filePath: string, code: string): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) { throw new Error('No workspace folder'); }
      const fullPath = vscode.Uri.joinPath(ws.uri, filePath);
      const doc = await vscode.workspace.openTextDocument(fullPath);
      const editor = await vscode.window.showTextDocument(doc);
      const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
      await editor.edit(b => b.replace(fullRange, code));
      await doc.save();
      this._post({ type: 'applySuccess', path: filePath });
      vscode.window.showInformationMessage(`Applied changes to ${filePath}`);

      // Phase 16.6 — auto-format after apply
      try {
        const formatResult = await AutoFormatService.getInstance().formatAfterApply(fullPath.fsPath);
        if (formatResult.success && formatResult.changesApplied) {
          this._post({ type: 'autoFormatResult', filePath: fullPath.fsPath, result: formatResult });
        }
      } catch (e) {
        Logger.warn(`[AutoFormat] post-apply failed: ${String(e)}`);
      }
    } catch (error) {
      Logger.error('Failed to apply code:', error);
      this._post({ type: 'applyError', error: error instanceof Error ? error.message : 'Failed to apply' });
    }
  }

  private async _createFileWithCode(code: string, language: string, suggestedFilename?: string): Promise<void> {
    const exts: Record<string, string> = { javascript: 'script.js', typescript: 'script.ts', python: 'script.py', rust: 'main.rs', go: 'main.go', java: 'Main.java', html: 'index.html', css: 'styles.css' };
    const filename = await vscode.window.showInputBox({ prompt: 'Enter filename', value: suggestedFilename || exts[language] || 'file.txt' });
    if (filename) { await this._createNewFile(filename, code); }
  }

  private async _createNewFile(filename: string, code: string): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) { throw new Error('No workspace folder'); }
      const uri = vscode.Uri.joinPath(ws.uri, filename);
      try {
        await vscode.workspace.fs.stat(uri);
        const overwrite = await vscode.window.showWarningMessage(`${filename} exists. Overwrite?`, { modal: true }, 'Overwrite');
        if (overwrite !== 'Overwrite') { return; }
      } catch { /* doesn't exist */ }
      await vscode.workspace.fs.writeFile(uri, Buffer.from(code, 'utf8'));
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      this._post({ type: 'fileCreated', path: filename });
      vscode.window.showInformationMessage(`Created ${filename}`);
    } catch (error) {
      Logger.error('Failed to create file:', error);
      this._post({ type: 'applyError', error: error instanceof Error ? error.message : 'Failed to create file' });
    }
  }

  // ============ Review Events ============

  private _wireReviewEvents(): void {
    this._reviewService.on('review-started', (session: any) => {
      this._post({ type: 'reviewStarted', session });
      vscode.commands.executeCommand('setContext', 'inaCoding.reviewPending', true);
    });
    this._reviewService.on('review-updated', (data: any) => {
      this._post({ type: 'reviewUpdated', changes: data.changes, progress: data.progress });
    });
    this._reviewService.on('review-summary-ready', (summary: any) => {
      this._post({ type: 'reviewSummaryReady', summary });
    });
    this._reviewService.on('review-completed', (data: any) => {
      this._post({ type: 'reviewCompleted', decision: data.decision, status: data.status });
      vscode.commands.executeCommand('setContext', 'inaCoding.reviewPending', false);
    });
    this._reviewService.on('undo-performed', (result: any) => {
      this._post({ type: 'undoPerformed', result });
      vscode.commands.executeCommand('setContext', 'inaCoding.reviewPending', false);
    });
  }

  // ============ Composer Events (Phase 16.1) ============

  private _wireComposerEvents(): void {
    this._composerManager.onSessionChanged((session) => {
      this._post({ type: 'composerSessionUpdated', session: toSessionView(session) });
    });
    this._composerManager.onStatusChanged((event) => {
      this._post({
        type: 'composerStatusChanged',
        sessionId: event.sessionId,
        status: event.status,
        previousStatus: event.previousStatus,
      });
      vscode.commands.executeCommand('setContext', 'inaCoding.composerActive', true);
    });
    this._composerManager.onFileChanged((event) => {
      this._post({
        type: 'composerFileChanged',
        sessionId: event.sessionId,
        fileChange: event.fileChange,
        changeType: event.changeType,
      });
    });
    this._composerManager.onCheckpointCreated((event) => {
      this._post({
        type: 'composerCheckpointCreated',
        sessionId: event.sessionId,
        checkpoint: {
          ...event.checkpoint,
          fileSnapshots: Object.fromEntries(event.checkpoint.fileSnapshots.entries()),
        },
      });
    });
    this._composerManager.onProgressUpdate((event) => {
      this._post({
        type: 'composerProgressUpdate',
        sessionId: event.sessionId,
        stepIndex: event.stepIndex,
        totalSteps: event.totalSteps,
        currentStepDescription: event.currentStepDescription,
        status: event.status,
        percentComplete: event.percentComplete,
      });
    });
  }

  // ============ MCP Events (Phase 16.2) ============

  private _wireMCPEvents(): void {
    const client = MCPClient.getInstance();
    client.onServerStatusChanged(() => {
      this._post({ type: 'mcpServersChanged', servers: client.getServerStatuses() });
    });
    client.onToolsChanged((tools) => {
      this._post({ type: 'mcpToolsChanged', tools });
    });
  }

  // ============ Notepad Events (Phase 16.4) ============

  private _wireNotepadEvents(): void {
    NotepadManager.getInstance().onNotepadsChanged((notepads) => {
      this._post({ type: 'notepadsChanged', notepads });
    });
  }

  // ============ Terminal Events ============

  private _wireTerminalEvents(): void {
    this._terminalService.on('command-start', (data: any) => {
      this._post({ type: 'terminalCommandStart', execution: data });
      vscode.commands.executeCommand('setContext', 'inaCoding.terminalRunning', true);
    });
    this._terminalService.on('command-output', (data: any) => {
      this._post({ type: 'terminalCommandOutput', executionId: data.id, line: data.line });
    });
    this._terminalService.on('command-complete', (data: any) => {
      this._post({ type: 'terminalCommandComplete', execution: data });
      vscode.commands.executeCommand('setContext', 'inaCoding.terminalRunning', false);
      const hasErrors = data.parsedResult?.errors?.length > 0;
      vscode.commands.executeCommand('setContext', 'inaCoding.hasTerminalErrors', hasErrors);
    });
    this._terminalService.on('auto-fix-start', (data: any) => {
      this._post({ type: 'terminalAutoFixStart', errorCount: data.errorCount });
    });
    this._terminalService.on('auto-fix-complete', (data: any) => {
      this._post({ type: 'terminalAutoFixComplete', result: data });
    });
  }

  private async _handleRunTerminalCommand(command: string): Promise<void> {
    if (!command.trim()) return;
    try {
      await this._terminalService.runCommand(command, { autoFix: ConfigManager.get<boolean>('terminal.autoFix', true) });
    } catch (error) {
      Logger.error('Terminal command failed:', error);
    }
  }

  private async _handleAutoFix(errors: any[]): Promise<void> {
    try {
      const { AutoFixEngine } = require('../services/agent/terminal/AutoFixEngine');
      const engine = AutoFixEngine.getInstance();
      engine.setApiService(this.apiService);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      await engine.attemptAutoFix({ errors, sessionId: `autofix_${Date.now()}`, maxAttempts: 3, strategy: 'batch' as any }, workspaceRoot);
    } catch (error) {
      Logger.error('Auto-fix failed:', error);
    }
  }

  private async _handleQuickCommand(category: string): Promise<void> {
    try {
      switch (category) {
        case 'install': await this._terminalService.runInstall(); break;
        case 'build': await this._terminalService.runBuild(); break;
        case 'test': await this._terminalService.runTests(); break;
        case 'lint': await this._terminalService.runLint(); break;
        case 'typecheck': await this._terminalService.runTypeCheck(); break;
        case 'format': await this._terminalService.runFormat(); break;
        default: Logger.warn(`Unknown quick command category: ${category}`);
      }
    } catch (error) {
      Logger.error('Quick command failed:', error);
    }
  }

  private async _openFileAtLine(filePath: string, line: number): Promise<void> {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (!ws) return;
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(ws.uri, filePath));
      const editor = await vscode.window.showTextDocument(doc);
      const position = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      Logger.error('Failed to open file at line:', error);
    }
  }

  // ============ File Ops Events ============

  private _wireFileOpsEvents(): void {
    this._multiFileOrchestrator.on('batch-start', (data: any) => {
      this._post({ type: 'fileOpsStarted', batch: data });
    });
    this._multiFileOrchestrator.on('import-updates', (updates: any) => {
      this._post({ type: 'importUpdates', updates });
    });
    this._multiFileOrchestrator.on('batch-complete', (data: any) => {
      if (data.batch) {
        this._post({ type: 'fileOpsStarted', batch: data.batch });
      }
    });
  }

  private async _handleRevertAllOps(): Promise<void> {
    try {
      const batch = this._multiFileOrchestrator.getActiveBatch();
      if (batch) {
        await this._multiFileOrchestrator.revertBatch(batch.id);
        Logger.info('All file operations reverted');
      }
    } catch (error) {
      Logger.error('Failed to revert file operations:', error);
    }
  }

  private async _handleViewFileDiff(operationId: string): Promise<void> {
    try {
      const batch = this._multiFileOrchestrator.getActiveBatch();
      if (!batch) return;
      const op = batch.operations.find((o: any) => o.id === operationId);
      if (!op) return;
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) return;
      const fileUri = vscode.Uri.joinPath(ws.uri, op.sourcePath);
      // Open diff editor showing the file (current state)
      await vscode.commands.executeCommand('vscode.open', fileUri);
    } catch (error) {
      Logger.error('Failed to open file diff:', error);
    }
  }

  // ============ Execution Events ============

  private _wireExecutionEvents(): void {
    this._executionEngine.on('execution-start', (data: any) => {
      this._post({ type: 'executionStart', sessionId: data.sessionId, totalSteps: data.totalSteps });
      vscode.commands.executeCommand('setContext', 'inaCoding.executionActive', true);
      vscode.commands.executeCommand('setContext', 'inaCoding.executionPaused', false);
    });

    this._executionEngine.on('step-start', (data: any) => {
      this._post({ type: 'stepStart', stepId: data.stepId, index: data.index, description: data.description });
    });

    this._executionEngine.on('step-complete', (data: any) => {
      this._post({ type: 'stepComplete', stepId: data.stepId, result: data.result });
    });

    this._executionEngine.on('step-failed', (data: any) => {
      this._post({ type: 'stepFailed', stepId: data.stepId, error: data.error });
    });

    this._executionEngine.on('step-skipped', (data: any) => {
      this._post({ type: 'stepSkipped', stepId: data.stepId, reason: data.reason });
    });

    this._executionEngine.on('step-progress', (data: any) => {
      const progress = this._executionEngine.getProgress();
      this._post({ type: 'executionProgress', progress, state: this._executionEngine.getState() });
    });

    this._executionEngine.on('execution-pause', () => {
      vscode.commands.executeCommand('setContext', 'inaCoding.executionPaused', true);
      const progress = this._executionEngine.getProgress();
      this._post({ type: 'executionProgress', progress, state: 'paused' });
    });

    this._executionEngine.on('execution-resume', () => {
      vscode.commands.executeCommand('setContext', 'inaCoding.executionPaused', false);
    });

    this._executionEngine.on('execution-complete', () => {
      vscode.commands.executeCommand('setContext', 'inaCoding.executionActive', false);
      // Auto-start review after execution completes
      if (ConfigManager.get<boolean>('review.autoStart', true)) {
        const session = this._agentSessionManager.getActiveSession();
        if (session) {
          const { RollbackManager } = require('../services/agent/execution/RollbackManager');
          this._reviewService.startReview(session, RollbackManager.getInstance()).catch((err: any) => {
            Logger.error('Auto-start review failed:', err);
          });
        }
      }
    });

    this._executionEngine.on('execution-failed', () => {
      vscode.commands.executeCommand('setContext', 'inaCoding.executionActive', false);
    });

    this._executionEngine.on('execution-cancelled', () => {
      vscode.commands.executeCommand('setContext', 'inaCoding.executionActive', false);
    });

    this._executionEngine.on('rollback-start', () => {
      this._post({ type: 'rollbackStart' });
    });

    this._executionEngine.on('rollback-complete', () => {
      this._post({ type: 'rollbackComplete', success: true });
    });
  }

  // ============ Plan Handling ============

  private _handleApprovePlan(): void {
    const approved = this._planningService.approvePlan();
    if (approved) {
      this._post({ type: 'agentPlanUpdate', updates: { approved: true } });
      Logger.info('Plan approved by user');

      // Start execution
      const session = this._agentSessionManager.getActiveSession();
      if (session) {
        this._agentSessionManager.updateSessionStatus(session.id, 'executing' as any);
        const config = {
          ...DEFAULT_EXECUTION_CONFIG,
          retryFailedSteps: ConfigManager.get<boolean>('agent.retryFailedSteps', true),
          maxRetries: ConfigManager.get<number>('agent.maxRetries', 2),
          pauseOnError: ConfigManager.get<boolean>('agent.pauseOnError', true),
          pauseBetweenSteps: ConfigManager.get<boolean>('agent.pauseBetweenSteps', false),
          stepTimeoutMs: ConfigManager.get<number>('agent.stepTimeout', 120000),
          requireApprovalPerStep: ConfigManager.get<boolean>('agent.requireApprovalPerStep', false),
        };
        this._executionEngine.executePlan(approved, session, config).then((result) => {
          const status = result.success ? 'completed' : 'failed';
          this._agentSessionManager.endSession(session.id, status);
          this._post({ type: result.success ? 'executionComplete' : 'executionFailed', result: {
            sessionId: result.sessionId, success: result.success, state: result.state,
            completedSteps: result.completedSteps, failedSteps: result.failedSteps,
            skippedSteps: result.skippedSteps, totalSteps: result.totalSteps,
            duration: result.duration, filesChanged: result.filesChanged,
            rollbackPerformed: result.rollbackPerformed, summary: result.summary,
          }});
        }).catch((err) => {
          Logger.error('Execution failed:', err);
          this._agentSessionManager.endSession(session.id, 'failed');
        });
      }
    }
  }

  private _handleRejectPlan(): void {
    this._planningService.rejectPlan();
    this._post({ type: 'agentPlanUpdate', updates: { approved: false } });
    Logger.info('Plan rejected by user');
  }

  /**
   * Phase 18.5 — "Run in Background" handler.
   * Serializes the current plan and submits it to the backend's async
   * execution engine. The user can close VS Code and return later.
   */
  private async _handleRunInBackground(): Promise<void> {
    try {
      const session = this._agentSessionManager.getActiveSession();
      const plan = this._planningService.getCurrentPlan?.();
      const taskDescription =
        session?.prompt ?? plan?.description ?? 'INA-7 Pro background task';

      // Serialize the current plan into the AsyncTaskGraph shape understood
      // by the backend's AsyncExecutionEngine.
      let taskGraph: any = null;
      if (plan?.steps?.length) {
        const steps = plan.steps;
        taskGraph = {
          version: 1,
          description: taskDescription,
          tasks: steps.map((step, i) => ({
            id: step.id || `t${i + 1}`,
            description: step.description ?? '',
            requiredRole: 'coder',
            dependencies: i > 0 ? [steps[i - 1].id || `t${i}`] : [],
            priority: 10 - i,
            status: 'pending',
            result: null,
            error: null,
            retries: 0,
            tokensUsed: 0,
            startedAt: null,
            completedAt: null,
            metadata: {
              filePath: (step as any).filePath ?? null,
            },
          })),
          createdAt: Date.now(),
        };
      }

      // Singleton — extension.ts has already wired in the AuthService
      const client = AsyncSessionClient.getInstance();
      const created = await client.startAsync(taskDescription, {
        taskGraph,
        notifyOnComplete: true,
      });

      this._post({
        type: 'asyncSessionStarted',
        sessionId: created.id,
        taskDescription: created.taskDescription,
      });

      vscode.window.showInformationMessage(
        `INA-7 Pro · Running in background — session ${created.id.substring(0, 8)}. You can close VS Code; results will be ready when you return.`
      );
    } catch (e: any) {
      Logger.error('[Async] runInBackground failed:', e);
      vscode.window.showErrorMessage(
        `INA-7 Pro · Failed to start background task: ${e?.message ?? String(e)}`
      );
    }
  }

  private async _handleRevisePlan(feedback: string): Promise<void> {
    try {
      const response = await this._planningService.revisePlan(feedback);
      const plan = response.plan;
      this._post({
        type: 'agentPlanReady',
        plan: {
          description: plan.description,
          steps: plan.steps.map((s) => ({
            id: s.id,
            type: s.type,
            filePath: s.filePath,
            description: s.description,
            status: s.status,
            risk: (s as any).risk,
            dependencies: (s as any).dependencies,
            details: (s as any).details,
            targetPath: (s as any).targetPath,
          })),
          affectedFiles: plan.affectedFiles,
          estimatedTime: plan.estimatedTime,
          approved: plan.approved,
          reasoning: response.reasoning,
          warnings: response.warnings,
        },
      });
    } catch (error) {
      Logger.error('Plan revision failed:', error);
      this._post({
        type: 'streamError',
        messageId: '',
        error: `Plan revision failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: false,
      });
    }
  }

  async generatePlan(prompt: string): Promise<void> {
    const config = this._planningService.getConfig();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    // Gather workspace context
    let workspaceFiles: string[] = [];
    try {
      const files = await vscode.workspace.findFiles(
        '**/*.{ts,tsx,js,jsx,py,go,rs,java,json}',
        '**/node_modules/**',
        50
      );
      workspaceFiles = files.map((f) => vscode.workspace.asRelativePath(f));
    } catch { /* ignore */ }

    const editor = vscode.window.activeTextEditor;
    const currentFile = editor ? vscode.workspace.asRelativePath(editor.document.uri) : undefined;
    const currentFileContent = editor ? editor.document.getText() : undefined;
    const selection = editor && !editor.selection.isEmpty
      ? editor.document.getText(editor.selection)
      : undefined;

    try {
      const response = await this._planningService.generatePlan({
        prompt,
        context: {
          workspaceRoot,
          workspaceFiles,
          currentFile,
          currentFileContent,
          selection,
        },
        agentConfig: config,
        sessionId: this._agentSessionManager.getActiveSession()?.id || '',
      });

      const plan = response.plan;
      const estimate = this._planningService.getEstimate();

      this._post({
        type: 'agentPlanReady',
        plan: {
          description: plan.description,
          steps: plan.steps.map((s) => ({
            id: s.id,
            type: s.type,
            filePath: s.filePath,
            description: s.description,
            status: s.status,
            risk: (s as any).risk,
            dependencies: (s as any).dependencies,
            details: (s as any).details,
            targetPath: (s as any).targetPath,
          })),
          affectedFiles: plan.affectedFiles,
          estimatedTime: plan.estimatedTime,
          approved: plan.approved,
          reasoning: response.reasoning,
          warnings: response.warnings,
          estimate: estimate ? {
            complexity: estimate.complexity,
            riskLevel: estimate.riskLevel,
            requiresTests: estimate.requiresTests,
          } : undefined,
        },
      });
    } catch (error) {
      Logger.error('Plan generation failed:', error);
      this._post({
        type: 'streamError',
        messageId: '',
        error: `Plan generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        retryable: true,
      });
    }
  }

  // ============ Public ============

  public focusInput(): void { this._post({ type: 'focusInput' }); this._view?.show?.(true); }
  public clearChat(): void { const c = this.historyManager.getCurrentConversation(); if (c) { this.historyManager.clearChat(c.id); } this._post({ type: 'clearChat' }); }
  public addContext(ctx: MessageContext): void { this._post({ type: 'context', context: ctx }); }
  public dispose(): void { this._contextProvider?.dispose(); }

  private _post(msg: unknown): void { this._view?.webview.postMessage(msg); }

  // ============ HTML ============

  private _getHtml(webview: vscode.Webview): string {
    const distPath = path.join(this._extensionUri.fsPath, 'webview-ui', 'dist');
    try {
      if (fs.existsSync(path.join(distPath, 'assets'))) {
        const files = fs.readdirSync(path.join(distPath, 'assets'));
        const jsFile = files.find(f => f.endsWith('.js'));
        const cssFile = files.find(f => f.endsWith('.css'));
        if (jsFile) {
          const wvUri = vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist');
          const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(wvUri, 'assets', jsFile));
          const styleUri = cssFile ? webview.asWebviewUri(vscode.Uri.joinPath(wvUri, 'assets', cssFile)) : null;
          const nonce = this._nonce();
          const apiEndpoint = ConfigManager.getApiEndpoint();
          let connectSrc = apiEndpoint;
          try { connectSrc = new URL(apiEndpoint).origin; } catch { /* keep as-is */ }
          return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; connect-src ${connectSrc} http://localhost:3200 ws://localhost:3200;">${styleUri ? `<link href="${styleUri}" rel="stylesheet">` : ''}<title>INA Coding</title></head><body><div id="root"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
        }
      }
    } catch (e) { Logger.error('Failed to load webview:', e); }

    const nonce = this._nonce();
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"><title>INA Coding</title><style>body{font-family:var(--vscode-font-family);padding:20px;color:var(--vscode-foreground);background:var(--vscode-sideBar-background);display:flex;align-items:center;justify-content:center;height:90vh;text-align:center}.spinner{width:40px;height:40px;border:3px solid var(--vscode-button-background);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}@keyframes spin{to{transform:rotate(360deg)}}p{color:var(--vscode-descriptionForeground);font-size:13px}</style></head><body><div><div class="spinner"></div><h2>Loading INA Coding...</h2><p>Building chat interface...</p></div><script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.postMessage({type:'ready'});</script></body></html>`;
  }

  // ============ Vision Handlers ============

  private async _handlePasteImage(): Promise<void> {
    try {
      const image = await ImageCaptureService.getInstance().captureFromClipboard();
      if (image) this._post({ type: 'imageProcessed', image });
      else vscode.window.showInformationMessage('No image found in clipboard');
    } catch (e) { Logger.warn('Paste image failed:', e); }
  }

  private async _handleUploadImages(): Promise<void> {
    try {
      const images = await ImageCaptureService.getInstance().captureFromFile();
      for (const img of images) this._post({ type: 'imageProcessed', image: img });
    } catch (e) { Logger.warn('Upload images failed:', e); }
  }

  private async _handleCaptureScreenshot(): Promise<void> {
    try {
      const image = await ImageCaptureService.getInstance().captureScreenshot();
      if (image) this._post({ type: 'imageProcessed', image });
    } catch (e) { Logger.warn('Screenshot failed:', e); }
  }

  private async _handleAnalyzeImage(image: any, detailLevel?: string): Promise<void> {
    try {
      const analysis = await VisionClient.getInstance().analyzeImage(image, detailLevel || 'detailed');
      this._post({ type: 'visionAnalysisResult', analysis });
    } catch (e) { Logger.warn('Analyze image failed:', e); }
  }

  private async _handleDesignToCode(image: any, config: any, additionalInstructions?: string): Promise<void> {
    try {
      this._post({ type: 'designToCodeProgress', phase: 'generating' });
      let fullCode = '';
      for await (const progress of DesignToCodeService.getInstance().convertDesign(image, config)) {
        fullCode = progress.content;
        if (progress.phase === 'complete') {
          this._post({ type: 'designToCodeComplete', result: { code: fullCode, framework: config.framework, cssFramework: config.cssFramework, components: progress.components || [], dependencies: [] } });
        }
      }
    } catch (e) { Logger.warn('Design to code failed:', e); }
  }

  private async _handleInsertGeneratedCode(code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showInformationMessage('Open a file first'); return; }
    await editor.edit(edit => edit.insert(editor.selection.active, code));
  }

  private async _handleCreateComponentFiles(components: { name: string; code: string; filePath: string }[]): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!ws) return;
      const created = await DesignToCodeService.getInstance().applyGeneratedCode(components, ws);
      vscode.window.showInformationMessage(`Created ${created.length} component files`);
      if (created.length > 0) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(`${ws}/${created[0]}`));
        await vscode.window.showTextDocument(doc);
      }
    } catch (e) { Logger.warn('Create files failed:', e); }
  }

  // ============ LSP Handlers ============

  private async _handleRequestLSPContext(): Promise<void> {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const context = await LSPContextBuilder.getInstance().buildContextForChat(editor.document, editor.selection.active);
      this._post({ type: 'lspContextUpdated', context });
    } catch (e) { Logger.warn('LSP context failed:', e); }
  }

  private async _handleRequestDefinition(filePath: string, line: number, col: number): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = filePath.startsWith('/') ? filePath : `${ws}/${filePath}`;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      const defs = await DefinitionService.getInstance().getDefinition(doc, new vscode.Position(line, col));
      this._post({ type: 'lspDefinitionResult', definitions: defs });
    } catch (e) { Logger.warn('Definition request failed:', e); }
  }

  private async _handleRequestReferences(filePath: string, line: number, col: number): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = filePath.startsWith('/') ? filePath : `${ws}/${filePath}`;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      const refs = await ReferenceService.getInstance().findReferences(doc, new vscode.Position(line, col), false);
      this._post({ type: 'lspReferencesResult', references: refs });
    } catch (e) { Logger.warn('References request failed:', e); }
  }

  private async _handleRequestTypeInfo(filePath: string, line: number, col: number): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = filePath.startsWith('/') ? filePath : `${ws}/${filePath}`;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      const typeResult = await TypeInfoService.getInstance().getTypeAtPosition(doc, new vscode.Position(line, col));
      this._post({ type: 'lspTypeResult', typeInfo: typeResult });
    } catch (e) { Logger.warn('Type info request failed:', e); }
  }

  private async _handleRequestCallHierarchy(filePath: string, line: number, col: number): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = filePath.startsWith('/') ? filePath : `${ws}/${filePath}`;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      const hierarchy = await ReferenceService.getInstance().getCallHierarchy(doc, new vscode.Position(line, col), 'both', 2);
      this._post({ type: 'lspCallHierarchyResult', hierarchy });
    } catch (e) { Logger.warn('Call hierarchy request failed:', e); }
  }

  private async _handleNavigateToSymbol(filePath: string, line: number): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = filePath.startsWith('/') ? filePath : `${ws}/${filePath}`;
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch (e) { Logger.warn('Navigate to symbol failed:', e); }
  }

  private async _handleFixDiagnosticWithAI(diagnostic: any): Promise<void> {
    const content = `Fix this error:\n\nFile: ${diagnostic.filePath}\nLine: ${diagnostic.range?.startLine + 1}\nError: ${diagnostic.message}\n${diagnostic.code ? `Code: ${diagnostic.code}` : ''}`;
    await this._send(content);
  }

  private async _handleExplainSymbol(symbolName: string): Promise<void> {
    const content = `Explain the symbol \`${symbolName}\` in the current file. What is its type, purpose, and how is it used?`;
    await this._send(content);
  }

  private async _handleExplainDiagnostic(diagnostic: any): Promise<void> {
    const content = `Explain this error and how to fix it:\n\nFile: ${diagnostic.filePath}\nLine: ${diagnostic.range?.startLine + 1}\nError: ${diagnostic.message}\n${diagnostic.code ? `Code: ${diagnostic.code}` : ''}\n${diagnostic.source ? `Source: ${diagnostic.source}` : ''}`;
    await this._send(content);
  }

  // ============ Git Handlers ============

  private async _handleGitStatus(): Promise<void> {
    try {
      const status = await GitStatusService.getInstance().getStatus(true);
      this._post({ type: 'gitStatusUpdated', status });
    } catch (e) { Logger.warn('Git status failed:', e); }
  }

  private async _handleGitLog(offset?: number): Promise<void> {
    try {
      const commits = await GitLogService.getInstance().getLog({ maxCount: 20 });
      this._post({ type: 'gitCommitLog', commits, append: !!offset });
    } catch (e) { Logger.warn('Git log failed:', e); }
  }

  private async _handleGitBlame(filePath: string): Promise<void> {
    try {
      const blame = await GitBlameService.getInstance().getBlame(filePath);
      this._post({ type: 'gitBlameResult', blame: blame.lines });
    } catch (e) { Logger.warn('Git blame failed:', e); }
  }

  private async _handleGitDiff(filePath?: string): Promise<void> {
    try {
      const diffs = filePath
        ? [await GitDiffService.getInstance().getFileDiff(filePath)]
        : await GitDiffService.getInstance().getDiff();
      this._post({ type: 'gitDiffResult', diffs });
    } catch (e) { Logger.warn('Git diff failed:', e); }
  }

  private async _handleGitPR(): Promise<void> {
    try {
      const pr = await GitPRService.getInstance().getPRContext();
      this._post({ type: 'gitPRContext', pr });
    } catch (e) { Logger.warn('Git PR failed:', e); }
  }

  private async _handleSwitchBranch(branchName?: string): Promise<void> {
    try {
      if (branchName) {
        await GitBranchService.getInstance().switchBranch(branchName);
      } else {
        const branches = await GitBranchService.getInstance().listBranches();
        const items = branches.map(b => ({ label: b.isCurrent ? `* ${b.name}` : b.name, description: b.upstream || '' }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select branch' });
        if (selected) {
          const name = selected.label.replace(/^\* /, '');
          await GitBranchService.getInstance().switchBranch(name);
        }
      }
      await this._handleGitStatus();
    } catch (e) { Logger.warn('Branch switch failed:', e); }
  }

  private async _handleStageFile(filePath: string): Promise<void> {
    try {
      await GitStatusService.getInstance().stageFile(filePath);
      await this._handleGitStatus();
    } catch (e) { Logger.warn('Stage file failed:', e); }
  }

  private async _handleUnstageFile(filePath: string): Promise<void> {
    try {
      await GitStatusService.getInstance().unstageFile(filePath);
      await this._handleGitStatus();
    } catch (e) { Logger.warn('Unstage file failed:', e); }
  }

  private async _handleStageAll(): Promise<void> {
    try {
      await GitStatusService.getInstance().stageAll();
      await this._handleGitStatus();
    } catch (e) { Logger.warn('Stage all failed:', e); }
  }

  private async _handleOpenGitDiff(filePath: string): Promise<void> {
    try {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      const uri = vscode.Uri.file(`${ws}/${filePath}`);
      await vscode.commands.executeCommand('git.openChange', uri);
    } catch {
      try {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const uri = vscode.Uri.file(`${ws}/${filePath}`);
        await vscode.commands.executeCommand('vscode.open', uri);
      } catch (e) { Logger.warn('Open diff failed:', e); }
    }
  }

  // ============ Documentation Handlers ============

  private async _handleGetDocSources(): Promise<void> {
    try {
      const docsClient = DocsClient.getInstance();
      const sources = await docsClient.listSources();
      this._post({ type: 'docsSourcesUpdated', sources });
    } catch (e) {
      Logger.error('Failed to get doc sources:', e);
    }
  }

  private async _handleAddDocSource(source: { name: string; type: string; url?: string; localPath?: string; packageName?: string }): Promise<void> {
    try {
      const docsClient = DocsClient.getInstance();
      const added = await docsClient.addSource(source);
      if (added && added.url) {
        // Auto-start crawling after adding URL source
        for await (const progress of docsClient.startCrawl(added.id)) {
          this._post({ type: 'docsCrawlProgress', progress });
        }
      }
      const sources = await docsClient.listSources();
      this._post({ type: 'docsSourcesUpdated', sources });
    } catch (e) {
      Logger.error('Failed to add doc source:', e);
    }
  }

  private async _handleRemoveDocSource(sourceId: string): Promise<void> {
    try {
      const docsClient = DocsClient.getInstance();
      await docsClient.removeSource(sourceId);
      const sources = await docsClient.listSources();
      this._post({ type: 'docsSourcesUpdated', sources });
    } catch (e) {
      Logger.error('Failed to remove doc source:', e);
    }
  }

  private async _handleStartDocCrawl(sourceId: string, config?: Record<string, unknown>): Promise<void> {
    try {
      const docsClient = DocsClient.getInstance();
      for await (const progress of docsClient.startCrawl(sourceId, config)) {
        this._post({ type: 'docsCrawlProgress', progress });
      }
      this._post({ type: 'docsCrawlComplete', sourceId });
      const sources = await docsClient.listSources();
      this._post({ type: 'docsSourcesUpdated', sources });
    } catch (e) {
      Logger.error('Failed to crawl docs:', e);
    }
  }

  private async _handleSearchDocs(query: string, sourceIds?: string[], limit?: number): Promise<void> {
    try {
      const docsClient = DocsClient.getInstance();
      const results = await docsClient.search(query, sourceIds, limit);
      this._post({ type: 'docsSearchResults', results, query });
    } catch (e) {
      Logger.error('Failed to search docs:', e);
    }
  }

  private async _handleGetDocSuggestions(context: { filePath: string; language: string; code: string; errors: string[]; imports: string[] }): Promise<void> {
    try {
      const docsClient = DocsClient.getInstance();
      const suggestions = await docsClient.getSuggestions(context);
      this._post({ type: 'docsSuggestionsReady', suggestions });
    } catch (e) {
      Logger.error('Failed to get doc suggestions:', e);
    }
  }

  private _handleInsertDocMention(source: string, topic?: string): void {
    const mention = topic ? `@docs:${source}/${topic}` : `@docs:${source}`;
    this._post({ type: 'insertMention', mention });
  }

  // ============ Rules Handlers ============

  private _sendRulesStatus(): void {
    try {
      const injector = RulesInjector.getInstance();
      const fileManager = RulesFileManager.getInstance();
      const rules = fileManager.getRules();
      const status = {
        active: injector.isRulesActive(),
        summary: injector.getRulesSummary(),
        sections: rules?.parsed?.sections?.map(s => ({
          type: s.type, title: s.name, rules: s.rules, priority: s.priority > RULES_CONSTANTS.DEFAULT_PRIORITY, disabled: !s.enabled,
        })) || [],
        errors: rules?.errors || [],
      };
      this._post({ type: 'rulesStatus', status });
    } catch (e) {
      Logger.debug('Rules status failed:', e);
      this._post({ type: 'rulesStatus', status: { active: false, summary: null, sections: [], errors: [] } });
    }
  }

  private async _handleCreateRulesFile(template?: string): Promise<void> {
    try {
      const fileManager = RulesFileManager.getInstance();
      let content = template;
      if (!content) {
        const templateService = RulesTemplateService.getInstance();
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceRoot) {
          const bestTemplate = await templateService.detectBestTemplate(workspaceRoot);
          content = templateService.generateFromTemplate(bestTemplate);
        }
      }
      await fileManager.createRulesFile(content || undefined);
      this._sendRulesStatus();
    } catch (e) {
      Logger.error('Failed to create rules file:', e);
    }
  }

  private async _handleOpenRulesFile(): Promise<void> {
    try {
      const fileManager = RulesFileManager.getInstance();
      const filePath = fileManager.discoverRulesFile();
      if (filePath) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      } else {
        vscode.window.showInformationMessage('No .ina-rules file found. Create one first.');
      }
    } catch (e) {
      Logger.error('Failed to open rules file:', e);
    }
  }

  private _handleToggleRules(): void {
    const injector = RulesInjector.getInstance();
    const current = injector.isRulesActive();
    injector.setEnabled(!current);
    this._sendRulesStatus();
  }

  private async _handleRefreshRules(): Promise<void> {
    const fileManager = RulesFileManager.getInstance();
    await fileManager.loadRules();
    this._sendRulesStatus();
  }

  private _handleRulesPreview(mode: string): void {
    try {
      const injector = RulesInjector.getInstance();
      const context = injector.getActiveRulesContext();
      if (!context) {
        this._post({ type: 'rulesPreviewText', text: 'No active rules.' });
        return;
      }
      let text = '';
      switch (mode) {
        case 'chat': text = context.forChat || ''; break;
        case 'completion': text = context.forCompletion || ''; break;
        case 'agent': text = context.forAgent || ''; break;
        case 'inline': text = context.forInlineEdit || ''; break;
        default: text = context.forChat || '';
      }
      this._post({ type: 'rulesPreviewText', text: text || 'No rules for this mode.' });
    } catch (e) {
      Logger.debug('Rules preview failed:', e);
    }
  }

  // ============ Cache Handlers ============

  private _sendCacheStats(): void {
    try {
      const cm = CacheManager.getInstance();
      const stats = cm.getGlobalStats();
      const metrics = CacheMetrics.getInstance();
      const recommendations = metrics.getRecommendations(stats.caches);
      this._post({ type: 'cacheStatsUpdated', stats: { ...stats, recommendations } });
    } catch (e) {
      Logger.debug('Cache stats failed:', e);
    }
  }

  // ============ Memory Handlers ============

  private async _handleRequestMemories(filters?: any): Promise<void> {
    try {
      const client = MemoryClient.getInstance();
      const memories = await client.getMemories(filters);
      this._post({ type: 'memoriesList', memories });
      const stats = await client.getStats();
      this._post({ type: 'memoryStats', stats });
    } catch (e) {
      Logger.debug('Failed to get memories:', e);
      this._post({ type: 'memoriesList', memories: [] });
    }
  }

  private async _handleCreateMemory(data: any): Promise<void> {
    try {
      const client = MemoryClient.getInstance();
      const memory = await client.createMemory({
        type: data.type || 'fact',
        scope: data.scope || 'project',
        content: data.content,
        summary: data.summary || data.content?.slice(0, 100),
        tags: data.tags,
        related_files: data.relatedFiles || data.related_files,
      });
      this._post({ type: 'memoryCreated', memory });
    } catch (e) {
      Logger.error('Failed to create memory:', e);
    }
  }

  private async _handleClearProjectMemories(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Clear all project memories? This cannot be undone.',
      { modal: true },
      'Clear All'
    );
    if (confirm === 'Clear All') {
      try {
        // No projectId filter for now — clears all
        const client = MemoryClient.getInstance();
        const { memories } = await client.getMemories({ limit: 1000 });
        for (const m of memories) {
          await client.deleteMemory(m.id);
        }
        this._post({ type: 'memoriesList', memories: [] });
        vscode.window.showInformationMessage('Project memories cleared');
      } catch (e) {
        Logger.error('Failed to clear memories:', e);
      }
    }
  }

  // ============ Global Rules Handlers ============

  private _sendGlobalRulesStatus(): void {
    try {
      const globalFM = GlobalRulesFileManager.getInstance();
      const globalRules = globalFM.getGlobalRules();
      const merger = RulesMerger.getInstance();
      const merged = merger.getMergedRules();

      const status = {
        active: globalRules !== null,
        preferences: globalRules?.parsed?.preferences ? {
          displayName: globalRules.parsed.preferences.displayName,
          preferredLanguage: globalRules.parsed.preferences.preferredLanguage,
          preferredCodeLanguage: globalRules.parsed.preferences.preferredCodeLanguage,
          experienceLevel: globalRules.parsed.preferences.experienceLevel,
          timezone: globalRules.parsed.preferences.timezone,
        } : null,
        codingDefaults: globalRules?.parsed?.codingDefaults ? {
          indentation: globalRules.parsed.codingDefaults.indentation,
          indentSize: globalRules.parsed.codingDefaults.indentSize,
          quotes: globalRules.parsed.codingDefaults.quotes,
          semicolons: globalRules.parsed.codingDefaults.semicolons,
          trailingComma: globalRules.parsed.codingDefaults.trailingComma,
          lineWidth: globalRules.parsed.codingDefaults.lineWidth,
          braceStyle: globalRules.parsed.codingDefaults.braceStyle,
          arrowParens: globalRules.parsed.codingDefaults.arrowParens,
        } : null,
        responseStyle: globalRules?.parsed?.responseStyle ? {
          verbosity: globalRules.parsed.responseStyle.verbosity,
          tone: globalRules.parsed.responseStyle.tone,
          codeComments: globalRules.parsed.responseStyle.codeComments,
          includeExplanations: globalRules.parsed.responseStyle.includeExplanations,
          showAlternatives: globalRules.parsed.responseStyle.showAlternatives,
          preferExamples: globalRules.parsed.responseStyle.preferExamples,
          maxResponseLength: globalRules.parsed.responseStyle.maxResponseLength,
        } : null,
        customInstructions: globalRules?.parsed?.customInstructions || [],
        conflicts: merged.conflicts.map(c => ({
          category: c.category,
          projectRule: c.projectRule,
          globalRule: c.globalRule,
          winner: c.winner,
        })),
      };
      this._post({ type: 'globalRulesStatus', status });
    } catch (e) {
      Logger.debug('Global rules status failed:', e);
      this._post({ type: 'globalRulesStatus', status: { active: false, preferences: null, codingDefaults: null, responseStyle: null, customInstructions: [], conflicts: [] } });
    }
  }

  private async _handleOpenGlobalRulesFile(): Promise<void> {
    try {
      const globalFM = GlobalRulesFileManager.getInstance();
      const filePath = globalFM.getGlobalRulesPath();
      if (filePath && require('fs').existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      } else {
        vscode.window.showInformationMessage('No global rules file. Run the setup wizard first.');
      }
    } catch (e) {
      Logger.error('Failed to open global rules file:', e);
    }
  }

  private async _handleDeleteGlobalRules(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Delete your global rules? This cannot be undone.',
      { modal: true },
      'Delete'
    );
    if (confirm === 'Delete') {
      await GlobalRulesFileManager.getInstance().deleteGlobalRulesFile();
      this._sendGlobalRulesStatus();
    }
  }

  private async _handleUpdateGlobalPreference(key: string, value: string): Promise<void> {
    try {
      await GlobalRulesFileManager.getInstance().updatePreference(key, value);
      this._sendGlobalRulesStatus();
    } catch (e) {
      Logger.error('Failed to update global preference:', e);
    }
  }

  private async _handleUpdateGlobalSection(section: string, key: string, value: string): Promise<void> {
    try {
      await GlobalRulesFileManager.getInstance().updateSectionValue(section, key, value);
      this._sendGlobalRulesStatus();
    } catch (e) {
      Logger.error('Failed to update global section:', e);
    }
  }

  private _nonce(): string {
    return require('crypto').randomBytes(16).toString('base64');
  }
}
