/**
 * DebtDashboard.tsx — Phase 20 Step 20.4
 * Technical debt overview dashboard
 */

import React from 'react';

interface DebtItem { id: string; type: string; title: string; description: string; file: string; startLine: number; severity: string; estimatedEffort: number; status: string; }
interface DebtBudget { totalItems: number; byCategory: Record<string, number>; totalEstimatedHours: number; debtRatio: number; }

interface DebtDashboardProps {
  items: DebtItem[];
  budget: DebtBudget | null;
  isScanning: boolean;
  onScan: () => void;
  onShowList: () => void;
  onPlanSprint: () => void;
  onExportReport: () => void;
  onNavigate: (file: string, line: number) => void;
  onFixItem: (id: string) => void;
}

const sevColors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#6b7280' };

const DebtDashboard: React.FC<DebtDashboardProps> = ({ items, budget, isScanning, onScan, onShowList, onPlanSprint, onExportReport, onNavigate, onFixItem }) => {
  if (isScanning) return <div className="debt-dash" role="status"><span className="codicon codicon-loading codicon-modifier-spin" /> Scanning for technical debt...</div>;

  const open = items.filter(i => i.status === 'open');
  const critical = open.filter(i => i.severity === 'critical');
  const quickWins = open.filter(i => i.estimatedEffort <= 1 && (i.severity === 'medium' || i.severity === 'high')).slice(0, 5);

  return (
    <div className="debt-dash" role="region" aria-label="Technical Debt">
      <div className="debt-header">
        <h3><span className="codicon codicon-flame" /> Technical Debt</h3>
        <div className="debt-actions">
          <button className="debt-btn" onClick={onShowList}><span className="codicon codicon-list-ordered" /> List</button>
          <button className="debt-btn" onClick={onPlanSprint}><span className="codicon codicon-calendar" /> Sprint</button>
          <button className="debt-btn" onClick={onExportReport}><span className="codicon codicon-export" /> Export</button>
        </div>
      </div>

      {budget && (
        <div className="debt-summary">
          <div className="debt-stat"><span className="debt-stat-value">{budget.totalItems}</span><span className="debt-stat-label">Open items</span></div>
          <div className="debt-stat"><span className="debt-stat-value">{budget.totalEstimatedHours.toFixed(0)}h</span><span className="debt-stat-label">Estimated effort</span></div>
          <div className="debt-stat"><span className="debt-stat-value" style={{color: budget.debtRatio > 0.15 ? '#ef4444' : budget.debtRatio > 0.1 ? '#f59e0b' : '#10b981'}}>{(budget.debtRatio * 100).toFixed(1)}%</span><span className="debt-stat-label">Debt ratio</span></div>
        </div>
      )}

      {critical.length > 0 && (
        <div className="debt-section debt-critical">
          <h4><span className="codicon codicon-error" style={{color:'#ef4444'}} /> Critical ({critical.length})</h4>
          <ul>{critical.map(i => (
            <li key={i.id}><button onClick={() => onNavigate(i.file, i.startLine)}>{i.title}</button> — {i.file.split('/').pop()}</li>
          ))}</ul>
        </div>
      )}

      {quickWins.length > 0 && (
        <div className="debt-section">
          <h4><span className="codicon codicon-zap" /> Quick Wins</h4>
          <ul>{quickWins.map(i => (
            <li key={i.id}>
              <span style={{color: sevColors[i.severity]}}>●</span> {i.title} — {i.estimatedEffort}h
              <button className="debt-fix-btn" onClick={() => onFixItem(i.id)}>Fix</button>
            </li>
          ))}</ul>
        </div>
      )}

      {budget && Object.entries(budget.byCategory).filter(([,v]) => v > 0).length > 0 && (
        <div className="debt-section">
          <h4>By Category</h4>
          <ul>{Object.entries(budget.byCategory).filter(([,v]) => v > 0).sort(([,a],[,b]) => b - a).map(([cat, count]) => (
            <li key={cat}>{cat}: {count}</li>
          ))}</ul>
        </div>
      )}

      <button className="debt-btn debt-btn-primary" onClick={onScan}><span className="codicon codicon-refresh" /> Rescan</button>
    </div>
  );
};

export default DebtDashboard;
