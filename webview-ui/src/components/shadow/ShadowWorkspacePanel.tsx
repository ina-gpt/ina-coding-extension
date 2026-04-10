import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  Check,
  X,
  Eye,
  Edit3,
  Clock,
  Save,
  Trash2,
  ChevronDown,
  ChevronRight,
  FileCode,
  FolderOpen,
  GitBranch,
  AlertTriangle,
  Plus,
  Minus,
} from 'lucide-react';
import clsx from 'clsx';
import { postMessage } from '@/utils/vscode';
import { useChatStore } from '@/store/chatStore';
import ShadowFileDiff from './ShadowFileDiff';
import type { FileDiffData } from './ShadowFileDiff';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FileStatus = 'pending' | 'accepted' | 'rejected' | 'edited';

interface ShadowDiffFile {
  filePath: string;
  status: FileStatus;
  linesAdded: number;
  linesRemoved: number;
  diff: FileDiffData | null;
}

interface ShadowCheckpoint {
  id: string;
  description: string;
  createdAt: string;
  fileCount: number;
}

interface ShadowSession {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'expired';
  expiresAt?: string;
  checkpoints: ShadowCheckpoint[];
}

interface ShadowStats {
  totalFiles: number;
  totalAdded: number;
  totalRemoved: number;
}

/* ------------------------------------------------------------------ */
/*  Status icon helper                                                 */
/* ------------------------------------------------------------------ */

const statusConfig: Record<
  FileStatus,
  { icon: React.ElementType; color: string; label: string }
> = {
  pending: { icon: Clock, color: 'text-orange-400', label: 'Pending' },
  accepted: { icon: Check, color: 'text-green-400', label: 'Accepted' },
  rejected: { icon: X, color: 'text-red-400', label: 'Rejected' },
  edited: { icon: Edit3, color: 'text-blue-400', label: 'Edited' },
};

const StatusIcon: React.FC<{ status: FileStatus }> = memo(({ status }) => {
  const cfg = statusConfig[status];
  const Icon = cfg.icon;
  return (
    <span title={cfg.label} className={cfg.color}>
      <Icon size={14} />
    </span>
  );
});
StatusIcon.displayName = 'StatusIcon';

/* ------------------------------------------------------------------ */
/*  Status badge for session                                           */
/* ------------------------------------------------------------------ */

const sessionBadgeColor: Record<ShadowSession['status'], string> = {
  active:
    'bg-green-900/30 text-green-400 border-green-700/50',
  completed:
    'bg-blue-900/30 text-blue-400 border-blue-700/50',
  expired:
    'bg-red-900/30 text-red-400 border-red-700/50',
};

/* ------------------------------------------------------------------ */
/*  File row                                                           */
/* ------------------------------------------------------------------ */

