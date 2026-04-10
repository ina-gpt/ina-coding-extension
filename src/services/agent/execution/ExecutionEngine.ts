import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EventEmitter } from 'events';
import {
  ExecutionState,
  ExecutionConfig,
  DEFAULT_EXECUTION_CONFIG,
  ExecutionContext,
  StepExecution,
  StepResult,
  StepError,
  RollbackData,
  RollbackType,
  ExecutionProgress,
  ExecutionResult,
  buildExecutionSummary,
} from './ExecutionTypes';
import { PlanStep } from '../planning/PlanningTypes';
import { AgentPlan, AgentSession } from '../AgentTypes';
import { StepExecutorRegistry } from './StepExecutorRegistry';
import { RollbackManager } from './RollbackManager';
import { Logger } from '../../../utils/Logger';
import { CodeSecurityGate } from '../../codesec/CodeSecurityGate';
import { GeneratedCodeScanner } from '../../codesec/GeneratedCodeScanner';

export class ExecutionEngine extends EventEmitter {
  private static instance: ExecutionEngine;
  private state: ExecutionState = ExecutionState.IDLE;
  private currentStepIndex = -1;
  private stepExecutions: Map<string, StepExecution> = new Map();
  private rollbackManager: RollbackManager;
  private executorRegistry: StepExecutorRegistry;
  private abortController: AbortController | null = null;
  private pauseResolve: (() => void) | null = null;
  private pausePromise: Promise<void> | null = null;
  private sessionId: string | null = null;
  private startTime = 0;

  private constructor() {
    super();
    this.rollbackManager = RollbackManager.getInstance();
    this.executorRegistry = StepExecutorRegistry.getInstance();
  }

  static getInstance(): ExecutionEngine {
    if (!ExecutionEngine.instance) {
      ExecutionEngine.instance = new ExecutionEngine();
    }
    return ExecutionEngine.instance;
  }

