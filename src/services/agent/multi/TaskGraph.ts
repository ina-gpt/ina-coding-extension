/**
 * TaskGraph.ts
 * Phase 18.1 — Directed Acyclic Graph of AgentTasks
 *
 * The orchestrator uses this structure to:
 *   - Track task dependencies
 *   - Find "ready" tasks (all deps satisfied)
 *   - Detect circular dependencies (throw on add)
 *   - Compute topological order + critical path
 *   - Persist / restore across sessions
 */

import { AgentTask, AgentRole, TaskStatus } from './MultiAgentTypes';

// ============================================================

export interface TaskGraphSnapshot {
  version: number;
  tasks: AgentTask[];
  createdAt: number;
  description: string;
}

export class TaskGraph {
  /** taskId → task */
  private tasks = new Map<string, AgentTask>();
  /** taskId → set of taskIds that depend on it (reverse adjacency) */
  private dependents = new Map<string, Set<string>>();
  /** Human-readable description of the original request */
  readonly description: string;
  readonly createdAt: number;

  constructor(description: string = '') {
    this.description = description;
    this.createdAt = Date.now();
  }

  // ============================================================
  // Mutation
  // ============================================================

  /**
   * Add a task. Task id must be unique. Dependencies may reference tasks
   * added earlier OR later (provided addDependency is valid before execution).
   */
  addTask(task: Omit<AgentTask, 'status' | 'result' | 'parsedResult' | 'error' | 'retries' | 'durationMs' | 'tokensUsed' | 'createdAt' | 'startedAt' | 'completedAt' | 'assignedAgent'> & Partial<Pick<AgentTask, 'status' | 'priority' | 'metadata'>>): AgentTask {
    if (this.tasks.has(task.id)) {
      throw new Error(`Duplicate task id: ${task.id}`);
    }
    const now = Date.now();
    const fullTask: AgentTask = {
      id: task.id,
      description: task.description,
      requiredRole: task.requiredRole,
      assignedAgent: null,
      dependencies: [...(task.dependencies ?? [])],
      status: task.status ?? 'pending',
      result: null,
      parsedResult: null,
      error: null,
      retries: 0,
      durationMs: 0,
      tokensUsed: 0,
      priority: task.priority ?? 0,
      metadata: task.metadata ?? {},
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };

    // Validate each existing dependency exists — unknown deps are allowed
    // at add-time only if they will be added later (unchecked here).
    for (const depId of fullTask.dependencies) {
      if (depId === task.id) {
        throw new Error(`Task ${task.id} cannot depend on itself`);
      }
    }

    this.tasks.set(task.id, fullTask);
    if (!this.dependents.has(task.id)) this.dependents.set(task.id, new Set());
    for (const dep of fullTask.dependencies) {
      if (!this.dependents.has(dep)) this.dependents.set(dep, new Set());
      this.dependents.get(dep)!.add(task.id);
    }

    // Cycle detection — reject if this new task introduces one
    if (this.hasCycleFrom(task.id)) {
      // Roll back
      this.removeTask(task.id);
      throw new Error(`Adding task ${task.id} would introduce a cycle`);
    }

    return fullTask;
  }

  /** Add a dependency between two already-registered tasks. */
  addDependency(fromTaskId: string, toTaskId: string): void {
    if (fromTaskId === toTaskId) {
      throw new Error('Task cannot depend on itself');
    }
    const task = this.tasks.get(fromTaskId);
    if (!task) throw new Error(`Unknown task: ${fromTaskId}`);
    if (!this.tasks.has(toTaskId)) throw new Error(`Unknown task: ${toTaskId}`);

    if (task.dependencies.includes(toTaskId)) return;
    task.dependencies.push(toTaskId);
    if (!this.dependents.has(toTaskId)) this.dependents.set(toTaskId, new Set());
    this.dependents.get(toTaskId)!.add(fromTaskId);

    if (this.hasCycleFrom(fromTaskId)) {
      // Roll back
      task.dependencies.pop();
      this.dependents.get(toTaskId)!.delete(fromTaskId);
      throw new Error(`Adding dependency ${fromTaskId} → ${toTaskId} would create a cycle`);
    }
  }

