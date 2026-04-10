/**
 * DebtList.tsx — Phase 20 Step 20.4
 * Filterable, sortable table of all debt items
 */

import React, { useState, useMemo } from 'react';

interface DebtItem { id: string; type: string; title: string; description: string; file: string; startLine: number; severity: string; estimatedEffort: number; status: string; }

interface DebtListProps {
  items: DebtItem[];
  onNavigate: (file: string, line: number) => void;
  onStatusChange: (id: string, status: string) => void;
  onClose: () => void;
}

const sevColors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#6b7280' };

const DebtList: React.FC<DebtListProps> = ({ items, onNavigate, onStatusChange, onClose }) => {
  const [filter, setFilter] = useState({ severity: 'all', category: 'all', status: 'open' });
  const [sortBy, setSortBy] = useState<'severity' | 'effort' | 'file'>('severity');

  const filtered = useMemo(() => {
    let result = items;
    if (filter.severity !== 'all') result = result.filter(i => i.severity === filter.severity);
    if (filter.category !== 'all') result = result.filter(i => i.type === filter.category);
    if (filter.status !== 'all') result = result.filter(i => i.status === filter.status);

    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sortBy === 'severity') result.sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4));
    else if (sortBy === 'effort') result.sort((a, b) => b.estimatedEffort - a.estimatedEffort);
    else result.sort((a, b) => a.file.localeCompare(b.file));
    return result;
  }, [items, filter, sortBy]);

  const categories = [...new Set(items.map(i => i.type))];

  return (
    <div className="debt-list" role="region" aria-label="Debt items">
      <div className="debt-list-header">
        <h3><span className="codicon codicon-list-ordered" /> All Debt Items ({filtered.length})</h3>
        <button onClick={onClose}><span className="codicon codicon-close" /></button>
      </div>

      <div className="debt-filters" role="group" aria-label="Filters">
        <select value={filter.severity} onChange={e => setFilter({...filter, severity: e.target.value})} aria-label="Severity">
          <option value="all">All severity</option>
          <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <select value={filter.category} onChange={e => setFilter({...filter, category: e.target.value})} aria-label="Category">
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} aria-label="Status">
          <option value="all">All status</option>
          <option value="open">Open</option><option value="in-progress">In Progress</option><option value="resolved">Resolved</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} aria-label="Sort by">
          <option value="severity">Sort: Severity</option><option value="effort">Sort: Effort</option><option value="file">Sort: File</option>
        </select>
      </div>

      <ul className="debt-items" role="list">
        {filtered.map(item => (
          <li key={item.id} className="debt-item" role="listitem">
            <div className="debt-item-header">
              <span style={{color: sevColors[item.severity]}}>● {item.severity}</span>
              <span className="debt-item-type">{item.type}</span>
              <span className="debt-item-effort">{item.estimatedEffort}h</span>
            </div>
            <strong>{item.title}</strong>
            <p>{item.description.slice(0, 120)}</p>
            <button className="debt-file-link" onClick={() => onNavigate(item.file, item.startLine)}>{item.file}:{item.startLine}</button>
            <select className="debt-status-select" value={item.status} onChange={e => onStatusChange(item.id, e.target.value)} aria-label="Status">
              <option value="open">Open</option><option value="in-progress">In Progress</option><option value="resolved">Resolved</option><option value="wontfix">Won't Fix</option>
            </select>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && <div className="debt-empty"><span className="codicon codicon-check" /> No items match filters</div>}
    </div>
  );
};

export default DebtList;
