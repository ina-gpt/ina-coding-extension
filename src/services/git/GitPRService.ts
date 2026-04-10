import { GitBranchService } from './GitBranchService';
import { GitLogService } from './GitLogService';
import { GitDiffService } from './GitDiffService';
import { GitStatusService } from './GitStatusService';
import { GitCommandRunner } from './GitCommandRunner';
import { GitPRContext, GitCommit, GitFileChange } from './GitTypes';

export class GitPRService {
  private static instance: GitPRService;
  private branchService: GitBranchService;
  private logService: GitLogService;
  private diffService: GitDiffService;
  private runner: GitCommandRunner;

  static getInstance(): GitPRService {
    if (!GitPRService.instance) {
      GitPRService.instance = new GitPRService();
    }
    return GitPRService.instance;
  }

  private constructor() {
    this.branchService = GitBranchService.getInstance();
    this.logService = GitLogService.getInstance();
    this.diffService = GitDiffService.getInstance();
    this.runner = GitCommandRunner.getInstance();
  }

  async getPRContext(): Promise<GitPRContext | null> {
    try {
      const currentBranch = await this.branchService.getCurrentBranch();
      if (!currentBranch.name || currentBranch.name === 'main' || currentBranch.name === 'master') {
        return null;
      }

      const baseBranch = await this.detectBaseBranch();
      if (!baseBranch) return null;

      const commits = await this.getPRCommits(baseBranch);
      if (commits.length === 0) return null;

      const diffStats = await this.diffService.getDiffStats({ base: baseBranch, head: 'HEAD' });
      const filesChanged = await this.getPRFiles(baseBranch);
      const title = this.branchNameToTitle(currentBranch.name);

      return {
        title,
        description: null,
        baseBranch,
        headBranch: currentBranch.name,
        commits,
        filesChanged,
        diffStats,
        reviewComments: null,
      };
    } catch {
      return null;
    }
  }

  async getPRDiff(baseBranch?: string): Promise<any[]> {
    const base = baseBranch || await this.detectBaseBranch();
    if (!base) return [];
    return this.diffService.getBranchDiff(base);
  }

  async getPRFiles(baseBranch?: string): Promise<GitFileChange[]> {
    const base = baseBranch || await this.detectBaseBranch();
    if (!base) return [];

    const result = await this.runner.exec(['diff', '--name-status', `${base}...HEAD`]);
    return result.stdout.split('\n').filter(l => l.trim()).map(line => {
      const match = line.match(/^([AMDRC?!T])(\d*)\t(.+?)(?:\t(.+))?$/);
      if (!match) return null;
      return {
        path: match[4] || match[3],
        status: match[1] as any,
        additions: 0, deletions: 0,
        oldPath: match[4] ? match[3] : null,
        similarity: match[2] ? parseInt(match[2], 10) : null,
      };
    }).filter((f): f is GitFileChange => f !== null);
  }

  async getPRCommits(baseBranch?: string): Promise<GitCommit[]> {
    const base = baseBranch || await this.detectBaseBranch();
    if (!base) return [];
    return this.logService.getCommitsBetween(base, 'HEAD');
  }

  async detectBaseBranch(): Promise<string | null> {
    const candidates = ['main', 'master', 'develop', 'dev'];
    for (const candidate of candidates) {
      try {
        await this.runner.exec(['rev-parse', '--verify', candidate]);
        await this.runner.exec(['merge-base', candidate, 'HEAD']);
        return candidate;
      } catch {
        continue;
      }
    }
    return null;
  }

  formatPRForPrompt(pr: GitPRContext, maxTokens: number = 500): string {
    const lines: string[] = [];
    lines.push(`PR: ${pr.title || pr.headBranch}`);
    lines.push(`Branch: ${pr.headBranch} → ${pr.baseBranch}`);
    lines.push(`Commits: ${pr.commits.length}, Files changed: ${pr.diffStats.filesChanged}`);
    lines.push(`Stats: +${pr.diffStats.additions} / -${pr.diffStats.deletions}`);
    lines.push('');

    let tokens = 30;
    for (const c of pr.commits) {
      const line = `  ${c.shortHash} ${c.subject} (${c.author})`;
      tokens += Math.ceil(line.split(/\s+/).length * 1.3);
      if (tokens > maxTokens) break;
      lines.push(line);
    }

    return lines.join('\n');
  }

  private branchNameToTitle(branchName: string): string {
    const cleaned = branchName
      .replace(/^(feature|fix|bugfix|hotfix|chore|refactor|docs|test)\//, '')
      .replace(/^\d+-/, '')
      .replace(/[-_]/g, ' ')
      .trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
}
