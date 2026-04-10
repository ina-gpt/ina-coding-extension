import React, { useEffect, useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { GitChangesView } from './GitChangesView';
import { GitCommitLog } from './GitCommitLog';
import { GitPRSummary } from './GitPRSummary';
import { postMessage } from '../../utils/vscode';

export const GitPanel: React.FC = () => {
  const { gitStatus, gitCommitLog, gitPR, gitBranchName, isGitLoading } = useChatStore();
  const [activeSection, setActiveSection] = useState<'changes' | 'log' | 'pr'>('changes');

  useEffect(() => {
    postMessage({ type: 'requestGitStatus' } as any);
    postMessage({ type: 'requestGitLog' } as any);
    postMessage({ type: 'requestGitPR' } as any);
  }, []);

  const handleSwitchBranch = () => { postMessage({ type: 'switchBranch' } as any); };
  const handleStage = (path: string) => { postMessage({ type: 'stageFile', path } as any); };
  const handleUnstage = (path: string) => { postMessage({ type: 'unstageFile', path } as any); };
  const handleStageAll = () => { postMessage({ type: 'stageAll' } as any); };
  const handleOpenDiff = (path: string) => { postMessage({ type: 'openGitDiff', path } as any); };
  const handleLoadMore = () => { postMessage({ type: 'requestGitLog', offset: gitCommitLog.length } as any); };

  return (
    <div className="git-panel">
      {/* Branch Section */}
      <div className="git-section">
        <div className="git-section-title">BRANCH</div>
        <div className="git-branch-info">
          <span className="git-branch-name">{gitBranchName || gitStatus?.branch?.name || '---'}</span>
          <button className="git-btn git-btn-sm" onClick={handleSwitchBranch}>Switch</button>
        </div>
        {gitStatus?.branch && (gitStatus.branch.ahead > 0 || gitStatus.branch.behind > 0) && (
          <div className="git-upstream">
            <span className="git-badge git-badge-ahead">↑{gitStatus.branch.ahead}</span>
            <span className="git-badge git-badge-behind">↓{gitStatus.branch.behind}</span>
            {gitStatus.branch.upstream && <span className="git-upstream-name">{gitStatus.branch.upstream}</span>}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="git-tabs">
        <button className={`git-tab ${activeSection === 'changes' ? 'active' : ''}`} onClick={() => setActiveSection('changes')}>
          Changes {gitStatus && !gitStatus.isClean && `(${(gitStatus.staged?.length || 0) + (gitStatus.unstaged?.length || 0) + (gitStatus.untracked?.length || 0)})`}
        </button>
        <button className={`git-tab ${activeSection === 'log' ? 'active' : ''}`} onClick={() => setActiveSection('log')}>
          Commits {gitCommitLog.length > 0 && `(${gitCommitLog.length})`}
        </button>
        {gitPR && (
          <button className={`git-tab ${activeSection === 'pr' ? 'active' : ''}`} onClick={() => setActiveSection('pr')}>
            PR
          </button>
        )}
      </div>

      {/* Changes */}
      {activeSection === 'changes' && gitStatus && (
        <GitChangesView
          staged={gitStatus.staged || []}
          unstaged={gitStatus.unstaged || []}
          untracked={gitStatus.untracked || []}
          onStage={handleStage}
          onUnstage={handleUnstage}
          onOpenDiff={handleOpenDiff}
          onStageAll={handleStageAll}
        />
      )}

      {/* Commit Log */}
      {activeSection === 'log' && (
        <GitCommitLog
          commits={gitCommitLog}
          onLoadMore={handleLoadMore}
          hasMore={gitCommitLog.length >= 10}
        />
      )}

      {/* PR Context */}
      {activeSection === 'pr' && gitPR && (
        <GitPRSummary pr={gitPR} />
      )}

      {/* Stashes */}
      {gitStatus?.stashes && gitStatus.stashes.length > 0 && (
        <div className="git-section">
          <div className="git-section-title">STASHES ({gitStatus.stashes.length})</div>
          {gitStatus.stashes.map((s: any, i: number) => (
            <div key={i} className="git-stash-item">
              <span className="git-stash-ref">stash@{`{${s.index}}`}</span>
              <span className="git-stash-msg">{s.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
