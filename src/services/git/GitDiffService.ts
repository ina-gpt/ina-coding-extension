import { GitCommandRunner } from './GitCommandRunner';
import { GitDiff, GitDiffHunk, GitDiffLine, GIT_CONSTANTS } from './GitTypes';
import { SensitiveFileDetector } from '../codesec/SensitiveFileDetector';

export class GitDiffService {
  private static instance: GitDiffService;
  private runner: GitCommandRunner;

  static getInstance(): GitDiffService {
    if (!GitDiffService.instance) {
      GitDiffService.instance = new GitDiffService();
    }
    return GitDiffService.instance;
  }

  private constructor() {
    this.runner = GitCommandRunner.getInstance();
  }

  async getDiff(options?: { staged?: boolean; file?: string; commit?: string; base?: string }): Promise<GitDiff[]> {
    const args = ['diff'];
    if (options?.staged) args.push('--cached');
    if (options?.base && options?.commit) {
      args.push(`${options.base}...${options.commit}`);
    } else if (options?.commit) {
      args.push(`${options.commit}~1`, options.commit);
    }
    if (options?.file) { args.push('--'); args.push(options.file); }

    const result = await this.runner.exec(args, { maxBuffer: GIT_CONSTANTS.MAX_DIFF_SIZE });
    return this.parseUnifiedDiff(result.stdout);
  }

  async getFileDiff(filePath: string, staged?: boolean): Promise<GitDiff> {
    const diffs = await this.getDiff({ staged, file: filePath });
    if (diffs.length === 0) {
      return { filePath, oldContent: null, newContent: null, hunks: [], stats: { additions: 0, deletions: 0 }, isBinary: false };
    }
    return diffs[0];
  }

  async getCommitDiff(hash: string): Promise<GitDiff[]> {
    return this.getDiff({ commit: hash });
  }

  async getBranchDiff(baseBranch: string, headBranch?: string): Promise<GitDiff[]> {
    const head = headBranch || 'HEAD';
    const args = ['diff', `${baseBranch}...${head}`];
    const result = await this.runner.exec(args, { maxBuffer: GIT_CONSTANTS.MAX_DIFF_SIZE });
    return this.parseUnifiedDiff(result.stdout);
  }

  async getDiffStats(options?: { staged?: boolean; base?: string; head?: string }): Promise<{ additions: number; deletions: number; filesChanged: number }> {
    const args = ['diff', '--numstat'];
    if (options?.staged) args.push('--cached');
    if (options?.base && options?.head) args.push(`${options.base}...${options.head}`);

    const result = await this.runner.exec(args);
    let additions = 0, deletions = 0, filesChanged = 0;
    for (const line of result.stdout.split('\n').filter(l => l.trim())) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        additions += parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
        deletions += parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
        filesChanged++;
      }
    }
    return { additions, deletions, filesChanged };
  }

  async getWordDiff(filePath: string): Promise<string> {
    const result = await this.runner.exec(['diff', '--word-diff=plain', '--', filePath]);
    return result.stdout;
  }

  formatDiffForPrompt(diffs: GitDiff[], maxTokens: number = 1000): string {
    const lines: string[] = [];
    let tokens = 0;
    const sensitiveDetector = SensitiveFileDetector.getInstance();

    for (const diff of diffs) {
      // Skip diffs for sensitive files to avoid leaking secrets into prompts
      if (sensitiveDetector.isSensitiveFile(diff.filePath)) {
        continue;
      }
      const header = `--- a/${diff.filePath}\n+++ b/${diff.filePath}`;
      const headerTokens = Math.ceil(header.split(/\s+/).length * 1.3);
      if (tokens + headerTokens > maxTokens) break;
      lines.push(header);
      tokens += headerTokens;

      for (const hunk of diff.hunks) {
        lines.push(hunk.header);
        tokens += 5;
        for (const line of hunk.lines) {
          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
          const lineStr = `${prefix}${line.content}`;
          const lineTokens = Math.ceil(lineStr.split(/\s+/).length * 1.3);
          if (tokens + lineTokens > maxTokens) {
            lines.push('... (truncated)');
            return lines.join('\n');
          }
          lines.push(lineStr);
          tokens += lineTokens;
        }
      }
    }

    return lines.join('\n');
  }

  private parseUnifiedDiff(diffOutput: string): GitDiff[] {
    const diffs: GitDiff[] = [];
    const fileBlocks = diffOutput.split(/^diff --git /m).filter(b => b.trim());

    for (const block of fileBlocks) {
      const lines = block.split('\n');
      let filePath = '';
      const bMatch = lines[0]?.match(/b\/(.+)$/);
      if (bMatch) filePath = bMatch[1];

      const isBinary = block.includes('Binary files') || block.includes('GIT binary patch');
      const hunks: GitDiffHunk[] = [];
      let additions = 0, deletions = 0;

      let currentHunk: GitDiffHunk | null = null;
      let oldLine = 0, newLine = 0;

      for (const line of lines) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
        if (hunkMatch) {
          if (currentHunk) hunks.push(currentHunk);
          oldLine = parseInt(hunkMatch[1], 10);
          newLine = parseInt(hunkMatch[3], 10);
          currentHunk = {
            oldStart: oldLine,
            oldCount: parseInt(hunkMatch[2] || '1', 10),
            newStart: newLine,
            newCount: parseInt(hunkMatch[4] || '1', 10),
            header: line,
            lines: [],
          };
          continue;
        }

        if (!currentHunk) continue;

        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({ type: 'add', content: line.slice(1), oldLineNumber: null, newLineNumber: newLine });
          newLine++;
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({ type: 'remove', content: line.slice(1), oldLineNumber: oldLine, newLineNumber: null });
          oldLine++;
          deletions++;
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({ type: 'context', content: line.slice(1), oldLineNumber: oldLine, newLineNumber: newLine });
          oldLine++;
          newLine++;
        }
      }

      if (currentHunk) hunks.push(currentHunk);
      if (filePath) {
        diffs.push({ filePath, oldContent: null, newContent: null, hunks, stats: { additions, deletions }, isBinary });
      }
    }

    return diffs;
  }
}
