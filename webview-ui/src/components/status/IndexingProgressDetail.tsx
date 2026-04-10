import React from 'react';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface IndexingProgressDetailProps {
  indexing: any;
  onClose: () => void;
}

export function IndexingProgressDetail({ indexing, onClose }: IndexingProgressDetailProps) {
  if (!indexing || indexing.state === 'idle') return null;
  const isActive = ['scanning', 'indexing', 'embedding'].includes(indexing.state);

  return (
    <div className="p-3 space-y-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]/50 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Indexing</span>
        <button onClick={onClose} className="text-[var(--vscode-descriptionForeground)] hover:underline text-[10px]">Close</button>
      </div>
      <div className={clsx('capitalize font-medium', indexing.state === 'error' ? 'text-[var(--ina-status-error,#ef4444)]' : indexing.state === 'complete' ? 'text-[var(--ina-status-success,#22c55e)]' : 'text-[var(--ina-accent-primary,#3b82f6)]')}>
        {indexing.state}
      </div>
      {isActive && indexing.progress !== null && (
        <div className="h-2 rounded-full bg-[var(--vscode-editor-background)]">
          <div className="h-full rounded-full bg-[var(--ina-accent-primary,#3b82f6)] transition-all" style={{ width: `${indexing.progress}%` }} />
        </div>
      )}
      {indexing.filesTotal && <div className="text-[var(--vscode-descriptionForeground)]">Files: {indexing.filesProcessed || 0}/{indexing.filesTotal}</div>}
      {indexing.currentFile && <div className="text-[var(--vscode-descriptionForeground)] truncate">Current: {indexing.currentFile}</div>}
      {indexing.estimatedRemainingMs && <div className="text-[var(--vscode-descriptionForeground)]">~{Math.ceil(indexing.estimatedRemainingMs / 60000)}m remaining</div>}
      {indexing.state === 'error' && indexing.errorMessage && <div className="text-[var(--ina-status-error,#ef4444)]">{indexing.errorMessage}</div>}
      <div className="flex gap-2">
        {isActive && <button onClick={() => postMessage({ type: 'pauseIndexing' } as any)} className="text-[10px] text-[var(--ina-accent-primary,#3b82f6)] hover:underline">Pause</button>}
        {indexing.state === 'paused' && <button onClick={() => postMessage({ type: 'resumeIndexing' } as any)} className="text-[10px] text-[var(--ina-accent-primary,#3b82f6)] hover:underline">Resume</button>}
        {(indexing.state === 'error' || indexing.state === 'complete') && <button onClick={() => postMessage({ type: 'indexWorkspace' } as any)} className="text-[10px] text-[var(--ina-accent-primary,#3b82f6)] hover:underline">Reindex</button>}
      </div>
    </div>
  );
}
