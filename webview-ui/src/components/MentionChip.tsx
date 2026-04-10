import React, { memo } from 'react';
import {
  File, Folder, Code2, Book, Globe, Database,
  Terminal, GitBranch, AlertTriangle, AtSign,
  X, ExternalLink, Wrench, StickyNote,
} from 'lucide-react';
import clsx from 'clsx';

import type { MentionType, MentionData } from '@/types';

// Re-export for consumers
export type { MentionType, MentionData };

// ============ Icon & Color Maps ============

const ICONS: Partial<Record<MentionType, React.ReactNode>> = {
  file: <File size={12} />, folder: <Folder size={12} />,
  symbol: <Code2 size={12} />, docs: <Book size={12} />,
  web: <Globe size={12} />, mcp: <Wrench size={12} />,
  notepad: <StickyNote size={12} />,
  codebase: <Database size={12} />,
  selection: <AtSign size={12} />, terminal: <Terminal size={12} />,
  git: <GitBranch size={12} />, problems: <AlertTriangle size={12} />,
};

const COLORS: Partial<Record<MentionType, { bg: string; text: string; border: string }>> = {
  file: { bg: 'bg-[var(--ina-status-info-bg,rgba(59,130,246,0.1))]', text: 'text-[var(--ina-status-info,#60a5fa)]', border: 'border-[var(--ina-status-info,#3b82f6)]/30' },
  folder: { bg: 'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))]', text: 'text-[var(--ina-status-warning,#facc15)]', border: 'border-[var(--ina-status-warning,#eab308)]/30' },
  symbol: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  docs: { bg: 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.1))]', text: 'text-[var(--ina-status-success,#4ade80)]', border: 'border-[var(--ina-status-success,#22c55e)]/30' },
  web: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  mcp: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  notepad: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  codebase: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  selection: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
  terminal: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
  git: { bg: 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.1))]', text: 'text-[var(--ina-status-error,#f87171)]', border: 'border-[var(--ina-status-error,#ef4444)]/30' },
  problems: { bg: 'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))]', text: 'text-[var(--ina-status-warning,#facc15)]', border: 'border-[var(--ina-status-warning,#eab308)]/30' },
};

// ============ MentionChip ============

export const MentionChip: React.FC<{
  mention: MentionData;
  onRemove?: () => void;
  onClick?: () => void;
  isCompact?: boolean;
  className?: string;
}> = memo(({ mention, onRemove, onClick, isCompact = false, className }) => {
  const colors = COLORS[mention.type] || COLORS.file!;
  const icon = ICONS[mention.type] || <AtSign size={12} />;

  return (
    <span
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1 rounded border transition-colors',
        colors.bg, colors.text, colors.border,
        isCompact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-xs',
        onClick && 'cursor-pointer hover:opacity-80',
        mention.error && 'opacity-60 line-through',
        className
      )}
      title={mention.error || `@${mention.type}:${mention.value}`}
    >
      {icon}
      {isCompact
        ? <span className="font-medium">@{mention.type}</span>
        : <span className="max-w-[120px] truncate">{mention.displayName}</span>
      }
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 p-0.5 hover:bg-white/10 rounded-sm"
          title="Remove"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
});

MentionChip.displayName = 'MentionChip';

// ============ MentionChipsList ============

export const MentionChipsList: React.FC<{
  mentions: MentionData[];
  onRemove: (index: number) => void;
  onChipClick?: (mention: MentionData, index: number) => void;
  className?: string;
}> = memo(({ mentions, onRemove, onChipClick, className }) => {
  if (mentions.length === 0) { return null; }

  return (
    <div className={clsx('flex flex-wrap gap-1', className)}>
      {mentions.map((mention, i) => (
        <MentionChip
          key={`${mention.type}-${mention.value}-${i}`}
          mention={mention}
          onRemove={() => onRemove(i)}
          onClick={onChipClick ? () => onChipClick(mention, i) : undefined}
        />
      ))}
    </div>
  );
});

MentionChipsList.displayName = 'MentionChipsList';

// ============ InlineMention (for rendered messages) ============

export const InlineMention: React.FC<{
  type: MentionType;
  value: string;
  displayName?: string;
  onClick?: () => void;
}> = memo(({ type, value, displayName, onClick }) => {
  const colors = COLORS[type] || COLORS.file!;
  const icon = ICONS[type] || <AtSign size={10} />;

  return (
    <span
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[11px]',
        colors.bg, colors.text,
        onClick && 'cursor-pointer hover:opacity-80'
      )}
    >
      {icon}
      <span className="font-medium">@{type}</span>
      {(displayName || value) && (
        <span className="opacity-80">:{displayName || value}</span>
      )}
      {onClick && <ExternalLink size={10} className="ml-0.5 opacity-60" />}
    </span>
  );
});

InlineMention.displayName = 'InlineMention';

export default MentionChip;
