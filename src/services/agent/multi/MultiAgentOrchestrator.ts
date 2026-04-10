/**
 * MultiAgentOrchestrator.ts
 * Phase 18.1 — The orchestrator that runs multi-agent workflows
 *
 * Lifecycle:
 *   1. decompose(userRequest) → TaskGraph
 *      PLANNER agent breaks a free-form request into a DAG of tasks.
 *   2. execute(graph) → AsyncGenerator<OrchestratorEvent>
 *      Runs tasks respecting dependencies, concurrent within budget,
 *      retries with exponential backoff, optionally verifies CODER output.
 *
 * All model calls route through ApiService (INA-7 Pro on the INA GPT backend).
 * UI labels are always brand-safe — model names never leak to the user.
 */

import * as vscode from 'vscode';
import {
  AgentInstance,
  AgentRole,
  AgentTask,
  DelegationStrategy,
  DEFAULT_ORCHESTRATOR_CONFIG,
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorState,
  createEmptyOrchestratorState,
} from './MultiAgentTypes';
import { AgentFactory } from './AgentFactory';
import { TaskGraph } from './TaskGraph';
import { ApiService } from '../../ApiService';
import { Logger } from '../../../utils/Logger';

// ============================================================

export class MultiAgentOrchestrator {
  private static instance: MultiAgentOrchestrator;

