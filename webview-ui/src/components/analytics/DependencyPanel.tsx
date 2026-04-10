/**
 * DependencyPanel.tsx — Phase 20 Step 20.3
 * Dependency health table
 */

import React from 'react';

interface DependencyHealth { name: string; currentVersion: string; latestVersion: string; isOutdated: boolean; hasVulnerability: boolean; severity?: string; licenseType: string; directUsages: number; }

interface DependencyPanelProps { dependencies: DependencyHealth[]; onClose: () => void; }

const DependencyPanel: React.FC<DependencyPanelProps> = ({ dependencies, onClose }) => {
  const vulnerable = dependencies.filter(d => d.hasVulnerability);
  const outdated = dependencies.filter(d => d.isOutdated && !d.hasVulnerability);

  return (
    <div className="dep-panel" role="region" aria-label="Dependencies">
      <div className="dep-header"><h3><span className="codicon codicon-package" /> Dependencies ({dependencies.length})</h3><button onClick={onClose}><span className="codicon codicon-close" /></button></div>

      {vulnerable.length > 0 && <div className="dep-alert dep-alert-error">{vulnerable.length} vulnerable</div>}
      {outdated.length > 0 && <div className="dep-alert dep-alert-warn">{outdated.length} outdated</div>}

      <table className="dep-table">
        <thead><tr><th>Package</th><th>Current</th><th>Latest</th><th>License</th><th>Usages</th><th>Status</th></tr></thead>
        <tbody>
          {dependencies.slice(0, 50).map(d => (
            <tr key={d.name} className={d.hasVulnerability ? 'dep-vuln' : d.isOutdated ? 'dep-outdated' : ''}>
              <td>{d.name}</td>
              <td>{d.currentVersion}</td>
              <td>{d.latestVersion}</td>
              <td>{d.licenseType}</td>
              <td>{d.directUsages}</td>
              <td>{d.hasVulnerability ? <span style={{color:'#ef4444'}}>● {d.severity}</span> : d.isOutdated ? <span style={{color:'#f59e0b'}}>● Outdated</span> : <span style={{color:'#10b981'}}>● Current</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DependencyPanel;
