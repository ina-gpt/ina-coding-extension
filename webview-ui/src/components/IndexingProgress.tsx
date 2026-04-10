import React, { useState, useEffect, memo, useCallback } from 'react';
import {
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Zap,
  HardDrive,
} from 'lucide-react';
import { onMessage, postMessage } from '@/utils/vscode';
import clsx from 'clsx';

// ============ Types ============

interface IndexingJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: {
    total: number;
    completed: number;
    failed: number;
    cached: number;
    percentage: number;
    estimatedRemaining?: number;
  };
  error?: string;
  file?: string;
}

interface IndexingStats {
  totalIndexed: number;
  totalFailed: number;
  lastFullScan: number | null;
  averageIndexTime: number;
}

// ============ Progress Bar Component ============

interface ProgressBarProps {
  percentage: number;
  completed: number;
  total: number;
  cached: number;
  failed: number;
  showDetails?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = memo(({
  percentage,
  completed,
  total,
  cached,
  failed,
  showDetails = true,
}) => {
  const successWidth = total > 0 ? ((completed - cached) / total) * 100 : 0;
  const cachedWidth = total > 0 ? (cached / total) * 100 : 0;
  const failedWidth = total > 0 ? (failed / total) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="h-2 bg-[var(--vscode-progressBar-background)] rounded-full overflow-hidden">
        <div className="h-full flex">
          <div
            className="bg-[var(--ina-status-info,#3b82f6)] transition-all duration-300"
            style={{ width: `${cachedWidth}%` }}
          />
          <div
            className="bg-[var(--ina-status-success,#22c55e)] transition-all duration-300"
            style={{ width: `${successWidth}%` }}
          />
          <div
            className="bg-[var(--ina-status-error,#ef4444)] transition-all duration-300"
            style={{ width: `${failedWidth}%` }}
          />
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="flex items-center justify-between text-xs text-[var(--vscode-descriptionForeground)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[var(--ina-status-success,#22c55e)]" />
              {completed - cached} embedded
            </span>
            {cached > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--ina-status-info,#3b82f6)]" />
                {cached} cached
              </span>
            )}
            {failed > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[var(--ina-status-error,#ef4444)]" />
                {failed} failed
              </span>
            )}
          </div>
          <span>{percentage}%</span>
        </div>
      )}
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';

// ============ Time Estimate Component ============

interface TimeEstimateProps {
  estimatedRemaining?: number;
}

const TimeEstimate: React.FC<TimeEstimateProps> = memo(({ estimatedRemaining }) => {
  if (!estimatedRemaining) return null;

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m remaining`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s remaining`;
    } else {
      return `${seconds}s remaining`;
    }
  };

  return (
    <span className="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)]">
      <Clock size={12} />
      {formatTime(estimatedRemaining)}
    </span>
  );
});

TimeEstimate.displayName = 'TimeEstimate';

// ============ Job Card Component ============

interface JobCardProps {
  job: IndexingJob;
  onCancel: () => void;
  onRetry: () => void;
}

