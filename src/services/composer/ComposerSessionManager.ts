/**
 * ComposerSessionManager.ts
 * Phase 16.1 — Composer UI Enhancement
 *
 * Singleton that owns Composer sessions. Wraps the existing Agent stack
 * (PlanningService, ExecutionEngine, ReviewService, RollbackManager) and
 * provides a high-level Composer-shaped API: create session, plan, execute,
 * iteratively refine, accept/reject files and hunks, and checkpoint/restore.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  ComposerSession,
  ComposerStatus,
  ComposerCheckpoint,
  ComposerCheckpointType,
  ComposerFileChange,
  ComposerFileChangeStatus,
  ComposerMessage,
  ComposerRefinement,
  ComposerStats,
  ComposerProgressUpdate,
  ComposerStatusChangedEvent,
  ComposerFileChangedEvent,
  ComposerCheckpointCreatedEvent,
  createEmptyStats,
} from './ComposerTypes';
import { ComposerDiffEngine } from './ComposerDiffEngine';
import { AgentModeManager } from '../agent/AgentModeManager';
import { PlanningService } from '../agent/planning/PlanningService';
import { ExecutionEngine } from '../agent/execution/ExecutionEngine';
import { ReviewService } from '../agent/review/ReviewService';
import { RollbackManager } from '../agent/execution/RollbackManager';
import { ApiService } from '../ApiService';
import { Logger } from '../../utils/Logger';
import {
  PlanRequest,
  PlanResponse,
} from '../agent/planning/PlanningTypes';
import { DEFAULT_AGENT_CONFIG } from '../agent/AgentTypes';
import { DEFAULT_EXECUTION_CONFIG } from '../agent/execution/ExecutionTypes';

export class ComposerSessionManager {
  private static instance: ComposerSessionManager;

  private sessions: Map<string, ComposerSession> = new Map();
  private activeSessionId: string | null = null;

  private agentModeManager!: AgentModeManager;
  private planningService!: PlanningService;
  private executionEngine!: ExecutionEngine;
  private reviewService!: ReviewService;
  private rollbackManager!: RollbackManager;
  private diffEngine!: ComposerDiffEngine;
  private apiService: ApiService | null = null;

  // ============ Events ============
  private readonly _onSessionChanged = new vscode.EventEmitter<ComposerSession>();
  readonly onSessionChanged = this._onSessionChanged.event;

  private readonly _onFileChanged = new vscode.EventEmitter<ComposerFileChangedEvent>();
  readonly onFileChanged = this._onFileChanged.event;

  private readonly _onCheckpointCreated = new vscode.EventEmitter<ComposerCheckpointCreatedEvent>();
  readonly onCheckpointCreated = this._onCheckpointCreated.event;

  private readonly _onStatusChanged = new vscode.EventEmitter<ComposerStatusChangedEvent>();
  readonly onStatusChanged = this._onStatusChanged.event;

  private readonly _onProgressUpdate = new vscode.EventEmitter<ComposerProgressUpdate>();
  readonly onProgressUpdate = this._onProgressUpdate.event;

  private constructor() {}

  static getInstance(): ComposerSessionManager {
    if (!ComposerSessionManager.instance) {
      ComposerSessionManager.instance = new ComposerSessionManager();
    }
    return ComposerSessionManager.instance;
  }

  /**
   * One-time wiring of dependencies. Called from extension.ts during activate.
   */
  initialize(deps: {
    agentModeManager: AgentModeManager;
    planningService: PlanningService;
    executionEngine: ExecutionEngine;
    reviewService: ReviewService;
    rollbackManager: RollbackManager;
    diffEngine: ComposerDiffEngine;
    apiService?: ApiService;
  }): void {
    this.agentModeManager = deps.agentModeManager;
    this.planningService = deps.planningService;
    this.executionEngine = deps.executionEngine;
    this.reviewService = deps.reviewService;
    this.rollbackManager = deps.rollbackManager;
    this.diffEngine = deps.diffEngine;
    this.apiService = deps.apiService ?? null;
    Logger.info('[Composer] SessionManager initialized');
  }

  // ============================================================
  // Session lifecycle
  // ============================================================

  createSession(instruction: string): ComposerSession {
    const id = this.generateId('comp');
    const now = Date.now();

    const session: ComposerSession = {
      id,
      status: 'planning',
      instruction,
      refinements: [],
      plan: null,
      execution: null,
      fileChanges: [],
      checkpoints: [],
      currentCheckpointIndex: -1,
      conversation: [],
      stats: createEmptyStats(),
      createdAt: now,
      updatedAt: now,
    };

    // Initial system + user messages
    this.addMessage(session, 'system', 'Composer session started', { instruction });
    this.addMessage(session, 'user', instruction, {});

    // Initial workspace snapshot checkpoint
    const initialCp = this.snapshotInitialCheckpoint(session, instruction);
    session.checkpoints.push(initialCp);
    session.currentCheckpointIndex = 0;
    session.stats.checkpointCount = 1;

    this.sessions.set(id, session);
    this.activeSessionId = id;

    Logger.info(`[Composer] Session created: ${id}`);
    this._onSessionChanged.fire(session);
    this._onCheckpointCreated.fire({ sessionId: id, checkpoint: initialCp });
    return session;
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    Logger.info(`[Composer] Session closed: ${sessionId}`);
  }

  getSession(sessionId: string): ComposerSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSession(): ComposerSession | null {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId) ?? null : null;
  }

  // ============================================================
  // Planning
  // ============================================================

  async startPlanning(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Composer session not found: ${sessionId}`);

    this.transitionStatus(session, 'planning');

    try {
      const planRequest: PlanRequest = {
        prompt: session.instruction,
        context: this.buildPlanContext(),
        agentConfig: DEFAULT_AGENT_CONFIG,
        sessionId: session.id,
      };

      const planResponse: PlanResponse = await this.planningService.generatePlan(planRequest);
      session.plan = planResponse;
      session.stats.planSteps = planResponse.plan.steps.length;
      session.updatedAt = Date.now();

      this.addMessage(session, 'plan', this.formatPlanSummary(planResponse), {
        planId: session.id,
        stepCount: planResponse.plan.steps.length,
      });

      // Checkpoint after planning
      const cp = this.createCheckpointInternal(session, 'Plan generated', 'plan', session.instruction);
      session.checkpoints.push(cp);
      session.currentCheckpointIndex = session.checkpoints.length - 1;
      session.stats.checkpointCount++;

      this._onCheckpointCreated.fire({ sessionId: session.id, checkpoint: cp });
      this.transitionStatus(session, 'reviewing');
    } catch (err: any) {
      Logger.error('[Composer] Planning failed:', err);
      this.addMessage(session, 'system', `Planning failed: ${err?.message ?? String(err)}`, {
        error: true,
      });
      this.transitionStatus(session, 'failed');
      throw err;
    }
  }

  // ============================================================
  // Execution
  // ============================================================

  async executePlan(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Composer session not found: ${sessionId}`);
    if (!session.plan) throw new Error('Cannot execute: no plan');

    this.transitionStatus(session, 'executing');
    const startTime = Date.now();

    // Snapshot file contents pre-execution so we can compute diffs after
    const preSnapshots = new Map<string, string>();
    for (const filePath of session.plan.plan.affectedFiles) {
      preSnapshots.set(filePath, this.safeReadFile(filePath));
    }

    try {
      // Mark plan as approved (ExecutionEngine relies on plan.approved field via plan steps)
      session.plan.plan.approved = true;

      // Wire progress events (Node EventEmitter — return value is the emitter, not Disposable)
      const onStepComplete = (payload: any) => {
        const stepIndex = payload?.stepIndex ?? 0;
        const total = session.plan?.plan.steps.length ?? 0;
        session.stats.stepsCompleted = Math.min(stepIndex + 1, total);
        this._onProgressUpdate.fire({
          sessionId: session.id,
          stepIndex,
          totalSteps: total,
          currentStepDescription: payload?.step?.description ?? '',
          status: 'executing',
          percentComplete: total > 0 ? Math.round(((stepIndex + 1) / total) * 100) : 0,
        });
      };
      const onStepFailed = () => {
        session.stats.stepsFailed++;
      };
      this.executionEngine.on('step-complete', onStepComplete);
      this.executionEngine.on('step-failed', onStepFailed);

      // Synthesize an AgentSession-like object for execution
      const agentSessionLike = {
        id: session.id,
        mode: 'agent',
        status: 'executing',
        plan: session.plan.plan,
        changes: [],
        startTime,
        endTime: null,
        prompt: session.instruction,
        context: {},
      } as any;

      const result = await this.executionEngine.executePlan(
        session.plan.plan,
        agentSessionLike,
        DEFAULT_EXECUTION_CONFIG
      );

      try {
        this.executionEngine.off('step-complete', onStepComplete);
        this.executionEngine.off('step-failed', onStepFailed);
      } catch {
        /* noop */
      }

      session.execution = this.executionEngine.getProgress?.() ?? null;
      session.stats.executionTimeMs = Date.now() - startTime;

      // Compute file changes by comparing pre-snapshots to current disk state
      this.collectFileChangesFromSnapshots(session, preSnapshots);

      this.addMessage(
        session,
        'execution',
        `Execution complete: ${session.stats.stepsCompleted}/${session.stats.planSteps} steps, ${session.fileChanges.length} files changed`,
        { result }
      );

      // Checkpoint after execution
      const cp = this.createCheckpointInternal(
        session,
        'Execution complete',
        'execution',
        session.instruction
      );
      session.checkpoints.push(cp);
      session.currentCheckpointIndex = session.checkpoints.length - 1;
      session.stats.checkpointCount++;
      this._onCheckpointCreated.fire({ sessionId: session.id, checkpoint: cp });

      this.transitionStatus(session, 'reviewing');
    } catch (err: any) {
      Logger.error('[Composer] Execution failed:', err);
      this.addMessage(session, 'system', `Execution failed: ${err?.message ?? String(err)}`, {
        error: true,
      });
      this.transitionStatus(session, 'failed');
      throw err;
    }
  }

  // ============================================================
  // Refinement (the iterative-edit key feature)
  // ============================================================

  async refine(sessionId: string, followUpInstruction: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Composer session not found: ${sessionId}`);

    const refinement: ComposerRefinement = {
      id: this.generateId('ref'),
      instruction: followUpInstruction,
      timestamp: Date.now(),
      planDelta: null,
      status: 'pending',
    };
    session.refinements.push(refinement);
    session.stats.refinementCount = session.refinements.length;

    this.addMessage(session, 'user', followUpInstruction, { refinementId: refinement.id });
    this.transitionStatus(session, 'refining');

    refinement.status = 'planning';
    try {
      // Build incremental plan request — context summarizes prior state for the planner
      const summary = this.diffEngine.summarizeChanges(session.fileChanges);
      const incrementalPrompt = [
        `Previous instruction: ${session.instruction}`,
        `Previous changes: ${summary}`,
        `Follow-up: ${followUpInstruction}`,
        '',
        'Generate ONLY the additional changes needed to satisfy the follow-up.',
      ].join('\n');

      const planRequest: PlanRequest = {
        prompt: incrementalPrompt,
        context: this.buildPlanContext(),
        agentConfig: DEFAULT_AGENT_CONFIG,
        sessionId: session.id,
      };

      const incrementalPlan = await this.planningService.generatePlan(planRequest);
      refinement.planDelta = incrementalPlan;
      session.plan = incrementalPlan;
      session.stats.planSteps += incrementalPlan.plan.steps.length;

      this.addMessage(session, 'plan', this.formatPlanSummary(incrementalPlan), {
        refinementId: refinement.id,
        incremental: true,
      });

      // Execute the incremental plan, preserving previous changes
      refinement.status = 'executing';
      this.transitionStatus(session, 'executing');

      const preSnapshots = new Map<string, string>();
      for (const filePath of incrementalPlan.plan.affectedFiles) {
        preSnapshots.set(filePath, this.safeReadFile(filePath));
      }

      incrementalPlan.plan.approved = true;
      const agentSessionLike = {
        id: session.id,
        mode: 'agent',
        status: 'executing',
        plan: incrementalPlan.plan,
        changes: [],
        startTime: Date.now(),
        endTime: null,
        prompt: followUpInstruction,
        context: {},
      } as any;

      await this.executionEngine.executePlan(
        incrementalPlan.plan,
        agentSessionLike,
        DEFAULT_EXECUTION_CONFIG
      );
      this.collectFileChangesFromSnapshots(session, preSnapshots);

      refinement.status = 'completed';

      // Checkpoint after refinement
      const cp = this.createCheckpointInternal(
        session,
        `Refinement: ${followUpInstruction}`,
        'refinement',
        followUpInstruction
      );
      session.checkpoints.push(cp);
      session.currentCheckpointIndex = session.checkpoints.length - 1;
      session.stats.checkpointCount++;
      this._onCheckpointCreated.fire({ sessionId: session.id, checkpoint: cp });

      this.transitionStatus(session, 'reviewing');
    } catch (err: any) {
      refinement.status = 'failed';
      Logger.error('[Composer] Refinement failed:', err);
      this.addMessage(session, 'system', `Refinement failed: ${err?.message ?? String(err)}`, {
        error: true,
      });
      this.transitionStatus(session, 'failed');
      throw err;
    }
  }

  // ============================================================
  // Accept / Reject
  // ============================================================

  acceptFile(sessionId: string, filePath: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const change = session.fileChanges.find((f) => f.filePath === filePath);
    if (!change) return;
    change.accepted = true;
    if (change.hunkAccepted) {
      change.hunkAccepted = change.hunkAccepted.map(() => true);
    }
    session.updatedAt = Date.now();
    this._onFileChanged.fire({
      sessionId: session.id,
      fileChange: change,
      changeType: 'accepted',
    });
  }

  rejectFile(sessionId: string, filePath: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const change = session.fileChanges.find((f) => f.filePath === filePath);
    if (!change) return;
    change.accepted = false;
    if (change.hunkAccepted) {
      change.hunkAccepted = change.hunkAccepted.map(() => false);
    }

    // Revert on disk
    if (change.originalContent !== null) {
      this.safeWriteFile(change.filePath, change.originalContent);
    } else if (change.status === 'created') {
      // File was newly created — delete it
      try {
        if (fs.existsSync(change.filePath)) fs.unlinkSync(change.filePath);
      } catch (e) {
        Logger.warn(`[Composer] Failed to remove created file ${change.filePath}: ${String(e)}`);
      }
    }

    session.updatedAt = Date.now();
    this._onFileChanged.fire({
      sessionId: session.id,
      fileChange: change,
      changeType: 'rejected',
    });
  }

  async acceptAll(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const change of session.fileChanges) {
      if (change.accepted === false) continue;
      change.accepted = true;
      this.safeWriteFile(change.filePath, change.newContent);
    }
    session.updatedAt = Date.now();
    this.addMessage(session, 'system', 'All changes accepted', {});
    this.transitionStatus(session, 'completed');
  }

  async rejectAll(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    for (const change of session.fileChanges) {
      this.rejectFile(sessionId, change.filePath);
    }
    this.addMessage(session, 'system', 'All changes rejected', {});
    this.transitionStatus(session, 'failed');
  }

  acceptByHunk(sessionId: string, filePath: string, hunkIndex: number, accepted: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const change = session.fileChanges.find((f) => f.filePath === filePath);
    if (!change) return;
    if (!change.hunkAccepted) {
      change.hunkAccepted = change.diff.hunks.map(() => true);
    }
    if (hunkIndex < 0 || hunkIndex >= change.hunkAccepted.length) return;
    change.hunkAccepted[hunkIndex] = accepted;

    // Recompute newContent from accepted hunks
    const original = change.originalContent ?? '';
    const merged = this.diffEngine.applyHunks(original, change.diff.hunks, change.hunkAccepted);
    change.newContent = merged;

    session.updatedAt = Date.now();
    this._onFileChanged.fire({
      sessionId: session.id,
      fileChange: change,
      changeType: 'updated',
    });
  }

  // ============================================================
  // Checkpoints
  // ============================================================

  createCheckpoint(sessionId: string, description: string): ComposerCheckpoint {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Composer session not found: ${sessionId}`);

    const cp = this.createCheckpointInternal(session, description, 'manual', session.instruction);
    session.checkpoints.push(cp);
    session.currentCheckpointIndex = session.checkpoints.length - 1;
    session.stats.checkpointCount++;
    session.updatedAt = Date.now();

    this._onCheckpointCreated.fire({ sessionId: session.id, checkpoint: cp });
    return cp;
  }

  async restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const idx = session.checkpoints.findIndex((c) => c.id === checkpointId);
    if (idx < 0) return;

    const cp = session.checkpoints[idx];

    // Revert files to checkpoint snapshot
    for (const [filePath, content] of cp.fileSnapshots.entries()) {
      this.safeWriteFile(filePath, content);
    }

    // Drop file changes that came after this checkpoint
    session.fileChanges = session.fileChanges.filter(
      (fc) => session.checkpoints.findIndex((c) => c.id === fc.checkpointId) <= idx
    );

    // Drop refinements created after this checkpoint
    session.refinements = session.refinements.filter((r) => r.timestamp <= cp.timestamp);
    session.stats.refinementCount = session.refinements.length;

    session.currentCheckpointIndex = idx;
    session.updatedAt = Date.now();

    this.addMessage(session, 'system', `Restored to checkpoint: ${cp.description}`, {
      checkpointId,
    });
    this._onSessionChanged.fire(session);
  }

  // ============================================================
  // Getters
  // ============================================================

  getFileChanges(sessionId: string): ComposerFileChange[] {
    return this.sessions.get(sessionId)?.fileChanges ?? [];
  }

  getCheckpoints(sessionId: string): ComposerCheckpoint[] {
    return this.sessions.get(sessionId)?.checkpoints ?? [];
  }

  getConversation(sessionId: string): ComposerMessage[] {
    return this.sessions.get(sessionId)?.conversation ?? [];
  }

  getStats(sessionId: string): ComposerStats {
    return this.sessions.get(sessionId)?.stats ?? createEmptyStats();
  }

  // ============================================================
  // Pause / resume
  // ============================================================

  pauseExecution(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      this.executionEngine.pause?.();
    } catch (e) {
      Logger.warn(`[Composer] pauseExecution failed: ${String(e)}`);
    }
    this.transitionStatus(session, 'paused');
  }

  async resumeExecution(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      this.executionEngine.resume?.();
    } catch (e) {
      Logger.warn(`[Composer] resumeExecution failed: ${String(e)}`);
    }
    this.transitionStatus(session, 'executing');
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private transitionStatus(session: ComposerSession, status: ComposerStatus): void {
    const previous = session.status;
    session.status = status;
    session.updatedAt = Date.now();
    this._onStatusChanged.fire({
      sessionId: session.id,
      status,
      previousStatus: previous,
    });
    this._onSessionChanged.fire(session);
  }

  private addMessage(
    session: ComposerSession,
    role: ComposerMessage['role'],
    content: string,
    metadata: Record<string, any>
  ): ComposerMessage {
    const msg: ComposerMessage = {
      id: this.generateId('msg'),
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };
    session.conversation.push(msg);
    session.updatedAt = Date.now();
    return msg;
  }

  private createCheckpointInternal(
    session: ComposerSession,
    description: string,
    type: ComposerCheckpointType,
    instruction: string
  ): ComposerCheckpoint {
    const fileSnapshots = new Map<string, string>();
    // Snapshot all files currently tracked in the session
    for (const fc of session.fileChanges) {
      fileSnapshots.set(fc.filePath, this.safeReadFile(fc.filePath));
    }
    return {
      id: this.generateId('cp'),
      index: session.checkpoints.length,
      description,
      timestamp: Date.now(),
      fileSnapshots,
      instruction,
      type,
    };
  }

  private snapshotInitialCheckpoint(
    session: ComposerSession,
    instruction: string
  ): ComposerCheckpoint {
    return {
      id: this.generateId('cp'),
      index: 0,
      description: 'Initial state',
      timestamp: Date.now(),
      fileSnapshots: new Map<string, string>(),
      instruction,
      type: 'initial',
    };
  }

  private collectFileChangesFromSnapshots(
    session: ComposerSession,
    preSnapshots: Map<string, string>
  ): void {
    for (const [filePath, originalContent] of preSnapshots.entries()) {
      const newContent = this.safeReadFile(filePath);
      if (newContent === originalContent) continue;

      const status: ComposerFileChangeStatus = !originalContent
        ? 'created'
        : !newContent
          ? 'deleted'
          : 'modified';

      const diff = this.diffEngine.computeDiff(originalContent || '', newContent || '');
      const checkpointId =
        session.checkpoints[session.checkpoints.length - 1]?.id ?? session.checkpoints[0]?.id ?? '';

      // Replace existing entry for the same file or push new
      const existingIdx = session.fileChanges.findIndex((f) => f.filePath === filePath);
      const fileChange: ComposerFileChange = {
        filePath,
        status,
        diff,
        originalContent: originalContent || null,
        newContent: newContent || '',
        accepted: null,
        hunkAccepted: diff.hunks.map(() => true),
        checkpointId,
      };
      fileChange.risk = this.diffEngine.computeRisk(fileChange);

      if (existingIdx >= 0) {
        session.fileChanges[existingIdx] = fileChange;
        this._onFileChanged.fire({
          sessionId: session.id,
          fileChange,
          changeType: 'updated',
        });
      } else {
        session.fileChanges.push(fileChange);
        this._onFileChanged.fire({
          sessionId: session.id,
          fileChange,
          changeType: 'added',
        });
      }
    }

    // Recompute aggregate stats
    this.recomputeStats(session);
  }

  private recomputeStats(session: ComposerSession): void {
    const stats = session.stats;
    stats.totalFiles = session.fileChanges.length;
    stats.filesCreated = session.fileChanges.filter((f) => f.status === 'created').length;
    stats.filesModified = session.fileChanges.filter((f) => f.status === 'modified').length;
    stats.filesDeleted = session.fileChanges.filter((f) => f.status === 'deleted').length;
    stats.linesAdded = session.fileChanges.reduce((s, f) => s + f.diff.linesAdded, 0);
    stats.linesRemoved = session.fileChanges.reduce((s, f) => s + f.diff.linesRemoved, 0);
  }

  private buildPlanContext(): PlanRequest['context'] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const editor = vscode.window.activeTextEditor;
    return {
      currentFile: editor?.document.uri.fsPath,
      currentFileContent: editor?.document.getText(),
      selection: editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : undefined,
      workspaceRoot: root,
    };
  }

  private formatPlanSummary(plan: PlanResponse): string {
    const lines = [`Plan generated (${plan.plan.steps.length} steps):`];
    plan.plan.steps.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.description}`);
    });
    if (plan.warnings?.length) {
      lines.push('', 'Warnings:');
      for (const w of plan.warnings) lines.push(`  - ${w}`);
    }
    return lines.join('\n');
  }

  private safeReadFile(filePath: string): string {
    try {
      if (!filePath) return '';
      if (!fs.existsSync(filePath)) return '';
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return '';
    }
  }

  private safeWriteFile(filePath: string, content: string): void {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
      Logger.warn(`[Composer] Failed to write ${filePath}: ${String(e)}`);
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  dispose(): void {
    this._onSessionChanged.dispose();
    this._onFileChanged.dispose();
    this._onCheckpointCreated.dispose();
    this._onStatusChanged.dispose();
    this._onProgressUpdate.dispose();
    this.sessions.clear();
  }
}
