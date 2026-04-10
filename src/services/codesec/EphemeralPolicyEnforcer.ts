/**
 * Phase 12.3 — Ephemeral Policy Enforcer
 * Ensures code is never stored on the server longer than needed.
 */
import { Logger } from '../../utils/Logger';
import { EphemeralConfig, CodeStorageConfig, CODE_SECURITY_DEFAULTS } from './CodeSecurityTypes';
import { ConfigManager } from '../../utils/ConfigManager';

export class EphemeralPolicyEnforcer {
  private static instance: EphemeralPolicyEnforcer;
  private ephemeralConfig: EphemeralConfig;
  private storageConfig: CodeStorageConfig;
  private lastPurgeAt: number | null = null;
  private pendingPurges = 0;
  private serverSupported = true;

  static getInstance(): EphemeralPolicyEnforcer {
    if (!EphemeralPolicyEnforcer.instance) {
      EphemeralPolicyEnforcer.instance = new EphemeralPolicyEnforcer();
    }
    return EphemeralPolicyEnforcer.instance;
  }

  private constructor() {
    this.ephemeralConfig = CODE_SECURITY_DEFAULTS.ephemeralProcessing;
    this.storageConfig = CODE_SECURITY_DEFAULTS.codeStorage;
  }

  updateConfig(ephemeral: Partial<EphemeralConfig>, storage?: Partial<CodeStorageConfig>): void {
    Object.assign(this.ephemeralConfig, ephemeral);
    if (storage) Object.assign(this.storageConfig, storage);
  }

  enforceOnRequest(requestPayload: any): { modified: boolean; headers: Record<string, string>; payload: any } {
    if (!this.ephemeralConfig.enabled) {
      return { modified: false, headers: {}, payload: requestPayload };
    }

    const headers: Record<string, string> = {};

    headers['X-Ephemeral-Processing'] = 'true';

    if (!this.storageConfig.allowServerStorage) {
      headers['X-No-Code-Storage'] = 'true';
    }

    if (this.ephemeralConfig.deleteAfterResponse) {
      headers['X-Delete-After-Response'] = 'true';
    }

    if (this.ephemeralConfig.noChatLogging) {
      headers['X-No-Chat-Logging'] = 'true';
    }

    headers['X-Max-Retention-Minutes'] = String(this.ephemeralConfig.maxServerRetentionMinutes);

    // Tag payload
    const payload = {
      ...requestPayload,
      _ephemeral: {
        deleteAfterResponse: this.ephemeralConfig.deleteAfterResponse,
        noChatLogging: this.ephemeralConfig.noChatLogging,
        maxRetentionMs: this.ephemeralConfig.serverRetentionMs,
      },
    };

    return { modified: true, headers, payload };
  }

  enforceOnResponse(responseHeaders: Record<string, string>): void {
    if (!this.ephemeralConfig.enabled) return;

    // Verify server acknowledged ephemeral headers
    const ack = responseHeaders['x-ephemeral-ack'] || responseHeaders['X-Ephemeral-Ack'];
    if (!ack) {
      this.serverSupported = false;
      Logger.warn('[Ephemeral] Server did not acknowledge ephemeral processing headers');
    } else {
      this.serverSupported = true;
    }
  }

  async purgeServerData(userId: string): Promise<{ success: boolean; error?: string }> {
    this.pendingPurges++;
    try {
      const baseUrl = ConfigManager.getApiEndpoint();
      const response = await fetch(`${baseUrl}/api/codesec/purge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, categories: ['all'] }),
      });

      if (response.ok) {
        this.lastPurgeAt = Date.now();
        Logger.info('[Ephemeral] Server data purged successfully');
        return { success: true };
      }
      const err = await response.text().catch(() => 'Unknown error');
      return { success: false, error: err };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Purge failed' };
    } finally {
      this.pendingPurges--;
    }
  }

  getEphemeralStatus(): { enabled: boolean; serverSupported: boolean; lastPurgeAt: number | null; pendingPurges: number } {
    return {
      enabled: this.ephemeralConfig.enabled,
      serverSupported: this.serverSupported,
      lastPurgeAt: this.lastPurgeAt,
      pendingPurges: this.pendingPurges,
    };
  }

  isEnabled(): boolean {
    return this.ephemeralConfig.enabled;
  }

  dispose(): void {}
}
