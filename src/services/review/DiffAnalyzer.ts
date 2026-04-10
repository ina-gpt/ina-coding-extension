/**
 * DiffAnalyzer.ts — Phase 19 Step 19.3
 * Parse git diffs into structured objects for AI review
 */

import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ReviewScope, FileDiff, DiffHunk, ReviewConfig, DEFAULT_REVIEW_CONFIG } from './ReviewAgentTypes';
import { Logger } from '../../utils/Logger';

const execAsync = promisify(exec);

export class DiffAnalyzer {
  private workspaceRoot: string;
  private config: ReviewConfig;

  constructor(workspaceRoot: string, config?: Partial<ReviewConfig>) {
    this.workspaceRoot = workspaceRoot;
    this.config = { ...DEFAULT_REVIEW_CONFIG, ...config };
  }

  async getDiff(scope: ReviewScope): Promise<FileDiff[]> {
    let diffOutput: string;
    try {
      let cmd: string;
      if (scope.staged) {
        cmd = 'git diff --staged --unified=5';
      } else if (scope.baseBranch && scope.headBranch) {
        cmd = `git diff ${scope.baseBranch}...${scope.headBranch} --unified=5`;
      } else if (scope.commitRange) {
        cmd = `git diff ${scope.commitRange} --unified=5`;
      } else if (scope.files.length > 0) {
        cmd = `git diff HEAD -- ${scope.files.map(f => `"${f}"`).join(' ')} --unified=5`;
      } else {
        cmd = 'git diff HEAD --unified=5';
      }

      const { stdout } = await execAsync(cmd, { cwd: this.workspaceRoot, timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
      diffOutput = stdout;
    } catch (e: any) {
      Logger.error('[DiffAnalyzer] Git diff failed:', e.message);
      return [];
    }

    const fileDiffs = this.parseDiff(diffOutput);
    return this.filterAndChunk(fileDiffs);
  }

  async getStagedDiff(): Promise<FileDiff[]> {
    return this.getDiff({ files: [], staged: true });
  }

  async getDiffSummary(scope: ReviewScope): Promise<{ filesChanged: number; additions: number; deletions: number }> {
    try {
      let cmd = scope.baseBranch && scope.headBranch
        ? `git diff ${scope.baseBranch}...${scope.headBranch} --stat`
        : 'git diff HEAD --stat';
      const { stdout } = await execAsync(cmd, { cwd: this.workspaceRoot, timeout: 10000 });
      const lastLine = stdout.trim().split('\n').pop() || '';
      const filesMatch = lastLine.match(/(\d+)\s+files?\s+changed/);
      const addMatch = lastLine.match(/(\d+)\s+insertions?/);
      const delMatch = lastLine.match(/(\d+)\s+deletions?/);
      return {
        filesChanged: parseInt(filesMatch?.[1] || '0', 10),
        additions: parseInt(addMatch?.[1] || '0', 10),
        deletions: parseInt(delMatch?.[1] || '0', 10),
      };
    } catch {
      return { filesChanged: 0, additions: 0, deletions: 0 };
    }
  }

  private parseDiff(raw: string): FileDiff[] {
    const fileDiffs: FileDiff[] = [];
    const fileSections = raw.split(/^diff --git /m).filter(Boolean);

    for (const section of fileSections) {
      const lines = section.split('\n');
      const headerMatch = lines[0]?.match(/a\/(.+?)\s+b\/(.+)/);
      if (!headerMatch) continue;

      const oldFile = headerMatch[1];
      const newFile = headerMatch[2];
      const isBinary = section.includes('Binary files');

      let status: FileDiff['status'] = 'modified';
      if (section.includes('new file mode')) status = 'added';
      else if (section.includes('deleted file mode')) status = 'removed';
      else if (oldFile !== newFile) status = 'renamed';

      const hunks = this.parseHunks(section);
      let additions = 0, deletions = 0;
      for (const hunk of hunks) {
        for (const line of hunk.content.split('\n')) {
          if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        }
      }

      fileDiffs.push({
        file: newFile,
        status,
        additions,
        deletions,
        hunks,
        language: this.detectLanguage(newFile),
        isBinary,
        ...(status === 'renamed' ? { oldFile } : {}),
      });
    }

    return fileDiffs;
  }

  private parseHunks(section: string): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const hunkRegex = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/gm;
    let match;
    const lines = section.split('\n');

    while ((match = hunkRegex.exec(section)) !== null) {
      const hunkStart = section.indexOf(match[0]);
      const nextHunkStart = section.indexOf('\n@@', hunkStart + 1);
      const hunkContent = nextHunkStart > 0
        ? section.slice(hunkStart + match[0].length + 1, nextHunkStart)
        : section.slice(hunkStart + match[0].length + 1);

      hunks.push({
        oldStart: parseInt(match[1], 10),
        oldLines: parseInt(match[2] || '1', 10),
        newStart: parseInt(match[3], 10),
        newLines: parseInt(match[4] || '1', 10),
        content: hunkContent.split('\n').slice(0, this.config.maxLinesPerChunk).join('\n'),
        context: match[5]?.trim(),
      });
    }

    return hunks;
  }

  private filterAndChunk(diffs: FileDiff[]): FileDiff[] {
    return diffs
      .filter(d => !d.isBinary)
      .filter(d => !this.config.ignorePaths.some(p => {
        if (p.startsWith('*')) return d.file.endsWith(p.slice(1));
        return d.file.includes(p);
      }))
      .slice(0, this.config.maxFilesPerReview);
  }

  private detectLanguage(file: string): string {
    const ext = path.extname(file).toLowerCase();
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin',
      '.rb': 'ruby', '.php': 'php', '.cs': 'csharp', '.cpp': 'cpp', '.c': 'c',
      '.swift': 'swift', '.dart': 'dart', '.vue': 'vue', '.svelte': 'svelte',
      '.css': 'css', '.scss': 'scss', '.html': 'html', '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml',
      '.sql': 'sql', '.sh': 'shell', '.md': 'markdown',
    };
    return map[ext] || 'unknown';
  }
}
