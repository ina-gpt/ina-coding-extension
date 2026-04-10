import React, { useState } from 'react';
import { postMessage } from '../../utils/vscode';

interface MemoryView {
  id: string;
  type: string;
  scope: string;
  content: string;
  summary: string;
  confidence: number;
  tags: string[] | null;
  related_files: string[] | null;
  is_pinned: boolean;
  is_active: boolean;
  source_type: string;
  access_count: number;
  created_at: string;
  last_accessed_at: string | null;
  superseded_by: string | null;
}

interface Props {
  memory: MemoryView;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  fact: '#3b82f6', correction: '#f97316', preference: '#a855f7', pattern: '#22c55e',
  decision: '#eab308', context: '#6b7280', snippet: '#06b6d4', warning: '#ef4444',
};

const CONFIDENCE_COLOR = (c: number) => c > 0.8 ? '#22c55e' : c > 0.5 ? '#eab308' : '#ef4444';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export const MemoryCard: React.FC<Props> = ({ memory }) => {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(memory.content);
  const [editSummary, setEditSummary] = useState(memory.summary);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handlePin = () => postMessage({ type: memory.is_pinned ? 'unpinMemory' : 'pinMemory', memoryId: memory.id } as any);
  const handleFeedback = (ft: string) => postMessage({ type: 'submitMemoryFeedback', memoryId: memory.id, feedbackType: ft } as any);
  const handleDelete = () => { postMessage({ type: 'deleteMemory', memoryId: memory.id } as any); setShowDeleteConfirm(false); };
  const handleSaveEdit = () => {
    postMessage({ type: 'updateMemory', memoryId: memory.id, updates: { content: editContent, summary: editSummary } } as any);
    setEditing(false);
  };
  const handleOpenFile = (f: string) => postMessage({ type: 'openFile', path: f } as any);

  return (
    <div className={`rounded border border-[var(--vscode-panel-border)] p-2 mb-2 ${!memory.is_active ? 'opacity-50' : ''}`}>
      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium text-[var(--ina-accent-primary-text,#fff)]" style={{ backgroundColor: TYPE_COLORS[memory.type] || '#6b7280' }}>
          {memory.type}
        </span>
        <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
          {memory.scope}
        </span>
        {memory.is_pinned && <span title="Pinned">📌</span>}
        {memory.superseded_by && <span className="text-[10px] text-[var(--vscode-errorForeground)]">superseded</span>}
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] ml-auto">{memory.source_type}</span>
      </div>

      {/* Summary / Content */}
      {editing ? (
        <div className="flex flex-col gap-1 my-1">
          <input value={editSummary} onChange={e => setEditSummary(e.target.value)} className="px-1.5 py-0.5 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded" placeholder="Summary" />
          <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} className="px-1.5 py-0.5 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded resize-y" />
          <div className="flex gap-1">
            <button onClick={handleSaveEdit} className="text-[10px] px-2 py-0.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">Save</button>
            <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-xs font-medium cursor-pointer" onClick={() => setExpanded(!expanded)}>
            {memory.summary}
            <span className="text-[var(--vscode-descriptionForeground)] ml-1">{expanded ? '▾' : '▸'}</span>
          </div>
          {expanded && <div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 whitespace-pre-wrap">{memory.content}</div>}
        </>
      )}

      {/* Confidence bar */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <div className="flex-1 h-1 rounded-full bg-[var(--vscode-editor-background)] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${memory.confidence * 100}%`, backgroundColor: CONFIDENCE_COLOR(memory.confidence) }} />
        </div>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{Math.round(memory.confidence * 100)}%</span>
      </div>

      {/* Tags */}
      {memory.tags && memory.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {memory.tags.map((tag, i) => (
            <span key={i} className="text-[10px] px-1 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">{tag}</span>
          ))}
        </div>
      )}

      {/* Related files */}
      {expanded && memory.related_files && memory.related_files.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {memory.related_files.map((f, i) => (
            <span key={i} onClick={() => handleOpenFile(f)} className="text-[10px] px-1 py-0.5 rounded bg-[var(--vscode-textLink-foreground)]/10 text-[var(--vscode-textLink-foreground)] cursor-pointer hover:underline">{f}</span>
          ))}
        </div>
      )}

      {/* Footer: time + actions */}
      <div className="flex items-center gap-1 mt-1.5">
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{timeAgo(memory.created_at)}</span>
        {memory.access_count > 0 && <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">· used {memory.access_count}x</span>}
        <div className="ml-auto flex gap-0.5">
          <button onClick={() => handleFeedback('helpful')} className="text-[10px] px-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Helpful">👍</button>
          <button onClick={() => handleFeedback('not_helpful')} className="text-[10px] px-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Not helpful">👎</button>
          <button onClick={handlePin} className="text-[10px] px-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title={memory.is_pinned ? 'Unpin' : 'Pin'}>📌</button>
          <button onClick={() => setEditing(true)} className="text-[10px] px-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Edit">✎</button>
          {showDeleteConfirm ? (
            <span className="text-[10px] flex gap-0.5">
              <button onClick={handleDelete} className="text-[var(--vscode-errorForeground)]">Yes</button>
              <button onClick={() => setShowDeleteConfirm(false)}>No</button>
            </span>
          ) : (
            <button onClick={() => setShowDeleteConfirm(true)} className="text-[10px] px-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Delete">✕</button>
          )}
        </div>
      </div>
    </div>
  );
};
