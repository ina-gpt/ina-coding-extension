/**
 * PairInsights.tsx — Phase 20 Step 20.1
 * Session insights: typing speed, focus time, mistakes
 */

import React from 'react';

interface InsightsData {
  typingSpeed: number;
  focusPercentage: number;
  frustrationEvents: number;
  suggestionsAccepted: number;
  suggestionsTotal: number;
  sessionMinutes: number;
  topPatterns: { name: string; count: number }[];
  commonMistakes: string[];
}

interface PairInsightsProps {
  data: InsightsData;
  onClose: () => void;
}

const PairInsights: React.FC<PairInsightsProps> = ({ data, onClose }) => {
  const acceptRate = data.suggestionsTotal > 0 ? Math.round((data.suggestionsAccepted / data.suggestionsTotal) * 100) : 0;

  return (
    <div className="pair-insights" role="region" aria-label="Session insights">
      <div className="pair-insights-header">
        <h3><span className="codicon codicon-graph" /> Session Insights</h3>
        <button className="pair-btn pair-btn-ghost" onClick={onClose}><span className="codicon codicon-close" /></button>
      </div>

      <div className="pair-stats-grid">
        <div className="pair-stat">
          <div className="pair-stat-value">{Math.round(data.typingSpeed)}</div>
          <div className="pair-stat-label">chars/min</div>
        </div>
        <div className="pair-stat">
          <div className="pair-stat-value">{data.focusPercentage}%</div>
          <div className="pair-stat-label">Focus time</div>
        </div>
        <div className="pair-stat">
          <div className="pair-stat-value">{data.frustrationEvents}</div>
          <div className="pair-stat-label">Frustration events</div>
        </div>
        <div className="pair-stat">
          <div className="pair-stat-value">{acceptRate}%</div>
          <div className="pair-stat-label">Suggestion accept rate</div>
        </div>
      </div>

      <div className="pair-stat">
        <div className="pair-stat-label">Session: {data.sessionMinutes} minutes</div>
      </div>

      {data.topPatterns.length > 0 && (
        <div className="pair-section">
          <h4>Top Patterns</h4>
          <ul>{data.topPatterns.slice(0, 5).map(p => <li key={p.name}>{p.name}: {p.count}</li>)}</ul>
        </div>
      )}

      {data.commonMistakes.length > 0 && (
        <div className="pair-section">
          <h4>Common Issues</h4>
          <ul>{data.commonMistakes.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
    </div>
  );
};

export default PairInsights;
