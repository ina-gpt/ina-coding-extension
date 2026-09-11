/**
 * AgentFactory.ts
 * Phase 18.1 — Creates and pools specialized agent instances
 *
 * Each agent is a lightweight record describing a role + system prompt +
 * model hint. Actual model calls happen through ApiService, which routes
 * to the INA GPT backend.
 */

import { InaModelId } from '../../../config/model-registry';
import {
  AgentInstance,
  AgentRole,
  AgentStatus,
  ROLE_LABELS,
} from './MultiAgentTypes';

/**
 * Which model each role asks for, as INA ids.
 *
 * Typed as InaModelId, not string. When the ladder was renamed from ina-8-* to
 * ina-7-4-*, tsc passed with every id here stale, because `Record<AgentRole,
 * string>` accepts any text at all. The union type is what makes a future
 * rename a compile error instead of six silent 422s at runtime.
 *
 * Reasoning roles take the general-purpose pro tier; roles that write code take
 * the coding pro tier.
 */
const MODEL_HINTS: Record<AgentRole, InaModelId> = {
  [AgentRole.PLANNER]: 'ina-7-4-pro',
  [AgentRole.CODER]: 'ina-7-4-coding-pro',
  [AgentRole.REVIEWER]: 'ina-7-4-pro',
  [AgentRole.TESTER]: 'ina-7-4-pro',
  [AgentRole.REFACTORER]: 'ina-7-4-coding-pro',
  [AgentRole.SECURITY_AUDITOR]: 'ina-7-4-pro',
};

/** Default token budget per role — overridden via factory config if desired */
const TOKEN_BUDGET: Record<AgentRole, number> = {
  [AgentRole.PLANNER]: 8_000,
  [AgentRole.CODER]: 16_000,
  [AgentRole.REVIEWER]: 8_000,
  [AgentRole.TESTER]: 12_000,
  [AgentRole.REFACTORER]: 12_000,
  [AgentRole.SECURITY_AUDITOR]: 8_000,
};

// ============================================================
// Role system prompts
// ============================================================

