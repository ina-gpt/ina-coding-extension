import React, { useState, useMemo, useCallback } from 'react';
import { postMessage } from '@/utils/vscode';
import { useChatStore } from '@/store/chatStore';
import ReviewSummaryCard from './ReviewSummaryCard';
import ReviewChangeCard from './ReviewChangeCard';
import ReviewActionBar from './ReviewActionBar';
import UndoConfirmDialog from './UndoConfirmDialog';

interface DiffHunk {
  id: string;
  content: string;
  accepted: boolean | null;
  startLineOld: number;
  startLineNew: number;
}

interface DiffData {
  unified: string;
  stats: { additions: number; deletions: number };
  hunks: DiffHunk[];
  fileType: string | null;
}

interface ReviewChange {
  id: string;
  filePath: string;
  operation: 'create' | 'edit' | 'delete' | 'rename' | string;
  status: 'pending' | 'accepted' | 'rejected';
  accepted: boolean | null;
  diff: DiffData | null;
  hunks: DiffHunk[];
  metadata?: {
    language?: string;
    risk?: 'low' | 'medium' | 'high';
    riskReason?: string;
  };
}

interface ReviewSummary {
  totalFiles: number;
  additions: number;
  deletions: number;
  riskAssessment?: { level: 'low' | 'medium' | 'high'; factors: string[] };
  aiSummary?: string;
  terminalResults?: { type: string; passed: boolean; details?: string }[];
  directories?: number;
  breakingChanges?: string[];
}

interface ReviewProgress {
  total: number;
  decided: number;
  accepted: number;
  rejected: number;
  pending: number;
}

