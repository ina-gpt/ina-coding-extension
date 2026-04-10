import { GitCommandRunner } from './GitCommandRunner';
import { GitCommit, GitFileChange, GitFileStatus, GitLogQuery, DEFAULT_LOG_QUERY, GIT_CONSTANTS } from './GitTypes';

const COMMIT_FORMAT = '%H%n%h%n%an%n%ae%n%aI%n%cn%n%cI%n%s%n%b%n---COMMIT_END---';

export class GitLogService {
  private static instance: GitLogService;
  private runner: GitCommandRunner;

  static getInstance(): GitLogService {
    if (!GitLogService.instance) {
      GitLogService.instance = new GitLogService();
    }
    return GitLogService.instance;
  }

  private constructor() {
    this.runner = GitCommandRunner.getInstance();
  }

  async getLog(query?: Partial<GitLogQuery>): Promise<GitCommit[]> {
    const q = { ...DEFAULT_LOG_QUERY, ...query };
    const args = ['log', `--format=${COMMIT_FORMAT}`, '--name-status', `--max-count=${Math.min(q.maxCount, GIT_CONSTANTS.MAX_LOG_COUNT)}`];

    if (q.author) args.push(`--author=${q.author}`);
    if (q.since) args.push(`--since=${q.since.toISOString()}`);
    if (q.until) args.push(`--until=${q.until.toISOString()}`);
    if (q.grep) args.push(`--grep=${q.grep}`);
    if (q.branch) args.push(q.branch);
    if (q.merges === false) args.push('--no-merges');
    if (q.firstParent) args.push('--first-parent');
    if (q.path) { args.push('--'); args.push(q.path); }

    const result = await this.runner.exec(args);
    return this.parseCommits(result.stdout);
  }

  async getCommit(hash: string): Promise<GitCommit> {
    const result = await this.runner.exec(['show', `--format=${COMMIT_FORMAT}`, '--name-status', hash]);
    const commits = this.parseCommits(result.stdout);
    if (commits.length === 0) throw new Error(`Commit not found: ${hash}`);
    return commits[0];
  }

  async getFileLog(filePath: string, maxCount: number = 10): Promise<GitCommit[]> {
    const result = await this.runner.exec(['log', `--format=${COMMIT_FORMAT}`, '--follow', `--max-count=${maxCount}`, '--', filePath]);
    return this.parseCommits(result.stdout);
  }

  async getCommitsBetween(from: string, to: string): Promise<GitCommit[]> {
    const result = await this.runner.exec(['log', `--format=${COMMIT_FORMAT}`, '--name-status', `${from}..${to}`]);
    return this.parseCommits(result.stdout);
  }

  async getCommitFiles(hash: string): Promise<GitFileChange[]> {
    const result = await this.runner.exec(['diff-tree', '--no-commit-id', '-r', '--name-status', hash]);
    return this.parseFileChanges(result.stdout);
  }

  async search(grep: string, maxCount: number = 20): Promise<GitCommit[]> {
    const result = await this.runner.exec(['log', `--format=${COMMIT_FORMAT}`, '--all', `--grep=${grep}`, `--max-count=${maxCount}`]);
    return this.parseCommits(result.stdout);
  }

  async getFirstCommit(): Promise<GitCommit | null> {
    try {
      const result = await this.runner.exec(['rev-list', '--max-parents=0', 'HEAD']);
      const hash = result.stdout.trim().split('\n')[0];
      if (!hash) return null;
      return this.getCommit(hash);
    } catch {
      return null;
    }
  }

  formatCommitForPrompt(commit: GitCommit): string {
    const relDate = this.relativeDate(commit.authorDate);
    return `commit ${commit.shortHash} by ${commit.author} (${relDate}): ${commit.subject}`;
  }

  formatLogForPrompt(commits: GitCommit[], maxTokens: number = 500): string {
    const lines: string[] = [];
    let tokens = 0;
    for (const c of commits) {
      const line = this.formatCommitForPrompt(c);
      const lineTokens = Math.ceil(line.split(/\s+/).length * 1.3);
      if (tokens + lineTokens > maxTokens) break;
      lines.push(line);
      tokens += lineTokens;
    }
    return lines.join('\n');
  }

  private parseCommits(output: string): GitCommit[] {
    const commits: GitCommit[] = [];
    const blocks = output.split('---COMMIT_END---').filter(b => b.trim());

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 8) continue;

      const hash = lines[0].trim();
      const shortHash = lines[1].trim();
      const author = lines[2].trim();
      const authorEmail = lines[3].trim();
      const authorDate = new Date(lines[4].trim());
      const committer = lines[5].trim();
      const committerDate = new Date(lines[6].trim());
      const subject = lines[7].trim();

      let bodyEnd = lines.length;
      const filesChanged: GitFileChange[] = [];
      for (let i = 8; i < lines.length; i++) {
        if (/^[AMDRC?!T]\t/.test(lines[i]) || /^[AMDRC]\d*\t/.test(lines[i])) {
          bodyEnd = i;
          for (let j = i; j < lines.length; j++) {
            const fc = this.parseFileChangeLine(lines[j]);
            if (fc) filesChanged.push(fc);
          }
          break;
        }
      }

      const body = lines.slice(8, bodyEnd).join('\n').trim();

      commits.push({
        hash, shortHash, author, authorEmail, authorDate,
        committer, committerDate,
        message: body ? `${subject}\n\n${body}` : subject,
        subject, body, parents: [],
        filesChanged,
        stats: {
          additions: 0, deletions: 0,
          filesChanged: filesChanged.length,
        },
      });
    }

    return commits;
  }

  private parseFileChangeLine(line: string): GitFileChange | null {
    const match = line.match(/^([AMDRC?!T])(\d*)\t(.+?)(?:\t(.+))?$/);
    if (!match) return null;
    const status = match[1] as GitFileStatus;
    const similarity = match[2] ? parseInt(match[2], 10) : null;
    const path = match[4] || match[3];
    const oldPath = match[4] ? match[3] : null;
    return { path, status, additions: 0, deletions: 0, oldPath, similarity };
  }

  private parseFileChanges(output: string): GitFileChange[] {
    return output.split('\n').filter(l => l.trim()).map(l => this.parseFileChangeLine(l)).filter((f): f is GitFileChange => f !== null);
  }

  private relativeDate(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }
}
