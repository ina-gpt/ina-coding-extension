import React, { useEffect, useState, useMemo } from 'react';
import { X, Maximize2, Minimize2, Columns, Rows, SplitSquareHorizontal } from 'lucide-react';
import clsx from 'clsx';
import type { ComposerSession } from '@/types';
import { ComposerLayout } from '@/types';
import ComposerFileTree from './ComposerFileTree';
import ComposerDiffView from './ComposerDiffView';
import ComposerConversation from './ComposerConversation';
import ComposerTimeline from './ComposerTimeline';
import ComposerStatusBar from './ComposerStatusBar';

interface ComposerViewProps {
  session: ComposerSession;
  layout: ComposerLayout;
  onStartPlanning: () => void;
  onExecute: () => void;
  onRefine: (instruction: string) => void;
  onAcceptFile: (filePath: string) => void;
  onRejectFile: (filePath: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAcceptHunk: (filePath: string, hunkIndex: number, accepted: boolean) => void;
  onCreateCheckpoint: (description: string) => void;
  onRestoreCheckpoint: (checkpointId: string) => void;
  onPause: () => void;
  onResume: () => void;
  onClose: () => void;
  onChangeLayout: (layout: ComposerLayout) => void;
}

export const ComposerView: React.FC<ComposerViewProps> = ({
  session,
  layout,
  onStartPlanning,
  onExecute,
  onRefine,
  onAcceptFile,
  onRejectFile,
  onAcceptAll,
  onRejectAll,
  onAcceptHunk,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onPause,
  onResume,
  onClose,
  onChangeLayout,
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<'inline' | 'side-by-side'>('side-by-side');

  // Auto-select the first file when changes appear
  useEffect(() => {
    if (!selectedFile && session.fileChanges.length > 0) {
      setSelectedFile(session.fileChanges[0].filePath);
    }
    if (selectedFile && !session.fileChanges.find((f) => f.filePath === selectedFile)) {
      setSelectedFile(session.fileChanges[0]?.filePath ?? null);
    }
  }, [session.fileChanges, selectedFile]);

  const selectedChange = useMemo(
    () => session.fileChanges.find((f) => f.filePath === selectedFile) || null,
    [session.fileChanges, selectedFile]
  );

  const isExecuting =
    session.status === 'executing' || session.status === 'planning' || session.status === 'refining';

  const handleCheckpointPrompt = () => {
    const desc = window.prompt('Checkpoint description:', `Manual @ ${new Date().toLocaleTimeString()}`);
    if (desc) onCreateCheckpoint(desc);
  };

  // Compact sidebar layout (small vertical column)
  if (layout === ComposerLayout.SIDEBAR) {
    return (
      <div className="flex flex-col h-full bg-[var(--vscode-sideBar-background)] text-[var(--vscode-foreground)]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="text-xs font-semibold truncate">⚡ Composer</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChangeLayout(ComposerLayout.FULLSCREEN)}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
              title="Fullscreen"
            >
              <Maximize2 size={12} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>
        <div className="px-3 py-2 text-xs text-[var(--vscode-descriptionForeground)] truncate">
          {session.instruction}
        </div>
        <div className="flex-1 overflow-hidden">
          <ComposerFileTree
            fileChanges={session.fileChanges}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            onAcceptFile={onAcceptFile}
            onRejectFile={onRejectFile}
          />
        </div>
        <ComposerStatusBar
          stats={session.stats}
          status={session.status}
          onAcceptAll={onAcceptAll}
          onRejectAll={onRejectAll}
          onPause={onPause}
          onResume={onResume}
          onCheckpoint={handleCheckpointPrompt}
        />
      </div>
    );
  }

  // FULLSCREEN / SPLIT layout — main experience
  return (
    <div className="flex flex-col h-screen bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--ina-accent-primary,#4f46e5)] to-[var(--ina-accent-secondary,#7c3aed)] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">⚡</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">INA Composer</div>
            <div className="text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
              {session.instruction}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Diff mode toggle */}
          <div className="flex items-center border border-[var(--vscode-panel-border)] rounded overflow-hidden">
            <button
              onClick={() => setDiffMode('inline')}
              className={clsx(
                'p-1.5 text-[10px]',
                diffMode === 'inline'
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-toolbar-hoverBackground)]'
              )}
              title="Inline diff"
            >
              <Rows size={12} />
            </button>
            <button
              onClick={() => setDiffMode('side-by-side')}
              className={clsx(
                'p-1.5 text-[10px]',
                diffMode === 'side-by-side'
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-toolbar-hoverBackground)]'
              )}
              title="Side-by-side diff"
            >
              <Columns size={12} />
            </button>
          </div>

          {/* Layout switcher */}
          <button
            onClick={() => onChangeLayout(ComposerLayout.SPLIT)}
            className={clsx(
              'p-1.5 rounded',
              layout === ComposerLayout.SPLIT
                ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                : 'hover:bg-[var(--vscode-toolbar-hoverBackground)]'
            )}
            title="Split layout"
          >
            <SplitSquareHorizontal size={14} />
          </button>
          <button
            onClick={() => onChangeLayout(ComposerLayout.SIDEBAR)}
            className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            title="Minimize to sidebar"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            title="Close composer"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Quick actions row when planning/reviewing */}
      {(session.status === 'planning' || session.status === 'reviewing') && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
          {!session.plan && (
            <button
              onClick={onStartPlanning}
              className="px-3 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
            >
              Generate plan
            </button>
          )}
          {session.plan && session.status === 'reviewing' && session.fileChanges.length === 0 && (
            <button
              onClick={onExecute}
              className="px-3 py-1 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
            >
              Execute plan
            </button>
          )}
          <span className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            {session.plan
              ? `${session.plan.plan.steps.length} steps planned`
              : 'Awaiting plan generation'}
          </span>
        </div>
      )}

      {/* Main split */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT — Files (40%) */}
        <div className="w-[40%] flex flex-col border-r border-[var(--vscode-panel-border)]">
          <div className="border-b border-[var(--vscode-panel-border)] flex-shrink-0 max-h-[40%] overflow-hidden flex flex-col">
            <div className="px-3 py-2 text-[11px] font-semibold text-[var(--vscode-foreground)] flex items-center justify-between border-b border-[var(--vscode-panel-border)]">
              <span>Changed Files ({session.fileChanges.length})</span>
            </div>
            <ComposerFileTree
              fileChanges={session.fileChanges}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              onAcceptFile={onAcceptFile}
              onRejectFile={onRejectFile}
            />
          </div>
          <div className="flex-1 overflow-hidden">
            {selectedChange ? (
              <ComposerDiffView
                fileChange={selectedChange}
                mode={diffMode}
                onAcceptHunk={(idx) => onAcceptHunk(selectedChange.filePath, idx, true)}
                onRejectHunk={(idx) => onAcceptHunk(selectedChange.filePath, idx, false)}
                onAcceptFile={() => onAcceptFile(selectedChange.filePath)}
                onRejectFile={() => onRejectFile(selectedChange.filePath)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-[var(--vscode-descriptionForeground)]">
                Select a file to view diff
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Conversation (60%) */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-2 text-[11px] font-semibold border-b border-[var(--vscode-panel-border)]">
            Conversation
          </div>
          <ComposerConversation
            messages={session.conversation}
            onSendRefinement={onRefine}
            isExecuting={isExecuting}
          />
        </div>
      </div>

      {/* Timeline */}
      <ComposerTimeline
        checkpoints={session.checkpoints}
        currentIndex={session.currentCheckpointIndex}
        onRestore={onRestoreCheckpoint}
        onCreate={handleCheckpointPrompt}
      />

      {/* Status bar */}
      <ComposerStatusBar
        stats={session.stats}
        status={session.status}
        onAcceptAll={onAcceptAll}
        onRejectAll={onRejectAll}
        onPause={onPause}
        onResume={onResume}
        onCheckpoint={handleCheckpointPrompt}
      />
    </div>
  );
};

export default ComposerView;
