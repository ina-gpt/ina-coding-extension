import React, { useEffect, useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { MemoryCard } from './MemoryCard';
import { postMessage } from '../../utils/vscode';

type SortBy = 'date' | 'confidence' | 'access' | 'type';
type Tab = 'list' | 'add' | 'recent' | 'stats';

const TYPE_OPTIONS = ['fact', 'correction', 'preference', 'pattern', 'decision', 'context', 'snippet', 'warning'];
const SCOPE_OPTIONS = ['global', 'project', 'file'];

export const MemoryPanel: React.FC = () => {
  const { memories, memoryStats, recentExtractions, isAutoExtractEnabled } = useChatStore();

  const [tab, setTab] = useState<Tab>('list');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [filterType, setFilterType] = useState<string>('');
  const [filterScope, setFilterScope] = useState<string>('');
  const [searchText, setSearchText] = useState('');

  // Add memory form
  const [newType, setNewType] = useState('fact');
  const [newScope, setNewScope] = useState('project');
  const [newContent, setNewContent] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newTags, setNewTags] = useState('');

  useEffect(() => {
    postMessage({ type: 'requestMemories' } as any);
  }, []);

  const filteredMemories = (memories || [])
    .filter(m => !filterType || m.type === filterType)
    .filter(m => !filterScope || m.scope === filterScope)
    .filter(m => !searchText || m.summary.toLowerCase().includes(searchText.toLowerCase()) || m.content.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'confidence': return b.confidence - a.confidence;
        case 'access': return b.access_count - a.access_count;
        case 'type': return a.type.localeCompare(b.type);
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const handleAddMemory = () => {
    if (!newContent.trim()) return;
    postMessage({
      type: 'createMemory',
      memory: {
        type: newType, scope: newScope, content: newContent,
        summary: newSummary || newContent.slice(0, 100),
        tags: newTags ? newTags.split(',').map(t => t.trim()).filter(Boolean) : [],
      },
    } as any);
    setNewContent(''); setNewSummary(''); setNewTags('');
  };

  const handleMaintenance = () => postMessage({ type: 'runMemoryMaintenance' } as any);
  const handleExport = () => postMessage({ type: 'exportMemories', format: 'json' } as any);
  const handleClearProject = () => postMessage({ type: 'clearProjectMemories' } as any);
  const handleToggleAutoExtract = () => postMessage({ type: 'toggleAutoExtract', enabled: !isAutoExtractEnabled } as any);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-1.5">
          <span>🧠</span>
          <span className="font-semibold text-sm">Memory</span>
          {memoryStats && <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{memoryStats.total} total</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={handleMaintenance} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Run maintenance">🔧</button>
          <button onClick={handleExport} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]" title="Export">📤</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--vscode-panel-border)]">
        {(['list', 'add', 'recent', 'stats'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs capitalize border-b-2 ${tab === t ? 'border-[var(--vscode-focusBorder)]' : 'border-transparent text-[var(--vscode-descriptionForeground)]'}`}>
            {t === 'list' ? `List (${filteredMemories.length})` : t === 'recent' ? `Recent (${(recentExtractions || []).length})` : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {tab === 'list' && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search..." className="flex-1 min-w-[120px] px-2 py-1 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded" />
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="text-xs px-1 py-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded">
                <option value="">All types</option>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterScope} onChange={e => setFilterScope(e.target.value)} className="text-xs px-1 py-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded">
                <option value="">All scopes</option>
                {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)} className="text-xs px-1 py-1 bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded">
                <option value="date">Newest</option>
                <option value="confidence">Confidence</option>
                <option value="access">Most used</option>
                <option value="type">Type</option>
              </select>
            </div>

            {filteredMemories.length === 0 ? (
              <p className="text-xs text-center text-[var(--vscode-descriptionForeground)] py-8">No memories yet. Chat with the assistant to start building memory.</p>
            ) : (
              filteredMemories.map(m => <MemoryCard key={m.id} memory={m} />)
            )}
          </>
        )}

        {tab === 'add' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-medium">Type</label>
                <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded">
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-medium">Scope</label>
                <select value={newScope} onChange={e => setNewScope(e.target.value)} className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded">
                  {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium">Content</label>
              <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={3} placeholder="What should I remember?" className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded resize-y" />
            </div>
            <div>
              <label className="text-[10px] font-medium">Summary (optional)</label>
              <input value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder="One-line summary" className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded" />
            </div>
            <div>
              <label className="text-[10px] font-medium">Tags (comma separated)</label>
              <input value={newTags} onChange={e => setNewTags(e.target.value)} placeholder="auth, api, refactor" className="w-full mt-0.5 px-2 py-1 text-xs bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded" />
            </div>
            <button onClick={handleAddMemory} disabled={!newContent.trim()} className="self-start px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50">
              Remember
            </button>
          </div>
        )}

        {tab === 'recent' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--vscode-descriptionForeground)]">Auto-extracted memories</span>
              <button onClick={handleToggleAutoExtract} className={`text-[10px] px-2 py-0.5 rounded ${isAutoExtractEnabled ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]' : 'bg-[var(--vscode-input-background)]'}`}>
                {isAutoExtractEnabled ? 'Auto-extract ON' : 'Auto-extract OFF'}
              </button>
            </div>
            {(!recentExtractions || recentExtractions.length === 0) ? (
              <p className="text-xs text-center text-[var(--vscode-descriptionForeground)] py-4">No recent extractions</p>
            ) : (
              recentExtractions.map((ext, i) => (
                <div key={i} className="flex items-start gap-1.5 p-2 rounded border border-[var(--vscode-panel-border)]">
                  <span className="text-[9px] px-1 py-0.5 rounded text-[var(--ina-accent-primary-text,#fff)] shrink-0 mt-0.5" style={{ backgroundColor: ({ fact: '#3b82f6', correction: '#f97316', preference: '#a855f7', pattern: '#22c55e', decision: '#eab308', warning: '#ef4444' } as any)[ext.type] || '#6b7280' }}>
                    {ext.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{ext.summary}</div>
                    <div className="text-[10px] text-[var(--vscode-descriptionForeground)] truncate">{ext.content}</div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => postMessage({ type: 'keepExtractedMemory', extraction: ext } as any)} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]">Keep</button>
                    <button onClick={() => postMessage({ type: 'discardExtractedMemory', index: i } as any)} className="text-[10px] px-1.5 py-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)]">Discard</button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'stats' && memoryStats && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Total" value={memoryStats.total} />
              <StatCard label="Avg Confidence" value={`${Math.round(memoryStats.avgConfidence * 100)}%`} />
            </div>

            <div>
              <span className="text-[10px] font-medium">By Type</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(memoryStats.byType).map(([type, count]) => (
                  <span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">{type}: {count}</span>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-medium">By Scope</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(memoryStats.byScope).map(([scope, count]) => (
                  <span key={scope} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">{scope}: {count}</span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1 mt-2">
              <button onClick={handleMaintenance} className="text-xs px-3 py-1.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
                Run Maintenance
              </button>
              <button onClick={handleExport} className="text-xs px-3 py-1.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
                Export Memories
              </button>
              <button onClick={handleClearProject} className="text-xs px-3 py-1.5 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]">
                Clear All Project Memories
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="p-2 rounded border border-[var(--vscode-panel-border)] text-center">
    <div className="text-lg font-bold">{value}</div>
    <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">{label}</div>
  </div>
);
