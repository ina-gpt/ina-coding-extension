/**
 * Search Client Service
 *
 * Client for semantic code search from the extension.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface SearchQuery {
  query: string;
  projectId?: string;
  strategy?: 'vector' | 'keyword' | 'hybrid';
  filters?: SearchFilters;
  limit?: number;
  minScore?: number;
  rerank?: boolean;
  packContext?: boolean;
  conversationHistory?: string[];
}

export interface SearchFilters {
  files?: string[];
  filePatterns?: string[];
  languages?: string[];
  chunkTypes?: string[];
  directories?: string[];
}

export interface SearchResultItem {
  id: string;
  score: number;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  preview?: string;
  name?: string;
  type: string;
  language: string;
  signature?: string;
  documentation?: string;
  citation: CitationRef;
}

export interface CitationRef {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  snippet: string;
  language: string;
}

export interface PackedContext {
  content: string;
  tokens: number;
  citations: CitationRef[];
  truncated: boolean;
  includedResults: number;
  totalResults: number;
}

export interface SearchResponse {
  results: SearchResultItem[];
  totalFound: number;
  timing: {
    total: number;
    embedding: number;
    vectorSearch: number;
    reranking?: number;
    packing?: number;
  };
  packedContext?: PackedContext;
}

export interface SearchClientConfig {
  apiEndpoint: string;
  timeout: number;
  defaultLimit: number;
  defaultMinScore: number;
}

// ============ Search Client ============

export class SearchClient implements vscode.Disposable {
  private config: SearchClientConfig;
  private searchHistory: Array<{ query: string; timestamp: number }> = [];
  private cache: Map<string, { response: SearchResponse; timestamp: number }> = new Map();
  private cacheMaxAge = 30000;  // 30 seconds

  // Events
  private onSearchStartEmitter = new vscode.EventEmitter<string>();
  private onSearchCompleteEmitter = new vscode.EventEmitter<SearchResponse>();
  private onSearchErrorEmitter = new vscode.EventEmitter<Error>();

  readonly onSearchStart = this.onSearchStartEmitter.event;
  readonly onSearchComplete = this.onSearchCompleteEmitter.event;
  readonly onSearchError = this.onSearchErrorEmitter.event;

  constructor(config: Partial<SearchClientConfig> = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || this.getConfiguredEndpoint(),
      timeout: config.timeout || 30000,
      defaultLimit: config.defaultLimit || 20,
      defaultMinScore: config.defaultMinScore || 0.5,
    };
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

  // ============ Main Search ============

  async search(query: SearchQuery): Promise<SearchResponse> {
    this.onSearchStartEmitter.fire(query.query);

    const cacheKey = this.getCacheKey(query);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.onSearchCompleteEmitter.fire(cached);
      return cached;
    }

    try {
      const response = await fetch(`${this.config.apiEndpoint}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.query,
          projectId: query.projectId || this.getProjectId(),
          strategy: query.strategy || 'hybrid',
          filters: query.filters,
          limit: query.limit || this.config.defaultLimit,
          minScore: query.minScore || this.config.defaultMinScore,
          rerank: query.rerank !== false,
          packContext: query.packContext,
          includeContent: true,
          includeContext: true,
          deduplicateOverlap: true,
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data: SearchResponse = await response.json();

      this.setCache(cacheKey, data);
      this.addToHistory(query.query);

      this.onSearchCompleteEmitter.fire(data);
      return data;

    } catch (error) {
      const err = error instanceof Error ? error : new Error('Search failed');
      this.onSearchErrorEmitter.fire(err);
      throw err;
    }
  }

  // ============ Specialized Search ============

  async searchSymbol(
    name: string,
    type?: 'function' | 'class' | 'interface' | 'type'
  ): Promise<SearchResultItem[]> {
    try {
      const params = new URLSearchParams({
        name,
        projectId: this.getProjectId(),
      });
      if (type) params.append('type', type);

      const response = await fetch(
        `${this.config.apiEndpoint}/search/symbol?${params}`,
        { signal: AbortSignal.timeout(this.config.timeout) }
      );

      if (!response.ok) {
        throw new Error(`Symbol search failed: ${response.status}`);
      }

      const data = await response.json();
      return data.results;

    } catch (error) {
      Logger.error('Symbol search failed:', error);
      throw error;
    }
  }

  async findSimilar(content: string): Promise<SearchResultItem[]> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/search/similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          projectId: this.getProjectId(),
          limit: 10,
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Similar search failed: ${response.status}`);
      }

      const data = await response.json();
      return data.results;

    } catch (error) {
      Logger.error('Similar search failed:', error);
      throw error;
    }
  }

  async searchForChat(
    query: string,
    conversationHistory: string[]
  ): Promise<{ results: SearchResultItem[]; context: PackedContext }> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/search/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          conversationHistory,
          projectId: this.getProjectId(),
          maxTokens: 8000,
          format: 'xml',
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        throw new Error(`Context search failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        results: data.results,
        context: data.packedContext,
      };

    } catch (error) {
      Logger.error('Context search failed:', error);
      throw error;
    }
  }

  async quickSearch(query: string, limit: number = 10): Promise<SearchResultItem[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        projectId: this.getProjectId(),
        limit: limit.toString(),
      });

      const response = await fetch(
        `${this.config.apiEndpoint}/search?${params}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        throw new Error(`Quick search failed: ${response.status}`);
      }

      const data = await response.json();
      return data.results;

    } catch (error) {
      Logger.error('Quick search failed:', error);
      return [];
    }
  }

  // ============ Navigation ============

  async openResult(result: SearchResultItem): Promise<void> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const basePath = workspaceFolders?.[0]?.uri.fsPath || '';
      const fullPath = result.file.startsWith('/') ? result.file : `${basePath}/${result.file}`;

      const uri = vscode.Uri.file(fullPath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      const startLine = Math.max(0, result.startLine - 1);
      const endLine = Math.min(document.lineCount - 1, result.endLine - 1);

      const range = new vscode.Range(
        startLine, 0,
        endLine, document.lineAt(endLine).text.length
      );

      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      const decoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        isWholeLine: true,
      });

      editor.setDecorations(decoration, [range]);

      setTimeout(() => {
        decoration.dispose();
      }, 2000);

    } catch (error) {
      Logger.error('Failed to open result:', error);
      vscode.window.showErrorMessage(`Failed to open ${result.file}`);
    }
  }

  async insertCitation(citation: CitationRef): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const citationText = `// See: ${citation.file}:${citation.startLine}-${citation.endLine}`;

    await editor.edit(editBuilder => {
      editBuilder.insert(editor.selection.active, citationText);
    });
  }

  // ============ Utilities ============

  private getProjectId(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      return folders[0].name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }
    return 'default';
  }

  private getCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      query: query.query,
      projectId: query.projectId,
      strategy: query.strategy,
      filters: query.filters,
      limit: query.limit,
    });
  }

  private getFromCache(key: string): SearchResponse | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheMaxAge) {
      return cached.response;
    }
    return null;
  }

  private setCache(key: string, response: SearchResponse): void {
    if (this.cache.size > 50) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }

    this.cache.set(key, { response, timestamp: Date.now() });
  }

  private addToHistory(query: string): void {
    this.searchHistory.push({ query, timestamp: Date.now() });

    if (this.searchHistory.length > 100) {
      this.searchHistory = this.searchHistory.slice(-100);
    }
  }

  getSearchHistory(): string[] {
    return this.searchHistory.map(h => h.query);
  }

  clearCache(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.onSearchStartEmitter.dispose();
    this.onSearchCompleteEmitter.dispose();
    this.onSearchErrorEmitter.dispose();
    this.cache.clear();
  }
}

// ============ Singleton Export ============

export const searchClient = new SearchClient();
