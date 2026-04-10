import React from 'react';

interface FileChange {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  oldPath: string | null;
}

interface GitChangesViewProps {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onOpenDiff: (path: string) => void;
  onStageAll: () => void;
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  A: { icon: '+', color: 'var(--vscode-gitDecoration-addedResourceForeground, #73c991)' },
  M: { icon: '~', color: 'var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d)' },
  D: { icon: '-', color: 'var(--vscode-gitDecoration-deletedResourceForeground, #c74e39)' },
  R: { icon: '→', color: 'var(--vscode-gitDecoration-renamedResourceForeground, #73c991)' },
  C: { icon: '⊕', color: 'var(--vscode-gitDecoration-addedResourceForeground, #73c991)' },
  '?': { icon: '?', color: 'var(--vscode-gitDecoration-untrackedResourceForeground, #73c991)' },
};

const FileItem: React.FC<{ file: FileChange | string; isUntracked?: boolean; action?: string; onAction?: () => void; onOpenDiff?: () => void }> = ({ file, isUntracked, action, onAction, onOpenDiff }) => {
  const path = typeof file === 'string' ? file : file.path;
  const status = typeof file === 'string' ? '?' : file.status;
  const info = STATUS_ICONS[status] || { icon: status, color: 'inherit' };
  const fileName = path.split('/').pop() || path;
  const dirPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

  return (
    <div className="git-file-item" onClick={onOpenDiff}>
      <span className="git-file-status" style={{ color: info.color }}>{info.icon}</span>
      <span className="git-file-name">{fileName}</span>
      {dirPath && <span className="git-file-dir">{dirPath}/</span>}
      {action && onAction && (
        <button className="git-file-action" onClick={(e) => { e.stopPropagation(); onAction(); }} title={action}>
          {action === 'Stage' ? '+' : '−'}
        </button>
      )}
    </div>
  );
};

export const GitChangesView: React.FC<GitChangesViewProps> = ({ staged, unstaged, untracked, onStage, onUnstage, onOpenDiff, onStageAll }) => {
  const totalChanges = staged.length + unstaged.length + untracked.length;

  if (totalChanges === 0) {
    return <div className="git-empty">Working tree clean</div>;
  }

  return (
    <div className="git-changes">
      {(unstaged.length > 0 || untracked.length > 0) && (
        <div className="git-changes-header">
          <span>Changes ({unstaged.length + untracked.length})</span>
          <button className="git-btn git-btn-sm" onClick={onStageAll}>Stage All</button>
        </div>
      )}

      {staged.length > 0 && (
        <div className="git-change-group">
          <div className="git-group-title git-staged-title">Staged ({staged.length})</div>
          {staged.map(f => (
            <FileItem key={f.path} file={f} action="Unstage" onAction={() => onUnstage(f.path)} onOpenDiff={() => onOpenDiff(f.path)} />
          ))}
        </div>
      )}

      {unstaged.length > 0 && (
        <div className="git-change-group">
          <div className="git-group-title git-unstaged-title">Unstaged ({unstaged.length})</div>
          {unstaged.map(f => (
            <FileItem key={f.path} file={f} action="Stage" onAction={() => onStage(f.path)} onOpenDiff={() => onOpenDiff(f.path)} />
          ))}
        </div>
      )}

      {untracked.length > 0 && (
        <div className="git-change-group">
          <div className="git-group-title git-untracked-title">Untracked ({untracked.length})</div>
          {untracked.map(f => (
            <FileItem key={f} file={f} isUntracked action="Stage" onAction={() => onStage(f)} />
          ))}
        </div>
      )}
    </div>
  );
};
