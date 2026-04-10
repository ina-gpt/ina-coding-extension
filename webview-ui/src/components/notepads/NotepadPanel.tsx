import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Pin,
  PinOff,
  Link2,
  Link2Off,
  Edit3,
  Trash2,
  StickyNote,
  Code2,
  FileJson,
  FileText,
  ListChecks,
} from 'lucide-react';
import clsx from 'clsx';
import type { Notepad, NotepadType } from '@/types';

interface NotepadPanelProps {
  notepads: Notepad[];
  onCreateNotepad: (name: string, type: NotepadType, content: string) => void;
  onDeleteNotepad: (id: string) => void;
  onPinNotepad: (id: string) => void;
  onUnpinNotepad: (id: string) => void;
  onAttachNotepad: (id: string) => void;
  onDetachNotepad: (id: string) => void;
  onOpenNotepad: (id: string) => void;
  onUpdateNotepad: (id: string, content: string) => void;
  onClose: () => void;
}

const TYPE_ICON: Record<string, React.ComponentType<any>> = {
  text: StickyNote,
  code: Code2,
  api: FileText,
  data: FileJson,
  requirements: ListChecks,
};

const TYPE_LABEL: Record<string, string> = {
  text: 'Text',
  code: 'Code',
  api: 'API Spec',
  data: 'Data',
  requirements: 'Requirements',
};

const TYPE_OPTIONS: Array<{ value: NotepadType; label: string }> = [
  { value: 'text' as NotepadType, label: 'Text / Notes' },
  { value: 'code' as NotepadType, label: 'Code Snippet' },
  { value: 'api' as NotepadType, label: 'API Spec' },
  { value: 'data' as NotepadType, label: 'Data / JSON' },
  { value: 'requirements' as NotepadType, label: 'Requirements' },
];

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 86400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * 86400_000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString();
};

