/**
 * AnalyticsDashboard.tsx — Phase 20 Step 20.3
 * Project health overview dashboard
 */

import React from 'react';

interface ProjectHealth { overallScore: number; grade: string; metrics: any[]; lastUpdated: string; }
interface FileComplexity { filePath: string; totalComplexity: number; hotspot: boolean; maintainabilityIndex: number; }
interface DependencyHealth { name: string; currentVersion: string; latestVersion: string; isOutdated: boolean; hasVulnerability: boolean; }

interface AnalyticsDashboardProps {
  health: ProjectHealth | null;
  complexities: FileComplexity[];
  dependencies: DependencyHealth[];
  isScanning: boolean;
  onScan: () => void;
  onShowComplexity: () => void;
  onShowDependencies: () => void;
  onShowDuplication: () => void;
  onNavigate: (file: string) => void;
}

const gradeColors: Record<string, string> = { A: '#10b981', B: '#22d3ee', C: '#f59e0b', D: '#f97316', F: '#ef4444' };

const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ health, complexities, dependencies, isScanning, onScan, onShowComplexity, onShowDependencies, onShowDuplication, onNavigate }) => {
  if (isScanning) return <div className="analytics-dash" role="status"><span className="codicon codicon-loading codicon-modifier-spin" /> Scanning project...</div>;

  if (!health) return (
    <div className="analytics-dash">
      <h3><span className="codicon codicon-graph" /> Project Analytics</h3>
      <button className="analytics-btn analytics-btn-primary" onClick={onScan}><span className="codicon codicon-play" /> Run Analysis</button>
    </div>
  );

  const outdated = dependencies.filter(d => d.isOutdated).length;
  const vulnerable = dependencies.filter(d => d.hasVulnerability).length;
  const hotspots = complexities.filter(c => c.hotspot).length;

  return (
    <div className="analytics-dash" role="region" aria-label="Project Analytics">
      <div className="analytics-header">
        <h3><span className="codicon codicon-graph" /> Project Health</h3>
        <span className="analytics-updated">Updated: {new Date(health.lastUpdated).toLocaleDateString()}</span>
      </div>

      <div className="analytics-score" style={{ color: gradeColors[health.grade] || '#fff' }}>
        <div className="analytics-grade">{health.grade}</div>
        <div className="analytics-points">{health.overallScore}/100</div>
      </div>

      <div className="analytics-cards">
        <button className="analytics-card" onClick={onShowComplexity}>
          <div className="analytics-card-value">{hotspots}</div>
          <div className="analytics-card-label">Hotspots</div>
        </button>
        <button className="analytics-card" onClick={onShowDuplication}>
          <div className="analytics-card-value">{complexities.length}</div>
          <div className="analytics-card-label">Files scanned</div>
        </button>
        <button className="analytics-card" onClick={onShowDependencies}>
          <div className="analytics-card-value" style={{ color: vulnerable > 0 ? '#ef4444' : outdated > 0 ? '#f59e0b' : '#10b981' }}>
            {vulnerable > 0 ? `${vulnerable} vuln` : outdated > 0 ? `${outdated} old` : '✓'}
          </div>
          <div className="analytics-card-label">Dependencies</div>
        </button>
      </div>

      {hotspots > 0 && (
        <div className="analytics-hotspots">
          <h4>Complexity Hotspots</h4>
          <ul>
            {complexities.filter(c => c.hotspot).slice(0, 5).map(c => (
              <li key={c.filePath}>
                <button onClick={() => onNavigate(c.filePath)}>
                  {c.filePath.split('/').pop()} — complexity: {c.totalComplexity}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="analytics-btn" onClick={onScan}><span className="codicon codicon-refresh" /> Rescan</button>
    </div>
  );
};

export default AnalyticsDashboard;
