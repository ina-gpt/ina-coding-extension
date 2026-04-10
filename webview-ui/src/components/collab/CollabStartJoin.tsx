/**
 * CollabStartJoin.tsx
 * Phase 19B Step 19.5 — Start or join a collaboration session
 *
 * Privacy-first: all data stays on your server.
 */

import React, { useState, useCallback } from 'react';

interface RecentSession {
  code: string;
  title: string;
  hostName: string;
  participantCount: number;
  createdAt: string;
}

interface CollabStartJoinProps {
  recentSessions: RecentSession[];
  loading: boolean;
  onStart: (title: string) => void;
  onJoin: (code: string) => void;
  onRejoin: (code: string) => void;
}

const CollabStartJoin: React.FC<CollabStartJoinProps> = ({
  recentSessions,
  loading,
  onStart,
  onJoin,
  onRejoin,
}) => {
  const [mode, setMode] = useState<'menu' | 'start' | 'join'>('menu');
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');

  const handleStart = useCallback(() => {
    if (!title.trim()) return;
    onStart(title.trim());
  }, [title, onStart]);

  const handleJoin = useCallback(() => {
    const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length !== 6) return;
    onJoin(cleaned);
  }, [code, onJoin]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') { e.preventDefault(); action(); }
  }, []);

  if (loading) {
    return (
      <div className="collab-start-join" role="status" aria-live="polite">
        <div className="collab-spinner" aria-label="Connecting...">
          <span className="codicon codicon-loading codicon-modifier-spin" />
          <span>Connecting...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="collab-start-join" role="region" aria-label="Team Collaboration">
      <div className="collab-header">
        <h2>
          <span className="codicon codicon-organization" aria-hidden="true" />
          {' '}Team Collaboration
        </h2>
        <p className="collab-privacy-badge">
          <span className="codicon codicon-shield" aria-hidden="true" />
          {' '}Privacy-First · Your Server Only
        </p>
      </div>

      {mode === 'menu' && (
        <div className="collab-actions" role="group" aria-label="Collaboration actions">
          <button
            className="collab-btn collab-btn-primary"
            onClick={() => setMode('start')}
            aria-label="Start a new collaboration session"
          >
            <span className="codicon codicon-add" aria-hidden="true" />
            {' '}Start Session
          </button>
          <button
            className="collab-btn collab-btn-secondary"
            onClick={() => setMode('join')}
            aria-label="Join an existing session with a code"
          >
            <span className="codicon codicon-plug" aria-hidden="true" />
            {' '}Join Session
          </button>
        </div>
      )}

      {mode === 'start' && (
        <div className="collab-form" role="form" aria-label="Start session form">
          <label htmlFor="collab-title" className="collab-label">Session Title</label>
          <input
            id="collab-title"
            type="text"
            className="collab-input"
            placeholder="e.g. Bug fix sprint, API review..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleStart)}
            maxLength={100}
            autoFocus
            aria-required="true"
          />
          <div className="collab-form-actions">
            <button
              className="collab-btn collab-btn-primary"
              onClick={handleStart}
              disabled={!title.trim()}
              aria-label="Create session"
            >
              <span className="codicon codicon-play" aria-hidden="true" />
              {' '}Create
            </button>
            <button className="collab-btn collab-btn-ghost" onClick={() => setMode('menu')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="collab-form" role="form" aria-label="Join session form">
          <label htmlFor="collab-code" className="collab-label">Session Code</label>
          <input
            id="collab-code"
            type="text"
            className="collab-input collab-code-input"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            onKeyDown={(e) => handleKeyDown(e, handleJoin)}
            maxLength={6}
            autoFocus
            aria-required="true"
            aria-describedby="code-hint"
          />
          <span id="code-hint" className="collab-hint">6-character alphanumeric code</span>
          <div className="collab-form-actions">
            <button
              className="collab-btn collab-btn-primary"
              onClick={handleJoin}
              disabled={code.replace(/[^A-Z0-9]/g, '').length !== 6}
              aria-label="Join session"
            >
              <span className="codicon codicon-plug" aria-hidden="true" />
              {' '}Join
            </button>
            <button className="collab-btn collab-btn-ghost" onClick={() => setMode('menu')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {recentSessions.length > 0 && mode === 'menu' && (
        <div className="collab-recent" role="region" aria-label="Recent sessions">
          <h3>Recent Sessions</h3>
          <ul className="collab-recent-list" role="list">
            {recentSessions.map((s) => (
              <li key={s.code} className="collab-recent-item" role="listitem">
                <button
                  className="collab-recent-btn"
                  onClick={() => onRejoin(s.code)}
                  aria-label={`Rejoin "${s.title}" (${s.code})`}
                >
                  <span className="collab-recent-title">{s.title}</span>
                  <span className="collab-recent-meta">
                    <span className="collab-code-badge">{s.code}</span>
                    <span className="collab-recent-host">{s.hostName}</span>
                    <span className="collab-recent-count">
                      <span className="codicon codicon-person" aria-hidden="true" /> {s.participantCount}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CollabStartJoin;
