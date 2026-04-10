import React, { useState } from 'react';

interface RuleSectionView {
  type: string;
  title: string;
  rules: string[];
  priority: boolean;
  disabled: boolean;
}

interface Props {
  section: RuleSectionView;
  index: number;
}

const SECTION_ICONS: Record<string, string> = {
  stack: '🔧', architecture: '🏗', style: '✨', naming: '🏷',
  do: '✅', dont: '❌', testing: '🧪', errors: '⚠',
  performance: '⚡', security: '🔒', git: '📦', deps: '📚',
  docs: '📝', context: '💡', custom: '📋',
};

export const RuleSectionCard: React.FC<Props> = ({ section, index }) => {
  const [expanded, setExpanded] = useState(index < 4);

  const icon = SECTION_ICONS[section.type] || '📋';
  const ruleCount = section.rules.length;

  return (
    <div className={`rule-section-card ${section.disabled ? 'disabled' : ''} ${section.priority ? 'priority' : ''}`}>
      <div className="section-header" onClick={() => setExpanded(!expanded)}>
        <span className="section-icon">{icon}</span>
        <span className="section-title">{section.title}</span>
        <span className="section-count">{ruleCount}</span>
        {section.priority && <span className="priority-badge">!</span>}
        {section.disabled && <span className="disabled-badge">~</span>}
        <span className={`section-chevron ${expanded ? 'expanded' : ''}`}>▸</span>
      </div>
      {expanded && (
        <div className="section-rules">
          {section.rules.map((rule, i) => (
            <div key={i} className="rule-item">
              <span className="rule-bullet">•</span>
              <span className="rule-text">{rule}</span>
            </div>
          ))}
          {ruleCount === 0 && <div className="no-rules">No rules in this section</div>}
        </div>
      )}
    </div>
  );
};
