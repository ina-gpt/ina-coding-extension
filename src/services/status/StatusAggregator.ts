/**
 * Phase 11.4 — Status Aggregator
 * Central hub collecting real-time status from all services.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { SystemStatus, OverallHealth, getDefaultSystemStatus, STATUS_CONSTANTS } from './StatusTypes';
import { ConfigManager } from '../../utils/ConfigManager';

export class StatusAggregator extends EventEmitter {
  private static instance: StatusAggregator;
  private currentStatus: SystemStatus = getDefaultSystemStatus();
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private services: Record<string, any> = {};
  private tokenHistory: { timestamp: number; tokensIn: number; tokensOut: number }[] = [];
  private sessionTokensIn = 0;
  private sessionTokensOut = 0;
  private contextWindowUsed = 0;
  private contextWindowMax = 0;
  private lastOnlineAt = 0;

  static getInstance(): StatusAggregator {
    if (!StatusAggregator.instance) {
      StatusAggregator.instance = new StatusAggregator();
    }
    return StatusAggregator.instance;
  }

  private constructor() { super(); }

  initialize(services: Record<string, any>): void {
    this.services = services;
    Logger.info('[StatusAggregator] Initialized with services:', Object.keys(services).join(', '));
  }

  startUpdating(intervalMs: number = STATUS_CONSTANTS.UPDATE_INTERVAL_MS): void {
    this.stopUpdating();
    this.updateTimer = setInterval(() => {
      const prev = this.currentStatus.overall;
      this.collectStatus();
      if (this.currentStatus.overall !== prev) {
        this.emit('health-changed', this.currentStatus.overall, prev);
      }
      this.emit('status-updated', this.currentStatus);
    }, intervalMs);
  }

  stopUpdating(): void {
    if (this.updateTimer) { clearInterval(this.updateTimer); this.updateTimer = null; }
  }

  collectStatus(): SystemStatus {
    const s = getDefaultSystemStatus();
    s.timestamp = Date.now();

    // Connection
    try {
      const cm = this.services.connectivityMonitor;
      if (cm) {
        const health = cm.getHealth?.();
        if (health) {
          s.connection.state = health.state || 'online';
          s.connection.lastCheckedAt = health.lastCheckedAt || 0;
          s.connection.latencyMs = health.targets?.api?.latencyMs ?? null;
          if (s.connection.state === 'online') this.lastOnlineAt = Date.now();
          s.connection.uptime = this.lastOnlineAt > 0 ? Date.now() - this.lastOnlineAt : null;
        }
      }
      s.connection.target = ConfigManager.get<string>('api.endpoint', 'https://coding-api.inagpt.com');
    } catch {}

    // Model
    try {
      // The MIGRATED id, not the raw setting. Reading the raw value put a
      // legacy name — and, for an old enough install, a raw upstream id —
      // straight onto the status bar and into the health dashboard.
      s.model.modelName = ConfigManager.getConfiguredModel('general');
      const rs = this.services.requestScheduler;
      if (rs) {
        const metrics = rs.getMetrics?.();
        if (metrics) {
          s.model.requestsActive = (metrics.byCategory?.chat?.active || 0) + (metrics.byCategory?.completion?.active || 0);
          s.model.queueDepth = (metrics.byCategory?.chat?.queued || 0) + (metrics.byCategory?.completion?.queued || 0);
        }
      }
      const rm = this.services.requestMetrics;
      if (rm) {
        const m = rm.getMetrics?.();
        if (m && m.avgExecutionTimeMs) s.model.lastResponseMs = m.avgExecutionTimeMs;
      }
      const cbr = this.services.circuitBreakerRegistry;
      if (cbr) {
        const health = cbr.getOverallHealth?.();
        if (health?.tripped?.includes('chat') || health?.tripped?.includes('completion')) {
          s.model.state = 'unavailable';
        } else {
          s.model.state = s.connection.state === 'online' ? 'ready' : 'unavailable';
        }
      } else {
        s.model.state = s.connection.state === 'online' ? 'ready' : 'unknown';
      }
    } catch {}

    // Requests
    try {
      const rm = this.services.requestMetrics;
      if (rm) {
        const m = rm.getMetrics?.();
        if (m) {
          s.requests.active = m.activeRequests || 0;
          s.requests.queued = m.queuedRequests || 0;
          s.requests.totalInSession = m.totalRequests || 0;
          s.requests.failedInSession = m.failedRequests || 0;
          s.requests.avgLatencyMs = m.avgExecutionTimeMs || null;
        }
      }
      const rs = this.services.requestScheduler;
      if (rs) {
        const m = rs.getMetrics?.();
        if (m?.byCategory) s.requests.byCategory = m.byCategory;
        s.requests.requestsPerMinute = this.services.requestMetrics?.getRequestsPerMinute?.() || 0;
      }
    } catch {}

    // Tokens
    s.tokens.sessionTokensIn = this.sessionTokensIn;
    s.tokens.sessionTokensOut = this.sessionTokensOut;
    s.tokens.sessionTotalTokens = this.sessionTokensIn + this.sessionTokensOut;
    if (this.tokenHistory.length > 0) {
      const last = this.tokenHistory[this.tokenHistory.length - 1];
      s.tokens.lastRequestTokensIn = last.tokensIn;
      s.tokens.lastRequestTokensOut = last.tokensOut;
    }
    if (this.contextWindowMax > 0) {
      s.tokens.contextWindowUsed = this.contextWindowUsed;
      s.tokens.contextWindowMax = this.contextWindowMax;
      s.tokens.contextWindowPercent = Math.round((this.contextWindowUsed / this.contextWindowMax) * 100);
    }

    // Agent
    try {
      const asm = this.services.agentSessionManager;
      if (asm) {
        const session = asm.getActiveSession?.();
        if (session) {
          s.agent.isActive = true;
          s.agent.sessionId = session.id;
          s.agent.status = session.status;
          s.agent.filesChanged = session.filesChanged?.length || 0;
        }
        const ee = this.services.executionEngine;
        if (ee && s.agent.isActive) {
          const progress = ee.getProgress?.();
          if (progress) {
            s.agent.progress = progress.percentage || null;
            s.agent.currentStep = progress.currentStepDescription || null;
          }
        }
      }
    } catch {}

    // Git
    try {
      const gs = this.services.gitStatusService;
      if (gs) {
        // Use cached status if available
        const cached = gs._cachedStatus || gs._lastStatus;
        if (cached) {
          s.git.branch = cached.branch?.name || null;
          s.git.isClean = cached.isClean ?? true;
          s.git.changesCount = (cached.staged?.length || 0) + (cached.unstaged?.length || 0) + (cached.untracked?.length || 0);
          s.git.ahead = cached.branch?.ahead || 0;
          s.git.behind = cached.branch?.behind || 0;
        }
      }
    } catch {}

    // Diagnostics
    try {
      const ds = this.services.diagnosticService;
      if (ds) {
        const all = ds.getDiagnostics?.() || [];
        s.diagnostics.errors = all.filter((d: any) => d.severity === 0).length;
        s.diagnostics.warnings = all.filter((d: any) => d.severity === 1).length;
        s.diagnostics.infos = all.filter((d: any) => d.severity === 2).length;
        s.diagnostics.hints = all.filter((d: any) => d.severity === 3).length;
        const errorFiles = new Set(all.filter((d: any) => d.severity === 0).map((d: any) => d.filePath));
        s.diagnostics.filesWithErrors = errorFiles.size;
      }
    } catch {}

    // Memory
    try {
      const mc = this.services.memoryClient;
      if (mc?._cachedStats) {
        s.memory.memoriesCount = mc._cachedStats.total || 0;
      }
    } catch {}

    // Rules
    try {
      const ri = this.services.rulesInjector;
      if (ri) {
        s.rules.projectRulesActive = ri.isRulesActive?.() || false;
        const summary = ri.getRulesSummary?.();
        if (summary) {
          const match = summary.match(/(\d+)\s*rules?/);
          s.rules.rulesCount = match ? parseInt(match[1]) : 0;
        }
      }
    } catch {}

    // Cache
    try {
      const cm = this.services.cacheManager;
      if (cm) {
        const stats = cm.getGlobalStats?.();
        if (stats) {
          s.cache.totalEntries = stats.totalEntries || 0;
          s.cache.totalSizeMB = Math.round((stats.totalSizeBytes || 0) / (1024 * 1024) * 10) / 10;
          s.cache.hitRate = stats.overallHitRate || 0;
        }
      }
    } catch {}

    // Circuit Breakers
    try {
      const cbr = this.services.circuitBreakerRegistry;
      if (cbr) {
        const health = cbr.getOverallHealth?.();
        if (health) {
          s.circuitBreakers.closed = health.healthy?.length || 0;
          s.circuitBreakers.open = health.tripped?.length || 0;
          s.circuitBreakers.halfOpen = health.halfOpen?.length || 0;
          s.circuitBreakers.total = s.circuitBreakers.closed + s.circuitBreakers.open + s.circuitBreakers.halfOpen;
          s.circuitBreakers.trippedNames = health.tripped || [];
        }
      }
    } catch {}

    // Overall health
    s.overall = this.calculateOverallHealth(s);
    this.currentStatus = s;
    return s;
  }

  getStatus(): SystemStatus {
    return this.currentStatus;
  }

  recordTokenUsage(tokensIn: number, tokensOut: number): void {
    this.sessionTokensIn += tokensIn;
    this.sessionTokensOut += tokensOut;
    this.tokenHistory.push({ timestamp: Date.now(), tokensIn, tokensOut });
    if (this.tokenHistory.length > STATUS_CONSTANTS.MAX_TOKEN_HISTORY) {
      this.tokenHistory.shift();
    }
    this.emit('tokens-recorded', { tokensIn, tokensOut, total: this.sessionTokensIn + this.sessionTokensOut });
  }

  recordContextWindowUsage(used: number, max: number): void {
    this.contextWindowUsed = used;
    this.contextWindowMax = max;
    const percent = max > 0 ? used / max : 0;
    if (percent > STATUS_CONSTANTS.TOKEN_WARN_THRESHOLD) {
      this.emit('context-warning', Math.round(percent * 100));
    }
  }

  getStatusForWebview(): SystemStatus {
    return { ...this.currentStatus };
  }

  getStatusSummary(): string {
    const s = this.currentStatus;
    const parts: string[] = [];
    parts.push(s.connection.state === 'online' ? 'Online' : s.connection.state);
    // getDisplayName, never a split() of the raw id: splitting on ':' was
    // designed to shorten an upstream tag, which is the exact string that must
    // never be rendered.
    if (s.model.modelName) parts.push(ConfigManager.getDisplayName(s.model.modelName));
    if (s.memory.memoriesCount > 0) parts.push(`${s.memory.memoriesCount} memories`);
    if (s.diagnostics.errors > 0) parts.push(`${s.diagnostics.errors} errors`);
    parts.push(this.formatTokenCount(s.tokens.sessionTotalTokens) + ' tokens');
    return parts.join(' • ');
  }

  resetSession(): void {
    this.sessionTokensIn = 0;
    this.sessionTokensOut = 0;
    this.tokenHistory = [];
    this.contextWindowUsed = 0;
    this.contextWindowMax = 0;
  }

  private calculateOverallHealth(s: SystemStatus): OverallHealth {
    if (s.connection.state === 'offline') return OverallHealth.OFFLINE;
    if (s.circuitBreakers.open > 0 || s.model.state === 'unavailable') return OverallHealth.UNHEALTHY;
    if (s.connection.state === 'degraded' || s.circuitBreakers.halfOpen > 0 || s.model.state === 'loading') return OverallHealth.DEGRADED;
    if (s.connection.state === 'online' && s.model.state === 'ready') return OverallHealth.HEALTHY;
    return OverallHealth.UNKNOWN;
  }

  private formatTokenCount(tokens: number): string {
    if (tokens < 1000) return String(tokens);
    if (tokens < 1000000) return `${Math.round(tokens / 1000)}K`;
    return `${(tokens / 1000000).toFixed(1)}M`;
  }

  dispose(): void {
    this.stopUpdating();
    this.removeAllListeners();
  }
}
