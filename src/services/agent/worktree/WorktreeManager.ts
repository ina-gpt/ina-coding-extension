/**
 * WorktreeManager.ts
 * Phase 18.3 — Git Worktree Isolation
 *
 * Wraps `git worktree` commands via GitCommandRunner. Worktrees are stored
 * under `<repoRoot>/.ina-worktrees/<id>` and track their parent branch so
 * merges can be targeted automatically.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GitCommandRunner } from '../../git/GitCommandRunner';
import {
  WorktreeInstance,
  WorktreeConfig,
  WorktreeEvent,
  WorktreeEventType,
  WorktreeStatus,
  MergeStrategy,
  MergeResult,
  DEFAULT_WORKTREE_CONFIG,
  generateWorktreeId,
} from './WorktreeTypes';
import { Logger } from '../../../utils/Logger';

// ============================================================

export class WorktreeManager {
  private static instance: WorktreeManager;

  private worktrees = new Map<string, WorktreeInstance>();
  private config: WorktreeConfig = { ...DEFAULT_WORKTREE_CONFIG };
  private git: GitCommandRunner;
  private cleanupTimer: NodeJS.Timeout | null = null;

  private readonly _onEvent = new vscode.EventEmitter<WorktreeEvent>();
  readonly onEvent = this._onEvent.event;

  private constructor() {
    this.git = GitCommandRunner.getInstance();
  }

  static getInstance(): WorktreeManager {
    if (!WorktreeManager.instance) {
      WorktreeManager.instance = new WorktreeManager();
    }
    return WorktreeManager.instance;
  }

  configure(config: Partial<WorktreeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Load existing worktrees from git and start the cleanup timer.
   */
  async initialize(): Promise<void> {
    await this.refresh();
    if (this.config.autoCleanup) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup().catch((e) => Logger.warn(`[Worktree] cleanup failed: ${String(e)}`));
      }, 30 * 60 * 1000); // every 30 minutes
    }
    Logger.info(`[Worktree] Manager initialized (${this.worktrees.size} existing worktrees)`);
  }

  dispose(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this._onEvent.dispose();
    this.worktrees.clear();
  }

  // ============================================================
  // Create
  // ============================================================

  /**
   * Create a new git worktree. If `branchName` already exists, the worktree
   * checks it out; otherwise a new branch is created from the current HEAD.
   */
  async create(
    branchName?: string,
    options: { label?: string; agentSessionId?: string; fromBranch?: string } = {}
  ): Promise<WorktreeInstance> {
    // Validate git repo
    const isRepo = await this.git.isGitRepo();
    if (!isRepo) {
      throw new Error('Not a git repository — worktrees require git');
    }

    // Enforce max worktrees
    if (this.worktrees.size >= this.config.maxWorktrees) {
      throw new Error(`Max worktrees reached (${this.config.maxWorktrees}). Merge or abandon one first.`);
    }

    const repoRoot = await this.git.getRepoRoot();
    const worktreeId = generateWorktreeId();
    const worktreeDir = path.join(repoRoot, this.config.basePath, worktreeId);
    const branch = branchName || `${this.config.branchPrefix}${worktreeId}`;

    // Resolve parent branch + base commit
    const parentBranch = options.fromBranch ?? (await this.getCurrentBranch()) ?? 'HEAD';
    const baseCommitResult = await this.git.exec(['rev-parse', 'HEAD']);
    const baseCommit = baseCommitResult.stdout.trim();

    // Auto-stash if there are uncommitted changes
    if (this.config.autoStashDirty) {
      const statusResult = await this.git.exec(['status', '--porcelain']);
      if (statusResult.stdout.trim().length > 0) {
        Logger.info('[Worktree] Auto-stashing uncommitted changes');
        await this.git.exec(['stash', 'push', '-u', '-m', `ina-worktree-autostash-${worktreeId}`]);
      }
    }

    // Create placeholder instance so the caller can observe state
    const instance: WorktreeInstance = {
      id: worktreeId,
      path: worktreeDir,
      branch,
      parentBranch,
      baseCommit,
      status: 'creating',
      agentSessionId: options.agentSessionId ?? null,
      label: options.label ?? null,
      conflictCount: 0,
      lastError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.worktrees.set(worktreeId, instance);
    this.emit('created', worktreeId, `Creating worktree ${worktreeId}`);

    // Ensure .ina-worktrees exists
    try {
      fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });
    } catch {
      /* noop */
    }

    // `git worktree add <path> -b <branch>` creates a new branch from HEAD
    const addArgs = ['worktree', 'add', worktreeDir];
    // If the branch already exists, omit -b and let git check it out
    const branchExists = (await this.git.exec(['rev-parse', '--verify', '--quiet', branch])).exitCode === 0;
    if (!branchExists) {
      addArgs.push('-b', branch);
    } else {
      addArgs.push(branch);
    }
    const addResult = await this.git.exec(addArgs);
    if (addResult.exitCode !== 0) {
      instance.status = 'error';
      instance.lastError = addResult.stderr.trim();
      this.emit('error', worktreeId, addResult.stderr);
      this.worktrees.delete(worktreeId);
      throw new Error(`git worktree add failed: ${addResult.stderr}`);
    }

    instance.status = 'active';
    instance.updatedAt = Date.now();
    this.emit('created', worktreeId, `Worktree ready at ${worktreeDir}`);
    return instance;
  }

  // ============================================================
  // Switch
  // ============================================================

  /**
   * Open the worktree as a new VS Code window. Returns the path that was
   * switched to. The current window is left untouched.
   */
  async switchTo(worktreeId: string): Promise<string> {
    const instance = this.worktrees.get(worktreeId);
    if (!instance) throw new Error(`Worktree not found: ${worktreeId}`);
    try {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(instance.path), {
        forceNewWindow: true,
      });
      this.emit('switched', worktreeId, `Opened ${instance.path}`);
      return instance.path;
    } catch (e: any) {
      throw new Error(`Failed to open worktree: ${e?.message ?? String(e)}`);
    }
  }

  // ============================================================
  // Merge
  // ============================================================

  /**
   * Merge the worktree's branch back into its parent branch. Runs in the
   * main repo (not inside the worktree). On conflicts, the status is set
   * to 'conflicted' and the user is asked how to proceed.
   */
  async merge(
    worktreeId: string,
    strategy: MergeStrategy = 'merge'
  ): Promise<MergeResult> {
    const instance = this.worktrees.get(worktreeId);
    if (!instance) throw new Error(`Worktree not found: ${worktreeId}`);

    instance.status = 'merging';
    this.emit('merging', worktreeId, `Merging via ${strategy}`);

    // Run merge in the main repo (not inside the worktree itself)
    const repoRoot = await this.git.getRepoRoot();
    const originalBranch = await this.getCurrentBranch();

    try {
      // Check out parent branch first
      const checkout = await this.git.exec(['checkout', instance.parentBranch], { cwd: repoRoot });
      if (checkout.exitCode !== 0) {
        throw new Error(`Cannot checkout parent branch: ${checkout.stderr}`);
      }

      let mergeArgs: string[];
      if (strategy === 'merge') {
        mergeArgs = ['merge', '--no-ff', instance.branch];
      } else if (strategy === 'rebase') {
        // Rebase parent onto the worktree branch then fast-forward
        mergeArgs = ['merge', '--ff-only', instance.branch];
      } else {
        mergeArgs = ['merge', '--squash', instance.branch];
      }
      const mergeResult = await this.git.exec(mergeArgs, { cwd: repoRoot });

      if (mergeResult.exitCode !== 0) {
        // Parse conflicted files
        const statusResult = await this.git.exec(['status', '--porcelain'], { cwd: repoRoot });
        const conflicted = statusResult.stdout
          .split('\n')
          .filter((l) => /^(DD|AU|UD|UA|DU|AA|UU)/.test(l))
          .map((l) => l.substring(3).trim());

        instance.status = 'conflicted';
        instance.conflictCount = conflicted.length;
        instance.lastError = mergeResult.stderr.trim();
        this.emit('conflicted', worktreeId, `${conflicted.length} conflicted file(s)`, { conflicted });

        // Abort merge and restore original branch
        await this.git.exec(['merge', '--abort'], { cwd: repoRoot });
        if (originalBranch && originalBranch !== instance.parentBranch) {
          await this.git.exec(['checkout', originalBranch], { cwd: repoRoot });
        }

        return {
          success: false,
          strategy,
          worktreeId,
          conflictedFiles: conflicted,
          message: `Merge conflict in ${conflicted.length} file(s). Merge aborted — worktree preserved for manual resolution.`,
        };
      }

      // For squash strategy, we also need to commit the staged changes
      if (strategy === 'squash') {
        await this.git.exec(
          ['commit', '-m', `INA Coding: merge ${instance.branch} (squashed)`],
          { cwd: repoRoot }
        );
      }

      instance.status = 'merged';
      instance.updatedAt = Date.now();
      this.emit('merged', worktreeId, `Merged into ${instance.parentBranch}`);

      return {
        success: true,
        strategy,
        worktreeId,
        conflictedFiles: [],
        message: `Merged ${instance.branch} into ${instance.parentBranch}`,
      };
    } catch (e: any) {
      instance.status = 'error';
      instance.lastError = e?.message ?? String(e);
      this.emit('error', worktreeId, instance.lastError ?? 'Merge failed');
      // Best-effort restore original branch
      if (originalBranch) {
        await this.git.exec(['checkout', originalBranch], { cwd: repoRoot }).catch(() => null);
      }
      return {
        success: false,
        strategy,
        worktreeId,
        conflictedFiles: [],
        message: `Merge failed: ${instance.lastError}`,
      };
    }
  }

  // ============================================================
  // Abandon (delete worktree + branch)
  // ============================================================

  async abandon(worktreeId: string, deleteBranch: boolean = true): Promise<void> {
    const instance = this.worktrees.get(worktreeId);
    if (!instance) return;

    // `git worktree remove --force` handles uncommitted changes inside
    const removeResult = await this.git.exec(['worktree', 'remove', '--force', instance.path]);
    if (removeResult.exitCode !== 0) {
      Logger.warn(`[Worktree] remove failed: ${removeResult.stderr}`);
      // Fallback: manual rm
      try {
        fs.rmSync(instance.path, { recursive: true, force: true });
      } catch {
        /* noop */
      }
      // Prune git's internal worktree records
      await this.git.exec(['worktree', 'prune']).catch(() => null);
    }

    if (deleteBranch && instance.branch.startsWith(this.config.branchPrefix)) {
      await this.git.exec(['branch', '-D', instance.branch]).catch(() => null);
    }

    instance.status = 'abandoned';
    instance.updatedAt = Date.now();
    this.emit('abandoned', worktreeId, `Abandoned ${instance.branch}`);
    this.emit('deleted', worktreeId, 'Worktree removed');
    this.worktrees.delete(worktreeId);
  }

  // ============================================================
  // List
  // ============================================================

  /** In-memory snapshot (does not re-query git). */
  list(): WorktreeInstance[] {
    return [...this.worktrees.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): WorktreeInstance | null {
    return this.worktrees.get(id) ?? null;
  }

  setStatus(id: string, status: WorktreeStatus): void {
    const inst = this.worktrees.get(id);
    if (!inst) return;
    inst.status = status;
    inst.updatedAt = Date.now();
  }

  /**
   * Re-read worktrees from `git worktree list --porcelain` and merge into
   * the in-memory map. Worktrees not under our base path are ignored.
   */
  async refresh(): Promise<void> {
    const isRepo = await this.git.isGitRepo();
    if (!isRepo) return;

    const listResult = await this.git.exec(['worktree', 'list', '--porcelain']);
    if (listResult.exitCode !== 0) return;

    const repoRoot = await this.git.getRepoRoot();
    const baseAbs = path.join(repoRoot, this.config.basePath);

    // Parse porcelain output — blocks separated by blank lines
    const blocks = listResult.stdout.split(/\n\n+/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      let wtPath = '';
      let branch = '';
      let headCommit = '';
      for (const line of lines) {
        if (line.startsWith('worktree ')) wtPath = line.substring('worktree '.length).trim();
        else if (line.startsWith('branch ')) branch = line.substring('branch '.length).trim().replace(/^refs\/heads\//, '');
        else if (line.startsWith('HEAD ')) headCommit = line.substring('HEAD '.length).trim();
      }
      if (!wtPath) continue;
      if (!wtPath.startsWith(baseAbs)) continue; // not managed by us

      const id = path.basename(wtPath);
      if (!this.worktrees.has(id)) {
        const instance: WorktreeInstance = {
          id,
          path: wtPath,
          branch: branch || 'detached',
          parentBranch: 'main',
          baseCommit: headCommit,
          status: 'active',
          agentSessionId: null,
          label: null,
          conflictCount: 0,
          lastError: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        this.worktrees.set(id, instance);
      }
    }
  }

  // ============================================================
  // Cleanup — remove worktrees older than cleanupAfterHours
  // ============================================================

  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.config.cleanupAfterHours * 3600 * 1000;
    let removed = 0;
    for (const inst of [...this.worktrees.values()]) {
      if (inst.updatedAt > cutoff) continue;
      if (inst.status === 'merged' || inst.status === 'abandoned') {
        await this.abandon(inst.id).catch(() => null);
        removed++;
      }
    }
    if (removed > 0) Logger.info(`[Worktree] Cleanup removed ${removed} old worktree(s)`);
    return removed;
  }

  // ============================================================
  // Internal
  // ============================================================

  private async getCurrentBranch(): Promise<string | null> {
    const result = await this.git.exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() || null;
  }

  private emit(type: WorktreeEventType, worktreeId: string, message?: string, data?: any): void {
    this._onEvent.fire({
      type,
      worktreeId,
      timestamp: Date.now(),
      message,
      data,
    });
  }
}
