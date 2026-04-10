/**
 * Phase 10.4 — Self-Healing Engine
 * Auto-fixes recurring problems.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { SelfHealAction, ERROR_CONSTANTS } from './ErrorTypes';

export class SelfHealingEngine extends EventEmitter {
  private static instance: SelfHealingEngine;
  private actions: SelfHealAction[] = [];
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private actionHistory: { action: string; executedAt: number; success: boolean; description: string }[] = [];

  static getInstance(): SelfHealingEngine {
    if (!SelfHealingEngine.instance) { SelfHealingEngine.instance = new SelfHealingEngine(); }
    return SelfHealingEngine.instance;
  }

  private constructor() { super(); }

  registerAction(action: SelfHealAction): void {
    this.actions.push(action);
  }

  startPeriodicCheck(intervalMs = ERROR_CONSTANTS.SELF_HEAL_COOLDOWN_MS): void {
    if (this.checkTimer) return;
    this.checkTimer = setInterval(() => this.checkAndHeal().catch(() => {}), intervalMs);
  }

  async checkAndHeal(): Promise<{ actionsExecuted: number; successes: number; failures: number }> {
    let actionsExecuted = 0, successes = 0, failures = 0;

    for (const action of this.actions) {
      if (this.isOnCooldown(action)) continue;

      try {
        if (!action.condition()) continue;
      } catch { continue; }

      actionsExecuted++;
      try {
        const result = await this.executeAction(action);
        if (result) { successes++; action.successCount++; }
        else { failures++; action.failureCount++; }
      } catch {
        failures++;
        action.failureCount++;
      }
    }

    return { actionsExecuted, successes, failures };
  }

  getActionHistory(): typeof this.actionHistory { return [...this.actionHistory]; }
  getRegisteredActions(): SelfHealAction[] { return [...this.actions]; }

  private isOnCooldown(action: SelfHealAction): boolean {
    return action.lastExecutedAt !== null && (Date.now() - action.lastExecutedAt) < ERROR_CONSTANTS.SELF_HEAL_COOLDOWN_MS;
  }

  private async executeAction(action: SelfHealAction): Promise<boolean> {
    Logger.info(`[SelfHeal] Executing: ${action.description}`);
    action.lastExecutedAt = Date.now();

    const success = await action.action();
    this.actionHistory.push({
      action: action.trigger,
      executedAt: Date.now(),
      success,
      description: action.description,
    });

    if (this.actionHistory.length > 100) this.actionHistory.shift();
    this.emit('heal-attempt', action.trigger, success);
    return success;
  }

  dispose(): void {
    if (this.checkTimer) { clearInterval(this.checkTimer); this.checkTimer = null; }
    this.removeAllListeners();
  }
}
