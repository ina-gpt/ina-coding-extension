import * as vscode from 'vscode';
import { AgentMode, AgentStatus, AgentSession, AgentPlan } from './AgentTypes';
import { Logger } from '../../utils/Logger';

export class AgentSessionManager implements vscode.Disposable {
  private static instance: AgentSessionManager;
  private sessions: Map<string, AgentSession> = new Map();
  private activeSessionId: string | null = null;
  private sessionIdCounter: number = 0;
  private context: vscode.ExtensionContext | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly storageKey = 'inaCoding.agentSessions';

  private readonly onSessionStartEmitter = new vscode.EventEmitter<AgentSession>();
  private readonly onSessionEndEmitter = new vscode.EventEmitter<AgentSession>();
  private readonly onStatusChangeEmitter = new vscode.EventEmitter<{
    session: AgentSession;
    oldStatus: AgentStatus;
    newStatus: AgentStatus;
  }>();

  public readonly onSessionStart = this.onSessionStartEmitter.event;
  public readonly onSessionEnd = this.onSessionEndEmitter.event;
  public readonly onStatusChange = this.onStatusChangeEmitter.event;

  static getInstance(): AgentSessionManager {
    if (!AgentSessionManager.instance) {
      AgentSessionManager.instance = new AgentSessionManager();
    }
    return AgentSessionManager.instance;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadSessions();
  }

  createSession(
    prompt: string,
    mode: AgentMode,
    context?: Record<string, unknown>
  ): AgentSession {
    this.sessionIdCounter++;
    const id = `agent-${this.sessionIdCounter}-${Date.now()}`;

    const session: AgentSession = {
      id,
      mode,
      status: AgentStatus.IDLE,
      plan: null,
      changes: [],
      startTime: Date.now(),
      endTime: null,
      prompt,
      context: context || {},
    };

    this.sessions.set(id, session);
    this.activeSessionId = id;

    this.onSessionStartEmitter.fire(session);
    Logger.info(`Agent session created: ${id}`, { mode, prompt: prompt.slice(0, 100) });
    this.debouncedPersist();

    return session;
  }

  getActiveSession(): AgentSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  getSession(id: string): AgentSession | null {
    return this.sessions.get(id) || null;
  }

  updateSessionStatus(id: string, status: AgentStatus): void {
    const session = this.sessions.get(id);
    if (!session) return;

    const oldStatus = session.status;
    session.status = status;

    this.onStatusChangeEmitter.fire({ session, oldStatus, newStatus: status });
    Logger.info(`Agent session ${id}: ${oldStatus} → ${status}`);
    this.debouncedPersist();
  }

  updateSessionPlan(id: string, plan: AgentPlan): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.plan = plan;
    this.debouncedPersist();
  }

  endSession(id: string, status: 'completed' | 'failed' | 'cancelled'): void {
    const session = this.sessions.get(id);
    if (!session) return;

    const oldStatus = session.status;
    session.status = status === 'completed'
      ? AgentStatus.COMPLETED
      : status === 'failed'
        ? AgentStatus.FAILED
        : AgentStatus.CANCELLED;
    session.endTime = Date.now();

    if (this.activeSessionId === id) {
      this.activeSessionId = null;
    }

    this.onStatusChangeEmitter.fire({ session, oldStatus, newStatus: session.status });
    this.onSessionEndEmitter.fire(session);
    Logger.info(`Agent session ended: ${id} (${status})`);
    this.debouncedPersist();
  }

  pauseSession(id: string): void {
    this.updateSessionStatus(id, AgentStatus.PAUSED);
  }

  resumeSession(id: string): void {
    this.updateSessionStatus(id, AgentStatus.EXECUTING);
  }

  getSessionHistory(): AgentSession[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 20);
  }

  persistSessions(): void {
    if (!this.context) return;
    try {
      const history = this.getSessionHistory().map((s) => ({
        ...s,
        // Don't persist large context/change data
        context: {},
        changes: s.changes.slice(0, 10),
      }));
      this.context.globalState.update(this.storageKey, history);
    } catch (err) {
      Logger.warn('Failed to persist agent sessions:', err);
    }
  }

  loadSessions(): void {
    if (!this.context) return;
    try {
      const stored = this.context.globalState.get<AgentSession[]>(this.storageKey);
      if (stored && Array.isArray(stored)) {
        for (const session of stored) {
          this.sessions.set(session.id, session);
          // Update counter to avoid ID collisions
          const idNum = parseInt(session.id.split('-')[1] || '0', 10);
          if (idNum > this.sessionIdCounter) {
            this.sessionIdCounter = idNum;
          }
        }
        Logger.info(`Loaded ${stored.length} agent sessions from storage`);
      }
    } catch (err) {
      Logger.warn('Failed to load agent sessions:', err);
    }
  }

  private debouncedPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistSessions(), 2000);
  }

  dispose(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistSessions();
    this.onSessionStartEmitter.dispose();
    this.onSessionEndEmitter.dispose();
    this.onStatusChangeEmitter.dispose();
  }
}
