/**
 * Phase 26 — Extension Activity Reporter
 *
 * Reports user activities to the API for admin dashboards,
 * security monitoring, and productivity reporting.
 *
 * Audit levels:
 *   1 = metadata only
 *   2 = + summaries
 *   3 = + full content
 *
 * All data stays on customer's server.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

interface ActivityPayload {
  type: string;
  action: string;
  prompt?: string;
  response?: string;
  model?: string;
  language?: string;
  tokenInput?: number;
  tokenOutput?: number;
  responseMs?: number;
  files?: string[];
  mentionTypes?: string[];
  accepted?: boolean;
  error?: string;
  sessionId?: string;
}

export class ActivityReporter {
  private enabled: boolean;
  private auditLevel: number;
  private apiEndpoint: string;
  private getHeaders: () => Promise<Record<string, string>>;
  private configListener: vscode.Disposable;

  constructor(
    apiEndpoint: string,
    headersFn: () => Promise<Record<string, string>>,
  ) {
    this.apiEndpoint = apiEndpoint;
    this.getHeaders = headersFn;

    const config = vscode.workspace.getConfiguration('inaCoding.userIntelligence');
    this.enabled = config.get<boolean>('enabled', true);
    this.auditLevel = config.get<number>('auditLevel', 2);

    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('inaCoding.userIntelligence')) {
        const cfg = vscode.workspace.getConfiguration('inaCoding.userIntelligence');
        this.enabled = cfg.get<boolean>('enabled', true);
        this.auditLevel = cfg.get<number>('auditLevel', 2);
      }
    });
  }

  async report(entry: ActivityPayload): Promise<void> {
    if (!this.enabled) return;

    try {
      const payload: Record<string, any> = {
        activityType: entry.type,
        activityAction: entry.action,
        modelUsed: entry.model,
        language: entry.language,
        tokenCountInput: entry.tokenInput,
        tokenCountOutput: entry.tokenOutput,
        responseTimeMs: entry.responseMs,
        filesAffected: entry.files,
        mentionTypes: entry.mentionTypes,
        wasAccepted: entry.accepted,
        errorMessage: entry.error,
        sessionId: entry.sessionId,
      };

      // Only include content if audit level allows
      if (this.auditLevel >= 2) {
        payload.promptText = entry.prompt;
        payload.responseText = entry.response;
      }

      const headers = await this.getHeaders();
      await fetch(`${this.apiEndpoint}/api/user-intelligence/activity`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // NEVER crash the extension for activity reporting
    }
  }

  /** GDPR Art. 15 — export user data */
  async exportMyData(apiKeyPrefix: string): Promise<void> {
    try {
      const headers = await this.getHeaders();
      const resp = await fetch(
        `${this.apiEndpoint}/api/user-intelligence/export/${apiKeyPrefix}`,
        { headers, signal: AbortSignal.timeout(15_000) },
      );
      const data = await resp.json();
      const channel = vscode.window.createOutputChannel('INA Coding — Meine Aktivitätsdaten');
      channel.appendLine(JSON.stringify(data, null, 2));
      channel.show();
    } catch {
      vscode.window.showErrorMessage('INA-7 Pro: Fehler beim Exportieren der Aktivitätsdaten.');
    }
  }

  /** GDPR Art. 17 — delete user data */
  async deleteMyData(apiKeyPrefix: string): Promise<void> {
    try {
      const headers = await this.getHeaders();
      await fetch(
        `${this.apiEndpoint}/api/user-intelligence/user/${apiKeyPrefix}`,
        { method: 'DELETE', headers, signal: AbortSignal.timeout(10_000) },
      );
      vscode.window.showInformationMessage('INA-7 Pro: Alle Ihre Aktivitätsdaten wurden gelöscht.');
    } catch {
      vscode.window.showErrorMessage('INA-7 Pro: Fehler beim Löschen der Aktivitätsdaten.');
    }
  }

  getAuditLevel(): number {
    return this.auditLevel;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.configListener.dispose();
  }
}
