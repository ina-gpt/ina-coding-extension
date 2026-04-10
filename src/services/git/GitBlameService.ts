import { GitCommandRunner } from './GitCommandRunner';
import { GitBlame, GitBlameLine, GIT_CONSTANTS } from './GitTypes';

export class GitBlameService {
  private static instance: GitBlameService;
  private runner: GitCommandRunner;
  private blameCache: Map<string, { blame: GitBlame; timestamp: number }> = new Map();
  private CACHE_TTL = 10000;

  static getInstance(): GitBlameService {
    if (!GitBlameService.instance) {
      GitBlameService.instance = new GitBlameService();
    }
    return GitBlameService.instance;
  }

  private constructor() {
    this.runner = GitCommandRunner.getInstance();
  }

  async getBlame(filePath: string): Promise<GitBlame> {
    const cached = this.blameCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.blame;
    }

    const result = await this.runner.exec(['blame', '--porcelain', filePath]);
    const lines = this.parsePorcelainBlame(result.stdout);
    const blame: GitBlame = { filePath, lines };

    this.blameCache.set(filePath, { blame, timestamp: Date.now() });
    return blame;
  }

  async getLineBlame(filePath: string, lineNumber: number): Promise<GitBlameLine> {
    const result = await this.runner.exec(['blame', `-L${lineNumber},${lineNumber}`, '--porcelain', filePath]);
    const lines = this.parsePorcelainBlame(result.stdout);
    if (lines.length === 0) throw new Error(`No blame data for line ${lineNumber}`);
    return lines[0];
  }

  async getRangeBlame(filePath: string, startLine: number, endLine: number): Promise<GitBlameLine[]> {
    const result = await this.runner.exec(['blame', `-L${startLine},${endLine}`, '--porcelain', filePath]);
    return this.parsePorcelainBlame(result.stdout);
  }

  async getBlameAuthors(filePath: string): Promise<{ author: string; lines: number; percentage: number; lastCommitDate: Date }[]> {
    const blame = await this.getBlame(filePath);
    const authorMap = new Map<string, { lines: number; lastDate: Date }>();

    for (const line of blame.lines) {
      const existing = authorMap.get(line.author);
      if (existing) {
        existing.lines++;
        if (line.date > existing.lastDate) existing.lastDate = line.date;
      } else {
        authorMap.set(line.author, { lines: 1, lastDate: line.date });
      }
    }

    const total = blame.lines.length;
    return [...authorMap.entries()]
      .map(([author, data]) => ({
        author,
        lines: data.lines,
        percentage: Math.round((data.lines / total) * 100),
        lastCommitDate: data.lastDate,
      }))
      .sort((a, b) => b.lines - a.lines);
  }

  formatBlameForPrompt(blame: GitBlameLine[], startLine: number, endLine: number): string {
    const filtered = blame.filter(l => l.lineNumber >= startLine && l.lineNumber <= endLine);
    return filtered.map(l => {
      const date = this.relativeDate(l.date);
      const author = l.isUncommitted ? 'You (uncommitted)' : l.author;
      return `${l.lineNumber} | ${l.shortHash} ${author} (${date}): ${l.content}`;
    }).join('\n');
  }

  private parsePorcelainBlame(output: string): GitBlameLine[] {
    const lines: GitBlameLine[] = [];
    const blocks = output.split(/(?=^[0-9a-f]{40} )/m);

    for (const block of blocks) {
      if (!block.trim()) continue;
      const blockLines = block.split('\n');
      if (blockLines.length < 2) continue;

      const headerMatch = blockLines[0].match(/^([0-9a-f]{40}) (\d+) (\d+)/);
      if (!headerMatch) continue;

      const hash = headerMatch[1];
      const lineNumber = parseInt(headerMatch[3], 10);
      const isUncommitted = hash.startsWith('0000000');
      let author = '', authorEmail = '', summary = '', dateVal = new Date();

      let content = '';
      for (const line of blockLines.slice(1)) {
        if (line.startsWith('author ')) author = line.slice(7);
        else if (line.startsWith('author-mail ')) authorEmail = line.slice(12).replace(/[<>]/g, '');
        else if (line.startsWith('author-time ')) dateVal = new Date(parseInt(line.slice(12), 10) * 1000);
        else if (line.startsWith('summary ')) summary = line.slice(8);
        else if (line.startsWith('\t')) content = line.slice(1);
      }

      lines.push({
        lineNumber, hash, shortHash: hash.slice(0, 7),
        author: author || 'Unknown', authorEmail,
        date: dateVal, summary, content,
        isUncommitted,
      });
    }

    return lines;
  }

  private relativeDate(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  invalidateCache(filePath: string): void {
    this.blameCache.delete(filePath);
  }

  clearCache(): void {
    this.blameCache.clear();
  }
}
