/**
 * Phase 12.2 — Audit Log Viewer
 */
import React, { useState } from 'react';
import { Search, Download, ShieldCheck, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  severity: string;
  userId: string | null;
  ipAddress: string | null;
  statusCode: number | null;
  details: Record<string, any>;
}

interface AuditLogViewerProps {
  logs: AuditEntry[];
  total: number;
  onLoadMore: () => void;
  onFilter: (filters: Record<string, string>) => void;
  onExport: (format: string) => void;
  onVerifyIntegrity: () => void;
  integrityResult?: { valid: boolean; brokenAt: number | null; totalChecked: number } | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-red-500 bg-red-500/10',
  high: 'text-orange-400 bg-orange-500/10',
  medium: 'text-yellow-400 bg-yellow-500/10',
  low: 'text-blue-400 bg-blue-500/10',
  info: 'text-gray-400 bg-gray-500/10',
};

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  logs, total, onLoadMore, onFilter, onExport, onVerifyIntegrity, integrityResult
}) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');

  const applyFilters = () => {
    const filters: Record<string, string> = {};
    if (severityFilter) filters.severity = severityFilter;
    if (actionFilter) filters.action = actionFilter;
    onFilter(filters);
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  return (
    <div className="space-y-3">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[120px] relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--vscode-descriptionForeground)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-6 pr-2 py-1 text-xs rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)]"
          />
        </div>
        <select
          value={severityFilter}
          onChange={e => { setSeverityFilter(e.target.value); setTimeout(applyFilters, 0); }}
          className="text-xs px-2 py-1 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)]"
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
        <button
          onClick={() => onExport('csv')}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--vscode-button-secondaryBackground)] hover:opacity-80"
        >
          <Download size={10} /> Export
        </button>
        <button
          onClick={onVerifyIntegrity}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--vscode-button-secondaryBackground)] hover:opacity-80"
        >
          <ShieldCheck size={10} /> Verify
        </button>
      </div>

      {/* Integrity Result */}
      {integrityResult && (
        <div className={clsx(
          'flex items-center gap-2 p-2 rounded text-xs',
          integrityResult.valid
            ? 'bg-green-500/10 text-green-400'
            : 'bg-red-500/10 text-red-400'
        )}>
          {integrityResult.valid ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
          {integrityResult.valid
            ? `All ${integrityResult.totalChecked.toLocaleString()} entries verified — no tampering detected`
            : `Chain broken at entry #${integrityResult.brokenAt} — possible tampering!`
          }
        </div>
      )}

      {/* Log Entries */}
      <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
        {logs.map(entry => {
          const filtered = search && !JSON.stringify(entry).toLowerCase().includes(search.toLowerCase());
          if (filtered) return null;
          const isExpanded = expandedId === entry.id;

          return (
            <div
              key={entry.id}
              className="border border-[var(--vscode-panel-border)] rounded"
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
              >
                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <span className="text-[var(--vscode-descriptionForeground)] w-[100px] shrink-0 text-left">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={clsx('px-1 py-0.5 rounded text-[10px] font-medium shrink-0', SEVERITY_COLORS[entry.severity] || '')}>
                  {entry.severity}
                </span>
                <span className="font-medium truncate text-left flex-1">{entry.action}</span>
                <span className="text-[var(--vscode-descriptionForeground)] truncate max-w-[80px]">
                  {entry.resourceType}
                </span>
              </button>

              {isExpanded && (
                <div className="px-3 pb-2 pt-1 text-xs space-y-1 border-t border-[var(--vscode-panel-border)]">
                  <div><span className="text-[var(--vscode-descriptionForeground)]">Resource:</span> {entry.resourceType}{entry.resourceId ? ` / ${entry.resourceId}` : ''}</div>
                  {entry.userId && <div><span className="text-[var(--vscode-descriptionForeground)]">User:</span> {entry.userId}</div>}
                  {entry.ipAddress && <div><span className="text-[var(--vscode-descriptionForeground)]">IP:</span> {entry.ipAddress}</div>}
                  {entry.statusCode && <div><span className="text-[var(--vscode-descriptionForeground)]">Status:</span> {entry.statusCode}</div>}
                  {Object.keys(entry.details).length > 0 && (
                    <div>
                      <span className="text-[var(--vscode-descriptionForeground)]">Details:</span>
                      <pre className="mt-1 p-2 bg-[var(--vscode-input-background)] rounded text-[10px] overflow-x-auto max-h-[100px]">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load More */}
      {logs.length < total && (
        <button
          onClick={onLoadMore}
          className="w-full text-center py-2 text-xs text-[var(--vscode-textLink-foreground)] hover:underline"
        >
          Load more ({total - logs.length} remaining)
        </button>
      )}

      <div className="text-xs text-[var(--vscode-descriptionForeground)] text-center">
        Showing {logs.length} of {total} entries
      </div>
    </div>
  );
};
