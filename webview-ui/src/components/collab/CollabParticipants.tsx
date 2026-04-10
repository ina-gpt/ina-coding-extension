/**
 * CollabParticipants.tsx
 * Phase 19B Step 19.5 — Participant list with roles, status, and host controls
 */

import React, { useCallback } from 'react';

interface Participant {
  userId: string;
  name: string;
  color: string;
  role: 'host' | 'editor' | 'viewer';
  isOnline: boolean;
  currentFile?: string;
  joinedAt: string;
}

interface CollabParticipantsProps {
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  onChangeRole: (userId: string, role: 'editor' | 'viewer') => void;
  onKick: (userId: string) => void;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, { label: string; icon: string }> = {
  host: { label: 'Host', icon: 'codicon-star-full' },
  editor: { label: 'Editor', icon: 'codicon-edit' },
  viewer: { label: 'Viewer', icon: 'codicon-eye' },
};

const CollabParticipants: React.FC<CollabParticipantsProps> = ({
  participants,
  currentUserId,
  isHost,
  onChangeRole,
  onKick,
  onClose,
}) => {
  const sorted = [...participants].sort((a, b) => {
    if (a.role === 'host') return -1;
    if (b.role === 'host') return 1;
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return 0;
  });

  const handleRoleChange = useCallback((userId: string, newRole: string) => {
    if (newRole === 'editor' || newRole === 'viewer') {
      onChangeRole(userId, newRole);
    }
  }, [onChangeRole]);

  return (
    <div className="collab-participants" role="region" aria-label="Session participants">
      <div className="collab-participants-header">
        <h3>
          <span className="codicon codicon-people" aria-hidden="true" />
          {' '}Participants ({participants.length})
        </h3>
        <button
          className="collab-btn collab-btn-icon"
          onClick={onClose}
          aria-label="Close participants panel"
        >
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </div>

      <ul className="collab-participants-list" role="list">
        {sorted.map((p) => {
          const roleInfo = ROLE_LABELS[p.role] || ROLE_LABELS.viewer;
          const isCurrentUser = p.userId === currentUserId;

          return (
            <li
              key={p.userId}
              className={`collab-participant ${p.isOnline ? 'online' : 'offline'}`}
              role="listitem"
              aria-label={`${p.name}, ${roleInfo.label}, ${p.isOnline ? 'online' : 'offline'}`}
            >
              <div className="collab-participant-info">
                <span
                  className={`collab-participant-dot ${p.isOnline ? 'online' : 'offline'}`}
                  style={{ backgroundColor: p.color }}
                  aria-hidden="true"
                />
                <div className="collab-participant-details">
                  <span className="collab-participant-name">
                    {p.name}{isCurrentUser ? ' (you)' : ''}
                  </span>
                  <span className="collab-participant-meta">
                    <span className={`codicon ${roleInfo.icon}`} aria-hidden="true" />
                    {' '}{roleInfo.label}
                    {p.currentFile && (
                      <span className="collab-participant-file" title={p.currentFile}>
                        {' '}· {p.currentFile.split('/').pop()}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {isHost && !isCurrentUser && p.role !== 'host' && (
                <div className="collab-participant-actions">
                  <select
                    className="collab-select collab-select-sm"
                    value={p.role}
                    onChange={(e) => handleRoleChange(p.userId, e.target.value)}
                    aria-label={`Change role for ${p.name}`}
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    className="collab-btn collab-btn-danger collab-btn-icon"
                    onClick={() => onKick(p.userId)}
                    title={`Remove ${p.name}`}
                    aria-label={`Remove ${p.name} from session`}
                  >
                    <span className="codicon codicon-close" aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default CollabParticipants;
