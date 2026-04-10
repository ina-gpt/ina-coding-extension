import React, { useState, useMemo } from 'react';
import { Search, RotateCcw, AlertTriangle, Edit2, ToggleLeft, ToggleRight, Download, Upload, X } from 'lucide-react';
import { ShortcutKeyCombo } from './ShortcutKeyCombo';
import { ShortcutConflictAlert } from './ShortcutConflictAlert';
import { ProfileSelector } from './ProfileSelector';
import { KeyCaptureDialog } from './KeyCaptureDialog';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface ShortcutDef {
  id: string;
  command: string;
  keys: { mac: string; windows: string; linux: string; display: string };
  whenClause: string | null;
  description: string;
  category: string;
  isDefault: boolean;
  isCustom: boolean;
  isChord: boolean;
}

interface ConflictData {
  shortcutId: string;
  conflictsWith: { source: string; command: string; keys: string };
  severity: 'blocking' | 'override' | 'context-safe';
  suggestion: string;
}

interface ProfileData { id: string; name: string; description: string; }

interface ShortcutManagerPanelProps {
  shortcuts: ShortcutDef[];
  profiles: ProfileData[];
  activeProfileId: string;
  conflicts: ConflictData[];
  disabledIds: string[];
  platform: string;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  chat: { label: 'Chat', icon: '💬' },
  inline_edit: { label: 'Inline Edit', icon: '✏️' },
  completion: { label: 'Completion', icon: '⚡' },
  agent: { label: 'Agent', icon: '🤖' },
  navigation: { label: 'Navigation', icon: '🔍' },
  search: { label: 'Search', icon: '🔎' },
  panels: { label: 'Panels', icon: '📋' },
  git: { label: 'Git', icon: '🌿' },
  file_ops: { label: 'File Ops', icon: '📁' },
  general: { label: 'General', icon: '⚙️' },
};

export function ShortcutManagerPanel({ shortcuts, profiles, activeProfileId, conflicts, disabledIds, platform, onClose }: ShortcutManagerPanelProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(conflicts.length > 0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search) return shortcuts;
    const q = search.toLowerCase();
    return shortcuts.filter(s =>
      s.description.toLowerCase().includes(q) ||
      s.command.toLowerCase().includes(q) ||
      s.keys.display.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }, [shortcuts, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ShortcutDef[]>();
    for (const s of filtered) {
      const list = map.get(s.category) || [];
      list.push(s);
      map.set(s.category, list);
    }
    return map;
  }, [filtered]);

  const toggleCategory = (cat: string) => {
    const next = new Set(collapsed);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    setCollapsed(next);
  };

  const handleCustomize = (id: string, keys: string) => {
    postMessage({ type: 'customizeShortcut', shortcutId: id, newKeys: { mac: keys, windows: keys.replace(/Cmd/g, 'Ctrl'), linux: keys.replace(/Cmd/g, 'Ctrl'), display: '' } } as any);
    setEditingId(null);
  };

  const handleReset = (id: string) => postMessage({ type: 'resetShortcut', shortcutId: id } as any);
  const handleResetAll = () => { if (confirm('Reset all shortcuts to defaults?')) postMessage({ type: 'resetAllShortcuts' } as any); };
  const handleToggle = (id: string, enabled: boolean) => postMessage({ type: enabled ? 'enableShortcut' : 'disableShortcut', shortcutId: id } as any);
  const handleSetProfile = (id: string) => postMessage({ type: 'setShortcutProfile', profileId: id } as any);
  const handleRunAudit = () => postMessage({ type: 'runShortcutAudit' } as any);
  const handleExport = () => postMessage({ type: 'exportShortcutConfig' } as any);

  const editingShortcut = editingId ? shortcuts.find(s => s.id === editingId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 max-h-[90vh] rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <h3 className="font-semibold text-sm">⌨️ Keyboard Shortcuts</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
              {platform === 'mac' ? '⌘ macOS' : platform === 'windows' ? 'Ctrl Windows' : 'Ctrl Linux'}
            </span>
            <button onClick={handleRunAudit} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Run conflict check"><AlertTriangle size={14} /></button>
            <button onClick={handleResetAll} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Reset all"><RotateCcw size={14} /></button>
            <button onClick={handleExport} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Export"><Download size={14} /></button>
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]"><X size={16} /></button>
          </div>
        </div>

        {/* Profiles */}
        <div className="px-4 py-2 border-b border-[var(--vscode-panel-border)]">
          <ProfileSelector profiles={profiles} activeId={activeProfileId} onSelect={handleSetProfile} />
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2 text-[var(--vscode-descriptionForeground)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search shortcuts..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded-lg outline-none focus:border-[var(--ina-accent-primary,#3b82f6)]" />
          </div>
        </div>

        {/* Conflicts */}
        {showConflicts && conflicts.length > 0 && (
          <div className="px-4 py-2 border-b border-[var(--vscode-panel-border)]">
            <ShortcutConflictAlert
              conflicts={conflicts}
              onResolve={() => {}}
              onDismiss={() => setShowConflicts(false)}
              onAutoResolve={() => postMessage({ type: 'autoResolveConflicts' } as any)}
            />
          </div>
        )}

        {/* Shortcut list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {Array.from(grouped).map(([cat, scs]) => {
            const info = CATEGORY_LABELS[cat] || { label: cat, icon: '📌' };
            const isCollapsed = collapsed.has(cat);

            return (
              <div key={cat}>
                <button onClick={() => toggleCategory(cat)} className="flex items-center gap-2 w-full text-left mb-1.5 group">
                  <span className="text-sm">{info.icon}</span>
                  <span className="text-xs font-semibold">{info.label}</span>
                  <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">({scs.length})</span>
                  <span className="text-xs text-[var(--vscode-descriptionForeground)] ml-auto">{isCollapsed ? '▸' : '▾'}</span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {scs.map(s => {
                      const disabled = disabledIds.includes(s.id);
                      return (
                        <div key={s.id} className={clsx('flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--vscode-list-hoverBackground)] group/row', disabled && 'opacity-50')}>
                          <div className="flex-1 min-w-0 mr-2">
                            <div className="text-xs truncate">{s.description}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <ShortcutKeyCombo keys={s.keys[platform as keyof typeof s.keys] || s.keys.mac} platform={platform} isChord={s.isChord} isCustomized={s.isCustom} isDisabled={disabled} size="sm" />
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
                              <button onClick={() => setEditingId(s.id)} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Edit"><Edit2 size={10} /></button>
                              {s.isCustom && <button onClick={() => handleReset(s.id)} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Reset"><RotateCcw size={10} /></button>}
                              <button onClick={() => handleToggle(s.id, disabled)} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title={disabled ? 'Enable' : 'Disable'}>
                                {disabled ? <ToggleLeft size={12} /> : <ToggleRight size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] text-center text-xs text-[var(--vscode-descriptionForeground)]">
          {shortcuts.length} shortcuts • {disabledIds.length} disabled
        </div>
      </div>

      {/* Key capture dialog */}
      {editingShortcut && editingId && (
        <KeyCaptureDialog
          currentKeys={editingShortcut.keys.display}
          conflicts={conflicts.filter(c => c.shortcutId === editingId).map(c => c.conflictsWith)}
          onCapture={(keys) => handleCustomize(editingId, keys)}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
