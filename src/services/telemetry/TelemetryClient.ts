/**
 * Phase 25 — Extension Telemetry Client
 *
 * Privacy-first: only anonymous metadata, never code/prompts/filenames.
 * All data stays on customer's server. Opt-out available via settings.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Logger } from '../../utils/Logger';

interface TelemetryEventData {
  responseTimeMs?: number;
  tokenCount?: number;
  modelUsed?: string;
  language?: string;
  mentionTypes?: string[];
  errorType?: string;
  abVariant?: string;
}

interface QueuedEvent {
  eventCategory: string;
  eventAction: string;
  responseTimeMs?: number;
  tokenCount?: number;
  modelUsed?: string;
  language?: string;
  mentionTypes?: string[];
  errorType?: string;
  abVariant?: string;
  sessionHash?: string;
}

export class TelemetryClient {
  private enabled: boolean;
  private sessionHash: string;
  private eventQueue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private configListener: vscode.Disposable;
  private apiEndpoint: string;
  private getHeaders: () => Promise<Record<string, string>>;

  constructor(
    apiEndpoint: string,
    headersFn: () => Promise<Record<string, string>>,
  ) {
    this.apiEndpoint = apiEndpoint;
    this.getHeaders = headersFn;
    this.enabled = vscode.workspace
      .getConfiguration('inaCoding.telemetry')
      .get<boolean>('enabled', false);
    this.sessionHash = crypto.randomBytes(8).toString('hex');

    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('inaCoding.telemetry.enabled')) {
        this.enabled = vscode.workspace
          .getConfiguration('inaCoding.telemetry')
          .get<boolean>('enabled', false);
      }
    });

    this.flushTimer = setInterval(() => this.flush(), 60_000);
  }

  // ============ Core tracking ============

  track(category: string, action: string, data?: TelemetryEventData): void {
    if (!this.enabled) return;

    this.eventQueue.push({
      eventCategory: category,
      eventAction: action,
      responseTimeMs: data?.responseTimeMs,
      tokenCount: data?.tokenCount,
      modelUsed: data?.modelUsed,
      language: data?.language,
      mentionTypes: data?.mentionTypes,
      errorType: data?.errorType,
      abVariant: data?.abVariant,
      sessionHash: this.sessionHash,
    });

    if (this.eventQueue.length >= 20) {
      this.flush();
    }
  }

  // ============ Convenience methods ============

  trackChat(action: 'request' | 'accept' | 'reject' | 'cancel' | 'error', data?: TelemetryEventData): void {
    this.track('chat', action, data);
  }

  trackCompletion(action: 'request' | 'accept' | 'reject' | 'dismiss' | 'error', data?: TelemetryEventData): void {
    this.track('completion', action, data);
  }

  trackApply(action: 'request' | 'accept' | 'reject' | 'instant' | 'error', data?: TelemetryEventData): void {
    this.track('apply', action, data);
  }

  trackAgent(action: 'start' | 'complete' | 'cancel' | 'error', data?: TelemetryEventData): void {
    this.track('agent', action, data);
  }

  trackSkill(action: 'run' | 'complete' | 'error', data?: TelemetryEventData): void {
    this.track('skill', action, data);
  }

  trackReview(action: 'request' | 'complete' | 'error', data?: TelemetryEventData): void {
    this.track('review', action, data);
  }

  trackDebug(action: 'request' | 'complete' | 'error', data?: TelemetryEventData): void {
    this.track('debug', action, data);
  }

  trackVoice(action: 'request' | 'complete' | 'error', data?: TelemetryEventData): void {
    this.track('voice', action, data);
  }

  // ============ Flush ============

  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const batch = this.eventQueue.splice(0);

    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.apiEndpoint}/api/telemetry/events`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        Logger.debug(`[Telemetry] Flush HTTP ${response.status}`);
      }
    } catch {
      // Telemetry must NEVER break the extension — fail silently
    }
  }

  // ============ GDPR commands ============

  async deleteMyData(): Promise<void> {
    try {
      const headers = await this.getHeaders();
      await fetch(`${this.apiEndpoint}/api/telemetry/user`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      vscode.window.showInformationMessage(
        'INA-7 Pro: Alle Ihre Telemetrie-Daten wurden gelöscht.',
      );
    } catch {
      vscode.window.showErrorMessage(
        'INA-7 Pro: Fehler beim Löschen der Telemetrie-Daten.',
      );
    }
  }

  async exportMyData(): Promise<void> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.apiEndpoint}/api/telemetry/user`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json();

      const channel = vscode.window.createOutputChannel('INA Coding — Meine Telemetrie-Daten');
      channel.appendLine(JSON.stringify(data, null, 2));
      channel.show();
    } catch {
      vscode.window.showErrorMessage(
        'INA-7 Pro: Fehler beim Exportieren der Telemetrie-Daten.',
      );
    }
  }

  // ============ A/B ============

  async getABVariant(experimentName: string): Promise<string | null> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.apiEndpoint}/api/telemetry/ab/variant`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ experiment: experimentName }),
        signal: AbortSignal.timeout(5_000),
      });
      const data = await response.json();
      return data.variant || null;
    } catch {
      return null;
    }
  }

  // ============ Lifecycle ============

  dispose(): void {
    this.configListener.dispose();
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }
}
