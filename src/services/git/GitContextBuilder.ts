import * as vscode from 'vscode';
import { GitBranchService } from './GitBranchService';
import { GitLogService } from './GitLogService';
import { GitStatusService } from './GitStatusService';
import { GitDiffService } from './GitDiffService';
import { GitBlameService } from './GitBlameService';
import { GitPRService } from './GitPRService';
import { GitContextForAI, GitDiff, GitBlameLine } from './GitTypes';
import { SensitiveFileDetector } from '../codesec/SensitiveFileDetector';
import { CodeSecurityGate } from '../codesec/CodeSecurityGate';

export class GitContextBuilder {
  private static instance: GitContextBuilder;
  private branchService: GitBranchService;
  private logService: GitLogService;
  private statusService: GitStatusService;
  private diffService: GitDiffService;
  private blameService: GitBlameService;
  private prService: GitPRService;

  static getInstance(): GitContextBuilder {
    if (!GitContextBuilder.instance) {
      GitContextBuilder.instance = new GitContextBuilder();
    }
    return GitContextBuilder.instance;
  }

  private constructor() {
    this.branchService = GitBranchService.getInstance();
    this.logService = GitLogService.getInstance();
    this.statusService = GitStatusService.getInstance();
    this.diffService = GitDiffService.getInstance();
    this.blameService = GitBlameService.getInstance();
    this.prService = GitPRService.getInstance();
  }

  async buildFullContext(options?: { includeBlame?: boolean; includePR?: boolean; maxTokens?: number }): Promise<GitContextForAI> {
    const [branch, commits, status] = await Promise.all([
      this.branchService.getCurrentBranch(),
      this.logService.getLog({ maxCount: 5 }),
      this.statusService.getStatus(),
    ]);

    const allUncommittedChanges = [...status.staged, ...status.unstaged];

    // Filter out sensitive files from context sent to AI
    const detector = SensitiveFileDetector.getInstance();
    const uncommittedChanges = allUncommittedChanges.filter(c => !detector.isSensitiveFile(c.path));

    let currentFileDiff: GitDiff | null = null;
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const isChanged = uncommittedChanges.some(c => c.path === filePath);
      if (isChanged) {
        try { currentFileDiff = await this.diffService.getFileDiff(filePath); } catch { /* no diff */ }
      }
    }

    let currentFileBlame: GitBlameLine[] | null = null;
    if (options?.includeBlame && editor) {
      try {
        const filePath = vscode.workspace.asRelativePath(editor.document.uri);
        const blame = await this.blameService.getBlame(filePath);
        currentFileBlame = blame.lines;
      } catch { /* no blame */ }
    }

    let prContext = null;
    if (options?.includePR !== false) {
      try { prContext = await this.prService.getPRContext(); } catch { /* no PR */ }
    }

    const aheadBehind = branch.ahead > 0 || branch.behind > 0
      ? `, ${branch.ahead} ahead / ${branch.behind} behind ${branch.upstream || 'upstream'}`
      : '';
    const lastCommit = commits.length > 0 ? `. Last commit: ${commits[0].subject}` : '';
    const changesStr = uncommittedChanges.length > 0 ? `${uncommittedChanges.length} uncommitted changes` : 'clean working tree';
    const summary = `On branch ${branch.name}${aheadBehind}. ${changesStr}${lastCommit}`;

    return {
      branch: branch.name,
      recentCommits: commits,
      uncommittedChanges,
      currentFileDiff,
      currentFileBlame,
      prContext,
      summary,
    };
  }

  async buildContextForFile(filePath: string): Promise<GitContextForAI> {
    const [branch, commits, fileDiff] = await Promise.all([
      this.branchService.getCurrentBranch(),
      this.logService.getFileLog(filePath, 5),
      this.diffService.getFileDiff(filePath).catch(() => null),
    ]);

    let blame: GitBlameLine[] | null = null;
    try {
      const result = await this.blameService.getBlame(filePath);
      blame = result.lines;
    } catch { /* no blame */ }

    const summary = `File: ${filePath} on branch ${branch.name}. ${commits.length > 0 ? `Last modified: ${commits[0].subject} by ${commits[0].author}` : 'No commit history for this file'}`;

    return {
      branch: branch.name,
      recentCommits: commits,
      uncommittedChanges: [],
      currentFileDiff: fileDiff,
      currentFileBlame: blame,
      prContext: null,
      summary,
    };
  }

  async buildContextForSelection(filePath: string, startLine: number, endLine: number): Promise<{ blame: GitBlameLine[]; recentEditors: string[]; lastModified: Date }> {
    const blame = await this.blameService.getRangeBlame(filePath, startLine, endLine);
    const editors = [...new Set(blame.map(l => l.author))];
    const lastModified = blame.reduce((latest, l) => l.date > latest ? l.date : latest, new Date(0));
    return { blame, recentEditors: editors, lastModified };
  }

  formatForPrompt(context: GitContextForAI, maxTokens: number = 500): string {
    let output = '<git_context>\n';
    let tokens = 5;

    const branchLine = `  <branch name="${context.branch}" />\n`;
    output += branchLine;
    tokens += 10;

    if (context.recentCommits.length > 0) {
      output += '  <recent_commits>\n';
      for (const c of context.recentCommits) {
        const line = `    <commit hash="${c.shortHash}" author="${c.author}">${c.subject}</commit>\n`;
        const lineTokens = Math.ceil(line.split(/\s+/).length * 1.3);
        if (tokens + lineTokens > maxTokens) break;
        output += line;
        tokens += lineTokens;
      }
      output += '  </recent_commits>\n';
    }

    if (context.uncommittedChanges.length > 0 && tokens < maxTokens - 50) {
      output += '  <uncommitted_changes>\n';
      for (const f of context.uncommittedChanges.slice(0, 10)) {
        output += `    <file status="${f.status}" path="${f.path}" />\n`;
        tokens += 8;
        if (tokens > maxTokens) break;
      }
      output += '  </uncommitted_changes>\n';
    }

    if (context.currentFileDiff && tokens < maxTokens - 100) {
      const diffStr = this.diffService.formatDiffForPrompt([context.currentFileDiff], maxTokens - tokens);
      output += `  <current_file_diff>\n${diffStr}\n  </current_file_diff>\n`;
    }

    if (context.prContext && tokens < maxTokens - 50) {
      output += `  <pr branch="${context.prContext.headBranch}" base="${context.prContext.baseBranch}" commits="${context.prContext.commits.length}" files="${context.prContext.diffStats.filesChanged}">\n`;
      output += `    ${context.prContext.title || context.prContext.headBranch}\n`;
      output += '  </pr>\n';
    }

    output += '</git_context>';
    return output;
  }

  formatCompactSummary(context: GitContextForAI): string {
    const parts: string[] = [`branch: ${context.branch}`];
    if (context.uncommittedChanges.length > 0) {
      parts.push(`${context.uncommittedChanges.length} uncommitted files`);
    }
    if (context.recentCommits.length > 0) {
      const c = context.recentCommits[0];
      const diff = Date.now() - c.authorDate.getTime();
      const hours = Math.floor(diff / 3600000);
      const timeStr = hours < 1 ? 'just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
      parts.push(`last commit: ${c.subject.slice(0, 50)} (${timeStr})`);
    }
    return parts.join(', ');
  }
}
