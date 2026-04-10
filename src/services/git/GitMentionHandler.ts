import * as vscode from 'vscode';
import { GitContextBuilder } from './GitContextBuilder';
import { GitStatusService } from './GitStatusService';
import { GitLogService } from './GitLogService';
import { GitBlameService } from './GitBlameService';
import { GitDiffService } from './GitDiffService';
import { GitPRService } from './GitPRService';
import { GitBranchService } from './GitBranchService';
import { GitStatus, GitCommit, GitBlame } from './GitTypes';
import { Logger } from '../../utils/Logger';

export interface GitMentionSuggestion {
  type: string;
  value: string;
  displayName: string;
  description?: string;
  icon: string;
  insertText: string;
  sortOrder: number;
}

export class GitMentionHandler {
  private static instance: GitMentionHandler;
  private contextBuilder: GitContextBuilder;
  private statusService: GitStatusService;
  private logService: GitLogService;
  private blameService: GitBlameService;
  private diffService: GitDiffService;
  private prService: GitPRService;
  private branchService: GitBranchService;

  static getInstance(): GitMentionHandler {
    if (!GitMentionHandler.instance) {
      GitMentionHandler.instance = new GitMentionHandler();
    }
    return GitMentionHandler.instance;
  }

  private constructor() {
    this.contextBuilder = GitContextBuilder.getInstance();
    this.statusService = GitStatusService.getInstance();
    this.logService = GitLogService.getInstance();
    this.blameService = GitBlameService.getInstance();
    this.diffService = GitDiffService.getInstance();
    this.prService = GitPRService.getInstance();
    this.branchService = GitBranchService.getInstance();
  }

