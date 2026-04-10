import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Search,
  Play,
  Trash2,
  Download,
  MessageSquare,
  Bot,
  User,
  Code2,
  Calendar,
} from 'lucide-react';
import clsx from 'clsx';
import type { HistorySearchResult, ConversationSummary } from '@/types';

interface HistorySearchPanelProps {
  results: HistorySearchResult[];
  conversations: ConversationSummary[];
  stats: { totalConversations: number; totalMessages: number; oldestMessage: number | null } | null;
  onSearch: (query: string, options: any) => void;
  onLoadConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onExportConversation: (id: string, format: 'json' | 'md') => void;
  onClose: () => void;
}

type RoleFilter = 'all' | 'user' | 'assistant';

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  const now = Date.now();
  if (now - ts < 86400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (now - ts < 7 * 86400_000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString();
};

/** Render bold-marker text into JSX with <strong> tags */
const renderHighlight = (s: string): React.ReactNode => {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="text-amber-400">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export const HistorySearchPanel: React.FC<HistorySearchPanelProps> = ({
  results,
  conversations,
  stats,
  onSearch,
  onLoadConversation,
  onDeleteConversation,
  onExportConversation,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [hasCodeBlock, setHasCodeBlock] = useState<boolean | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      onSearch(query, { role: roleFilter, hasCodeBlock });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, roleFilter, hasCodeBlock]);

  const isSearching = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[640px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-blue-400" />
            <span className="text-sm font-semibold">Chat History Search</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-[var(--vscode-panel-border)] space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border,transparent)] rounded">
            <Search size={12} className="text-[var(--vscode-descriptionForeground)] flex-shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all conversations..."
              className="flex-1 bg-transparent outline-none text-xs text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-descriptionForeground)]"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
              >
                <X size={11} />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'user', 'assistant'] as RoleFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={clsx(
                  'px-2 py-0.5 text-[10px] rounded capitalize',
                  roleFilter === r
                    ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                    : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]'
                )}
              >
                {r === 'all' ? 'All' : r === 'user' ? 'My messages' : 'AI responses'}
              </button>
            ))}
            <button
              onClick={() => setHasCodeBlock(hasCodeBlock === true ? null : true)}
              className={clsx(
                'px-2 py-0.5 text-[10px] rounded flex items-center gap-1',
                hasCodeBlock === true
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]'
              )}
            >
              <Code2 size={10} />
              Has code
            </button>
          </div>
        </div>

        {/* Results / conversations */}
        <div className="flex-1 overflow-y-auto p-3">
          {isSearching ? (
            <>
              <h4 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-2">
                {results.length} result{results.length === 1 ? '' : 's'}
              </h4>
              {results.length === 0 && (
                <div className="text-center text-xs text-[var(--vscode-descriptionForeground)] py-6">
                  No matches found
                </div>
              )}
              {results.map((r) => (
                <div
                  key={`${r.conversationId}-${r.messageId}`}
                  className="rounded border border-[var(--vscode-panel-border)] p-2 mb-2 hover:bg-[var(--vscode-list-hoverBackground)]"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {r.messageRole === 'user' ? (
                      <User size={11} className="text-blue-400" />
                    ) : (
                      <Bot size={11} className="text-green-400" />
                    )}
                    <span className="text-xs font-medium truncate flex-1">{r.conversationTitle}</span>
                    <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                      {formatDate(r.timestamp)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--vscode-foreground)] whitespace-pre-wrap mb-2">
                    {renderHighlight(r.matchSnippet)}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onLoadConversation(r.conversationId)}
                      className="px-2 py-0.5 text-[10px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1"
                    >
                      <Play size={9} />
                      Resume
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <h4 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-2">
                Recent conversations ({conversations.length})
              </h4>
              {conversations.length === 0 && (
                <div className="text-center text-xs text-[var(--vscode-descriptionForeground)] py-6">
                  <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                  No conversations yet
                </div>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-[var(--vscode-panel-border)] p-2 mb-2 hover:bg-[var(--vscode-list-hoverBackground)] relative"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={11} className="text-[var(--vscode-descriptionForeground)]" />
                    <span className="text-xs font-medium truncate flex-1">{c.title}</span>
                    <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                      {c.messageCount} msg
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--vscode-descriptionForeground)] line-clamp-2 mb-2">
                    {c.preview}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
                    <Calendar size={9} />
                    <span>{formatDate(c.lastMessageAt)}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => onLoadConversation(c.id)}
                      className="px-2 py-0.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1"
                    >
                      <Play size={9} />
                      Resume
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setExportMenuOpen(exportMenuOpen === c.id ? null : c.id)}
                        className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                        title="Export"
                      >
                        <Download size={10} />
                      </button>
                      {exportMenuOpen === c.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setExportMenuOpen(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-24 py-1 bg-[var(--vscode-menu-background,var(--vscode-editor-background))] border border-[var(--vscode-panel-border)] rounded-md shadow-lg z-20">
                            <button
                              onClick={() => {
                                onExportConversation(c.id, 'md');
                                setExportMenuOpen(null);
                              }}
                              className="w-full text-left px-2 py-1 hover:bg-[var(--vscode-list-hoverBackground)]"
                            >
                              Markdown
                            </button>
                            <button
                              onClick={() => {
                                onExportConversation(c.id, 'json');
                                setExportMenuOpen(null);
                              }}
                              className="w-full text-left px-2 py-1 hover:bg-[var(--vscode-list-hoverBackground)]"
                            >
                              JSON
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${c.title}"?`)) onDeleteConversation(c.id);
                      }}
                      className="p-0.5 rounded hover:bg-red-500/20 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Stats footer */}
        {stats && (
          <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] text-[10px] text-[var(--vscode-descriptionForeground)]">
            {stats.totalConversations} conversations · {stats.totalMessages} messages
            {stats.oldestMessage && (
              <> · since {new Date(stats.oldestMessage).toLocaleDateString()}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistorySearchPanel;
