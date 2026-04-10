/**
 * IsolatedExecutor.ts
 * Phase 18.3 — Run agent tasks inside a git worktree
 *
 * Pipeline:
 *   1. Create worktree (via WorktreeManager)
 *   2. Execute the task — caller-provided runTaskFn() writes files into
 *      the worktree directory
 *   3. Watch worktree for file changes (optional, reported to orchestrator)
 *   4. Run Verifier on changed files
 *   5. If verifier passes: merge back to parent branch
 *      If verifier fails: keep worktree for inspection
 *
 * The executor is intentionally decoupled from MultiAgentOrchestrator —
 * it accepts any "run task" function, so it can also drive Best-of-N.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorktreeManager } from './WorktreeManager';
import { WorktreeInstance } from './WorktreeTypes';
import { VerificationOrchestrator } from '../verifier/VerificationOrchestrator';
import { VerificationReport } from '../verifier/VerifierTypes';
import { GitCommandRunner } from '../../git/GitCommandRunner';
import { Logger } from '../../../utils/Logger';

// ============================================================

export interface IsolatedTaskInput {
  /** Short description shown in UI / used for branch naming */
  description: string;
  /** Language of the file(s) being modified (for the verifier) */
  language: string;
  /** File path within the worktree that will be modified (or '' for multi-file) */
  filePath: string;
  /** Optional agent session id to tag the worktree with */
  agentSessionId?: string;
  /** Optional human label for the worktree */
  label?: string;
}

export interface IsolatedTaskResult {
  success: boolean;
  worktree: WorktreeInstance;
  /** Files modified inside the worktree */
  changedFiles: string[];
  /** Final contents of the primary file (if filePath was specified) */
  resultContent: string | null;
  /** Verification report (null if verification was skipped) */
  verificationReport: VerificationReport | null;
  /** True if the changes were successfully merged back */
  merged: boolean;
  error: string | null;
}

export interface IsolatedExecutorOptions {
  /** Merge back automatically if verifier passes (default true) */
  autoMerge: boolean;
  /** Run the verifier on changed files (default true) */
  runVerifier: boolean;
  /** Delete the worktree on success (default true; false = keep for history) */
  cleanupOnSuccess: boolean;
  /** Delete the worktree on failure (default false = preserve for inspection) */
  cleanupOnFailure: boolean;
  /** Watch the worktree with a FileSystemWatcher (default true) */
  watchChanges: boolean;
}

const DEFAULT_OPTIONS: IsolatedExecutorOptions = {
  autoMerge: true,
  runVerifier: true,
  cleanupOnSuccess: true,
  cleanupOnFailure: false,
  watchChanges: true,
};

// ============================================================

export class IsolatedExecutor {
  private static instance: IsolatedExecutor;

  private worktreeManager: WorktreeManager;
  private verifier: VerificationOrchestrator;
  private git: GitCommandRunner;

  private constructor() {
    this.worktreeManager = WorktreeManager.getInstance();
    this.verifier = VerificationOrchestrator.getInstance();
    this.git = GitCommandRunner.getInstance();
  }

  static getInstance(): IsolatedExecutor {
    if (!IsolatedExecutor.instance) {
      IsolatedExecutor.instance = new IsolatedExecutor();
    }
    return IsolatedExecutor.instance;
  }

  // ============================================================
  // Execute
  // ============================================================

