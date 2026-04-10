/**
 * Phase 12.1 — Data Retention Manager
 * Enforces data retention policies and auto-deletes expired data.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { DataRetentionConfig, PRIVACY_DEFAULTS } from './PrivacyTypes';
import { PrivacyModeManager } from './PrivacyModeManager';
import { DataSanitizer } from './DataSanitizer';
import { EditorCompat } from '../compat/EditorCompat';

export interface CleanupResult {
  chatHistoryDeleted: number;
  memoriesDeleted: number;
  cacheEntriesPruned: number;
  errorLogsDeleted: number;
  tokenHistoryTrimmed: number;
  offlineQueuePurged: number;
  totalItemsDeleted: number;
  bytesFreed: number;
}

export class DataRetentionManager extends EventEmitter {
  private static instance: DataRetentionManager;
  private config: DataRetentionConfig;
  private context: vscode.ExtensionContext | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  static getInstance(): DataRetentionManager {
    if (!DataRetentionManager.instance) {
      DataRetentionManager.instance = new DataRetentionManager();
    }
    return DataRetentionManager.instance;
  }

  private constructor() {
    super();
    this.config = PRIVACY_DEFAULTS.dataRetention;
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    const pm = PrivacyModeManager.getInstance();
    this.config = pm.getConfig().dataRetention;
  }

  startAutoCleanup(intervalMs: number = 6 * 60 * 60 * 1000): void {
    this.stopAutoCleanup();
    if (this.config.autoDeleteExpired) {
      this.cleanupTimer = setInterval(() => this.cleanupExpiredData(), intervalMs);
      // Run initial cleanup after 30s
      setTimeout(() => this.cleanupExpiredData(), 30000);
    }
  }

  stopAutoCleanup(): void {
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
  }

  async cleanupExpiredData(): Promise<CleanupResult> {
    const result: CleanupResult = { chatHistoryDeleted: 0, memoriesDeleted: 0, cacheEntriesPruned: 0, errorLogsDeleted: 0, tokenHistoryTrimmed: 0, offlineQueuePurged: 0, totalItemsDeleted: 0, bytesFreed: 0 };

    try {
      // Error logs (from ErrorAnalyticsEngine globalState)
      result.errorLogsDeleted = this.cleanGlobalStateArray('inaCoding.errorHistory', this.config.errorLogRetentionDays);

      // Token history
      result.tokenHistoryTrimmed = this.cleanGlobalStateArray('inaCoding.tokenHistory', this.config.tokenHistoryRetentionDays);

      // Offline queue
      result.offlineQueuePurged = this.cleanGlobalStateArray('inaCoding.offlineQueue', this.config.offlineQueueRetentionHours / 24);

      result.totalItemsDeleted = result.chatHistoryDeleted + result.memoriesDeleted + result.cacheEntriesPruned + result.errorLogsDeleted + result.tokenHistoryTrimmed + result.offlineQueuePurged;

      if (result.totalItemsDeleted > 0) {
        Logger.info(`[Retention] Cleanup: ${result.totalItemsDeleted} items deleted`);
        this.emit('cleanup-complete', result);
      }
    } catch (e) {
      Logger.debug('[Retention] Cleanup error:', e);
    }

    return result;
  }

  async deleteAllUserData(): Promise<void> {
    if (!this.context) return;
    Logger.info('[Retention] Deleting ALL user data');

    // Clear all globalState keys
    const keys = this.context.globalState.keys();
    for (const key of keys) {
      if (key.startsWith('inaCoding.') || key.startsWith('ina-')) {
        await this.context.globalState.update(key, undefined);
      }
    }

    // Clear secrets (using EditorCompat for cross-editor compatibility)
    try {
      const compat = EditorCompat.getInstance();
      await compat.deleteSecret(this.context, 'ina-encryption-key');
      await compat.deleteSecret(this.context, 'ina-encryption-salt');
      await compat.deleteSecret(this.context, 'ina-api-key');
    } catch {}

    // Emit for server-side deletion
    this.emit('delete-all-requested');

    Logger.info('[Retention] All local user data deleted');
    vscode.window.showInformationMessage('All your INA Coding data has been deleted.');
  }

  async deleteCategory(category: string): Promise<number> {
    if (!this.context) return 0;
    const keyMap: Record<string, string[]> = {
      chat: ['inaCoding.chatHistory', 'inaCoding.conversations'],
      errors: ['inaCoding.errorHistory', 'inaCoding.errorAnalytics'],
      tokens: ['inaCoding.tokenTracker.daily', 'inaCoding.tokenTracker.monthly', 'inaCoding.tokenTracker.date'],
      queue: ['inaCoding.offlineQueue'],
      cache: [],  // handled by CacheManager.invalidateAll
      onboarding: ['inaCoding.onboardingState'],
      shortcuts: ['inaCoding.shortcutOverrides', 'inaCoding.shortcutDisabled', 'inaCoding.shortcutProfile'],
    };

    const keys = keyMap[category] || [];
    for (const key of keys) {
      await this.context.globalState.update(key, undefined);
    }
    return keys.length;
  }

  async exportAllUserData(): Promise<string> {
    if (!this.context) return '{}';
    const data: Record<string, any> = {};
    const keys = this.context.globalState.keys();
    for (const key of keys) {
      if (key.startsWith('inaCoding.')) {
        data[key] = this.context.globalState.get(key);
      }
    }
    // Sanitize before export
    return JSON.stringify(DataSanitizer.getInstance().sanitizeForExport(data), null, 2);
  }

  getRetentionSchedule(): { category: string; retentionDays: number; estimatedDeletionDate: Date | null }[] {
    return [
      { category: 'Chat History', retentionDays: this.config.chatHistoryDays, estimatedDeletionDate: null },
      { category: 'Memories', retentionDays: this.config.memoryRetentionDays, estimatedDeletionDate: null },
      { category: 'Cache', retentionDays: this.config.cacheRetentionDays, estimatedDeletionDate: null },
      { category: 'Error Logs', retentionDays: this.config.errorLogRetentionDays, estimatedDeletionDate: null },
      { category: 'Token History', retentionDays: this.config.tokenHistoryRetentionDays, estimatedDeletionDate: null },
    ];
  }

  private cleanGlobalStateArray(key: string, retentionDays: number): number {
    if (!this.context) return 0;
    try {
      const raw = this.context.globalState.get<string>(key);
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return 0;
      const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      const filtered = arr.filter((item: any) => (item.timestamp || item.createdAt || 0) >= cutoff);
      const deleted = arr.length - filtered.length;
      if (deleted > 0) {
        this.context.globalState.update(key, JSON.stringify(filtered));
      }
      return deleted;
    } catch { return 0; }
  }

  dispose(): void {
    this.stopAutoCleanup();
    this.removeAllListeners();
  }
}
