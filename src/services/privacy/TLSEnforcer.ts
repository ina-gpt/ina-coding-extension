/**
 * Phase 12.1 — TLS Enforcer
 * Enforces TLS requirements on all outgoing connections.
 */
import { Logger } from '../../utils/Logger';
import { CommunicationConfig, PRIVACY_DEFAULTS } from './PrivacyTypes';

export class TLSEnforcer {
  private static instance: TLSEnforcer;
  private config: CommunicationConfig;

  static getInstance(): TLSEnforcer {
    if (!TLSEnforcer.instance) {
      TLSEnforcer.instance = new TLSEnforcer();
    }
    return TLSEnforcer.instance;
  }

  private constructor() {
    this.config = PRIVACY_DEFAULTS.communication;
  }

  updateConfig(config: Partial<CommunicationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  validateEndpoint(url: string): { valid: boolean; reason: string | null } {
    try {
      const parsed = new URL(url);
      // Allow localhost/127.0.0.1 without TLS
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') {
        return { valid: true, reason: null };
      }
      if (this.config.requireTLS && parsed.protocol !== 'https:') {
        return { valid: false, reason: `TLS required: ${url} uses ${parsed.protocol}` };
      }
      return { valid: true, reason: null };
    } catch (e) {
      return { valid: false, reason: `Invalid URL: ${url}` };
    }
  }

  getSecurityHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    };
  }

  shouldSanitizeRequest(): boolean {
    return this.config.sanitizeOutgoingRequests;
  }

  shouldStripHeaders(): boolean {
    return this.config.stripSensitiveHeaders;
  }
}
