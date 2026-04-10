/**
 * ActivityFeed.tsx — Phase 24 Feature 5
 * Team activity feed showing commits, edits, agent runs
 */

import React from 'react';

interface ActivityEvent {
  id: string;
  participantName: string;
  type: 'commit' | 'file_edit' | 'agent_run' | 'skill_run' | 'review' | 'test_run' | 'deploy';
  title: string;
  details?: string;
  files?: string[];
  timestamp: string;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  isLoading: boolean;
  onRefresh: () => void;
}

const TYPE_ICONS: Record<string, string> = {
  commit: '🔨', file_edit: '📝', agent_run: '🤖', skill_run: '🧩',
  review: '🔍', test_run: '🧪', deploy: '🚀',
};

const ActivityFeed: React.FC<ActivityFeedProps> = ({ events, isLoading, onRefresh }) => {
  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'gerade eben';
    if (diff < 3600000) return `vor ${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)}h`;
    return `vor ${Math.floor(diff / 86400000)}d`;
  };

  return (
    <div className="activity-feed" role="region" aria-label="Team Activity">
      <div className="activity-header">
        <h4><span className="codicon codicon-pulse" aria-hidden="true" /> Teamaktivität</h4>
        <button className="collab-btn collab-btn-icon" onClick={onRefresh} disabled={isLoading} aria-label="Aktualisieren">
          <span className={`codicon codicon-refresh ${isLoading ? 'codicon-modifier-spin' : ''}`} />
        </button>
      </div>

      <ul className="activity-list" role="list">
        {events.map(event => (
          <li key={event.id} className="activity-item" role="listitem">
            <span className="activity-icon" aria-hidden="true">{TYPE_ICONS[event.type] || '📋'}</span>
            <div className="activity-content">
              <span className="activity-name">{event.participantName}</span>
              <span className="activity-title">{event.title}</span>
            </div>
            <span className="activity-time">{timeAgo(event.timestamp)}</span>
          </li>
        ))}
      </ul>

      {events.length === 0 && !isLoading && (
        <div className="activity-empty" role="status">Noch keine Aktivitäten</div>
      )}
    </div>
  );
};

export default ActivityFeed;
