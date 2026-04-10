import React, { useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { RuleSectionCard } from './RuleSectionCard';
import { RulesPreview } from './RulesPreview';
import { postMessage } from '../../utils/vscode';

export const RulesPanel: React.FC = () => {
  const {
    rulesActive, rulesSummary, rulesSections, rulesErrors,
    rulesPreviewMode, setRulesPreviewMode, rulesLoading,
  } = useChatStore();

  useEffect(() => {
    postMessage({ type: 'getRulesStatus' } as any);
  }, []);

  const handleCreate = () => postMessage({ type: 'createRulesFile' } as any);
  const handleOpen = () => postMessage({ type: 'openRulesFile' } as any);
  const handleToggle = () => postMessage({ type: 'toggleRules' } as any);
  const handleRefresh = () => postMessage({ type: 'refreshRules' } as any);

  if (rulesLoading) {
    return (
      <div className="rules-panel loading">
        <div className="spinner" />
        <span>Loading rules...</span>
      </div>
    );
  }

  if (!rulesActive && (!rulesSections || rulesSections.length === 0)) {
    return (
      <div className="rules-panel empty">
        <div className="rules-empty-icon">📋</div>
        <h3>No Project Rules</h3>
        <p>Create a <code>.ina-rules</code> file to define coding guidelines for your project.</p>
        <div className="rules-actions">
          <button className="primary" onClick={handleCreate}>Create Rules File</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rules-panel">
      <div className="rules-header">
        <div className="rules-title">
          <span className="rules-icon">📋</span>
          <h3>Project Rules</h3>
          {rulesSummary && <span className="rules-summary">{rulesSummary}</span>}
        </div>
        <div className="rules-toolbar">
          <button className="icon-btn" onClick={handleRefresh} title="Refresh">↻</button>
          <button className="icon-btn" onClick={handleOpen} title="Edit file">✎</button>
          <button className={`icon-btn ${rulesActive ? 'active' : ''}`} onClick={handleToggle} title={rulesActive ? 'Disable' : 'Enable'}>
            {rulesActive ? '●' : '○'}
          </button>
        </div>
      </div>

      {rulesErrors && rulesErrors.length > 0 && (
        <div className="rules-errors">
          {rulesErrors.map((err, i) => (
            <div key={i} className="rules-error">⚠ {err}</div>
          ))}
        </div>
      )}

      <div className="rules-preview-tabs">
        <button className={rulesPreviewMode === 'sections' ? 'active' : ''} onClick={() => setRulesPreviewMode('sections')}>Sections</button>
        <button className={rulesPreviewMode === 'preview' ? 'active' : ''} onClick={() => setRulesPreviewMode('preview')}>Preview</button>
      </div>

      {rulesPreviewMode === 'sections' ? (
        <div className="rules-sections">
          {rulesSections && rulesSections.map((section, i) => (
            <RuleSectionCard key={i} section={section} index={i} />
          ))}
        </div>
      ) : (
        <RulesPreview />
      )}
    </div>
  );
};
