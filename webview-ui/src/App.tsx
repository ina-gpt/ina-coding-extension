import React, { useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { MessageList } from '@/components/MessageList';
import { ChatInput } from '@/components/ChatInput';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { WelcomeScreen } from '@/components/onboarding/WelcomeScreen';
import { FeatureTourOverlay } from '@/components/onboarding/FeatureTourOverlay';
import { ProgressiveHintToast } from '@/components/onboarding/ProgressiveHintToast';
import { WhatsNewDialog } from '@/components/onboarding/WhatsNewDialog';
import { ShortcutsPanel } from '@/components/onboarding/ShortcutsPanel';
import { TutorialPanel } from '@/components/onboarding/TutorialPanel';
import { ShortcutManagerPanel } from '@/components/shortcuts/ShortcutManagerPanel';
import { StatusBar } from '@/components/status/StatusBar';
import { HealthDashboard } from '@/components/status/HealthDashboard';
import { TokenUsageDetail } from '@/components/status/TokenUsageDetail';
import { ConnectionIndicatorDetail } from '@/components/status/ConnectionIndicatorDetail';
import { PrivacyDashboard } from '@/components/privacy/PrivacyDashboard';
import { PrivacyNotice } from '@/components/privacy/PrivacyNotice';
import { CodeSecurityPanel } from '@/components/codesec/CodeSecurityPanel';
import { useChatStore, handleExtensionMessage } from '@/store/chatStore';
import { onMessage, postMessage } from '@/utils/vscode';
import 'highlight.js/styles/github-dark.css';
import '@/theme/globalStyles.css';

// Lazy-loaded panel components
const SearchPanel = React.lazy(() => import('@/components/SearchPanel'));
const IndexManagementPanel = React.lazy(() => import('@/components/IndexManagementPanel'));
const IndexingProgress = React.lazy(() => import('@/components/IndexingProgress'));
const AgentChat = React.lazy(() => import('@/components/agent/AgentChat'));
const ComposerView = React.lazy(() => import('@/components/composer/ComposerView'));
const MCPPanel = React.lazy(() => import('@/components/mcp/MCPPanel'));
const NotepadPanel = React.lazy(() => import('@/components/notepads/NotepadPanel'));
const HistorySearchPanel = React.lazy(() => import('@/components/history/HistorySearchPanel'));

// Determine which panel to render based on data attribute
const getPanelType = (): string => {
  const root = document.getElementById('root');
  return root?.dataset.panel || 'chat';
};

// Chat panel (default)
const ChatApp: React.FC = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    error, canRetry, setError, agentMode, agentPlan,
    showWelcome, setShowWelcome,
    activeTourStep, tourProgress, nextTourStep, prevTourStep, skipTour,
    activeHint, setActiveHint,
    showWhatsNew, changelog, changelogVersion, dismissWhatsNew,
    showShortcuts, shortcuts, shortcutsPlatform, setShowShortcuts,
    showTutorial, activeLesson, activeLessonStepIndex, tutorialProgress, tutorialLessons,
    startLesson, advanceTutorialStep, skipLesson, setShowTutorial,
    showShortcutManager, shortcutDefinitions, shortcutProfiles, activeShortcutProfile, shortcutConflicts, shortcutDisabledIds, setShowShortcutManager,
    systemStatus, healthReport, showHealthDashboard, setShowHealthDashboard, showStatusDetail, setShowStatusDetail, resetTokenUsage,
    privacyConfig, privacyMode, dataInventory, privacyAuditLog, showPrivacyDashboard, setShowPrivacyDashboard, showPrivacyNotice, setShowPrivacyNotice, isDataEncrypted, keyFingerprint,
    securityAlerts, codeSecurityStats, sensitiveFileScanResult, transmissionReport, showCodeSecurityPanel, setShowCodeSecurityPanel,
  } = useChatStore();

  // MCP state (Phase 16.2)
  const showMCPPanel = useChatStore((s: any) => s.showMCPPanel);
  const setShowMCPPanel = useChatStore((s: any) => s.setShowMCPPanel);
  const mcpServers = useChatStore((s: any) => s.mcpServers);
  const mcpTools = useChatStore((s: any) => s.mcpTools);
  const mcpConnectServer = useChatStore((s: any) => s.mcpConnectServer);
  const mcpDisconnectServer = useChatStore((s: any) => s.mcpDisconnectServer);
  const mcpAddServer = useChatStore((s: any) => s.mcpAddServer);
  const mcpRemoveServer = useChatStore((s: any) => s.mcpRemoveServer);
  const mcpCallTool = useChatStore((s: any) => s.mcpCallTool);

  // Notepads state (Phase 16.4)
  const showNotepadPanel = useChatStore((s: any) => s.showNotepadPanel);
  const setShowNotepadPanel = useChatStore((s: any) => s.setShowNotepadPanel);
  const notepads = useChatStore((s: any) => s.notepads);
  const notepadCreate = useChatStore((s: any) => s.notepadCreate);
  const notepadDelete = useChatStore((s: any) => s.notepadDelete);
  const notepadPin = useChatStore((s: any) => s.notepadPin);
  const notepadUnpin = useChatStore((s: any) => s.notepadUnpin);
  const notepadAttach = useChatStore((s: any) => s.notepadAttach);
  const notepadDetach = useChatStore((s: any) => s.notepadDetach);
  const notepadOpen = useChatStore((s: any) => s.notepadOpen);
  const notepadUpdate = useChatStore((s: any) => s.notepadUpdate);

  // History Search state (Phase 16.5)
  const showHistorySearchPanel = useChatStore((s: any) => s.showHistorySearchPanel);
  const setShowHistorySearchPanel = useChatStore((s: any) => s.setShowHistorySearchPanel);
  const historyResults = useChatStore((s: any) => s.historyResults);
  const historyConversations = useChatStore((s: any) => s.historyConversations);
  const historyStats = useChatStore((s: any) => s.historyStats);
  const historySearch = useChatStore((s: any) => s.historySearch);
  const historyLoadConversation = useChatStore((s: any) => s.historyLoadConversation);
  const historyDeleteConversation = useChatStore((s: any) => s.historyDeleteConversation);
  const historyExportConversation = useChatStore((s: any) => s.historyExportConversation);

  // Composer state (Phase 16.1)
  const composerSession = useChatStore((s: any) => s.composerSession);
  const composerLayout = useChatStore((s: any) => s.composerLayout);
  const showComposer = useChatStore((s: any) => s.showComposer);
  const closeComposer = useChatStore((s: any) => s.closeComposer);
  const startComposerPlanning = useChatStore((s: any) => s.startComposerPlanning);
  const executeComposerPlan = useChatStore((s: any) => s.executeComposerPlan);
  const sendComposerRefinement = useChatStore((s: any) => s.sendComposerRefinement);
  const acceptComposerFile = useChatStore((s: any) => s.acceptComposerFile);
  const rejectComposerFile = useChatStore((s: any) => s.rejectComposerFile);
  const acceptAllComposer = useChatStore((s: any) => s.acceptAllComposer);
  const rejectAllComposer = useChatStore((s: any) => s.rejectAllComposer);
  const acceptComposerHunk = useChatStore((s: any) => s.acceptComposerHunk);
  const createComposerCheckpoint = useChatStore((s: any) => s.createComposerCheckpoint);
  const restoreComposerCheckpoint = useChatStore((s: any) => s.restoreComposerCheckpoint);
  const pauseComposer = useChatStore((s: any) => s.pauseComposer);
  const resumeComposer = useChatStore((s: any) => s.resumeComposer);
  const setComposerLayout = useChatStore((s: any) => s.setComposerLayout);

  useEffect(() => {
    const unsub = onMessage((msg) => {
      handleExtensionMessage(msg as { type: string; [k: string]: unknown });
      if (msg.type === 'focusInput') { inputRef.current?.focus(); }
    });
    postMessage({ type: 'ready' });
    return unsub;
  }, []);

  // Phase 16.1 — Fullscreen Composer takes over the entire webview
  if (showComposer && composerSession && composerLayout === 'fullscreen') {
    return (
      <React.Suspense fallback={<PanelFallback />}>
        <ComposerView
          session={composerSession}
          layout={composerLayout}
          onStartPlanning={startComposerPlanning}
          onExecute={executeComposerPlan}
          onRefine={sendComposerRefinement}
          onAcceptFile={acceptComposerFile}
          onRejectFile={rejectComposerFile}
          onAcceptAll={acceptAllComposer}
          onRejectAll={rejectAllComposer}
          onAcceptHunk={acceptComposerHunk}
          onCreateCheckpoint={createComposerCheckpoint}
          onRestoreCheckpoint={restoreComposerCheckpoint}
          onPause={pauseComposer}
          onResume={resumeComposer}
          onClose={closeComposer}
          onChangeLayout={setComposerLayout}
        />
      </React.Suspense>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--vscode-sideBar-background)]">
      <Header />
      {error && <ErrorBanner message={error} canRetry={canRetry} onDismiss={() => setError(null)} />}

      {/* Tutorial panel (above messages) */}
      {showTutorial && (
        <TutorialPanel
          lesson={activeLesson}
          lessonStepIndex={activeLessonStepIndex}
          progress={tutorialProgress}
          lessons={tutorialLessons}
          onStartLesson={startLesson}
          onAdvanceStep={advanceTutorialStep}
          onSkipLesson={skipLesson}
          onSkipTutorial={() => { postMessage({ type: 'skipLesson' } as any); setShowTutorial(false); }}
          onClose={() => setShowTutorial(false)}
        />
      )}

      {agentMode !== 'chat' && agentPlan && (
        <React.Suspense fallback={null}>
          <AgentChat />
        </React.Suspense>
      )}

      {/* Phase 16.1 — Composer SPLIT layout: chat on left, composer on right */}
      {showComposer && composerSession && composerLayout === 'split' ? (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 flex flex-col border-r border-[var(--vscode-panel-border)]">
            <MessageList />
            <ChatInput ref={inputRef} />
          </div>
          <div className="w-1/2 overflow-hidden">
            <React.Suspense fallback={<PanelFallback />}>
              <ComposerView
                session={composerSession}
                layout={composerLayout}
                onStartPlanning={startComposerPlanning}
                onExecute={executeComposerPlan}
                onRefine={sendComposerRefinement}
                onAcceptFile={acceptComposerFile}
                onRejectFile={rejectComposerFile}
                onAcceptAll={acceptAllComposer}
                onRejectAll={rejectAllComposer}
                onAcceptHunk={acceptComposerHunk}
                onCreateCheckpoint={createComposerCheckpoint}
                onRestoreCheckpoint={restoreComposerCheckpoint}
                onPause={pauseComposer}
                onResume={resumeComposer}
                onClose={closeComposer}
                onChangeLayout={setComposerLayout}
              />
            </React.Suspense>
          </div>
        </div>
      ) : showComposer && composerSession && composerLayout === 'sidebar' ? (
        <div className="flex-1 overflow-hidden">
          <React.Suspense fallback={<PanelFallback />}>
            <ComposerView
              session={composerSession}
              layout={composerLayout}
              onStartPlanning={startComposerPlanning}
              onExecute={executeComposerPlan}
              onRefine={sendComposerRefinement}
              onAcceptFile={acceptComposerFile}
              onRejectFile={rejectComposerFile}
              onAcceptAll={acceptAllComposer}
              onRejectAll={rejectAllComposer}
              onAcceptHunk={acceptComposerHunk}
              onCreateCheckpoint={createComposerCheckpoint}
              onRestoreCheckpoint={restoreComposerCheckpoint}
              onPause={pauseComposer}
              onResume={resumeComposer}
              onClose={closeComposer}
              onChangeLayout={setComposerLayout}
            />
          </React.Suspense>
        </div>
      ) : (
        <>
          <MessageList />
          <ChatInput ref={inputRef} />
        </>
      )}

      {/* Status Bar */}
      {systemStatus && (
        <StatusBar status={systemStatus} onItemClick={(id) => setShowStatusDetail(id)} />
      )}

      {/* Status Detail panels */}
      {showStatusDetail === 'tokens' && systemStatus && (
        <TokenUsageDetail tokens={systemStatus.tokens} onReset={resetTokenUsage} onClose={() => setShowStatusDetail(null)} />
      )}
      {showStatusDetail === 'connection' && systemStatus && (
        <ConnectionIndicatorDetail connection={systemStatus.connection} onRetry={() => postMessage({ type: 'retryConnection' })} onClose={() => setShowStatusDetail(null)} />
      )}

      {/* Health Dashboard */}
      {showHealthDashboard && (
        <HealthDashboard status={systemStatus} healthReport={healthReport} onClose={() => setShowHealthDashboard(false)} />
      )}

      {/* Onboarding overlays */}
      {showWelcome && (
        <WelcomeScreen
          userName={null}
          onStart={() => setShowWelcome(false)}
          onSkip={() => setShowWelcome(false)}
          onDismiss={() => setShowWelcome(false)}
        />
      )}

      {activeTourStep && tourProgress && (
        <FeatureTourOverlay
          step={activeTourStep}
          stepNumber={tourProgress.current}
          totalSteps={tourProgress.total}
          onNext={nextTourStep}
          onPrev={prevTourStep}
          onSkip={skipTour}
          onComplete={() => { nextTourStep(); }}
        />
      )}

      {activeHint && (
        <ProgressiveHintToast
          hint={activeHint}
          onDismiss={() => setActiveHint(null)}
          onAction={() => setActiveHint(null)}
        />
      )}

      {showWhatsNew && changelog.length > 0 && (
        <WhatsNewDialog
          changelog={changelog}
          version={changelogVersion}
          onDismiss={dismissWhatsNew}
        />
      )}

      {showShortcuts && shortcuts.length > 0 && (
        <ShortcutsPanel
          shortcuts={shortcuts}
          platform={shortcutsPlatform}
          onClose={() => setShowShortcuts(false)}
        />
      )}

      {showShortcutManager && shortcutDefinitions.length > 0 && (
        <ShortcutManagerPanel
          shortcuts={shortcutDefinitions}
          profiles={shortcutProfiles}
          activeProfileId={activeShortcutProfile}
          conflicts={shortcutConflicts}
          disabledIds={shortcutDisabledIds}
          platform={shortcutsPlatform || 'mac'}
          onClose={() => setShowShortcutManager(false)}
        />
      )}

      {/* Privacy Dashboard */}
      {showPrivacyDashboard && (
        <PrivacyDashboard
          config={privacyConfig}
          mode={privacyMode}
          dataInventory={dataInventory}
          auditLog={privacyAuditLog}
          isEncrypted={isDataEncrypted}
          keyFingerprint={keyFingerprint}
          onClose={() => setShowPrivacyDashboard(false)}
        />
      )}

      {/* Privacy Notice (first-run) */}
      {showPrivacyNotice && (
        <PrivacyNotice
          onAccept={() => { postMessage({ type: 'acceptPrivacyNotice' }); setShowPrivacyNotice(false); }}
          onCustomize={() => { setShowPrivacyNotice(false); setShowPrivacyDashboard(true); }}
        />
      )}

      {/* Code Security Panel */}
      {showCodeSecurityPanel && (
        <CodeSecurityPanel
          alerts={securityAlerts}
          stats={codeSecurityStats}
          scanResult={sensitiveFileScanResult}
          transmissionReport={transmissionReport}
          onClose={() => setShowCodeSecurityPanel(false)}
        />
      )}

      {/* MCP Panel (Phase 16.2) */}
      {showMCPPanel && (
        <React.Suspense fallback={null}>
          <MCPPanel
            servers={mcpServers}
            tools={mcpTools}
            onConnect={mcpConnectServer}
            onDisconnect={mcpDisconnectServer}
            onAddServer={mcpAddServer}
            onRemoveServer={mcpRemoveServer}
            onCallTool={mcpCallTool}
            onClose={() => setShowMCPPanel(false)}
          />
        </React.Suspense>
      )}

      {/* Notepads Panel (Phase 16.4) */}
      {showNotepadPanel && (
        <React.Suspense fallback={null}>
          <NotepadPanel
            notepads={notepads}
            onCreateNotepad={notepadCreate}
            onDeleteNotepad={notepadDelete}
            onPinNotepad={notepadPin}
            onUnpinNotepad={notepadUnpin}
            onAttachNotepad={notepadAttach}
            onDetachNotepad={notepadDetach}
            onOpenNotepad={notepadOpen}
            onUpdateNotepad={notepadUpdate}
            onClose={() => setShowNotepadPanel(false)}
          />
        </React.Suspense>
      )}

      {/* History Search Panel (Phase 16.5) */}
      {showHistorySearchPanel && (
        <React.Suspense fallback={null}>
          <HistorySearchPanel
            results={historyResults}
            conversations={historyConversations}
            stats={historyStats}
            onSearch={historySearch}
            onLoadConversation={historyLoadConversation}
            onDeleteConversation={historyDeleteConversation}
            onExportConversation={historyExportConversation}
            onClose={() => setShowHistorySearchPanel(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
};

const PanelFallback = () => (
  <div className="flex items-center justify-center h-screen text-[var(--vscode-descriptionForeground)]">
    Loading...
  </div>
);

const App: React.FC = () => {
  const panelType = getPanelType();

  switch (panelType) {
    case 'search':
      return <React.Suspense fallback={<PanelFallback />}><SearchPanel /></React.Suspense>;
    case 'index':
      return <React.Suspense fallback={<PanelFallback />}><IndexManagementPanel /></React.Suspense>;
    case 'indexing':
      return <React.Suspense fallback={<PanelFallback />}><IndexingProgress /></React.Suspense>;
    case 'chat':
    default:
      return <ThemeProvider><ChatApp /></ThemeProvider>;
  }
};

export default App;
