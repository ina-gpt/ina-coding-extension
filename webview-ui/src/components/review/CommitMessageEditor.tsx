/**
 * CommitMessageEditor.tsx — Phase 19 Step 19.3
 * Generated commit message with edit and commit action
 */

import React, { useState } from 'react';

interface CommitMessageEditorProps {
  message: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onCommit: (message: string, amend: boolean) => void;
}

const CommitMessageEditor: React.FC<CommitMessageEditorProps> = ({ message, isGenerating, onGenerate, onCommit }) => {
  const [edited, setEdited] = useState(message);
  const [amend, setAmend] = useState(false);

  React.useEffect(() => { setEdited(message); }, [message]);

  if (!message && !isGenerating) {
    return (
      <div className="commit-editor">
        <button className="review-btn review-btn-primary" onClick={onGenerate}><span className="codicon codicon-git-commit" /> Generate Commit Message</button>
      </div>
    );
  }

  if (isGenerating) {
    return <div className="commit-editor" role="status"><span className="codicon codicon-loading codicon-modifier-spin" /> Generating commit message...</div>;
  }

  return (
    <div className="commit-editor" role="region" aria-label="Commit message">
      <textarea className="commit-textarea" value={edited} onChange={e => setEdited(e.target.value)} rows={5} aria-label="Commit message" />
      <div className="commit-actions">
        <label className="commit-amend"><input type="checkbox" checked={amend} onChange={e => setAmend(e.target.checked)} /> Amend</label>
        <button className="review-btn review-btn-primary" onClick={() => onCommit(edited, amend)} disabled={!edited.trim()}><span className="codicon codicon-check" /> Commit</button>
      </div>
    </div>
  );
};

export default CommitMessageEditor;