  async executePlan(
    plan: AgentPlan,
    session: AgentSession,
    config: ExecutionConfig = DEFAULT_EXECUTION_CONFIG
  ): Promise<ExecutionResult> {
    if (this.state === ExecutionState.EXECUTING) {
      throw new Error('Execution already in progress');
    }

    this.sessionId = session.id;
    this.startTime = Date.now();
    this.stepExecutions.clear();
    this.abortController = new AbortController();

    // 1. PREPARING
    this.setState(ExecutionState.PREPARING);

    // 2. Sort steps by dependency order
    const sortedSteps = this.sortByDependencies(plan.steps as PlanStep[]);

    // 3. Build execution context
    const context = this.buildExecutionContext(session, config);

    // 4. Emit start
    this.emit('execution-start', { sessionId: session.id, totalSteps: sortedSteps.length });

    // 5. EXECUTING
    this.setState(ExecutionState.EXECUTING);

    const completedStepIds: string[] = [];
    let cancelled = false;
    let failed = false;

    // 6. MAIN LOOP
    for (let i = 0; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      this.currentStepIndex = i;

      // Check abort
      if (this.abortController.signal.aborted) {
        this.setState(ExecutionState.CANCELLED);
        cancelled = true;
        break;
      }

      // Check pause
      if (this.state === ExecutionState.PAUSED) {
        await this.waitForResume();
        const stateAfterResume = this.state as ExecutionState;
        if (stateAfterResume === ExecutionState.CANCELLED) { cancelled = true; break; }
        if (stateAfterResume === ExecutionState.ROLLING_BACK) { failed = true; break; }
      }

      // Check dependencies
      const deps = step.dependencies || [];
      const depsFailed = deps.some((depId) => {
        const depExec = this.stepExecutions.get(depId);
        return depExec && depExec.status === ExecutionState.FAILED;
      });
      if (depsFailed) {
        const skipExec = this.createStepExecution(step.id);
        skipExec.status = ExecutionState.COMPLETED; // mark as skipped via a special status
        skipExec.status = ExecutionState.IDLE; // We'll use a convention
        this.stepExecutions.set(step.id, { ...skipExec, status: ExecutionState.IDLE });
        this.emit('step-skipped', { stepId: step.id, reason: 'Dependency failed' });
        continue;
      }

      // Get executor
      const executor = this.executorRegistry.getExecutor(step.type);
      if (!executor) {
        const errorExec = this.createStepExecution(step.id);
        errorExec.status = ExecutionState.FAILED;
        errorExec.error = { message: `No executor for step type: ${step.type}`, code: 'NO_EXECUTOR', recoverable: false, suggestion: null, stack: null };
        errorExec.endTime = Date.now();
        this.stepExecutions.set(step.id, errorExec);
        this.emit('step-failed', { stepId: step.id, error: errorExec.error });
        continue;
      }

      // Create step execution record
      const stepExec = this.createStepExecution(step.id);
      stepExec.status = ExecutionState.EXECUTING;
      stepExec.startTime = Date.now();
      this.stepExecutions.set(step.id, stepExec);
      this.emit('step-start', { stepId: step.id, index: i, description: step.description });

      // Execute with retry
      let success = false;
      let lastError: StepError | null = null;

      for (let attempt = 0; attempt <= (config.retryFailedSteps ? config.maxRetries : 0); attempt++) {
        if (attempt > 0) {
          stepExec.retryCount = attempt;
          this.emit('step-progress', { stepId: step.id, message: `Retrying (attempt ${attempt + 1})...` });
        }

        try {
          // Execute with timeout
          const result = await this.executeWithTimeout(executor, step, context, config.stepTimeoutMs);

          // Scan generated code for security issues before applying
          const scanner = GeneratedCodeScanner.getInstance();
          if (result.output && result.filesChanged.length > 0) {
            for (const changedFile of result.filesChanged) {
              const scanResult = scanner.scanBeforeApply(result.output, changedFile, 'replace');
              if (!scanResult.safe) {
                const warningMessages = scanResult.warnings.map(w => w.message).join(', ');
                throw new Error(`Security scan blocked step output for ${changedFile}: ${warningMessages}`);
              }
            }
          }

          // Store result
          stepExec.result = result;
          stepExec.status = ExecutionState.COMPLETED;
          stepExec.endTime = Date.now();
          stepExec.duration = stepExec.endTime - stepExec.startTime;
          stepExec.output.push(result.output);

          // Push rollback data if executor provided it
          if (stepExec.rollbackData) {
            this.rollbackManager.pushRollback(stepExec.rollbackData);
          }

          // Checkpoint after each successful step
          this.rollbackManager.createCheckpoint(session.id, i, completedStepIds);
          completedStepIds.push(step.id);

          this.stepExecutions.set(step.id, stepExec);
          this.emit('step-complete', { stepId: step.id, result, index: i });
          success = true;
          break;

        } catch (error) {
          lastError = {
            message: error instanceof Error ? error.message : 'Unknown error',
            code: 'EXECUTION_ERROR',
            recoverable: attempt < config.maxRetries,
            suggestion: null,
            stack: error instanceof Error ? error.stack || null : null,
          };
        }
      }

      if (!success) {
        stepExec.status = ExecutionState.FAILED;
        stepExec.error = lastError;
        stepExec.endTime = Date.now();
        stepExec.duration = stepExec.endTime - stepExec.startTime;
        this.stepExecutions.set(step.id, stepExec);
        this.emit('step-failed', { stepId: step.id, error: lastError });

        if (config.pauseOnError) {
          this.setState(ExecutionState.PAUSED);
          this.emit('execution-pause', { reason: 'Step failed', stepId: step.id });
          await this.waitForResume();
          if (this.state === ExecutionState.CANCELLED) { cancelled = true; break; }
          if (this.state === ExecutionState.ROLLING_BACK) {
            this.emit('rollback-start', {});
            await this.rollbackManager.rollbackAll();
            this.emit('rollback-complete', {});
            failed = true;
            break;
          }
          // If resumed, continue to next step
          continue;
        } else {
          this.setState(ExecutionState.ROLLING_BACK);
          this.emit('rollback-start', {});
          await this.rollbackManager.rollbackAll();
          this.emit('rollback-complete', {});
          failed = true;
          break;
        }
        // else: continue to next step
      }

      // Pause between steps if configured
      if (config.pauseBetweenSteps && i < sortedSteps.length - 1) {
        this.setState(ExecutionState.PAUSED);
        this.emit('execution-pause', { reason: 'Pause between steps' });
        await this.waitForResume();
        if (this.state === ExecutionState.CANCELLED) { cancelled = true; break; }
      }
    }

    // 7. Build result
    const endTime = Date.now();
    const completedCount = [...this.stepExecutions.values()].filter(e => e.status === ExecutionState.COMPLETED).length;
    const failedCount = [...this.stepExecutions.values()].filter(e => e.status === ExecutionState.FAILED).length;
    const skippedCount = sortedSteps.length - this.stepExecutions.size;
    const allFilesChanged = [...this.stepExecutions.values()]
      .filter(e => e.result)
      .flatMap(e => e.result!.filesChanged);

    const finalState = cancelled ? ExecutionState.CANCELLED : failed ? ExecutionState.FAILED : ExecutionState.COMPLETED;
    this.setState(finalState);

    const result: ExecutionResult = {
      sessionId: session.id,
      success: !cancelled && !failed,
      state: finalState,
      completedSteps: completedCount,
      failedSteps: failedCount,
      skippedSteps: skippedCount,
      totalSteps: sortedSteps.length,
      duration: endTime - this.startTime,
      stepResults: new Map(this.stepExecutions),
      filesChanged: [...new Set(allFilesChanged)],
      rollbackPerformed: failed && finalState === ExecutionState.FAILED,
      summary: '',
    };
    result.summary = buildExecutionSummary(result);

    const eventName = cancelled ? 'execution-cancelled' : failed ? 'execution-failed' : 'execution-complete';
    this.emit(eventName, result);

    return result;
  }

