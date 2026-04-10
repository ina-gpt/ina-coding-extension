import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { postMessage } from '../../utils/vscode';

type PreviewTab = 'chat' | 'completion' | 'agent' | 'inline';

export const RulesPreview: React.FC = () => {
  const { rulesPreviewText } = useChatStore();
  const [tab, setTab] = useState<PreviewTab>('chat');

  const handleTabChange = (newTab: PreviewTab) => {
    setTab(newTab);
    postMessage({ type: 'getRulesPreview', mode: newTab } as any);
  };

  return (
    <div className="rules-preview">
      <div className="preview-tabs">
        {(['chat', 'completion', 'agent', 'inline'] as PreviewTab[]).map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => handleTabChange(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="preview-content">
        <pre>{rulesPreviewText || 'Select a tab to preview how rules are formatted for that mode.'}</pre>
      </div>
    </div>
  );
};
