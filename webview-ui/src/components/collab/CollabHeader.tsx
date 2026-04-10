/**
 * CollabHeader.tsx
 * Phase 19B Step 19.5 — Session info bar for active collaboration
 */

import React, { useCallback } from 'react';

interface Participant {
  userId: string;
  name: string;
  color: string;
  role: 'host' | 'editor' | 'viewer';
  isOnline: boolean;
  currentFile?: string;
}

interface CollabHeaderProps {
  sessionCode: string;
  sessionTitle: string;
  participants: Participant[];
  isHost: boolean;
  onCopyCode: () => void;
  onEndSession: () => void;
  onLeaveSession: () => void;
  onToggleParticipants: () => void;
}

const CollabHeader: React.FC<CollabHeaderProps> = ({
  sessionCode,
  sessionTitle,
  participants,
  isHost,
  onCopyCode,
  onEndSession,
  onLeaveSession,
  onToggleParticipants,
}) => {
  const onlineCount = participants.filter((p) => p.isOnline).length;

  const handleCopy = useCallback(() => {
    onCopyCode();
  }, [onCopyCode]);

  return (
    <div className="collab-header-bar" role="banner" aria-label="Collaboration session info">
      <div className="collab-header-left">
        <span className="collab-session-title" title={sessionTitle}>
          <span className="codicon codicon-organization" aria-hidden="true" />
          {' '}{sessionTitle}
        </span>
        <button
          className="collab-code-badge collab-code-copy"
          onClick={handleCopy}
          title="Click to copy session code for sharing"
          aria-label={`Copy session code ${sessionCode}`}
        >
          {sessionCode}
          <span className="codicon codicon-copy" aria-hidden="true" />
        </button>
      </div>

      <div className="collab-header-center">
        <button
          className="collab-participants-dots"
          onClick={onToggleParticipants}
          aria-label={`${onlineCount} of ${participants.length} participants online. Click to view list.`}
          title="View participants"
        >
          {participants.slice(0, 8).map((p) => (
            <span
              key={p.userId}
              className={`collab-dot ${p.isOnline ? 'online' : 'offline'}`}
              style={{ backgroundColor: p.color }}
              title={`${p.name} (${p.role})${p.isOnline ? '' : ' — offline'}${p.currentFile ? ` · ${p.currentFile}` : ''}`}
              aria-hidden="true"
            />
          ))}
          {participants.length > 8 && (
            <span className="collab-dot-more" aria-hidden="true">+{participants.length - 8}</span>
          )}
          <span className="collab-online-count" aria-hidden="true">{onlineCount}/{participants.length}</span>
        </button>
      </div>

      <div className="collab-header-right">
        <span className="collab-privacy-indicator" title="All data stays on your server" aria-label="Privacy-first: data stays on your server">
          <span className="codicon codicon-shield" aria-hidden="true" />
        </span>
        {isHost ? (
          <button
            className="collab-btn collab-btn-danger collab-btn-sm"
            onClick={onEndSession}
            aria-label="End session for all participants"
            title="End session"
          >
            <span className="codicon codicon-close" aria-hidden="true" /> End
          </button>
        ) : (
          <button
            className="collab-btn collab-btn-ghost collab-btn-sm"
            onClick={onLeaveSession}
            aria-label="Leave this session"
            title="Leave session"
          >
            <span className="codicon codicon-sign-out" aria-hidden="true" /> Leave
          </button>
        )}
      </div>
    </div>
  );
};

export default CollabHeader;
