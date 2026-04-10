/**
 * Index Manager Client Service
 *
 * Client for index management operations from the extension.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface IndexStats {
  projectId: string;
  totalFiles: number;
  totalChunks: number;
  totalTokens: number;
  embeddedChunks: number;
  pendingChunks: number;
  failedChunks: number;
  indexSize: string;
  lastIndexed: Date | null;
  lastFullScan: Date | null;
  languages: Array<{ language: string; files: number; chunks: number; percentage: number }>;
  chunkTypes: Array<{ type: string; count: number; percentage: number }>;
  topFiles: Array<{ path: string; chunks: number; tokens: number; lastIndexed: Date }>;
  health: IndexHealth;
}

export interface QuickStats {
  files: number;
  chunks: number;
  status: 'indexed' | 'indexing' | 'outdated' | 'empty';
  progress?: number;
}

export interface IndexHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'empty';
  issues: string[];
  recommendations: string[];
  score: number;
}

export interface IndexOperation {
  id: string;
  type: 'reindex' | 'clear' | 'optimize' | 'repair';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ExcludePattern {
  id: string;
  pattern: string;
  type: 'glob' | 'regex' | 'path';
  source: 'user' | 'gitignore' | 'default';
  active: boolean;
  createdAt: Date;
  matchCount?: number;
}

// ============ Index Manager Client ============

export class IndexManagerClient implements vscode.Disposable {
  private apiEndpoint: string;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastQuickStats: QuickStats | null = null;

  private onStatsUpdateEmitter = new vscode.EventEmitter<QuickStats>();
  private onOperationCompleteEmitter = new vscode.EventEmitter<IndexOperation>();

  readonly onStatsUpdate = this.onStatsUpdateEmitter.event;
  readonly onOperationComplete = this.onOperationCompleteEmitter.event;

  constructor(apiEndpoint?: string) {
    this.apiEndpoint = apiEndpoint || this.getConfiguredEndpoint();
  }

  /** Read endpoint from VS Code settings, fallback to localhost */
  private getConfiguredEndpoint(): string {
    try {
      const endpoint = vscode.workspace.getConfiguration('inaCoding').get<string>('api.endpoint');
      return endpoint ? `${endpoint}/api` : 'http://localhost:3200/api';
    } catch {
      return 'http://localhost:3200/api';
    }
  }

  // ============ Statistics ============

  async getStats(): Promise<IndexStats> {
    const projectId = this.getProjectId();
    const response = await fetch(`${this.apiEndpoint}/index/stats?projectId=${projectId}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Failed to get stats: ${response.status}`);
    const stats = await response.json();
    if (stats.lastIndexed) stats.lastIndexed = new Date(stats.lastIndexed);
    if (stats.lastFullScan) stats.lastFullScan = new Date(stats.lastFullScan);
    return stats;
  }

  async getQuickStats(): Promise<QuickStats> {
    const projectId = this.getProjectId();
    try {
      const response = await fetch(`${this.apiEndpoint}/index/stats?projectId=${projectId}&quick=true`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const stats = await response.json();
      this.lastQuickStats = stats;
      this.onStatsUpdateEmitter.fire(stats);
      return stats;
    } catch (error) {
      Logger.warn('Failed to get quick stats:', error);
      return this.lastQuickStats || { files: 0, chunks: 0, status: 'empty' };
    }
  }

  startPolling(intervalMs: number = 5000): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => { this.getQuickStats(); }, intervalMs);
    this.getQuickStats();
  }

  stopPolling(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }

  // ============ Operations ============

  async clearIndex(): Promise<IndexOperation> {
    const response = await fetch(`${this.apiEndpoint}/index/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: this.getProjectId(), operation: 'clear' }),
    });
    if (!response.ok) throw new Error(`Failed to clear index: ${response.status}`);
    return (await response.json()).operation;
  }

  async reindex(options: { clearFirst?: boolean; force?: boolean } = {}): Promise<IndexOperation> {
    const response = await fetch(`${this.apiEndpoint}/index/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: this.getProjectId(), operation: 'reindex', options }),
    });
    if (!response.ok) throw new Error(`Failed to trigger reindex: ${response.status}`);
    return (await response.json()).operation;
  }

  async optimizeIndex(): Promise<IndexOperation> {
    const response = await fetch(`${this.apiEndpoint}/index/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: this.getProjectId(), operation: 'optimize' }),
    });
    if (!response.ok) throw new Error(`Failed to optimize: ${response.status}`);
    return (await response.json()).operation;
  }

  // ============ Exclude Patterns ============

  async getExcludePatterns(): Promise<ExcludePattern[]> {
    const response = await fetch(`${this.apiEndpoint}/index/patterns?projectId=${this.getProjectId()}`);
    if (!response.ok) throw new Error(`Failed to get patterns: ${response.status}`);
    return (await response.json()).patterns;
  }

  async addExcludePattern(pattern: string, type: 'glob' | 'regex' | 'path' = 'glob'): Promise<ExcludePattern> {
    const response = await fetch(`${this.apiEndpoint}/index/patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: this.getProjectId(), pattern, type }),
    });
    if (!response.ok) throw new Error(`Failed to add pattern: ${response.status}`);
    return (await response.json()).pattern;
  }

  async removeExcludePattern(patternId: string): Promise<boolean> {
    const response = await fetch(`${this.apiEndpoint}/index/patterns?patternId=${patternId}`, { method: 'DELETE' });
    return response.ok;
  }

  async toggleExcludePattern(patternId: string, active: boolean): Promise<boolean> {
    const response = await fetch(`${this.apiEndpoint}/index/patterns`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternId, active }),
    });
    return response.ok;
  }

  // ============ .ina-ignore ============

  async openInaIgnore(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return;
    const ignoreUri = vscode.Uri.joinPath(folders[0].uri, '.ina-ignore');

    try {
      await vscode.workspace.fs.stat(ignoreUri);
    } catch {
      const template = `# INA Coding - Exclude Patterns\n# Syntax: glob patterns (similar to .gitignore)\n\nnode_modules/\n.git/\ndist/\nbuild/\n.next/\ncoverage/\n*.min.js\n*.map\npackage-lock.json\nyarn.lock\n`;
      await vscode.workspace.fs.writeFile(ignoreUri, Buffer.from(template));
    }

    const doc = await vscode.workspace.openTextDocument(ignoreUri);
    await vscode.window.showTextDocument(doc);
  }

  // ============ Utilities ============

  private getProjectId(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) return folders[0].name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return 'default';
  }

  dispose(): void {
    this.stopPolling();
    this.onStatsUpdateEmitter.dispose();
    this.onOperationCompleteEmitter.dispose();
  }
}

// ============ Singleton Export ============

export const indexManagerClient = new IndexManagerClient();