const NotepadCard: React.FC<{
  notepad: Notepad;
  borderClass: string;
  onPin: () => void;
  onUnpin: () => void;
  onAttach: () => void;
  onDetach: () => void;
  onOpen: () => void;
  onDelete: () => void;
}> = ({ notepad, borderClass, onPin, onUnpin, onAttach, onDetach, onOpen, onDelete }) => {
  const Icon = TYPE_ICON[notepad.type] || StickyNote;
  return (
    <div
      className={clsx(
        'rounded border p-2 mb-2 hover:bg-[var(--vscode-list-hoverBackground)]',
        borderClass
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={13} className="text-[var(--vscode-descriptionForeground)] flex-shrink-0" />
        <span className="text-xs font-medium flex-1 truncate" title={notepad.name}>
          {notepad.name}
        </span>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] flex-shrink-0">
          {notepad.tokenCount}t
        </span>
      </div>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {TYPE_LABEL[notepad.type] || notepad.type}
        </span>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">·</span>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
          {formatDate(notepad.updatedAt)}
        </span>
        <div className="flex-1" />
        <button
          onClick={notepad.isPinned ? onUnpin : onPin}
          className={clsx(
            'p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]',
            notepad.isPinned ? 'text-amber-400' : 'text-[var(--vscode-descriptionForeground)]'
          )}
          title={notepad.isPinned ? 'Unpin' : 'Pin (always in context)'}
        >
          {notepad.isPinned ? <Pin size={11} /> : <PinOff size={11} />}
        </button>
        <button
          onClick={notepad.isAttached ? onDetach : onAttach}
          className={clsx(
            'p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]',
            notepad.isAttached ? 'text-blue-400' : 'text-[var(--vscode-descriptionForeground)]'
          )}
          title={notepad.isAttached ? 'Detach' : 'Attach to current chat'}
        >
          {notepad.isAttached ? <Link2 size={11} /> : <Link2Off size={11} />}
        </button>
        <button
          onClick={onOpen}
          className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-[var(--vscode-descriptionForeground)]"
          title="Open in editor"
        >
          <Edit3 size={11} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-red-500/20 text-[var(--vscode-descriptionForeground)] hover:text-red-400"
          title="Delete notepad"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
};

export const NotepadPanel: React.FC<NotepadPanelProps> = ({
  notepads,
  onCreateNotepad,
  onDeleteNotepad,
  onPinNotepad,
  onUnpinNotepad,
  onAttachNotepad,
  onDetachNotepad,
  onOpenNotepad,
  onClose,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<NotepadType>('text' as NotepadType);
  const [newContent, setNewContent] = useState('');

  const groups = useMemo(() => {
    const pinned = notepads.filter((n) => n.isPinned);
    const attached = notepads.filter((n) => n.isAttached && !n.isPinned);
    const available = notepads.filter((n) => !n.isPinned && !n.isAttached);
    return { pinned, attached, available };
  }, [notepads]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateNotepad(newName.trim(), newType, newContent);
    setNewName('');
    setNewContent('');
    setShowCreate(false);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-2">
            <StickyNote size={14} className="text-amber-400" />
            <span className="text-sm font-semibold">Notepads</span>
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
              {notepads.length} total · {groups.pinned.length} pinned
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowCreate(true)}
              className="px-2 py-1 text-[11px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] flex items-center gap-1"
            >
              <Plus size={11} />
              New
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {notepads.length === 0 && !showCreate && (
            <div className="text-center text-[var(--vscode-descriptionForeground)] text-xs py-8">
              <StickyNote size={28} className="mx-auto mb-2 opacity-40" />
              No notepads yet.
              <br />
              Create one to add persistent context to your chats.
            </div>
          )}

          {/* Pinned section */}
          {groups.pinned.length > 0 && (
            <section className="mb-3">
              <h4 className="text-[10px] font-semibold uppercase text-amber-400 mb-1">
                📌 Pinned (always in context)
              </h4>
              {groups.pinned.map((n) => (
                <NotepadCard
                  key={n.id}
                  notepad={n}
                  borderClass="border-amber-500/30 bg-amber-500/5"
                  onPin={() => onPinNotepad(n.id)}
                  onUnpin={() => onUnpinNotepad(n.id)}
                  onAttach={() => onAttachNotepad(n.id)}
                  onDetach={() => onDetachNotepad(n.id)}
                  onOpen={() => onOpenNotepad(n.id)}
                  onDelete={() => onDeleteNotepad(n.id)}
                />
              ))}
            </section>
          )}

          {/* Attached section */}
          {groups.attached.length > 0 && (
            <section className="mb-3">
              <h4 className="text-[10px] font-semibold uppercase text-blue-400 mb-1">
                🔗 Attached (this chat only)
              </h4>
              {groups.attached.map((n) => (
                <NotepadCard
                  key={n.id}
                  notepad={n}
                  borderClass="border-blue-500/30 bg-blue-500/5"
                  onPin={() => onPinNotepad(n.id)}
                  onUnpin={() => onUnpinNotepad(n.id)}
                  onAttach={() => onAttachNotepad(n.id)}
                  onDetach={() => onDetachNotepad(n.id)}
                  onOpen={() => onOpenNotepad(n.id)}
                  onDelete={() => onDeleteNotepad(n.id)}
                />
              ))}
            </section>
          )}

          {/* Available section */}
          {groups.available.length > 0 && (
            <section className="mb-3">
              <h4 className="text-[10px] font-semibold uppercase text-[var(--vscode-descriptionForeground)] mb-1">
                Available
              </h4>
              {groups.available.map((n) => (
                <NotepadCard
                  key={n.id}
                  notepad={n}
                  borderClass="border-[var(--vscode-panel-border)]"
                  onPin={() => onPinNotepad(n.id)}
                  onUnpin={() => onUnpinNotepad(n.id)}
                  onAttach={() => onAttachNotepad(n.id)}
                  onDetach={() => onDetachNotepad(n.id)}
                  onOpen={() => onOpenNotepad(n.id)}
                  onDelete={() => onDeleteNotepad(n.id)}
                />
              ))}
            </section>
          )}
        </div>

        {/* Create dialog */}
        {showCreate && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-2xl w-[360px] p-4">
              <div className="text-sm font-semibold mb-3">New Notepad</div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Notepad name (e.g. API Spec)"
                className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none mb-2"
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as NotepadType)}
                className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none mb-2"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Initial content (optional)"
                rows={5}
                className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border,transparent)] rounded outline-none mb-3 font-mono"
              />
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-3 py-1 text-[11px] rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="px-3 py-1 text-[11px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotepadPanel;
