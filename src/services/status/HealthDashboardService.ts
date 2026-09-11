/**
 * Phase 11.4 — Health Dashboard Service
 * Provides structured health report data for the dashboard UI.
 */
import { Logger } from '../../utils/Logger';
import { OverallHealth, HealthReport, HealthSection, HealthDetail, STATUS_CONSTANTS } from './StatusTypes';
import { StatusAggregator } from './StatusAggregator';
import { ConfigManager } from '../../utils/ConfigManager';

export class HealthDashboardService {
  private static instance: HealthDashboardService;

  static getInstance(): HealthDashboardService {
    if (!HealthDashboardService.instance) {
      HealthDashboardService.instance = new HealthDashboardService();
    }
    return HealthDashboardService.instance;
  }

  private constructor() {}

  getHealthReport(): HealthReport {
    const s = StatusAggregator.getInstance().getStatus();
    const sections: HealthSection[] = [];

    // Connection
    sections.push({
      name: 'Connection', status: s.connection.state === 'online' ? OverallHealth.HEALTHY : s.connection.state === 'degraded' ? OverallHealth.DEGRADED : OverallHealth.UNHEALTHY, icon: '$(cloud)',
      details: [
        { label: 'State', value: s.connection.state, status: s.connection.state === 'online' ? 'good' : s.connection.state === 'degraded' ? 'warn' : 'error', tooltip: null },
        { label: 'Latency', value: s.connection.latencyMs ? `${s.connection.latencyMs}ms` : 'N/A', status: !s.connection.latencyMs ? 'neutral' : s.connection.latencyMs < STATUS_CONSTANTS.LATENCY_GOOD_MS ? 'good' : s.connection.latencyMs < STATUS_CONSTANTS.LATENCY_WARN_MS ? 'warn' : 'error', tooltip: null },
        { label: 'Target', value: s.connection.target, status: 'neutral', tooltip: null },
      ],
    });

    // AI Model
    sections.push({
      name: 'AI Model', status: s.model.state === 'ready' ? OverallHealth.HEALTHY : s.model.state === 'loading' ? OverallHealth.DEGRADED : OverallHealth.UNHEALTHY, icon: '$(hubot)',
      details: [
        { label: 'Model', value: s.model.modelName ? ConfigManager.getDisplayName(s.model.modelName) : 'unknown', status: 'neutral', tooltip: null },
        { label: 'State', value: s.model.state, status: s.model.state === 'ready' ? 'good' : s.model.state === 'loading' ? 'warn' : 'error', tooltip: null },
        { label: 'Active', value: `${s.model.requestsActive} requests`, status: 'neutral', tooltip: null },
      ],
    });

    // Requests
    const errorRate = s.requests.totalInSession > 0 ? (s.requests.failedInSession / s.requests.totalInSession) * 100 : 0;
    sections.push({
      name: 'Requests', status: errorRate > 20 ? OverallHealth.UNHEALTHY : errorRate > 5 ? OverallHealth.DEGRADED : OverallHealth.HEALTHY, icon: '$(pulse)',
      details: [
        { label: 'Active / Queued', value: `${s.requests.active} / ${s.requests.queued}`, status: 'neutral', tooltip: null },
        { label: 'Throughput', value: `${s.requests.requestsPerMinute.toFixed(1)} req/min`, status: 'neutral', tooltip: null },
        { label: 'Error rate', value: `${errorRate.toFixed(1)}%`, status: errorRate > 20 ? 'error' : errorRate > 5 ? 'warn' : 'good', tooltip: null },
        { label: 'Avg latency', value: s.requests.avgLatencyMs ? `${(s.requests.avgLatencyMs / 1000).toFixed(1)}s` : 'N/A', status: 'neutral', tooltip: null },
      ],
    });

    // Cache
    sections.push({
      name: 'Cache', status: s.cache.hitRate > 0.5 ? OverallHealth.HEALTHY : s.cache.hitRate > 0.2 ? OverallHealth.DEGRADED : OverallHealth.HEALTHY, icon: '$(database)',
      details: [
        { label: 'Hit rate', value: `${(s.cache.hitRate * 100).toFixed(0)}%`, status: s.cache.hitRate > 0.5 ? 'good' : s.cache.hitRate > 0.2 ? 'warn' : 'neutral', tooltip: null },
        { label: 'Entries', value: String(s.cache.totalEntries), status: 'neutral', tooltip: null },
        { label: 'Size', value: `${s.cache.totalSizeMB} MB`, status: 'neutral', tooltip: null },
      ],
    });

    // Circuit Breakers
    sections.push({
      name: 'Circuit Breakers', status: s.circuitBreakers.open > 0 ? OverallHealth.UNHEALTHY : s.circuitBreakers.halfOpen > 0 ? OverallHealth.DEGRADED : OverallHealth.HEALTHY, icon: '$(shield)',
      details: [
        { label: 'Closed', value: String(s.circuitBreakers.closed), status: 'good', tooltip: null },
        { label: 'Open', value: String(s.circuitBreakers.open), status: s.circuitBreakers.open > 0 ? 'error' : 'good', tooltip: s.circuitBreakers.trippedNames.length > 0 ? s.circuitBreakers.trippedNames.join(', ') : null },
        { label: 'Half-open', value: String(s.circuitBreakers.halfOpen), status: s.circuitBreakers.halfOpen > 0 ? 'warn' : 'good', tooltip: null },
      ],
    });

    // Memory
    sections.push({
      name: 'Memory', status: OverallHealth.HEALTHY, icon: '$(brain)',
      details: [
        { label: 'Memories', value: String(s.memory.memoriesCount), status: 'neutral', tooltip: null },
        { label: 'Auto-extract', value: s.memory.autoExtractEnabled ? 'On' : 'Off', status: 'neutral', tooltip: null },
      ],
    });

    // Tokens
    sections.push({
      name: 'Tokens', status: (s.tokens.contextWindowPercent || 0) > 95 ? OverallHealth.UNHEALTHY : (s.tokens.contextWindowPercent || 0) > 80 ? OverallHealth.DEGRADED : OverallHealth.HEALTHY, icon: '$(symbol-number)',
      details: [
        { label: 'Session', value: this.fmt(s.tokens.sessionTotalTokens), status: 'neutral', tooltip: null },
        { label: 'Daily', value: this.fmt(s.tokens.dailyTokens), status: 'neutral', tooltip: null },
        { label: 'Context', value: s.tokens.contextWindowPercent ? `${s.tokens.contextWindowPercent}%` : 'N/A', status: (s.tokens.contextWindowPercent || 0) > 80 ? 'warn' : 'good', tooltip: null },
      ],
    });

    // Recommendations
    const recommendations: string[] = [];
    if (s.connection.state === 'offline') recommendations.push('Connection lost — check your internet and API server');
    if (s.circuitBreakers.open > 0) recommendations.push(`${s.circuitBreakers.open} circuit breakers tripped — reset or investigate errors`);
    if (s.cache.hitRate < 0.3 && s.cache.totalEntries > 10) recommendations.push('Low cache hit rate — consider increasing cache TTL');
    if ((s.tokens.contextWindowPercent || 0) > 90) recommendations.push('Context window nearly full — reduce context to avoid truncation');
    if (errorRate > 10) recommendations.push(`High error rate (${errorRate.toFixed(0)}%) — check error dashboard`);

    return { overall: s.overall, sections, recommendations, timestamp: Date.now() };
  }

  getQuickActions(): { label: string; command: string; icon: string; condition: boolean }[] {
    const s = StatusAggregator.getInstance().getStatus();
    return [
      { label: 'Retry Connection', command: 'inaCoding.checkConnectivity', icon: '$(cloud)', condition: s.connection.state !== 'online' },
      { label: 'Reset Breakers', command: 'inaCoding.resetCircuitBreakers', icon: '$(shield)', condition: s.circuitBreakers.open > 0 },
      { label: 'Reindex', command: 'inaCoding.indexWorkspace', icon: '$(database)', condition: s.indexing.state === 'error' || s.indexing.state === 'idle' },
      { label: 'Clear Cache', command: 'inaCoding.clearAllCaches', icon: '$(trash)', condition: s.cache.hitRate < 0.2 },
      { label: 'View Errors', command: 'inaCoding.showErrorDashboard', icon: '$(bug)', condition: s.diagnostics.errors > 0 },
    ].filter(a => a.condition);
  }

  private fmt(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1000000) return `${Math.round(n / 1000)}K`;
    return `${(n / 1000000).toFixed(1)}M`;
  }
}
