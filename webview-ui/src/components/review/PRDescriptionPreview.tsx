/**
 * PRDescriptionPreview.tsx — Phase 19 Step 19.3
 * Generated PR description with copy and edit
 */

import React, { useState } from 'react';

interface PRDescription { title: string; body: string; type: string; breakingChanges: string[]; testingNotes: string; reviewerSuggestions: string[]; }

interface PRDescriptionPreviewProps {
  description: PRDescription | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onCopy: (text: string) => void;
}

const PRDescriptionPreview: React.FC<PRDescriptionPreviewProps> = ({ description, isGenerating, onGenerate, onCopy }) => {
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState('');

  if (!description && !isGenerating) {
    return (
      <div className="pr-preview">
        <button className="review-btn review-btn-primary" onClick={onGenerate}><span className="codicon codicon-git-pull-request" /> Generate PR Description</button>
      </div>
    );
  }

  if (isGenerating) {
    return <div className="pr-preview" role="status"><span className="codicon codicon-loading codicon-modifier-spin" /> Generating PR description...</div>;
  }

  if (!description) return null;

  const fullText = `## ${description.title}\n\n${editMode ? editBody : description.body}${description.breakingChanges.length > 0 ? `\n\n### Breaking Changes\n${description.breakingChanges.map(b => `- ${b}`).join('\n')}` : ''}${description.testingNotes ? `\n\n### Testing\n${description.testingNotes}` : ''}`;

  return (
    <div className="pr-preview" role="region" aria-label="PR description">
      <div className="pr-header">
        <span className="pr-type">{description.type}</span>
        <h3>{description.title}</h3>
        <div className="pr-actions">
          <button className="review-btn review-btn-sm" onClick={() => { setEditMode(!editMode); setEditBody(description.body); }}><span className="codicon codicon-edit" /> {editMode ? 'Preview' : 'Edit'}</button>
          <button className="review-btn review-btn-sm review-btn-primary" onClick={() => onCopy(fullText)}><span className="codicon codicon-copy" /> Copy</button>
        </div>
      </div>
      {editMode ? (
        <textarea className="pr-edit" value={editBody} onChange={e => setEditBody(e.target.value)} rows={15} aria-label="Edit PR description" />
      ) : (
        <div className="pr-body">{description.body}</div>
      )}
      {description.reviewerSuggestions.length > 0 && (
        <div className="pr-reviewers"><strong>Suggested reviewers:</strong> {description.reviewerSuggestions.join(', ')}</div>
      )}
    </div>
  );
};

export default PRDescriptionPreview;