  pause(): void {
    if (this.state !== ExecutionState.EXECUTING) return;
    this.setState(ExecutionState.PAUSED);
    this.emit('execution-pause', { reason: 'User paused' });
  }

  resume(): void {
    if (this.state !== ExecutionState.PAUSED) return;
    this.setState(ExecutionState.EXECUTING);
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
      this.pausePromise = null;
    }
    this.emit('execution-resume', {});
  }

  cancel(): void {
    if (this.abortController) this.abortController.abort();
    this.setState(ExecutionState.CANCELLED);
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    this.emit('execution-cancelled', {});
  }

  skipCurrentStep(): void {
    if (this.state !== ExecutionState.PAUSED) return;
    // Resume will skip to next step since current step already recorded
    this.setState(ExecutionState.EXECUTING);
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  async rollbackAndStop(): Promise<void> {
    this.setState(ExecutionState.ROLLING_BACK);
    this.emit('rollback-start', {});
    await this.rollbackManager.rollbackAll();
    this.emit('rollback-complete', {});
    this.setState(ExecutionState.FAILED);
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  async rollbackLastStep(): Promise<void> {
    const result = await this.rollbackManager.rollbackLastStep();
    if (this.currentStepIndex > 0) this.currentStepIndex--;
    this.emit('rollback-step', result);
  }

  getProgress(): ExecutionProgress {
    const completed = [...this.stepExecutions.values()].filter(e => e.status === ExecutionState.COMPLETED).length;
    const failedCount = [...this.stepExecutions.values()].filter(e => e.status === ExecutionState.FAILED).length;
    const total = Math.max(this.stepExecutions.size, this.currentStepIndex + 1);
    const elapsed = Date.now() - this.startTime;
    const avgPerStep = completed > 0 ? elapsed / completed : 0;
    const remaining = Math.max(0, total - completed - failedCount);

    const currentExec = [...this.stepExecutions.values()].find(e => e.status === ExecutionState.EXECUTING);

    return {
      currentStepIndex: this.currentStepIndex,
      totalSteps: total,
      completedSteps: completed,
      failedSteps: failedCount,
      skippedSteps: 0,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      currentStepDescription: currentExec ? `Step ${this.currentStepIndex + 1}` : '',
      elapsedMs: elapsed,
      estimatedRemainingMs: Math.round(avgPerStep * remaining),
    };
  }

  getState(): ExecutionState {
    return this.state;
  }

  getStepExecutions(): Map<string, StepExecution> {
    return new Map(this.stepExecutions);
  }

  isActive(): boolean {
    return this.state === ExecutionState.EXECUTING || this.state === ExecutionState.PAUSED || this.state === ExecutionState.PREPARING;
  }

  dispose(): void {
    this.cancel();
    this.stepExecutions.clear();
    this.rollbackManager.dispose();
    this.removeAllListeners();
  }

  // ============ Private ============

  private setState(newState: ExecutionState): void {
    const old = this.state;
    this.state = newState;
    Logger.info(`Execution state: ${old} → ${newState}`);
  }

  private createStepExecution(stepId: string): StepExecution {
    return {
      stepId,
      status: ExecutionState.IDLE,
      startTime: 0,
      endTime: null,
      duration: null,
      result: null,
      error: null,
      retryCount: 0,
      output: [],
      rollbackData: null,
    };
  }

  private async waitForResume(): Promise<void> {
    if (!this.pausePromise) {
      this.pausePromise = new Promise<void>((resolve) => {
        this.pauseResolve = resolve;
      });
    }
    await this.pausePromise;
    this.pausePromise = null;
  }

  private sortByDependencies(steps: PlanStep[]): PlanStep[] {
    // Kahn's algorithm
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();
    const stepMap = new Map<string, PlanStep>();

    for (const step of steps) {
      inDegree.set(step.id, 0);
      adj.set(step.id, []);
      stepMap.set(step.id, step);
    }

    for (const step of steps) {
      if (step.dependencies) {
        for (const dep of step.dependencies) {
          if (adj.has(dep)) {
            adj.get(dep)!.push(step.id);
            inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
          }
        }
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: PlanStep[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(stepMap.get(current)!);
      for (const neighbor of adj.get(current) || []) {
        const newDeg = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (sorted.length < steps.length) {
      Logger.warn('Circular dependency detected in plan steps, using original order');
      return steps;
    }

    return sorted;
  }

  private buildExecutionContext(session: AgentSession, config: ExecutionConfig): ExecutionContext {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    return {
      workspaceRoot,
      sessionId: session.id,
      config,
      abortSignal: this.abortController!.signal,
      progress: (msg: string) => {
        this.emit('step-progress', { stepId: '', message: msg });
      },
      readFile: async (filePath: string): Promise<string> => {
        const fullPath = path.resolve(workspaceRoot, filePath);
        return fs.readFile(fullPath, 'utf-8');
      },
      writeFile: async (filePath: string, content: string): Promise<void> => {
        const fullPath = path.resolve(workspaceRoot, filePath);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
      },
      fileExists: async (filePath: string): Promise<boolean> => {
        const fullPath = path.resolve(workspaceRoot, filePath);
        try {
          await fs.access(fullPath);
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  private async executeWithTimeout(
    executor: import('./ExecutionTypes').StepExecutor,
    step: PlanStep,
    context: ExecutionContext,
    timeoutMs: number
  ): Promise<StepResult> {
    return new Promise<StepResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Step execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      executor.execute(step, context)
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((error) => { clearTimeout(timer); reject(error); });
    });
  }
}