interface FileRowProps {
  file: ShadowDiffFile;
  sessionId: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const FileRow: React.FC<FileRowProps> = memo(
  ({ file, sessionId, isExpanded, onToggle }) => {
    const handlePreview = (e: React.MouseEvent) => {
      e.stopPropagation();
      postMessage({
        type: 'previewShadowFile',
        sessionId,
        filePath: file.filePath,
      });
    };

    const handleAccept = (e: React.MouseEvent) => {
      e.stopPropagation();
      postMessage({
        type: 'acceptShadowFile',
        sessionId,
        filePath: file.filePath,
      });
    };

    const handleReject = (e: React.MouseEvent) => {
      e.stopPropagation();
      postMessage({
        type: 'rejectShadowFile',
        sessionId,
        filePath: file.filePath,
      });
    };

    const handleAcceptFromDiff = useCallback(() => {
      postMessage({
        type: 'acceptShadowFile',
        sessionId,
        filePath: file.filePath,
      });
    }, [sessionId, file.filePath]);

    const handleRejectFromDiff = useCallback(() => {
      postMessage({
        type: 'rejectShadowFile',
        sessionId,
        filePath: file.filePath,
      });
    }, [sessionId, file.filePath]);

    return (
      <div className="border-b border-[var(--vscode-panel-border)] last:border-b-0">
        {/* Row header */}
        <button
          onClick={onToggle}
          className={clsx(
            'flex items-center gap-2 w-full px-3 py-2 text-left',
            'hover:bg-[var(--vscode-list-hoverBackground)]',
            'transition-colors group',
          )}
        >
          {/* Expand chevron */}
          {isExpanded ? (
            <ChevronDown size={14} className="text-[var(--vscode-descriptionForeground)] flex-shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-[var(--vscode-descriptionForeground)] flex-shrink-0" />
          )}

          {/* Status icon */}
          <StatusIcon status={file.status} />

          {/* File path */}
          <span className="flex-1 text-xs font-mono truncate text-[var(--vscode-editor-foreground)]">
            {file.filePath}
          </span>

          {/* Stats */}
          <span className="flex items-center gap-2 text-xs flex-shrink-0 mr-2">
            <span className="flex items-center gap-0.5 text-green-400">
              <Plus size={11} />
              {file.linesAdded}
            </span>
            <span className="flex items-center gap-0.5 text-red-400">
              <Minus size={11} />
              {file.linesRemoved}
            </span>
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <span
              role="button"
              tabIndex={0}
              onClick={handlePreview}
              onKeyDown={(e) => e.key === 'Enter' && handlePreview(e as any)}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]"
              title="Preview"
            >
              <Eye size={14} />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={handleAccept}
              onKeyDown={(e) => e.key === 'Enter' && handleAccept(e as any)}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-green-400"
              title="Accept"
            >
              <Check size={14} />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={handleReject}
              onKeyDown={(e) => e.key === 'Enter' && handleReject(e as any)}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-red-400"
              title="Reject"
            >
              <X size={14} />
            </span>
          </div>
        </button>

        {/* Inline diff */}
        {isExpanded && file.diff && (
          <div className="px-3 pb-3">
            <ShadowFileDiff
              diff={file.diff}
              filePath={file.filePath}
              onAccept={handleAcceptFromDiff}
              onReject={handleRejectFromDiff}
            />
          </div>
        )}
      </div>
    );
  },
);
FileRow.displayName = 'FileRow';

/* ------------------------------------------------------------------ */
/*  Checkpoint timeline                                                */
/* ------------------------------------------------------------------ */

interface CheckpointTimelineProps {
  checkpoints: ShadowCheckpoint[];
  sessionId: string;
}

const CheckpointTimeline: React.FC<CheckpointTimelineProps> = memo(
  ({ checkpoints, sessionId }) => {
    const handleRestore = (checkpointId: string) => {
      postMessage({
        type: 'restoreShadowCheckpoint',
        sessionId,
        checkpointId,
      });
    };

    if (checkpoints.length === 0) {
      return (
        <div className="px-4 py-3 text-xs text-[var(--vscode-descriptionForeground)]">
          No checkpoints created yet.
        </div>
      );
    }

    return (
      <div className="px-4 py-2 space-y-2">
        {checkpoints.map((cp, idx) => (
          <div
            key={cp.id}
            className={clsx(
              'flex items-start gap-3 relative',
              idx < checkpoints.length - 1 && 'pb-2',
            )}
          >
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center flex-shrink-0 pt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-[var(--vscode-button-background)] border-2 border-[var(--vscode-panel-border)]" />
              {idx < checkpoints.length - 1 && (
                <div className="w-px flex-1 bg-[var(--vscode-panel-border)] mt-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--vscode-editor-foreground)] truncate">
                {cp.description}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--vscode-descriptionForeground)]">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {new Date(cp.createdAt).toLocaleTimeString()}
                </span>
                <span className="flex items-center gap-1">
                  <FileCode size={10} />
                  {cp.fileCount} file{cp.fileCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Restore button */}
            <button
              onClick={() => handleRestore(cp.id)}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-[10px] rounded flex-shrink-0',
                'bg-[var(--vscode-input-background)]',
                'hover:bg-[var(--vscode-list-hoverBackground)]',
                'border border-[var(--vscode-input-border)]',
                'transition-colors',
              )}
            >
              <GitBranch size={10} />
              Restore
            </button>
          </div>
        ))}
      </div>
    );
  },
);
CheckpointTimeline.displayName = 'CheckpointTimeline';