  /** Remove a task and all references to it. */
  removeTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    // Remove from dependents' inbound edges
    for (const dep of task.dependencies) {
      this.dependents.get(dep)?.delete(taskId);
    }
    // Remove from tasks that depend on this one
    const downstream = this.dependents.get(taskId) ?? new Set();
    for (const dtId of downstream) {
      const dt = this.tasks.get(dtId);
      if (dt) {
        dt.dependencies = dt.dependencies.filter((d) => d !== taskId);
      }
    }
    this.tasks.delete(taskId);
    this.dependents.delete(taskId);
  }

  // ============================================================
  // Queries
  // ============================================================

  getTask(taskId: string): AgentTask | null {
    return this.tasks.get(taskId) ?? null;
  }

  getAllTasks(): AgentTask[] {
    return [...this.tasks.values()];
  }

  size(): number {
    return this.tasks.size;
  }

  /**
   * Return tasks that are ready to run — i.e. pending (or ready) AND all
   * their dependencies are completed. Sorted by priority DESC.
   */
  getReadyTasks(): AgentTask[] {
    const ready: AgentTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== 'pending' && task.status !== 'ready') continue;
      const allDepsDone = task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });
      if (allDepsDone) {
        task.status = 'ready';
        ready.push(task);
      }
    }
    ready.sort((a, b) => b.priority - a.priority);
    return ready;
  }

  /** Return all tasks that depend (transitively or directly) on the given task. */
  getDependents(taskId: string): string[] {
    const out = new Set<string>();
    const stack = [...(this.dependents.get(taskId) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      for (const d of this.dependents.get(id) ?? []) stack.push(d);
    }
    return [...out];
  }

  /** Return results of all direct dependencies (in declared order). */
  getDependencyResults(taskId: string): Array<{ id: string; description: string; result: string | null }> {
    const task = this.tasks.get(taskId);
    if (!task) return [];
    return task.dependencies
      .map((depId) => this.tasks.get(depId))
      .filter((t): t is AgentTask => !!t)
      .map((t) => ({ id: t.id, description: t.description, result: t.result }));
  }

  // ============================================================
  // Topological sort
  // ============================================================

  /**
   * Kahn's algorithm — returns tasks in a valid execution order.
   * Throws if a cycle is detected.
   */
  topologicalSort(): AgentTask[] {
    const inDegree = new Map<string, number>();
    for (const task of this.tasks.values()) {
      inDegree.set(task.id, task.dependencies.length);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    // Stable-sort the initial queue by priority DESC so the output order
    // is deterministic for same-priority tasks
    queue.sort((a, b) => {
      const pa = this.tasks.get(a)?.priority ?? 0;
      const pb = this.tasks.get(b)?.priority ?? 0;
      return pb - pa;
    });

    const result: AgentTask[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      const task = this.tasks.get(id)!;
      result.push(task);
      for (const d of this.dependents.get(id) ?? []) {
        const newDeg = (inDegree.get(d) ?? 0) - 1;
        inDegree.set(d, newDeg);
        if (newDeg === 0) queue.push(d);
      }
    }

    if (result.length !== this.tasks.size) {
      throw new Error('Cycle detected in task graph');
    }
    return result;
  }

  // ============================================================
  // Critical path (longest chain of dependencies by cumulative cost)
  // ============================================================

  /**
   * Compute the critical path — the longest dependency chain through the
   * graph. Uses task priority as a rough cost proxy when duration is unknown.
   * Returns an ordered list of task ids from source to sink.
   */
  criticalPath(): string[] {
    const sorted = this.topologicalSort();
    const longest = new Map<string, number>(); // taskId → max cost up to and including this task
    const predecessor = new Map<string, string | null>();

    for (const task of sorted) {
      let best = task.priority;
      let bestPred: string | null = null;
      for (const depId of task.dependencies) {
        const depCost = longest.get(depId) ?? 0;
        if (depCost + task.priority > best) {
          best = depCost + task.priority;
          bestPred = depId;
        }
      }
      longest.set(task.id, best);
      predecessor.set(task.id, bestPred);
    }

    // Find the sink with max cost
    let endNode: string | null = null;
    let maxCost = -Infinity;
    for (const [id, cost] of longest) {
      if (cost > maxCost) {
        maxCost = cost;
        endNode = id;
      }
    }

    if (!endNode) return [];

    // Walk back
    const path: string[] = [];
    let cursor: string | null = endNode;
    while (cursor) {
      path.unshift(cursor);
      cursor = predecessor.get(cursor) ?? null;
    }
    return path;
  }

  // ============================================================
  // Counts / state
  // ============================================================

  countByStatus(): Record<TaskStatus, number> {
    const counts: Record<TaskStatus, number> = {
      pending: 0,
      ready: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
    };
    for (const t of this.tasks.values()) counts[t.status]++;
    return counts;
  }

  isComplete(): boolean {
    for (const t of this.tasks.values()) {
      if (t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled' && t.status !== 'skipped') {
        return false;
      }
    }
    return true;
  }

  hasFailures(): boolean {
    for (const t of this.tasks.values()) {
      if (t.status === 'failed') return true;
    }
    return false;
  }

  // ============================================================
  // Serialization
  // ============================================================

  serialize(): TaskGraphSnapshot {
    return {
      version: 1,
      tasks: this.getAllTasks(),
      createdAt: this.createdAt,
      description: this.description,
    };
  }

  static deserialize(snapshot: TaskGraphSnapshot): TaskGraph {
    const graph = new TaskGraph(snapshot.description ?? '');
    // bypass normal addTask cycle check by directly populating internal state
    for (const task of snapshot.tasks) {
      graph.tasks.set(task.id, { ...task });
      if (!graph.dependents.has(task.id)) graph.dependents.set(task.id, new Set());
      for (const dep of task.dependencies) {
        if (!graph.dependents.has(dep)) graph.dependents.set(dep, new Set());
        graph.dependents.get(dep)!.add(task.id);
      }
    }
    // Sanity check — reject corrupt snapshots
    try {
      graph.topologicalSort();
    } catch (e) {
      throw new Error(`Corrupt TaskGraph snapshot: ${String(e)}`);
    }
    return graph;
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** Return a breakdown of tasks by required role (for UI). */
  roleBreakdown(): Record<AgentRole, number> {
    const out: Record<string, number> = {};
    for (const role of Object.values(AgentRole)) out[role] = 0;
    for (const t of this.tasks.values()) out[t.requiredRole] = (out[t.requiredRole] ?? 0) + 1;
    return out as Record<AgentRole, number>;
  }

  /** DFS cycle check starting from the given task. */
  private hasCycleFrom(startId: string): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (id: string): boolean => {
      if (stack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      stack.add(id);
      const task = this.tasks.get(id);
      if (task) {
        for (const depId of task.dependencies) {
          if (dfs(depId)) return true;
        }
      }
      stack.delete(id);
      return false;
    };

    return dfs(startId);
  }
}
