export interface GitRepoInfo {
  rootPath: string;
  isGitRepo: boolean;
  gitVersion: string | null;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitHash: string | null;
  lastCommitDate: Date | null;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  authorDate: Date;
  committer: string;
  committerDate: Date;
  message: string;
  subject: string;
  body: string;
  parents: string[];
  filesChanged: GitFileChange[];
  stats: { additions: number; deletions: number; filesChanged: number };
}

export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  additions: number;
  deletions: number;
  oldPath: string | null;
  similarity: number | null;
}

export enum GitFileStatus {
  ADDED = 'A',
  MODIFIED = 'M',
  DELETED = 'D',
  RENAMED = 'R',
  COPIED = 'C',
  UNTRACKED = '?',
  IGNORED = '!',
  TYPE_CHANGED = 'T',
}

export interface GitDiff {
  filePath: string;
  oldContent: string | null;
  newContent: string | null;
  hunks: GitDiffHunk[];
  stats: { additions: number; deletions: number };
  isBinary: boolean;
}

export interface GitDiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface GitBlame {
  filePath: string;
  lines: GitBlameLine[];
}

export interface GitBlameLine {
  lineNumber: number;
  hash: string;
  shortHash: string;
  author: string;
  authorEmail: string;
  date: Date;
  summary: string;
  content: string;
  isUncommitted: boolean;
}

export interface GitStash {
  index: number;
  message: string;
  branch: string;
  date: Date;
  hash: string;
}

export interface GitStatus {
  branch: GitBranch;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicts: string[];
  stashes: GitStash[];
  isClean: boolean;
  isMerging: boolean;
  isRebasing: boolean;
  isCherryPicking: boolean;
  isBisecting: boolean;
}

export interface GitRemote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitTag {
  name: string;
  hash: string;
  message: string | null;
  date: Date | null;
  isAnnotated: boolean;
}

export interface GitLogQuery {
  maxCount: number;
  author: string | null;
  since: Date | null;
  until: Date | null;
  path: string | null;
  grep: string | null;
  branch: string | null;
  merges: boolean | null;
  firstParent: boolean;
}

export interface GitPRContext {
  title: string | null;
  description: string | null;
  baseBranch: string;
  headBranch: string;
  commits: GitCommit[];
  filesChanged: GitFileChange[];
  diffStats: { additions: number; deletions: number; filesChanged: number };
  reviewComments: string[] | null;
}

export interface GitContextForAI {
  branch: string;
  recentCommits: GitCommit[];
  uncommittedChanges: GitFileChange[];
  currentFileDiff: GitDiff | null;
  currentFileBlame: GitBlameLine[] | null;
  prContext: GitPRContext | null;
  summary: string;
}

export type GitEvent = 'branch-changed' | 'commit' | 'status-changed' | 'stash-changed' | 'head-changed' | 'index-changed';

export const GIT_CONSTANTS = {
  MAX_DIFF_SIZE: 1048576,
  MAX_LOG_COUNT: 100,
  MAX_BLAME_LINES: 5000,
  POLL_INTERVAL_MS: 3000,
  COMMIT_SUMMARY_LENGTH: 72,
} as const;

export const DEFAULT_LOG_QUERY: GitLogQuery = {
  maxCount: 20,
  author: null,
  since: null,
  until: null,
  path: null,
  grep: null,
  branch: null,
  merges: null,
  firstParent: false,
};