/* ------------------------------------------------------------------ */
/*  Expiry warning                                                     */
/* ------------------------------------------------------------------ */

const ExpiryWarning: React.FC<{ expiresAt: string }> = memo(
  ({ expiresAt }) => {
    const minutesLeft = useMemo(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      return Math.max(0, Math.floor(diff / 60_000));
    }, [expiresAt]);

    if (minutesLeft >= 5) return null;

    return (
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 text-xs',
          'bg-yellow-900/20 text-yellow-300',
          'border-b border-yellow-700/40',
        )}
      >
        <AlertTriangle size={14} className="flex-shrink-0" />
        <span>
          Session expires in{' '}
          <strong>
            {minutesLeft === 0 ? 'less than a minute' : `${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`}
          </strong>
          . Accept or reject changes before expiry.
        </span>
      </div>
    );
  },
);
ExpiryWarning.displayName = 'ExpiryWarning';

/* ------------------------------------------------------------------ */
/*  Main panel                                                         */
/* ------------------------------------------------------------------ */

export const ShadowWorkspacePanel: React.FC = () => {
  const shadowSession = useChatStore(
    (s) => (s as any).shadowSession as ShadowSession | null,
  );
  const shadowDiffs = useChatStore(
    (s) => (s as any).shadowDiffs as ShadowDiffFile[] | null,
  );
  const shadowStats = useChatStore(
    (s) => (s as any).shadowStats as ShadowStats | null,
  );
  const showShadowPanel = useChatStore(
    (s) => (s as any).showShadowPanel as boolean | undefined,
  );

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [checkpointDesc, setCheckpointDesc] = useState('');

  /* ---- Early returns ---- */

  if (!showShadowPanel) return null;

  /* ---- Empty state ---- */

  if (!shadowSession || !shadowDiffs || shadowDiffs.length === 0) {
    return (
      <div
        className={clsx(
          'flex flex-col items-center justify-center py-12 px-6',
          'bg-[var(--vscode-editor-background)]',
          'border border-[var(--vscode-panel-border)] rounded-lg',
        )}
      >
        <FolderOpen
          size={40}
          className="text-[var(--vscode-descriptionForeground)] mb-3"
        />
        <p className="text-sm text-[var(--vscode-editor-foreground)] font-medium mb-1">
          No pending changes
        </p>
        <p className="text-xs text-[var(--vscode-descriptionForeground)] text-center max-w-xs">
          AI changes will appear here for review before they are committed to
          your workspace.
        </p>
      </div>
    );
  }

  const session = shadowSession;
  const diffs = shadowDiffs;
  const stats = shadowStats ?? {
    totalFiles: diffs.length,
    totalAdded: diffs.reduce((s, f) => s + f.linesAdded, 0),
    totalRemoved: diffs.reduce((s, f) => s + f.linesRemoved, 0),
  };

  /* ---- Handlers ---- */

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const handleAcceptAll = () => {
    postMessage({ type: 'acceptAllShadow', sessionId: session.id });
  };

  const handleRejectAll = () => {
    postMessage({ type: 'rejectAllShadow', sessionId: session.id });
  };

  const handleCheckpoint = () => {
    const desc = checkpointDesc.trim() || `Checkpoint at ${new Date().toLocaleTimeString()}`;
    postMessage({
      type: 'createShadowCheckpoint',
      sessionId: session.id,
      description: desc,
    });
    setCheckpointDesc('');
  };

  /* ---- Render ---- */

  return (
    <div
      className={clsx(
        'flex flex-col',
        'bg-[var(--vscode-editor-background)]',
        'border border-[var(--vscode-panel-border)] rounded-lg',
        'overflow-hidden',
      )}
    >
      {/* Expiry warning */}
      {session.expiresAt && <ExpiryWarning expiresAt={session.expiresAt} />}

      {/* ===== HEADER ===== */}
      <div
        className={clsx(
          'flex items-center justify-between px-4 py-3',
          'bg-[var(--vscode-sideBar-background)]',
          'border-b border-[var(--vscode-panel-border)]',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <GitBranch
            size={16}
            className="text-[var(--vscode-descriptionForeground)] flex-shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium truncate text-[var(--vscode-editor-foreground)]">
                {session.name}
              </h3>
              <span
                className={clsx(
                  'px-1.5 py-0.5 text-[10px] rounded border font-medium',
                  sessionBadgeColor[session.status],
                )}
              >
                {session.status}
              </span>
            </div>
            <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-0.5">
              {stats.totalFiles} file{stats.totalFiles !== 1 ? 's' : ''},
              {' '}
              <span className="text-green-400">+{stats.totalAdded}</span>
              {' '}
              <span className="text-red-400">-{stats.totalRemoved}</span>
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleAcceptAll}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded',
              'bg-[var(--ina-status-success,#16a34a)]',
              'text-[var(--ina-accent-primary-text,#fff)]',
              'hover:opacity-90 transition-colors',
            )}
          >
            <Check size={13} />
            Accept All
          </button>
          <button
            onClick={handleRejectAll}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded',
              'bg-[var(--vscode-input-background)]',
              'hover:bg-[var(--vscode-list-hoverBackground)]',
              'border border-[var(--vscode-input-border)]',
              'transition-colors',
            )}
          >
            <Trash2 size={13} />
            Reject All
          </button>
          <button
            onClick={() => setShowCheckpoints((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded',
              'bg-[var(--vscode-input-background)]',
              'hover:bg-[var(--vscode-list-hoverBackground)]',
              'border border-[var(--vscode-input-border)]',
              'transition-colors',
            )}
          >
            <Save size={13} />
            Checkpoint
          </button>
        </div>
      </div>

      {/* ===== CHECKPOINT SECTION (collapsible) ===== */}
      {showCheckpoints && (
        <div className="border-b border-[var(--vscode-panel-border)]">
          <button
            onClick={() => setShowCheckpoints((v) => !v)}
            className={clsx(
              'flex items-center gap-2 w-full px-4 py-2 text-xs font-medium',
              'bg-[var(--vscode-sideBar-background)]',
              'hover:bg-[var(--vscode-list-hoverBackground)]',
              'text-[var(--vscode-editor-foreground)]',
              'border-b border-[var(--vscode-panel-border)]',
            )}
          >
            <ChevronDown size={14} />
            <Clock size={14} className="text-[var(--vscode-descriptionForeground)]" />
            Checkpoints
          </button>

          <CheckpointTimeline
            checkpoints={session.checkpoints ?? []}
            sessionId={session.id}
          />

          {/* New checkpoint input */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--vscode-panel-border)]">
            <input
              type="text"
              value={checkpointDesc}
              onChange={(e) => setCheckpointDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCheckpoint()}
              placeholder="Checkpoint description..."
              className={clsx(
                'flex-1 px-2 py-1.5 text-xs rounded',
                'bg-[var(--vscode-input-background)]',
                'text-[var(--vscode-input-foreground)]',
                'border border-[var(--vscode-input-border)]',
                'placeholder:text-[var(--vscode-input-placeholderForeground)]',
                'focus:outline-none focus:border-[var(--vscode-focusBorder)]',
              )}
            />
            <button
              onClick={handleCheckpoint}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 text-xs rounded',
                'bg-[var(--vscode-button-background)]',
                'text-[var(--vscode-button-foreground)]',
                'hover:bg-[var(--vscode-button-hoverBackground)]',
                'transition-colors',
              )}
            >
              <Save size={12} />
              Create
            </button>
          </div>
        </div>
      )}

      {/* ===== FILE LIST ===== */}
      <div className="flex-1 overflow-auto">
        {diffs.map((file) => (
          <FileRow
            key={file.filePath}
            file={file}
            sessionId={session.id}
            isExpanded={expandedFiles.has(file.filePath)}
            onToggle={() => toggleFile(file.filePath)}
          />
        ))}
      </div>
    </div>
  );
};

ShadowWorkspacePanel.displayName = 'ShadowWorkspacePanel';
export default ShadowWorkspacePanel;