  /**
   * Run a task inside a fresh worktree. The caller provides `runTaskFn`
   * which receives the worktree path and should write any changes to it.
   */
  async execute(
    input: IsolatedTaskInput,
    runTaskFn: (worktreePath: string) => Promise<string>,
    options: Partial<IsolatedExecutorOptions> = {}
  ): Promise<IsolatedTaskResult> {
    const opts: IsolatedExecutorOptions = { ...DEFAULT_OPTIONS, ...options };

    let worktree: WorktreeInstance;
    try {
      worktree = await this.worktreeManager.create(undefined, {
        label: input.label ?? input.description.substring(0, 40),
        agentSessionId: input.agentSessionId,
      });
    } catch (e: any) {
      return this.failureResult(null, [], null, `Failed to create worktree: ${e?.message ?? String(e)}`);
    }

    this.worktreeManager.setStatus(worktree.id, 'running');

    // Optional file watcher — collects change events to report back
    const changedFiles = new Set<string>();
    let watcher: vscode.FileSystemWatcher | null = null;
    if (opts.watchChanges) {
      try {
        const pattern = new vscode.RelativePattern(worktree.path, '**/*');
        watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate((uri) => changedFiles.add(uri.fsPath));
        watcher.onDidChange((uri) => changedFiles.add(uri.fsPath));
        watcher.onDidDelete((uri) => changedFiles.add(uri.fsPath));
      } catch (e) {
        Logger.warn(`[IsolatedExecutor] watcher failed: ${String(e)}`);
      }
    }

    let resultContent: string | null = null;
    try {
      // Run the task function against the worktree
      resultContent = await runTaskFn(worktree.path);
    } catch (e: any) {
      watcher?.dispose();
      this.worktreeManager.setStatus(worktree.id, 'error');
      if (opts.cleanupOnFailure) {
        await this.worktreeManager.abandon(worktree.id).catch(() => null);
      }
      return this.failureResult(worktree, [], null, `Task function threw: ${e?.message ?? String(e)}`);
    }
    watcher?.dispose();

    // Commit any written changes inside the worktree so they're part of the branch
    await this.commitWorktreeChanges(worktree, input.description).catch((e) =>
      Logger.warn(`[IsolatedExecutor] commit failed: ${String(e)}`)
    );

    // Compute the changed file list from git (authoritative, vs. the watcher)
    const gitChanged = await this.getChangedFiles(worktree);
    const allChanged = [...new Set([...gitChanged, ...changedFiles])];

    // Run verifier on the primary file if requested
    let report: VerificationReport | null = null;
    if (opts.runVerifier && input.filePath && resultContent) {
      try {
        report = await this.verifier.verifyCode(resultContent, input.filePath, input.language);
      } catch (e: any) {
        Logger.warn(`[IsolatedExecutor] verifier failed: ${String(e)}`);
      }
    }

    // Decide: merge or keep
    let merged = false;
    if (opts.autoMerge) {
      const passed = !report || report.verdict === 'pass' || report.verdict === 'warning';
      if (passed) {
        const mergeResult = await this.worktreeManager.merge(worktree.id, 'merge');
        merged = mergeResult.success;
        if (merged && opts.cleanupOnSuccess) {
          await this.worktreeManager.abandon(worktree.id).catch(() => null);
        }
      } else {
        // Verifier failed — preserve the worktree for inspection
        this.worktreeManager.setStatus(worktree.id, 'completed');
      }
    } else {
      this.worktreeManager.setStatus(worktree.id, 'completed');
    }

    return {
      success: true,
      worktree,
      changedFiles: allChanged,
      resultContent,
      verificationReport: report,
      merged,
      error: null,
    };
  }

  // ============================================================
  // Parallel execution — run N task functions in N worktrees concurrently
  // ============================================================

  /**
   * Execute `taskFns.length` tasks in parallel, each in its own worktree.
   * Used by the Best-of-N generator.
   */
  async executeParallel(
    input: IsolatedTaskInput,
    taskFns: Array<(worktreePath: string) => Promise<string>>,
    options: Partial<IsolatedExecutorOptions> = {}
  ): Promise<IsolatedTaskResult[]> {
    // Important: disable autoMerge for parallel — the caller picks a winner
    // and merges that one explicitly.
    const parallelOpts: Partial<IsolatedExecutorOptions> = {
      ...options,
      autoMerge: false,
      cleanupOnSuccess: false,
    };
    const results = await Promise.allSettled(
      taskFns.map((fn, i) =>
        this.execute(
          { ...input, label: `${input.label ?? input.description} #${i + 1}` },
          fn,
          parallelOpts
        )
      )
    );
    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : this.failureResult(
            null,
            [],
            null,
            `Parallel task ${i} rejected: ${String((r as PromiseRejectedResult).reason)}`
          )
    );
  }

  // ============================================================
  // Helpers
  // ============================================================

  private async commitWorktreeChanges(
    worktree: WorktreeInstance,
    description: string
  ): Promise<void> {
    // Stage everything
    const addResult = await this.git.exec(['add', '-A'], { cwd: worktree.path });
    if (addResult.exitCode !== 0) return;

    // Anything to commit?
    const statusResult = await this.git.exec(['status', '--porcelain'], { cwd: worktree.path });
    if (!statusResult.stdout.trim()) return;

    const message = `INA Coding: ${description.substring(0, 72)}`;
    const commitResult = await this.git.exec(
      ['commit', '-m', message, '--author', 'INA Coding <ina@inagpt.com>'],
      { cwd: worktree.path }
    );
    if (commitResult.exitCode !== 0) {
      Logger.warn(`[IsolatedExecutor] commit exit ${commitResult.exitCode}: ${commitResult.stderr}`);
    }
  }

  private async getChangedFiles(worktree: WorktreeInstance): Promise<string[]> {
    // Compare worktree branch against its base commit
    const result = await this.git.exec(
      ['diff', '--name-only', `${worktree.baseCommit}..HEAD`],
      { cwd: worktree.path }
    );
    if (result.exitCode !== 0) return [];
    return result.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((rel) => path.join(worktree.path, rel));
  }

  private failureResult(
    worktree: WorktreeInstance | null,
    changedFiles: string[],
    report: VerificationReport | null,
    error: string
  ): IsolatedTaskResult {
    return {
      success: false,
      worktree: worktree ?? {
        id: '(none)',
        path: '',
        branch: '',
        parentBranch: '',
        baseCommit: '',
        status: 'error',
        agentSessionId: null,
        label: null,
        conflictCount: 0,
        lastError: error,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      changedFiles,
      resultContent: null,
      verificationReport: report,
      merged: false,
      error,
    };
  }

  // ============================================================
  // Utility — write a file inside a worktree
  // ============================================================

  /** Write content to a file inside the worktree (creates directories). */
  static writeFileInWorktree(worktreePath: string, relFilePath: string, content: string): void {
    const full = path.join(worktreePath, relFilePath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}
