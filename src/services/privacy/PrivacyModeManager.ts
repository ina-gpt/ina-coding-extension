/**
 * Phase 12.1 — Privacy Mode Manager
 * Manages privacy mode transitions and enforces policies.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { PrivacyConfig, PrivacyMode, PrivacyAuditEntry, PrivacyAuditAction, DataInventory, PRIVACY_DEFAULTS } from './PrivacyTypes';

const CONFIG_KEY = 'inaCoding.privacyConfig';
const AUDIT_KEY = 'inaCoding.privacyAuditLog';

export class PrivacyModeManager extends EventEmitter {
  private static instance: PrivacyModeManager;
  private config: PrivacyConfig = { ...PRIVACY_DEFAULTS };
  private mode: PrivacyMode = PrivacyMode.STANDARD;
  private context: vscode.ExtensionContext | null = null;
  private auditLog: PrivacyAuditEntry[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): PrivacyModeManager {
    if (!PrivacyModeManager.instance) {
      PrivacyModeManager.instance = new PrivacyModeManager();
    }
    return PrivacyModeManager.instance;
  }

  private constructor() { super(); }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadConfig();
    this.mode = this.config.mode;
    // Load from VS Code settings
    const settingsMode = vscode.workspace.getConfiguration('inaCoding.privacy').get<string>('mode', 'standard');
    if (settingsMode && settingsMode !== this.mode) {
      this.mode = settingsMode as PrivacyMode;
      this.config.mode = this.mode;
    }
    Logger.info(`[Privacy] Initialized: mode=${this.mode}`);
  }

  getMode(): PrivacyMode { return this.mode; }

  setMode(mode: PrivacyMode): void {
    const prev = this.mode;
    this.mode = mode;
    this.config.mode = mode;

    // Enforce policies for new mode
    if (mode === PrivacyMode.STRICT || mode === PrivacyMode.LOCAL_ONLY || mode === PrivacyMode.AIR_GAPPED) {
      this.config.telemetry.enabled = false;
      this.config.telemetry.anonymousUsageStats = false;
      this.config.telemetry.errorReporting = false;
      this.config.dataMinimization.excludeSecrets = true;
      this.config.dataMinimization.stripFilePathsInLogs = true;
      this.config.communication.sanitizeOutgoingRequests = true;
    }

    this.persist();
    this.addAuditEntry({ action: PrivacyAuditAction.PRIVACY_MODE_CHANGED, category: 'privacy', description: `Mode changed: ${prev} → ${mode}`, dataType: 'config', destination: 'local', dataSizeBytes: null, encrypted: false, sanitized: false, userId: null });
    this.emit('mode-changed', mode, prev);
    Logger.info(`[Privacy] Mode changed: ${prev} → ${mode}`);
  }

  getConfig(): PrivacyConfig { return { ...this.config }; }

  updateConfig(updates: Partial<PrivacyConfig>): void {
    Object.assign(this.config, updates);
    this.persist();
    this.emit('config-changed', this.config);
  }

  isServerAllowed(): boolean {
    return this.mode === PrivacyMode.STANDARD || this.mode === PrivacyMode.STRICT;
  }

  isMemoryExtractionAllowed(): boolean {
    return this.mode === PrivacyMode.STANDARD;
  }

  isTelemetryAllowed(): boolean {
    return this.config.telemetry.enabled && this.mode === PrivacyMode.STANDARD;
  }

  checkConsent(action: string): boolean {
    const consent = this.config.consent.userConsents[action];
    return consent?.granted === true;
  }

  grantConsent(action: string): void {
    this.config.consent.userConsents[action] = { granted: true, grantedAt: Date.now(), version: this.config.consent.consentVersion };
    this.persist();
    this.addAuditEntry({ action: PrivacyAuditAction.CONSENT_GRANTED, category: 'consent', description: `Consent granted for: ${action}`, dataType: 'consent', destination: 'local', dataSizeBytes: null, encrypted: false, sanitized: false, userId: null });
  }

  revokeConsent(action: string): void {
    if (this.config.consent.userConsents[action]) {
      this.config.consent.userConsents[action].granted = false;
    }
    this.persist();
    this.addAuditEntry({ action: PrivacyAuditAction.CONSENT_REVOKED, category: 'consent', description: `Consent revoked for: ${action}`, dataType: 'consent', destination: 'local', dataSizeBytes: null, encrypted: false, sanitized: false, userId: null });
  }

  getDataInventory(): DataInventory[] {
    const enc = this.config.encryption;
    return [
      { category: 'Chat History', description: 'Conversation messages', storageLocation: 'VS Code globalState', encrypted: enc.encryptChatHistory, retentionDays: this.config.dataRetention.chatHistoryDays, purpose: 'Conversation continuity', canDelete: true, canExport: true, dataVolume: 'Variable' },
      { category: 'Memories', description: 'AI-extracted facts and decisions', storageLocation: 'Server database', encrypted: enc.encryptMemories, retentionDays: this.config.dataRetention.memoryRetentionDays, purpose: 'Context recall across sessions', canDelete: true, canExport: true, dataVolume: 'Variable' },
      { category: 'Cache', description: 'API response and embedding cache', storageLocation: 'VS Code globalState + memory', encrypted: enc.encryptCache, retentionDays: this.config.dataRetention.cacheRetentionDays, purpose: 'Performance optimization', canDelete: true, canExport: false, dataVolume: 'Variable' },
      { category: 'Error Logs', description: 'Error history and analytics', storageLocation: 'VS Code globalState', encrypted: false, retentionDays: this.config.dataRetention.errorLogRetentionDays, purpose: 'Error tracking and self-healing', canDelete: true, canExport: true, dataVolume: 'Small' },
      { category: 'Token Usage', description: 'Token count per session/day/month', storageLocation: 'VS Code globalState', encrypted: false, retentionDays: this.config.dataRetention.tokenHistoryRetentionDays, purpose: 'Usage tracking', canDelete: true, canExport: true, dataVolume: 'Small' },
      { category: 'Offline Queue', description: 'Queued requests when offline', storageLocation: 'VS Code globalState', encrypted: enc.encryptOfflineQueue, retentionDays: 1, purpose: 'Offline resilience', canDelete: true, canExport: false, dataVolume: 'Small' },
      { category: 'Project Rules', description: '.ina-rules file', storageLocation: 'Local file', encrypted: false, retentionDays: -1, purpose: 'AI behavior customization', canDelete: true, canExport: true, dataVolume: 'Small' },
      { category: 'Settings', description: 'Extension preferences', storageLocation: 'VS Code settings', encrypted: false, retentionDays: -1, purpose: 'Configuration', canDelete: true, canExport: true, dataVolume: 'Small' },
    ];
  }

  addAuditEntry(entry: Omit<PrivacyAuditEntry, 'timestamp'>): void {
    this.auditLog.push({ ...entry, timestamp: Date.now() });
    if (this.auditLog.length > 500) this.auditLog = this.auditLog.slice(-400);
    this.debouncePersist();
    this.emit('audit-entry', entry);
  }

  getAuditLog(filters?: { action?: string; category?: string; since?: number }): PrivacyAuditEntry[] {
    let log = [...this.auditLog];
    if (filters?.action) log = log.filter(e => e.action === filters.action);
    if (filters?.category) log = log.filter(e => e.category === filters.category);
    if (filters?.since) log = log.filter(e => e.timestamp >= filters.since!);
    return log;
  }

  exportAuditLog(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  private persist(): void {
    if (!this.context) return;
    try { this.context.globalState.update(CONFIG_KEY, JSON.stringify(this.config)); } catch {}
  }

  private debouncePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      if (!this.context) return;
      try { this.context.globalState.update(AUDIT_KEY, JSON.stringify(this.auditLog.slice(-200))); } catch {}
    }, 5000);
  }

  private loadConfig(): void {
    if (!this.context) return;
    try {
      const saved = this.context.globalState.get<string>(CONFIG_KEY);
      if (saved) Object.assign(this.config, JSON.parse(saved));
      const auditSaved = this.context.globalState.get<string>(AUDIT_KEY);
      if (auditSaved) this.auditLog = JSON.parse(auditSaved);
    } catch {}
  }

  dispose(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.removeAllListeners();
  }
}
