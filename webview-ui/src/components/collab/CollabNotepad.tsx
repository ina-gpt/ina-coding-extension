/**
 * CollabNotepad.tsx
 * Phase 19B Step 19.5 — Shared notepad editor with tabs
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface Notepad {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'requirements' | 'api-spec' | 'todo';
  lastEditedBy: string;
  lastEditorName?: string;
  updatedAt: string;
}

interface CollabNotepadProps {
  notepads: Notepad[];
  onUpdate: (id: string, content: string) => void;
  onCreate: (title: string, type: Notepad['type']) => void;
  onDelete: (id: string) => void;
  readOnly: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  text: 'codicon-note',
  requirements: 'codicon-checklist',
  'api-spec': 'codicon-symbol-interface',
  todo: 'codicon-tasklist',
};

const CollabNotepad: React.FC<CollabNotepadProps> = ({
  notepads,
  onUpdate,
  onCreate,
  onDelete,
  readOnly,
}) => {
  const [activeTab, setActiveTab] = useState<string>(notepads[0]?.id ?? '');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<Notepad['type']>('text');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!activeTab && notepads.length > 0) setActiveTab(notepads[0].id);
  }, [notepads, activeTab]);

  const activeNotepad = notepads.find((n) => n.id === activeTab);

  const handleContentChange = useCallback((content: string) => {
    if (!activeNotepad) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(activeNotepad.id, content);
    }, 2000);
  }, [activeNotepad, onUpdate]);

  const handleCreate = useCallback(() => {
    if (!newTitle.trim()) return;
    onCreate(newTitle.trim(), newType);
    setNewTitle('');
    setNewType('text');
    setShowNewForm(false);
  }, [newTitle, newType, onCreate]);

  return (
    <div className="collab-notepad" role="region" aria-label="Shared notepads">
      <div className="collab-notepad-tabs" role="tablist" aria-label="Notepad tabs">
        {notepads.map((np) => (
          <button
            key={np.id}
            role="tab"
            aria-selected={np.id === activeTab}
            className={`collab-notepad-tab ${np.id === activeTab ? 'active' : ''}`}
            onClick={() => setActiveTab(np.id)}
            title={`${np.title} (${np.type})`}
          >
            <span className={`codicon ${TYPE_ICONS[np.type] || 'codicon-note'}`} aria-hidden="true" />
            <span className="collab-tab-title">{np.title}</span>
          </button>
        ))}
        {!readOnly && (
          <button
            className="collab-notepad-tab collab-notepad-add"
            onClick={() => setShowNewForm(!showNewForm)}
            title="New notepad"
            aria-label="Create new notepad"
          >
            <span className="codicon codicon-add" aria-hidden="true" />
          </button>
        )}
      </div>

      {showNewForm && (
        <div className="collab-notepad-new" role="form" aria-label="Create notepad">
          <input
            type="text"
            className="collab-input"
            placeholder="Notepad title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
            aria-label="Notepad title"
          />
          <select
            className="collab-select"
            value={newType}
            onChange={(e) => setNewType(e.target.value as Notepad['type'])}
            aria-label="Notepad type"
          >
            <option value="text">Text</option>
            <option value="requirements">Requirements</option>
            <option value="api-spec">API Spec</option>
            <option value="todo">To-Do</option>
          </select>
          <button className="collab-btn collab-btn-primary collab-btn-sm" onClick={handleCreate} disabled={!newTitle.trim()}>
            Create
          </button>
        </div>
      )}

      {activeNotepad && (
        <div className="collab-notepad-editor" role="tabpanel" aria-label={`Notepad: ${activeNotepad.title}`}>
          <textarea
            className="collab-notepad-textarea"
            value={activeNotepad.content}
            onChange={(e) => handleContentChange(e.target.value)}
            readOnly={readOnly}
            placeholder="Start typing..."
            aria-label={`${activeNotepad.title} content`}
          />
          <div className="collab-notepad-footer">
            <span className="collab-notepad-meta">
              {activeNotepad.lastEditorName && (
                <>Last edited by {activeNotepad.lastEditorName}</>
              )}
            </span>
            {!readOnly && (
              <button
                className="collab-btn collab-btn-ghost collab-btn-sm"
                onClick={() => onDelete(activeNotepad.id)}
                title="Delete notepad"
                aria-label={`Delete notepad ${activeNotepad.title}`}
              >
                <span className="codicon codicon-trash" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {notepads.length === 0 && !showNewForm && (
        <div className="collab-empty" role="status">
          <span className="codicon codicon-note" aria-hidden="true" />
          <p>No shared notepads yet.</p>
          {!readOnly && <p>Click + to create one.</p>}
        </div>
      )}
    </div>
  );
};

export default CollabNotepad;