const JobCard: React.FC<JobCardProps> = memo(({ job, onCancel, onRetry }) => {
  const [expanded, setExpanded] = useState(false);

  const statusIcons = {
    pending: <Loader2 size={16} className="animate-spin text-[var(--ina-status-warning,#facc15)]" />,
    processing: <Loader2 size={16} className="animate-spin text-[var(--ina-status-info,#60a5fa)]" />,
    completed: <CheckCircle2 size={16} className="text-[var(--ina-status-success,#4ade80)]" />,
    failed: <XCircle size={16} className="text-[var(--ina-status-error,#f87171)]" />,
    cancelled: <XCircle size={16} className="text-gray-400" />,
  };

  const statusLabels = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  };

  return (
    <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {statusIcons[job.status]}
          <span className="font-medium text-sm">{statusLabels[job.status]}</span>
          {job.file && (
            <span className="text-xs text-[var(--vscode-descriptionForeground)] truncate max-w-[150px]">
              {job.file}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            {job.progress.completed}/{job.progress.total}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Progress */}
      {(job.status === 'processing' || job.status === 'completed') && (
        <div className="px-3 pb-2">
          <ProgressBar {...job.progress} showDetails={false} />
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-[var(--vscode-panel-border)]">
          <div className="space-y-2">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[var(--vscode-descriptionForeground)]">Total chunks:</span>
                <span className="ml-1">{job.progress.total}</span>
              </div>
              <div>
                <span className="text-[var(--vscode-descriptionForeground)]">Completed:</span>
                <span className="ml-1">{job.progress.completed}</span>
              </div>
              <div>
                <span className="text-[var(--vscode-descriptionForeground)]">From cache:</span>
                <span className="ml-1">{job.progress.cached}</span>
              </div>
              <div>
                <span className="text-[var(--vscode-descriptionForeground)]">Failed:</span>
                <span className="ml-1 text-[var(--ina-status-error,#f87171)]">{job.progress.failed}</span>
              </div>
            </div>

            {/* Time estimate */}
            {job.status === 'processing' && job.progress.estimatedRemaining && (
              <TimeEstimate estimatedRemaining={job.progress.estimatedRemaining} />
            )}

            {/* Error message */}
            {job.error && (
              <div className="text-xs text-[var(--ina-status-error,#f87171)] bg-[var(--ina-status-error-bg,rgba(239,68,68,0.1))] p-2 rounded">
                {job.error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {job.status === 'processing' && (
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--ina-status-error-bg,rgba(239,68,68,0.2))] text-[var(--ina-status-error,#f87171)] rounded hover:bg-[var(--ina-status-error-bg,rgba(239,68,68,0.3))] transition-colors"
                >
                  <XCircle size={12} />
                  Cancel
                </button>
              )}
              {job.status === 'failed' && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--ina-status-info-bg,rgba(59,130,246,0.2))] text-[var(--ina-status-info,#60a5fa)] rounded hover:bg-[var(--ina-status-info,#3b82f6)]/30 transition-colors"
                >
                  <RefreshCw size={12} />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

JobCard.displayName = 'JobCard';

// ============ Main Component ============

export const IndexingProgress: React.FC = () => {
  const [jobs, setJobs] = useState<IndexingJob[]>([]);
  const [stats, setStats] = useState<IndexingStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  // Listen for messages from extension
  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case 'indexingJobUpdate':
          setJobs(prev => {
            const job = (message as any).job as IndexingJob;
            const index = prev.findIndex(j => j.jobId === job.jobId);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = job;
              return updated;
            }
            return [...prev, job];
          });
          break;

        case 'indexingJobRemove':
          setJobs(prev => prev.filter(j => j.jobId !== (message as any).jobId));
          break;

        case 'indexingStats':
          setStats((message as any).stats);
          break;

        case 'indexingPaused':
          setIsPaused((message as any).paused);
          break;
      }
    });

    // Request initial state
    postMessage({ type: 'getIndexingStatus' });

    return unsubscribe;
  }, []);

  const handleCancel = useCallback((jobId: string) => {
    postMessage({ type: 'cancelIndexingJob', jobId });
  }, []);

  const handleRetry = useCallback((jobId: string) => {
    postMessage({ type: 'retryIndexingJob', jobId });
  }, []);

  const handlePauseResume = useCallback(() => {
    postMessage({ type: isPaused ? 'resumeIndexing' : 'pauseIndexing' });
  }, [isPaused]);

  const handleIndexNow = useCallback(() => {
    postMessage({ type: 'startIndexing' });
  }, []);

  // Calculate aggregate progress
  const activeJobs = jobs.filter(j => j.status === 'processing' || j.status === 'pending');
  const totalProgress = activeJobs.reduce((acc, job) => ({
    total: acc.total + job.progress.total,
    completed: acc.completed + job.progress.completed,
    cached: acc.cached + job.progress.cached,
    failed: acc.failed + job.progress.failed,
  }), { total: 0, completed: 0, cached: 0, failed: 0 });

  const overallPercentage = totalProgress.total > 0
    ? Math.round((totalProgress.completed / totalProgress.total) * 100)
    : 0;

  const hasActiveJobs = activeJobs.length > 0;

  return (
    <div className="bg-[var(--vscode-sideBar-background)] border border-[var(--vscode-panel-border)] rounded-lg">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Database size={16} className="text-[var(--vscode-textLink-foreground)]" />
          <span className="font-medium text-sm">Codebase Indexing</span>
          {hasActiveJobs && (
            <span className="text-xs bg-[var(--ina-status-info-bg,rgba(59,130,246,0.2))] text-[var(--ina-status-info,#60a5fa)] px-1.5 py-0.5 rounded">
              {activeJobs.length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveJobs && (
            <span className="text-xs text-[var(--vscode-descriptionForeground)]">
              {overallPercentage}%
            </span>
          )}
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* Overall progress bar */}
      {hasActiveJobs && (
        <div className="px-3 pb-2">
          <ProgressBar
            percentage={overallPercentage}
            completed={totalProgress.completed}
            total={totalProgress.total}
            cached={totalProgress.cached}
            failed={totalProgress.failed}
            showDetails={false}
          />
        </div>
      )}

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[var(--vscode-panel-border)] p-3 space-y-3">
          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleIndexNow}
              disabled={hasActiveJobs}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors',
                hasActiveJobs
                  ? 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] opacity-50 cursor-not-allowed'
                  : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
              )}
            >
              <Zap size={12} />
              Index Now
            </button>

            {hasActiveJobs && (
              <button
                onClick={handlePauseResume}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] rounded hover:opacity-80 transition-opacity"
              >
                {isPaused ? <Play size={12} /> : <Pause size={12} />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            )}
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <HardDrive size={12} className="text-[var(--vscode-descriptionForeground)]" />
                <span className="text-[var(--vscode-descriptionForeground)]">Indexed:</span>
                <span>{stats.totalIndexed.toLocaleString()}</span>
              </div>
              {stats.lastFullScan && (
                <div className="flex items-center gap-1">
                  <Clock size={12} className="text-[var(--vscode-descriptionForeground)]" />
                  <span className="text-[var(--vscode-descriptionForeground)]">Last scan:</span>
                  <span>{new Date(stats.lastFullScan).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Job list */}
          {jobs.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[var(--vscode-descriptionForeground)]">
                Jobs ({jobs.length})
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {jobs.map(job => (
                  <JobCard
                    key={job.jobId}
                    job={job}
                    onCancel={() => handleCancel(job.jobId)}
                    onRetry={() => handleRetry(job.jobId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {jobs.length === 0 && !stats?.totalIndexed && (
            <div className="text-center py-4 text-sm text-[var(--vscode-descriptionForeground)]">
              <Database size={32} className="mx-auto mb-2 opacity-50" />
              <p>No indexing activity yet.</p>
              <p className="text-xs">Click "Index Now" to start.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IndexingProgress;