const SYSTEM_PROMPTS: Record<AgentRole, string> = {
  [AgentRole.PLANNER]: `You are the PLANNER agent of INA Coding (INA GPT GmbH, Berlin).

Your job is to decompose a user's software engineering request into a directed acyclic graph (DAG) of concrete, verifiable tasks. Each task is small enough to be executed independently by a specialist agent.

Rules:
- Think before you answer. Consider architecture, risk, and dependencies.
- Produce tasks that are specific and bounded. "Refactor the project" is NOT a valid task.
- Every task declares: description, requiredRole, dependencies (ids of prior tasks), priority.
- Roles available: planner, coder, reviewer, tester, refactorer, security_auditor.
- Prefer parallelizable tasks when possible (fewer dependencies = faster execution).
- If the request is ambiguous, ADD a task of role "planner" with action "clarify".

Output format (JSON only, no prose, no code fences):
{
  "tasks": [
    {
      "id": "t1",
      "description": "...",
      "requiredRole": "coder",
      "dependencies": [],
      "priority": 10,
      "metadata": {}
    }
  ]
}`,

  [AgentRole.CODER]: `You are the CODER agent of INA Coding (INA GPT GmbH, Berlin).

Your job is to write production-quality code for a single, well-defined task. You receive: task description, relevant files, prior task results, and project conventions.

Rules:
- Write idiomatic, production-grade code — no scaffolding, no TODO comments.
- Respect the existing code style and project conventions.
- Follow established patterns — don't invent new abstractions unless required.
- Include necessary imports and type annotations.
- If the task requires editing a file, output the complete new file content.
- If the task requires creating a file, include a header comment with the file path.
- NEVER touch Providers.tsx, layout.tsx, chat/page.tsx, or lib/ai.ts.

Output format:
\`\`\`<language>
// file: path/to/file.ext
<your code here>
\`\`\``,

  [AgentRole.REVIEWER]: `You are the REVIEWER agent of INA Coding (INA GPT GmbH, Berlin).

Your job is to critically review code produced by the CODER agent. Find bugs, edge cases, and quality issues. You are the last line of defense before code is shown to the user.

Check for:
- Correctness: does the code actually solve the task?
- Edge cases: null, empty, unicode, large inputs, concurrent access
- Error handling: are failures caught and reported properly?
- Performance: are there obvious O(n²) or blocking I/O issues?
- Readability: is naming clear? Are there magic numbers?
- Adherence to project conventions

Output format (JSON only):
{
  "verdict": "approve" | "request_changes" | "reject",
  "issues": [
    { "severity": "critical"|"high"|"medium"|"low", "category": "bug"|"style"|"perf"|"security", "line": <number>, "message": "...", "suggestion": "..." }
  ],
  "summary": "..."
}`,

  [AgentRole.TESTER]: `You are the TESTER agent of INA Coding (INA GPT GmbH, Berlin).

Your job is to write comprehensive tests for code produced by the CODER agent. Use the project's existing test framework (Jest / Vitest / Mocha / Pytest / Go test / etc. — detect from context).

Rules:
- Cover happy path + at least 3 edge cases + error paths.
- Prefer integration over unit tests when testing orchestration code.
- Mock external dependencies, but NEVER mock the database in integration tests.
- Test names must describe the behavior being tested ("should reject expired tokens").

Output format:
\`\`\`<language>
// file: path/to/file.test.ext
<your tests here>
\`\`\``,

  [AgentRole.REFACTORER]: `You are the REFACTORER agent of INA Coding (INA GPT GmbH, Berlin).

Your job is to improve the structure, readability, and maintainability of existing code WITHOUT changing its observable behavior. You are a no-regression refactor specialist.

Allowed changes:
- Rename variables/functions for clarity
- Extract repeated logic into helpers
- Replace imperative code with declarative alternatives
- Split overly large functions
- Remove dead code
- Tighten types

Forbidden:
- Adding new features
- Changing public APIs
- Modifying business logic
- Introducing new dependencies

Output format:
\`\`\`<language>
// file: path/to/file.ext (REFACTORED)
<the refactored file content>
\`\`\`

Then, outside the code block, a brief list of the refactorings applied.`,

  [AgentRole.SECURITY_AUDITOR]: `You are the SECURITY AUDITOR agent of INA Coding (INA GPT GmbH, Berlin).

Your job is to find security vulnerabilities in code, with an emphasis on the OWASP Top 10:
1. Broken Access Control
2. Cryptographic Failures
3. Injection (SQL, command, LDAP, XSS)
4. Insecure Design
5. Security Misconfiguration
6. Vulnerable and Outdated Components
7. Identification and Authentication Failures
8. Software and Data Integrity Failures
9. Security Logging and Monitoring Failures
10. Server-Side Request Forgery (SSRF)

Also check for:
- Hardcoded secrets (API keys, passwords, tokens)
- Dangerous function calls: eval(), exec(), dangerouslySetInnerHTML, unsafe deserialization
- Missing input validation on API routes
- Path traversal opportunities
- Timing attacks on comparison logic

Output format (JSON only):
{
  "findings": [
    {
      "severity": "critical"|"high"|"medium"|"low"|"info",
      "owaspCategory": "A01-A10|N/A",
      "cwe": "CWE-xxx|null",
      "file": "...",
      "line": <number>,
      "title": "...",
      "description": "...",
      "remediation": "..."
    }
  ],
  "overallRisk": "critical"|"high"|"medium"|"low",
  "summary": "..."
}`,
};

// ============================================================
// Factory
// ============================================================

export interface AgentFactoryConfig {
  /** Max size of the idle pool per role */
  maxPoolSizePerRole: number;
  /** Custom token budget overrides */
  tokenBudgetOverrides?: Partial<Record<AgentRole, number>>;
}

export const DEFAULT_FACTORY_CONFIG: AgentFactoryConfig = {
  maxPoolSizePerRole: 3,
};

export class AgentFactory {
  private static instance: AgentFactory;

  private pool = new Map<AgentRole, AgentInstance[]>();
  private active = new Map<string, AgentInstance>();
  private config: AgentFactoryConfig = DEFAULT_FACTORY_CONFIG;

  private constructor() {}

  static getInstance(): AgentFactory {
    if (!AgentFactory.instance) {
      AgentFactory.instance = new AgentFactory();
    }
    return AgentFactory.instance;
  }

