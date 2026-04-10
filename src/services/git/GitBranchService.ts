import { GitCommandRunner } from './GitCommandRunner';
import { GitBranch } from './GitTypes';

export class GitBranchService {
  private static instance: GitBranchService;
  private runner: GitCommandRunner;

  static getInstance(): GitBranchService {
    if (!GitBranchService.instance) {
      GitBranchService.instance = new GitBranchService();
    }
    return GitBranchService.instance;
  }

  private constructor() {
    this.runner = GitCommandRunner.getInstance();
  }

  async getCurrentBranch(): Promise<GitBranch> {
    let name: string;
    try {
      const result = await this.runner.exec(['symbolic-ref', '--short', 'HEAD']);
      name = result.stdout.trim();
    } catch {
      const result = await this.runner.exec(['rev-parse', '--short', 'HEAD']);
      name = `(detached ${result.stdout.trim()})`;
    }

    const { ahead, behind } = await this.getUpstreamStatus();
    let upstream: string | null = null;
    try {
      const upResult = await this.runner.execSafe(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
      upstream = upResult?.trim() || null;
    } catch { /* no upstream */ }

    let lastCommitHash: string | null = null;
    let lastCommitDate: Date | null = null;
    try {
      const logResult = await this.runner.exec(['log', '-1', '--format=%H %aI']);
      const parts = logResult.stdout.trim().split(' ');
      lastCommitHash = parts[0] || null;
      lastCommitDate = parts[1] ? new Date(parts[1]) : null;
    } catch { /* empty repo */ }

    return {
      name,
      isCurrent: true,
      isRemote: false,
      upstream,
      ahead,
      behind,
      lastCommitHash,
      lastCommitDate,
    };
  }

  async listBranches(includeRemote?: boolean): Promise<GitBranch[]> {
    const args = ['branch', '--format=%(refname:short)|%(objectname:short)|%(upstream:short)|%(upstream:track)'];
    if (includeRemote) args.splice(1, 0, '-a');

    const result = await this.runner.exec(args);
    if (!result.stdout.trim()) return [];

    const currentResult = await this.runner.execSafe(['symbolic-ref', '--short', 'HEAD']);
    const currentBranch = currentResult?.trim() || '';

    return result.stdout.split('\n').filter(l => l.trim()).map(line => {
      const [name, hash, upstream, track] = line.split('|');
      let ahead = 0, behind = 0;
      if (track) {
        const aheadMatch = track.match(/ahead (\d+)/);
        const behindMatch = track.match(/behind (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
      }
      return {
        name: name.trim(),
        isCurrent: name.trim() === currentBranch,
        isRemote: name.includes('/'),
        upstream: upstream?.trim() || null,
        ahead,
        behind,
        lastCommitHash: hash?.trim() || null,
        lastCommitDate: null,
      };
    });
  }

  async getUpstreamStatus(): Promise<{ ahead: number; behind: number }> {
    try {
      const result = await this.runner.exec(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
      const [ahead, behind] = result.stdout.trim().split(/\s+/).map(Number);
      return { ahead: ahead || 0, behind: behind || 0 };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  async switchBranch(branchName: string): Promise<void> {
    await this.runner.exec(['checkout', branchName]);
  }

  async getRecentBranches(count: number = 10): Promise<GitBranch[]> {
    const result = await this.runner.execSafe(['reflog', 'show', '--format=%gs']);
    if (!result) return [];

    const branches = new Set<string>();
    for (const line of result.split('\n')) {
      const match = line.match(/checkout: moving from .+ to (.+)/);
      if (match && !match[1].includes(' ')) {
        branches.add(match[1]);
        if (branches.size >= count) break;
      }
    }

    return [...branches].map(name => ({
      name,
      isCurrent: false,
      isRemote: false,
      upstream: null,
      ahead: 0,
      behind: 0,
      lastCommitHash: null,
      lastCommitDate: null,
    }));
  }

  async getBranchMergeBase(branch1: string, branch2: string): Promise<string> {
    const result = await this.runner.exec(['merge-base', branch1, branch2]);
    return result.stdout.trim();
  }
}
