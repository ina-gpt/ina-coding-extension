import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { TerminalSession, TerminalExecution } from './TerminalTypes';
import { Logger } from '../../../utils/Logger';

// ============ Constants ============

const MAX_HISTORY_SIZE = 50;
const TERMINAL_NAME_PREFIX = 'INA Coding';

// ============ Events ============

export type SessionEvent =
  | 'session-created'
  | 'session-closed'
  | 'session-activated'
  | 'execution-added'
  | 'all-closed';

// ============ TerminalSessionManager ============

export class TerminalSessionManager extends EventEmitter {
  private static instance: TerminalSessionManager;
  private sessions: Map<string, TerminalSession> = new Map();
  private activeSessionId: string | null = null;
  private disposables: vscode.Disposable[] = [];

  private constructor() {
    super();
    // Listen for terminal close events to clean up sessions
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        const session = this.findSessionByTerminal(terminal);
        if (session) {
          Logger.debug(`[TerminalSessionManager] Terminal closed for session: ${session.name}`);
          session.terminal = null;
          session.isActive = false;
          if (this.activeSessionId === session.id) {
            this.activeSessionId = null;
          }
        }
      })
    );
  }

  static getInstance(): TerminalSessionManager {
    if (!TerminalSessionManager.instance) {
      TerminalSessionManager.instance = new TerminalSessionManager();
    }
    return TerminalSessionManager.instance;
  }

  // ---- Session Lifecycle ----

  createSession(name: string, cwd: string): TerminalSession {
    const id = crypto.randomUUID();
    const session: TerminalSession = {
      id,
      name,
      cwd,
      isActive: true,
      terminal: null,
      executions: [],
    };

    this.sessions.set(id, session);
    this.activeSessionId = id;

    Logger.info(`[TerminalSessionManager] Created session: ${name} (${id})`);
    this.emit('session-created', { id, name, cwd });

    return session;
  }

  getSession(id: string): TerminalSession | null {
    return this.sessions.get(id) || null;
  }

  getActiveSession(): TerminalSession | null {
    if (!this.activeSessionId) return null;
    return this.sessions.get(this.activeSessionId) || null;
  }

  // ---- VS Code Terminal ----

  getOrCreateVSCodeTerminal(session: TerminalSession): vscode.Terminal {
    // Return existing terminal if still alive
    if (session.terminal) {
      const exitStatus = session.terminal.exitStatus;
      if (exitStatus === undefined) {
        return session.terminal;
      }
      // Terminal has exited, create a new one
      session.terminal = null;
    }

    const terminal = vscode.window.createTerminal({
      name: `${TERMINAL_NAME_PREFIX}: ${session.name}`,
      cwd: session.cwd,
    });

    session.terminal = terminal;
    Logger.debug(`[TerminalSessionManager] Created VS Code terminal for session: ${session.name}`);

    return terminal;
  }

  // ---- Session Management ----

  closeSession(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      Logger.warn(`[TerminalSessionManager] Session not found: ${id}`);
      return;
    }

    if (session.terminal) {
      session.terminal.dispose();
      session.terminal = null;
    }

    session.isActive = false;
    this.sessions.delete(id);

    if (this.activeSessionId === id) {
      this.activeSessionId = null;
      // Activate the most recent remaining session
      const remaining = Array.from(this.sessions.values()).filter(s => s.isActive);
      if (remaining.length > 0) {
        this.activeSessionId = remaining[remaining.length - 1].id;
      }
    }

    Logger.info(`[TerminalSessionManager] Closed session: ${session.name} (${id})`);
    this.emit('session-closed', { id, name: session.name });
  }

  closeAll(): void {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      const session = this.sessions.get(id);
      if (session?.terminal) {
        session.terminal.dispose();
        session.terminal = null;
      }
      session!.isActive = false;
    }

    this.sessions.clear();
    this.activeSessionId = null;

    Logger.info(`[TerminalSessionManager] Closed all sessions (${ids.length})`);
    this.emit('all-closed');
  }

  // ---- Execution Tracking ----

  addExecution(sessionId: string, execution: TerminalExecution): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      Logger.warn(`[TerminalSessionManager] Cannot add execution — session not found: ${sessionId}`);
      return;
    }

    session.executions.push(execution);
    this.emit('execution-added', { sessionId, executionId: execution.id });
  }

  getRecentExecutions(sessionId: string, count: number): TerminalExecution[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.executions.slice(-count);
  }

  getExecutionHistory(): TerminalExecution[] {
    const allExecutions: TerminalExecution[] = [];

    for (const session of this.sessions.values()) {
      allExecutions.push(...session.executions);
    }

    // Sort by start time descending, return last 50
    allExecutions.sort((a, b) => b.startTime - a.startTime);
    return allExecutions.slice(0, MAX_HISTORY_SIZE);
  }

  // ---- Lookup ----

  findSessionByTerminal(terminal: vscode.Terminal): TerminalSession | null {
    for (const session of this.sessions.values()) {
      if (session.terminal === terminal) {
        return session;
      }
    }
    return null;
  }

  // ---- Cleanup ----

  dispose(): void {
    this.closeAll();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.removeAllListeners();
  }
}
