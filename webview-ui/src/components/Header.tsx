import React, { useState } from 'react';
import { Plus, History, Settings, MoreVertical, Trash2, Download, HelpCircle, Lock, ShieldCheck, Bug, GitCommit, Layers, Zap, X, Wrench, StickyNote, Search } from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import { HistoryPanel } from './HistoryPanel';
import { AgentToggle } from './AgentToggle';
import { ConnectionIndicator } from './offline/ConnectionIndicator';
import { CircuitBreakerStatus } from './errors/CircuitBreakerStatus';
import { OnboardingProgress } from './onboarding/OnboardingProgress';
import { PrivacyBadge } from './privacy/PrivacyBadge';
import clsx from 'clsx';

export const Header: React.FC = () => {
  const { newChat, messages, isStreaming, clearMessages, conversations, agentMode, agentSession, toggleAgentMode, memoryStats, connectionState, connectionHealth, circuitBreakers, onboardingProgress, setShowWelcome, startTour, requestShortcuts, setShowTutorial, privacyMode, isDataEncrypted, setShowPrivacyDashboard, securityAlerts, setShowCodeSecurityPanel, shadowSession, setShowShadowPanel } = useChatStore();
  // Composer (Phase 16.1)
  const showComposer = useChatStore((s: any) => s.showComposer);
  const composerLayout = useChatStore((s: any) => s.composerLayout);
  const openComposer = useChatStore((s: any) => s.openComposer);
  const closeComposer = useChatStore((s: any) => s.closeComposer);
  const setComposerLayout = useChatStore((s: any) => s.setComposerLayout);
  // MCP (Phase 16.2)
  const mcpServers = useChatStore((s: any) => s.mcpServers);
  const setShowMCPPanel = useChatStore((s: any) => s.setShowMCPPanel);
  const mcpListServers = useChatStore((s: any) => s.mcpListServers);
  // Notepads (Phase 16.4)
  const notepads = useChatStore((s: any) => s.notepads);
  const setShowNotepadPanel = useChatStore((s: any) => s.setShowNotepadPanel);
  const notepadList = useChatStore((s: any) => s.notepadList);
  // History Search (Phase 16.5)
  const setShowHistorySearchPanel = useChatStore((s: any) => s.setShowHistorySearchPanel);
  const [showMenu, setShowMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);

  const handleOpenComposer = () => {
    const instr = window.prompt('What would you like Composer to build?', '');
    if (instr && instr.trim()) {
      openComposer(instr.trim());
    }
  };

  const handleNewChat = () => {
    if (isStreaming) return;
    newChat();
  };

  const handleClearChat = () => {
    if (isStreaming) return;
    clearMessages();
    setShowMenu(false);
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    setShowMenu(false);
  };

  const handleExportChat = () => {
    if (messages.length === 0) return;
    postMessage({ type: 'exportCurrentChat' });
    setShowMenu(false);
  };

  const handleOpenSettings = () => {
    postMessage({ type: 'getConfig' });
    setShowMenu(false);
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
        {/* Title */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--ina-accent-primary,#4f46e5)] to-[var(--ina-accent-secondary,#7c3aed)] flex items-center justify-center">
            <span className="text-[var(--ina-accent-primary-text,#fff)] text-xs font-bold">I</span>
          </div>
          <span className="font-semibold text-sm">INA Coding</span>
          {messages.length > 0 && (
            <span className="text-xs text-[var(--vscode-descriptionForeground)] ml-1">
              ({messages.length})
            </span>
          )}
        </div>

        {/* Agent Toggle */}
        <AgentToggle
          mode={agentMode}
          onToggle={toggleAgentMode}
          isSessionActive={agentSession !== null && !['completed', 'failed', 'cancelled'].includes(agentSession.status)}
        />

        {/* Composer (Phase 16.1) */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={showComposer ? closeComposer : handleOpenComposer}
            className={clsx(
              'px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors',
              showComposer
                ? 'bg-[var(--ina-accent-primary,#4f46e5)] text-white'
                : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-foreground)]'
            )}
            title={showComposer ? 'Close Composer' : 'Open Composer (Cmd+Shift+Enter)'}
          >
            <Zap size={12} />
            <span>Composer</span>
            {showComposer && <X size={11} />}
          </button>
          {showComposer && (
            <div className="relative">
              <button
                onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                className="px-1.5 py-1 rounded text-[10px] hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                title="Composer layout"
              >
                ▼
              </button>
              {showLayoutMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowLayoutMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-32 py-1 bg-[var(--vscode-menu-background,var(--vscode-editor-background))] border border-[var(--vscode-panel-border)] rounded-md shadow-lg z-20">
                    {(['fullscreen', 'split', 'sidebar'] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => { setComposerLayout(l); setShowLayoutMenu(false); }}
                        className={clsx(
                          'w-full flex items-center px-3 py-1 text-xs text-left hover:bg-[var(--vscode-list-hoverBackground)] capitalize',
                          composerLayout === l && 'text-[var(--ina-accent-primary,#4f46e5)] font-medium'
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Connection Status */}
        <ConnectionIndicator
          state={connectionState}
          latencyMs={connectionHealth?.targets?.api?.latencyMs}
          onClick={() => postMessage({ type: 'requestConnectivity' } as any)}
        />
        <CircuitBreakerStatus
          breakers={circuitBreakers}
          onClick={() => postMessage({ type: 'openErrorDashboard' } as any)}
        />

        {/* Privacy Badge */}
        <PrivacyBadge
          mode={privacyMode}
          telemetryEnabled={false}
          encrypted={isDataEncrypted}
          onClick={() => { postMessage({ type: 'requestPrivacyConfig' }); setShowPrivacyDashboard(true); }}
        />

        {/* Access Control */}
        <button
          onClick={() => useChatStore.getState().setShowAccessPanel(true)}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="Access Control"
        >
          <Lock size={14} className="text-[var(--vscode-descriptionForeground)]" />
        </button>

        {/* Code Security */}
        <button
          onClick={() => { postMessage({ type: 'getCodeSecurityStats' } as any); setShowCodeSecurityPanel(true); }}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors relative"
          title="Code Security"
        >
          <ShieldCheck size={14} className="text-[var(--ina-status-success,#22c55e)]" />
          {securityAlerts.filter((a: any) => !a.dismissed && (a.severity === 'critical' || a.severity === 'high')).length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--ina-status-error,#ef4444)]" />
          )}
        </button>

        {/* Shadow Workspace */}
        {shadowSession && (
          <button
            onClick={() => setShowShadowPanel(true)}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors relative"
            title="Shadow Workspace — pending changes"
          >
            <Layers size={14} className="text-orange-400" />
            {(shadowSession as any).files?.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] bg-orange-500 text-white rounded-full flex items-center justify-center animate-pulse">
                {(shadowSession as any).files.length}
              </span>
            )}
          </button>
        )}

        {/* Bug Finder */}
        <button
          onClick={() => { postMessage({ type: 'scanCurrentFile' } as any); useChatStore.getState().setShowBugFinderPanel(true); }}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="Bug Finder"
        >
          <Bug size={14} className="text-[var(--vscode-descriptionForeground)]" />
        </button>

        {/* AI Commit Message */}
        <button
          onClick={() => postMessage({ type: 'generateCommitMessage' } as any)}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="Generate Commit Message"
        >
          <GitCommit size={14} className="text-[var(--vscode-descriptionForeground)]" />
        </button>

        {/* MCP Tools (Phase 16.2) */}
        <button
          onClick={() => { mcpListServers(); setShowMCPPanel(true); }}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors relative"
          title="MCP Servers & Tools"
        >
          <Wrench size={14} className="text-[var(--vscode-descriptionForeground)]" />
          {Array.isArray(mcpServers) && mcpServers.filter((s: any) => s.status === 'connected').length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-[9px] bg-amber-500 text-white rounded-full flex items-center justify-center">
              {mcpServers.filter((s: any) => s.status === 'connected').length}
            </span>
          )}
        </button>

        {/* Notepads (Phase 16.4) */}
        <button
          onClick={() => { notepadList(); setShowNotepadPanel(true); }}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors relative"
          title="Notepads"
        >
          <StickyNote size={14} className="text-[var(--vscode-descriptionForeground)]" />
          {Array.isArray(notepads) && notepads.filter((n: any) => n.isPinned).length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-[9px] bg-yellow-500 text-white rounded-full flex items-center justify-center">
              {notepads.filter((n: any) => n.isPinned).length}
            </span>
          )}
        </button>

        {/* History Search (Phase 16.5) */}
        <button
          onClick={() => setShowHistorySearchPanel(true)}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="Search Chat History (Cmd+Shift+H)"
        >
          <Search size={14} className="text-[var(--vscode-descriptionForeground)]" />
        </button>

        {/* Onboarding Progress */}
        {onboardingProgress && onboardingProgress.percentage < 100 && (
          <OnboardingProgress progress={onboardingProgress} onResume={() => setShowWelcome(true)} />
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Help menu */}
          <div className="relative">
            <button onClick={() => setShowHelpMenu(!showHelpMenu)}
              className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
              title="Help & Tours">
              <HelpCircle size={16} />
            </button>
            {showHelpMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowHelpMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-[var(--vscode-menu-background,var(--vscode-editor-background))] border border-[var(--vscode-panel-border)] rounded-md shadow-lg z-20">
                  <button onClick={() => { startTour('essential-features'); setShowHelpMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--vscode-list-hoverBackground)]">
                    🧭 Feature Tour
                  </button>
                  <button onClick={() => { postMessage({ type: 'startTutorial' } as any); setShowTutorial(true); setShowHelpMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--vscode-list-hoverBackground)]">
                    🎓 Tutorial
                  </button>
                  <button onClick={() => { requestShortcuts(); setShowHelpMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--vscode-list-hoverBackground)]">
                    ⌨️ Shortcuts
                  </button>
                  <button onClick={() => { postMessage({ type: 'requestWhatsNew' } as any); setShowHelpMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--vscode-list-hoverBackground)]">
                    🆕 What's New
                  </button>
                </div>
              </>
            )}
          </div>

          {memoryStats && memoryStats.total > 0 && (
            <button
              onClick={() => postMessage({ type: 'openMemoryPanel' } as any)}
              className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors relative"
              title={`${memoryStats.total} memories`}
            >
              <span className="text-sm">🧠</span>
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded-full flex items-center justify-center">
                {memoryStats.total > 99 ? '99+' : memoryStats.total}
              </span>
            </button>
          )}

          <button
            onClick={handleNewChat}
            disabled={isStreaming}
            className={clsx(
              'p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors',
              isStreaming && 'opacity-50 cursor-not-allowed'
            )}
            title="New chat (Ctrl+N)"
          >
            <Plus size={18} />
          </button>

          <button
            onClick={handleOpenHistory}
            className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors relative"
            title="Chat history (Ctrl+H)"
          >
            <History size={18} />
            {conversations.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded-full flex items-center justify-center">
                {conversations.length > 99 ? '99+' : conversations.length}
              </span>
            )}
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
              title="More options"
            >
              <MoreVertical size={18} />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 py-1 bg-[var(--vscode-menu-background,var(--vscode-editor-background))] border border-[var(--vscode-panel-border)] rounded-md shadow-lg z-20">
                  <button
                    onClick={handleExportChat}
                    disabled={messages.length === 0}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--vscode-list-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={16} />
                    Export chat
                  </button>
                  <button
                    onClick={handleClearChat}
                    disabled={messages.length === 0 || isStreaming}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--vscode-list-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} />
                    Clear chat
                  </button>
                  <div className="my-1 border-t border-[var(--vscode-panel-border)]" />
                  <button
                    onClick={handleOpenSettings}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--vscode-list-hoverBackground)]"
                  >
                    <Settings size={16} />
                    Settings
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* History Panel */}
      <HistoryPanel
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </>
  );
};
