import React from 'react';
import { useChatStore } from '../../store/chatStore';
import { postMessage } from '../../utils/vscode';

export const RulesIndicator: React.FC = () => {
  const { rulesActive, rulesSummary } = useChatStore();

  if (!rulesActive) return null;

  const handleClick = () => {
    postMessage({ type: 'showRulesPanel' } as any);
  };

  return (
    <div className="rules-indicator" onClick={handleClick} title={rulesSummary || 'Project rules active'}>
      <span className="rules-indicator-icon">📋</span>
      <span className="rules-indicator-text">{rulesSummary || 'Rules'}</span>
    </div>
  );
};