  async resolveMention(mention: { type: string; value: string }): Promise<string> {
    if (mention.type !== 'git') return '';

    const value = mention.value || '';
    const parts = value.split(':').filter(Boolean);
    const subCommand = parts[0] || '';
    const arg = parts.slice(1).join(':');

    try {
      switch (subCommand) {
        case '':
        case 'status': return this.formatGitStatus(await this.statusService.getStatus(true));
        case 'diff': {
          if (arg) {
            const diff = await this.diffService.getFileDiff(arg);
            return this.diffService.formatDiffForPrompt([diff], 2000);
          }
          const diffs = await this.diffService.getDiff();
          return this.diffService.formatDiffForPrompt(diffs, 2000);
        }
        case 'log': {
          const count = arg ? parseInt(arg, 10) || 10 : 10;
          const commits = await this.logService.getLog({ maxCount: count });
          return this.formatGitLog(commits);
        }
        case 'blame': {
          const filePath = arg || this.getCurrentFilePath();
          if (!filePath) return '[No file open for blame]';
          const blame = await this.blameService.getBlame(filePath);
          return this.formatGitBlame(blame);
        }
        case 'branch': {
          const branch = await this.branchService.getCurrentBranch();
          const branches = await this.branchService.listBranches();
          return `Current: ${branch.name} (ahead: ${branch.ahead}, behind: ${branch.behind})\nUpstream: ${branch.upstream || 'none'}\n\nAll branches:\n${branches.map(b => `  ${b.isCurrent ? '* ' : '  '}${b.name}`).join('\n')}`;
        }
        case 'stash': {
          const stashes = await this.statusService.getStashes();
          if (stashes.length === 0) return 'No stashes.';
          return stashes.map(s => `stash@{${s.index}}: ${s.message}`).join('\n');
        }
        case 'pr': {
          const pr = await this.prService.getPRContext();
          if (!pr) return '[Not on a feature branch or no commits ahead of base]';
          return this.prService.formatPRForPrompt(pr, 1000);
        }
        case 'staged': {
          const staged = await this.diffService.getDiff({ staged: true });
          if (staged.length === 0) return 'No staged changes.';
          return this.diffService.formatDiffForPrompt(staged, 2000);
        }
        default:
          return `[Unknown git command: ${subCommand}]`;
      }
    } catch (error) {
      Logger.error(`Git mention resolution failed for "${value}":`, error);
      return `[Git error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
  }

  async getSuggestions(partial: string): Promise<GitMentionSuggestion[]> {
    const suggestions: GitMentionSuggestion[] = [
      { type: 'git', value: 'git:status', displayName: 'Git Status', description: 'Current repository status', icon: '$(git-branch)', insertText: '@git:status ', sortOrder: 0 },
      { type: 'git', value: 'git:diff', displayName: 'Git Diff', description: 'Uncommitted changes', icon: '$(diff)', insertText: '@git:diff ', sortOrder: 1 },
      { type: 'git', value: 'git:log', displayName: 'Git Log', description: 'Recent commits', icon: '$(history)', insertText: '@git:log ', sortOrder: 2 },
      { type: 'git', value: 'git:blame', displayName: 'Git Blame', description: 'File authorship', icon: '$(person)', insertText: '@git:blame ', sortOrder: 3 },
      { type: 'git', value: 'git:branch', displayName: 'Git Branch', description: 'Branch information', icon: '$(git-branch)', insertText: '@git:branch ', sortOrder: 4 },
      { type: 'git', value: 'git:stash', displayName: 'Git Stash', description: 'Stashed changes', icon: '$(archive)', insertText: '@git:stash ', sortOrder: 5 },
      { type: 'git', value: 'git:pr', displayName: 'Git PR Context', description: 'Pull request context', icon: '$(git-pull-request)', insertText: '@git:pr ', sortOrder: 6 },
      { type: 'git', value: 'git:staged', displayName: 'Git Staged', description: 'Staged changes', icon: '$(diff-added)', insertText: '@git:staged ', sortOrder: 7 },
    ];

    if (partial) {
      return suggestions.filter(s =>
        s.displayName.toLowerCase().includes(partial.toLowerCase()) ||
        s.value.toLowerCase().includes(partial.toLowerCase())
      );
    }

    if (partial.startsWith('diff:') || partial.startsWith('blame:')) {
      try {
        const status = await this.statusService.getStatus();
        const files = [...status.staged, ...status.unstaged].map(f => f.path);
        const prefix = partial.startsWith('diff:') ? 'diff' : 'blame';
        const fileQuery = partial.slice(prefix.length + 1);
        const filtered = files.filter(f => !fileQuery || f.toLowerCase().includes(fileQuery.toLowerCase()));

        for (const file of filtered.slice(0, 10)) {
          suggestions.push({
            type: 'git',
            value: `git:${prefix}:${file}`,
            displayName: file,
            description: `${prefix} for ${file}`,
            icon: '$(file)',
            insertText: `@git:${prefix}:${file} `,
            sortOrder: 10,
          });
        }
      } catch { /* ignore */ }
    }

    return suggestions;
  }

  private formatGitStatus(status: GitStatus): string {
    const lines: string[] = [];
    lines.push(`Branch: ${status.branch.name}`);
    if (status.branch.upstream) {
      lines.push(`Upstream: ${status.branch.upstream} (ahead: ${status.branch.ahead}, behind: ${status.branch.behind})`);
    }
    lines.push('');

    if (status.staged.length > 0) {
      lines.push(`Staged (${status.staged.length}):`);
      for (const f of status.staged) lines.push(`  ${f.status} ${f.path}`);
    }
    if (status.unstaged.length > 0) {
      lines.push(`Unstaged (${status.unstaged.length}):`);
      for (const f of status.unstaged) lines.push(`  ${f.status} ${f.path}`);
    }
    if (status.untracked.length > 0) {
      lines.push(`Untracked (${status.untracked.length}):`);
      for (const f of status.untracked) lines.push(`  ? ${f}`);
    }
    if (status.conflicts.length > 0) {
      lines.push(`Conflicts (${status.conflicts.length}):`);
      for (const f of status.conflicts) lines.push(`  U ${f}`);
    }
    if (status.isClean) lines.push('Working tree clean.');
    return lines.join('\n');
  }

  private formatGitLog(commits: GitCommit[]): string {
    return commits.map(c => {
      const date = c.authorDate.toISOString().slice(0, 10);
      return `${c.shortHash} ${date} ${c.author}: ${c.subject}`;
    }).join('\n');
  }

  private formatGitBlame(blame: GitBlame): string {
    return blame.lines.slice(0, 100).map(l => {
      const author = l.isUncommitted ? 'uncommitted' : l.author.slice(0, 15).padEnd(15);
      return `${String(l.lineNumber).padStart(4)} ${l.shortHash} ${author} ${l.content}`;
    }).join('\n');
  }

  private getCurrentFilePath(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    return vscode.workspace.asRelativePath(editor.document.uri);
  }
}
