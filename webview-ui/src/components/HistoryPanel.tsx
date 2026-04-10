import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Plus,
  Pin,
  Trash2,
  Download,
  MoreVertical,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  X,
  Edit2,
} from 'lucide-react';
import { useChatStore } from '@/store/chatStore';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

import type { Conversation } from '@/types';

// ============ Types ============

interface HistoryGroup {
  label: string;
  key: string;
  conversations: Conversation[];
}

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============ Helper Functions ============

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const groupConversations = (conversations: Conversation[]): HistoryGroup[] => {
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;
  const monthAgo = today - 30 * 86400000;

  const groups: Record<string, Conversation[]> = {
    pinned: [],
    today: [],
    yesterday: [],
    week: [],
    month: [],
    older: [],
  };

  for (const conv of conversations) {
    if (conv.archived) continue;

    if (conv.pinned) {
      groups.pinned.push(conv);
    } else if (conv.updatedAt >= today) {
      groups.today.push(conv);
    } else if (conv.updatedAt >= yesterday) {
      groups.yesterday.push(conv);
    } else if (conv.updatedAt >= weekAgo) {
      groups.week.push(conv);
    } else if (conv.updatedAt >= monthAgo) {
      groups.month.push(conv);
    } else {
      groups.older.push(conv);
    }
  }

  const result: HistoryGroup[] = [];

  if (groups.pinned.length) {
    result.push({ label: 'Pinned', key: 'pinned', conversations: groups.pinned });
  }
  if (groups.today.length) {
    result.push({ label: 'Today', key: 'today', conversations: groups.today });
  }
  if (groups.yesterday.length) {
    result.push({ label: 'Yesterday', key: 'yesterday', conversations: groups.yesterday });
  }
  if (groups.week.length) {
    result.push({ label: 'This Week', key: 'week', conversations: groups.week });
  }
  if (groups.month.length) {
    result.push({ label: 'This Month', key: 'month', conversations: groups.month });
  }
  if (groups.older.length) {
    result.push({ label: 'Older', key: 'older', conversations: groups.older });
  }

  return result;
};

// ============ Conversation Item ============

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onPin: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onExport: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  onSelect,
  onPin,
  onDelete,
  onRename,
  onExport,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== conversation.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setEditTitle(conversation.title);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={clsx(
        'group relative flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors',
        isActive
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      )}
      onClick={() => !isEditing && onSelect()}
    >
      <MessageSquare size={16} className="flex-shrink-0 opacity-60" />

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="w-full px-1 py-0.5 bg-[var(--vscode-input-background)] border border-[var(--vscode-focusBorder)] rounded text-sm"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="truncate text-sm">{conversation.title}</div>
        )}
        <div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
          {conversation.messageCount ?? conversation.messages?.length ?? 0} messages · {formatRelativeTime(conversation.updatedAt)}
        </div>
      </div>

      {conversation.pinned && !showMenu && (
        <Pin size={12} className="flex-shrink-0 text-[var(--vscode-descriptionForeground)]" />
      )}

      <div className={clsx(
        'flex items-center gap-0.5 flex-shrink-0',
        showMenu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      )}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
        >
          <MoreVertical size={14} />
        </button>
      </div>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(false);
            }}
          />
          <div className="absolute right-2 top-full mt-1 w-40 py-1 bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border,var(--vscode-panel-border))] rounded-md shadow-lg z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))]"
            >
              <Edit2 size={14} />
              Rename
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPin();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))]"
            >
              <Pin size={14} />
              {conversation.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExport();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))]"
            >
              <Download size={14} />
              Export
            </button>
            <div className="my-1 border-t border-[var(--vscode-menu-separatorBackground,var(--vscode-panel-border))]" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-[var(--ina-status-error,#f87171)] hover:bg-[var(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))]"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ============ History Group Component ============

interface HistoryGroupComponentProps {
  group: HistoryGroup;
  currentId: string | null;
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onExport: (id: string) => void;
}

const HistoryGroupComponent: React.FC<HistoryGroupComponentProps> = ({
  group,
  currentId,
  onSelect,
  onPin,
  onDelete,
  onRename,
  onExport,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-2 py-1 text-xs font-medium text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        {group.label}
        <span className="ml-auto opacity-60">{group.conversations.length}</span>
      </button>

      {!isCollapsed && (
        <div className="mt-1 space-y-0.5">
          {group.conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentId}
              onSelect={() => onSelect(conv.id)}
              onPin={() => onPin(conv.id)}
              onDelete={() => onDelete(conv.id)}
              onRename={(title) => onRename(conv.id, title)}
              onExport={() => onExport(conv.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============ Main History Panel ============

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose }) => {
  const { conversations, currentConversationId, newChat } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);

  const groups = useMemo(() => {
    if (searchQuery) {
      return [{
        label: 'Search Results',
        key: 'search',
        conversations: searchResults,
      }];
    }
    return groupConversations(conversations as Conversation[]);
  }, [conversations, searchQuery, searchResults]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = (conversations as Conversation[]).filter(conv =>
      conv.title.toLowerCase().includes(query)
    );
    setSearchResults(results);
  }, [searchQuery, conversations]);

  const handleSelect = useCallback((id: string) => {
    postMessage({ type: 'loadConversation', id });
    onClose();
  }, [onClose]);

  const handleNewChat = useCallback(() => {
    newChat();
    onClose();
  }, [newChat, onClose]);

  const handlePin = useCallback((id: string) => {
    postMessage({ type: 'pinConversation', id });
  }, []);

  const handleDelete = useCallback((id: string) => {
    postMessage({ type: 'deleteConversation', id });
  }, []);

  const handleRename = useCallback((id: string, title: string) => {
    postMessage({ type: 'renameConversation', id, title });
  }, []);

  const handleExport = useCallback((id: string) => {
    postMessage({ type: 'exportConversation', id });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative w-80 h-full bg-[var(--vscode-sideBar-background)] border-r border-[var(--vscode-panel-border)] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <h2 className="font-medium">Chat History</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewChat}
              className="p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
              title="New Chat"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border,var(--vscode-panel-border))] rounded">
            <Search size={14} className="text-[var(--vscode-descriptionForeground)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="flex-1 bg-transparent border-none outline-none text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-[var(--vscode-descriptionForeground)]">
              <MessageSquare size={48} className="mb-4 opacity-30" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            groups.map((group) => (
              <HistoryGroupComponent
                key={group.key}
                group={group}
                currentId={currentConversationId}
                onSelect={handleSelect}
                onPin={handlePin}
                onDelete={handleDelete}
                onRename={handleRename}
                onExport={handleExport}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] text-xs text-[var(--vscode-descriptionForeground)]">
          {conversations.length} conversations
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