  configure(config: Partial<AgentFactoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================
  // Create / reuse / release
  // ============================================================

  /** Create (or reuse from pool) an agent with the given role. */
  createAgent(role: AgentRole, contextOverride: Record<string, unknown> = {}): AgentInstance {
    // Try to reuse an idle agent of the same role
    const poolForRole = this.pool.get(role) ?? [];
    const reusable = poolForRole.find((a) => a.status === 'idle');
    if (reusable) {
      poolForRole.splice(poolForRole.indexOf(reusable), 1);
      this.pool.set(role, poolForRole);
      reusable.status = 'idle';
      reusable.context = { ...reusable.context, ...contextOverride };
      reusable.lastUsedAt = Date.now();
      this.active.set(reusable.id, reusable);
      return reusable;
    }

    // Create a new one
    const id = this.generateId(role);
    const budgetOverride = this.config.tokenBudgetOverrides?.[role];
    const instance: AgentInstance = {
      id,
      role,
      status: 'idle',
      model: MODEL_HINTS[role],
      systemPrompt: SYSTEM_PROMPTS[role],
      context: { ...contextOverride },
      tokenBudget: budgetOverride ?? TOKEN_BUDGET[role],
      tokensUsed: 0,
      activeTaskCount: 0,
      lastUsedAt: Date.now(),
      createdAt: Date.now(),
    };
    this.active.set(id, instance);
    return instance;
  }

  /** Return an agent to the idle pool (or discard if pool is full). */
  release(agentId: string): void {
    const agent = this.active.get(agentId);
    if (!agent) return;
    this.active.delete(agentId);

    agent.status = 'idle';
    agent.activeTaskCount = 0;
    agent.lastUsedAt = Date.now();

    const poolForRole = this.pool.get(agent.role) ?? [];
    if (poolForRole.length < this.config.maxPoolSizePerRole) {
      poolForRole.push(agent);
      this.pool.set(agent.role, poolForRole);
    }
    // else: drop — GC reclaims it
  }

  /** Terminate an agent (error path). */
  terminate(agentId: string): void {
    this.active.delete(agentId);
    // Also remove from pool if it's there
    for (const [role, arr] of this.pool) {
      const idx = arr.findIndex((a) => a.id === agentId);
      if (idx >= 0) {
        arr.splice(idx, 1);
        this.pool.set(role, arr);
      }
    }
  }

  /** Mark an agent's status (used by orchestrator during task execution). */
  setStatus(agentId: string, status: AgentStatus): void {
    const agent = this.active.get(agentId);
    if (agent) agent.status = status;
  }

  /** Record token usage against an agent. Returns true if within budget. */
  recordTokens(agentId: string, tokens: number): boolean {
    const agent = this.active.get(agentId);
    if (!agent) return true;
    agent.tokensUsed += tokens;
    return agent.tokensUsed <= agent.tokenBudget;
  }

  // ============================================================
  // Queries
  // ============================================================

  getAgent(agentId: string): AgentInstance | null {
    return this.active.get(agentId) ?? null;
  }

  getActiveAgents(): AgentInstance[] {
    return [...this.active.values()];
  }

  getActiveCount(): number {
    return this.active.size;
  }

  /** Find the least-loaded active agent for a given role (or null). */
  findLeastLoaded(role: AgentRole): AgentInstance | null {
    let best: AgentInstance | null = null;
    for (const agent of this.active.values()) {
      if (agent.role !== role) continue;
      if (!best || agent.activeTaskCount < best.activeTaskCount) {
        best = agent;
      }
    }
    return best;
  }

  /** Display-safe name for an agent — always "INA-7 Pro · <Role>". */
  getDisplayName(agent: AgentInstance): string {
    return ROLE_LABELS[agent.role];
  }

  getSystemPrompt(role: AgentRole): string {
    return SYSTEM_PROMPTS[role];
  }

  getModelHint(role: AgentRole): string {
    return MODEL_HINTS[role];
  }

  /** Clear all pools and active agents. */
  dispose(): void {
    this.active.clear();
    this.pool.clear();
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private generateId(role: AgentRole): string {
    return `agent_${role}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
