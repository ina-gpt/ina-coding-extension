/**
 * PairSidebar.tsx — Phase 20 Step 20.1
 * Suggestion feed with accept/dismiss
 */

import React, { useState } from 'react';

interface ProactiveSuggestion { id: string; type: string; title: string; message: string; codeAction?: string; confidence: number; priority: string; file?: string; line?: number; timestamp: number; }

interface PairSidebarProps {
  suggestions: ProactiveSuggestion[];
  mode: string;
  frustrationScore: number;
  focusScore: number;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onNeverShow: (id: string) => void;
  onToggleMode: () => void;
}

const typeIcons: Record<string, string> = { hint: 'codicon-lightbulb', warning: 'codicon-warning', refactor: 'codicon-wrench', documentation: 'codicon-book', pattern: 'codicon-symbol-snippet', learning: 'codicon-mortar-board' };
const modeLabels: Record<string, string> = { active: 'Active', quiet: 'Quiet', off: 'Off', learning: 'Learning' };

const PairSidebar: React.FC<PairSidebarProps> = ({ suggestions, mode, frustrationScore, focusScore, onAccept, onDismiss, onNeverShow, onToggleMode }) => {
  const [filter, setFilter] = useState<string>('all');
  const filtered = filter === 'all' ? suggestions : suggestions.filter(s => s.type === filter);

  return (
    <div className="pair-sidebar" role="region" aria-label="AI Pair Programmer">
      <div className="pair-header">
        <h3><span className="codicon codicon-hubot" /> INA-7 Pro Pair</h3>
        <button className="pair-mode-btn" onClick={onToggleMode} title={`Mode: ${modeLabels[mode] || mode}`}>
          {mode === 'active' ? '🤖' : mode === 'quiet' ? '🤫' : mode === 'off' ? '⏸' : '📚'} {modeLabels[mode] || mode}
        </button>
      </div>

      <div className="pair-status">
        {focusScore > 70 && <span className="pair-focus">🎯 Deep Focus</span>}
        {frustrationScore > 50 && <span className="pair-frustration">⚠ Frustration: {frustrationScore}%</span>}
      </div>

      <div className="pair-filter" role="group" aria-label="Filter suggestions">
        {['all', 'warning', 'hint', 'refactor', 'documentation'].map(f => (
          <button key={f} className={`pair-filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <ul className="pair-suggestions" role="list">
        {filtered.map(s => (
          <li key={s.id} className={`pair-suggestion pair-${s.priority}`} role="listitem">
            <div className="pair-suggestion-header">
              <span className={`codicon ${typeIcons[s.type] || 'codicon-info'}`} />
              <strong>{s.title}</strong>
              <span className="pair-confidence">{s.confidence}%</span>
            </div>
            <p className="pair-suggestion-msg">{s.message}</p>
            {s.file && <span className="pair-suggestion-file">{s.file}{s.line ? `:${s.line}` : ''}</span>}
            <div className="pair-suggestion-actions">
              {s.codeAction && <button className="pair-btn pair-btn-primary" onClick={() => onAccept(s.id)}>Apply</button>}
              <button className="pair-btn" onClick={() => onDismiss(s.id)}>Dismiss</button>
              <button className="pair-btn pair-btn-ghost" onClick={() => onNeverShow(s.id)}>Never</button>
            </div>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && <div className="pair-empty"><span className="codicon codicon-check" /> No suggestions right now</div>}
    </div>
  );
};

export default PairSidebar;
