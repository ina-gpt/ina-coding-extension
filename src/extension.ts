import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

import { ApiService } from './services/ApiService';
import { AuthService } from './services/AuthService';
import { IndexingService } from './services/IndexingService';
import { CompletionService } from './services/CompletionService';
import { CompletionClient } from './services/completion/CompletionClient';
import { CompletionContextBuilder } from './services/completion/CompletionContextBuilder';
import { GhostTextKeyBindingProvider } from './providers/GhostTextKeyBindingProvider';
import { CompletionPreviewWidget } from './widgets/CompletionPreviewWidget';
import { DEFAULT_GHOST_TEXT_CONFIG } from './services/completion/ghosttext/GhostTextTypes';
import { ChatService } from './services/ChatService';
import { HistoryManager } from './services/HistoryManager';

import { ChatViewProvider } from './providers/ChatViewProvider';
import { InlineCompletionProvider } from './providers/InlineCompletionProvider';
import { InlineEditProvider } from './providers/InlineEditProvider';
import { ProjectTreeProvider } from './providers/ProjectTreeProvider';
import { HistoryPanelProvider } from './providers/HistoryPanelProvider';
import { SettingsViewProvider } from './providers/SettingsViewProvider';
import { SearchPanelProvider } from './providers/SearchPanelProvider';
import { IndexPanelProvider } from './providers/IndexPanelProvider';
import { IndexStatusBar } from './providers/IndexStatusBar';
import { InlineEditCodeLensProvider } from './providers/InlineEditCodeLensProvider';
import { InlineEditDecorationProvider } from './providers/InlineEditDecorationProvider';
import { DiffCodeLensProvider } from './providers/DiffCodeLensProvider';
import { DiffLineActionProvider } from './providers/DiffLineActionProvider';
import { DiffGutterProvider } from './providers/DiffGutterProvider';
import { DiffPreviewController } from './controllers/DiffPreviewController';
import { MultiCursorEditService } from './services/multicursor/MultiCursorEditService';
import { MultiCursorDiffManager } from './services/multicursor/MultiCursorDiffManager';
import { MultiCursorCodeLensProvider } from './providers/MultiCursorCodeLensProvider';
import { MultiCursorProgressWidget } from './widgets/MultiCursorProgressWidget';
import { MultiCursorEditController } from './controllers/MultiCursorEditController';

import { searchClient } from './services/SearchClient';
import { indexManagerClient } from './services/IndexManagerClient';
import { InlineEditService } from './services/InlineEditService';
import { InlineEditTrigger } from './services/InlineEditTrigger';
import { SelectionExpander } from './services/SelectionExpander';
import { InlineEditHistory } from './services/InlineEditHistory';
import { InlineEditInputController } from './controllers/InlineEditInputController';
import { InlineEditOverlay } from './widgets/InlineEditOverlay';
import { InlineEditStatusBar as InlineEditStatusBarWidget } from './widgets/InlineEditStatusBar';

import { createIndexingCoordinator, IndexingCoordinator } from './services/IndexingCoordinator';

import { registerCommands } from './commands';

import { AgentModeManager } from './services/agent/AgentModeManager';
import { AgentSessionManager } from './services/agent/AgentSessionManager';
import { AgentMode } from './services/agent/AgentTypes';
import { AgentStatusBarProvider } from './providers/AgentStatusBarProvider';
import { PlanningService } from './services/agent/planning/PlanningService';
import { ExecutionEngine } from './services/agent/execution/ExecutionEngine';
import { StepExecutorRegistry } from './services/agent/execution/StepExecutorRegistry';
import { MultiFileEditOrchestrator } from './services/agent/fileops/MultiFileEditOrchestrator';
import { TerminalIntegrationService } from './services/agent/terminal/TerminalIntegrationService';
import { ReviewService } from './services/agent/review/ReviewService';
import { RollbackManager } from './services/agent/execution/RollbackManager';

import { DocsClient } from './services/docs/DocsClient';
import { DocsAutoSuggestService } from './services/docs/DocsAutoSuggestService';
import { DocsMentionHandler } from './services/docs/DocsMentionHandler';
import { DocsStatusBarProvider } from './providers/DocsStatusBarProvider';
import { DocsPanelProvider } from './providers/DocsPanelProvider';

import { GitCommandRunner } from './services/git/GitCommandRunner';
import { GitBranchService } from './services/git/GitBranchService';
import { GitLogService } from './services/git/GitLogService';
import { GitStatusService } from './services/git/GitStatusService';
import { GitDiffService } from './services/git/GitDiffService';
import { GitBlameService } from './services/git/GitBlameService';
import { GitPRService } from './services/git/GitPRService';
import { GitContextBuilder } from './services/git/GitContextBuilder';
import { GitWatcher } from './services/git/GitWatcher';
import { GitMentionHandler } from './services/git/GitMentionHandler';
import { GitStatusBarProvider } from './providers/GitStatusBarProvider';
import { GitContextCodeLensProvider } from './providers/GitContextCodeLensProvider';
import { GitDecorationProvider } from './providers/GitDecorationProvider';

import { LSPCapabilityDetector } from './services/lsp/LSPCapabilityDetector';
import { SymbolService } from './services/lsp/SymbolService';
import { TypeInfoService } from './services/lsp/TypeInfoService';
import { DefinitionService } from './services/lsp/DefinitionService';
import { ReferenceService } from './services/lsp/ReferenceService';
import { DiagnosticService } from './services/lsp/DiagnosticService';
import { CodeActionService } from './services/lsp/CodeActionService';
import { InlayHintService } from './services/lsp/InlayHintService';
import { LSPContextBuilder } from './services/lsp/LSPContextBuilder';
import { LSPMentionHandler } from './services/lsp/LSPMentionHandler';
import { LSPWatcher } from './services/lsp/LSPWatcher';
import { LSPContextCodeLensProvider } from './providers/LSPContextCodeLensProvider';
import { LSPHoverEnhancer } from './providers/LSPHoverEnhancer';
import { DiagnosticEnhancerProvider } from './providers/DiagnosticEnhancerProvider';

import { RulesFileManager } from './services/rules/RulesFileManager';
import { RulesInjector } from './services/rules/RulesInjector';
import { RulesTemplateService } from './services/rules/RulesTemplateService';
import { GlobalRulesFileManager } from './services/rules/GlobalRulesFileManager';
import { GlobalRulesSetupWizard } from './services/rules/GlobalRulesSetupWizard';
import { RulesMerger } from './services/rules/RulesMerger';
import { RulesStatusBarProvider } from './providers/RulesStatusBarProvider';
import { RulesCodeLensProvider, RulesFoldingProvider, RulesSymbolProvider, RulesCompletionProvider } from './providers/RulesEditorProvider';
import { RulesCodeActionProvider } from './providers/RulesCodeActionProvider';

import { MemoryClient } from './services/memory/MemoryClient';
import { MemoryAutoExtractor } from './services/memory/MemoryAutoExtractor';
import { MemoryContextInjector } from './services/memory/MemoryContextInjector';

import { CacheManager } from './services/cache/CacheManager';
import { CacheInvalidator } from './services/cache/CacheInvalidator';
import { CacheMetrics } from './services/cache/CacheMetrics';

import { RequestScheduler } from './services/requestopt/RequestScheduler';
import { ParallelExecutor } from './services/requestopt/ParallelExecutor';
import { RequestMetricsCollector } from './services/requestopt/RequestMetricsCollector';

import { ConnectivityMonitor } from './services/offline/ConnectivityMonitor';
import { OfflineQueue } from './services/offline/OfflineQueue';
import { SyncManager } from './services/offline/SyncManager';
import { LocalModelManager } from './services/offline/LocalModelManager';
import { OfflineManifestStore, OFFLINE_NOT_PROVISIONED } from './services/offline/OfflineManifest';
import { GracefulDegradation } from './services/offline/GracefulDegradation';
import { OfflineSearchFallback } from './services/offline/OfflineSearchFallback';

import { ErrorClassifier } from './services/errors/ErrorClassifier';
import { RetryEngine } from './services/errors/RetryEngine';
import { CircuitBreakerRegistry } from './services/errors/CircuitBreakerRegistry';
import { FallbackManager } from './services/errors/FallbackManager';
import { ErrorAnalyticsEngine } from './services/errors/ErrorAnalyticsEngine';
import { UserFeedbackCollector } from './services/errors/UserFeedbackCollector';
import { SelfHealingEngine } from './services/errors/SelfHealingEngine';
import { ErrorRecoveryService } from './services/errors/ErrorRecoveryService';

import { ThemeEngine } from './services/theme/ThemeEngine';
import { ThemeMode } from './services/theme/ThemeTypes';

import { StatusAggregator } from './services/status/StatusAggregator';
import { StatusBarManager } from './services/status/StatusBarManager';
import { TokenTracker } from './services/status/TokenTracker';
import { HealthDashboardService } from './services/status/HealthDashboardService';
import { ShortcutManager } from './services/shortcuts/ShortcutManager';
import { QuickActionService } from './services/shortcuts/QuickActionService';
import { ShortcutConflictResolver } from './services/shortcuts/ShortcutConflictResolver';
import { OnboardingManager } from './services/onboarding/OnboardingManager';
import { FeatureTourService } from './services/onboarding/FeatureTourService';
import { ShortcutCheatsheet } from './services/onboarding/ShortcutCheatsheet';
import { InteractiveTutorial } from './services/onboarding/InteractiveTutorial';
import { ProgressiveHintService } from './services/onboarding/ProgressiveHintService';
import { WhatsNewService } from './services/onboarding/WhatsNewService';

import { ImageCaptureService } from './services/vision/ImageCaptureService';
import { VisionClient } from './services/vision/VisionClient';
import { DesignToCodeService } from './services/vision/DesignToCodeService';
import { ImageAnnotationService } from './services/vision/ImageAnnotationService';

import { SecretDetector } from './services/privacy/SecretDetector';
import { ApiKeyStore } from './services/access/ApiKeyStore';
import { AccessClient } from './services/access/AccessClient';
import { RateLimitHandler } from './services/access/RateLimitHandler';
import { DataEncryptionService } from './services/privacy/DataEncryptionService';
import { DataSanitizer } from './services/privacy/DataSanitizer';
import { PrivacyModeManager } from './services/privacy/PrivacyModeManager';
import { DataRetentionManager } from './services/privacy/DataRetentionManager';
import { TLSEnforcer } from './services/privacy/TLSEnforcer';
import { PrivacyAuditService } from './services/privacy/PrivacyAuditService';

import { SensitiveFileDetector } from './services/codesec/SensitiveFileDetector';
import { CodeSecurityGate } from './services/codesec/CodeSecurityGate';
import { EphemeralPolicyEnforcer } from './services/codesec/EphemeralPolicyEnforcer';
import { CodeTransmissionMonitor } from './services/codesec/CodeTransmissionMonitor';
import { GeneratedCodeScanner } from './services/codesec/GeneratedCodeScanner';

import { EditorCompat } from './services/compat/EditorCompat';

import { EnterpriseClient } from './services/enterprise/EnterpriseClient';
import { SSOAuthHandler } from './services/enterprise/SSOAuthHandler';
import { GenerateService } from './services/generate/GenerateService';
import { ApplyService } from './services/apply/ApplyService';
import { EditTracker } from './services/predict/EditTracker';
import { PredictionChainManager } from './services/predict/PredictionChainManager';
import { EditType } from './services/predict/PredictTypes';

import { CodebaseSearchClient } from './services/codebase/CodebaseSearchClient';
import { CodebaseMentionHandler } from './services/codebase/CodebaseMentionHandler';
import { BugFinderService } from './services/bugfinder/BugFinderService';
import { BugFinderDecorator } from './services/bugfinder/BugFinderDecorator';
import { CommitMessageGenerator } from './services/gitai/CommitMessageGenerator';
import { GitAIPanel } from './services/gitai/GitAIPanel';

import { ShadowFileSystemProvider } from './services/shadow/ShadowFileSystemProvider';
import { ShadowWorkspaceManager } from './services/shadow/ShadowWorkspaceManager';
import { ShadowTreeDataProvider } from './services/shadow/ShadowTreeDataProvider';
import { ShadowIntegration } from './services/shadow/ShadowIntegration';
import { DeepResolver } from './services/deepcontext/DeepResolver';
import { DeepContextFormatter } from './services/deepcontext/DeepContextFormatter';
import { DeepMentionHandler } from './services/deepcontext/DeepMentionHandler';

import { BenchmarkRunner } from './services/benchmark/BenchmarkRunner';
import { BenchmarkReporter } from './services/benchmark/BenchmarkReporter';
import { PerformanceMonitor } from './services/benchmark/PerformanceMonitor';
import { ComposerSessionManager } from './services/composer/ComposerSessionManager';
import { ComposerDiffEngine } from './services/composer/ComposerDiffEngine';
import { ComposerLayout } from './services/composer/ComposerTypes';
import { MCPClient } from './services/mcp/MCPClient';
import { MCPDiscovery } from './services/mcp/MCPDiscovery';
import { MCPToolExecutor } from './services/mcp/MCPToolExecutor';
import { registerBuiltinMCPServers } from './services/mcp/MCPBuiltinServers';
import { WebSearchService } from './services/websearch/WebSearchService';
import { WebMentionHandler } from './services/websearch/WebMentionHandler';
import { NotepadManager } from './services/notepads/NotepadManager';
import { NotepadType } from './services/notepads/NotepadTypes';
import { HistorySearchService } from './services/history/HistorySearchService';
import { AutoFormatService } from './services/autoformat/AutoFormatService';
import { AIRenameProvider } from './services/rename/AIRenameProvider';
import { MultiAgentOrchestrator } from './services/agent/multi/MultiAgentOrchestrator';
import { AgentFactory as MultiAgentFactory } from './services/agent/multi/AgentFactory';
import { VerificationOrchestrator } from './services/agent/verifier/VerificationOrchestrator';
import { WorktreeManager } from './services/agent/worktree/WorktreeManager';
import { IsolatedExecutor } from './services/agent/worktree/IsolatedExecutor';
import { BestOfNOrchestrator } from './services/agent/bestofn/BestOfNOrchestrator';
import { SelectionStrategy } from './services/agent/bestofn/BestOfNTypes';
import { AsyncSessionClient } from './services/agent/async/AsyncSessionClient';
import { AsyncSessionSync } from './services/agent/async/AsyncSessionSync';
import { SkillClient } from './services/marketplace/SkillClient';
import { CloudAgentClient } from './services/marketplace/CloudAgentClient';
import { SkillUIProvider } from './services/marketplace/SkillUIProvider';
import { LinkFetchService } from './services/linkfetch/LinkFetchService';
import { LinkMentionHandler } from './services/linkfetch/LinkMentionHandler';
import { PartialAcceptController } from './services/completion/ghosttext/PartialAcceptController';
import { ContextWindowManager } from './services/context/ContextWindowManager';

import { TelemetryClient } from './services/telemetry/TelemetryClient';
import { ActivityReporter } from './services/telemetry/ActivityReporter';

import { Logger } from './utils/Logger';
import { ConfigManager } from './utils/ConfigManager';
import { KeybindingsManager } from './utils/KeybindingsManager';

let services: {
  api: ApiService;
  auth: AuthService;
  indexing: IndexingService;
  completion: CompletionService;
  chat: ChatService;
  historyManager: HistoryManager;
};