interface GroupedChanges {
  directory: string;
  changes: ReviewChange[];
  stats: { additions: number; deletions: number; files: number };
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

const OPERATION_OPTIONS = [
  { value: '', label: 'All Operations' },
  { value: 'create', label: 'Created' },
  { value: 'edit', label: 'Edited' },
  { value: 'delete', label: 'Deleted' },
  { value: 'rename', label: 'Renamed' },
];

function groupByDirectory(changes: ReviewChange[]): GroupedChanges[] {
  const groups: Record<string, ReviewChange[]> = {};
  for (const change of changes) {
    const lastSlash = change.filePath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? change.filePath.substring(0, lastSlash) : '.';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(change);
  }
  return Object.entries(groups)
    .map(([directory, dirChanges]) => ({
      directory,
      changes: dirChanges,
      stats: {
        files: dirChanges.length,
        additions: dirChanges.reduce((s, c) => s + (c.diff?.stats.additions || 0), 0),
        deletions: dirChanges.reduce((s, c) => s + (c.diff?.stats.deletions || 0), 0),
      },
    }))
    .sort((a, b) => a.directory.localeCompare(b.directory));
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px', fontSize: '11px', borderRadius: '3px',
  border: '1px solid var(--vscode-panel-border)',
  backgroundColor: 'var(--vscode-input-background)',
  color: 'var(--vscode-input-foreground)',
  outline: 'none',
};

const ReviewPanel: React.FC = () => {
  const reviewSession = (useChatStore as any)((s: any) => s.reviewSession);
  const reviewChanges: ReviewChange[] = (useChatStore as any)((s: any) => s.reviewChanges) || [];
  const reviewSummary: ReviewSummary | null = (useChatStore as any)((s: any) => s.reviewSummary);
  const reviewFilter = (useChatStore as any)((s: any) => s.reviewFilter) || {};
  const reviewProgress: ReviewProgress = (useChatStore as any)((s: any) => s.reviewProgress) || {
    total: 0, decided: 0, accepted: 0, rejected: 0, pending: 0,
  };
  const isReviewSummaryLoading: boolean = (useChatStore as any)((s: any) => s.isReviewSummaryLoading) || false;
  const showUndoDialog: boolean = (useChatStore as any)((s: any) => s.showUndoDialog) || false;
  const undoScope: 'all' | 'single_file' | 'single_hunk' = (useChatStore as any)((s: any) => s.undoScope) || 'all';
  const undoFilesAffected: string[] = (useChatStore as any)((s: any) => s.undoFilesAffected) || [];

  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [filterOperation, setFilterOperation] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter changes
  const filteredChanges = useMemo(() => {
    let result = reviewChanges;
    if (filterOperation) {
      result = result.filter((c) => c.operation === filterOperation);
    }
    if (filterStatus) {
      result = result.filter((c) => c.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.filePath.toLowerCase().includes(q));
    }
    return result;
  }, [reviewChanges, filterOperation, filterStatus, searchQuery]);

  const groupedChanges = useMemo(() => groupByDirectory(filteredChanges), [filteredChanges]);

  // Progress bar percentage
  const progressPct = reviewProgress.total > 0
    ? Math.round((reviewProgress.decided / reviewProgress.total) * 100)
    : 0;

  // Card expand toggle
  const toggleExpand = useCallback((id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Directory collapse toggle
  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }, []);

  // Actions
  const handleAcceptAll = useCallback(() => {
    postMessage({ type: 'acceptAllChanges' });
  }, []);

  const handleRejectAll = useCallback(() => {
    postMessage({ type: 'rejectAllChanges' });
  }, []);

  const handleAcceptChange = useCallback((id: string) => {
    postMessage({ type: 'acceptChange', changeId: id });
  }, []);

  const handleRejectChange = useCallback((id: string) => {
    postMessage({ type: 'rejectChange', changeId: id });
  }, []);

  const handleToggleChange = useCallback((id: string) => {
    postMessage({ type: 'toggleChange', changeId: id });
  }, []);

  const handleShowDiff = useCallback((id: string) => {
    postMessage({ type: 'showFileDiff', changeId: id });
  }, []);

  const handleUndoFile = useCallback((id: string) => {
    postMessage({ type: 'undoFileChange', changeId: id });
  }, []);

  const handleAcceptHunk = useCallback((hunkId: string) => {
    postMessage({ type: 'acceptHunk', hunkId });
  }, []);

  const handleRejectHunk = useCallback((hunkId: string) => {
    postMessage({ type: 'rejectHunk', hunkId });
  }, []);

  const handleFinalize = useCallback(() => {
    postMessage({ type: 'finalizeReview' });
  }, []);

  const handleUndoAll = useCallback(() => {
    postMessage({ type: 'undoAllChanges' });
  }, []);

  const handleUndoConfirm = useCallback(() => {
    postMessage({ type: 'undoAllChanges' });
    useChatStore.getState().hideUndoConfirm();
  }, []);

  const handleUndoCancel = useCallback(() => {
    useChatStore.getState().hideUndoConfirm();
  }, []);

  const handleBatchAcceptDir = useCallback((dir: string) => {
    const changes = reviewChanges.filter((c) => {
      const lastSlash = c.filePath.lastIndexOf('/');
      const d = lastSlash >= 0 ? c.filePath.substring(0, lastSlash) : '.';
      return d === dir;
    });
    changes.forEach((c) => postMessage({ type: 'acceptChange', changeId: c.id }));
  }, [reviewChanges]);

  const handleBatchRejectDir = useCallback((dir: string) => {
    const changes = reviewChanges.filter((c) => {
      const lastSlash = c.filePath.lastIndexOf('/');
      const d = lastSlash >= 0 ? c.filePath.substring(0, lastSlash) : '.';
      return d === dir;
    });
    changes.forEach((c) => postMessage({ type: 'rejectChange', changeId: c.id }));
  }, [reviewChanges]);

  const handleFilterChange = useCallback((operation: string, status: string, query: string) => {
    postMessage({ type: 'filterReviewChanges', filter: { operation, status, query } });
  }, []);

  if (!reviewSession && reviewChanges.length === 0) {
    return null;
  }

  const statusBadge = reviewProgress.pending === 0
    ? { label: 'Complete', color: 'var(--vscode-testing-iconPassed)' }
    : { label: 'In Progress', color: 'var(--vscode-editorWarning-foreground)' };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: 'var(--vscode-editor-background)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px', borderBottom: '1px solid var(--vscode-panel-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vscode-foreground)' }}>
            Review Changes
          </span>
          <span style={{
            fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
            backgroundColor: statusBadge.color, color: '#fff', fontWeight: 600,
          }}>{statusBadge.label}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
            {reviewProgress.decided}/{reviewProgress.total} decided
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          height: '4px', borderRadius: '2px',
          backgroundColor: 'var(--vscode-textBlockQuote-background)',
          overflow: 'hidden', marginBottom: '4px',
        }}>
          <div style={{
            height: '100%', borderRadius: '2px',
            width: `${progressPct}%`,
            backgroundColor: 'var(--vscode-button-background)',
            transition: 'width 0.3s',
          }} />
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>
          <span>{reviewProgress.total} files</span>
          <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>{reviewProgress.accepted} accepted</span>
          <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>{reviewProgress.rejected} rejected</span>
          <span>{reviewProgress.pending} pending</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {/* Summary */}
        {(reviewSummary || isReviewSummaryLoading) && (
          <div style={{ marginBottom: '12px' }}>
            <ReviewSummaryCard
              summary={reviewSummary || { totalFiles: 0, additions: 0, deletions: 0 }}
              isLoading={isReviewSummaryLoading}
            />
          </div>
        )}

        {/* Filter bar */}
        <div style={{
          display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '10px',
          flexWrap: 'wrap',
        }}>
          <select
            value={filterOperation}
            onChange={(e) => {
              setFilterOperation(e.target.value);
              handleFilterChange(e.target.value, filterStatus, searchQuery);
            }}
            style={selectStyle}
          >
            {OPERATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              handleFilterChange(filterOperation, e.target.value, searchQuery);
            }}
            style={selectStyle}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleFilterChange(filterOperation, filterStatus, e.target.value);
            }}
            style={{
              ...selectStyle,
              flex: 1, minWidth: '120px',
            }}
          />

          {(filterOperation || filterStatus || searchQuery) && (
            <button
              onClick={() => {
                setFilterOperation('');
                setFilterStatus('');
                setSearchQuery('');
                handleFilterChange('', '', '');
              }}
              style={{
                padding: '4px 8px', fontSize: '10px',
                backgroundColor: 'transparent',
                color: 'var(--vscode-descriptionForeground)',
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '3px', cursor: 'pointer',
              }}
            >Clear</button>
          )}
        </div>

        {/* Changes tree grouped by directory */}
        {groupedChanges.length === 0 && (
          <div style={{
            padding: '20px', textAlign: 'center',
            color: 'var(--vscode-descriptionForeground)', fontSize: '12px',
          }}>
            {reviewChanges.length === 0
              ? 'No changes to review.'
              : 'No changes match the current filters.'}
          </div>
        )}

        {groupedChanges.map((group) => {
          const isDirCollapsed = collapsedDirs.has(group.directory);
          return (
            <div key={group.directory} style={{ marginBottom: '8px' }}>
              {/* Directory header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 6px', cursor: 'pointer',
                  backgroundColor: 'var(--vscode-textBlockQuote-background)',
                  borderRadius: '4px', marginBottom: '2px',
                }}
                onClick={() => toggleDir(group.directory)}
              >
                <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '10px' }}>
                  {isDirCollapsed ? '▸' : '▾'}
                </span>
                <span style={{ fontSize: '13px' }}>&#128193;</span>
                <span style={{
                  fontSize: '12px', fontWeight: 600,
                  color: 'var(--vscode-foreground)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{group.directory}</span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--vscode-descriptionForeground)' }}>
                  {group.stats.files} files
                </span>
                <span style={{ fontSize: '10px', fontFamily: 'monospace' }}>
                  <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>+{group.stats.additions}</span>
                  {'/'}
                  <span style={{ color: 'var(--vscode-testing-iconFailed)' }}>-{group.stats.deletions}</span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleBatchAcceptDir(group.directory); }}
                  title="Accept all in directory"
                  style={{
                    padding: '1px 6px', fontSize: '9px',
                    backgroundColor: 'var(--vscode-testing-iconPassed)', color: '#fff',
                    border: 'none', borderRadius: '3px', cursor: 'pointer',
                  }}
                >&#10003;</button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleBatchRejectDir(group.directory); }}
                  title="Reject all in directory"
                  style={{
                    padding: '1px 6px', fontSize: '9px',
                    backgroundColor: 'transparent', color: 'var(--vscode-testing-iconFailed)',
                    border: '1px solid var(--vscode-testing-iconFailed)',
                    borderRadius: '3px', cursor: 'pointer',
                  }}
                >&#10005;</button>
              </div>

              {/* Changes in directory */}
              {!isDirCollapsed && (
                <div style={{ paddingLeft: '12px' }}>
                  {group.changes.map((change) => (
                    <ReviewChangeCard
                      key={change.id}
                      change={change}
                      onAccept={handleAcceptChange}
                      onReject={handleRejectChange}
                      onToggle={handleToggleChange}
                      onShowDiff={handleShowDiff}
                      onUndo={handleUndoFile}
                      onAcceptHunk={handleAcceptHunk}
                      onRejectHunk={handleRejectHunk}
                      isExpanded={expandedCards.has(change.id)}
                      onToggleExpand={toggleExpand}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action bar */}
      <ReviewActionBar
        progress={reviewProgress}
        onAcceptAll={handleAcceptAll}
        onRejectAll={handleRejectAll}
        onUndoAll={handleUndoAll}
        onFinalize={handleFinalize}
        hasPending={reviewProgress.pending > 0}
      />

      {/* Undo confirmation dialog */}
      {showUndoDialog && (
        <UndoConfirmDialog
          scope={undoScope}
          filesAffected={undoFilesAffected}
          onConfirm={handleUndoConfirm}
          onCancel={handleUndoCancel}
        />
      )}
    </div>
  );
};

export default ReviewPanel;
