/**
 * CollabClient.ts
 * Phase 19B Step 19.5 — Privacy-First Team Collaboration client
 *
 * Connects to the self-hosted collab API via REST + SSE.
 * All data stays on YOUR server — zero third-party cloud.
 */

import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { AuthService } from '../AuthService';
import { ApiKeyStore } from '../access/ApiKeyStore';

// ============================================================
// Types (mirror backend CollabTypes)
// ============================================================

export type ParticipantRole = 'host' | 'editor' | 'viewer';
export type SessionStatus = 'active' | 'paused' | 'ended';
export type CollabMessageType = 'text' | 'code' | 'ai_request' | 'ai_response' | 'system' | 'file_share';

export interface Participant {
  userId: string;
  name: string;
  color: string;
  role: ParticipantRole;
  joinedAt: string;
  lastActivity: string;
  isOnline: boolean;
  currentFile?: string;
}

export interface CollabPermissions {
  allowEdit: boolean;
  allowTerminal: boolean;
  allowAIRequests: boolean;
  allowFileShare: boolean;
  requireHostApproval: boolean;
}

export interface SharedNotepad {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'requirements' | 'api-spec' | 'todo';
  lastEditedBy: string;
  updatedAt: string;
}

export interface CollabMessage {
  id: string;
  participantId: string;
  participantName: string;
  participantColor: string;
  type: CollabMessageType;
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface CollabSession {
  id: string;
  code: string;
  hostUserId: string;
  hostName: string;
  title: string;
  participants: Participant[];
  status: SessionStatus;
  permissions: CollabPermissions;
  maxParticipants: number;
  createdAt: string;
  endedAt?: string;
}

export interface CollabEvent {
  type: string;
  data: any;
  participantId?: string;
  timestamp: string;
}

// ============================================================
// CollabClient
// ============================================================

export class CollabClient {
  private static _instance: CollabClient;
  private _authService?: AuthService;
  private _sseAbort?: AbortController;
  private _currentSession?: CollabSession;
  private _listeners: Map<string, Array<(data: any) => void>> = new Map();
  private _reconnectTimer?: ReturnType<typeof setTimeout>;
  private _cursorThrottleTimer?: ReturnType<typeof setTimeout>;

  private constructor() {}

  static getInstance(): CollabClient {
    if (!CollabClient._instance) {
      CollabClient._instance = new CollabClient();
    }
    return CollabClient._instance;
  }

  setAuthService(auth: AuthService): void {
    this._authService = auth;
  }

  get currentSession(): CollabSession | undefined {
    return this._currentSession;
  }

  get isConnected(): boolean {
    return !!this._currentSession && !!this._sseAbort;
  }

  // ---- Auth helpers ----

  private _baseUrl(): string {
    return ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
  }

