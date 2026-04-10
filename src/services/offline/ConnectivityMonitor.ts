/**
 * Phase 10.3 — Connectivity Monitor
 * Monitors connection to API server, Ollama, GPU, and internet.
 */
import { EventEmitter } from 'events';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';
import {
  ConnectionState, ConnectionTarget, ConnectionHealth, TargetHealth,
  OfflineEvent, OFFLINE_CONSTANTS,
} from './OfflineTypes';

export class ConnectivityMonitor extends EventEmitter {
  private static instance: ConnectivityMonitor;
  private health: ConnectionHealth;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttemptIndex = 0;
  private isMonitoring = false;
  private previousState: ConnectionState = ConnectionState.UNKNOWN;

  static getInstance(): ConnectivityMonitor {
    if (!ConnectivityMonitor.instance) {
      ConnectivityMonitor.instance = new ConnectivityMonitor();
    }
    return ConnectivityMonitor.instance;
  }

  private constructor() {
    super();
    this.health = {
      state: ConnectionState.UNKNOWN,
      targets: {},
      lastCheckedAt: 0,
      lastOnlineAt: null,
      lastOfflineAt: null,
      downDurationMs: null,
      reconnectAttempts: 0,
    };
  }

  start(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    Logger.info('[Offline] Connectivity monitoring started');
    this.runHealthCheck().catch(() => {});
    this.healthCheckTimer = setInterval(
      () => this.runHealthCheck().catch(() => {}),
      OFFLINE_CONSTANTS.HEALTH_CHECK_INTERVAL_MS
    );
  }

  stop(): void {
    this.isMonitoring = false;
    if (this.healthCheckTimer) { clearInterval(this.healthCheckTimer); this.healthCheckTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  getHealth(): ConnectionHealth { return { ...this.health }; }
  isOnline(): boolean { return this.health.state === ConnectionState.ONLINE; }
  isOffline(): boolean { return this.health.state === ConnectionState.OFFLINE; }
  isDegraded(): boolean { return this.health.state === ConnectionState.DEGRADED; }
  getState(): ConnectionState { return this.health.state; }

  async forceCheck(): Promise<ConnectionHealth> {
    await this.runHealthCheck();
    return this.getHealth();
  }

  private async runHealthCheck(): Promise<void> {
    const startTime = Date.now();
    const apiEndpoint = ConfigManager.getApiEndpoint();

    // Check API server health
    let apiOnline = false;
    let apiLatency: number | null = null;
    let ollamaOnline = false;
    let gpuOnline = false;
    let dbOnline = false;
    let apiError: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), OFFLINE_CONSTANTS.HEALTH_CHECK_TIMEOUT_MS);
      const apiStart = Date.now();
      const response = await fetch(`${apiEndpoint}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      apiLatency = Date.now() - apiStart;

      if (response.ok) {
        apiOnline = true;
        try {
          const data = await response.json();
          ollamaOnline = data.services?.ollama === true;
          gpuOnline = data.services?.embedding === true;
          dbOnline = data.services?.database === true;
        } catch { /* parse error, at least API is up */ }
      }
    } catch (e: any) {
      apiError = e?.message || 'Connection failed';
    }

    // Update target health
    this.updateTargetHealth(ConnectionTarget.API_SERVER, apiOnline, apiLatency, apiError);
    this.updateTargetHealth(ConnectionTarget.OLLAMA, ollamaOnline, null, apiOnline ? null : 'API offline');
    this.updateTargetHealth(ConnectionTarget.GPU, gpuOnline, null, apiOnline ? null : 'API offline');
    this.updateTargetHealth(ConnectionTarget.DATABASE, dbOnline, null, apiOnline ? null : 'API offline');

    // Determine overall state
    const newState = this.determineOverallState(apiOnline, apiLatency);
    this.health.lastCheckedAt = Date.now();

    if (newState !== this.previousState) {
      this.handleStateTransition(this.previousState, newState);
      this.previousState = newState;
    }

    this.health.state = newState;
    this.emit('health-check', this.getHealth());
  }

  private determineOverallState(apiOnline: boolean, latencyMs: number | null): ConnectionState {
    if (!apiOnline) return ConnectionState.OFFLINE;
    if (latencyMs !== null && latencyMs > OFFLINE_CONSTANTS.DEGRADED_THRESHOLD_LATENCY_MS) return ConnectionState.DEGRADED;
    return ConnectionState.ONLINE;
  }

  private handleStateTransition(oldState: ConnectionState, newState: ConnectionState): void {
    Logger.info(`[Offline] State transition: ${oldState} → ${newState}`);

    if (newState === ConnectionState.OFFLINE && oldState !== ConnectionState.OFFLINE) {
      this.health.lastOfflineAt = Date.now();
      this.emit('went-offline', this.getHealth());
      this.startReconnectLoop();
    } else if (newState === ConnectionState.ONLINE && oldState !== ConnectionState.ONLINE && oldState !== ConnectionState.UNKNOWN) {
      this.health.lastOnlineAt = Date.now();
      if (this.health.lastOfflineAt) {
        this.health.downDurationMs = Date.now() - this.health.lastOfflineAt;
      }
      this.stopReconnectLoop();
      this.emit('reconnected', this.getHealth());
      this.emit('went-online', this.getHealth());
    } else if (newState === ConnectionState.DEGRADED) {
      this.emit('degraded', this.getHealth());
    }

    if (newState === ConnectionState.ONLINE) {
      this.health.lastOnlineAt = Date.now();
    }
  }

  private startReconnectLoop(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttemptIndex = 0;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttemptIndex >= OFFLINE_CONSTANTS.MAX_RECONNECT_ATTEMPTS) {
      Logger.warn('[Offline] Max reconnect attempts reached, staying in periodic check mode');
      return;
    }

    const backoffMs = OFFLINE_CONSTANTS.RECONNECT_BACKOFF_MS[
      Math.min(this.reconnectAttemptIndex, OFFLINE_CONSTANTS.RECONNECT_BACKOFF_MS.length - 1)
    ];

    this.health.reconnectAttempts = this.reconnectAttemptIndex + 1;
    this.health.state = ConnectionState.RECONNECTING;
    this.emit('reconnecting', this.getHealth());

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.runHealthCheck().catch(() => {});
      if (this.health.state === ConnectionState.OFFLINE || this.health.state === ConnectionState.RECONNECTING) {
        this.reconnectAttemptIndex++;
        this.scheduleReconnect();
      }
    }, backoffMs);
  }

  private stopReconnectLoop(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.reconnectAttemptIndex = 0;
    this.health.reconnectAttempts = 0;
  }

  private updateTargetHealth(target: ConnectionTarget, online: boolean, latencyMs: number | null, error: string | null): void {
    const existing = this.health.targets[target];
    const now = Date.now();
    this.health.targets[target] = {
      target,
      state: online ? ConnectionState.ONLINE : ConnectionState.OFFLINE,
      latencyMs,
      lastSuccessAt: online ? now : (existing?.lastSuccessAt ?? null),
      lastFailureAt: online ? (existing?.lastFailureAt ?? null) : now,
      errorMessage: error,
      consecutiveFailures: online ? 0 : ((existing?.consecutiveFailures ?? 0) + 1),
    };
  }

  dispose(): void {
    this.stop();
    this.removeAllListeners();
  }
}
