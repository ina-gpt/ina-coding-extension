import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  Database, RefreshCw, Trash2, Activity, HardDrive, FileCode,
  Clock, AlertTriangle, CheckCircle2, XCircle, Plus, X,
  Eye, EyeOff, ChevronDown, ChevronUp, Zap, BarChart3, Edit3, FileX,
} from 'lucide-react';
import { postMessage, onMessage } from '@/utils/vscode';
import clsx from 'clsx';

// ============ Types ============

interface IndexStats {
  totalFiles: number; totalChunks: number; totalTokens: number;
  embeddedChunks: number; pendingChunks: number; failedChunks: number;
  indexSize: string; lastIndexed: string | null; lastFullScan: string | null;
  languages: Array<{ language: string; files: number; chunks: number; percentage: number }>;
  chunkTypes: Array<{ type: string; count: number; percentage: number }>;
  topFiles: Array<{ path: string; chunks: number; tokens: number }>;
  health: { status: string; issues: string[]; recommendations: string[]; score: number };
}

interface ExcludePattern {
  id: string; pattern: string; type: string;
  source: 'user' | 'gitignore' | 'default'; active: boolean; matchCount?: number;
}

// ============ Sub-Components ============

const HealthBadge: React.FC<{ health: IndexStats['health'] }> = memo(({ health }) => {
  const cfg: Record<string, { Icon: any; color: string; bg: string }> = {
    healthy: { Icon: CheckCircle2, color: 'text-[var(--ina-status-success,#4ade80)]', bg: 'bg-[var(--ina-status-success-bg,rgba(34,197,94,0.2))]' },
    degraded: { Icon: AlertTriangle, color: 'text-[var(--ina-status-warning,#facc15)]', bg: 'bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.2))]' },
    unhealthy: { Icon: XCircle, color: 'text-[var(--ina-status-error,#f87171)]', bg: 'bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))]' },
    empty: { Icon: Database, color: 'text-gray-400', bg: 'bg-gray-500/20' },
  };
  const { Icon, color, bg } = cfg[health.status] || cfg.empty;

  return (
    <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg', bg)}>
      <Icon size={18} className={color} />
      <div className="flex-1">
        <div className={clsx('font-medium text-sm capitalize', color)}>{health.status}</div>
        <div className="text-xs text-[var(--vscode-descriptionForeground)]">Score: {health.score}/100</div>
      </div>
    </div>
  );
});
HealthBadge.displayName = 'HealthBadge';

const StatsCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; sub?: string }> = memo(({ icon, label, value, sub }) => (
  <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg p-3">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[var(--vscode-textLink-foreground)]">{icon}</span>
      <span className="text-xs text-[var(--vscode-descriptionForeground)]">{label}</span>
    </div>
    <div className="text-lg font-semibold">{value}</div>
    {sub && <div className="text-xs text-[var(--vscode-descriptionForeground)]">{sub}</div>}
  </div>
));
StatsCard.displayName = 'StatsCard';

