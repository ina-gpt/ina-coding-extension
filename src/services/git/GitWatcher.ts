import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { GitCommandRunner } from './GitCommandRunner';
import { GitEvent, GIT_CONSTANTS } from './GitTypes';
import { Logger } from '../../utils/Logger';

export class GitWatcher extends EventEmitter {
  private static instance: GitWatcher;
  private fsWatchers: vscode.FileSystemWatcher[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private lastHeadHash: string | null = null;
  private lastBranch: string | null = null;
  private lastStatusHash: string | null = null;
  private runner: GitCommandRunner;
  private running = false;

  static getInstance(): GitWatcher {
    if (!GitWatcher.instance) {
      GitWatcher.instance = new GitWatcher();
    }
    return GitWatcher.instance;
  }

  private constructor() {
    super();
    this.runner = GitCommandRunner.getInstance();
  }

  start(workspaceRoot: string): void {
    if (this.running) return;
    this.running = true;

    try {
      const gitPattern = new vscode.RelativePattern(workspaceRoot, '.git/HEAD');
      const headWatcher = vscode.workspace.createFileSystemWatcher(gitPattern);
      headWatcher.onDidChange(() => this.onHeadChanged());
      this.fsWatchers.push(headWatcher);

      const indexPattern = new vscode.RelativePattern(workspaceRoot, '.git/index');
      const indexWatcher = vscode.workspace.createFileSystemWatcher(indexPattern);
      indexWatcher.onDidChange(() => this.onIndexChanged());
      this.fsWatchers.push(indexWatcher);

      const refsPattern = new vscode.RelativePattern(workspaceRoot, '.git/refs/**');
      const refsWatcher = vscode.workspace.createFileSystemWatcher(refsPattern);
      refsWatcher.onDidChange(() => this.onHeadChanged());
      refsWatcher.onDidCreate(() => this.onHeadChanged());
      this.fsWatchers.push(refsWatcher);
    } catch (e) {
      Logger.warn('Failed to create git file watchers:', e);
    }

    const pollInterval = vscode.workspace.getConfiguration('inaCoding.git').get<number>('pollIntervalMs', GIT_CONSTANTS.POLL_INTERVAL_MS);
    this.pollTimer = setInterval(() => this.pollStatus(), pollInterval);

    this.initializeState();
    Logger.info('Git watcher started');
  }

  stop(): void {
    this.running = false;
    for (const w of this.fsWatchers) w.dispose();
    this.fsWatchers = [];
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async initializeState(): Promise<void> {
    try {
      this.lastHeadHash = await this.runner.execSafe(['rev-parse', 'HEAD']);
      this.lastBranch = await this.runner.execSafe(['symbolic-ref', '--short', 'HEAD']);
      const statusResult = await this.runner.execSafe(['status', '--porcelain']);
      this.lastStatusHash = statusResult ? this.hashString(statusResult) : null;
    } catch {
      // Not a git repo or git not available
    }
  }

  private async onHeadChanged(): Promise<void> {
    try {
      const currentBranch = await this.runner.execSafe(['symbolic-ref', '--short', 'HEAD']);
      if (currentBranch !== this.lastBranch) {
        this.lastBranch = currentBranch;
        this.emit('git-event', 'branch-changed' as GitEvent, { branch: currentBranch });
      }

      const currentHash = await this.runner.execSafe(['rev-parse', 'HEAD']);
      if (currentHash !== this.lastHeadHash) {
        this.lastHeadHash = currentHash;
        this.emit('git-event', 'head-changed' as GitEvent, { hash: currentHash });
      }
    } catch {
      // ignore
    }
  }

  private onIndexChanged(): void {
    this.emit('git-event', 'index-changed' as GitEvent);
  }

  private async pollStatus(): Promise<void> {
    try {
      const statusResult = await this.runner.execSafe(['status', '--porcelain']);
      const currentHash = statusResult ? this.hashString(statusResult) : null;
      if (currentHash !== this.lastStatusHash) {
        this.lastStatusHash = currentHash;
        this.emit('git-event', 'status-changed' as GitEvent);
      }
    } catch {
      // ignore
    }
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  dispose(): void {
    this.stop();
  }
}
