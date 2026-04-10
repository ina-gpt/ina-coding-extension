/**
 * Phase 11.4 — Status Bar Manager
 * Manages all VS Code status bar items for INA Coding.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { SystemStatus, OverallHealth, STATUS_CONSTANTS } from './StatusTypes';
import { StatusAggregator } from './StatusAggregator';

export class StatusBarManager {
  private static instance: StatusBarManager;
  private items = new Map<string, vscode.StatusBarItem>();
  private statusAggregator: StatusAggregator | null = null;
  private updateTimer: ReturnType<typeof setInterval> | null = null;

  static getInstance(): StatusBarManager {
    if (!StatusBarManager.instance) {
      StatusBarManager.instance = new StatusBarManager();
    }
    return StatusBarManager.instance;
  }

  private constructor() {}

  initialize(aggregator: StatusAggregator): void {
    this.statusAggregator = aggregator;
    this.createItems();
    this.startUpdating();
    Logger.info('[StatusBar] Initialized with status items');
  }

  private createItems(): void {
    // Connection
    this.createItem('ina-connection', '$(cloud) INA', vscode.StatusBarAlignment.Left, 100, 'inaCoding.checkConnectivity');
    // Model
    this.createItem('ina-model', '$(hubot)', vscode.StatusBarAlignment.Left, 99, null);
    // Indexing (hidden by default)
    const indexItem = this.createItem('ina-indexing', '$(database)', vscode.StatusBarAlignment.Left, 98, 'inaCoding.showIndexPanel');
    indexItem.hide();
    // Requests (hidden by default)
    const reqItem = this.createItem('ina-requests', '$(pulse)', vscode.StatusBarAlignment.Left, 97, 'inaCoding.showRequestStats');
    reqItem.hide();
    // Tokens
    this.createItem('ina-tokens', '$(symbol-number) 0', vscode.StatusBarAlignment.Right, 96, 'inaCoding.showTokenUsage');
    // Agent (hidden by default)
    const agentItem = this.createItem('ina-agent', '$(robot)', vscode.StatusBarAlignment.Left, 95, 'inaCoding.openChat');
    agentItem.hide();
    // Git
    this.createItem('ina-git', '$(git-branch)', vscode.StatusBarAlignment.Right, 94, 'inaCoding.showGitPanel');
    // Diagnostics (hidden by default)
    const diagItem = this.createItem('ina-diagnostics', '$(check)', vscode.StatusBarAlignment.Right, 93, null);
    diagItem.hide();
    // Health (hidden by default — only show when not healthy)
    const healthItem = this.createItem('ina-health', '$(heart)', vscode.StatusBarAlignment.Right, 91, 'inaCoding.showHealthDashboard');
    healthItem.hide();
  }

  private createItem(id: string, text: string, alignment: vscode.StatusBarAlignment, priority: number, command: string | null): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(alignment, priority);
    item.text = text;
    if (command) item.command = command;
    item.show();
    this.items.set(id, item);
    return item;
  }

  private startUpdating(): void {
    this.updateTimer = setInterval(() => this.update(), STATUS_CONSTANTS.UPDATE_INTERVAL_MS);
  }

  update(): void {
    if (!this.statusAggregator) return;
    const s = this.statusAggregator.getStatus();
    const cfg = vscode.workspace.getConfiguration('inaCoding.status');

    // Connection
    const conn = this.items.get('ina-connection');
    if (conn && cfg.get('showConnectionStatus', true)) {
      conn.show();
      switch (s.connection.state) {
        case 'online': conn.text = '$(cloud) INA'; conn.color = undefined; conn.tooltip = `Connected${s.connection.latencyMs ? ` (${s.connection.latencyMs}ms)` : ''}`; break;
        case 'offline': conn.text = '$(cloud-offline) INA'; conn.color = new vscode.ThemeColor('errorForeground'); conn.tooltip = 'Offline — click to retry'; break;
        case 'degraded': conn.text = '$(cloud) INA'; conn.color = new vscode.ThemeColor('warningForeground'); conn.tooltip = `Degraded${s.connection.latencyMs ? ` (${s.connection.latencyMs}ms)` : ''}`; break;
        case 'reconnecting': conn.text = '$(sync~spin) INA'; conn.color = undefined; conn.tooltip = 'Reconnecting...'; break;
      }
    } else { conn?.hide(); }

    // Model
    const model = this.items.get('ina-model');
    if (model && cfg.get('showModelStatus', true)) {
      const shortName = ConfigManager.getDisplayName(s.model.modelName || '') || s.model.modelName?.split(':')[0] || '?';
      switch (s.model.state) {
        case 'ready': model.text = `$(hubot) ${shortName}`; model.color = undefined; break;
        case 'loading': model.text = '$(loading~spin) Model'; model.color = new vscode.ThemeColor('warningForeground'); break;
        case 'unavailable': model.text = '$(warning) Model'; model.color = new vscode.ThemeColor('errorForeground'); break;
        default: model.text = '$(hubot) ?'; model.color = undefined;
      }
      const parts = [`Model: ${s.model.modelName || 'unknown'}`];
      if (s.model.vramUsedMB && s.model.vramTotalMB) parts.push(`VRAM: ${s.model.vramUsedMB}/${s.model.vramTotalMB} GB`);
      if (s.model.lastResponseMs) parts.push(`Last response: ${(s.model.lastResponseMs / 1000).toFixed(1)}s`);
      parts.push(`Active: ${s.model.requestsActive}, Queue: ${s.model.queueDepth}`);
      model.tooltip = parts.join('\n');
      model.show();
    } else { model?.hide(); }

    // Indexing
    const idx = this.items.get('ina-indexing');
    if (idx) {
      if (s.indexing.state !== 'idle' && s.indexing.state !== 'complete') {
        idx.text = s.indexing.state === 'scanning' ? '$(search~spin) Scanning...' :
          s.indexing.state === 'embedding' ? `$(pulse~spin) Embed ${s.indexing.progress || 0}%` :
          s.indexing.state === 'error' ? '$(error) Index Error' :
          `$(database~spin) Index ${s.indexing.progress || 0}%`;
        idx.color = s.indexing.state === 'error' ? new vscode.ThemeColor('errorForeground') : undefined;
        idx.tooltip = `${s.indexing.filesProcessed || 0}/${s.indexing.filesTotal || '?'} files${s.indexing.currentFile ? `\nCurrent: ${s.indexing.currentFile}` : ''}`;
        idx.show();
      } else { idx.hide(); }
    }

    // Requests
    const req = this.items.get('ina-requests');
    if (req && cfg.get('showRequestActivity', true)) {
      if (s.requests.active > 0 || s.requests.queued > 0) {
        req.text = s.requests.active > 0 ? `$(pulse~spin) ${s.requests.active}` : `$(clock) ${s.requests.queued} queued`;
        req.tooltip = `Active: ${s.requests.active}\nQueued: ${s.requests.queued}\nAvg: ${s.requests.avgLatencyMs ? `${(s.requests.avgLatencyMs / 1000).toFixed(1)}s` : '?'}`;
        req.show();
      } else { req.hide(); }
    } else { req?.hide(); }

    // Tokens
    const tok = this.items.get('ina-tokens');
    if (tok && cfg.get('showTokenUsage', true)) {
      const total = s.tokens.sessionTotalTokens;
      tok.text = `$(symbol-number) ${this.formatTokens(total)}`;
      const ctxPercent = s.tokens.contextWindowPercent || 0;
      if (ctxPercent > 95) { tok.color = new vscode.ThemeColor('errorForeground'); }
      else if (ctxPercent > 80) { tok.color = new vscode.ThemeColor('warningForeground'); }
      else { tok.color = undefined; }
      const parts = [`Session: ${total.toLocaleString()} tokens`, `  In: ${s.tokens.sessionTokensIn.toLocaleString()}`, `  Out: ${s.tokens.sessionTokensOut.toLocaleString()}`];
      if (s.tokens.contextWindowUsed && s.tokens.contextWindowMax) {
        parts.push(`Context: ${this.formatTokens(s.tokens.contextWindowUsed)}/${this.formatTokens(s.tokens.contextWindowMax)} (${ctxPercent}%)`);
      }
      if (s.tokens.lastRequestTokensIn) parts.push(`Last: ${s.tokens.lastRequestTokensIn} in / ${s.tokens.lastRequestTokensOut || 0} out`);
      tok.tooltip = parts.join('\n');
      tok.show();
    } else { tok?.hide(); }

    // Agent
    const agent = this.items.get('ina-agent');
    if (agent) {
      if (s.agent.isActive) {
        agent.text = s.agent.status === 'planning' ? '$(robot~spin) Planning...' :
          s.agent.status === 'executing' ? `$(robot~spin) ${s.agent.currentStep || 'Executing'}` :
          s.agent.status === 'reviewing' ? '$(eye) Review' : '$(robot) Agent';
        agent.tooltip = `Agent: ${s.agent.status || 'active'}\n${s.agent.currentStep || ''}\nFiles: ${s.agent.filesChanged}`;
        agent.show();
      } else { agent.hide(); }
    }

    // Git
    const git = this.items.get('ina-git');
    if (git && cfg.get('showGitStatus', true)) {
      const branch = s.git.branch || '?';
      const parts: string[] = [branch];
      if (s.git.ahead > 0) parts.push(`↑${s.git.ahead}`);
      if (s.git.behind > 0) parts.push(`↓${s.git.behind}`);
      if (s.git.changesCount > 0) parts.push(`●${s.git.changesCount}`);
      git.text = `$(git-branch) ${parts.join(' ')}`;
      git.color = s.git.isClean ? undefined : new vscode.ThemeColor('warningForeground');
      git.tooltip = `Branch: ${branch}\nChanges: ${s.git.changesCount}\nAhead: ${s.git.ahead}, Behind: ${s.git.behind}`;
      git.show();
    } else { git?.hide(); }

    // Diagnostics
    const diag = this.items.get('ina-diagnostics');
    if (diag && cfg.get('showDiagnostics', true)) {
      if (s.diagnostics.errors > 0) {
        diag.text = `$(error) ${s.diagnostics.errors}`;
        diag.color = new vscode.ThemeColor('errorForeground');
        diag.tooltip = `Errors: ${s.diagnostics.errors} in ${s.diagnostics.filesWithErrors} files\nWarnings: ${s.diagnostics.warnings}`;
        diag.show();
      } else if (s.diagnostics.warnings > 0) {
        diag.text = `$(warning) ${s.diagnostics.warnings}`;
        diag.color = new vscode.ThemeColor('warningForeground');
        diag.tooltip = `Warnings: ${s.diagnostics.warnings}`;
        diag.show();
      } else { diag.hide(); }
    } else { diag?.hide(); }

    // Health
    const health = this.items.get('ina-health');
    if (health && cfg.get('showHealthIndicator', true)) {
      if (s.overall !== OverallHealth.HEALTHY && s.overall !== OverallHealth.UNKNOWN) {
        health.text = s.overall === OverallHealth.OFFLINE ? '$(heart) Offline' : s.overall === OverallHealth.UNHEALTHY ? '$(heart) !' : '$(heart)';
        health.color = s.overall === OverallHealth.DEGRADED ? new vscode.ThemeColor('warningForeground') : new vscode.ThemeColor('errorForeground');
        health.tooltip = `Health: ${s.overall}${s.circuitBreakers.trippedNames.length > 0 ? `\nCircuit breakers open: ${s.circuitBreakers.trippedNames.join(', ')}` : ''}`;
        health.show();
      } else { health.hide(); }
    } else { health?.hide(); }
  }

  private formatTokens(n: number): string {
    if (n < 1000) return String(n);
    if (n < 1000000) return `${Math.round(n / 1000)}K`;
    return `${(n / 1000000).toFixed(1)}M`;
  }

  dispose(): void {
    if (this.updateTimer) clearInterval(this.updateTimer);
    for (const item of this.items.values()) item.dispose();
    this.items.clear();
  }
}
