import * as vscode from 'vscode';
import {
  GhostTextSession,
  GhostTextSessionState,
  GhostTextItem,
  GhostTextMetrics,
  CycleResult,
} from './GhostTextTypes';

export class GhostTextSessionManager implements vscode.Disposable {
  private activeSession: GhostTextSession | null = null;
  private sessionHistory: Array<{
    session: GhostTextSession;
    outcome: 'accepted' | 'partial' | 'dismissed' | 'replaced';
  }> = [];
  private maxHistorySize: number = 100;
  private sessionIdCounter: number = 0;

  private readonly onSessionStartEmitter = new vscode.EventEmitter<GhostTextSession>();
  private readonly onSessionEndEmitter = new vscode.EventEmitter<{
    session: GhostTextSession;
    outcome: string;
  }>();
  private readonly onItemChangeEmitter = new vscode.EventEmitter<{
    session: GhostTextSession;
    item: GhostTextItem;
  }>();

  public readonly onSessionStart = this.onSessionStartEmitter.event;
  public readonly onSessionEnd = this.onSessionEndEmitter.event;
  public readonly onItemChange = this.onItemChangeEmitter.event;

  createSession(
    document: vscode.TextDocument,
    position: vscode.Position,
    items: GhostTextItem[]
  ): GhostTextSession {
    // End any existing session
    if (this.activeSession) {
      this.endSession('replaced');
    }

    this.sessionIdCounter++;
    const session: GhostTextSession = {
      id: `gs-${this.sessionIdCounter}-${Date.now()}`,
      items,
      currentIndex: 0,
      state: GhostTextSessionState.SHOWING,
      document,
      position,
      startTime: Date.now(),
      endTime: null,
      partialAcceptPosition: 0,
      acceptedText: '',
    };

    this.activeSession = session;
    this.onSessionStartEmitter.fire(session);
    return session;
  }

  getActiveSession(): GhostTextSession | null {
    return this.activeSession;
  }

  hasActiveSession(): boolean {
    return this.activeSession !== null;
  }

  getCurrentItem(): GhostTextItem | null {
    if (!this.activeSession || this.activeSession.items.length === 0) return null;
    return this.activeSession.items[this.activeSession.currentIndex];
  }

  setCurrentIndex(index: number): void {
    if (!this.activeSession) return;
    if (index < 0 || index >= this.activeSession.items.length) return;

    this.activeSession.currentIndex = index;
    this.activeSession.partialAcceptPosition = 0;
    this.activeSession.acceptedText = '';

    const item = this.activeSession.items[index];
    this.onItemChangeEmitter.fire({ session: this.activeSession, item });
  }

  cycleNext(): CycleResult | null {
    if (!this.activeSession || this.activeSession.items.length <= 1) return null;

    const previousIndex = this.activeSession.currentIndex;
    const newIndex = (previousIndex + 1) % this.activeSession.items.length;

    this.setCurrentIndex(newIndex);

    return {
      previousIndex,
      newIndex,
      totalCount: this.activeSession.items.length,
      item: this.activeSession.items[newIndex],
    };
  }

  cyclePrevious(): CycleResult | null {
    if (!this.activeSession || this.activeSession.items.length <= 1) return null;

    const previousIndex = this.activeSession.currentIndex;
    const newIndex =
      previousIndex === 0
        ? this.activeSession.items.length - 1
        : previousIndex - 1;

    this.setCurrentIndex(newIndex);

    return {
      previousIndex,
      newIndex,
      totalCount: this.activeSession.items.length,
      item: this.activeSession.items[newIndex],
    };
  }

  updatePartialAcceptPosition(position: number): void {
    if (!this.activeSession) return;
    this.activeSession.partialAcceptPosition = position;
    this.activeSession.state = GhostTextSessionState.PARTIAL_ACCEPT;
  }

  endSession(outcome: 'accepted' | 'partial' | 'dismissed' | 'replaced'): void {
    if (!this.activeSession) return;

    this.activeSession.endTime = Date.now();
    this.activeSession.state = GhostTextSessionState.IDLE;

    this.sessionHistory.push({
      session: { ...this.activeSession },
      outcome,
    });

    if (this.sessionHistory.length > this.maxHistorySize) {
      this.sessionHistory = this.sessionHistory.slice(-this.maxHistorySize);
    }

    const session = this.activeSession;
    this.activeSession = null;
    this.onSessionEndEmitter.fire({ session, outcome });
  }

  isSessionValid(): boolean {
    if (!this.activeSession) return false;

    // Check document still exists
    try {
      const _ = this.activeSession.document.lineCount;
    } catch {
      return false;
    }

    return this.activeSession.state === GhostTextSessionState.SHOWING ||
      this.activeSession.state === GhostTextSessionState.PARTIAL_ACCEPT;
  }

  getSessionDuration(): number | null {
    if (!this.activeSession) return null;
    return Date.now() - this.activeSession.startTime;
  }

  getMetrics(): GhostTextMetrics {
    const history = this.sessionHistory;
    const total = history.length;

    if (total === 0) {
      return {
        totalShown: 0,
        acceptedFull: 0,
        acceptedPartial: 0,
        dismissed: 0,
        cycled: 0,
        averageShowDuration: 0,
        wordAcceptCount: 0,
        lineAcceptCount: 0,
        acceptanceRate: 0,
      };
    }

    const accepted = history.filter((h) => h.outcome === 'accepted').length;
    const partial = history.filter((h) => h.outcome === 'partial').length;
    const dismissed = history.filter((h) => h.outcome === 'dismissed').length;

    const durations = history
      .filter((h) => h.session.endTime)
      .map((h) => h.session.endTime! - h.session.startTime);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      totalShown: total,
      acceptedFull: accepted,
      acceptedPartial: partial,
      dismissed,
      cycled: 0, // Tracked separately
      averageShowDuration: avgDuration,
      wordAcceptCount: 0,
      lineAcceptCount: 0,
      acceptanceRate: total > 0 ? (accepted + partial) / total : 0,
    };
  }

  clearHistory(): void {
    this.sessionHistory = [];
  }

  dispose(): void {
    if (this.activeSession) {
      this.endSession('dismissed');
    }
    this.onSessionStartEmitter.dispose();
    this.onSessionEndEmitter.dispose();
    this.onItemChangeEmitter.dispose();
  }
}
