import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

export class GitCommandRunner {
  private static instance: GitCommandRunner;
  private workspaceRoot: string = '';
  private gitPath: string = 'git';

  static getInstance(): GitCommandRunner {
    if (!GitCommandRunner.instance) {
      GitCommandRunner.instance = new GitCommandRunner();
    }
    return GitCommandRunner.instance;
  }

  initialize(): void {
    const ws = vscode.workspace.workspaceFolders;
    if (ws && ws.length > 0) {
      this.workspaceRoot = ws[0].uri.fsPath;
    }
  }

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  async exec(args: string[], options?: { cwd?: string; timeout?: number; stdin?: string; maxBuffer?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cwd = options?.cwd || this.workspaceRoot;
    const timeout = options?.timeout || 30000;
    const maxBuffer = options?.maxBuffer || 10 * 1024 * 1024;

    if (!cwd) {
      throw new Error('No workspace root set for git commands');
    }

    const sanitized = this.sanitizeArgs(args);

    return new Promise((resolve, reject) => {
      const proc = execFile(this.gitPath, sanitized, { cwd, timeout, maxBuffer }, (error, stdout, stderr) => {
        const exitCode = error ? (error as any).code || 1 : 0;

        if (exitCode === 128 || exitCode === 129) {
          reject(new Error(`Git fatal error: ${stderr.trim() || error?.message}`));
          return;
        }

        resolve({
          stdout: stdout.replace(/\n$/, ''),
          stderr: stderr.replace(/\n$/, ''),
          exitCode: typeof exitCode === 'number' ? exitCode : 0,
        });
      });

      if (options?.stdin && proc.stdin) {
        proc.stdin.write(options.stdin);
        proc.stdin.end();
      }
    });
  }

  async execSafe(args: string[]): Promise<string | null> {
    try {
      const result = await this.exec(args);
      return result.exitCode === 0 ? result.stdout : null;
    } catch {
      return null;
    }
  }

  async isGitRepo(path?: string): Promise<boolean> {
    try {
      const result = await this.exec(['rev-parse', '--is-inside-work-tree'], { cwd: path || this.workspaceRoot });
      return result.stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  async getGitVersion(): Promise<string> {
    const result = await this.exec(['--version']);
    const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : result.stdout.trim();
  }

  async getRepoRoot(path?: string): Promise<string> {
    const result = await this.exec(['rev-parse', '--show-toplevel'], { cwd: path || this.workspaceRoot });
    return result.stdout.trim();
  }

  private sanitizeArgs(args: string[]): string[] {
    const knownFlags = new Set([
      '--format', '--pretty', '--name-status', '--numstat', '--name-only',
      '--porcelain', '--porcelain=v2', '--branch', '--short', '--cached',
      '--staged', '--diff-filter', '--no-commit-id', '--follow', '--all',
      '--left-right', '--count', '--oneline', '--no-merges', '--first-parent',
      '--grep', '--author', '--since', '--until', '--max-count', '--reverse',
      '--abbrev-commit', '--stat', '--word-diff', '--word-diff=plain',
      '--others', '--exclude-standard', '--show-toplevel', '--is-inside-work-tree',
      '--version', '-a', '-r', '-L', '-A', '-1', '-n',
    ]);

    return args.map(arg => {
      if (arg.startsWith('-') && !knownFlags.has(arg) && !arg.startsWith('--format=') && !arg.startsWith('--pretty=') && !arg.startsWith('--diff-filter=') && !arg.startsWith('--max-count=') && !arg.startsWith('--grep=') && !arg.startsWith('--author=') && !arg.startsWith('--since=') && !arg.startsWith('--until=') && !arg.startsWith('-L') && !arg.startsWith('-n')) {
        if (/[;&|`$()]/.test(arg)) {
          Logger.warn('Suspicious git arg blocked:', arg);
          throw new Error(`Unsafe git argument: ${arg}`);
        }
      }
      return arg;
    });
  }
}
