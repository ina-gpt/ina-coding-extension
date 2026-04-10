import { EventEmitter } from 'events';
import { GitCommandRunner } from './GitCommandRunner';
import { GitBranch, GitFileChange, GitFileStatus, GitStatus, GitStash } from './GitTypes';
import { GitBranchService } from './GitBranchService';

export class GitStatusService extends EventEmitter {
  private static instance: GitStatusService;
  private runner: GitCommandRunner;
  private branchService: GitBranchService;
  private cachedStatus: GitStatus | null = null;
  private cacheTimestamp: number = 0;
  private CACHE_TTL: number = 2000;

  static getInstance(): GitStatusService {
    if (!GitStatusService.instance) {
      GitStatusService.instance = new GitStatusService();
    }
    return GitStatusService.instance;
  }

  private constructor() {
    super();
    this.runner = GitCommandRunner.getInstance();
    this.branchService = GitBranchService.getInstance();
  }

  async getStatus(force?: boolean): Promise<GitStatus> {
    if (!force && this.cachedStatus && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cachedStatus;
    }

    const result = await this.runner.exec(['status', '--porcelain=v2', '--branch']);
    const status = this.parseStatusV2(result.stdout);

    const stashes = await this.getStashes();
    status.stashes = stashes;

    this.cachedStatus = status;
    this.cacheTimestamp = Date.now();
    return status;
  }

  async getStagedChanges(): Promise<GitFileChange[]> {
    const result = await this.runner.exec(['diff', '--cached', '--name-status']);
    return this.parseNameStatus(result.stdout);
  }

  async getUnstagedChanges(): Promise<GitFileChange[]> {
    const result = await this.runner.exec(['diff', '--name-status']);
    return this.parseNameStatus(result.stdout);
  }

  async getUntrackedFiles(): Promise<string[]> {
    const result = await this.runner.exec(['ls-files', '--others', '--exclude-standard']);
    return result.stdout.split('\n').filter(l => l.trim());
  }

  async getConflicts(): Promise<string[]> {
    try {
      const result = await this.runner.exec(['diff', '--name-only', '--diff-filter=U']);
      return result.stdout.split('\n').filter(l => l.trim());
    } catch {
      return [];
    }
  }

  async isClean(): Promise<boolean> {
    const result = await this.runner.exec(['status', '--porcelain']);
    return result.stdout.trim() === '';
  }

  async getFileStatus(filePath: string): Promise<GitFileStatus> {
    const result = await this.runner.exec(['status', '--porcelain', '--', filePath]);
    const line = result.stdout.trim();
    if (!line) return GitFileStatus.MODIFIED;
    const code = line[0] !== ' ' ? line[0] : line[1];
    return (code as GitFileStatus) || GitFileStatus.MODIFIED;
  }

  async stageFile(filePath: string): Promise<void> {
    await this.runner.exec(['add', '--', filePath]);
    this.invalidateCache();
    this.emit('status-changed');
  }

  async unstageFile(filePath: string): Promise<void> {
    await this.runner.exec(['reset', 'HEAD', '--', filePath]);
    this.invalidateCache();
    this.emit('status-changed');
  }

  async stageAll(): Promise<void> {
    await this.runner.exec(['add', '-A']);
    this.invalidateCache();
    this.emit('status-changed');
  }

  async getStashes(): Promise<GitStash[]> {
    const result = await this.runner.execSafe(['stash', 'list', '--format=%gd|%gs|%H|%aI']);
    if (!result) return [];
    return result.split('\n').filter(l => l.trim()).map(line => {
      const [ref, message, hash, dateStr] = line.split('|');
      const indexMatch = ref?.match(/stash@\{(\d+)\}/);
      return {
        index: indexMatch ? parseInt(indexMatch[1], 10) : 0,
        message: message || '',
        branch: '',
        date: dateStr ? new Date(dateStr) : new Date(),
        hash: hash || '',
      };
    });
  }

  private parseStatusV2(output: string): GitStatus {
    const branch: GitBranch = {
      name: '', isCurrent: true, isRemote: false,
      upstream: null, ahead: 0, behind: 0,
      lastCommitHash: null, lastCommitDate: null,
    };
    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: string[] = [];
    const conflicts: string[] = [];
    let isMerging = false, isRebasing = false, isCherryPicking = false, isBisecting = false;

    for (const line of output.split('\n')) {
      if (line.startsWith('# branch.head ')) {
        branch.name = line.slice(14).trim();
      } else if (line.startsWith('# branch.upstream ')) {
        branch.upstream = line.slice(18).trim();
      } else if (line.startsWith('# branch.ab ')) {
        const match = line.match(/\+(\d+) -(\d+)/);
        if (match) { branch.ahead = parseInt(match[1], 10); branch.behind = parseInt(match[2], 10); }
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        const parts = line.split(' ');
        const xy = parts[1] || '';
        const path = line.startsWith('2 ') ? parts[parts.length - 1].split('\t').pop() || parts[parts.length - 1] : parts[parts.length - 1];
        const stagedCode = xy[0];
        const unstagedCode = xy[1];

        if (stagedCode !== '.' && stagedCode !== '?') {
          staged.push({ path, status: stagedCode as GitFileStatus, additions: 0, deletions: 0, oldPath: null, similarity: null });
        }
        if (unstagedCode !== '.' && unstagedCode !== '?') {
          unstaged.push({ path, status: unstagedCode as GitFileStatus, additions: 0, deletions: 0, oldPath: null, similarity: null });
        }
      } else if (line.startsWith('u ')) {
        const path = line.split(' ').pop() || '';
        conflicts.push(path);
      } else if (line.startsWith('? ')) {
        untracked.push(line.slice(2).trim());
      }
    }

    const isClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0 && conflicts.length === 0;

    return { branch, staged, unstaged, untracked, conflicts, stashes: [], isClean, isMerging, isRebasing, isCherryPicking, isBisecting };
  }

  private parseNameStatus(output: string): GitFileChange[] {
    return output.split('\n').filter(l => l.trim()).map(line => {
      const match = line.match(/^([AMDRC?!T])(\d*)\t(.+?)(?:\t(.+))?$/);
      if (!match) return null;
      return {
        path: match[4] || match[3],
        status: match[1] as GitFileStatus,
        additions: 0, deletions: 0,
        oldPath: match[4] ? match[3] : null,
        similarity: match[2] ? parseInt(match[2], 10) : null,
      };
    }).filter((f): f is GitFileChange => f !== null);
  }

  invalidateCache(): void {
    this.cachedStatus = null;
    this.cacheTimestamp = 0;
  }
}
