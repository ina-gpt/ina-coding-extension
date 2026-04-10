import React, { useMemo, useState } from 'react';
import {
  FileText,
  FilePlus,
  FileMinus,
  FileEdit,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  Search,
} from 'lucide-react';
import clsx from 'clsx';
import type { ComposerFileChange } from '@/types';

interface ComposerFileTreeProps {
  fileChanges: ComposerFileChange[];
  selectedFile: string | null;
  onSelectFile: (filePath: string) => void;
  onAcceptFile: (filePath: string) => void;
  onRejectFile: (filePath: string) => void;
  onToggleFile?: (filePath: string) => void;
}

type FilterMode = 'all' | 'pending' | 'accepted' | 'rejected';

const STATUS_ICON: Record<string, React.ComponentType<any>> = {
  created: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileText,
};

const STATUS_COLOR: Record<string, string> = {
  created: 'text-green-400',
  modified: 'text-blue-400',
  deleted: 'text-red-400',
  renamed: 'text-amber-400',
};

const RISK_DOT: Record<string, string> = {
  low: 'bg-green-500',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
};

const groupByDirectory = (
  files: ComposerFileChange[]
): Record<string, ComposerFileChange[]> => {
  const groups: Record<string, ComposerFileChange[]> = {};
  for (const f of files) {
    const lastSlash = f.filePath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? f.filePath.substring(0, lastSlash) : '/';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(f);
  }
  return groups;
};

const fileName = (filePath: string): string => {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash >= 0 ? filePath.substring(lastSlash + 1) : filePath;
};

export const ComposerFileTree: React.FC<ComposerFileTreeProps> = ({
  fileChanges,
  selectedFile,
  onSelectFile,
  onAcceptFile,
  onRejectFile,
}) => {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let result = fileChanges;
    if (filter === 'pending') result = result.filter((f) => f.accepted === null);
    else if (filter === 'accepted') result = result.filter((f) => f.accepted === true);
    else if (filter === 'rejected') result = result.filter((f) => f.accepted === false);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.filePath.toLowerCase().includes(q));
    }
    return result;
  }, [fileChanges, filter, search]);

  const grouped = useMemo(() => groupByDirectory(filtered), [filtered]);

  const toggleDir = (dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const counts = useMemo(() => {
    return {
      all: fileChanges.length,
      pending: fileChanges.filter((f) => f.accepted === null).length,
      accepted: fileChanges.filter((f) => f.accepted === true).length,
      rejected: fileChanges.filter((f) => f.accepted === false).length,
    };
  }, [fileChanges]);

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Filter bar */}
      <div className="px-2 py-1 border-b border-[var(--vscode-panel-border)] flex items-center gap-1">
        {(['all', 'pending', 'accepted', 'rejected'] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-2 py-0.5 rounded text-[11px] capitalize',
              filter === f
                ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]'
            )}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-1 border-b border-[var(--vscode-panel-border)] flex items-center gap-1">
        <Search size={12} className="text-[var(--vscode-descriptionForeground)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter files..."
          className="flex-1 bg-transparent outline-none text-[11px] placeholder:text-[var(--vscode-descriptionForeground)]"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(grouped).length === 0 && (
          <div className="px-3 py-6 text-center text-[var(--vscode-descriptionForeground)]">
            No files
          </div>
        )}
        {Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dir, files]) => {
            const collapsed = collapsedDirs.has(dir);
            return (
              <div key={dir}>
                <button
                  onClick={() => toggleDir(dir)}
                  className="w-full flex items-center gap-1 px-2 py-0.5 hover:bg-[var(--vscode-list-hoverBackground)] text-[var(--vscode-descriptionForeground)]"
                >
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span className="truncate text-[10px]">{dir}</span>
                  <span className="ml-auto text-[10px]">({files.length})</span>
                </button>
                {!collapsed &&
                  files.map((file) => {
                    const Icon = STATUS_ICON[file.status] || FileText;
                    const isSelected = selectedFile === file.filePath;
                    return (
                      <div
                        key={file.filePath}
                        className={clsx(
                          'flex items-center gap-1 px-2 py-0.5 cursor-pointer group',
                          isSelected
                            ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                            : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                        )}
                        onClick={() => onSelectFile(file.filePath)}
                      >
                        <Icon size={12} className={clsx('flex-shrink-0', STATUS_COLOR[file.status])} />
                        {file.risk && (
                          <span
                            className={clsx(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                              RISK_DOT[file.risk]
                            )}
                            title={`Risk: ${file.risk}`}
                          />
                        )}
                        <span
                          className={clsx(
                            'truncate flex-1 text-[11px]',
                            file.accepted === false &&
                              'line-through text-[var(--vscode-descriptionForeground)]'
                          )}
                          title={file.filePath}
                        >
                          {fileName(file.filePath)}
                        </span>
                        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] flex-shrink-0">
                          <span className="text-green-400">+{file.diff.linesAdded}</span>{' '}
                          <span className="text-red-400">-{file.diff.linesRemoved}</span>
                        </span>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAcceptFile(file.filePath);
                            }}
                            className={clsx(
                              'p-0.5 rounded hover:bg-green-500/20',
                              file.accepted === true && 'text-green-400'
                            )}
                            title="Accept"
                          >
                            <Check size={11} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRejectFile(file.filePath);
                            }}
                            className={clsx(
                              'p-0.5 rounded hover:bg-red-500/20',
                              file.accepted === false && 'text-red-400'
                            )}
                            title="Reject"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default ComposerFileTree;