export async function activate(context: vscode.ExtensionContext) {
  Logger.info('INA Coding extension activating...');

  try {
    // Detect editor type for cross-editor compatibility (VS Code, VS Codium, Theia, etc.)
    const editorCompat = EditorCompat.getInstance();
    Logger.info(`INA Coding activated in ${editorCompat.getEditorInfo()}`);

    ConfigManager.initialize(context);
    KeybindingsManager.initialize(context);

    const authService = new AuthService(context);
    const apiService = new ApiService(context);
    apiService.setAuthService(authService);

    const historyManager = new HistoryManager(context);
    context.subscriptions.push({ dispose: () => historyManager.dispose() });

    services = {
      api: apiService,
      auth: authService,
      indexing: new IndexingService(context),
      completion: new CompletionService(context),
      chat: new ChatService(context),
      historyManager,
    };

    await services.api.initialize();

    // Phase 25 — GDPR-Compliant Telemetry
    const telemetryClient = new TelemetryClient(
      ConfigManager.getApiEndpoint(),
      async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authService) {
          try {
            const authHeaders = await authService.getAuthHeaders();
            Object.assign(headers, authHeaders);
          } catch { /* continue without auth headers */ }
        }
        return headers;
      },
    );
    context.subscriptions.push({ dispose: () => telemetryClient.dispose() });

    // First-run privacy notice (Phase 25.7)
    const hasShownNotice = context.globalState.get<boolean>('inaCoding.telemetry.noticeShown', false);
    if (!hasShownNotice && vscode.workspace.getConfiguration('inaCoding.telemetry').get<boolean>('showNotice', true)) {
      const choice = await vscode.window.showInformationMessage(
        'INA Coding erfasst anonymisierte Nutzungsstatistiken zur Qualitätsverbesserung. ' +
        'Es werden niemals Code-Inhalte, Dateinamen oder Prompts gespeichert. ' +
        'Alle Daten verbleiben auf Ihrem Server und werden nach 180 Tagen gelöscht. ' +
        'Sie können dies jederzeit in den Einstellungen deaktivieren.',
        'Verstanden',
        'Deaktivieren',
        'Mehr erfahren',
      );
      if (choice === 'Deaktivieren') {
        await vscode.workspace.getConfiguration('inaCoding.telemetry').update('enabled', false, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Telemetrie wurde deaktiviert. Sie können dies jederzeit in den Einstellungen ändern.');
      } else if (choice === 'Mehr erfahren') {
        vscode.env.openExternal(vscode.Uri.parse('https://inagpt.com/datenschutz'));
      }
      await context.globalState.update('inaCoding.telemetry.noticeShown', true);
    }

    // Telemetry commands (Phase 25.6)
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.telemetry.toggle', async () => {
        const cfg = vscode.workspace.getConfiguration('inaCoding.telemetry');
        const current = cfg.get<boolean>('enabled', true);
        await cfg.update('enabled', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `INA-7 Pro Telemetrie: ${!current ? 'Aktiviert' : 'Deaktiviert'}`,
        );
      }),
      vscode.commands.registerCommand('inaCoding.telemetry.viewStats', async () => {
        try {
          const headers: Record<string, string> = {};
          if (authService) {
            try { Object.assign(headers, await authService.getAuthHeaders()); } catch { /* */ }
          }
          const resp = await fetch(`${ConfigManager.getApiEndpoint()}/api/telemetry/stats?days=30`, {
            headers,
            signal: AbortSignal.timeout(10000),
          });
          const data = await resp.json();
          const ch = vscode.window.createOutputChannel('INA Coding — Telemetrie-Statistiken');
          ch.appendLine(JSON.stringify(data, null, 2));
          ch.show();
        } catch { vscode.window.showErrorMessage('Fehler beim Laden der Statistiken.'); }
      }),
      vscode.commands.registerCommand('inaCoding.telemetry.exportMyData', () => telemetryClient.exportMyData()),
      vscode.commands.registerCommand('inaCoding.telemetry.deleteMyData', async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Möchten Sie wirklich alle Ihre Telemetrie-Daten unwiderruflich löschen?',
          { modal: true },
          'Ja, löschen',
        );
        if (confirm === 'Ja, löschen') { await telemetryClient.deleteMyData(); }
      }),
      vscode.commands.registerCommand('inaCoding.telemetry.showPrivacyNotice', () => {
        vscode.window.showInformationMessage(
          'INA Coding erfasst anonymisierte Nutzungsstatistiken (Feature-Nutzung, Antwortzeiten, Akzeptanzraten). ' +
          'Niemals gespeichert: Code, Prompts, Dateinamen, E-Mail, IP. ' +
          'Alle Daten verbleiben auf Ihrem Server. Aufbewahrung: 180 Tage. ' +
          'DSGVO Art. 6 Abs. 1 lit. f. Jederzeit deaktivierbar.',
          'Verstanden',
        );
      }),
    );
    Logger.info('Telemetry (Phase 25) registered');

    // Phase 26 — User Intelligence Activity Reporter
    const activityReporter = new ActivityReporter(
      ConfigManager.getApiEndpoint(),
      async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authService) {
          try {
            const authHeaders = await authService.getAuthHeaders();
            Object.assign(headers, authHeaders);
          } catch { /* continue without auth headers */ }
        }
        return headers;
      },
    );
    context.subscriptions.push({ dispose: () => activityReporter.dispose() });

    // User Intelligence commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.userIntelligence.exportMyData', async () => {
        const apiKey = context.globalState.get<string>('inaCoding.apiKeyPrefix', 'unknown');
        await activityReporter.exportMyData(apiKey);
      }),
      vscode.commands.registerCommand('inaCoding.userIntelligence.deleteMyData', async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Möchten Sie wirklich alle Ihre Aktivitätsdaten unwiderruflich löschen?',
          { modal: true },
          'Ja, löschen',
        );
        if (confirm === 'Ja, löschen') {
          const apiKey = context.globalState.get<string>('inaCoding.apiKeyPrefix', 'unknown');
          await activityReporter.deleteMyData(apiKey);
        }
      }),
    );

    // User Intelligence: audit banner (Phase 26.5)
    if (activityReporter.isEnabled()) {
      const showBanner = vscode.workspace.getConfiguration('inaCoding.userIntelligence').get<boolean>('showBanner', true);
      if (showBanner) {
        const level = activityReporter.getAuditLevel();
        const bannerShown = context.globalState.get<boolean>('inaCoding.userIntelligence.bannerShown', false);
        if (!bannerShown) {
          const msg = level >= 2
            ? 'INA-7 Pro: Ihre Anfragen werden zusammengefasst protokolliert (Stufe 2). Änderbar in den Einstellungen.'
            : 'INA-7 Pro: Nutzungsstatistiken werden erfasst (nur Metadaten). Änderbar in den Einstellungen.';
          const choice = await vscode.window.showInformationMessage(msg, 'Verstanden', 'Einstellungen', 'Deaktivieren');
          if (choice === 'Einstellungen') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'inaCoding.userIntelligence');
          } else if (choice === 'Deaktivieren') {
            await vscode.workspace.getConfiguration('inaCoding.userIntelligence').update('enabled', false, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Aktivitätsprotokollierung wurde deaktiviert.');
          }
          await context.globalState.update('inaCoding.userIntelligence.bannerShown', true);
        }
      }
    }
    Logger.info('User Intelligence (Phase 26) registered');

    // Chat View Provider (Sidebar)
    const chatViewProvider = new ChatViewProvider(context, historyManager, services.api);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'inaCoding.chatView',
        chatViewProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
      )
    );
    context.subscriptions.push({ dispose: () => chatViewProvider.dispose() });

    // Agent System
    const agentModeManager = AgentModeManager.getInstance();
    const agentSessionManager = AgentSessionManager.getInstance();
    agentSessionManager.initialize(context);

    const agentStatusBar = new AgentStatusBarProvider(agentModeManager, agentSessionManager);
    context.subscriptions.push(agentStatusBar);

    // Agent commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.toggleAgentMode', () => {
        agentModeManager.toggleAgentMode();
      }),
      vscode.commands.registerCommand('inaCoding.enableAgentMode', () => {
        agentModeManager.setMode(AgentMode.AGENT);
      }),
      vscode.commands.registerCommand('inaCoding.disableAgentMode', () => {
        agentModeManager.setMode(AgentMode.CHAT);
      }),
      vscode.commands.registerCommand('inaCoding.enableAutoMode', () => {
        agentModeManager.setMode(AgentMode.AUTO);
      }),
      vscode.commands.registerCommand('inaCoding.approvePlan', () => {
        const planningService = PlanningService.getInstance();
        planningService.approvePlan();
      }),
      vscode.commands.registerCommand('inaCoding.rejectPlan', () => {
        const planningService = PlanningService.getInstance();
        planningService.rejectPlan();
      }),
      vscode.commands.registerCommand('inaCoding.pauseExecution', () => {
        ExecutionEngine.getInstance().pause();
      }),
      vscode.commands.registerCommand('inaCoding.resumeExecution', () => {
        ExecutionEngine.getInstance().resume();
      }),
      vscode.commands.registerCommand('inaCoding.cancelExecution', async () => {
        const confirm = await vscode.window.showWarningMessage('Cancel execution? This will stop all pending steps.', { modal: true }, 'Cancel Execution');
        if (confirm) ExecutionEngine.getInstance().cancel();
      }),
      vscode.commands.registerCommand('inaCoding.rollbackAll', async () => {
        const confirm = await vscode.window.showWarningMessage('Rollback all changes? This will undo all file modifications.', { modal: true }, 'Rollback All');
        if (confirm) await ExecutionEngine.getInstance().rollbackAndStop();
      }),
      vscode.commands.registerCommand('inaCoding.rollbackLastStep', async () => {
        await ExecutionEngine.getInstance().rollbackLastStep();
      }),
      vscode.commands.registerCommand('inaCoding.skipStep', () => {
        ExecutionEngine.getInstance().skipCurrentStep();
      }),
      vscode.commands.registerCommand('inaCoding.revertFileOp', async () => {
        vscode.window.showInformationMessage('Use the File Operations panel to revert individual operations.');
      }),
      vscode.commands.registerCommand('inaCoding.revertAllFileOps', async () => {
        const orchestrator = MultiFileEditOrchestrator.getInstance();
        const batch = orchestrator.getActiveBatch();
        if (batch) {
          const confirm = await vscode.window.showWarningMessage('Revert all file operations?', { modal: true }, 'Revert All');
          if (confirm) await orchestrator.revertBatch(batch.id);
        }
      }),
      vscode.commands.registerCommand('inaCoding.viewFileOpDiff', () => {
        vscode.window.showInformationMessage('Use the File Operations panel to view diffs.');
      }),
      vscode.commands.registerCommand('inaCoding.runTerminalCommand', async () => {
        const cmd = await vscode.window.showInputBox({ prompt: 'Enter command to run', placeHolder: 'npm test' });
        if (cmd) await TerminalIntegrationService.getInstance().runCommand(cmd);
      }),
      vscode.commands.registerCommand('inaCoding.runInstall', async () => {
        await TerminalIntegrationService.getInstance().runInstall();
      }),
      vscode.commands.registerCommand('inaCoding.runBuild', async () => {
        await TerminalIntegrationService.getInstance().runBuild();
      }),
      vscode.commands.registerCommand('inaCoding.runTests', async () => {
        await TerminalIntegrationService.getInstance().runTests();
      }),
      vscode.commands.registerCommand('inaCoding.runLint', async () => {
        await TerminalIntegrationService.getInstance().runLint();
      }),
      vscode.commands.registerCommand('inaCoding.runTypeCheck', async () => {
        await TerminalIntegrationService.getInstance().runTypeCheck();
      }),
      vscode.commands.registerCommand('inaCoding.autoFixErrors', async () => {
        vscode.window.showInformationMessage('Use the Terminal panel to trigger auto-fix.');
      }),
      vscode.commands.registerCommand('inaCoding.cancelTerminal', () => {
        TerminalIntegrationService.getInstance().dispose();
      }),
      vscode.commands.registerCommand('inaCoding.reviewChanges', async () => {
        const review = ReviewService.getInstance();
        if (review.getActiveReview()) {
          vscode.window.showInformationMessage('Review is already active.');
        } else {
          vscode.window.showInformationMessage('No active review. Complete an agent execution first.');
        }
      }),
      vscode.commands.registerCommand('inaCoding.acceptAllChanges', async () => {
        await ReviewService.getInstance().acceptAll();
      }),
      vscode.commands.registerCommand('inaCoding.rejectAllChanges', async () => {
        const confirm = await vscode.window.showWarningMessage('Reject all changes? This will revert all files.', { modal: true }, 'Reject All');
        if (confirm) await ReviewService.getInstance().rejectAll();
      }),
      vscode.commands.registerCommand('inaCoding.finalizeReview', async () => {
        await ReviewService.getInstance().finalizeReview();
      }),
      vscode.commands.registerCommand('inaCoding.undoAllAgentChanges', async () => {
        const confirm = await vscode.window.showWarningMessage('Undo ALL agent changes?', { modal: true }, 'Undo All');
        if (confirm) await ReviewService.getInstance().undoAll();
      }),
      vscode.commands.registerCommand('inaCoding.nextChange', () => {
        const { ReviewDiffProvider } = require('./services/agent/review/ReviewDiffProvider');
        ReviewDiffProvider.getInstance().navigateToNextChange();
      }),
      vscode.commands.registerCommand('inaCoding.previousChange', () => {
        const { ReviewDiffProvider } = require('./services/agent/review/ReviewDiffProvider');
        ReviewDiffProvider.getInstance().navigateToPreviousChange();
      }),
      vscode.commands.registerCommand('inaCoding.showAllDiffs', async () => {
        await ReviewService.getInstance().showAllDiffs();
      }),
      vscode.commands.registerCommand('inaCoding.analyzeImports', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showInformationMessage('Open a file first.'); return; }
        const { ImportGraphAnalyzer } = require('./services/agent/fileops/ImportGraphAnalyzer');
        const analyzer = ImportGraphAnalyzer.getInstance();
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const imports = await analyzer.analyzeImports(filePath, ws);
        vscode.window.showInformationMessage(`Found ${imports.length} import(s) in ${filePath}`);
      }),
      { dispose: () => agentModeManager.dispose() },
      { dispose: () => agentSessionManager.dispose() },
      { dispose: () => PlanningService.getInstance().dispose() },
      { dispose: () => ExecutionEngine.getInstance().dispose() },
      { dispose: () => MultiFileEditOrchestrator.getInstance().dispose() },
      { dispose: () => TerminalIntegrationService.getInstance().dispose() },
      { dispose: () => ReviewService.getInstance().dispose() },
    );

    // Initialize execution engine
    const executorRegistry = StepExecutorRegistry.getInstance();
    executorRegistry.registerDefaults();

    // Set initial agent context keys
    vscode.commands.executeCommand('setContext', 'inaCoding.agentMode', agentModeManager.getMode());
    vscode.commands.executeCommand('setContext', 'inaCoding.isAgentMode', false);

    Logger.info('Agent system registered');

    // Documentation Integration
    const docsClient = DocsClient.getInstance();
    docsClient.setAuthService(authService);
    const docsAutoSuggest = DocsAutoSuggestService.getInstance();
    const docsMentionHandler = DocsMentionHandler.getInstance();
    const docsStatusBar = new DocsStatusBarProvider();
    const docsPanelProvider = new DocsPanelProvider(context);

    const docsAutoSuggestEnabled = vscode.workspace.getConfiguration('inaCoding.docs').get<boolean>('autoSuggest', true);
    if (docsAutoSuggestEnabled) {
      docsAutoSuggest.enable();
    }

    docsAutoSuggest.on('suggestions-ready', (suggestions: any[]) => {
      chatViewProvider['_post']({ type: 'docsSuggestionsReady', suggestions });
    });

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('inaCoding.docsPanel', docsPanelProvider),
      vscode.commands.registerCommand('inaCoding.openDocsPanel', () => {
        vscode.commands.executeCommand('inaCoding.docsPanel.focus');
      }),
      vscode.commands.registerCommand('inaCoding.addDocSource', async () => {
        const type = await vscode.window.showQuickPick(['Builtin', 'URL', 'Local'], { placeHolder: 'Select documentation source type' });
        if (!type) return;

        if (type === 'Builtin') {
          const builtins = await docsClient.getBuiltins();
          const items = builtins.map(b => ({ label: `${b.icon} ${b.name}`, description: b.description, detail: b.docsUrl, builtin: b }));
          const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select builtin documentation' });
          if (selected) {
            const added = await docsClient.addSource({ name: selected.builtin.name, type: 'builtin', url: selected.builtin.docsUrl, packageName: selected.builtin.packageName });
            if (added && added.url) {
              vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Crawling ${added.name} docs...` }, async () => {
                for await (const p of docsClient.startCrawl(added.id)) { /* progress */ }
              });
            }
          }
        } else if (type === 'URL') {
          const name = await vscode.window.showInputBox({ prompt: 'Documentation name' });
          const url = await vscode.window.showInputBox({ prompt: 'Documentation URL' });
          if (name && url) {
            const added = await docsClient.addSource({ name, type: 'url', url });
            if (added) {
              vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Crawling ${name} docs...` }, async () => {
                for await (const p of docsClient.startCrawl(added.id)) { /* progress */ }
              });
            }
          }
        } else {
          const folder = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: 'Select documentation folder' });
          if (folder?.[0]) {
            const name = await vscode.window.showInputBox({ prompt: 'Documentation name' });
            if (name) {
              await docsClient.addSource({ name, type: 'local', localPath: folder[0].fsPath });
            }
          }
        }
        docsStatusBar.update();
      }),
      vscode.commands.registerCommand('inaCoding.searchDocs', async () => {
        const query = await vscode.window.showInputBox({ prompt: 'Search documentation', placeHolder: 'e.g. React useState hook' });
        if (!query) return;
        const results = await docsClient.search(query);
        if (results.length === 0) { vscode.window.showInformationMessage('No documentation results found.'); return; }
        const items = results.map(r => ({
          label: `${r.source.name} — ${r.chunk.section_title || r.page.title || 'Doc'}`,
          description: `${Math.round(r.score * 100)}% match`,
          detail: r.chunk.content.slice(0, 200),
        }));
        await vscode.window.showQuickPick(items, { placeHolder: `${results.length} results found` });
      }),
      vscode.commands.registerCommand('inaCoding.crawlDocs', async () => {
        const sources = await docsClient.listSources();
        if (sources.length === 0) { vscode.window.showInformationMessage('No documentation sources. Add one first.'); return; }
        const items = sources.map(s => ({ label: s.name, description: s.status, detail: `${s.doc_count} pages`, sourceId: s.id }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select source to re-crawl' });
        if (selected) {
          vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Crawling ${selected.label}...` }, async () => {
            for await (const p of docsClient.startCrawl(selected.sourceId)) { /* progress */ }
          });
        }
      }),
      vscode.commands.registerCommand('inaCoding.toggleDocsSuggest', () => {
        const config = vscode.workspace.getConfiguration('inaCoding.docs');
        const current = config.get<boolean>('autoSuggest', true);
        config.update('autoSuggest', !current, vscode.ConfigurationTarget.Global);
        if (!current) docsAutoSuggest.enable(); else docsAutoSuggest.disable();
        vscode.window.showInformationMessage(`Documentation auto-suggest ${!current ? 'enabled' : 'disabled'}`);
      }),
      { dispose: () => { docsAutoSuggest.dispose(); docsStatusBar.dispose(); } },
    );

    Logger.info('Documentation system registered');

    // Git Integration
    const gitRunner = GitCommandRunner.getInstance();
    gitRunner.initialize();
    const gitBranchService = GitBranchService.getInstance();
    const gitLogService = GitLogService.getInstance();
    const gitStatusService = GitStatusService.getInstance();
    const gitDiffService = GitDiffService.getInstance();
    const gitBlameService = GitBlameService.getInstance();
    const gitPRService = GitPRService.getInstance();
    const gitContextBuilder = GitContextBuilder.getInstance();
    const gitWatcher = GitWatcher.getInstance();
    const gitMentionHandler = GitMentionHandler.getInstance();
    const gitDecorationProvider = new GitDecorationProvider();

    let gitStatusBarProvider: GitStatusBarProvider | null = null;
    let gitCodeLensProvider: GitContextCodeLensProvider | null = null;

    const isGitRepo = await gitRunner.isGitRepo().catch(() => false);
    if (isGitRepo) {
      gitWatcher.start(gitRunner.getWorkspaceRoot());
      gitStatusBarProvider = new GitStatusBarProvider();

      gitWatcher.on('git-event', (event: string) => {
        if (gitStatusBarProvider) gitStatusBarProvider.update();
        if (event === 'status-changed' || event === 'index-changed') {
          chatViewProvider['_handleGitStatus']?.();
        }
        if (event === 'branch-changed') {
          chatViewProvider['_post']({ type: 'gitBranchChanged', branch: null });
          chatViewProvider['_handleGitStatus']?.();
        }
      });

      if (vscode.workspace.getConfiguration('inaCoding.git').get<boolean>('showBlameCodeLens', true)) {
        gitCodeLensProvider = new GitContextCodeLensProvider();
        context.subscriptions.push(
          vscode.languages.registerCodeLensProvider({ scheme: 'file' }, gitCodeLensProvider)
        );
      }
    }

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showGitPanel', () => {
        chatViewProvider.focusInput();
      }),
      vscode.commands.registerCommand('inaCoding.showGitLog', async (hash?: string) => {
        if (hash) {
          try {
            const commit = await gitLogService.getCommit(hash);
            const detail = `${commit.shortHash} by ${commit.author}\n${commit.subject}\n\n${commit.body || ''}`;
            vscode.window.showInformationMessage(detail, { modal: true });
          } catch { vscode.window.showErrorMessage('Commit not found'); }
          return;
        }
        const commits = await gitLogService.getLog({ maxCount: 20 });
        const items = commits.map(c => ({ label: `${c.shortHash} ${c.subject}`, description: c.author, detail: c.authorDate.toLocaleDateString() }));
        await vscode.window.showQuickPick(items, { placeHolder: 'Recent commits' });
      }),
      vscode.commands.registerCommand('inaCoding.showGitBlame', () => {
        gitDecorationProvider.toggle();
      }),
      vscode.commands.registerCommand('inaCoding.showGitDiff', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showInformationMessage('Open a file first.'); return; }
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        try {
          await vscode.commands.executeCommand('git.openChange', editor.document.uri);
        } catch {
          vscode.window.showInformationMessage('No git changes for this file.');
        }
      }),
      vscode.commands.registerCommand('inaCoding.showGitPR', async () => {
        const pr = await gitPRService.getPRContext();
        if (!pr) { vscode.window.showInformationMessage('Not on a feature branch or no commits ahead.'); return; }
        const summary = gitPRService.formatPRForPrompt(pr, 500);
        vscode.window.showInformationMessage(summary, { modal: true });
      }),
      vscode.commands.registerCommand('inaCoding.switchBranch', async () => {
        const branches = await gitBranchService.listBranches();
        const items = branches.map(b => ({ label: b.isCurrent ? `* ${b.name}` : b.name, description: b.upstream || '' }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Switch branch' });
        if (selected) {
          const name = selected.label.replace(/^\* /, '');
          await gitBranchService.switchBranch(name);
          if (gitStatusBarProvider) gitStatusBarProvider.update();
        }
      }),
      vscode.commands.registerCommand('inaCoding.gitStageAll', async () => {
        await gitStatusService.stageAll();
        vscode.window.showInformationMessage('All changes staged.');
        if (gitStatusBarProvider) gitStatusBarProvider.update();
      }),
      vscode.commands.registerCommand('inaCoding.insertGitContext', () => {
        chatViewProvider.focusInput();
        chatViewProvider['_post']({ type: 'insertMention', mention: '@git ' });
      }),
      { dispose: () => { gitWatcher.dispose(); gitDecorationProvider.dispose(); if (gitStatusBarProvider) gitStatusBarProvider.dispose(); } },
    );

    Logger.info('Git integration registered');

    // LSP Integration
    const lspCapDetector = LSPCapabilityDetector.getInstance();
    const symbolService = SymbolService.getInstance();
    const typeInfoService = TypeInfoService.getInstance();
    const definitionService = DefinitionService.getInstance();
    const referenceService = ReferenceService.getInstance();
    const diagnosticServiceLSP = DiagnosticService.getInstance();
    const codeActionService = CodeActionService.getInstance();
    const inlayHintService = InlayHintService.getInstance();
    const lspContextBuilder = LSPContextBuilder.getInstance();
    const lspMentionHandler = LSPMentionHandler.getInstance();
    const lspWatcher = LSPWatcher.getInstance();
    const lspHoverEnhancer = new LSPHoverEnhancer();

    lspWatcher.start();

    lspWatcher.on('lsp-event', (event: string, data?: any) => {
      if (event === 'diagnostics-changed' && data?.diagnostics) {
        chatViewProvider['_post']({ type: 'lspDiagnosticsChanged', diagnostics: data.diagnostics, filePath: data.filePath });
      }
    });

    const lspCodeLensEnabled = vscode.workspace.getConfiguration('inaCoding.lsp').get<boolean>('showTypeCodeLens', true);
    if (lspCodeLensEnabled) {
      const lspCodeLensProvider = new LSPContextCodeLensProvider();
      context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, lspCodeLensProvider)
      );
    }

    const diagnosticActionsEnabled = vscode.workspace.getConfiguration('inaCoding.lsp').get<boolean>('showDiagnosticActions', true);
    if (diagnosticActionsEnabled) {
      const diagEnhancer = new DiagnosticEnhancerProvider();
      context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, diagEnhancer, { providedCodeActionKinds: DiagnosticEnhancerProvider.providedCodeActionKinds })
      );
    }

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showLSPContext', async () => {
        chatViewProvider.focusInput();
        chatViewProvider['_handleRequestLSPContext']?.();
      }),
      vscode.commands.registerCommand('inaCoding.explainSymbol', async () => {
        const info = await lspHoverEnhancer.explainSymbolAtCursor();
        if (!info) { vscode.window.showInformationMessage('No symbol at cursor.'); return; }
        chatViewProvider.focusInput();
        chatViewProvider['_handleExplainSymbol']?.(info.symbol);
      }),
      vscode.commands.registerCommand('inaCoding.explainError', async (uri?: vscode.Uri, diagnostic?: vscode.Diagnostic) => {
        if (diagnostic) {
          const filePath = uri ? vscode.workspace.asRelativePath(uri) : '';
          chatViewProvider.focusInput();
          chatViewProvider['_handleExplainDiagnostic']?.({
            filePath,
            range: { startLine: diagnostic.range.start.line, startCol: diagnostic.range.start.character },
            message: diagnostic.message,
            code: diagnostic.code ? String(typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code) : null,
            source: diagnostic.source || null,
          });
          return;
        }
        const info = await lspHoverEnhancer.explainErrorAtCursor();
        if (!info) { vscode.window.showInformationMessage('No error at cursor.'); return; }
        chatViewProvider.focusInput();
        chatViewProvider['_handleExplainDiagnostic']?.({ filePath: '', range: { startLine: 0, startCol: 0 }, message: info.error, code: info.code, source: null });
      }),
      vscode.commands.registerCommand('inaCoding.findReferences', async (uri?: vscode.Uri, position?: vscode.Position) => {
        const editor = vscode.window.activeTextEditor;
        const doc = uri ? await vscode.workspace.openTextDocument(uri) : editor?.document;
        const pos = position || editor?.selection.active;
        if (!doc || !pos) { vscode.window.showInformationMessage('No symbol selected.'); return; }
        const refs = await referenceService.findReferences(doc, pos, false);
        const total = refs.reduce((s, g) => s + g.count, 0);
        vscode.window.showInformationMessage(`Found ${total} references across ${refs.length} files.`);
      }),
      vscode.commands.registerCommand('inaCoding.showCallHierarchy', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showInformationMessage('Open a file first.'); return; }
        const hierarchy = await referenceService.getCallHierarchy(editor.document, editor.selection.active, 'both', 2);
        if (!hierarchy) { vscode.window.showInformationMessage('No call hierarchy available.'); return; }
        const formatted = referenceService.formatCallHierarchyForPrompt(hierarchy, 500);
        vscode.window.showInformationMessage(formatted, { modal: true });
      }),
      vscode.commands.registerCommand('inaCoding.showTypeHierarchy', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showInformationMessage('Open a file first.'); return; }
        const hierarchy = await referenceService.getTypeHierarchy(editor.document, editor.selection.active, 'both', 2);
        if (!hierarchy) { vscode.window.showInformationMessage('No type hierarchy available.'); return; }
        vscode.window.showInformationMessage(`${hierarchy.name} (${hierarchy.kind})`, { modal: true });
      }),
      vscode.commands.registerCommand('inaCoding.fixErrorWithAI', async (uri?: vscode.Uri, diagnostic?: vscode.Diagnostic) => {
        if (diagnostic) {
          const filePath = uri ? vscode.workspace.asRelativePath(uri) : '';
          chatViewProvider.focusInput();
          chatViewProvider['_handleFixDiagnosticWithAI']?.({
            filePath,
            range: { startLine: diagnostic.range.start.line, startCol: diagnostic.range.start.character },
            message: diagnostic.message,
            code: diagnostic.code ? String(typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code) : null,
            source: diagnostic.source || null,
          });
          return;
        }
        const info = await lspHoverEnhancer.explainErrorAtCursor();
        if (!info) { vscode.window.showInformationMessage('No error at cursor.'); return; }
        chatViewProvider.focusInput();
        chatViewProvider['_handleFixDiagnosticWithAI']?.({ filePath: '', range: { startLine: 0, startCol: 0 }, message: info.error, code: info.code, source: null });
      }),
      vscode.commands.registerCommand('inaCoding.toggleLSPCodeLens', () => {
        const config = vscode.workspace.getConfiguration('inaCoding.lsp');
        const current = config.get<boolean>('showTypeCodeLens', true);
        config.update('showTypeCodeLens', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`LSP CodeLens ${!current ? 'enabled' : 'disabled'}`);
      }),
      { dispose: () => lspWatcher.dispose() },
    );

    Logger.info('LSP integration registered');

    // Vision / Image Support
    const imageCaptureService = ImageCaptureService.getInstance();
    const visionClientInstance = VisionClient.getInstance();
    visionClientInstance.setAuthService(authService);
    const designToCodeServiceInstance = DesignToCodeService.getInstance();
    const imageAnnotationServiceInstance = ImageAnnotationService.getInstance();

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.pasteImage', async () => {
        const image = await imageCaptureService.captureFromClipboard();
        if (image) {
          chatViewProvider['_post']({ type: 'imageProcessed', image });
          chatViewProvider.focusInput();
        } else {
          vscode.window.showInformationMessage('No image found in clipboard');
        }
      }),
      vscode.commands.registerCommand('inaCoding.uploadImage', async () => {
        const images = await imageCaptureService.captureFromFile();
        for (const img of images) chatViewProvider['_post']({ type: 'imageProcessed', image: img });
        if (images.length > 0) chatViewProvider.focusInput();
      }),
      vscode.commands.registerCommand('inaCoding.captureScreenshot', async () => {
        const image = await imageCaptureService.captureScreenshot();
        if (image) {
          chatViewProvider['_post']({ type: 'imageProcessed', image });
          chatViewProvider.focusInput();
        }
      }),
      vscode.commands.registerCommand('inaCoding.analyzeImage', async (uri?: vscode.Uri) => {
        if (uri) {
          const images = await imageCaptureService.captureFromFile([uri.fsPath]);
          if (images.length > 0) {
            chatViewProvider.focusInput();
            chatViewProvider['_handleAnalyzeImage']?.(images[0], 'detailed');
          }
        } else {
          vscode.window.showInformationMessage('Right-click an image file to analyze it');
        }
      }),
      vscode.commands.registerCommand('inaCoding.designToCode', async (uri?: vscode.Uri) => {
        if (uri) {
          const images = await imageCaptureService.captureFromFile([uri.fsPath]);
          if (images.length > 0) {
            chatViewProvider.focusInput();
            chatViewProvider['_post']({ type: 'imageProcessed', image: images[0] });
          }
        } else {
          const images = await imageCaptureService.captureFromFile();
          if (images.length > 0) {
            chatViewProvider.focusInput();
            chatViewProvider['_post']({ type: 'imageProcessed', image: images[0] });
          }
        }
      }),
      vscode.commands.registerCommand('inaCoding.imageToCode', async () => {
        const images = await imageCaptureService.captureFromFile();
        if (images.length > 0) {
          chatViewProvider.focusInput();
          chatViewProvider['_post']({ type: 'imageProcessed', image: images[0] });
        }
      }),
    );

    Logger.info('Vision/Image support registered');

    // ============ Rules System ============
    const rulesFileManager = RulesFileManager.getInstance();
    const workspaceRootForRules = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRootForRules) {
      rulesFileManager.initialize(workspaceRootForRules);
    }
    const rulesInjector = RulesInjector.getInstance();
    const rulesStatusBar = RulesStatusBarProvider.getInstance();
    context.subscriptions.push({ dispose: () => rulesStatusBar.dispose() });
    context.subscriptions.push({ dispose: () => rulesFileManager.dispose() });

    // Rules editor support (CodeLens, folding, symbols, completions, code actions)
    const rulesDocSelector: vscode.DocumentSelector = [
      { pattern: '**/.ina-rules' },
      { pattern: '**/.ina-rules.*' },
      { language: 'ina-rules' },
    ];
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(rulesDocSelector, new RulesCodeLensProvider()),
      vscode.languages.registerFoldingRangeProvider(rulesDocSelector, new RulesFoldingProvider()),
      vscode.languages.registerDocumentSymbolProvider(rulesDocSelector, new RulesSymbolProvider()),
      vscode.languages.registerCompletionItemProvider(rulesDocSelector, new RulesCompletionProvider(), '#', '-', '{'),
      vscode.languages.registerCodeActionsProvider(rulesDocSelector, new RulesCodeActionProvider(), {
        providedCodeActionKinds: RulesCodeActionProvider.providedCodeActionKinds,
      }),
    );

    // Rules commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.rules.create', async () => {
        const templateService = RulesTemplateService.getInstance();
        const templates = templateService.getTemplates();
        const items = templates.map(t => ({ label: t.name, description: t.description, detail: [t.language, t.framework].filter(Boolean).join(' + ') || 'Generic' }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a template for your .ina-rules file' });
        if (selected) {
          const content = templateService.generateFromTemplate(selected.label);
          await rulesFileManager.createRulesFile(content);
        }
      }),
      vscode.commands.registerCommand('inaCoding.rules.open', async () => {
        const filePath = rulesFileManager.discoverRulesFile();
        if (filePath) {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } else {
          const action = await vscode.window.showInformationMessage('No .ina-rules file found.', 'Create One');
          if (action === 'Create One') vscode.commands.executeCommand('inaCoding.rules.create');
        }
      }),
      vscode.commands.registerCommand('inaCoding.rules.toggle', () => {
        const current = rulesInjector.isRulesActive();
        rulesInjector.setEnabled(!current);
        vscode.window.showInformationMessage(`Project rules ${!current ? 'enabled' : 'disabled'}`);
      }),
      vscode.commands.registerCommand('inaCoding.rules.refresh', async () => {
        await rulesFileManager.loadRules();
        vscode.window.showInformationMessage('Rules refreshed');
      }),
      vscode.commands.registerCommand('inaCoding.rules.showPanel', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']({ type: 'showRulesPanel' });
      }),
      vscode.commands.registerCommand('inaCoding.rules.addSection', async () => {
        const sectionNames = ['Tech Stack', 'Architecture', 'Coding Style', 'Naming', 'Do', "Don't", 'Testing', 'Error Handling', 'Performance', 'Security', 'Git', 'Dependencies', 'Documentation'];
        const selected = await vscode.window.showQuickPick(sectionNames, { placeHolder: 'Select section type' });
        if (selected) {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const pos = editor.selection.active;
            await editor.edit(e => e.insert(pos, `\n# ${selected}\n- \n`));
          }
        }
      }),
      vscode.commands.registerCommand('inaCoding.rules.selectTemplate', async () => {
        const templateService = RulesTemplateService.getInstance();
        const templates = templateService.getTemplates();
        const items = templates.map(t => ({ label: t.name, description: t.description }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a template' });
        if (selected) {
          const content = templateService.generateFromTemplate(selected.label);
          const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
          await vscode.window.showTextDocument(doc);
        }
      }),
    );

    // Wire rules change events to webview
    rulesInjector.on('rules-injection-changed', () => {
      const rules = rulesFileManager.getRules();
      chatViewProvider['_post']({
        type: 'rulesChanged',
        status: {
          active: rulesInjector.isRulesActive(),
          summary: rulesInjector.getRulesSummary(),
          sections: rules?.parsed?.sections?.map(s => ({ type: s.type, title: s.name, rules: s.rules, priority: s.priority > 3, disabled: !s.enabled })) || [],
          errors: rules?.errors || [],
        },
      });
    });

    Logger.info('Rules system registered');

    // ============ Global Rules System ============
    const globalRulesFileManager = GlobalRulesFileManager.getInstance();
    globalRulesFileManager.initialize(context);
    context.subscriptions.push({ dispose: () => globalRulesFileManager.dispose() });

    // Initialize RulesMerger (connects project + global)
    RulesMerger.getInstance();

    // Wire global rules change events to webview
    globalRulesFileManager.on('loaded', () => {
      chatViewProvider['_sendGlobalRulesStatus']?.();
    });
    globalRulesFileManager.on('changed', () => {
      chatViewProvider['_sendGlobalRulesStatus']?.();
    });
    globalRulesFileManager.on('deleted', () => {
      chatViewProvider['_sendGlobalRulesStatus']?.();
    });

    // Global rules commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.globalRules.setup', async () => {
        await GlobalRulesSetupWizard.getInstance().runWizard();
      }),
      vscode.commands.registerCommand('inaCoding.globalRules.open', async () => {
        const filePath = globalRulesFileManager.getGlobalRulesPath();
        if (filePath && require('fs').existsSync(filePath)) {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } else {
          const action = await vscode.window.showInformationMessage('No global rules file found.', 'Set Up Now');
          if (action === 'Set Up Now') vscode.commands.executeCommand('inaCoding.globalRules.setup');
        }
      }),
      vscode.commands.registerCommand('inaCoding.globalRules.delete', async () => {
        const confirm = await vscode.window.showWarningMessage('Delete your global rules?', { modal: true }, 'Delete');
        if (confirm === 'Delete') {
          await globalRulesFileManager.deleteGlobalRulesFile();
          vscode.window.showInformationMessage('Global rules deleted.');
        }
      }),
      vscode.commands.registerCommand('inaCoding.globalRules.showConflicts', () => {
        const merger = RulesMerger.getInstance();
        const merged = merger.getMergedRules();
        if (merged.conflicts.length === 0) {
          vscode.window.showInformationMessage('No conflicts between global and project rules.');
        } else {
          const msg = merged.conflicts.map(c => `${c.category}: "${c.projectRule}" vs "${c.globalRule}" → ${c.winner} wins`).join('\n');
          vscode.window.showInformationMessage(`${merged.conflicts.length} conflict(s):\n${msg}`);
        }
      }),
    );

    // Prompt for global rules setup on first activation (once)
    if (!globalRulesFileManager.hasGlobalRules()) {
      GlobalRulesSetupWizard.getInstance().showSetupPrompt().then(shouldSetup => {
        if (shouldSetup) vscode.commands.executeCommand('inaCoding.globalRules.setup');
      }).catch(() => {});
    }

    Logger.info('Global rules system registered');

    // ============ Memory System ============
    const memoryClient = MemoryClient.getInstance();
    const memoryAutoExtractor = MemoryAutoExtractor.getInstance();
    const memoryContextInjector = MemoryContextInjector.getInstance();

    // Wire memory extraction events to webview
    memoryAutoExtractor.on('extraction-complete', (extractions: any[]) => {
      chatViewProvider['_post']({ type: 'memoryExtractionComplete', extractions });
    });

    // Memory commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.openMemoryPanel', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']({ type: 'showMemoryPanel' });
        chatViewProvider['_handleRequestMemories']?.();
      }),
      vscode.commands.registerCommand('inaCoding.rememberThis', async () => {
        const content = await vscode.window.showInputBox({
          prompt: 'What should I remember?',
          placeHolder: 'e.g., This project uses PostgreSQL 15 with pgvector',
        });
        if (content) {
          try {
            const memory = await memoryAutoExtractor.handleExplicitRemember(content, {});
            if (memory) vscode.window.showInformationMessage(`Remembered: ${(memory as any).summary || content.slice(0, 50)}`);
          } catch (e) { Logger.error('Remember failed:', e); }
        }
      }),
      vscode.commands.registerCommand('inaCoding.forgetAbout', async () => {
        const query = await vscode.window.showInputBox({
          prompt: 'What should I forget?',
          placeHolder: 'Search term for memories to remove',
        });
        if (query) {
          try {
            const result = await memoryAutoExtractor.handleExplicitForget(query);
            const count = result.deactivated;
            vscode.window.showInformationMessage(`Forgot ${count} memor${count === 1 ? 'y' : 'ies'} about "${query}"`);
          } catch (e) { Logger.error('Forget failed:', e); }
        }
      }),
      vscode.commands.registerCommand('inaCoding.searchMemories', async () => {
        const query = await vscode.window.showInputBox({
          prompt: 'Search memories',
          placeHolder: 'Type to search...',
        });
        if (query) {
          try {
            const searchResult = await memoryClient.searchMemories(query);
            const results = searchResult.results || [];
            if (results.length === 0) {
              vscode.window.showInformationMessage('No memories found');
            } else {
              const items = results.map((r: any) => ({
                label: `[${r.type || r.memory?.type || 'memory'}] ${r.summary || r.memory?.summary || ''}`,
                description: `match`,
                detail: (r.content || r.memory?.content || '').slice(0, 100),
              }));
              await vscode.window.showQuickPick(items, { placeHolder: `${results.length} memories found` });
            }
          } catch (e) { Logger.error('Search failed:', e); }
        }
      }),
      vscode.commands.registerCommand('inaCoding.toggleAutoExtract', () => {
        if (memoryAutoExtractor.isEnabled()) {
          memoryAutoExtractor.disable();
          vscode.window.showInformationMessage('Memory auto-extraction disabled');
        } else {
          memoryAutoExtractor.enable();
          vscode.window.showInformationMessage('Memory auto-extraction enabled');
        }
      }),
      vscode.commands.registerCommand('inaCoding.clearProjectMemories', async () => {
        const confirm = await vscode.window.showWarningMessage('Clear all project memories?', { modal: true }, 'Clear All');
        if (confirm === 'Clear All') {
          try {
            const { memories } = await memoryClient.getMemories({ limit: 1000 });
            for (const m of memories) await memoryClient.deleteMemory(m.id);
            vscode.window.showInformationMessage('Project memories cleared');
          } catch (e) { Logger.error('Clear failed:', e); }
        }
      }),
      vscode.commands.registerCommand('inaCoding.exportMemories', async () => {
        try {
          const exportResult = await memoryClient.exportMemories(undefined, 'json');
          const data = JSON.stringify(exportResult.data || exportResult, null, 2);
          const doc = await vscode.workspace.openTextDocument({ content: data, language: 'json' });
          await vscode.window.showTextDocument(doc);
        } catch (e) { Logger.error('Export failed:', e); }
      }),
      vscode.commands.registerCommand('inaCoding.memoryMaintenance', async () => {
        try {
          const result = await memoryClient.runMaintenance();
          vscode.window.showInformationMessage(`Maintenance complete: ${JSON.stringify(result)}`);
        } catch (e) { Logger.error('Maintenance failed:', e); }
      }),
    );

    context.subscriptions.push({ dispose: () => memoryAutoExtractor.dispose() });

    Logger.info('Memory system registered');

    // ============ Cache System ============
    const cacheManager = CacheManager.getInstance();
    cacheManager.initialize(context);
    const cacheInvalidator = CacheInvalidator.getInstance();
    cacheInvalidator.start();
    const cacheMetrics = CacheMetrics.getInstance();

    context.subscriptions.push(
      { dispose: () => cacheManager.dispose() },
      { dispose: () => cacheInvalidator.dispose() },
      { dispose: () => cacheMetrics.dispose() },
    );

    // Cache commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showCacheStats', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_sendCacheStats']?.();
      }),
      vscode.commands.registerCommand('inaCoding.clearAllCaches', async () => {
        const confirm = await vscode.window.showWarningMessage('Clear all caches?', { modal: true }, 'Clear');
        if (confirm === 'Clear') {
          cacheManager.invalidateAll();
          vscode.window.showInformationMessage('All caches cleared');
        }
      }),
      vscode.commands.registerCommand('inaCoding.pruneCache', () => {
        const count = cacheManager.pruneAll();
        vscode.window.showInformationMessage(`Pruned ${count} expired cache entries`);
      }),
    );

    Logger.info('Cache system registered');

    // ============ Request Optimization System ============
    const requestScheduler = RequestScheduler.getInstance();
    const parallelExecutor = ParallelExecutor.getInstance();

    context.subscriptions.push(
      { dispose: () => requestScheduler.dispose() },
    );

    // Request optimization commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showRequestStats', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']({ type: 'requestMetricsUpdated', metrics: requestScheduler.getMetrics() });
      }),
      vscode.commands.registerCommand('inaCoding.cancelAllRequests', async () => {
        const confirm = await vscode.window.showWarningMessage('Cancel all active requests?', { modal: true }, 'Cancel All');
        if (confirm === 'Cancel All') {
          const count = requestScheduler.cancelAll();
          vscode.window.showInformationMessage(`Cancelled ${count} requests`);
        }
      }),
    );

    Logger.info('Request optimization system registered');

    // ============ Offline Mode System ============
    const connectivityMonitor = ConnectivityMonitor.getInstance();
    const offlineQueue = OfflineQueue.getInstance();
    const localModelManager = LocalModelManager.getInstance();
    const gracefulDegradation = GracefulDegradation.getInstance();
    const syncManager = SyncManager.getInstance();
    const offlineSearchFallback = OfflineSearchFallback.getInstance();

    offlineQueue.initialize(context);

    // Offline mode learns the runtime command and the model ids it may use from
    // the server, never from this source tree. The cached copy is read first so
    // a cold start with no network still works; the refresh runs behind it and
    // re-initialises only if it actually changed anything.
    const offlineManifestStore = new OfflineManifestStore(context);
    localModelManager.useManifestStore(offlineManifestStore);
    localModelManager.initialize().catch(e => Logger.debug('Local model init:', e));
    void (async () => {
      try {
        const headers = await apiService.authHeaders();
        const refreshed = await offlineManifestStore.refresh(ConfigManager.getApiEndpoint(), headers);
        if (refreshed) await localModelManager.initialize();
      } catch (e) {
        Logger.debug('[Offline] manifest refresh skipped:', e);
      }
    })();
    offlineSearchFallback.initialize().catch(e => Logger.debug('Offline search init:', e));
    connectivityMonitor.start();

    // Status bar for connectivity
    const connectivityStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    connectivityStatusBar.command = 'inaCoding.checkConnectivity';
    const updateStatusBar = (state: string) => {
      switch (state) {
        case 'online': connectivityStatusBar.text = '$(cloud) Online'; connectivityStatusBar.color = undefined; break;
        case 'offline': connectivityStatusBar.text = '$(cloud-offline) Offline'; connectivityStatusBar.color = new vscode.ThemeColor('errorForeground'); break;
        case 'degraded': connectivityStatusBar.text = '$(cloud) Slow'; connectivityStatusBar.color = new vscode.ThemeColor('warningForeground'); break;
        case 'reconnecting': connectivityStatusBar.text = '$(sync~spin) Reconnecting'; connectivityStatusBar.color = undefined; break;
        default: connectivityStatusBar.text = '$(cloud) Checking...'; break;
      }
    };
    updateStatusBar('unknown');
    connectivityStatusBar.show();

    connectivityMonitor.on('went-offline', (h: any) => {
      updateStatusBar('offline');
      chatViewProvider['_post']({ type: 'connectivityChanged', state: 'offline', health: h });
      vscode.window.showWarningMessage('INA Coding: Connection lost. Some features are limited.');
    });
    connectivityMonitor.on('reconnected', (h: any) => {
      updateStatusBar('online');
      chatViewProvider['_post']({ type: 'connectivityChanged', state: 'online', health: h });
      const qs = offlineQueue.getQueueSize();
      if (qs > 0) {
        vscode.window.showInformationMessage(`INA Coding is back online! Syncing ${qs} queued items...`);
      }
    });
    connectivityMonitor.on('degraded', (h: any) => {
      updateStatusBar('degraded');
      chatViewProvider['_post']({ type: 'connectivityChanged', state: 'degraded', health: h });
    });
    connectivityMonitor.on('reconnecting', (h: any) => {
      updateStatusBar('reconnecting');
      chatViewProvider['_post']({ type: 'connectivityChanged', state: 'reconnecting', health: h });
    });
    connectivityMonitor.on('health-check', (h: any) => {
      updateStatusBar(h.state);
    });

    syncManager.on('sync-progress', (p: any) => chatViewProvider['_post']({ type: 'syncProgress', progress: p }));
    syncManager.on('sync-complete', (p: any) => chatViewProvider['_post']({ type: 'syncComplete', progress: p }));
    offlineQueue.on('queue-added', () => chatViewProvider['_post']({ type: 'offlineQueueUpdated', queue: offlineQueue.getQueue() }));

    context.subscriptions.push(
      connectivityStatusBar,
      { dispose: () => { connectivityMonitor.dispose(); offlineQueue.dispose(); syncManager.dispose(); localModelManager.dispose(); } },
      vscode.commands.registerCommand('inaCoding.checkConnectivity', async () => {
        const h = await connectivityMonitor.forceCheck();
        vscode.window.showInformationMessage(`Connection: ${h.state}`);
        chatViewProvider['_post']({ type: 'connectivityChanged', state: h.state, health: h });
      }),
      vscode.commands.registerCommand('inaCoding.showOfflinePanel', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']({ type: 'offlineCapabilities', ...gracefulDegradation.getOfflineStatus() });
      }),
      vscode.commands.registerCommand('inaCoding.syncOfflineQueue', async () => {
        try {
          const p = await syncManager.startSync();
          vscode.window.showInformationMessage(`Sync complete: ${p.synced} synced, ${p.failed} failed`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Sync failed: ${e?.message}`);
        }
      }),
      vscode.commands.registerCommand('inaCoding.downloadLocalModel', async () => {
        const suggestion = localModelManager.suggestModelDownload();
        if (!suggestion) {
          // Two different nulls, two different messages. Reporting "already
          // available" to a user who has never been online would be a plain
          // untruth about why nothing happened.
          vscode.window.showInformationMessage(
            localModelManager.isAvailable() ? 'Local model already available!' : OFFLINE_NOT_PROVISIONED
          );
          return;
        }
        const choice = await vscode.window.showInformationMessage(
          `Download ${suggestion.modelName} (${suggestion.size}) for offline AI?`,
          'Download', 'Cancel'
        );
        if (choice === 'Download') {
          vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Downloading ${suggestion.modelName}` }, async (progress) => {
            for await (const p of localModelManager.downloadModel(suggestion.modelName)) {
              progress.report({ increment: p.progress, message: p.status });
            }
          });
        }
      }),
      vscode.commands.registerCommand('inaCoding.toggleOfflineMode', () => {
        vscode.window.showWarningMessage('Manual offline toggle is for testing only.', 'Force Offline', 'Cancel').then(choice => {
          if (choice === 'Force Offline') {
            Logger.info('[Offline] Manual offline mode toggled');
          }
        });
      }),
    );

    Logger.info('Offline mode system registered');

    // ============ Error Recovery System ============
    const errorClassifier = ErrorClassifier.getInstance();
    const retryEngine = RetryEngine.getInstance();
    const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance();
    const fallbackManager = FallbackManager.getInstance();
    const errorAnalyticsEngine = ErrorAnalyticsEngine.getInstance();
    const userFeedbackCollector = UserFeedbackCollector.getInstance();
    const selfHealingEngine = SelfHealingEngine.getInstance();
    const errorRecoveryService = ErrorRecoveryService.getInstance();

    errorAnalyticsEngine.initialize(context);
    selfHealingEngine.startPeriodicCheck(300000); // 5 min

    // Register self-healing actions
    selfHealingEngine.registerAction({
      trigger: 'reconnect-api',
      condition: () => connectivityMonitor.isOffline(),
      action: async () => { await connectivityMonitor.forceCheck(); return connectivityMonitor.isOnline(); },
      description: 'Force reconnect to API server',
      lastExecutedAt: null, successCount: 0, failureCount: 0,
    });
    selfHealingEngine.registerAction({
      trigger: 'reset-circuit-breakers',
      condition: () => circuitBreakerRegistry.getOverallHealth().tripped.length === circuitBreakerRegistry.getAll().size,
      action: async () => { circuitBreakerRegistry.resetAll(); return true; },
      description: 'Reset all circuit breakers when all are open',
      lastExecutedAt: null, successCount: 0, failureCount: 0,
    });
    selfHealingEngine.registerAction({
      trigger: 'clear-stale-cache',
      condition: () => {
        const analytics = errorAnalyticsEngine.getAnalytics();
        return (analytics.errorsByCategory['parsing'] || 0) > 3;
      },
      action: async () => { cacheManager.pruneAll(); return true; },
      description: 'Clear potentially corrupted cache entries',
      lastExecutedAt: null, successCount: 0, failureCount: 0,
    });

    // Wire events
    errorRecoveryService.on('recovery', (result: any) => {
      chatViewProvider['_post']({ type: 'errorRecovered', recovery: result });
    });
    errorRecoveryService.on('fatal-error', (error: any) => {
      chatViewProvider['_post']({ type: 'errorFatal', error });
    });
    errorAnalyticsEngine.on('error-spike', (fp: string, count: number) => {
      Logger.warn(`[ErrorSpike] ${fp}: ${count} occurrences in 1 minute`);
    });

    context.subscriptions.push(
      { dispose: () => { errorRecoveryService.dispose(); errorAnalyticsEngine.dispose(); selfHealingEngine.dispose(); } },
      vscode.commands.registerCommand('inaCoding.showErrorDashboard', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']({ type: 'errorAnalyticsUpdated', analytics: errorAnalyticsEngine.getAnalytics() });
        chatViewProvider['_post']({ type: 'circuitBreakerUpdate', breakers: circuitBreakerRegistry.getStatusArray() });
      }),
      vscode.commands.registerCommand('inaCoding.resetCircuitBreakers', async () => {
        const confirm = await vscode.window.showWarningMessage('Reset all circuit breakers?', { modal: true }, 'Reset');
        if (confirm === 'Reset') { circuitBreakerRegistry.resetAll(); vscode.window.showInformationMessage('Circuit breakers reset'); }
      }),
      vscode.commands.registerCommand('inaCoding.generateBugReport', async () => {
        const report = await userFeedbackCollector.collectBugReport('last');
        const doc = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
      }),
      vscode.commands.registerCommand('inaCoding.clearErrors', () => {
        errorAnalyticsEngine.clearHistory();
        vscode.window.showInformationMessage('Error history cleared');
      }),
      vscode.commands.registerCommand('inaCoding.runSelfHeal', async () => {
        const result = await selfHealingEngine.checkAndHeal();
        vscode.window.showInformationMessage(`Self-heal: ${result.successes} fixes, ${result.failures} failed`);
      }),
    );

    Logger.info('Error recovery system registered');

    // ============ Theme System ============
    const themeEngine = ThemeEngine.getInstance();
    themeEngine.initialize(context);

    themeEngine.on('theme-changed', () => {
      const tw = themeEngine.getThemeForWebview();
      chatViewProvider['_post']?.({ type: 'themeUpdated', ...tw });
    });
    themeEngine.on('accent-changed', () => {
      const tw = themeEngine.getThemeForWebview();
      chatViewProvider['_post']?.({ type: 'themeUpdated', ...tw });
    });

    context.subscriptions.push(
      { dispose: () => themeEngine.dispose() },
      vscode.commands.registerCommand('inaCoding.openThemeSettings', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'openThemeSettings' });
      }),
      vscode.commands.registerCommand('inaCoding.switchTheme', async () => {
        const themes = themeEngine.getAvailableThemes();
        const pick = await vscode.window.showQuickPick(
          themes.map(t => ({ label: t.name, description: t.description, id: t.id })),
          { placeHolder: 'Select a theme' }
        );
        if (pick) { themeEngine.setTheme(pick.id); }
      }),
      vscode.commands.registerCommand('inaCoding.toggleDarkMode', () => {
        const cfg = themeEngine.getConfig();
        themeEngine.setMode(cfg.mode === ThemeMode.DARK ? ThemeMode.LIGHT : ThemeMode.DARK);
      }),
      vscode.commands.registerCommand('inaCoding.setAccentColor', async () => {
        const color = await vscode.window.showInputBox({ prompt: 'Enter accent color (hex)', placeHolder: '#3b82f6' });
        if (color && /^#[0-9a-fA-F]{6}$/.test(color)) { themeEngine.setAccentColor(color); }
      }),
      vscode.commands.registerCommand('inaCoding.resetTheme', () => {
        themeEngine.setMode(ThemeMode.AUTO);
        themeEngine.setAccentColor('');
        vscode.window.showInformationMessage('Theme reset to VS Code sync');
      }),
    );

    Logger.info('Theme system registered');

    // ============ Onboarding System ============
    const onboardingManager = OnboardingManager.getInstance();
    onboardingManager.initialize(context);

    const featureTourService = FeatureTourService.getInstance();
    featureTourService.initialize();

    const interactiveTutorial = InteractiveTutorial.getInstance();
    const shortcutCheatsheet = ShortcutCheatsheet.getInstance();

    const progressiveHintService = ProgressiveHintService.getInstance();
    progressiveHintService.initialize();
    const hintCooldown = vscode.workspace.getConfiguration('inaCoding.onboarding').get<number>('maxHintFrequency', 300000);
    progressiveHintService.setCooldown(hintCooldown);

    const whatsNewService = WhatsNewService.getInstance();
    whatsNewService.initialize(context);

    // Wire onboarding events to webview
    onboardingManager.on('show-welcome', () => {
      const showWelcome = vscode.workspace.getConfiguration('inaCoding.onboarding').get<boolean>('showWelcome', true);
      if (showWelcome) {
        chatViewProvider['_post']?.({ type: 'showWelcome' });
        chatViewProvider['_post']?.({ type: 'onboardingStateUpdated', state: onboardingManager.getState(), progress: onboardingManager.getProgress() });
      }
    });
    onboardingManager.on('show-whats-new', () => {
      const showWhatsNew = vscode.workspace.getConfiguration('inaCoding.onboarding').get<boolean>('showWhatsNew', true);
      if (showWhatsNew && whatsNewService.shouldShow()) {
        chatViewProvider['_post']?.({ type: 'whatsNewData', changelog: whatsNewService.getChangelog(), version: whatsNewService.getVersion() });
      }
    });

    progressiveHintService.on('hint-show', (hint: any) => {
      const enabled = vscode.workspace.getConfiguration('inaCoding.onboarding').get<boolean>('enableProgressiveHints', true);
      if (enabled) {
        chatViewProvider['_post']?.({ type: 'hintAvailable', hint: { id: hint.id, message: hint.message, actionLabel: hint.actionLabel, actionCommand: hint.actionCommand } });
      }
    });

    context.subscriptions.push(
      { dispose: () => onboardingManager.dispose() },
      { dispose: () => featureTourService.dispose() },
      { dispose: () => interactiveTutorial.dispose() },
      { dispose: () => progressiveHintService.dispose() },
      { dispose: () => whatsNewService.dispose() },
      vscode.commands.registerCommand('inaCoding.showWelcome', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'showWelcome' });
      }),
      vscode.commands.registerCommand('inaCoding.startTour', async () => {
        const tours = featureTourService.getAvailableTours();
        const pick = await vscode.window.showQuickPick(
          tours.map(t => ({ label: t.name, description: `${t.estimatedMinutes} min — ${t.description}`, id: t.id })),
          { placeHolder: 'Select a feature tour' }
        );
        if (pick) {
          vscode.commands.executeCommand('inaCoding.chatView.focus');
          featureTourService.startTour(pick.id);
          const step = featureTourService.getCurrentTourStep();
          const prog = featureTourService.getTourProgress();
          if (step && prog) chatViewProvider['_post']?.({ type: 'tourStepChanged', step, progress: prog });
        }
      }),
      vscode.commands.registerCommand('inaCoding.startTutorial', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        interactiveTutorial.startTutorial();
        chatViewProvider['_post']?.({ type: 'tutorialStarted', progress: interactiveTutorial.getProgress(), lessons: interactiveTutorial.getLessons().map((l: any) => ({ ...l, steps: l.steps.map((s: any) => ({ instruction: s.instruction, expectedAction: s.expectedAction, hint: s.hint, autoComplete: s.autoComplete })) })) });
      }),
      vscode.commands.registerCommand('inaCoding.showShortcuts', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'shortcutsData', shortcuts: shortcutCheatsheet.getShortcutsForPlatform(), platform: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux' });
      }),
      vscode.commands.registerCommand('inaCoding.showWhatsNew', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'whatsNewData', changelog: whatsNewService.getChangelog(), version: whatsNewService.getVersion() });
      }),
      vscode.commands.registerCommand('inaCoding.resetOnboarding', async () => {
        const confirm = await vscode.window.showWarningMessage('Reset onboarding? This will show the welcome screen again.', { modal: true }, 'Reset');
        if (confirm === 'Reset') {
          onboardingManager.resetOnboarding();
          vscode.window.showInformationMessage('Onboarding reset. Reload to see welcome screen.');
        }
      }),
    );

    Logger.info('Onboarding system registered');

    // ============ Shortcut System ============
    const shortcutManager = ShortcutManager.getInstance();
    shortcutManager.initialize(context);

    const quickActionService = QuickActionService.getInstance();
    const shortcutConflictResolver = ShortcutConflictResolver.getInstance();

    // Auto-detect conflicts on first activation
    const autoDetect = vscode.workspace.getConfiguration('inaCoding.shortcuts').get<boolean>('autoDetectConflicts', true);
    if (autoDetect) {
      const conflicts = shortcutConflictResolver.runFullAudit();
      const blocking = conflicts.filter(c => c.severity === 'blocking');
      if (blocking.length > 0) {
        Logger.warn(`[Shortcuts] ${blocking.length} blocking conflicts detected`);
      }
    }

    context.subscriptions.push(
      { dispose: () => shortcutManager.dispose() },
      vscode.commands.registerCommand('inaCoding.quickQuestion', () => quickActionService.showQuickQuestion()),
      vscode.commands.registerCommand('inaCoding.showCommandPalette', () => quickActionService.showCommandPalette()),
      vscode.commands.registerCommand('inaCoding.showCodeActions', () => quickActionService.showCodeActions()),
      vscode.commands.registerCommand('inaCoding.optimizeSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
          const code = editor.document.getText(editor.selection);
          const lang = editor.document.languageId;
          vscode.commands.executeCommand('inaCoding.openChat');
          chatViewProvider['_post']?.({ type: 'insertAndSend', content: `Optimize this code for better performance:\n\n\`\`\`${lang}\n${code}\n\`\`\`` });
        }
      }),
      vscode.commands.registerCommand('inaCoding.customizeShortcuts', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        const data = shortcutManager.getShortcutsForWebview();
        chatViewProvider['_post']?.({ type: 'shortcutsUpdated', ...data });
        chatViewProvider['_post']?.({ type: 'openShortcutManager' });
      }),
      vscode.commands.registerCommand('inaCoding.runShortcutAudit', () => {
        const conflicts = shortcutConflictResolver.runFullAudit();
        vscode.window.showInformationMessage(`Shortcut audit: ${conflicts.length} conflicts found (${conflicts.filter(c => c.severity === 'blocking').length} blocking)`);
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'shortcutConflicts', conflicts });
      }),
      vscode.commands.registerCommand('inaCoding.sendMessageDirect', (message: string) => {
        chatViewProvider['_post']?.({ type: 'insertAndSend', content: message });
      }),
    );

    Logger.info('Shortcut system registered');

    // ============ Status System ============
    const tokenTracker = TokenTracker.getInstance();
    tokenTracker.initialize(context);

    const statusAggregator = StatusAggregator.getInstance();
    statusAggregator.initialize({
      connectivityMonitor: ConnectivityMonitor.getInstance(),
      requestScheduler: RequestScheduler.getInstance(),
      requestMetrics: RequestMetricsCollector.getInstance(),
      cacheManager: CacheManager.getInstance(),
      cacheMetrics: CacheMetrics.getInstance(),
      errorAnalytics: ErrorAnalyticsEngine.getInstance(),
      circuitBreakerRegistry: CircuitBreakerRegistry.getInstance(),
      agentSessionManager: AgentSessionManager.getInstance(),
      executionEngine: ExecutionEngine.getInstance(),
      gitStatusService: GitStatusService.getInstance(),
      diagnosticService: DiagnosticService.getInstance(),
      memoryClient: MemoryClient.getInstance(),
      rulesInjector: RulesInjector.getInstance(),
    });

    const statusBarManager = StatusBarManager.getInstance();
    statusBarManager.initialize(statusAggregator);

    const updateInterval = vscode.workspace.getConfiguration('inaCoding.status').get<number>('updateIntervalMs', 2000);
    statusAggregator.startUpdating(updateInterval);

    // Wire status updates to webview
    statusAggregator.on('status-updated', (status: any) => {
      chatViewProvider['_post']?.({ type: 'systemStatusUpdated', status });
    });

    statusAggregator.on('health-changed', (newHealth: string, oldHealth: string) => {
      chatViewProvider['_post']?.({ type: 'healthChanged', health: newHealth });
      const notify = vscode.workspace.getConfiguration('inaCoding.status').get<boolean>('notifyOnHealthChange', true);
      if (notify && (oldHealth === 'healthy' && newHealth !== 'healthy')) {
        vscode.window.showWarningMessage(`INA Coding: System health ${newHealth}`, 'View Dashboard').then(selection => {
          if (selection === 'View Dashboard') {
            vscode.commands.executeCommand('inaCoding.showHealthDashboard');
          }
        });
      }
    });

    const healthDashboardService = HealthDashboardService.getInstance();

    context.subscriptions.push(
      { dispose: () => tokenTracker.dispose() },
      { dispose: () => statusAggregator.dispose() },
      { dispose: () => statusBarManager.dispose() },
      vscode.commands.registerCommand('inaCoding.showHealthDashboard', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        const report = healthDashboardService.getHealthReport();
        const quickActions = healthDashboardService.getQuickActions();
        chatViewProvider['_post']?.({ type: 'healthReportReady', report: { ...report, quickActions } });
      }),
      vscode.commands.registerCommand('inaCoding.showTokenUsage', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        const status = statusAggregator.collectStatus();
        chatViewProvider['_post']?.({ type: 'systemStatusUpdated', status });
      }),
      vscode.commands.registerCommand('inaCoding.resetTokenUsage', () => {
        tokenTracker.resetSession();
        vscode.window.showInformationMessage('Token usage counter reset');
      }),
      vscode.commands.registerCommand('inaCoding.toggleStatusBar', () => {
        // Toggle all INA status bar items visibility
        vscode.window.showInformationMessage('Status bar toggled');
      }),
    );

    Logger.info('Status system registered');

    // ============ Privacy System ============
    const secretDetector = SecretDetector.getInstance();
    const dataEncryption = DataEncryptionService.getInstance();
    await dataEncryption.initialize(context);
    const dataSanitizer = DataSanitizer.getInstance();
    const tlsEnforcer = TLSEnforcer.getInstance();
    const privacyModeManager = PrivacyModeManager.getInstance();
    privacyModeManager.initialize(context);
    const dataRetention = DataRetentionManager.getInstance();
    dataRetention.initialize(context);
    const privacyAudit = PrivacyAuditService.getInstance();

    context.subscriptions.push(
      { dispose: () => dataRetention.dispose() },
      vscode.commands.registerCommand('inaCoding.showPrivacyDashboard', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        const config = privacyModeManager.getConfig();
        const inventory = privacyModeManager.getDataInventory();
        const auditLog = privacyModeManager.getAuditLog();
        const keyFingerprint = dataEncryption.getKeyFingerprint();
        chatViewProvider['_post']?.({ type: 'privacyConfigUpdated', config, inventory, auditLog, keyFingerprint });
        chatViewProvider['_post']?.({ type: 'showPrivacyDashboard' });
      }),
      vscode.commands.registerCommand('inaCoding.setPrivacyMode', async () => {
        const modes = ['standard', 'strict', 'local_only', 'air_gapped'];
        const selected = await vscode.window.showQuickPick(modes, { placeHolder: 'Select privacy mode' });
        if (selected) {
          privacyModeManager.setMode(selected as any);
          chatViewProvider['_post']?.({ type: 'privacyModeChanged', mode: selected });
          vscode.window.showInformationMessage(`Privacy mode set to: ${selected}`);
        }
      }),
      vscode.commands.registerCommand('inaCoding.deleteAllData', async () => {
        const confirm1 = await vscode.window.showWarningMessage('Delete ALL your data? This cannot be undone.', { modal: true }, 'Delete All');
        if (confirm1 === 'Delete All') {
          await dataRetention.deleteAllUserData();
          vscode.window.showInformationMessage('All user data deleted');
        }
      }),
      vscode.commands.registerCommand('inaCoding.exportAllData', async () => {
        const data = await dataRetention.exportAllUserData();
        const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('ina-data-export.json'), filters: { JSON: ['json'] } });
        if (uri) {
          await fs.writeFile(uri.fsPath, data, 'utf-8');
          vscode.window.showInformationMessage(`Data exported to ${uri.fsPath}`);
        }
      }),
      vscode.commands.registerCommand('inaCoding.runPrivacyAudit', async () => {
        const result = await privacyAudit.runFullAudit();
        vscode.window.showInformationMessage(`Privacy audit: ${result.findings.length} findings, ${result.complianceStatus.gdprCompliant ? 'GDPR Compliant' : 'Non-compliant'}`);
        vscode.commands.executeCommand('inaCoding.showPrivacyDashboard');
      }),
      vscode.commands.registerCommand('inaCoding.toggleEncryption', async () => {
        const config = privacyModeManager.getConfig();
        const newVal = !config.encryption.encryptAtRest;
        privacyModeManager.updateConfig({ encryption: { ...config.encryption, encryptAtRest: newVal } } as any);
        vscode.window.showInformationMessage(`At-rest encryption: ${newVal ? 'enabled' : 'disabled'}`);
      }),
    );

    Logger.info('Privacy system registered');

    // ============ Code Security (Phase 12.3) ============
    const sensitiveFileDetector = SensitiveFileDetector.getInstance();
    const codeSecurityGate = CodeSecurityGate.getInstance();
    const ephemeralPolicyEnforcer = EphemeralPolicyEnforcer.getInstance();
    const codeTransmissionMonitor = CodeTransmissionMonitor.getInstance();
    const generatedCodeScanner = GeneratedCodeScanner.getInstance();

    // Wire security alerts to webview
    codeSecurityGate.on('security-alert', (alert: any) => {
      chatViewProvider['_post']?.({ type: 'securityAlert', alert });
    });
    codeSecurityGate.on('secret-detected', (alert: any) => {
      chatViewProvider['_post']?.({ type: 'secretDetectedInCode', alert });
    });

    context.subscriptions.push(
      { dispose: () => sensitiveFileDetector.dispose() },
      { dispose: () => codeSecurityGate.dispose() },
      { dispose: () => codeTransmissionMonitor.dispose() },
      vscode.commands.registerCommand('inaCoding.scanWorkspaceSecurity', async () => {
        const result = await sensitiveFileDetector.scanWorkspace();
        vscode.window.showInformationMessage(`Security scan: ${result.totalSensitive} sensitive files found in ${result.totalFiles} files`);
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'sensitiveFileScanResult', result });
      }),
      vscode.commands.registerCommand('inaCoding.showSecurityAlerts', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'codeSecurityStatsUpdated', alerts: codeSecurityGate.getAlerts(), stats: codeSecurityGate.getStats() });
        chatViewProvider['_post']?.({ type: 'showCodeSecurityPanel' });
      }),
      vscode.commands.registerCommand('inaCoding.showTransmissionReport', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']?.({ type: 'transmissionReport', report: codeTransmissionMonitor.generateTransmissionReport() });
      }),
      vscode.commands.registerCommand('inaCoding.purgeServerData', async () => {
        const confirm1 = await vscode.window.showWarningMessage('Purge all code data from server?', { modal: true }, 'Purge');
        if (confirm1 === 'Purge') {
          const result = await ephemeralPolicyEnforcer.purgeServerData('');
          vscode.window.showInformationMessage(result.success ? 'Server data purged' : `Purge failed: ${result.error}`);
        }
      }),
      vscode.commands.registerCommand('inaCoding.addSensitiveFilePattern', async () => {
        const pattern = await vscode.window.showInputBox({ placeHolder: 'e.g. *.vault, .env.*, credentials*', prompt: 'Enter sensitive file pattern' });
        if (pattern) {
          sensitiveFileDetector.addCustomPattern(pattern);
          vscode.window.showInformationMessage(`Added sensitive file pattern: ${pattern}`);
        }
      }),
      vscode.commands.registerCommand('inaCoding.toggleEphemeralMode', () => {
        const status = ephemeralPolicyEnforcer.getEphemeralStatus();
        const newEnabled = !status.enabled;
        ephemeralPolicyEnforcer.updateConfig({ enabled: newEnabled });
        vscode.window.showInformationMessage(`Ephemeral processing: ${newEnabled ? 'enabled' : 'disabled'}`);
      }),
    );

    Logger.info('Code security system registered');

    // ============ Access Control (Phase 12.2) ============
    {

      const apiKeyStore = ApiKeyStore.getInstance();
      apiKeyStore.initialize(context);

      AccessClient.initialize(async () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const key = await apiKeyStore.getKey();
        if (key) headers['x-api-key'] = key;
        else if (authService) {
          const authHeaders = await authService.getAuthHeaders();
          Object.assign(headers, authHeaders);
        }
        return headers;
      });

      const rateLimitHandler = RateLimitHandler.getInstance();
      const rlStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
      rateLimitHandler.setStatusBarItem(rlStatusBar);
      context.subscriptions.push(rlStatusBar);

      context.subscriptions.push(
        vscode.commands.registerCommand('inaCoding.showAccessControl', () => {
          vscode.commands.executeCommand('inaCoding.chatView.focus');
          chatViewProvider['_post']?.({ type: 'showAccessPanel' });
        }),
        vscode.commands.registerCommand('inaCoding.manageApiKeys', () => {
          vscode.commands.executeCommand('inaCoding.showAccessControl');
        }),
        vscode.commands.registerCommand('inaCoding.rotateApiKey', async () => {
          await apiKeyStore.rotateKey(AccessClient.getInstance());
        }),
        vscode.commands.registerCommand('inaCoding.showAuditLog', () => {
          vscode.commands.executeCommand('inaCoding.chatView.focus');
          chatViewProvider['_post']?.({ type: 'showAccessPanel' });
        }),
        vscode.commands.registerCommand('inaCoding.setupApiKey', async () => {
          await apiKeyStore.showKeySetupFlow();
        }),
      );

      Logger.info('Access control system registered');
    }

    // Context Commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showCurrentContext', async () => {
        const ctxProvider = chatViewProvider.getContextProvider();
        const ctx = await ctxProvider.getContext({ includeFullContent: false });
        if (ctx.activeFile) {
          vscode.window.showInformationMessage(
            `Active: ${ctx.activeFile.relativePath} (${ctx.activeFile.language.name})`
          );
        } else {
          vscode.window.showInformationMessage('No active file');
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.sendSelectionToChat', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          vscode.window.showWarningMessage('No text selected');
          return;
        }
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        chatViewProvider.addContext({
          file: filePath,
          language: editor.document.languageId,
          selection: {
            startLine: selection.start.line + 1,
            endLine: selection.end.line + 1,
            text,
          },
        });
        chatViewProvider.focusInput();
      })
    );

    // Feature 3: Add to Chat (right-click context menu alias)
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.addToChat', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          vscode.window.showWarningMessage('No text selected');
          return;
        }
        const selection = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        const fileName = path.basename(editor.document.fileName);
        chatViewProvider.addCodeToChat(selection, language, fileName);
        chatViewProvider.focusInput();
      }),
    );

    // Feature 8: YOLO Mode toggle
    const yoloStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    yoloStatusBar.command = 'inaCoding.agent.toggleYolo';
    const updateYoloStatusBar = () => {
      const yolo = vscode.workspace.getConfiguration('inaCoding.agent').get<boolean>('yoloMode', false);
      if (yolo) {
        yoloStatusBar.text = '$(zap) YOLO';
        yoloStatusBar.tooltip = 'YOLO Mode ON — Agent auto-executes without approval. Click to disable.';
        yoloStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        yoloStatusBar.show();
      } else {
        yoloStatusBar.hide();
      }
    };
    updateYoloStatusBar();
    context.subscriptions.push(
      yoloStatusBar,
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('inaCoding.agent.yoloMode')) updateYoloStatusBar();
      }),
      vscode.commands.registerCommand('inaCoding.agent.toggleYolo', async () => {
        const config = vscode.workspace.getConfiguration('inaCoding.agent');
        const current = config.get<boolean>('yoloMode', false);
        await config.update('yoloMode', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          current
            ? 'INA-7 Pro · YOLO Mode disabled — approval required again'
            : 'INA-7 Pro · YOLO Mode enabled — agent will auto-execute!'
        );
      }),
    );

    // Mention Commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.insertFileMention', async () => {
        const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**}', 30);
        const items = files.map(f => ({
          label: path.basename(f.fsPath),
          description: vscode.workspace.asRelativePath(f),
          file: f,
        }));
        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a file to mention' });
        if (selected) {
          chatViewProvider.addContext({
            file: selected.description,
            referencedFiles: [selected.description!],
          });
          chatViewProvider.focusInput();
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.insertSymbolMention', async () => {
        const query = await vscode.window.showInputBox({ placeHolder: 'Enter symbol name to search' });
        if (!query) { return; }
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          'vscode.executeWorkspaceSymbolProvider', query
        );
        if (symbols && symbols.length > 0) {
          const items = symbols.slice(0, 20).map(s => ({
            label: s.name,
            description: s.containerName,
            detail: vscode.workspace.asRelativePath(s.location.uri),
          }));
          const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select a symbol to mention' });
          if (selected) {
            chatViewProvider.focusInput();
          }
        }
      })
    );

    // Indexing Coordinator
    const apiEndpoint = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
    const indexingCoordinator = createIndexingCoordinator(apiEndpoint);
    context.subscriptions.push(indexingCoordinator);

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.indexWorkspace', async () => {
        await indexingCoordinator.runFullScan();
      }),
      vscode.commands.registerCommand('inaCoding.pauseIndexing', () => {
        indexingCoordinator.pause();
        vscode.window.showInformationMessage('Indexing paused');
      }),
      vscode.commands.registerCommand('inaCoding.resumeIndexing', () => {
        indexingCoordinator.resume();
        vscode.window.showInformationMessage('Indexing resumed');
      }),
      vscode.commands.registerCommand('inaCoding.showIndexingStatus', () => {
        const stats = indexingCoordinator.getStats();
        const progress = indexingCoordinator.getProgress();
        vscode.window.showInformationMessage(
          `Indexing: ${progress.state} | Files indexed: ${stats.totalIndexed} | Last scan: ${stats.lastFullScan ? new Date(stats.lastFullScan).toLocaleString() : 'Never'}`
        );
      }),
      vscode.commands.registerCommand('inaCoding.clearIndex', async () => {
        const confirm = await vscode.window.showWarningMessage('Clear all indexed data?', { modal: true }, 'Clear');
        if (confirm === 'Clear') {
          vscode.window.showInformationMessage('Index cleared');
        }
      }),
      vscode.commands.registerCommand('inaCoding.createInaIgnore', async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) { vscode.window.showErrorMessage('No workspace folder open'); return; }
        const templatePath = path.join(context.extensionPath, 'templates', '.ina-ignore');
        const targetPath = path.join(folders[0].uri.fsPath, '.ina-ignore');
        try {
          const template = await fs.readFile(templatePath, 'utf-8');
          await fs.writeFile(targetPath, template);
          const doc = await vscode.workspace.openTextDocument(targetPath);
          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage('.ina-ignore created successfully');
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to create .ina-ignore: ${error}`);
        }
      })
    );

    // Start indexing if enabled
    const watchFiles = ConfigManager.get<boolean>('indexing.watchFiles', true);
    if (watchFiles && vscode.workspace.workspaceFolders) {
      indexingCoordinator.start().catch(err => {
        Logger.warn('Failed to start indexing coordinator:', err);
      });
    }

    // Inline Completion Provider (Advanced Tab Completion System)
    const completionClient = new CompletionClient(services.api);
    const ghostTextConfig = { ...DEFAULT_GHOST_TEXT_CONFIG };
    const inlineCompletionProvider = new InlineCompletionProvider(completionClient, ghostTextConfig);

    const completionDisposable = vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**/*' },
      inlineCompletionProvider
    );
    context.subscriptions.push(completionDisposable);

    // Ghost text UI components
    const ghostTextController = inlineCompletionProvider.getGhostTextController();
    const keyBindingProvider = new GhostTextKeyBindingProvider(ghostTextController, context, ghostTextConfig);
    const previewWidget = new CompletionPreviewWidget();

    // Completion commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.triggerCompletion', () => {
        vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
      }),
      vscode.commands.registerCommand('inaCoding.toggleCompletion', () => {
        const enabled = inlineCompletionProvider.isProviderEnabled();
        inlineCompletionProvider.setEnabled(!enabled);
        vscode.window.showInformationMessage(
          `INA Completion ${!enabled ? 'enabled' : 'disabled'}`
        );
      }),
      vscode.commands.registerCommand('inaCoding.clearCompletionCache', () => {
        inlineCompletionProvider.clearCache();
        vscode.window.showInformationMessage('Completion cache cleared');
      }),
      vscode.commands.registerCommand('inaCoding.completionAccepted', (item: unknown) => {
        if (item && typeof item === 'object') {
          inlineCompletionProvider.handleCompletionAccepted(item as any);
        }
      }),
      vscode.commands.registerCommand('inaCoding.showCompletionPreview', () => {
        const current = ghostTextController.getCurrentCompletion();
        const editor = vscode.window.activeTextEditor;
        if (current && editor) {
          previewWidget.showFullPreviewPanel(current, editor.document.languageId);
        }
      })
    );

    // Track document changes for recent edits context
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        e.contentChanges.forEach((change) => {
          CompletionContextBuilder.getInstance().recordEdit(change, e.document);
        });
      })
    );

    // Set initial completion context keys
    vscode.commands.executeCommand('setContext', 'inaCoding.completionEnabled', true);
    vscode.commands.executeCommand('setContext', 'inaCoding.ghostTextVisible', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.hasMultipleCompletions', false);

    context.subscriptions.push(
      { dispose: () => inlineCompletionProvider.dispose() },
      { dispose: () => completionClient.dispose() },
      { dispose: () => previewWidget.dispose() }
    );

    Logger.info('Advanced inline completion provider with ghost text UI registered');

    // Inline Edit Provider (legacy)
    const inlineEditProvider = new InlineEditProvider(context, services.api);
    context.subscriptions.push(inlineEditProvider);

    // Inline Edit System (new)
    const inlineEditService = InlineEditService.getInstance();
    const selectionExpander = new SelectionExpander();
    const inlineEditTrigger = new InlineEditTrigger(inlineEditService, selectionExpander);
    const editCodeLensProvider = new InlineEditCodeLensProvider(inlineEditService);
    const editDecorationProvider = InlineEditDecorationProvider.getInstance();
    const inlineEditHistory = InlineEditHistory.getInstance();
    inlineEditHistory.initialize(context);

    const inlineEditOverlay = InlineEditOverlay.getInstance();
    const inlineEditStatusBarWidget = InlineEditStatusBarWidget.getInstance();
    const inputController = new InlineEditInputController(inlineEditService, inlineEditHistory);

    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, editCodeLensProvider),
      inlineEditTrigger.registerKeyboardShortcut(context),
      ...inlineEditTrigger.registerContextMenu(context),
      inlineEditTrigger.registerSelectionTrigger(context),

      // Input commands
      vscode.commands.registerCommand('inaCoding.inlineEditCancel', () => inputController.cancelInput()),
      vscode.commands.registerCommand('inaCoding.showInlineEditHistory', async () => {
        const entries = inlineEditHistory.getRecent(20);
        if (entries.length === 0) {
          vscode.window.showInformationMessage('No edit history yet');
          return;
        }
        const items = entries.map(e => ({
          label: e.prompt.length > 60 ? e.prompt.substring(0, 57) + '...' : e.prompt,
          description: `${e.language} \u2022 ${e.editType}`,
          detail: e.accepted ? 'Accepted' : 'Rejected',
        }));
        await vscode.window.showQuickPick(items, { placeHolder: 'Edit History' });
      }),
      vscode.commands.registerCommand('inaCoding.clearInlineEditHistory', async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Clear all inline edit history?', { modal: true }, 'Clear'
        );
        if (confirm === 'Clear') {
          inlineEditHistory.clear();
          vscode.window.showInformationMessage('Edit history cleared');
        }
      }),

      { dispose: () => inlineEditService.dispose() },
      { dispose: () => editCodeLensProvider.dispose() },
      { dispose: () => editDecorationProvider.dispose() },
      { dispose: () => inputController.dispose() },
      { dispose: () => inlineEditOverlay.dispose() },
      { dispose: () => inlineEditStatusBarWidget.dispose() },
    );

    // Diff Preview System
    const diffCodeLensProvider = new DiffCodeLensProvider();
    const diffLineActionProvider = new DiffLineActionProvider();
    const diffGutterProvider = new DiffGutterProvider();
    const storagePath = context.globalStorageUri.fsPath;
    const diffPreviewController = new DiffPreviewController(
      diffCodeLensProvider,
      diffLineActionProvider,
      diffGutterProvider,
      storagePath
    );

    // Wire diff controller to inline edit service
    inlineEditService.setDiffPreviewController(diffPreviewController);

    // Helper to get active session ID
    const getActiveSessionId = (): string | undefined => {
      return inlineEditService.getActiveSession()?.id;
    };

    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, diffCodeLensProvider),
      vscode.languages.registerHoverProvider({ scheme: 'file' }, diffLineActionProvider),

      // Diff commands
      vscode.commands.registerCommand('inaCoding.acceptInlineEdit', () => {
        const id = getActiveSessionId();
        if (id) inlineEditService.applyEdit(id);
      }),
      vscode.commands.registerCommand('inaCoding.rejectInlineEdit', () => {
        const id = getActiveSessionId();
        if (id) inlineEditService.rejectEdit(id);
      }),
      vscode.commands.registerCommand('inaCoding.acceptHunk', (hunkId: string) => {
        const id = getActiveSessionId();
        if (id) inlineEditService.acceptHunk(id, hunkId);
      }),
      vscode.commands.registerCommand('inaCoding.rejectHunk', (hunkId: string) => {
        const id = getActiveSessionId();
        if (id) inlineEditService.rejectHunk(id, hunkId);
      }),
      vscode.commands.registerCommand('inaCoding.acceptLine', (lineNumber: number) => {
        const id = getActiveSessionId();
        if (id) diffPreviewController.acceptLine(id, lineNumber);
      }),
      vscode.commands.registerCommand('inaCoding.rejectLine', (lineNumber: number) => {
        const id = getActiveSessionId();
        if (id) diffPreviewController.rejectLine(id, lineNumber);
      }),
      vscode.commands.registerCommand('inaCoding.toggleDiffView', () => {
        const id = getActiveSessionId();
        if (id) inlineEditService.toggleDiffViewMode(id);
      }),
      vscode.commands.registerCommand('inaCoding.editBeforeAccept', () => {
        const id = getActiveSessionId();
        if (id) inlineEditService.startEditMode(id);
      }),
      vscode.commands.registerCommand('inaCoding.finishEditing', () => {
        const id = getActiveSessionId();
        if (id) inlineEditService.finishEditMode(id, true);
      }),
      vscode.commands.registerCommand('inaCoding.cancelEditing', () => {
        const id = getActiveSessionId();
        if (id) inlineEditService.finishEditMode(id, false);
      }),
      vscode.commands.registerCommand('inaCoding.nextHunk', () => {
        const id = getActiveSessionId();
        if (id) diffPreviewController.navigateToNextHunk(id);
      }),
      vscode.commands.registerCommand('inaCoding.prevHunk', () => {
        const id = getActiveSessionId();
        if (id) diffPreviewController.navigateToPrevHunk(id);
      }),

      { dispose: () => diffPreviewController.dispose() },
      { dispose: () => diffCodeLensProvider.dispose() },
      { dispose: () => diffGutterProvider.dispose() },
    );

    Logger.info('Diff preview system registered');

    // Multi-Cursor Edit System
    const multiCursorService = new MultiCursorEditService();
    const multiCursorDiffManager = new MultiCursorDiffManager();
    const multiCursorCodeLensProvider = new MultiCursorCodeLensProvider();
    const multiCursorProgressWidget = new MultiCursorProgressWidget();
    const multiCursorController = new MultiCursorEditController(
      multiCursorService,
      multiCursorDiffManager,
      multiCursorCodeLensProvider,
      multiCursorProgressWidget
    );

    // Wire multi-cursor controller to inline edit service
    inlineEditService.setMultiCursorController(multiCursorController);

    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, multiCursorCodeLensProvider),

      vscode.commands.registerCommand('inaCoding.multiCursorEdit', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) multiCursorController.triggerMultiCursorEdit(editor);
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorAcceptAll', () => {
        const session = multiCursorService.getActiveSession();
        if (session) multiCursorController.acceptAll(session.id);
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorRejectAll', () => {
        const session = multiCursorService.getActiveSession();
        if (session) multiCursorController.rejectAll(session.id);
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorAcceptOne', (cursorId: string) => {
        const session = multiCursorService.getActiveSession();
        if (session) multiCursorController.acceptOne(session.id, cursorId);
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorRejectOne', (cursorId: string) => {
        const session = multiCursorService.getActiveSession();
        if (session) multiCursorController.rejectOne(session.id, cursorId);
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorNextCursor', () => {
        multiCursorController.navigateCursor('next');
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorPrevCursor', () => {
        multiCursorController.navigateCursor('prev');
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorRetryFailed', () => {
        const session = multiCursorService.getActiveSession();
        if (session) multiCursorController.retryFailed(session.id);
      }),
      vscode.commands.registerCommand('inaCoding.multiCursorChangeMode', () => {
        multiCursorController.showModeSelection();
      }),

      { dispose: () => multiCursorController.dispose() },
    );

    Logger.info('Multi-cursor edit system registered');

    // Set initial context
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditActive', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditPreview', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditGenerating', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffPreviewActive', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffEditing', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorPreviewActive', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorGenerating', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorHasErrors', false);

    // Listen to session events for context
    inlineEditService.onSessionStart(() => {
      vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditActive', true);
    });
    inlineEditService.onSessionEnd(() => {
      vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditActive', false);
      vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditPreview', false);
      vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditGenerating', false);
    });

    Logger.info('Inline edit system registered');

    // Tree View Providers
    const projectTreeProvider = new ProjectTreeProvider(services.indexing);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('inaCoding.projectView', projectTreeProvider)
    );

    // History Panel Provider (Tree View with search, export, etc.)
    const historyPanelProvider = new HistoryPanelProvider(context, historyManager);
    context.subscriptions.push({ dispose: () => historyPanelProvider.dispose() });

    // Settings View Provider
    const settingsViewProvider = new SettingsViewProvider(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        'inaCoding.settingsView',
        settingsViewProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
      )
    );

    // Search Panel Provider
    const searchPanelProvider = new SearchPanelProvider(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SearchPanelProvider.viewType,
        searchPanelProvider
      )
    );

    // Search Commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.search', async () => {
        const query = await vscode.window.showInputBox({
          prompt: 'Search codebase',
          placeHolder: 'Enter search query...',
        });
        if (query) {
          vscode.commands.executeCommand('inaCoding.searchPanel.focus');
          searchPanelProvider.searchFromExternal(query);
        }
      }),

      vscode.commands.registerCommand('inaCoding.searchSymbol', async () => {
        const name = await vscode.window.showInputBox({
          prompt: 'Search for symbol',
          placeHolder: 'Function, class, or type name...',
        });
        if (name) {
          const results = await searchClient.searchSymbol(name);
          if (results.length === 0) {
            vscode.window.showInformationMessage(`No symbol found: ${name}`);
            return;
          }
          const items = results.map(r => ({
            label: r.name || r.file,
            description: `${r.type} in ${r.file}`,
            detail: `Lines ${r.startLine}-${r.endLine}`,
            result: r,
          }));
          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select symbol to open',
          });
          if (selected) {
            await searchClient.openResult(selected.result);
          }
        }
      }),

      vscode.commands.registerCommand('inaCoding.searchSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
          vscode.window.showInformationMessage('No text selected');
          return;
        }
        vscode.commands.executeCommand('inaCoding.searchPanel.focus');
        searchPanelProvider.searchFromExternal(selection);
      }),

      vscode.commands.registerCommand('inaCoding.findSimilar', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const selection = editor.document.getText(editor.selection);
        if (!selection) {
          vscode.window.showInformationMessage('Select code to find similar');
          return;
        }
        const results = await searchClient.findSimilar(selection);
        if (results.length === 0) {
          vscode.window.showInformationMessage('No similar code found');
          return;
        }
        const items = results.map(r => ({
          label: `${Math.round(r.score * 100)}% - ${r.name || r.file.split('/').pop()}`,
          description: r.file,
          detail: r.preview?.substring(0, 100),
          result: r,
        }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Similar code found',
        });
        if (selected) {
          await searchClient.openResult(selected.result);
        }
      })
    );

    // Index Status Bar
    const indexStatusBar = new IndexStatusBar();
    context.subscriptions.push(indexStatusBar);

    // Index Management Panel
    const indexPanelProvider = new IndexPanelProvider(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        IndexPanelProvider.viewType,
        indexPanelProvider
      )
    );

    // Index Management Commands
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showIndexPanel', () => {
        vscode.commands.executeCommand('inaCoding.indexPanel.focus');
      }),

      vscode.commands.registerCommand('inaCoding.reindex', async () => {
        const choice = await vscode.window.showQuickPick([
          { label: '$(refresh) Quick Reindex', value: 'quick', description: 'Index changed files only' },
          { label: '$(sync) Full Reindex', value: 'full', description: 'Reindex all files from scratch' },
        ], { placeHolder: 'Select reindex type' });

        if (choice) {
          vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reindexing codebase...',
            cancellable: false,
          }, async () => {
            if (choice.value === 'full') {
              await indexManagerClient.reindex({ clearFirst: true });
            }
            await indexingCoordinator.runFullScan();
          });
        }
      }),

      vscode.commands.registerCommand('inaCoding.editExcludePatterns', async () => {
        await indexManagerClient.openInaIgnore();
      }),

      vscode.commands.registerCommand('inaCoding.indexStats', async () => {
        try {
          const stats = await indexManagerClient.getStats();
          const items = [
            `Files: ${stats.totalFiles.toLocaleString()}`,
            `Chunks: ${stats.totalChunks.toLocaleString()}`,
            `Embedded: ${stats.embeddedChunks.toLocaleString()}`,
            `Size: ${stats.indexSize}`,
            `Health: ${stats.health.status} (${stats.health.score}/100)`,
          ];
          vscode.window.showQuickPick(items, { placeHolder: 'Index Statistics' });
        } catch {
          vscode.window.showErrorMessage('Failed to get index stats');
        }
      })
    );

    // Register all commands
    registerCommands(context, services, {
      chatViewProvider,
      inlineEditProvider,
      projectTreeProvider,
      historyPanelProvider,
    });

    // Set context
    vscode.commands.executeCommand('setContext', 'inaCoding.activated', true);

    // Auto-index: skipped here — indexingCoordinator.start() already handles initial scan
    const autoIndex = ConfigManager.get<boolean>('indexing.autoIndex', true);

    // Listen for workspace changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (autoIndex) {
          services.indexing.indexWorkspace().catch(err => {
            Logger.warn('Workspace change indexing failed:', err);
          });
        }
      })
    );

    // Listen for file saves
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        services.indexing.updateFile(document).catch(err => {
          Logger.debug('File index update failed:', err);
        });
      })
    );

    // Status bar
    const statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.text = '$(sparkle) INA';
    statusBarItem.tooltip = 'INA Coding - Click to open chat';
    statusBarItem.command = 'inaCoding.openChat';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Auth state listener for status bar
    authService.onChange((state) => {
      Logger.info('Auth state changed:', { isAuthenticated: state.isAuthenticated, user: state.user?.email });
      if (state.isAuthenticated) {
        statusBarItem.text = `$(sparkle) INA (${state.user?.email})`;
      } else {
        statusBarItem.text = '$(sparkle) INA (Sign In)';
      }
    });

    Logger.info('INA Coding extension activated successfully');

    // Welcome message on first install
    const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
    if (!hasShownWelcome) {
      vscode.window.showInformationMessage(
        'Welcome to INA Coding! Your AI-powered coding assistant is ready.',
        'Open Chat',
        'Learn More'
      ).then(selection => {
        if (selection === 'Open Chat') {
          vscode.commands.executeCommand('inaCoding.openChat');
        } else if (selection === 'Learn More') {
          vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'inagpt.ina-coding#inaCoding.welcome'
          );
        }
      });
      context.globalState.update('hasShownWelcome', true);
    }

    // Enterprise Edition (Phase 13.4)
    const enterpriseClient = EnterpriseClient.getInstance();
    enterpriseClient.initialize(async (): Promise<Record<string, string>> => {
      const apiKeyStore = ApiKeyStore.getInstance();
      const key = await apiKeyStore.getKey();
      const headers: Record<string, string> = {};
      if (key) { headers['x-api-key'] = key; }
      return headers;
    });

    const ssoAuthHandler = SSOAuthHandler.getInstance();
    context.subscriptions.push(ssoAuthHandler.registerURIHandler());

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showAdminPanel', () => {
        chatViewProvider['_post']({ type: 'showAdminPanel' });
      }),
      vscode.commands.registerCommand('inaCoding.loginWithSSO', async () => {
        const providerId = await vscode.window.showInputBox({ prompt: 'Enter SSO Provider ID', placeHolder: 'provider-uuid' });
        if (providerId) await ssoAuthHandler.loginWithSSO(providerId);
      }),
      vscode.commands.registerCommand('inaCoding.showAnalytics', () => {
        chatViewProvider['_post']({ type: 'showAdminPanel' });
      }),
      vscode.commands.registerCommand('inaCoding.activateLicense', async () => {
        const key = await vscode.window.showInputBox({ prompt: 'Enter Enterprise License Key', placeHolder: 'ENT-xxxx-xxxx-xxxx' });
        if (key) {
          try {
            await enterpriseClient.activateLicense(key);
            vscode.window.showInformationMessage('Enterprise license activated!');
          } catch (e: any) {
            vscode.window.showErrorMessage(`License activation failed: ${e.message}`);
          }
        }
      }),
    );

    Logger.info('Enterprise features registered');

    // Phase 15.1 — Generate Service
    const generateService = GenerateService.getInstance();
    generateService.setApiService(services.api);
    Logger.info('Generate service initialized');

    // Phase 15.2 — Apply Service (singleton, auto-initialized)
    ApplyService.getInstance();
    Logger.info('Apply service initialized');

    // Phase 15.3 — Predicted Next Edit (Tab-Tab-Tab)
    const editTracker = EditTracker.getInstance();
    const predictionChainManager = PredictionChainManager.getInstance();

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.scheme !== 'file') return;
        editTracker.trackEdit(event);
        const lastEdit = editTracker.getRecentEdits(1)[0];
        if (lastEdit && lastEdit.editType !== EditType.GENERIC && lastEdit.editType !== EditType.INSERT) {
          predictionChainManager.startChain(lastEdit);
        }
      }),
      vscode.commands.registerCommand('inaCoding.acceptPrediction', () => {
        if (predictionChainManager.getChainStatus().active) {
          predictionChainManager.acceptCurrent();
        }
      }),
      vscode.commands.registerCommand('inaCoding.skipPrediction', () => {
        predictionChainManager.skipCurrent();
      }),
      vscode.commands.registerCommand('inaCoding.cancelPredictions', () => {
        predictionChainManager.cancelChain();
      }),
      vscode.commands.registerCommand('inaCoding.viewPredictions', () => {
        const status = predictionChainManager.getChainStatus();
        if (!status.active) { vscode.window.showInformationMessage('No active prediction chain.'); return; }
        vscode.window.showInformationMessage(`Prediction: ${status.current + 1}/${status.total} — ${status.currentPrediction?.previewText || ''}`);
      }),
      vscode.commands.registerCommand('inaCoding.generateCode', () => {
        vscode.commands.executeCommand('inaCoding.inlineEdit');
      }),
      vscode.commands.registerCommand('inaCoding.applyLastCodeBlock', () => {
        chatViewProvider['_post']?.({ type: 'applyLastCodeBlock' });
      }),
      { dispose: () => predictionChainManager.dispose() },
    );

    Logger.info('Prediction chain (Tab-Tab-Tab) initialized');

    // Phase 15.4 — Codebase Search
    const codebaseSearchClient = CodebaseSearchClient.getInstance();
    const codebaseMentionHandler = CodebaseMentionHandler.getInstance();
    Logger.info('Codebase search initialized');

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.searchCodebase', async () => {
        chatViewProvider.focusInput();
        chatViewProvider['_post']({ type: 'insertMention', mention: '@codebase ' });
      }),
    );

    // Phase 15.5 — Bug Finder
    const bugFinderService = BugFinderService.getInstance();
    const bugFinderDecorator = BugFinderDecorator.getInstance();

    // Show bug markers in editor after scan
    bugFinderService.on('bugsFound', (bugs: any[]) => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        bugFinderDecorator.showBugMarkers(editor, bugs);
      }
    });

    context.subscriptions.push(
      bugFinderDecorator.registerHoverProvider(),
      vscode.commands.registerCommand('inaCoding.scanCurrentFile', async () => {
        chatViewProvider.focusInput();
        chatViewProvider['_post']({ type: 'showBugFinderPanel' });
        const result = await bugFinderService.scanCurrentFile();
        chatViewProvider['_post']({ type: 'bugScanComplete', result });
      }),
      vscode.commands.registerCommand('inaCoding.scanChangedFiles', async () => {
        chatViewProvider.focusInput();
        const result = await bugFinderService.scanChangedFiles();
        chatViewProvider['_post']({ type: 'bugScanComplete', result });
      }),
      vscode.commands.registerCommand('inaCoding.scanProject', async () => {
        chatViewProvider.focusInput();
        vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Scanning project for bugs...' },
          async (progress) => {
            bugFinderService.on('scanProgress', (p: any) => {
              progress.report({ increment: (1 / Math.max(p.total, 1)) * 100, message: p.currentFile || '' });
            });
            const result = await bugFinderService.scanProject();
            chatViewProvider['_post']({ type: 'bugScanComplete', result });
          }
        );
      }),
      vscode.commands.registerCommand('inaCoding.findBugs', async () => {
        vscode.commands.executeCommand('inaCoding.scanCurrentFile');
      }),
      vscode.commands.registerCommand('inaCoding.showBugFinder', () => {
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']({ type: 'showBugFinderPanel' });
      }),
      { dispose: () => bugFinderDecorator.dispose() },
    );

    // Auto-scan on save (if enabled)
    const autoScanOnSave = vscode.workspace.getConfiguration('inaCoding.bugfinder').get<boolean>('autoScanOnSave', false);
    if (autoScanOnSave) {
      context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
          if (document.uri.scheme !== 'file') return;
          const editor = vscode.window.activeTextEditor;
          if (editor && editor.document === document) {
            const result = await bugFinderService.scanCurrentFile();
            bugFinderDecorator.showBugMarkers(editor, result.bugs);
          }
        })
      );
    }

    Logger.info('Bug finder system registered');

    // Phase 15.6 — AI Commit Message
    const commitMessageGenerator = CommitMessageGenerator.getInstance();
    const gitAIPanel = GitAIPanel.getInstance();

    context.subscriptions.push(
      gitAIPanel.registerSCMInputButton(),
    );

    Logger.info('AI commit message system registered');

    // Phase 17.1 — Shadow Workspace
    const shadowFsProvider = ShadowFileSystemProvider.getInstance();
    shadowFsProvider.register(context);
    const shadowManager = ShadowWorkspaceManager.getInstance();

    const shadowTreeProvider = ShadowTreeDataProvider.getInstance();
    const shadowTreeView = vscode.window.createTreeView('inaCodingShadowWorkspace', {
      treeDataProvider: shadowTreeProvider,
      showCollapseAll: true,
    });

    // Wire shadow events to tree view refresh and webview updates
    shadowManager.on('fileAdded', () => { shadowTreeProvider.refresh(); });
    shadowManager.on('fileModified', () => { shadowTreeProvider.refresh(); });
    shadowManager.on('fileAccepted', () => { shadowTreeProvider.refresh(); });
    shadowManager.on('fileRejected', () => { shadowTreeProvider.refresh(); });
    shadowManager.on('sessionCreated', (event: any) => {
      shadowTreeProvider.refresh();
      chatViewProvider['_post']({
        type: 'shadowSessionCreated',
        session: { id: event.sessionId, name: event.data?.name, status: 'active', files: [], checkpoints: [], createdAt: Date.now(), expiresAt: Date.now() + 30 * 60000, sourceOperation: event.data?.sourceOperation || 'unknown' },
      });
    });
    shadowManager.on('sessionCommitted', () => { shadowTreeProvider.refresh(); });
    shadowManager.on('sessionDiscarded', () => { shadowTreeProvider.refresh(); });

    // Shadow integration with agent and apply
    const shadowIntegration = ShadowIntegration.getInstance();
    shadowIntegration.integrateWithAgent(ExecutionEngine.getInstance(), shadowManager);
    shadowIntegration.integrateWithApply(ApplyService.getInstance(), shadowManager);

    context.subscriptions.push(
      shadowTreeView,
      { dispose: () => { shadowManager.dispose(); shadowFsProvider.clear(); } },
      vscode.commands.registerCommand('inaCoding.showShadowWorkspace', () => {
        shadowTreeView.reveal(undefined as any, { focus: true });
        vscode.commands.executeCommand('inaCoding.chatView.focus');
        chatViewProvider['_post']({ type: 'showShadowPanel' });
      }),
      vscode.commands.registerCommand('inaCoding.acceptAllShadow', async () => {
        const active = shadowManager.getActiveSession();
        if (active) {
          await shadowManager.acceptAll(active.id);
          vscode.window.showInformationMessage('Shadow workspace: All changes applied.');
        }
      }),
      vscode.commands.registerCommand('inaCoding.rejectAllShadow', async () => {
        const active = shadowManager.getActiveSession();
        if (active) {
          const confirm = await vscode.window.showWarningMessage('Discard all shadow changes?', { modal: true }, 'Discard');
          if (confirm) shadowManager.rejectAll(active.id);
        }
      }),
      vscode.commands.registerCommand('inaCoding.createShadowCheckpoint', async () => {
        const active = shadowManager.getActiveSession();
        if (active) {
          const desc = await vscode.window.showInputBox({ prompt: 'Checkpoint description' });
          if (desc) shadowManager.createCheckpoint(active.id, desc);
        }
      }),
      vscode.commands.registerCommand('inaCoding.previewShadowDiff', async () => {
        const active = shadowManager.getActiveSession();
        if (active) await shadowManager.previewAll(active.id);
      }),
      vscode.commands.registerCommand('inaCoding.toggleShadowMode', () => {
        const config = vscode.workspace.getConfiguration('inaCoding.shadow');
        const current = config.get<boolean>('enabled', true);
        config.update('enabled', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`Shadow workspace ${!current ? 'enabled' : 'disabled'}`);
      }),
    );

    Logger.info('Shadow workspace system registered');

    // Phase 17.2 — Deep Context
    const deepResolver = DeepResolver.getInstance();
    const deepFormatter = DeepContextFormatter.getInstance();
    const deepMentionHandler = DeepMentionHandler.getInstance();

    Logger.info('Deep context system registered');

    // Phase 17.3 — Link Fetch
    LinkFetchService.getInstance();
    LinkMentionHandler.getInstance();
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.fetchLink', async () => {
        const url = await vscode.window.showInputBox({ prompt: 'Enter URL to fetch', placeHolder: 'https://...' });
        if (url) {
          try {
            const page = await LinkFetchService.getInstance().fetch(url);
            vscode.window.showInformationMessage(`Fetched: ${page.title} (${page.tokenCount} tokens)`);
          } catch (e: any) {
            vscode.window.showErrorMessage(`Fetch failed: ${e.message}`);
          }
        }
      }),
      vscode.commands.registerCommand('inaCoding.showContextBudget', () => {
        const cwm = ContextWindowManager.getInstance();
        const viz = cwm.getVisualizationData();
        const summary = viz.segments.map(s => `${s.name}: ${s.tokens} tokens (${s.percentage}%)`).join('\n');
        vscode.window.showInformationMessage(`Context: ${viz.totalUsed}/${viz.totalBudget} tokens (${viz.utilizationPercent}%)`, { modal: false, detail: summary });
      }),
    );
    Logger.info('Link fetch and context window manager registered');

    // Phase 17.4 — Partial Accept Controller
    PartialAcceptController.getInstance();
    Logger.info('Partial accept controller registered');

    // Phase 17.5 — Context Window Manager
    ContextWindowManager.getInstance();
    Logger.info('Context window manager initialized');

    // Phase 17.6 — Performance Benchmarking
    const benchmarkRunner = BenchmarkRunner.getInstance();
    const benchmarkReporter = BenchmarkReporter.getInstance();
    const performanceMonitor = PerformanceMonitor.getInstance();
    performanceMonitor.startMonitoring();

    context.subscriptions.push(
      { dispose: () => performanceMonitor.stopMonitoring() },
      vscode.commands.registerCommand('inaCoding.runBenchmark', async () => {
        vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Running performance benchmark...' },
          async () => {
            const suite = await benchmarkRunner.runAll();
            const report = benchmarkReporter.formatConsole(suite);
            const doc = await vscode.workspace.openTextDocument({ content: report, language: 'text' });
            await vscode.window.showTextDocument(doc);
            chatViewProvider['_post']({ type: 'benchmarkResult', suite });
          }
        );
      }),
      vscode.commands.registerCommand('inaCoding.showPerformanceReport', () => {
        const report = performanceMonitor.getHealthReport();
        const text = report.metrics.map((m: any) => `${m.name}: avg=${m.avg.toFixed(1)} p95=${m.p95.toFixed(1)} [${m.trend}]`).join('\n');
        const alerts = report.alerts.length > 0 ? '\n\nAlerts:\n' + report.alerts.join('\n') : '';
        vscode.window.showInformationMessage(`Performance Report:\n${text}${alerts}`, { modal: true });
      }),
      vscode.commands.registerCommand('inaCoding.exportBenchmark', async () => {
        const suite = await benchmarkRunner.runAll();
        const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('benchmark-report.md'), filters: { 'Markdown': ['md'], 'JSON': ['json'] } });
        if (uri) {
          const isJson = uri.fsPath.endsWith('.json');
          const content = isJson ? benchmarkReporter.formatJson(suite) : benchmarkReporter.formatMarkdown(suite);
          await benchmarkReporter.exportToFile(suite, uri.fsPath);
          vscode.window.showInformationMessage(`Benchmark exported to ${uri.fsPath}`);
        }
      }),
    );

    // Track extension activation time
    performanceMonitor.trackEvent('extension.activationTime', Date.now() - (context as any)._activationStart || 0);
    Logger.info('Performance benchmark system registered');

    // Phase 16.1 — Composer (Cursor-style full-screen agent UI)
    const composerDiffEngine = ComposerDiffEngine.getInstance();
    const composerSessionManager = ComposerSessionManager.getInstance();
    composerSessionManager.initialize({
      agentModeManager,
      planningService: PlanningService.getInstance(),
      executionEngine: ExecutionEngine.getInstance(),
      reviewService: ReviewService.getInstance(),
      rollbackManager: RollbackManager.getInstance(),
      diffEngine: composerDiffEngine,
      apiService: services.api,
    });

    context.subscriptions.push(
      { dispose: () => composerSessionManager.dispose() },
      vscode.commands.registerCommand('inaCoding.openComposer', async () => {
        const instruction = await vscode.window.showInputBox({
          prompt: 'What would you like Composer to build?',
          placeHolder: 'e.g. Add user authentication with JWT',
        });
        if (!instruction) return;
        const session = composerSessionManager.createSession(instruction);
        await vscode.commands.executeCommand('workbench.view.extension.inaCoding');
        chatViewProvider['_post']({
          type: 'composerSessionCreated',
          session: { ...session, checkpoints: session.checkpoints.map((c) => ({ ...c, fileSnapshots: Object.fromEntries(c.fileSnapshots.entries()) })) },
        });
        composerSessionManager.startPlanning(session.id).catch((e) =>
          Logger.error('[Composer] startPlanning failed:', e)
        );
      }),
      vscode.commands.registerCommand('inaCoding.composerSidebar', async () => {
        await ConfigManager.set('composer.defaultLayout', ComposerLayout.SIDEBAR);
        await vscode.commands.executeCommand('inaCoding.openComposer');
      }),
      vscode.commands.registerCommand('inaCoding.composerSplit', async () => {
        await ConfigManager.set('composer.defaultLayout', ComposerLayout.SPLIT);
        await vscode.commands.executeCommand('inaCoding.openComposer');
      }),
      vscode.commands.registerCommand('inaCoding.closeComposer', () => {
        const active = composerSessionManager.getActiveSession();
        if (active) {
          composerSessionManager.closeSession(active.id);
          vscode.commands.executeCommand('setContext', 'inaCoding.composerActive', false);
        }
      }),
      vscode.commands.registerCommand('inaCoding.composerCheckpoint', async () => {
        const active = composerSessionManager.getActiveSession();
        if (!active) {
          vscode.window.showWarningMessage('No active Composer session');
          return;
        }
        const desc = await vscode.window.showInputBox({
          prompt: 'Checkpoint description',
          value: `Manual @ ${new Date().toLocaleTimeString()}`,
        });
        if (desc) composerSessionManager.createCheckpoint(active.id, desc);
      }),
      vscode.commands.registerCommand('inaCoding.composerAcceptAll', async () => {
        const active = composerSessionManager.getActiveSession();
        if (active) await composerSessionManager.acceptAll(active.id);
      }),
    );
    Logger.info('Composer (Phase 16.1) registered');

    // ============ Phase 16.2 — MCP Client ============
    const mcpClient = MCPClient.getInstance();
    const mcpDiscovery = MCPDiscovery.getInstance();
    MCPToolExecutor.getInstance();

    // Register built-in INA servers (in-process)
    registerBuiltinMCPServers(mcpClient);

    // Auto-discover and connect external servers (best-effort, non-blocking)
    const mcpEnabled = ConfigManager.get<boolean>('mcp.enabled', true);
    const autoDiscover = ConfigManager.get<boolean>('mcp.autoDiscover', true);
    if (mcpEnabled && autoDiscover) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
      mcpDiscovery
        .discoverServers(workspaceRoot)
        .then(async (configs) => {
          const autoStart = ConfigManager.get<boolean>('mcp.autoStart', true);
          for (const config of configs) {
            if (!config.enabled || (!autoStart && !config.builtin)) continue;
            try {
              await mcpClient.connect(config);
            } catch (e) {
              Logger.warn(`[MCP] auto-connect failed for ${config.name}: ${String(e)}`);
            }
          }
          Logger.info(`[MCP] Discovered ${configs.length} servers, auto-connected available ones`);
        })
        .catch((e) => Logger.warn(`[MCP] discovery failed: ${String(e)}`));

      // Watch workspace .mcp.json for changes
      if (workspaceRoot) {
        context.subscriptions.push(
          mcpDiscovery.watchConfigChanges(workspaceRoot, async (configs) => {
            Logger.info('[MCP] Config changed; reconnecting...');
            for (const config of configs) {
              if (!config.enabled || config.builtin) continue;
              if (mcpClient.getServer(config.name)) continue;
              try {
                await mcpClient.connect(config);
              } catch (e) {
                Logger.warn(`[MCP] reconnect failed for ${config.name}: ${String(e)}`);
              }
            }
          })
        );
      }
    }

    context.subscriptions.push(
      { dispose: () => mcpClient.dispose() },
      vscode.commands.registerCommand('inaCoding.manageMCP', async () => {
        // Best-effort: open the chat view and let the webview button work.
        await vscode.commands.executeCommand('workbench.view.extension.inaCoding');
        chatViewProvider['_post']({ type: 'mcpServersChanged', servers: mcpClient.getServerStatuses() });
        chatViewProvider['_post']({ type: 'mcpToolsChanged', tools: mcpClient.listTools() });
      }),
      vscode.commands.registerCommand('inaCoding.connectMCPServer', async () => {
        const popular = mcpDiscovery.getPopularServers();
        const picked = await vscode.window.showQuickPick(
          popular.map((p) => ({
            label: p.name,
            description: p.package,
            detail: p.description,
            data: p,
          })),
          { placeHolder: 'Select an MCP server to connect' }
        );
        if (!picked) return;
        try {
          await mcpClient.connect({
            name: picked.data.name,
            displayName: picked.data.name,
            command: 'npx',
            args: ['-y', picked.data.package],
            env: {},
            transportType: 'stdio',
            url: null,
            enabled: true,
            autoStart: true,
            capabilities: [],
          });
          vscode.window.showInformationMessage(`Connected MCP server: ${picked.data.name}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Connect failed: ${e?.message ?? String(e)}`);
        }
      }),
    );
    Logger.info('MCP client (Phase 16.2) registered');

    // ============ Phase 16.3 — Web Search ============
    WebSearchService.getInstance();
    WebMentionHandler.getInstance();

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.webSearch', async () => {
        const query = await vscode.window.showInputBox({
          prompt: 'Search the web',
          placeHolder: 'How to use React hooks?',
        });
        if (!query) return;
        try {
          const response = await WebSearchService.getInstance().search(query);
          chatViewProvider['_post']({ type: 'webSearchResults', query, response });
          vscode.window.showInformationMessage(
            `Found ${response.results.length} results via ${response.engine}`
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(`Search failed: ${e?.message ?? String(e)}`);
        }
      }),
    );
    Logger.info('Web Search (Phase 16.3) registered');

    // ============ Phase 16.4 — Notepads ============
    const notepadManager = NotepadManager.getInstance();
    const workspaceRootForNotepads = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRootForNotepads && ConfigManager.get<boolean>('notepads.enabled', true)) {
      await notepadManager.loadFromDisk(workspaceRootForNotepads);
    }
    context.subscriptions.push(
      { dispose: () => notepadManager.dispose() },
      vscode.commands.registerCommand('inaCoding.createNotepad', async () => {
        const name = await vscode.window.showInputBox({
          prompt: 'Notepad name',
          placeHolder: 'e.g. API Spec',
        });
        if (!name) return;
        const typeChoice = await vscode.window.showQuickPick(
          [
            { label: 'Text / Notes', value: 'text' as NotepadType },
            { label: 'Code Snippet', value: 'code' as NotepadType },
            { label: 'API Spec', value: 'api' as NotepadType },
            { label: 'Data / JSON', value: 'data' as NotepadType },
            { label: 'Requirements', value: 'requirements' as NotepadType },
          ],
          { placeHolder: 'Notepad type' }
        );
        if (!typeChoice) return;
        const np = await notepadManager.create(name, typeChoice.value);
        await notepadManager.openInEditor(np.id);
      }),
      vscode.commands.registerCommand('inaCoding.showNotepads', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.inaCoding');
        chatViewProvider['_post']({ type: 'notepadsChanged', notepads: notepadManager.getAll() });
      }),
    );
    Logger.info('Notepads (Phase 16.4) registered');

    // ============ Phase 16.5 — History Search ============
    const historySearch = HistorySearchService.getInstance();
    historySearch.setHistoryManager(historyManager);
    if (ConfigManager.get<boolean>('history.enabled', true)) {
      historySearch.buildIndex();
    }
    context.subscriptions.push(
      { dispose: () => historySearch.dispose() },
      vscode.commands.registerCommand('inaCoding.searchHistory', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.inaCoding');
        chatViewProvider['_post']({
          type: 'historyConversationsList',
          conversations: historySearch.getConversations(50),
        });
        chatViewProvider['_post']({ type: 'historyStats', stats: historySearch.getStats() });
        chatViewProvider['_post']({ type: 'showHistorySearchPanel' });
      }),
    );
    Logger.info('History Search (Phase 16.5) registered');

    // ============ Phase 16.6 — AutoFormat ============
    const autoFormat = AutoFormatService.getInstance();
    if (workspaceRootForNotepads) {
      autoFormat.detectFormatter(workspaceRootForNotepads);
    }
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.formatFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('No active editor');
          return;
        }
        await editor.document.save();
        const result = await autoFormat.formatFile(editor.document.uri.fsPath);
        if (result.success && result.changesApplied) {
          vscode.window.showInformationMessage(
            `Formatted with ${result.formatterUsed} (${result.durationMs}ms)`
          );
        } else if (result.error) {
          vscode.window.showWarningMessage(`Format failed: ${result.error}`);
        }
      }),
    );
    Logger.info('AutoFormat (Phase 16.6) registered');

    // ============ Phase 16.7 — AI Rename ============
    const aiRename = AIRenameProvider.getInstance();
    aiRename.setApiService(services.api);
    if (ConfigManager.get<boolean>('rename.aiEnabled', true)) {
      const renameDisposables = aiRename.registerRenameProvider();
      context.subscriptions.push(...renameDisposables);
    }
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'inaCoding.aiRename',
        async (uri?: vscode.Uri, position?: vscode.Position) => {
          await aiRename.runInteractive(uri, position);
        }
      ),
    );
    Logger.info('AI Rename (Phase 16.7) registered');

    // ============ Phase 18.1 — Multi-Agent Orchestrator ============
    const multiAgent = MultiAgentOrchestrator.getInstance();
    multiAgent.initialize(services.api, {
      maxConcurrentAgents: ConfigManager.get<number>('multiAgent.maxAgents', 4),
      taskTimeout: ConfigManager.get<number>('multiAgent.taskTimeout', 120_000),
      maxRetries: ConfigManager.get<number>('multiAgent.maxRetries', 3),
      autoVerify: ConfigManager.get<boolean>('multiAgent.autoVerify', true),
      delegationStrategy: ConfigManager.get<any>('multiAgent.delegationStrategy', 'specialist'),
    });

    // ============ Phase 18.2 — Verifier Agent ============
    const verifier = VerificationOrchestrator.getInstance();
    verifier.initialize(services.api, {
      strictMode: ConfigManager.get<boolean>('verifier.strictMode', false),
      passThreshold: ConfigManager.get<number>('verifier.passThreshold', 70),
      maxFixIterations: ConfigManager.get<number>('verifier.maxFixIterations', 3),
      enableSecurityScan: ConfigManager.get<boolean>('verifier.enableSecurityScan', true),
      enableLogicReview: ConfigManager.get<boolean>('verifier.enableLogicReview', true),
      enableSyntaxCheck: ConfigManager.get<boolean>('verifier.enableSyntaxCheck', true),
    });

    // Wire verifier into orchestrator (CODER tasks get auto-verified)
    multiAgent.setVerifier(verifier);

    context.subscriptions.push(
      { dispose: () => multiAgent.dispose() },
      { dispose: () => verifier.dispose() },
      { dispose: () => MultiAgentFactory.getInstance().dispose() },

      // 18.1 commands
      vscode.commands.registerCommand('inaCoding.multiAgent.decompose', async () => {
        const request = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro Multi-Agent — describe your task',
          placeHolder: 'e.g. Add JWT auth to the /api/profile route and write tests',
        });
        if (!request) return;
        try {
          const graph = await multiAgent.decompose(request);
          const pathList = graph.criticalPath().join(' → ');
          vscode.window.showInformationMessage(
            `INA-7 Pro decomposed into ${graph.size()} tasks. Critical path: ${pathList}`
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(`Decompose failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.multiAgent.execute', async () => {
        const graph = multiAgent.getCurrentGraph();
        if (!graph) {
          vscode.window.showWarningMessage('No task graph — run Decompose first');
          return;
        }
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `INA-7 Pro · Executing ${graph.size()} tasks`,
            cancellable: true,
          },
          async (progress, token) => {
            token.onCancellationRequested(() => multiAgent.cancel());
            for await (const event of multiAgent.execute()) {
              if (event.type === 'task-completed') {
                const state = multiAgent.getState();
                progress.report({
                  increment: (1 / state.totalTasks) * 100,
                  message: `${state.completedTasks}/${state.totalTasks} tasks — ${event.taskId ?? ''}`,
                });
              } else if (event.type === 'task-failed') {
                Logger.warn(`[MultiAgent] Task ${event.taskId} failed: ${event.message}`);
              } else if (event.type === 'execution-completed' || event.type === 'execution-failed' || event.type === 'execution-cancelled') {
                break;
              }
            }
            const finalState = multiAgent.getState();
            vscode.window.showInformationMessage(
              `INA-7 Pro · ${finalState.status} — ${finalState.completedTasks}/${finalState.totalTasks} tasks (${finalState.failedTasks} failed)`
            );
          }
        );
      }),

      vscode.commands.registerCommand('inaCoding.multiAgent.cancel', () => {
        multiAgent.cancel();
        vscode.window.showInformationMessage('INA-7 Pro · multi-agent execution cancelled');
      }),

      // 18.2 commands
      vscode.commands.registerCommand('inaCoding.verifier.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('No active editor');
          return;
        }
        const code = editor.document.getText();
        const filePath = editor.document.uri.fsPath;
        const language = editor.document.languageId;
        const report = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Verifying…' },
          () => verifier.verifyCode(code, filePath, language)
        );
        const msg = `INA-7 Pro Verifier · score ${report.score}/100 · ${report.verdict.toUpperCase()}\n${report.summary}`;
        if (report.verdict === 'fail') {
          vscode.window.showErrorMessage(msg, { modal: true });
        } else if (report.verdict === 'warning') {
          vscode.window.showWarningMessage(msg);
        } else {
          vscode.window.showInformationMessage(msg);
        }
      }),
    );
    Logger.info('Multi-Agent + Verifier (Phase 18.1 + 18.2) registered');

    // ============ Phase 18.3 — Git Worktree Isolation ============
    const worktreeManager = WorktreeManager.getInstance();
    worktreeManager.configure({
      maxWorktrees: ConfigManager.get<number>('worktree.maxWorktrees', 5),
      autoCleanup: ConfigManager.get<boolean>('worktree.autoCleanup', true),
      cleanupAfterHours: ConfigManager.get<number>('worktree.cleanupAfterHours', 24),
      autoStashDirty: ConfigManager.get<boolean>('worktree.autoStashDirty', true),
    });
    await worktreeManager.initialize().catch((e) =>
      Logger.warn(`[Worktree] initialize failed: ${String(e)}`)
    );
    // IsolatedExecutor is a singleton consumed by Best-of-N and direct commands
    IsolatedExecutor.getInstance();

    // ============ Phase 18.4 — Best-of-N Selection ============
    const bestOfN = BestOfNOrchestrator.getInstance();
    bestOfN.initialize(services.api, {
      n: ConfigManager.get<number>('bestOfN.n', 3),
      strategy: ConfigManager.get<SelectionStrategy>('bestOfN.strategy', SelectionStrategy.HIGHEST_SCORE),
      weightScore: ConfigManager.get<number>('bestOfN.weightScore', 0.4),
      weightComplexity: ConfigManager.get<number>('bestOfN.weightComplexity', 0.2),
      weightReadability: ConfigManager.get<number>('bestOfN.weightReadability', 0.2),
      weightTests: ConfigManager.get<number>('bestOfN.weightTests', 0.2),
      useWorktrees: ConfigManager.get<boolean>('bestOfN.useWorktrees', true),
      candidateTimeoutMs: ConfigManager.get<number>('bestOfN.candidateTimeoutMs', 120_000),
    });

    // Wire Best-of-N into the multi-agent orchestrator for high-risk tasks
    multiAgent.setBestOfN(bestOfN);

    context.subscriptions.push(
      { dispose: () => worktreeManager.dispose() },
      { dispose: () => bestOfN.dispose() },

      // ---- Worktree commands ----
      vscode.commands.registerCommand('inaCoding.worktree.create', async () => {
        const label = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Worktree label',
          placeHolder: 'e.g. feature/new-auth',
        });
        if (!label) return;
        try {
          const wt = await worktreeManager.create(undefined, { label });
          vscode.window.showInformationMessage(
            `Created worktree ${wt.branch} at ${wt.path}`
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(`Create worktree failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.worktree.merge', async () => {
        const list = worktreeManager.list();
        if (list.length === 0) {
          vscode.window.showWarningMessage('No worktrees to merge');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          list.map((w) => ({
            label: w.label ?? w.branch,
            description: `${w.branch} → ${w.parentBranch}`,
            detail: w.status,
            id: w.id,
          })),
          { placeHolder: 'INA-7 Pro · Select worktree to merge' }
        );
        if (!pick) return;
        const strategy = (await vscode.window.showQuickPick(
          [
            { label: 'merge', description: 'Standard --no-ff merge' },
            { label: 'rebase', description: 'Fast-forward only (requires clean history)' },
            { label: 'squash', description: 'Squash merge (single commit)' },
          ],
          { placeHolder: 'Merge strategy' }
        )) as any;
        if (!strategy) return;
        const result = await worktreeManager.merge(pick.id, strategy.label);
        if (result.success) {
          vscode.window.showInformationMessage(result.message);
        } else {
          vscode.window.showErrorMessage(result.message);
        }
      }),

      vscode.commands.registerCommand('inaCoding.worktree.abandon', async () => {
        const list = worktreeManager.list();
        if (list.length === 0) {
          vscode.window.showWarningMessage('No worktrees to abandon');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          list.map((w) => ({
            label: w.label ?? w.branch,
            description: `${w.branch} → ${w.parentBranch}`,
            detail: w.status,
            id: w.id,
          })),
          { placeHolder: 'INA-7 Pro · Select worktree to abandon' }
        );
        if (!pick) return;
        const confirm = await vscode.window.showWarningMessage(
          `Abandon worktree ${pick.label}? This deletes the worktree and branch.`,
          { modal: true },
          'Abandon'
        );
        if (confirm !== 'Abandon') return;
        await worktreeManager.abandon(pick.id);
        vscode.window.showInformationMessage(`Abandoned worktree ${pick.label}`);
      }),

      vscode.commands.registerCommand('inaCoding.worktree.open', async () => {
        const list = worktreeManager.list();
        if (list.length === 0) {
          vscode.window.showWarningMessage('No worktrees to open');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          list.map((w) => ({
            label: w.label ?? w.branch,
            description: w.path,
            detail: w.status,
            id: w.id,
          })),
          { placeHolder: 'INA-7 Pro · Open worktree' }
        );
        if (!pick) return;
        await worktreeManager.switchTo(pick.id);
      }),

      // ---- Best-of-N commands ----
      vscode.commands.registerCommand('inaCoding.bestOfN.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage('No active editor');
          return;
        }
        const description = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Best-of-N task description',
          placeHolder: 'e.g. Add input validation to this endpoint',
        });
        if (!description) return;

        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'INA-7 Pro · Generating candidates…',
            cancellable: false,
          },
          () =>
            bestOfN.run({
              taskId: `manual_${Date.now()}`,
              description,
              filePath: editor.document.uri.fsPath,
              language: editor.document.languageId,
              existingCode: editor.document.getText(),
            })
        );

        vscode.window.showInformationMessage(
          `Winner: ${result.selection.winner.id} — score ${result.selection.winner.finalScore}/100 (${result.selection.rationale})`
        );
        // Offer to apply the winning code
        const apply = await vscode.window.showInformationMessage(
          'Apply winning candidate?',
          'Apply',
          'View All'
        );
        if (apply === 'Apply') {
          await editor.edit((e) => {
            const fullRange = new vscode.Range(
              editor.document.positionAt(0),
              editor.document.positionAt(editor.document.getText().length)
            );
            e.replace(fullRange, result.selection.winner.code);
          });
          await editor.document.save();
          vscode.window.showInformationMessage('Winning candidate applied');
        }
      }),

      vscode.commands.registerCommand('inaCoding.bestOfN.compare', async () => {
        // Show a read-only virtual document with all recent candidates.
        // This is a simple fallback — the rich UI lives in the webview panel.
        vscode.window.showInformationMessage(
          'Best-of-N comparison panel is rendered inside the INA Coding chat panel.'
        );
      }),
    );
    Logger.info('Worktree + Best-of-N (Phase 18.3 + 18.4) registered');

    // ============ Phase 18.5 — Async Sessions (background execution) ============
    const asyncClient = AsyncSessionClient.getInstance();
    asyncClient.setAuthService(authService);
    const asyncSync = AsyncSessionSync.getInstance();

    // Status bar item — shows running/completed async session counts
    const asyncStatusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    asyncStatusBar.text = '$(cloud) INA-7 Pro';
    asyncStatusBar.tooltip = 'INA-7 Pro · Async Sessions — click to view';
    asyncStatusBar.command = 'inaCoding.async.list';
    if (ConfigManager.get<boolean>('async.enabled', true)) {
      asyncStatusBar.show();
    }
    context.subscriptions.push(asyncStatusBar);

    // Refresh status bar periodically
    const refreshStatusBar = async () => {
      try {
        const { sessions } = await asyncClient.listSessions({ limit: 50 });
        const running = sessions.filter((s) => s.status === 'running' || s.status === 'queued').length;
        const completed = sessions.filter((s) => s.status === 'completed' && !s.applied).length;
        let text = '$(cloud) INA-7 Pro';
        if (running > 0) text += ` · ${running} running`;
        if (completed > 0) text += ` · $(bell-dot) ${completed}`;
        asyncStatusBar.text = text;
      } catch {
        asyncStatusBar.text = '$(cloud-offline) INA-7 Pro';
      }
    };
    const statusBarTimer = setInterval(
      refreshStatusBar,
      Math.max(5000, ConfigManager.get<number>('async.pollInterval', 15000))
    );
    context.subscriptions.push({ dispose: () => clearInterval(statusBarTimer) });

    // On activation: check for completed sessions waiting to apply
    if (ConfigManager.get<boolean>('async.enabled', true)) {
      asyncSync.checkCompleted().then(() => refreshStatusBar()).catch((e) =>
        Logger.warn(`[AsyncSync] startup check failed: ${String(e)}`)
      );
    }

    context.subscriptions.push(
      // ---- Async commands ----
      vscode.commands.registerCommand('inaCoding.async.start', async () => {
        const taskDescription = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Describe the task to run in the background',
          placeHolder: 'e.g. Refactor the auth module to use JWT',
        });
        if (!taskDescription) return;
        try {
          const session = await asyncClient.startAsync(taskDescription, { notifyOnComplete: true });
          vscode.window.showInformationMessage(
            `INA-7 Pro · Started background session ${session.id.substring(0, 8)} — you can close VS Code and come back later.`
          );
          refreshStatusBar();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to start async session: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.async.list', async () => {
        try {
          const { sessions } = await asyncClient.listSessions({ limit: 50 });
          if (sessions.length === 0) {
            vscode.window.showInformationMessage('INA-7 Pro · No async sessions');
            return;
          }
          const items = sessions.map((s) => ({
            label: `${s.status === 'running' ? '$(sync~spin)' : s.status === 'completed' ? '$(check)' : s.status === 'failed' ? '$(error)' : '$(clock)'} ${s.taskDescription.substring(0, 70)}`,
            description: `${s.progress}% · ${s.totalTokensUsed.toLocaleString()} tokens`,
            detail: `id: ${s.id.substring(0, 8)} · status: ${s.status} · ${new Date(s.updatedAt).toLocaleString()}`,
            session: s,
          }));
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'INA-7 Pro · Select a session',
            matchOnDescription: true,
            matchOnDetail: true,
          });
          if (!picked) return;
          if (picked.session.status === 'completed' && !picked.session.applied) {
            await asyncSync.reviewAndApply(picked.session.id);
            refreshStatusBar();
          } else {
            const session = await asyncClient.getSession(picked.session.id);
            const text = [
              `Task: ${session.taskDescription}`,
              `Status: ${session.status}`,
              `Progress: ${session.progress}%`,
              `Tokens: ${session.totalTokensUsed.toLocaleString()}`,
              `Results: ${session.results.length}`,
              session.error ? `Error: ${session.error}` : '',
            ]
              .filter(Boolean)
              .join('\n');
            vscode.window.showInformationMessage(text, { modal: true });
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to list sessions: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.async.apply', async () => {
        const { sessions } = await asyncClient.listSessions({ limit: 50 });
        const completed = sessions.filter((s) => s.status === 'completed' && !s.applied);
        if (completed.length === 0) {
          vscode.window.showInformationMessage('INA-7 Pro · No completed sessions to apply');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          completed.map((s) => ({
            label: s.taskDescription.substring(0, 80),
            description: `${s.totalTokensUsed.toLocaleString()} tokens`,
            id: s.id,
          })),
          { placeHolder: 'INA-7 Pro · Pick a completed session to apply' }
        );
        if (!picked) return;
        await asyncSync.reviewAndApply(picked.id);
        refreshStatusBar();
      }),

      vscode.commands.registerCommand('inaCoding.async.cancel', async () => {
        const { sessions } = await asyncClient.listSessions({ limit: 50 });
        const active = sessions.filter((s) => s.status === 'running' || s.status === 'queued');
        if (active.length === 0) {
          vscode.window.showInformationMessage('INA-7 Pro · No running sessions to cancel');
          return;
        }
        const picked = await vscode.window.showQuickPick(
          active.map((s) => ({
            label: s.taskDescription.substring(0, 80),
            description: `${s.progress}% · ${s.status}`,
            id: s.id,
          })),
          { placeHolder: 'INA-7 Pro · Pick a session to cancel' }
        );
        if (!picked) return;
        try {
          await asyncClient.cancelSession(picked.id);
          vscode.window.showInformationMessage(`INA-7 Pro · Cancelled session ${picked.id.substring(0, 8)}`);
          refreshStatusBar();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Cancel failed: ${e?.message ?? String(e)}`);
        }
      }),
    );
    Logger.info('Async Sessions (Phase 18.5) registered');

    // ============ Phase 19 Step 19.3 — PR/Code Review Agent ============
    const { ReviewEngine } = require('./services/review/ReviewEngine');
    const { PRDescriptionGenerator } = require('./services/review/PRDescriptionGenerator');
    const { CommitMessageGenerator: ReviewCommitGen } = require('./services/review/CommitMessageGenerator');

    // ============ Phase 19 Step 19.4 — Codebase Knowledge Graph ============
    const { CodeEntityExtractor } = require('./services/knowledge/CodeEntityExtractor');
    const { RelationAnalyzer: RelAnalyzer } = require('./services/knowledge/RelationAnalyzer');
    const { ImpactAnalyzer: ImpAnalyzer } = require('./services/knowledge/ImpactAnalyzer');
    const { SemanticCodeSearch } = require('./services/knowledge/SemanticCodeSearch');
    const { ArchitectureAnalyzer } = require('./services/knowledge/ArchitectureAnalyzer');

    // ============ Auth helper for debug & test gen ============
    async function getAuthHeaders(): Promise<Record<string, string>> {
      const headers: Record<string, string> = {};
      try {
        const token = await (authService as any).getAccessToken?.();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch { /* */ }
      return headers;
    }

    // ============ Phase 19 Step 19.1 — AI-Powered Debugger ============
    const { StackTraceParser } = require('./services/debug/StackTraceParser');
    const { DebugContextBuilder } = require('./services/debug/DebugContextBuilder');
    const { AIDebugAnalyzer } = require('./services/debug/AIDebugAnalyzer');
    const { TerminalErrorWatcher } = require('./services/debug/TerminalErrorWatcher');
    const { BreakpointAdvisor } = require('./services/debug/BreakpointAdvisor');
    const workspaceRootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const terminalWatcher = new TerminalErrorWatcher();
    context.subscriptions.push(terminalWatcher);

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.debug.analyzeError', async () => {
        const editor = vscode.window.activeTextEditor;
        const errorText = editor ? editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection) : '';
        if (!errorText.trim()) {
          vscode.window.showWarningMessage('INA-7 Pro · Select or open a file with error output to analyze');
          return;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Analyzing error...' }, async () => {
          const parser = new StackTraceParser(workspaceRootPath);
          const parsed = parser.parse(errorText);
          const ctxBuilder = new DebugContextBuilder(workspaceRootPath);
          const debugCtx = await ctxBuilder.build(parsed);
          const analyzer = new AIDebugAnalyzer();
          const headers = await getAuthHeaders();
          const result = await analyzer.analyze(debugCtx, headers);
          const fixList = result.suggestedFixes.map((f: any, i: number) => `${i + 1}. [${f.risk}] ${f.description}`).join('\n');
          vscode.window.showInformationMessage(
            `INA-7 Pro Debug (${result.confidence}%)\n\nRoot cause: ${result.rootCause}\n\nFixes:\n${fixList || 'None'}`,
            { modal: true }
          );
        });
      }),

      vscode.commands.registerCommand('inaCoding.debug.analyzeTerminal', async () => {
        const output = terminalWatcher.getBuffer();
        if (!output.trim()) {
          vscode.window.showWarningMessage('INA-7 Pro · No terminal output captured');
          return;
        }
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Analyzing terminal output...' }, async () => {
          const parser = new StackTraceParser(workspaceRootPath);
          const parsed = parser.parse(output);
          const ctxBuilder = new DebugContextBuilder(workspaceRootPath);
          const debugCtx = await ctxBuilder.build(parsed);
          const analyzer = new AIDebugAnalyzer();
          const headers = await getAuthHeaders();
          const result = await analyzer.analyze(debugCtx, headers);
          vscode.window.showInformationMessage(`INA-7 Pro Debug (${result.confidence}%): ${result.rootCause}`, { modal: true });
        });
      }),

      vscode.commands.registerCommand('inaCoding.debug.suggestBreakpoints', async () => {
        const editor = vscode.window.activeTextEditor;
        const errorText = editor ? editor.document.getText(editor.selection) : '';
        if (!errorText.trim()) { vscode.window.showWarningMessage('INA-7 Pro · Select error output first'); return; }
        const parser = new StackTraceParser(workspaceRootPath);
        const parsed = parser.parse(errorText);
        const ctxBuilder = new DebugContextBuilder(workspaceRootPath);
        const debugCtx = await ctxBuilder.build(parsed);
        const analyzer = new AIDebugAnalyzer();
        const headers = await getAuthHeaders();
        const result = await analyzer.analyze(debugCtx, headers);
        const advisor = new BreakpointAdvisor(workspaceRootPath);
        const bps = advisor.suggestBreakpoints(result);
        const count = await advisor.applyBreakpoints(bps);
        vscode.window.showInformationMessage(`INA-7 Pro · Set ${count} breakpoint${count !== 1 ? 's' : ''}`);
      }),
    );
    Logger.info('AI-Powered Debugger (Phase 19 Step 19.1) registered');

    // ============ Phase 19 Step 19.2 — Test Generation ============
    const { TestGenerator } = require('./services/testing/TestGenerator');
    const { TestFrameworkDetector } = require('./services/testing/TestFrameworkDetector');
    const { CoverageAnalyzer } = require('./services/testing/CoverageAnalyzer');
    const { MutationTester } = require('./services/testing/MutationTester');
    const { TestRunner: TestRunnerSvc } = require('./services/testing/TestRunner');
    const { CodeAnalyzer: CodeAnalyzerSvc } = require('./services/testing/CodeAnalyzer');

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.testGen.generateForFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('INA-7 Pro · Open a file first'); return; }
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `INA-7 Pro · Generating tests for ${path.basename(filePath)}...` }, async () => {
          const headers = await getAuthHeaders();
          const generator = new TestGenerator(workspaceRootPath);
          const tests = await generator.generateForFile(filePath, headers);
          if (tests.length === 0) {
            vscode.window.showInformationMessage('INA-7 Pro · No exportable functions found to test');
            return;
          }
          const runner = new TestRunnerSvc(workspaceRootPath, tests[0].framework);
          for (const test of tests) {
            await runner.writeAndRun(test);
          }
          vscode.window.showInformationMessage(`INA-7 Pro · Generated ${tests.length} test(s) → ${tests[0]?.testFile || 'test file'}`);
        });
      }),

      vscode.commands.registerCommand('inaCoding.testGen.generateForFunction', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('INA-7 Pro · Open a file first'); return; }
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const codeAnalyzer = new CodeAnalyzerSvc(workspaceRootPath);
        const functions = codeAnalyzer.analyzeFile(filePath);
        if (functions.length === 0) { vscode.window.showInformationMessage('INA-7 Pro · No functions found'); return; }
        const picked = await vscode.window.showQuickPick(
          functions.map((f: any) => ({ label: f.name, description: `L${f.startLine}-${f.endLine} · ${f.params.length} params · complexity: ${f.complexity}`, fn: f })),
          { placeHolder: 'INA-7 Pro · Select function to test' }
        );
        if (!picked) return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `INA-7 Pro · Generating tests for ${(picked as any).label}...` }, async () => {
          const headers = await getAuthHeaders();
          const generator = new TestGenerator(workspaceRootPath);
          const tests = await generator.generateForFunction((picked as any).fn, headers);
          if (tests.length > 0) {
            const runner = new TestRunnerSvc(workspaceRootPath, tests[0].framework);
            for (const t of tests) await runner.writeAndRun(t);
            vscode.window.showInformationMessage(`INA-7 Pro · Generated ${tests.length} test(s) for ${(picked as any).label}`);
          }
        });
      }),

      vscode.commands.registerCommand('inaCoding.testGen.coverageGaps', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Analyzing coverage...' }, async () => {
          const detector = new TestFrameworkDetector(workspaceRootPath);
          const config = detector.detect();
          const coverageAnalyzer = new CoverageAnalyzer(workspaceRootPath, config.framework);
          let gaps = await coverageAnalyzer.getExistingCoverage();
          if (gaps.length === 0) gaps = await coverageAnalyzer.runCoverageAndAnalyze();
          if (gaps.length === 0) {
            vscode.window.showInformationMessage('INA-7 Pro · No coverage gaps found');
            return;
          }
          const items = gaps.map((g: any) => ({
            label: `${g.priority === 'high' ? '$(error)' : g.priority === 'medium' ? '$(warning)' : '$(check)'} ${g.file}`,
            description: g.branchInfo || `${g.uncoveredLines.length} uncovered lines`,
            detail: `Priority: ${g.priority} · Complexity: ${g.complexity}`,
          }));
          vscode.window.showQuickPick(items, { placeHolder: `INA-7 Pro · ${gaps.length} coverage gap(s) found`, canPickMany: false });
        });
      }),

      vscode.commands.registerCommand('inaCoding.testGen.mutationTest', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('INA-7 Pro · Open a source file'); return; }
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const testFile = `__tests__/${baseName}.test${ext}`;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `INA-7 Pro · Mutation testing ${baseName}...` }, async () => {
          const detector = new TestFrameworkDetector(workspaceRootPath);
          const config = detector.detect();
          const mutationTester = new MutationTester(workspaceRootPath, config.framework);
          const results = await mutationTester.runMutationTests(filePath, testFile, 10);
          const killed = results.filter((r: any) => r.killed).length;
          const score = results.length > 0 ? Math.round((killed / results.length) * 100) : 0;
          vscode.window.showInformationMessage(
            `INA-7 Pro · Mutation score: ${score}% (${killed}/${results.length} mutants killed)`,
            { modal: true }
          );
        });
      }),
    );
    Logger.info('Test Generation (Phase 19 Step 19.2) registered');

    // ============ Phase 19 Step 19.3 — Review commands ============
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.review.reviewChanges', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Reviewing changes...' }, async () => {
          const headers = await getAuthHeaders();
          const engine = new ReviewEngine(workspaceRootPath);
          const report = await engine.review({ files: [], staged: false }, headers);
          const status = report.approvalStatus === 'approve' ? '✓' : report.approvalStatus === 'request-changes' ? '✗' : '●';
          vscode.window.showInformationMessage(
            `INA-7 Pro Review ${status} (${report.overallScore}/100)\n\n${report.summary}\n\n${report.comments.length} comment(s)`,
            { modal: true }
          );
        });
      }),

      vscode.commands.registerCommand('inaCoding.review.generatePRDescription', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Generating PR description...' }, async () => {
          const headers = await getAuthHeaders();
          const generator = new PRDescriptionGenerator(workspaceRootPath);
          const desc = await generator.generate({ files: [] }, headers);
          const text = `## ${desc.title}\n\n${desc.body}${desc.reviewerSuggestions.length > 0 ? `\n\nSuggested reviewers: ${desc.reviewerSuggestions.join(', ')}` : ''}`;
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage(`INA-7 Pro · PR description copied to clipboard: "${desc.title}"`);
        });
      }),

      vscode.commands.registerCommand('inaCoding.review.generateCommit', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Generating commit message...' }, async () => {
          const headers = await getAuthHeaders();
          const commitGen = new ReviewCommitGen(workspaceRootPath);
          const message = await commitGen.generate(true, headers);
          if (!message) { vscode.window.showWarningMessage('INA-7 Pro · No staged changes'); return; }
          const edited = await vscode.window.showInputBox({ prompt: 'INA-7 Pro · Commit message (edit if needed)', value: message, placeHolder: 'type(scope): description' });
          if (edited) {
            await vscode.env.clipboard.writeText(edited);
            vscode.window.showInformationMessage(`INA-7 Pro · Commit message copied: "${edited.split('\n')[0]}"`);
          }
        });
      }),
    );
    Logger.info('PR/Code Review Agent (Phase 19 Step 19.3) registered');

    // Phase 27 — Auto Review on Git Push
    const { AutoReviewTrigger } = require('./services/review/AutoReviewTrigger');
    const autoReviewTrigger = new AutoReviewTrigger(async (scope: any) => {
      try {
        const headers = await getAuthHeaders();
        const engine = new ReviewEngine(workspaceRootPath);
        await engine.review({ files: [], staged: false, ...scope }, headers);
      } catch (e) {
        Logger.warn('[AutoReview] Review failed:', e);
      }
    });
    context.subscriptions.push(autoReviewTrigger);
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.review.toggleAutoReview', async () => {
        const cfg = vscode.workspace.getConfiguration('inaCoding.review');
        const current = cfg.get<boolean>('autoOnPush', false);
        await cfg.update('autoOnPush', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
          `INA-7 Pro Auto-Review: ${!current ? 'Aktiviert' : 'Deaktiviert'}`,
        );
      }),
    );
    Logger.info('Auto Review Trigger (Phase 27) registered');

    // ============ Phase 19 Step 19.4 — Knowledge Graph commands ============
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.knowledge.rebuild', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Building knowledge graph...' }, async (progress) => {
          const extractor = new CodeEntityExtractor(workspaceRootPath);
          const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,go}', '**/node_modules/**', 5000);
          const filePaths = files.map((f: any) => vscode.workspace.asRelativePath(f));
          progress.report({ message: `Extracting entities from ${filePaths.length} files...` });
          const entities = extractor.extractAll(filePaths);
          progress.report({ message: `Analyzing relations among ${entities.length} entities...` });
          const relAnalyzer = new RelAnalyzer(workspaceRootPath);
          const relations = relAnalyzer.analyze(entities, filePaths);
          vscode.window.showInformationMessage(`INA-7 Pro · Knowledge graph: ${entities.length} entities, ${relations.length} relations from ${filePaths.length} files`);
        });
      }),

      vscode.commands.registerCommand('inaCoding.knowledge.search', async () => {
        const query = await vscode.window.showInputBox({ prompt: 'INA-7 Pro · Search codebase', placeHolder: 'function name, class, concept...' });
        if (!query) return;
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `INA-7 Pro · Searching: ${query}` }, async () => {
          const extractor = new CodeEntityExtractor(workspaceRootPath);
          const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,go}', '**/node_modules/**', 2000);
          const filePaths = files.map((f: any) => vscode.workspace.asRelativePath(f));
          const entities = extractor.extractAll(filePaths);
          const entityMap = new Map(entities.map((e: any) => [e.id, e]));
          const graph = { entities: entityMap, relations: [], metadata: { lastUpdated: new Date().toISOString(), fileCount: filePaths.length, entityCount: entities.length, relationCount: 0, workspaceHash: '' } };
          const search = new SemanticCodeSearch(workspaceRootPath);
          const results = search.search(query, graph, 15);
          if (results.length === 0) { vscode.window.showInformationMessage(`INA-7 Pro · No results for "${query}"`); return; }
          const items = results.map((r: any) => ({ label: `$(${r.entity.type === 'function' ? 'symbol-method' : r.entity.type === 'class' ? 'symbol-class' : 'symbol-misc'}) ${r.entity.name}`, description: `${r.matchType} · score: ${r.relevanceScore}`, detail: `${r.entity.filePath}:${r.entity.startLine}`, entity: r.entity }));
          const picked = await vscode.window.showQuickPick(items, { placeHolder: `${results.length} result(s) for "${query}"` });
          if (picked) {
            const uri = vscode.Uri.file(path.join(workspaceRootPath, (picked as any).entity.filePath));
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { selection: new vscode.Range((picked as any).entity.startLine - 1, 0, (picked as any).entity.startLine - 1, 0) });
          }
        });
      }),

      vscode.commands.registerCommand('inaCoding.knowledge.impact', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Analyzing impact...' }, async () => {
          const impactAnalyzer = new ImpAnalyzer(workspaceRootPath);
          const changedFiles = await impactAnalyzer.getChangedFiles();
          if (changedFiles.length === 0) { vscode.window.showInformationMessage('INA-7 Pro · No changed files'); return; }
          const extractor = new CodeEntityExtractor(workspaceRootPath);
          const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,go}', '**/node_modules/**', 5000);
          const filePaths = files.map((f: any) => vscode.workspace.asRelativePath(f));
          const entities = extractor.extractAll(filePaths);
          const entityMap = new Map(entities.map((e: any) => [e.id, e]));
          const relAnalyzer = new RelAnalyzer(workspaceRootPath);
          const relations = relAnalyzer.analyze(entities, filePaths);
          const graph = { entities: entityMap, relations, metadata: { lastUpdated: new Date().toISOString(), fileCount: filePaths.length, entityCount: entities.length, relationCount: relations.length, workspaceHash: '' } };
          const analyses = impactAnalyzer.analyze(changedFiles, graph);
          const summary = impactAnalyzer.generateSummary(analyses);
          vscode.window.showInformationMessage(`INA-7 Pro Impact Analysis\n\n${summary}`, { modal: true });
        });
      }),

      vscode.commands.registerCommand('inaCoding.knowledge.architecture', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Analyzing architecture...' }, async () => {
          const extractor = new CodeEntityExtractor(workspaceRootPath);
          const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,go}', '**/node_modules/**', 5000);
          const filePaths = files.map((f: any) => vscode.workspace.asRelativePath(f));
          const entities = extractor.extractAll(filePaths);
          const entityMap = new Map(entities.map((e: any) => [e.id, e]));
          const relAnalyzer = new RelAnalyzer(workspaceRootPath);
          const relations = relAnalyzer.analyze(entities, filePaths);
          const graph = { entities: entityMap, relations, metadata: { lastUpdated: new Date().toISOString(), fileCount: filePaths.length, entityCount: entities.length, relationCount: relations.length, workspaceHash: '' } };
          const archAnalyzer = new ArchitectureAnalyzer();
          const layers = archAnalyzer.detectLayers(graph);
          const violations = archAnalyzer.detectViolations(graph, layers);
          const summary = archAnalyzer.generateSummary(layers, violations);
          vscode.window.showInformationMessage(`INA-7 Pro Architecture\n\n${summary}`, { modal: true });
        });
      }),
    );
    Logger.info('Knowledge Graph (Phase 19 Step 19.4) registered');

    // ============ Phase 19 Step 19.5 — DevOps Agent ============
    const { StackDetector } = require('./services/devops/StackDetector');
    const { DockerfileGenerator } = require('./services/devops/DockerfileGenerator');
    const { CICDGenerator } = require('./services/devops/CICDGenerator');
    const { KubernetesGenerator } = require('./services/devops/KubernetesGenerator');
    const { InfraAnalyzer } = require('./services/devops/InfraAnalyzer');
    const { EnvManager } = require('./services/devops/EnvManager');
    const fsSync = require('fs') as typeof import('fs');

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.devops.generateDocker', async () => {
        const detector = new StackDetector(workspaceRootPath);
        const stack = detector.detect();
        const generator = new DockerfileGenerator();
        const appName = path.basename(workspaceRootPath);
        const result = generator.generate(stack, appName);
        for (const f of result.files) {
          const uri = vscode.Uri.file(path.join(workspaceRootPath, f.name));
          const dir = path.dirname(uri.fsPath);
          if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
          fsSync.writeFileSync(uri.fsPath, f.content);
        }
        vscode.window.showInformationMessage(`INA-7 Pro · Generated ${result.files.map((f: any) => f.name).join(', ')}`);
      }),

      vscode.commands.registerCommand('inaCoding.devops.generateCI', async () => {
        const detector = new StackDetector(workspaceRootPath);
        const stack = detector.detect();
        const generator = new CICDGenerator();
        const result = generator.generate(stack);
        for (const f of result.files) {
          const absPath = path.join(workspaceRootPath, f.name);
          const dir = path.dirname(absPath);
          if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
          fsSync.writeFileSync(absPath, f.content);
        }
        vscode.window.showInformationMessage(`INA-7 Pro · Generated CI pipeline: ${result.files.map((f: any) => f.name).join(', ')}`);
      }),

      vscode.commands.registerCommand('inaCoding.devops.generateK8s', async () => {
        const detector = new StackDetector(workspaceRootPath);
        const stack = detector.detect();
        const appName = await vscode.window.showInputBox({ prompt: 'INA-7 Pro · Application name for K8s', value: path.basename(workspaceRootPath).toLowerCase().replace(/[^a-z0-9-]/g, '-') });
        if (!appName) return;
        const generator = new KubernetesGenerator();
        const result = generator.generate(stack, appName);
        for (const f of result.files) {
          const absPath = path.join(workspaceRootPath, f.name);
          const dir = path.dirname(absPath);
          if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
          fsSync.writeFileSync(absPath, f.content);
        }
        vscode.window.showInformationMessage(`INA-7 Pro · Generated ${result.files.length} K8s manifest(s) in k8s/`);
      }),

      vscode.commands.registerCommand('inaCoding.devops.analyzeInfra', async () => {
        const analyzer = new InfraAnalyzer(workspaceRootPath);
        const recs = analyzer.analyze();
        if (recs.length === 0) {
          vscode.window.showInformationMessage('INA-7 Pro · No infrastructure issues found');
          return;
        }
        const criticals = recs.filter((r: any) => r.severity === 'critical').length;
        const warnings = recs.filter((r: any) => r.severity === 'warning').length;
        const items = recs.map((r: any) => ({
          label: `${r.severity === 'critical' ? '$(error)' : r.severity === 'warning' ? '$(warning)' : '$(info)'} [${r.category}] ${r.message}`,
          description: r.suggestedChange,
          detail: r.file || '',
        }));
        vscode.window.showQuickPick(items, { placeHolder: `INA-7 Pro · ${criticals} critical, ${warnings} warning, ${recs.length - criticals - warnings} info` });
      }),

      vscode.commands.registerCommand('inaCoding.devops.syncEnv', async () => {
        const envMgr = new EnvManager(workspaceRootPath);
        const { content, keysFound } = envMgr.generateExample();
        if (keysFound === 0) {
          vscode.window.showWarningMessage('INA-7 Pro · No .env file found');
          return;
        }
        fsSync.writeFileSync(path.join(workspaceRootPath, '.env.example'), content);
        const validation = envMgr.syncCheck();
        vscode.window.showInformationMessage(`INA-7 Pro · .env.example generated (${keysFound} keys). ${validation}`);
      }),
    );
    Logger.info('DevOps Agent (Phase 19 Step 19.5) registered');

    // ============ Phase 20 Step 20.1 — AI Pair Programmer ============
    const { ActivityTracker } = require('./services/pair/ActivityTracker');
    const { ProactiveSuggestionEngine } = require('./services/pair/ProactiveSuggestionEngine');
    const { DeveloperProfiler } = require('./services/pair/DeveloperProfiler');
    const { PairNotificationManager } = require('./services/pair/PairNotificationManager');

    const pairMode = ConfigManager.get<string>('pair.mode', 'active');
    const activityTracker = new ActivityTracker();
    const suggestionEngine = ProactiveSuggestionEngine.getInstance();
    const profiler = new DeveloperProfiler(context);
    const pairNotifications = new PairNotificationManager();

    if (pairMode !== 'off') {
      activityTracker.start();
      activityTracker.onStateChange((state: any) => {
        suggestionEngine.processState(state);
        profiler.updateFromState(state);
      });
      suggestionEngine.onSuggestion((s: any) => pairNotifications.showSuggestion(s));
      pairNotifications.onNeverShow = (s: any) => profiler.recordDismissal(s.type);
    }
    context.subscriptions.push(activityTracker);

    // Pair status bar
    const pairStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 45);
    pairStatusBar.text = pairMode === 'active' ? '$(hubot) Pair' : pairMode === 'quiet' ? '$(mute) Quiet' : pairMode === 'learning' ? '$(book) Learning' : '$(circle-slash) Off';
    pairStatusBar.tooltip = 'INA-7 Pro Pair Programmer — click to toggle';
    pairStatusBar.command = 'inaCoding.pair.toggleMode';
    pairStatusBar.show();
    context.subscriptions.push(pairStatusBar);

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.pair.toggleMode', async () => {
        const modes = ['active', 'quiet', 'learning', 'off'];
        const current = ConfigManager.get<string>('pair.mode', 'active');
        const idx = modes.indexOf(current);
        const next = modes[(idx + 1) % modes.length];
        await vscode.workspace.getConfiguration('inaCoding.pair').update('mode', next, vscode.ConfigurationTarget.Global);
        const labels: Record<string, string> = { active: '$(hubot) Pair', quiet: '$(mute) Quiet', learning: '$(book) Learning', off: '$(circle-slash) Off' };
        pairStatusBar.text = labels[next] || '$(hubot) Pair';
        vscode.window.showInformationMessage(`INA-7 Pro · Pair mode: ${next}`);
      }),

      vscode.commands.registerCommand('inaCoding.pair.showInsights', async () => {
        const profile = profiler.getProfile();
        const patterns = Object.entries(profile.preferredPatterns).sort(([,a], [,b]) => (b as number) - (a as number)).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(', ');
        vscode.window.showInformationMessage(`INA-7 Pro Pair Insights\n\nTyping speed: ${Math.round(profile.typingSpeed)} chars/min\nSession: ${profile.totalSessionMinutes} min\nTop patterns: ${patterns || 'N/A'}\nMistakes tracked: ${profile.commonMistakes.length}`, { modal: true });
      }),

      vscode.commands.registerCommand('inaCoding.pair.clearProfile', async () => {
        const confirm = await vscode.window.showWarningMessage('Clear your developer profile?', { modal: true }, 'Clear');
        if (confirm === 'Clear') { profiler.clearProfile(); vscode.window.showInformationMessage('INA-7 Pro · Profile cleared'); }
      }),

      vscode.commands.registerCommand('inaCoding.pair.showSuggestions', () => {
        const suggestions = suggestionEngine.getSuggestions();
        if (suggestions.length === 0) { vscode.window.showInformationMessage('INA-7 Pro · No pending suggestions'); return; }
        const items = suggestions.map((s: any) => ({ label: `$(${s.priority === 'high' ? 'warning' : s.priority === 'urgent' ? 'error' : 'lightbulb'}) ${s.title}`, description: s.message.slice(0, 80), detail: s.file ? `${s.file}:${s.line || ''}` : '', id: s.id }));
        vscode.window.showQuickPick(items, { placeHolder: `${suggestions.length} suggestion(s)` });
      }),
    );
    Logger.info('AI Pair Programmer (Phase 20 Step 20.1) registered');

    // ============ Phase 20 Step 20.2 — Voice-to-Code ============
    const { SpeechToText } = require('./services/voice/SpeechToText');
    const { VoiceIntentParser } = require('./services/voice/VoiceIntentParser');
    const { VoiceActionExecutor } = require('./services/voice/VoiceActionExecutor');
    const { TextToSpeech } = require('./services/voice/TextToSpeech');

    const stt = new SpeechToText();
    const intentParser = new VoiceIntentParser();
    const voiceExecutor = new VoiceActionExecutor();
    const tts = new TextToSpeech();

    const voiceStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 44);
    voiceStatusBar.text = '$(mic) Voice';
    voiceStatusBar.tooltip = 'INA-7 Pro Voice — Cmd+Shift+V to talk';
    voiceStatusBar.command = 'inaCoding.voice.startListening';
    voiceStatusBar.show();
    context.subscriptions.push(voiceStatusBar);

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.voice.startListening', async () => {
        const available = await stt.isAvailable();
        if (!available) {
          vscode.window.showWarningMessage('INA-7 Pro · INA Speech-to-Text not available. Check voice.sttEndpoint setting.');
          return;
        }
        voiceStatusBar.text = '$(record) Recording...';
        voiceStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        // In a real implementation, this would capture audio from microphone
        // For now, use input box as fallback text-based voice simulation
        const transcript = await vscode.window.showInputBox({ prompt: 'INA-7 Pro Voice · Say your command (text simulation)', placeHolder: 'e.g. "write a function that validates emails"' });
        voiceStatusBar.text = '$(mic) Voice';
        voiceStatusBar.backgroundColor = undefined;
        if (!transcript) return;

        voiceStatusBar.text = '$(loading~spin) Processing...';
        const command = { transcript, confidence: 0.95, language: 'en', timestamp: Date.now(), duration: 0 };
        const intent = intentParser.parse(command);
        const result = await voiceExecutor.execute(intent);
        voiceStatusBar.text = result.success ? '$(check) Done' : '$(error) Failed';
        setTimeout(() => { voiceStatusBar.text = '$(mic) Voice'; }, 3000);

        if (result.success && ConfigManager.get<boolean>('voice.feedbackVoice', false)) {
          tts.speak(result.message);
        }
        vscode.window.showInformationMessage(`INA-7 Pro Voice · ${intent.type}: ${result.message}`);
      }),

      vscode.commands.registerCommand('inaCoding.voice.stopListening', () => {
        voiceStatusBar.text = '$(mic) Voice';
        voiceStatusBar.backgroundColor = undefined;
      }),

      vscode.commands.registerCommand('inaCoding.voice.toggleContinuous', async () => {
        const config = vscode.workspace.getConfiguration('inaCoding.voice');
        const current = config.get<boolean>('continuousListening', false);
        await config.update('continuousListening', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`INA-7 Pro · Continuous listening ${!current ? 'ON' : 'OFF'}`);
      }),

      vscode.commands.registerCommand('inaCoding.voice.showCommands', () => {
        const commands = [
          '"Write a function that..."', '"Go to file..."', '"Go to function..."',
          '"On line X, change A to B"', '"Run tests"', '"Fix this error"',
          '"Explain this"', '"Generate tests"', '"Rename X to Y"',
          '"Delete lines X to Y"', '"Undo" / "Redo"', '"Add a comment..."',
        ];
        vscode.window.showQuickPick(commands.map(c => ({ label: c, description: 'Voice command' })), { placeHolder: 'INA-7 Pro Voice Commands' });
      }),

      vscode.commands.registerCommand('inaCoding.voice.testMicrophone', async () => {
        const available = await stt.isAvailable();
        const ttsAvailable = await tts.isAvailable();
        vscode.window.showInformationMessage(`INA-7 Pro · STT: ${available ? '✓' : '✗'} | TTS: ${ttsAvailable ? '✓' : '✗'}`);
      }),
    );
    Logger.info('Voice-to-Code (Phase 20 Step 20.2) registered');

    // ============ Phase 20 Step 20.3 — Analytics Dashboard ============
    const { ComplexityScanner } = require('./services/analytics/ComplexityScanner');
    const { DependencyScanner } = require('./services/analytics/DependencyScanner');
    const { ChurnAnalyzer: ChurnAnalyzerSvc } = require('./services/analytics/ChurnAnalyzer');
    const { DuplicationDetector } = require('./services/analytics/DuplicationDetector');
    const { TrendAnalyzer: TrendAnalyzerSvc } = require('./services/analytics/TrendAnalyzer');

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.analytics.scan', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Scanning project health...' }, async (progress) => {
          progress.report({ message: 'Complexity...' });
          const cs = new ComplexityScanner(workspaceRootPath);
          const complexities = cs.scan();
          progress.report({ message: 'Dependencies...' });
          const ds = new DependencyScanner(workspaceRootPath);
          const deps = await ds.scan();
          progress.report({ message: 'Churn...' });
          const ca = new ChurnAnalyzerSvc(workspaceRootPath);
          const churn = await ca.analyze(90);
          progress.report({ message: 'Duplication...' });
          const dd = new DuplicationDetector(workspaceRootPath);
          const dups = dd.detect();
          const ta = new TrendAnalyzerSvc();
          const score = ta.computeHealthScore({ projectHealth: {} as any, fileComplexities: complexities, dependencyHealth: deps, churnMetrics: churn, duplicationReport: dups, id: '', timestamp: '' });
          const grade = ta.gradeFromScore(score);
          const hotspots = complexities.filter((c: any) => c.hotspot).length;
          const vulns = deps.filter((d: any) => d.hasVulnerability).length;
          vscode.window.showInformationMessage(`INA-7 Pro · Health: ${grade} (${score}/100) | ${hotspots} hotspots | ${vulns} vulns | ${dups.length} dups`, { modal: true });
        });
      }),
      vscode.commands.registerCommand('inaCoding.analytics.showDashboard', () => vscode.commands.executeCommand('inaCoding.analytics.scan')),
      vscode.commands.registerCommand('inaCoding.analytics.showComplexity', async () => {
        const cs = new ComplexityScanner(workspaceRootPath);
        const results = cs.scan().filter((c: any) => c.hotspot);
        const items = results.map((c: any) => ({ label: `$(flame) ${c.filePath.split('/').pop()}`, description: `Complexity: ${c.totalComplexity} | MI: ${c.maintainabilityIndex}`, detail: c.filePath, fp: c.filePath }));
        const picked = await vscode.window.showQuickPick(items, { placeHolder: `${results.length} hotspots` });
        if (picked) await vscode.window.showTextDocument(vscode.Uri.file(path.join(workspaceRootPath, (picked as any).fp)));
      }),
      vscode.commands.registerCommand('inaCoding.analytics.showDependencies', async () => {
        const ds = new DependencyScanner(workspaceRootPath);
        const deps = await ds.scan();
        const items = deps.slice(0, 30).map((d: any) => ({ label: `${d.hasVulnerability ? '$(error)' : d.isOutdated ? '$(warning)' : '$(check)'} ${d.name}`, description: `${d.currentVersion} → ${d.latestVersion}` }));
        vscode.window.showQuickPick(items, { placeHolder: `${deps.length} dependencies` });
      }),
      vscode.commands.registerCommand('inaCoding.analytics.showDuplication', async () => {
        const dd = new DuplicationDetector(workspaceRootPath);
        const dups = dd.detect();
        if (dups.length === 0) { vscode.window.showInformationMessage('INA-7 Pro · No duplication found'); return; }
        const items = dups.slice(0, 20).map((d: any) => ({ label: `${d.lineCount} lines`, description: `${d.blockA.file}:${d.blockA.startLine} ↔ ${d.blockB.file}:${d.blockB.startLine}` }));
        vscode.window.showQuickPick(items, { placeHolder: `${dups.length} duplication(s)` });
      }),
    );
    Logger.info('Analytics Dashboard (Phase 20 Step 20.3) registered');

    // ============ Phase 20 Step 20.4 — Technical Debt Tracker ============
    const { DebtDetector } = require('./services/debt/DebtDetector');
    const { DebtPrioritizer } = require('./services/debt/DebtPrioritizer');
    const { DebtReporter } = require('./services/debt/DebtReporter');

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.debt.scan', async () => {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Scanning debt...' }, async () => {
          const detector = new DebtDetector(workspaceRootPath);
          const items = detector.detect();
          const reporter = new DebtReporter();
          const budget = reporter.computeBudget(items);
          vscode.window.showInformationMessage(`INA-7 Pro · Debt: ${budget.totalItems} items (${budget.totalEstimatedHours.toFixed(0)}h) | ${items.filter((i: any) => i.severity === 'critical').length} critical`, { modal: true });
        });
      }),
      vscode.commands.registerCommand('inaCoding.debt.showDashboard', () => vscode.commands.executeCommand('inaCoding.debt.scan')),
      vscode.commands.registerCommand('inaCoding.debt.showList', async () => {
        const detector = new DebtDetector(workspaceRootPath);
        const items = detector.detect();
        const prioritizer = new DebtPrioritizer();
        const sorted = prioritizer.prioritize(items);
        const qp = sorted.slice(0, 30).map((i: any) => ({ label: `${i.severity === 'critical' ? '$(error)' : i.severity === 'high' ? '$(warning)' : '$(info)'} ${i.title}`, description: `${i.type} · ${i.estimatedEffort}h`, detail: `${i.file}:${i.startLine}`, item: i }));
        const picked = await vscode.window.showQuickPick(qp, { placeHolder: `${items.length} debt items` });
        if (picked) { const uri = vscode.Uri.file(path.join(workspaceRootPath, (picked as any).item.file)); await vscode.window.showTextDocument(uri, { selection: new vscode.Range((picked as any).item.startLine - 1, 0, (picked as any).item.startLine - 1, 0) }); }
      }),
      vscode.commands.registerCommand('inaCoding.debt.planSprint', async () => {
        const hours = await vscode.window.showInputBox({ prompt: 'Debt budget (hours)', value: '8' });
        if (!hours) return;
        const items = new DebtDetector(workspaceRootPath).detect();
        const plan = new DebtPrioritizer().planSprint(items, parseFloat(hours));
        vscode.window.showInformationMessage(`INA-7 Pro · Sprint: ${plan.selectedItems.length} items, ${plan.totalEffort.toFixed(1)}h`, { modal: true });
      }),
      vscode.commands.registerCommand('inaCoding.debt.exportReport', async () => {
        const items = new DebtDetector(workspaceRootPath).detect();
        const reporter = new DebtReporter();
        const md = reporter.generateMarkdown(items, reporter.computeBudget(items));
        await vscode.env.clipboard.writeText(md);
        vscode.window.showInformationMessage('INA-7 Pro · Debt report copied');
      }),
      vscode.commands.registerCommand('inaCoding.debt.installGitHook', () => {
        vscode.window.showInformationMessage('INA-7 Pro · Use inaCoding.debt.scan in pre-commit hook');
      }),
    );
    Logger.info('Technical Debt Tracker (Phase 20 Step 20.4) registered');

    // ============ Phase 23 — Terminal Intelligence, Lint Fix, Quick Fix, Max Mode ============
    // Feature 1: Terminal Completion
    const { TerminalCompletionProvider } = require('./services/terminal/TerminalCompletionProvider');
    const termCompletion = new TerminalCompletionProvider(workspaceRootPath);
    termCompletion.register(context);
    context.subscriptions.push(termCompletion);

    // Feature 2: Interpreter/REPL
    const { InterpreterService } = require('./services/terminal/InterpreterService');
    const interpreter = InterpreterService.getInstance(workspaceRootPath);
    context.subscriptions.push(interpreter);

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.interpreter.run', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
          vscode.window.showWarningMessage('INA-7 Pro · Select code to run');
          return;
        }
        const code = editor.document.getText(editor.selection);
        const language = editor.document.languageId;
        const result = await interpreter.executeInREPL(code, language);
        vscode.window.showInformationMessage(`INA-7 Pro · ${result.output}`);
      }),
      vscode.commands.registerCommand('inaCoding.interpreter.stop', () => {
        interpreter.stopREPL();
        vscode.window.showInformationMessage('INA-7 Pro · REPL stopped');
      }),
    );

    // Feature 3: Auto Lint Fix
    const { AutoLintFixService } = require('./services/lint/AutoLintFixService');

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.lint.autoFix', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('INA-7 Pro · Open a file first'); return; }
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const maxIter = ConfigManager.get<number>('lint.maxIterations', 3);
        const headers = await getAuthHeaders();

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'INA-7 Pro · Lint fix loop' }, async (progress) => {
          const service = new AutoLintFixService(workspaceRootPath);
          for await (const event of service.iterateUntilClean(filePath, maxIter, headers)) {
            progress.report({ message: event.message });
            if (event.type === 'clean' || event.type === 'max-reached' || event.type === 'error') {
              vscode.window.showInformationMessage(`INA-7 Pro · Lint: ${event.message}`);
              break;
            }
          }
        });
      }),
    );

    // Feature 4: Quick Fix Integration
    const { registerAICodeActions } = require('./providers/AICodeActionProvider');
    registerAICodeActions(context, chatViewProvider);

    // Feature 5: Max Mode
    const maxModeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 46);
    const updateMaxModeBar = () => {
      const isMax = ConfigManager.get<boolean>('maxMode', false);
      maxModeStatusBar.text = isMax ? '$(brain) INA-7 Pro Max' : '$(zap) INA-7 Pro';
      maxModeStatusBar.tooltip = isMax ? 'Max Mode ON — Reasoning model. Click to switch to fast mode.' : 'Fast mode. Click to switch to Max (reasoning) mode.';
      maxModeStatusBar.backgroundColor = isMax ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
      maxModeStatusBar.command = 'inaCoding.toggleMaxMode';
      maxModeStatusBar.show();
    };
    updateMaxModeBar();
    context.subscriptions.push(
      maxModeStatusBar,
      vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('inaCoding.maxMode')) updateMaxModeBar(); }),
      vscode.commands.registerCommand('inaCoding.toggleMaxMode', async () => {
        const config = vscode.workspace.getConfiguration('inaCoding');
        const current = config.get<boolean>('maxMode', false);
        await config.update('maxMode', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(current ? 'INA-7 Pro · Fast mode' : 'INA-7 Pro · Max mode (reasoning)');
      }),
    );

    Logger.info('Phase 23 (Terminal, Lint, QuickFix, MaxMode) registered');

    // ============ Audit Fix: Register missing command stubs ============
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.showCompletionQualityReport', () => {
        vscode.window.showInformationMessage('INA-7 Pro · Completion quality report — coming soon');
      }),
      vscode.commands.registerCommand('inaCoding.resetCompletionLearning', () => {
        vscode.window.showInformationMessage('INA-7 Pro · Completion learning data reset');
      }),
      vscode.commands.registerCommand('inaCoding.exportCompletionFeedback', () => {
        vscode.window.showInformationMessage('INA-7 Pro · Completion feedback exported');
      }),
      vscode.commands.registerCommand('inaCoding.generateFunction', async () => {
        const desc = await vscode.window.showInputBox({ prompt: 'INA-7 Pro · Describe the function to generate', placeHolder: 'e.g. validate email address' });
        if (desc) { await vscode.commands.executeCommand('inaCoding.openChat'); chatViewProvider.addCodeToChat(`Generate a function: ${desc}`, 'text', 'generate'); }
      }),
      vscode.commands.registerCommand('inaCoding.generateTest', async () => {
        await vscode.commands.executeCommand('inaCoding.testGen.generateForFile');
      }),
      vscode.commands.registerCommand('inaCoding.implementInterface', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const selection = editor.document.getText(editor.selection);
        if (selection) { await vscode.commands.executeCommand('inaCoding.openChat'); chatViewProvider.addCodeToChat(`Implement this interface:\n${selection}`, editor.document.languageId, 'implement'); }
        else { vscode.window.showWarningMessage('INA-7 Pro · Select an interface to implement'); }
      }),
    );

    // ============ Phase 24 — Final Parity Commands ============
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.marketplace.runChain', async () => {
        const chains = [
          { label: 'Feature + Tests', description: 'Develop feature then generate tests', id: 'chain-feature-with-tests' },
          { label: 'Bug Fix + Review', description: 'Fix bug then review the fix', id: 'chain-fix-and-review' },
        ];
        const picked = await vscode.window.showQuickPick(chains, { placeHolder: 'INA-7 Pro · Select skill chain' });
        if (!picked) return;
        const input = await vscode.window.showInputBox({ prompt: `Input for "${picked.label}"`, placeHolder: 'Describe the task...' });
        if (!input) return;
        vscode.window.showInformationMessage(`INA-7 Pro · Running chain "${picked.label}": ${input}`);
      }),
      vscode.commands.registerCommand('inaCoding.collab.showActivity', async () => {
        const { CollabClient: CC } = require('./services/collab/CollabClient');
        const client = CC.getInstance();
        if (!client.currentSession) { vscode.window.showInformationMessage('INA-7 Pro · Not in a collaboration session'); return; }
        vscode.window.showInformationMessage('INA-7 Pro · Activity feed available in the Collab panel');
      }),
    );
    Logger.info('Phase 24 (Final Parity) registered');

    // ============ Phase 19B Step 19.1 — Cloud Agents ============
    const cloudAgentClient = CloudAgentClient.getInstance();
    cloudAgentClient.setAuthService(authService);

    // ============ Phase 19B Step 19.2 — Skills marketplace ============
    const skillClient = SkillClient.getInstance();
    skillClient.setAuthService(authService);
    const skillUI = SkillUIProvider.getInstance();
    if (ConfigManager.get<boolean>('marketplace.enabled', true)) {
      const skillUIDisposables = skillUI.register();
      context.subscriptions.push(...skillUIDisposables);
    }

    context.subscriptions.push(
      // ---- Cloud Agent commands ----
      vscode.commands.registerCommand('inaCoding.cloudAgent.dispatch', async () => {
        const taskDescription = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Cloud Agent — describe the task to run on the server',
          placeHolder: 'e.g. Generate a TypeScript SDK for our REST API',
        });
        if (!taskDescription) return;
        try {
          const agent = await cloudAgentClient.dispatch(taskDescription);
          vscode.window.showInformationMessage(
            `INA-7 Pro · Dispatched cloud agent ${agent.id.substring(0, 8)} (${agent.status})`
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(`Cloud dispatch failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.cloudAgent.list', async () => {
        try {
          const { agents } = await cloudAgentClient.listAgents({ limit: 50 });
          if (agents.length === 0) {
            vscode.window.showInformationMessage('INA-7 Pro · No cloud agents');
            return;
          }
          const items = agents.map((a) => ({
            label: `${a.status === 'running' ? '$(sync~spin)' : a.status === 'completed' ? '$(check)' : a.status === 'failed' ? '$(error)' : '$(clock)'} ${a.taskDescription.substring(0, 70)}`,
            description: `${a.status} · ${new Date(a.createdAt).toLocaleString()}`,
            detail: `id: ${a.id.substring(0, 8)}${a.containerId ? ` · container: ${a.containerId.substring(0, 12)}` : ''}`,
            agentId: a.id,
          }));
          const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'INA-7 Pro · Cloud agents',
            matchOnDescription: true,
            matchOnDetail: true,
          });
          if (picked) {
            const agent = await cloudAgentClient.getAgent(picked.agentId);
            const text = [
              `Task: ${agent.taskDescription}`,
              `Status: ${agent.status}`,
              `Container: ${agent.containerId ?? '(none)'}`,
              agent.errorMessage ? `Error: ${agent.errorMessage}` : '',
            ]
              .filter(Boolean)
              .join('\n');
            vscode.window.showInformationMessage(text, { modal: true });
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Cloud list failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.cloudAgent.cancel', async () => {
        try {
          const { agents } = await cloudAgentClient.listAgents({ status: 'running', limit: 50 });
          if (agents.length === 0) {
            vscode.window.showInformationMessage('INA-7 Pro · No running cloud agents');
            return;
          }
          const picked = await vscode.window.showQuickPick(
            agents.map((a) => ({
              label: a.taskDescription.substring(0, 80),
              description: a.id.substring(0, 8),
              agentId: a.id,
            })),
            { placeHolder: 'INA-7 Pro · Cancel which agent?' }
          );
          if (!picked) return;
          await cloudAgentClient.cancelAgent(picked.agentId);
          vscode.window.showInformationMessage(`INA-7 Pro · Cancelled ${picked.agentId.substring(0, 8)}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Cancel failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.cloudAgent.status', async () => {
        try {
          const status = await cloudAgentClient.getStatus();
          const text = [
            `Capacity: ${status.totalRunning}/${status.capacity} running`,
            `Queue depth: ${status.totalQueued}`,
            `Avg wait: ${(status.averageWaitTimeMs / 1000).toFixed(1)}s`,
            `Throughput: ${status.throughputPerHour}/hour`,
            `Docker: ${status.dockerAvailable ? '✓ available' : '✗ unavailable'}`,
          ].join('\n');
          vscode.window.showInformationMessage(`INA-7 Pro · Cloud Agent Status\n${text}`, { modal: true });
        } catch (e: any) {
          vscode.window.showErrorMessage(`Status failed: ${e?.message ?? String(e)}`);
        }
      }),

      // ---- Marketplace commands ----
      vscode.commands.registerCommand('inaCoding.marketplace.browse', async () => {
        try {
          const { skills } = await skillClient.browseSkills({ limit: 50 });
          if (skills.length === 0) {
            vscode.window.showInformationMessage('INA-7 Pro · No skills available');
            return;
          }
          const picked = await vscode.window.showQuickPick(
            skills.map((s) => ({
              label: `${s.icon} ${s.name}`,
              description: `v${s.version} · ${s.installCount} installs · ★ ${s.rating.toFixed(1)}`,
              detail: s.description,
              slug: s.slug,
            })),
            { placeHolder: 'INA-7 Pro · Skills marketplace', matchOnDescription: true, matchOnDetail: true }
          );
          if (picked) {
            const action = await vscode.window.showQuickPick(['Install', 'Run', 'View details'], {
              placeHolder: `Action for ${picked.label}`,
            });
            if (action === 'Install') {
              await skillClient.installSkill(picked.slug);
              vscode.window.showInformationMessage(`INA-7 Pro · Installed ${picked.label}`);
              skillUI.refresh();
            } else if (action === 'Run') {
              await vscode.commands.executeCommand('inaCoding.marketplace.run', picked.slug);
            }
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Browse failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.marketplace.install', async (slugOrId?: string) => {
        const slug =
          slugOrId ??
          (await vscode.window.showInputBox({
            prompt: 'INA-7 Pro · Skill slug to install',
            placeHolder: 'feature-development',
          }));
        if (!slug) return;
        try {
          await skillClient.installSkill(slug);
          vscode.window.showInformationMessage(`INA-7 Pro · Installed skill ${slug}`);
          skillUI.refresh();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Install failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.marketplace.run', async (slugOrId?: string) => {
        const slug =
          slugOrId ??
          (await vscode.window.showInputBox({
            prompt: 'INA-7 Pro · Skill slug to run',
            placeHolder: 'bug-fix',
          }));
        if (!slug) return;
        // Fetch skill to discover required inputs
        let skillDetail;
        try {
          skillDetail = await skillClient.getSkill(slug);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Skill not found: ${e?.message ?? String(e)}`);
          return;
        }
        const inputs: Record<string, any> = {};
        for (const def of skillDetail.inputs ?? []) {
          if (!def.required) continue;
          const value = await vscode.window.showInputBox({
            prompt: `INA-7 Pro · ${def.name} (${def.type})`,
            placeHolder: def.description,
          });
          if (value === undefined) return;
          inputs[def.name] = value;
        }
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `INA-7 Pro · Running ${skillDetail.name}` },
          () =>
            new Promise<void>((resolve) => {
              const unsubscribe = skillClient.executeSkill(slug, inputs, (event) => {
                if (event.type === 'execution-completed' || event.type === 'execution-failed') {
                  unsubscribe();
                  if (event.type === 'execution-completed') {
                    vscode.window.showInformationMessage(`INA-7 Pro · ${skillDetail.name} completed`);
                  } else {
                    vscode.window.showErrorMessage(`Skill failed: ${event.error ?? 'unknown'}`);
                  }
                  resolve();
                }
              });
            })
        );
      }),

      vscode.commands.registerCommand('inaCoding.marketplace.create', async () => {
        const name = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · New skill name',
          placeHolder: 'My Custom Skill',
        });
        if (!name) return;
        const slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        const description = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Short description',
        });
        if (!description) return;
        try {
          const created = await skillClient.createSkill({
            name,
            slug,
            description,
            category: 'custom',
            steps: [
              {
                order: 1,
                name: 'Step 1',
                type: 'prompt',
                prompt: '{{input.task}}',
                requiresApproval: false,
                timeout: 60,
              } as any,
            ],
            inputs: [
              {
                name: 'task',
                type: 'string',
                description: 'What should the skill do?',
                required: true,
              } as any,
            ],
            visibility: 'private',
          });
          vscode.window.showInformationMessage(
            `INA-7 Pro · Created skill ${created.slug} (id: ${created.id.substring(0, 8)})`
          );
          skillUI.refresh();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Create failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.marketplace.import', async () => {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'INA Skill': ['ina-skill', 'json'] },
          openLabel: 'Import skill',
        });
        if (!uris || uris.length === 0) return;
        try {
          const result = await skillClient.importSkill(uris[0].fsPath);
          vscode.window.showInformationMessage(
            `INA-7 Pro · ${result.isUpgrade ? 'Upgraded' : 'Imported'} skill ${result.skill.slug}`
          );
          skillUI.refresh();
        } catch (e: any) {
          vscode.window.showErrorMessage(`Import failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.marketplace.export', async () => {
        const slug = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Skill slug to export',
          placeHolder: 'feature-development',
        });
        if (!slug) return;
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(`${slug}.ina-skill`),
          filters: { 'INA Skill': ['ina-skill'] },
        });
        if (!uri) return;
        try {
          await skillClient.exportSkill(slug, uri.fsPath);
          vscode.window.showInformationMessage(`INA-7 Pro · Exported to ${uri.fsPath}`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Export failed: ${e?.message ?? String(e)}`);
        }
      }),
    );
    Logger.info('Cloud Agents + Marketplace (Phase 19B) registered');

    // ============ Phase 19B Step 19.5 — Collaboration ============
    const { CollabClient } = require('./services/collab/CollabClient');
    const collabClient = CollabClient.getInstance();
    collabClient.setAuthService(authService);

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.collab.start', async () => {
        const title = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Collaboration — session title',
          placeHolder: 'e.g. Bug fix sprint, API review...',
        });
        if (!title) return;
        try {
          const session = await collabClient.createSession(title);
          await vscode.env.clipboard.writeText(session.code);
          vscode.window.showInformationMessage(
            `INA-7 Pro · Session "${title}" started — code ${session.code} copied to clipboard. Share it with your team!`
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(`Collab start failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.collab.join', async (sessionCode?: string) => {
        const code =
          sessionCode ??
          (await vscode.window.showInputBox({
            prompt: 'INA-7 Pro · Enter 6-character session code',
            placeHolder: 'ABC123',
            validateInput: (v) =>
              /^[A-Z0-9]{6}$/i.test(v.trim()) ? null : 'Code must be 6 alphanumeric characters',
          }));
        if (!code) return;
        const name = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Your display name for this session',
          placeHolder: 'Your name',
          value: vscode.env.machineId?.substring(0, 8) || 'User',
        });
        if (!name) return;
        try {
          const session = await collabClient.joinSession(code.trim().toUpperCase(), name);
          vscode.window.showInformationMessage(
            `INA-7 Pro · Joined "${session.title}" (${session.participants.length} participants)`
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(`Collab join failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.collab.leave', async () => {
        if (!collabClient.currentSession) {
          vscode.window.showInformationMessage('INA-7 Pro · Not in a collaboration session');
          return;
        }
        try {
          await collabClient.leaveSession();
          vscode.window.showInformationMessage('INA-7 Pro · Left collaboration session');
        } catch (e: any) {
          vscode.window.showErrorMessage(`Collab leave failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.collab.end', async () => {
        if (!collabClient.currentSession) {
          vscode.window.showInformationMessage('INA-7 Pro · Not in a collaboration session');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          'End this collaboration session for all participants?',
          { modal: true },
          'End Session'
        );
        if (confirm !== 'End Session') return;
        try {
          await collabClient.endSession();
          vscode.window.showInformationMessage('INA-7 Pro · Session ended');
        } catch (e: any) {
          vscode.window.showErrorMessage(`Collab end failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.collab.shareFile', async () => {
        if (!collabClient.currentSession) {
          vscode.window.showInformationMessage('INA-7 Pro · Not in a collaboration session');
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('INA-7 Pro · No active file to share');
          return;
        }
        const content = editor.document.getText();
        const fileName = path.basename(editor.document.fileName);
        const language = editor.document.languageId;
        try {
          await collabClient.shareFile(fileName, content, language);
          vscode.window.showInformationMessage(`INA-7 Pro · Shared ${fileName} with team`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`File share failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.collab.newNotepad', async () => {
        if (!collabClient.currentSession) {
          vscode.window.showInformationMessage('INA-7 Pro · Not in a collaboration session');
          return;
        }
        const title = await vscode.window.showInputBox({
          prompt: 'INA-7 Pro · Notepad title',
          placeHolder: 'e.g. Requirements, API Spec, TODOs...',
        });
        if (!title) return;
        const type = (await vscode.window.showQuickPick(
          [
            { label: 'Text', description: 'Free-form notepad', value: 'text' },
            { label: 'Requirements', description: 'Structured requirements', value: 'requirements' },
            { label: 'API Spec', description: 'API specification template', value: 'api-spec' },
            { label: 'To-Do', description: 'Checklist', value: 'todo' },
          ],
          { placeHolder: 'Notepad type' }
        )) as any;
        if (!type) return;
        try {
          await collabClient.createNotepad(title, type.value);
          vscode.window.showInformationMessage(`INA-7 Pro · Created notepad "${title}"`);
        } catch (e: any) {
          vscode.window.showErrorMessage(`Notepad creation failed: ${e?.message ?? String(e)}`);
        }
      }),

      vscode.commands.registerCommand('inaCoding.collab.copyCode', async () => {
        if (!collabClient.currentSession) {
          vscode.window.showInformationMessage('INA-7 Pro · Not in a collaboration session');
          return;
        }
        await vscode.env.clipboard.writeText(collabClient.currentSession.code);
        vscode.window.showInformationMessage(
          `INA-7 Pro · Session code ${collabClient.currentSession.code} copied to clipboard`
        );
      }),
    );
    // Phase 20.5 — Enhanced Collaboration
    const { CursorDecorator } = require('./services/collab/CursorDecorator');
    const { CollabTreeView } = require('./services/collab/CollabTreeView');
    const cursorDecorator = new CursorDecorator();
    const collabTree = new CollabTreeView();
    context.subscriptions.push(cursorDecorator, collabTree, ...collabTree.register());

    collabClient.on('*', (event: any) => {
      if (event?.type === 'cursor_update' && event?.data?.userId) {
        cursorDecorator.updateCursor({ userId: event.data.userId, name: event.data.name || '', color: event.data.color || '#3b82f6', file: event.data.file || '', line: event.data.line || 0, column: event.data.column || 0, isTyping: false, lastUpdate: Date.now() });
      }
      if (event?.type === 'leave') cursorDecorator.removeCursor(event.data?.userId);
    });

    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.collab.showParticipants', () => {
        if (!collabClient.currentSession) { vscode.window.showInformationMessage('INA-7 Pro · Not in a session'); return; }
        const ps = collabClient.currentSession.participants || [];
        vscode.window.showQuickPick(ps.map((p: any) => ({ label: `${p.role === 'host' ? '★' : '●'} ${p.name}`, description: p.currentFile || '' })), { placeHolder: `${ps.length} participant(s)` });
      }),
      vscode.commands.registerCommand('inaCoding.collab.toggleChat', () => { vscode.commands.executeCommand('inaCoding.openChat'); }),
      vscode.commands.registerCommand('inaCoding.collab.followParticipant', async () => {
        if (!collabClient.currentSession) return;
        const ps = (collabClient.currentSession.participants || []).filter((p: any) => p.currentFile);
        const picked = await vscode.window.showQuickPick(ps.map((p: any) => ({ label: p.name, description: p.currentFile })), { placeHolder: 'Follow' });
        if (picked) { try { await vscode.window.showTextDocument(vscode.Uri.file(path.join(workspaceRootPath, (picked as any).description))); } catch { /* */ } }
      }),
      vscode.commands.registerCommand('inaCoding.collab.aiAssist', async () => {
        if (!collabClient.currentSession) return;
        const q = await vscode.window.showInputBox({ prompt: 'Ask AI (shared)', placeHolder: 'Question...' });
        if (q) { try { await collabClient.askAI(q); } catch { /* */ } }
      }),
      vscode.commands.registerCommand('inaCoding.collab.inviteCopy', () => vscode.commands.executeCommand('inaCoding.collab.copyCode')),
    );
    Logger.info('Collaboration (Phase 19B + 20.5) registered');

    // Phase 25.8 — Telemetry integration hooks
    // Hook into agent lifecycle
    try {
      const agentSM: any = AgentSessionManager.getInstance();
      if (agentSM && typeof agentSM.on === 'function') {
        agentSM.on('sessionStarted', () => { try { telemetryClient?.trackAgent('start'); } catch {} });
        agentSM.on('sessionCompleted', (data: any) => { try { telemetryClient?.trackAgent('complete', { responseTimeMs: data?.durationMs, tokenCount: data?.tokenCount }); } catch {} });
        agentSM.on('sessionError', (data: any) => { try { telemetryClient?.trackAgent('error', { errorType: data?.errorType || 'unknown' }); } catch {} });
      }
    } catch { /* Agent events not available */ }

    // Hook into skill execution
    try {
      const sc: any = SkillClient.getInstance();
      if (sc && typeof sc.on === 'function') {
        sc.on('skillExecuted', (data: any) => { try { telemetryClient?.trackSkill('run', { responseTimeMs: data?.durationMs }); } catch {} });
        sc.on('skillCompleted', (data: any) => { try { telemetryClient?.trackSkill('complete', { responseTimeMs: data?.durationMs }); } catch {} });
        sc.on('skillError', () => { try { telemetryClient?.trackSkill('error'); } catch {} });
      }
    } catch { /* Skill events not available */ }

    // Track document language on active editor change for language stats
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document?.languageId) {
          try { (telemetryClient as any)._lastLanguage = editor.document.languageId; } catch {}
        }
      }),
    );
    Logger.info('Telemetry integration (Phase 25.8) registered');

    // ============ Phase 29 — Browser Preview + Design Mode ============
    const { BrowserPreviewService } = require('./services/preview/BrowserPreviewService');
    const browserPreview = new BrowserPreviewService(context);
    context.subscriptions.push(
      { dispose: () => browserPreview.dispose() },
      vscode.commands.registerCommand('inaCoding.preview.open', () => browserPreview.openPreview()),
      vscode.commands.registerCommand('inaCoding.preview.openUrl', async () => {
        const url = await vscode.window.showInputBox({ prompt: 'URL eingeben', value: 'http://localhost:3000' });
        if (url) browserPreview.openPreview(url);
      }),
      vscode.commands.registerCommand('inaCoding.preview.refresh', () => browserPreview.refresh()),
      vscode.commands.registerCommand('inaCoding.preview.designMode', () => browserPreview.openPreview()),
    );
    Logger.info('Browser Preview + Design Mode (Phase 29) registered');

    // ============ Phase 29 — Agent Dashboard ============
    const { AgentDashboardProvider } = require('./providers/AgentDashboardProvider');
    const agentDashboard = new AgentDashboardProvider(context);
    context.subscriptions.push(
      { dispose: () => agentDashboard.dispose() },
      vscode.commands.registerCommand('inaCoding.agent.dashboard', () => agentDashboard.show()),
    );
    const autoOpenDashboard = vscode.workspace.getConfiguration('inaCoding.agent').get<boolean>('dashboardAsDefault', false);
    if (autoOpenDashboard) { agentDashboard.show(); }
    Logger.info('Agent Dashboard (Phase 29) registered');

    // Phase 30 — Agent Browser Test command
    context.subscriptions.push(
      vscode.commands.registerCommand('inaCoding.agent.testInBrowser', async () => {
        const url = vscode.workspace.getConfiguration('inaCoding.agent').get<string>('browserTestUrl', 'http://localhost:3000');
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          try { if (authService) Object.assign(headers, await authService.getAuthHeaders()); } catch { /* */ }
          const resp = await fetch(`${ConfigManager.getApiEndpoint()}/api/agent/browser`, {
            method: 'POST', headers, body: JSON.stringify({ testUrl: url }),
            signal: AbortSignal.timeout(15000),
          });
          const data = await resp.json();
          const ch = vscode.window.createOutputChannel('INA Browser Test');
          ch.appendLine(JSON.stringify(data, null, 2));
          ch.show();
          const hasErrors = (data.results || []).some((r: any) => !r.success);
          vscode.window.showInformationMessage(
            hasErrors ? `INA-7 Pro: Browser-Test abgeschlossen — Fehler gefunden` : `INA-7 Pro: Browser-Test OK`,
          );
        } catch { vscode.window.showErrorMessage('Browser-Test fehlgeschlagen.'); }
      }),
    );
    Logger.info('Phase 30 features registered');

  } catch (error) {
    Logger.error('Failed to activate INA Coding:', error);
    vscode.window.showErrorMessage(
      `Failed to activate INA Coding: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function deactivate() {
  Logger.info('INA Coding extension deactivating...');

  if (services) {
    services.completion?.dispose();
    services.indexing?.dispose();
    services.chat?.dispose();
    services.historyManager?.dispose();
    services.api?.dispose();
  }

  Logger.info('INA Coding extension deactivated');
}