const LanguageBar: React.FC<{ languages: IndexStats['languages'] }> = memo(({ languages }) => {
  const colors = ['bg-[var(--ina-status-info,#3b82f6)]', 'bg-[var(--ina-status-success,#22c55e)]', 'bg-[var(--ina-status-warning,#eab308)]', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-gray-500'];
  return (
    <div className="space-y-2">
      <div className="h-3 rounded-full overflow-hidden flex bg-[var(--vscode-input-background)]">
        {languages.map((lang, i) => (
          <div key={lang.language} className={clsx(colors[i % colors.length])} style={{ width: `${lang.percentage}%` }} title={`${lang.language}: ${lang.percentage}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {languages.slice(0, 6).map((lang, i) => (
          <div key={lang.language} className="flex items-center gap-1">
            <span className={clsx('w-2 h-2 rounded-full', colors[i % colors.length])} />
            <span className="text-[var(--vscode-descriptionForeground)]">{lang.language} ({lang.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
});
LanguageBar.displayName = 'LanguageBar';

// ============ Main Component ============

export const IndexManagementPanel: React.FC = () => {
  const [stats, setStats] = useState<IndexStats | null>(null);
  const [patterns, setPatterns] = useState<ExcludePattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'patterns' | 'files'>('overview');
  const [isOperating, setIsOperating] = useState(false);
  const [opMessage, setOpMessage] = useState<string | null>(null);
  const [newPattern, setNewPattern] = useState('');
  const [expandPatterns, setExpandPatterns] = useState(false);

  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case 'indexStats': setStats((message as any).stats); setIsLoading(false); break;
        case 'excludePatterns': setPatterns((message as any).patterns); break;
        case 'operationStarted': setIsOperating(true); setOpMessage((message as any).message); break;
        case 'operationComplete': setIsOperating(false); setOpMessage(null); postMessage({ type: 'getIndexStats' }); break;
        case 'operationError': setIsOperating(false); setOpMessage(null); break;
      }
    });
    postMessage({ type: 'getIndexStats' });
    postMessage({ type: 'getExcludePatterns' });
    return unsubscribe;
  }, []);

  const fmt = (n: number) => n >= 1000000 ? `${(n/1e6).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : n.toString();
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleString() : 'Never';

  const handleAddPattern = useCallback(() => {
    if (newPattern.trim()) { postMessage({ type: 'addExcludePattern', pattern: newPattern.trim() }); setNewPattern(''); }
  }, [newPattern]);

  if (isLoading) return <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin" /></div>;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="text-[var(--vscode-textLink-foreground)]" size={20} />
            <h2 className="font-semibold">Index Management</h2>
          </div>
          <button onClick={() => postMessage({ type: 'getIndexStats' })} className="p-1 hover:bg-[var(--vscode-button-secondaryHoverBackground)] rounded"><RefreshCw size={14} /></button>
        </div>
        {stats?.health && <HealthBadge health={stats.health} />}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--vscode-panel-border)]">
        {(['overview', 'patterns', 'files'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={clsx(
            'flex-1 px-3 py-2 text-sm capitalize',
            activeTab === tab ? 'text-[var(--vscode-textLink-foreground)] border-b-2 border-[var(--vscode-textLink-foreground)]' : 'text-[var(--vscode-descriptionForeground)]'
          )}>{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isOperating && (
          <div className="flex items-center gap-2 p-3 mb-3 bg-[var(--ina-status-info-bg,rgba(59,130,246,0.2))] rounded-lg">
            <RefreshCw className="animate-spin" size={16} /><span className="text-sm">{opMessage || 'Processing...'}</span>
          </div>
        )}

        {/* OVERVIEW */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <StatsCard icon={<FileCode size={16} />} label="Files" value={stats.totalFiles.toLocaleString()} />
              <StatsCard icon={<Database size={16} />} label="Chunks" value={stats.totalChunks.toLocaleString()} sub={`${stats.embeddedChunks.toLocaleString()} embedded`} />
              <StatsCard icon={<BarChart3 size={16} />} label="Tokens" value={fmt(stats.totalTokens)} />
              <StatsCard icon={<HardDrive size={16} />} label="Size" value={stats.indexSize} />
            </div>

            {(stats.pendingChunks > 0 || stats.failedChunks > 0) && (
              <div className="flex gap-3">
                {stats.pendingChunks > 0 && <span className="flex items-center gap-1 text-xs text-[var(--ina-status-warning,#facc15)]"><Clock size={12} />{stats.pendingChunks} pending</span>}
                {stats.failedChunks > 0 && <span className="flex items-center gap-1 text-xs text-[var(--ina-status-error,#f87171)]"><XCircle size={12} />{stats.failedChunks} failed</span>}
              </div>
            )}

            {stats.languages.length > 0 && (
              <div><h3 className="text-sm font-medium mb-2">Languages</h3><LanguageBar languages={stats.languages} /></div>
            )}

            <div className="text-xs text-[var(--vscode-descriptionForeground)]">
              <div>Last indexed: {fmtDate(stats.lastIndexed)}</div>
              <div>Last full scan: {fmtDate(stats.lastFullScan)}</div>
            </div>

            {stats.health.issues.length > 0 && (
              <div className="p-2 bg-[var(--ina-status-warning-bg,rgba(234,179,8,0.1))] rounded-lg">
                <div className="text-xs font-medium text-[var(--ina-status-warning,#facc15)] mb-1">Issues</div>
                <ul className="text-xs text-[var(--vscode-descriptionForeground)] space-y-1">
                  {stats.health.issues.map((issue, i) => <li key={i}>- {issue}</li>)}
                </ul>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <div className="text-xs font-medium text-[var(--vscode-descriptionForeground)]">Actions</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => postMessage({ type: 'reindex', options: {} })} disabled={isOperating} className="flex items-center justify-center gap-1 px-3 py-2 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50"><RefreshCw size={14} />Reindex</button>
                <button onClick={() => postMessage({ type: 'optimizeIndex' })} disabled={isOperating} className="flex items-center justify-center gap-1 px-3 py-2 text-sm bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] rounded disabled:opacity-50"><Zap size={14} />Optimize</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => postMessage({ type: 'reindex', options: { clearFirst: true } })} disabled={isOperating} className="flex items-center justify-center gap-1 px-3 py-2 text-sm border border-[var(--vscode-panel-border)] rounded disabled:opacity-50"><RefreshCw size={14} />Full Reindex</button>
                <button onClick={() => postMessage({ type: 'clearIndex' })} disabled={isOperating} className="flex items-center justify-center gap-1 px-3 py-2 text-sm text-[var(--ina-status-error,#f87171)] border border-[var(--ina-status-error,#ef4444)]/30 rounded hover:bg-[var(--ina-status-error-bg,rgba(239,68,68,0.1))] disabled:opacity-50"><Trash2 size={14} />Clear</button>
              </div>
            </div>
          </div>
        )}

        {/* PATTERNS */}
        {activeTab === 'patterns' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Exclude Patterns</h3>
              <button onClick={() => postMessage({ type: 'openInaIgnore' })} className="flex items-center gap-1 text-xs text-[var(--vscode-textLink-foreground)] hover:underline"><Edit3 size={12} />Edit .ina-ignore</button>
            </div>

            <div className="flex gap-2">
              <input type="text" value={newPattern} onChange={e => setNewPattern(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPattern()} placeholder="Add pattern (e.g., *.test.ts)" className="flex-1 px-2 py-1 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded focus:outline-none focus:border-[var(--vscode-focusBorder)]" />
              <button onClick={handleAddPattern} disabled={!newPattern.trim()} className="px-3 py-1 text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded disabled:opacity-50"><Plus size={14} /></button>
            </div>

            {/* User patterns */}
            {patterns.filter(p => p.source === 'user').map(p => (
              <div key={p.id} className={clsx('flex items-center gap-2 px-2 py-1 rounded text-sm', p.active ? 'bg-[var(--vscode-editor-background)]' : 'opacity-50')}>
                <button onClick={() => postMessage({ type: 'toggleExcludePattern', patternId: p.id, active: !p.active })}>{p.active ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                <code className="flex-1 font-mono text-xs">{p.pattern}</code>
                <button onClick={() => postMessage({ type: 'removeExcludePattern', patternId: p.id })} className="hover:text-[var(--ina-status-error,#f87171)]"><X size={14} /></button>
              </div>
            ))}

            {/* Default/gitignore patterns */}
            {patterns.filter(p => p.source !== 'user').length > 0 && (
              <button onClick={() => setExpandPatterns(!expandPatterns)} className="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)]">
                {expandPatterns ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                System Patterns ({patterns.filter(p => p.source !== 'user').length})
              </button>
            )}
            {expandPatterns && patterns.filter(p => p.source !== 'user').map(p => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1 text-xs opacity-60">
                <span className="font-mono">{p.pattern}</span>
                <span className="text-[var(--vscode-descriptionForeground)]">({p.source})</span>
              </div>
            ))}

            <p className="text-xs text-[var(--vscode-descriptionForeground)]">
              Patterns use glob syntax. Examples: <code>*.test.ts</code>, <code>temp/**</code>
            </p>
          </div>
        )}

        {/* FILES */}
        {activeTab === 'files' && stats && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Top Indexed Files</h3>
            <div className="space-y-1">
              {stats.topFiles.map(file => (
                <div key={file.path} className="flex items-center gap-2 p-2 text-xs bg-[var(--vscode-editor-background)] rounded">
                  <FileCode size={14} className="text-[var(--vscode-descriptionForeground)]" />
                  <span className="flex-1 truncate" title={file.path}>{file.path}</span>
                  <span className="text-[var(--vscode-descriptionForeground)]">{file.chunks} chunks</span>
                </div>
              ))}
              {stats.topFiles.length === 0 && (
                <div className="text-center py-4 text-[var(--vscode-descriptionForeground)]">
                  <FileX size={24} className="mx-auto mb-2 opacity-50" /><p>No files indexed yet</p>
                </div>
              )}
            </div>

            {stats.chunkTypes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Chunk Types</h3>
                <div className="space-y-1">
                  {stats.chunkTypes.map(type => (
                    <div key={type.type} className="flex items-center gap-2 text-xs">
                      <span className="w-20 capitalize">{type.type}</span>
                      <div className="flex-1 h-2 bg-[var(--vscode-input-background)] rounded overflow-hidden">
                        <div className="h-full bg-[var(--vscode-textLink-foreground)]" style={{ width: `${type.percentage}%` }} />
                      </div>
                      <span className="w-16 text-right text-[var(--vscode-descriptionForeground)]">{type.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndexManagementPanel;