  private factory: AgentFactory;
  private apiService: ApiService | null = null;
  private config: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG };

  private state: OrchestratorState = createEmptyOrchestratorState();
  private currentGraph: TaskGraph | null = null;

  /** Cancellation + pause state */
  private abortController: AbortController | null = null;
  private pauseResolver: (() => void) | null = null;
  private pausePromise: Promise<void> | null = null;

  /**
   * Round-robin index per role (for 'round-robin' delegation strategy).
   */
  private rrIndex = new Map<AgentRole, number>();

  /**
   * Event queue consumed by the execute() async generator.
   */
  private eventQueue: OrchestratorEvent[] = [];
  private eventResolver: ((event: OrchestratorEvent | null) => void) | null = null;

  /**
   * Optional verifier orchestrator — set by extension.ts after both
   * orchestrators are constructed (avoids a circular import).
   */
  private verifier: {
    verifyCode(code: string, filePath: string, language: string): Promise<any>;
  } | null = null;

  /**
   * Optional Best-of-N orchestrator — when a task's risk is 'high' or
   * 'critical', we route the CODER step through best-of-N instead of
   * a single-shot call. Set by extension.ts after both orchestrators
   * are constructed.
   */
  private bestOfN: {
    shouldUseBestOfN(task: { metadata?: Record<string, unknown> }): boolean;
    runForTask(input: {
      taskId: string;
      description: string;
      filePath: string;
      language: string;
      existingCode?: string;
      extraContext?: string;
    }): Promise<string | null>;
  } | null = null;

  // ============================================================
  // VS Code EventEmitter (simpler API for consumers that just want
  // plain-style subscriptions instead of the async generator)
  // ============================================================
  private readonly _onEvent = new vscode.EventEmitter<OrchestratorEvent>();
  readonly onEvent = this._onEvent.event;

  private constructor() {
    this.factory = AgentFactory.getInstance();
  }

  static getInstance(): MultiAgentOrchestrator {
    if (!MultiAgentOrchestrator.instance) {
      MultiAgentOrchestrator.instance = new MultiAgentOrchestrator();
    }
    return MultiAgentOrchestrator.instance;
  }

  initialize(apiService: ApiService, config?: Partial<OrchestratorConfig>): void {
    this.apiService = apiService;
    if (config) this.config = { ...this.config, ...config };
    Logger.info('[MultiAgent] Orchestrator initialized');
  }

  setVerifier(verifier: { verifyCode(code: string, filePath: string, language: string): Promise<any> }): void {
    this.verifier = verifier;
  }

  setBestOfN(bestOfN: {
    shouldUseBestOfN(task: { metadata?: Record<string, unknown> }): boolean;
    runForTask(input: {
      taskId: string;
      description: string;
      filePath: string;
      language: string;
      existingCode?: string;
      extraContext?: string;
    }): Promise<string | null>;
  }): void {
    this.bestOfN = bestOfN;
  }

  // ============================================================
  // State snapshot
  // ============================================================

  getState(): OrchestratorState {
    return { ...this.state };
  }

  getCurrentGraph(): TaskGraph | null {
    return this.currentGraph;
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ============================================================
  // Decomposition — PLANNER agent breaks the request into a DAG
  // ============================================================

  async decompose(userRequest: string): Promise<TaskGraph> {
    if (!this.apiService) {
      throw new Error('MultiAgentOrchestrator not initialized (no ApiService)');
    }
    this.state.status = 'decomposing';
    this.emit({
      type: 'graph-decomposed',
      timestamp: Date.now(),
      message: `Decomposing: ${userRequest.substring(0, 120)}`,
    });

    const planner = this.factory.createAgent(AgentRole.PLANNER, { request: userRequest });
    this.factory.setStatus(planner.id, 'thinking');
    this.emit({
      type: 'agent-spawned',
      timestamp: Date.now(),
      agentId: planner.id,
      agentRole: AgentRole.PLANNER,
    });

    let rawResponse = '';
    try {
      const userMessage = [
        `User request: ${userRequest}`,
        '',
        'Decompose this into a DAG of tasks as specified in your system prompt.',
        'Respond with ONLY the JSON — no prose, no code fences.',
      ].join('\n');

      for await (const chunk of this.apiService.chatStream({
        messages: [
          { role: 'system', content: planner.systemPrompt },
          { role: 'user', content: userMessage },
        ],
        options: {
          model: planner.model,
          temperature: 0.3,
          maxTokens: Math.min(planner.tokenBudget, 4000),
        },
      } as any)) {
        if (typeof chunk === 'string') rawResponse += chunk;
      }
    } catch (e: any) {
      this.factory.setStatus(planner.id, 'error');
      this.factory.terminate(planner.id);
      this.state.status = 'failed';
      throw new Error(`Planner failed: ${e?.message ?? String(e)}`);
    }

    this.factory.setStatus(planner.id, 'done');
    this.factory.release(planner.id);

    const parsed = this.parsePlannerResponse(rawResponse);
    const graph = new TaskGraph(userRequest);
    for (const rawTask of parsed) {
      try {
        graph.addTask({
          id: rawTask.id,
          description: rawTask.description,
          requiredRole: rawTask.requiredRole,
          dependencies: rawTask.dependencies ?? [],
          priority: rawTask.priority ?? 0,
          metadata: rawTask.metadata ?? {},
        });
      } catch (e) {
        Logger.warn(`[MultiAgent] Skipped bad task: ${String(e)}`);
      }
    }

    this.currentGraph = graph;
    this.state.totalTasks = graph.size();
    this.emit({
      type: 'graph-decomposed',
      timestamp: Date.now(),
      message: `Graph ready: ${graph.size()} tasks`,
      data: { taskCount: graph.size(), criticalPath: graph.criticalPath() },
    });
    return graph;
  }

  // ============================================================
  // Execution — run the graph
  // ============================================================

  /**
   * Execute the current (or provided) graph. Yields OrchestratorEvents
   * as work happens. The caller can iterate to drive UI updates.
   */
  async *execute(graph?: TaskGraph): AsyncGenerator<OrchestratorEvent> {
    if (graph) this.currentGraph = graph;
    if (!this.currentGraph) throw new Error('No graph to execute');
    if (!this.apiService) throw new Error('Orchestrator not initialized');

    this.abortController = new AbortController();
    this.state = {
      ...createEmptyOrchestratorState(),
      totalTasks: this.currentGraph.size(),
      status: 'executing',
      startedAt: Date.now(),
    };

    yield this.emit({
      type: 'execution-started',
      timestamp: Date.now(),
      message: `Executing ${this.currentGraph.size()} tasks`,
    });

    // Async generator pattern: we pump events into eventQueue and yield them
    // as work progresses. Execution itself runs via runLoop().
    const loopPromise = this.runLoop();

    // Drain events as they arrive
    try {
      while (true) {
        if (this.eventQueue.length > 0) {
          yield this.eventQueue.shift()!;
          continue;
        }
        if ((this.state.status !== 'executing' && this.state.status !== 'paused') || this.abortController.signal.aborted) {
          break;
        }
        await new Promise<OrchestratorEvent | null>((resolve) => {
          this.eventResolver = resolve;
        });
        if (this.eventQueue.length > 0) {
          yield this.eventQueue.shift()!;
        }
      }
    } finally {
      await loopPromise.catch(() => {});
      // Drain any remaining events
      while (this.eventQueue.length > 0) {
        yield this.eventQueue.shift()!;
      }
    }
  }

  /** Internal run loop — schedules tasks, awaits them, retries on failure. */
  private async runLoop(): Promise<void> {
    if (!this.currentGraph || !this.abortController) return;

    const inflight = new Map<string, Promise<void>>();

    while (!this.abortController.signal.aborted) {
      // Pause gate
      if (this.pausePromise) {
        await this.pausePromise;
      }

      // If the graph is complete, we're done
      if (this.currentGraph.isComplete()) {
        break;
      }

      // Fetch ready tasks
      const ready = this.currentGraph.getReadyTasks();
      const capacity = this.config.maxConcurrentAgents - inflight.size;

      if (ready.length === 0 && inflight.size === 0) {
        // Deadlock: nothing running and nothing ready, but graph not complete.
        // Happens when upstream tasks failed and blocked their dependents.
        this.markBlockedAsSkipped();
        break;
      }

      // Dispatch up to `capacity` ready tasks
      const toStart = ready.slice(0, capacity);
      for (const task of toStart) {
        task.status = 'running';
        task.startedAt = Date.now();
        const promise = this.runTask(task).finally(() => {
          inflight.delete(task.id);
        });
        inflight.set(task.id, promise);
      }

      if (inflight.size === 0) {
        // Wait a beat for state changes, then loop
        await new Promise((r) => setTimeout(r, 50));
        continue;
      }

      // Wait for at least one task to finish
      await Promise.race([...inflight.values()]);
    }

    // Settle any remaining inflight tasks
    await Promise.allSettled([...inflight.values()]);

    // Terminal state
    if (this.abortController.signal.aborted) {
      this.state.status = 'cancelled';
      this.emit({ type: 'execution-cancelled', timestamp: Date.now() });
    } else if (this.currentGraph.hasFailures()) {
      this.state.status = 'failed';
      this.emit({ type: 'execution-failed', timestamp: Date.now() });
    } else {
      this.state.status = 'completed';
      this.state.completedAt = Date.now();
      this.emit({ type: 'execution-completed', timestamp: Date.now() });
    }

    // Unblock the generator
    if (this.eventResolver) {
      this.eventResolver(null);
      this.eventResolver = null;
    }
  }

  // ============================================================
  // Task execution (with retry + backoff + verification)
  // ============================================================

  private async runTask(task: AgentTask): Promise<void> {
    if (!this.currentGraph || !this.apiService || !this.abortController) return;

    const startTime = Date.now();
    let lastError: Error | null = null;

    // Pick / spawn an agent for this task
    const agent = this.pickAgent(task.requiredRole);
    task.assignedAgent = agent.id;
    agent.activeTaskCount++;
    this.state.activeAgents = this.factory.getActiveCount();

    this.emit({
      type: 'task-assigned',
      timestamp: Date.now(),
      taskId: task.id,
      agentId: agent.id,
      agentRole: agent.role,
      message: task.description,
    });

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (this.abortController.signal.aborted) {
        task.status = 'cancelled';
        task.error = 'Cancelled';
        break;
      }

      if (attempt > 0) {
        task.retries = attempt;
        const delay = Math.min(
          this.config.retryBaseDelayMs * Math.pow(2, attempt - 1),
          this.config.retryMaxDelayMs
        );
        this.emit({
          type: 'task-retried',
          timestamp: Date.now(),
          taskId: task.id,
          agentId: agent.id,
          message: `Retry ${attempt}/${this.config.maxRetries} in ${delay}ms`,
        });
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        this.factory.setStatus(agent.id, 'working');
        this.emit({
          type: 'task-started',
          timestamp: Date.now(),
          taskId: task.id,
          agentId: agent.id,
        });

        const rawOutput = await this.invokeAgent(agent, task);
        task.result = rawOutput;
        task.parsedResult = this.parseAgentOutput(agent.role, rawOutput);
        task.tokensUsed = this.estimateTokens(rawOutput);
        this.factory.recordTokens(agent.id, task.tokensUsed);
        this.state.totalTokensUsed += task.tokensUsed;

        // Verification hook (CODER only)
        if (agent.role === AgentRole.CODER && this.config.autoVerify && this.verifier) {
          this.emit({
            type: 'verification-started',
            timestamp: Date.now(),
            taskId: task.id,
            agentId: agent.id,
          });
          try {
            const filePath = (task.metadata.filePath as string) ?? 'unknown';
            const language = (task.metadata.language as string) ?? 'typescript';
            const verReport = await this.verifier.verifyCode(rawOutput, filePath, language);
            task.metadata.verification = verReport;
            this.emit({
              type: 'verification-completed',
              timestamp: Date.now(),
              taskId: task.id,
              data: verReport,
            });
            // Reject task if the verifier reports a critical issue
            if (verReport?.score !== undefined && verReport.score < 50) {
              throw new Error(`Verification failed (score ${verReport.score}/100)`);
            }
          } catch (verErr: any) {
            Logger.warn(`[MultiAgent] Verification threw: ${String(verErr)}`);
            // Non-fatal — keep task as completed but flag the issue in metadata
            task.metadata.verificationError = String(verErr);
          }
        }

        // Success
        task.status = 'completed';
        task.completedAt = Date.now();
        task.durationMs = task.completedAt - startTime;
        this.state.completedTasks++;
        this.factory.setStatus(agent.id, 'done');
        this.emit({
          type: 'task-completed',
          timestamp: Date.now(),
          taskId: task.id,
          agentId: agent.id,
          data: { durationMs: task.durationMs, tokensUsed: task.tokensUsed },
        });
        break;
      } catch (e: any) {
        lastError = e instanceof Error ? e : new Error(String(e));
        Logger.warn(`[MultiAgent] Task ${task.id} attempt ${attempt + 1} failed: ${lastError.message}`);
      }
    }

    if (task.status !== 'completed' && task.status !== 'cancelled') {
      task.status = 'failed';
      task.error = lastError?.message ?? 'Unknown error';
      task.completedAt = Date.now();
      task.durationMs = task.completedAt - startTime;
      this.state.failedTasks++;
      this.factory.setStatus(agent.id, 'error');
      this.emit({
        type: 'task-failed',
        timestamp: Date.now(),
        taskId: task.id,
        agentId: agent.id,
        message: task.error,
      });
    }

    agent.activeTaskCount--;
    this.factory.release(agent.id);
    this.state.activeAgents = this.factory.getActiveCount();
  }

  /** Actually call the backend to run the agent against this task. */
  private async invokeAgent(agent: AgentInstance, task: AgentTask): Promise<string> {
    if (!this.apiService) throw new Error('No API service');
    if (!this.abortController) throw new Error('No abort controller');

    // Build user prompt from task + dependency results
    const depResults = this.currentGraph?.getDependencyResults(task.id) ?? [];
    const depBlock =
      depResults.length > 0
        ? '\n\nResults from prior tasks:\n' +
          depResults
            .map((d) => `### Task ${d.id} (${d.description})\n${d.result ?? '(no result)'}`)
            .join('\n\n')
        : '';

    // Phase 18.4 — if this is a high-risk CODER task, delegate to Best-of-N
    if (
      agent.role === AgentRole.CODER &&
      this.bestOfN &&
      this.bestOfN.shouldUseBestOfN(task)
    ) {
      Logger.info(`[MultiAgent] Routing high-risk task ${task.id} through Best-of-N`);
      const winnerCode = await this.bestOfN.runForTask({
        taskId: task.id,
        description: task.description,
        filePath: (task.metadata.filePath as string) ?? 'unknown',
        language: (task.metadata.language as string) ?? 'typescript',
        existingCode: task.metadata.existingCode as string | undefined,
        extraContext: depBlock || undefined,
      });
      if (winnerCode) {
        return winnerCode;
      }
      // Fall through to single-shot if best-of-N failed
      Logger.warn(`[MultiAgent] Best-of-N failed for task ${task.id}, falling back`);
    }

    const userPrompt = [
      `Task id: ${task.id}`,
      `Description: ${task.description}`,
      task.metadata.filePath ? `File: ${task.metadata.filePath}` : '',
      task.metadata.language ? `Language: ${task.metadata.language}` : '',
      depBlock,
    ]
      .filter(Boolean)
      .join('\n');

    const timeoutMs = this.config.taskTimeout;
    const timeoutSignal = new AbortController();
    const timer = setTimeout(() => timeoutSignal.abort(), timeoutMs);

    // Combine the orchestrator abort + per-task timeout into one signal
    const combined = new AbortController();
    const onAbort = () => combined.abort();
    this.abortController.signal.addEventListener('abort', onAbort);
    timeoutSignal.signal.addEventListener('abort', onAbort);

    let output = '';
    try {
      for await (const chunk of this.apiService.chatStream(
        {
          messages: [
            { role: 'system', content: agent.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          options: {
            model: agent.model,
            temperature: agent.role === AgentRole.CODER ? 0.2 : 0.4,
            maxTokens: Math.min(agent.tokenBudget, 4000),
          },
        } as any,
        combined.signal
      )) {
        if (typeof chunk === 'string') output += chunk;
        this.emit({
          type: 'task-progress',
          timestamp: Date.now(),
          taskId: task.id,
          agentId: agent.id,
          data: { partial: chunk },
        });
      }
    } finally {
      clearTimeout(timer);
      this.abortController.signal.removeEventListener('abort', onAbort);
    }

    if (!output.trim()) {
      throw new Error('Empty response from agent');
    }
    return output;
  }

  // ============================================================
  // Agent selection (delegation strategy)
  // ============================================================

  private pickAgent(role: AgentRole): AgentInstance {
    const strategy: DelegationStrategy = this.config.delegationStrategy;

    if (strategy === 'load-balanced') {
      const existing = this.factory.findLeastLoaded(role);
      if (existing && existing.activeTaskCount < 2) return existing;
    }
    if (strategy === 'round-robin') {
      const idx = (this.rrIndex.get(role) ?? 0) + 1;
      this.rrIndex.set(role, idx);
      // Round-robin always spawns new agents; pool is disabled in this mode
    }
    // 'specialist' and default fallback: always spawn a fresh agent
    return this.factory.createAgent(role);
  }

  // ============================================================
  // Pause / resume / cancel
  // ============================================================

  pause(): void {
    if (this.state.status !== 'executing') return;
    this.state.status = 'paused';
    this.pausePromise = new Promise((resolve) => {
      this.pauseResolver = resolve;
    });
    this.emit({ type: 'execution-paused', timestamp: Date.now() });
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.state.status = 'executing';
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
      this.pausePromise = null;
    }
    this.emit({ type: 'execution-resumed', timestamp: Date.now() });
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
      this.pausePromise = null;
    }
  }

  // ============================================================
  // Parsing helpers
  // ============================================================

  private parsePlannerResponse(raw: string): Array<{
    id: string;
    description: string;
    requiredRole: AgentRole;
    dependencies: string[];
    priority: number;
    metadata: Record<string, unknown>;
  }> {
    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to locate a JSON object inside the response
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error('Planner did not return JSON');
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        throw new Error('Planner JSON is malformed');
      }
    }

    const tasks = parsed?.tasks;
    if (!Array.isArray(tasks)) {
      throw new Error('Planner response missing "tasks" array');
    }

    const out: Array<any> = [];
    for (const t of tasks) {
      if (!t || typeof t !== 'object') continue;
      const id = String(t.id ?? '');
      const description = String(t.description ?? '').trim();
      const roleStr = String(t.requiredRole ?? '').toLowerCase();
      const role = this.parseRole(roleStr);
      if (!id || !description || !role) continue;
      out.push({
        id,
        description,
        requiredRole: role,
        dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
        priority: Number.isFinite(t.priority) ? Number(t.priority) : 0,
        metadata: t.metadata && typeof t.metadata === 'object' ? t.metadata : {},
      });
    }
    return out;
  }

  private parseRole(s: string): AgentRole | null {
    for (const role of Object.values(AgentRole)) {
      if (role === s) return role;
    }
    return null;
  }

  private parseAgentOutput(role: AgentRole, raw: string): any {
    // CODER / TESTER / REFACTORER produce code blocks — leave raw string
    if (role === AgentRole.CODER || role === AgentRole.TESTER || role === AgentRole.REFACTORER) {
      return raw;
    }
    // REVIEWER / SECURITY_AUDITOR / PLANNER produce JSON
    const cleaned = raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          return raw;
        }
      }
      return raw;
    }
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /** Mark any remaining pending tasks as skipped (blocked by upstream failures). */
  private markBlockedAsSkipped(): void {
    if (!this.currentGraph) return;
    for (const task of this.currentGraph.getAllTasks()) {
      if (task.status === 'pending' || task.status === 'ready') {
        task.status = 'skipped';
        task.error = 'Blocked by upstream failure';
        this.emit({
          type: 'task-failed',
          timestamp: Date.now(),
          taskId: task.id,
          message: 'Skipped — upstream failure',
        });
      }
    }
  }

  // ============================================================
  // Event emission
  // ============================================================

  private emit(event: OrchestratorEvent): OrchestratorEvent {
    this.eventQueue.push(event);
    this._onEvent.fire(event);
    if (this.eventResolver) {
      const resolve = this.eventResolver;
      this.eventResolver = null;
      resolve(event);
    }
    return event;
  }

  // ============================================================
  // Cleanup
  // ============================================================

  dispose(): void {
    this.cancel();
    this._onEvent.dispose();
    this.eventQueue.length = 0;
    this.currentGraph = null;
  }
}
