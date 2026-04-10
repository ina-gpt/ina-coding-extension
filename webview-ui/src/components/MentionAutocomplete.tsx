import React, { useEffect, useRef, useMemo, memo } from 'react';
import {
  File,
  Folder,
  Code2,
  Book,
  Globe,
  Database,
  Terminal,
  GitBranch,
  AlertTriangle,
  Type,
  Braces,
  Hash,
  AtSign,
  Loader2,
  Wrench,
  StickyNote,
} from 'lucide-react';
import clsx from 'clsx';

import type { MentionType, MentionSuggestion } from '@/types';

// Re-export for consumers
export type { MentionType, MentionSuggestion };

// ============ Types ============

export interface MentionContext {
  query: string;
  type: MentionType | null;
  startIndex: number;
  isComplete: boolean;
}

interface MentionAutocompleteProps {
  context: MentionContext | null;
  suggestions: MentionSuggestion[];
  isLoading: boolean;
  selectedIndex: number;
  onSelect: (suggestion: MentionSuggestion) => void;
  onClose: () => void;
}

// ============ Icon Mapping ============

const ICON_MAP: Record<string, React.ReactNode> = {
  '$(file)': <File size={14} />,
  '$(folder)': <Folder size={14} />,
  '$(symbol-method)': <Code2 size={14} />,
  '$(symbol-function)': <Braces size={14} />,
  '$(symbol-class)': <Type size={14} />,
  '$(symbol-interface)': <Type size={14} />,
  '$(symbol-variable)': <Hash size={14} />,
  '$(symbol-constant)': <Hash size={14} />,
  '$(symbol-misc)': <Code2 size={14} />,
  '$(book)': <Book size={14} />,
  '$(globe)': <Globe size={14} />,
  '$(tools)': <Wrench size={14} />,
  '$(notebook)': <StickyNote size={14} />,
  '$(database)': <Database size={14} />,
  '$(selection)': <AtSign size={14} />,
  '$(terminal)': <Terminal size={14} />,
  '$(git-branch)': <GitBranch size={14} />,
  '$(warning)': <AlertTriangle size={14} />,
  '$(package)': <Folder size={14} />,
  '$(symbol-namespace)': <Folder size={14} />,
  '$(symbol-property)': <Hash size={14} />,
  '$(symbol-field)': <Hash size={14} />,
  '$(symbol-enum)': <Type size={14} />,
};

const TYPE_COLORS: Partial<Record<MentionType, string>> = {
  file: 'text-[var(--ina-status-info,#60a5fa)]',
  folder: 'text-[var(--ina-status-warning,#facc15)]',
  symbol: 'text-purple-400',
  docs: 'text-[var(--ina-status-success,#4ade80)]',
  web: 'text-cyan-400',
  mcp: 'text-amber-400',
  notepad: 'text-yellow-400',
  codebase: 'text-orange-400',
  selection: 'text-pink-400',
  terminal: 'text-gray-400',
  git: 'text-[var(--ina-status-error,#f87171)]',
  problems: 'text-[var(--ina-status-warning,#facc15)]',
};

// ============ Suggestion Item ============

const SuggestionItem: React.FC<{
  suggestion: MentionSuggestion;
  isSelected: boolean;
  onClick: () => void;
}> = memo(({ suggestion, isSelected, onClick }) => {
  const icon = ICON_MAP[suggestion.icon] || <Code2 size={14} />;
  const colorClass = TYPE_COLORS[suggestion.type] || 'text-gray-400';

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors',
        isSelected
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      )}
    >
      <span className={clsx('flex-shrink-0', colorClass)}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{suggestion.displayName}</span>
          {suggestion.detail && (
            <span className="text-xs text-[var(--vscode-descriptionForeground)] truncate">{suggestion.detail}</span>
          )}
        </div>
        {suggestion.description && (
          <div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">{suggestion.description}</div>
        )}
      </div>
      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
        {suggestion.type}
      </span>
    </button>
  );
});

SuggestionItem.displayName = 'SuggestionItem';

// ============ Group Header ============

const GROUP_LABELS: Partial<Record<MentionType, string>> = {
  file: 'Files', folder: 'Folders', symbol: 'Symbols',
  docs: 'Documentation', web: 'Web Search', mcp: 'MCP Tools', notepad: 'Notepads',
  codebase: 'Codebase',
  selection: 'Selection', terminal: 'Terminal', git: 'Git', problems: 'Problems',
};

const GroupHeader: React.FC<{ type: MentionType; count: number }> = memo(({ type, count }) => (
  <div className="flex items-center gap-2 px-3 py-1 bg-[var(--vscode-sideBar-background)] text-xs font-medium text-[var(--vscode-descriptionForeground)] sticky top-0">
    <span>{GROUP_LABELS[type] || type}</span>
    <span className="opacity-60">({count})</span>
  </div>
));

GroupHeader.displayName = 'GroupHeader';

// ============ Main Component ============

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = memo(({
  context,
  suggestions,
  isLoading,
  selectedIndex,
  onSelect,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Group suggestions by type
  const groupedSuggestions = useMemo(() => {
    const groups: Partial<Record<MentionType, MentionSuggestion[]>> = {};
    for (const s of suggestions) {
      if (!groups[s.type]) { groups[s.type] = []; }
      groups[s.type]!.push(s);
    }
    return groups;
  }, [suggestions]);

  const multipleGroups = Object.keys(groupedSuggestions).length > 1;

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!context) { return null; }

  // Build flat index mapping
  let flatIdx = 0;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-80 max-h-64 overflow-auto bg-[var(--vscode-editorSuggestWidget-background)] border border-[var(--vscode-editorSuggestWidget-border)] rounded-lg shadow-xl"
      style={{ bottom: '100%', left: 0, marginBottom: '8px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
        <div className="flex items-center gap-2 text-sm">
          <AtSign size={14} className="text-[var(--vscode-textLink-foreground)]" />
          <span className="font-medium">{context.type ? `@${context.type}` : 'Mention'}</span>
          {context.query && (
            <span className="text-[var(--vscode-descriptionForeground)]">: {context.query}</span>
          )}
        </div>
        {isLoading && <Loader2 size={14} className="animate-spin text-[var(--vscode-descriptionForeground)]" />}
      </div>

      {/* Suggestions */}
      <div className="py-1">
        {suggestions.length === 0 ? (
          <div className="px-3 py-3 text-center text-sm text-[var(--vscode-descriptionForeground)]">
            {isLoading ? 'Searching...' : 'No suggestions found'}
          </div>
        ) : (
          Object.entries(groupedSuggestions).map(([type, items]) => {
            if (!items) { return null; }
            const startIdx = flatIdx;
            flatIdx += items.length;

            return (
              <div key={type}>
                {multipleGroups && <GroupHeader type={type as MentionType} count={items.length} />}
                {items.map((suggestion, i) => (
                  <SuggestionItem
                    key={`${type}-${suggestion.value}-${i}`}
                    suggestion={suggestion}
                    isSelected={startIdx + i === selectedIndex}
                    onClick={() => onSelect(suggestion)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)] text-[10px] text-[var(--vscode-descriptionForeground)]">
        <span>&#x2191;&#x2193; Navigate</span>
        <span>&#x21B5; Select</span>
        <span>Esc Close</span>
      </div>
    </div>
  );
});

MentionAutocomplete.displayName = 'MentionAutocomplete';

export default MentionAutocomplete;