  private async _headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      if (this._authService) {
        const token = await (this._authService as any).getAccessToken?.();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          return headers;
        }
      }
    } catch { /* fallback */ }
    try {
      const store = ApiKeyStore.getInstance();
      const key = await store.getKey();
      if (key) {
        headers['Authorization'] = `Bearer ${key}`;
      }
    } catch { /* no key */ }
    return headers;
  }

  private async _fetch(path: string, init?: RequestInit): Promise<any> {
    const url = `${this._baseUrl()}${path}`;
    const headers = await this._headers();
    const resp = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers as any) } });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`${resp.status}: ${body}`);
    }
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) return resp.json();
    return resp.text();
  }

  // ---- Session management ----

  async createSession(title: string): Promise<CollabSession> {
    const session = await this._fetch('/api/collab/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    this._currentSession = session;
    Logger.info(`[Collab] Created session ${session.code}: "${title}"`);
    await this._connectSSE(session.code);
    return session;
  }

  async getSessionPreview(code: string): Promise<CollabSession> {
    return this._fetch(`/api/collab/sessions/${code}`);
  }

  async joinSession(code: string, name: string): Promise<CollabSession> {
    const result = await this._fetch(`/api/collab/sessions/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    this._currentSession = result.session ?? result;
    Logger.info(`[Collab] Joined session ${code} as "${name}"`);
    await this._connectSSE(code);
    return this._currentSession!;
  }

  async leaveSession(): Promise<void> {
    if (!this._currentSession) return;
    const code = this._currentSession.code;
    try {
      await this._fetch(`/api/collab/sessions/${code}/leave`, { method: 'POST' });
    } catch (e: any) {
      Logger.warn(`[Collab] Leave error: ${e.message}`);
    }
    this._disconnect();
    Logger.info(`[Collab] Left session ${code}`);
  }

  async endSession(): Promise<void> {
    if (!this._currentSession) return;
    const code = this._currentSession.code;
    try {
      await this._fetch(`/api/collab/sessions/${code}`, { method: 'DELETE' });
    } catch (e: any) {
      Logger.warn(`[Collab] End error: ${e.message}`);
    }
    this._disconnect();
    Logger.info(`[Collab] Ended session ${code}`);
  }

  async listSessions(): Promise<CollabSession[]> {
    const result = await this._fetch('/api/collab/sessions');
    return result.sessions ?? result;
  }

  async updatePermissions(permissions: Partial<CollabPermissions>): Promise<void> {
    if (!this._currentSession) throw new Error('Not in a session');
    await this._fetch(`/api/collab/sessions/${this._currentSession.code}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify(permissions),
    });
  }

  async changeRole(targetUserId: string, role: ParticipantRole): Promise<void> {
    if (!this._currentSession) throw new Error('Not in a session');
    await this._fetch(`/api/collab/sessions/${this._currentSession.code}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ targetUserId, role }),
    });
  }

  // ---- Messaging ----

  async sendMessage(type: CollabMessageType, content: string, metadata?: Record<string, any>): Promise<void> {
    if (!this._currentSession) throw new Error('Not in a session');
    await this._fetch(`/api/collab/sessions/${this._currentSession.code}/messages`, {
      method: 'POST',
      body: JSON.stringify({ type, content, metadata }),
    });
  }

  async getMessageHistory(limit = 50, before?: string): Promise<CollabMessage[]> {
    if (!this._currentSession) throw new Error('Not in a session');
    const qs = new URLSearchParams({ limit: String(limit) });
    if (before) qs.set('before', before);
    const result = await this._fetch(`/api/collab/sessions/${this._currentSession.code}/messages?${qs}`);
    return result.messages ?? result;
  }

  // ---- Shared AI ----

  async askAI(question: string, options?: { notepadIds?: string[]; includeFiles?: boolean }): Promise<void> {
    if (!this._currentSession) throw new Error('Not in a session');
    await this._fetch(`/api/collab/sessions/${this._currentSession.code}/ai`, {
      method: 'POST',
      body: JSON.stringify({ question, ...options }),
    });
  }

  // ---- Notepads ----

  async listNotepads(): Promise<SharedNotepad[]> {
    if (!this._currentSession) throw new Error('Not in a session');
    const result = await this._fetch(`/api/collab/sessions/${this._currentSession.code}/notepads`);
    return result.notepads ?? result;
  }

  async createNotepad(title: string, type: SharedNotepad['type'] = 'text'): Promise<SharedNotepad> {
    if (!this._currentSession) throw new Error('Not in a session');
    return this._fetch(`/api/collab/sessions/${this._currentSession.code}/notepads`, {
      method: 'POST',
      body: JSON.stringify({ title, type }),
    });
  }

  async updateNotepad(id: string, content: string, title?: string): Promise<void> {
    if (!this._currentSession) throw new Error('Not in a session');
    await this._fetch(`/api/collab/sessions/${this._currentSession.code}/notepads/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content, ...(title ? { title } : {}) }),
    });
  }

  // ---- Cursor updates (throttled) ----

  sendCursorUpdate(file: string, line: number): void {
    if (!this._currentSession) return;
    if (this._cursorThrottleTimer) return; // throttled
    this._cursorThrottleTimer = setTimeout(() => { this._cursorThrottleTimer = undefined; }, 200);
    this.sendMessage('system', JSON.stringify({ cursor: { file, line } })).catch(() => {});
  }

  // ---- SSE real-time stream ----

  private async _connectSSE(code: string): Promise<void> {
    this._disconnectSSE();
    const headers = await this._headers();
    const url = `${this._baseUrl()}/api/collab/sessions/${code}/stream`;
    this._sseAbort = new AbortController();

    const connect = async () => {
      try {
        const resp = await fetch(url, {
          headers,
          signal: this._sseAbort!.signal,
        });
        if (!resp.ok || !resp.body) {
          throw new Error(`SSE connect failed: ${resp.status}`);
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const event: CollabEvent = JSON.parse(line.slice(5).trim());
                this._dispatchEvent(event);
              } catch { /* parse error */ }
            }
          }
        }
      } catch (e: any) {
        if (e.name === 'AbortError') return;
        Logger.warn(`[Collab] SSE disconnected: ${e.message}`);
        // Auto-reconnect after 3 seconds
        this._reconnectTimer = setTimeout(() => {
          if (this._currentSession) {
            Logger.info('[Collab] Reconnecting SSE...');
            connect();
          }
        }, 3000);
      }
    };

    connect();
  }

  private _disconnectSSE(): void {
    if (this._sseAbort) {
      this._sseAbort.abort();
      this._sseAbort = undefined;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }
  }

  private _disconnect(): void {
    this._disconnectSSE();
    this._currentSession = undefined;
    this._dispatchEvent({ type: 'disconnected', data: {}, timestamp: new Date().toISOString() });
  }

  // ---- Event system ----

  on(eventType: string, callback: (data: any) => void): () => void {
    if (!this._listeners.has(eventType)) this._listeners.set(eventType, []);
    this._listeners.get(eventType)!.push(callback);
    return () => {
      const arr = this._listeners.get(eventType);
      if (arr) {
        const idx = arr.indexOf(callback);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  private _dispatchEvent(event: CollabEvent): void {
    const handlers = this._listeners.get(event.type) || [];
    for (const h of handlers) {
      try { h(event.data); } catch (e) { Logger.error('[Collab] event handler error', e); }
    }
    // Also dispatch to wildcard listeners
    const wildcardHandlers = this._listeners.get('*') || [];
    for (const h of wildcardHandlers) {
      try { h(event); } catch (e) { Logger.error('[Collab] wildcard handler error', e); }
    }
  }

  // ---- File sharing ----

  async shareFile(fileName: string, content: string, language?: string): Promise<void> {
    await this.sendMessage('file_share', content, { fileName, language });
  }

  // ---- Audit export ----

  async exportAuditLog(): Promise<string> {
    if (!this._currentSession) throw new Error('Not in a session');
    return this._fetch(`/api/collab/audit/export?sessionCode=${this._currentSession.code}`);
  }

  dispose(): void {
    this._disconnect();
    this._listeners.clear();
  }
}
