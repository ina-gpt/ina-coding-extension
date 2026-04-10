import React, { useState, useMemo } from 'react';
import { Search, X, Copy, Printer } from 'lucide-react';
import { postMessage } from '@/utils/vscode';
import clsx from 'clsx';

interface ShortcutCategoryView {
  name: string;
  icon: string;
  shortcuts: { keys: string[]; action: string; description: string; context: string | null; category: string }[];
}

interface ShortcutsPanelProps {
  shortcuts: ShortcutCategoryView[];
  platform: string;
  onClose: () => void;
}

export function ShortcutsPanel({ shortcuts, platform, onClose }: ShortcutsPanelProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return shortcuts;
    const q = search.toLowerCase();
    return shortcuts.map(cat => ({
      ...cat,
      shortcuts: cat.shortcuts.filter(s =>
        s.action.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.keys.join('+').toLowerCase().includes(q)
      ),
    })).filter(cat => cat.shortcuts.length > 0);
  }, [shortcuts, search]);

  const handleCopyMarkdown = () => {
    const md = shortcuts.map(cat =>
      `## ${cat.name}\n${cat.shortcuts.map(s =>
        `- \`${s.keys.join('+')}\` → ${s.action}: ${s.description}`
      ).join('\n')}`
    ).join('\n\n');
    navigator.clipboard?.writeText(`# INA Coding Shortcuts\n\n${md}`);
  };

  const handlePrint = () => {
    postMessage({ type: 'printShortcuts' } as any);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 max-h-[85vh] rounded-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <h3 className="font-semibold text-sm">⌨️ Keyboard Shortcuts</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--vscode-descriptionForeground)] px-2 py-0.5 rounded bg-[var(--vscode-badge-background)]">
              {platform === 'mac' ? 'macOS' : platform === 'windows' ? 'Windows' : 'Linux'}
            </span>
            <button onClick={handleCopyMarkdown} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Copy as Markdown">
              <Copy size={14} />
            </button>
            <button onClick={handlePrint} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Print">
              <Printer size={14} />
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-[var(--vscode-panel-border)]">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2 text-[var(--vscode-descriptionForeground)]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search shortcuts..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded-lg outline-none focus:border-[var(--ina-accent-primary,#3b82f6)]" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(cat => (
              <div key={cat.name}>
                <div className="text-xs font-semibold mb-2 text-[var(--vscode-descriptionForeground)] flex items-center gap-1.5">
                  <span>{cat.name}</span>
                </div>
                <div className="space-y-1">
                  {cat.shortcuts.map(s => (
                    <div key={s.action} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[var(--vscode-list-hoverBackground)] group">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{s.action}</div>
                        {s.context && <div className="text-[10px] text-[var(--vscode-descriptionForeground)] opacity-0 group-hover:opacity-100 transition-opacity">{s.context}</div>}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
                        {s.keys.map((key, ki) => (
                          <React.Fragment key={ki}>
                            {ki > 0 && <span className="text-[10px] text-[var(--vscode-descriptionForeground)] mx-0.5">+</span>}
                            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] rounded shadow-sm border border-[var(--vscode-panel-border)]">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center text-sm text-[var(--vscode-descriptionForeground)] py-8">
              No shortcuts found for "{search}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] text-center text-xs text-[var(--vscode-descriptionForeground)]">
          Customize shortcuts in VS Code → Keyboard Shortcuts settings
        </div>
      </div>
    </div>
  );
}
