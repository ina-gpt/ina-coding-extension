import { EventEmitter } from 'events';
import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';
import { AuthService } from '../AuthService';
import { DocSource, DocSearchResult, DocSuggestion, DocCrawlProgress, BuiltinDocSource, DocsEvent } from './DocsTypes';
import { RequestScheduler } from '../requestopt/RequestScheduler';
import { RequestCategory, RequestPriority } from '../requestopt/RequestOptTypes';

export class DocsClient extends EventEmitter {
  private static instance: DocsClient;
  private authService: AuthService | null = null;

  static getInstance(): DocsClient {
    if (!DocsClient.instance) {
      DocsClient.instance = new DocsClient();
    }
    return DocsClient.instance;
  }

  setAuthService(auth: AuthService): void {
    this.authService = auth;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authService) {
      const authHeaders = await this.authService.getAuthHeaders();
      Object.assign(headers, authHeaders);
    }
    return headers;
  }

  private getBaseUrl(): string {
    return ConfigManager.getApiEndpoint();
  }

  async listSources(projectId?: string): Promise<DocSource[]> {
    try {
      const url = new URL(`${this.getBaseUrl()}/api/docs`);
      if (projectId) url.searchParams.set('projectId', projectId);

      const headers = await this.getHeaders();
      const response = await fetch(url.toString(), { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      return data.sources || [];
    } catch (error) {
      Logger.error('Failed to list doc sources:', error);
      return [];
    }
  }

  async addSource(source: { name: string; type: string; url?: string; localPath?: string; packageName?: string; projectId?: string }): Promise<DocSource | null> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.getBaseUrl()}/api/docs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(source),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this.emit('source-added', data.source);
      return data.source;
    } catch (error) {
      Logger.error('Failed to add doc source:', error);
      return null;
    }
  }

  async removeSource(sourceId: string): Promise<void> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.getBaseUrl()}/api/docs/${sourceId}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.emit('source-removed', sourceId);
    } catch (error) {
      Logger.error('Failed to remove doc source:', error);
    }
  }

  async updateSource(sourceId: string, updates: Partial<DocSource>): Promise<void> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.getBaseUrl()}/api/docs/${sourceId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      Logger.error('Failed to update doc source:', error);
    }
  }

  async getBuiltins(): Promise<BuiltinDocSource[]> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/docs/builtins`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.builtins || [];
    } catch (error) {
      Logger.error('Failed to get builtin docs:', error);
      return [];
    }
  }

  async *startCrawl(sourceId: string, config?: Record<string, unknown>): AsyncGenerator<DocCrawlProgress> {
    const headers = await this.getHeaders();
    this.emit('crawl-started', sourceId);

    const response = await fetch(`${this.getBaseUrl()}/api/docs/crawl`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sourceId, config }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as DocCrawlProgress;
              this.emit('crawl-progress', data);
              yield data;

              if (data.status === 'complete' || data.status === 'failed') {
                this.emit('crawl-complete', data);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async search(queryStr: string, sourceIds?: string[], limit?: number): Promise<DocSearchResult[]> {
    try {
      const scheduler = RequestScheduler.getInstance();
      const result = await scheduler.schedule<DocSearchResult[]>(
        RequestCategory.DOC_SEARCH,
        async (signal) => {
          const headers = await this.getHeaders();
          const response = await fetch(`${this.getBaseUrl()}/api/docs/search`, {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({ query: queryStr, sourceIds, limit: limit || 10 }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          return data.results || [];
        },
        { priority: RequestPriority.LOW }
      );
      return result.data || [];
    } catch (error) {
      Logger.error('Failed to search docs:', error);
      return [];
    }
  }

  async getSuggestions(context: { filePath: string; language: string; code: string; errors: string[]; imports: string[] }): Promise<DocSuggestion[]> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.getBaseUrl()}/api/docs/suggest`, {
        method: 'POST',
        headers,
        body: JSON.stringify(context),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      return data.suggestions || [];
    } catch (error) {
      Logger.error('Failed to get doc suggestions:', error);
      return [];
    }
  }

  formatResultsForChat(results: DocSearchResult[]): string {
    if (results.length === 0) return 'No documentation results found.';

    return results.map((r, i) => {
      const header = `**${i + 1}. ${r.source.name}** — ${r.chunk.section_title || r.page.title || 'Documentation'}`;
      const url = r.page.url ? `\n   [View docs](${r.page.url})` : '';
      const snippet = r.chunk.content.slice(0, 300);
      const score = `(${Math.round(r.score * 100)}% match)`;
      return `${header} ${score}${url}\n   ${snippet}${r.chunk.content.length > 300 ? '...' : ''}`;
    }).join('\n\n');
  }
}
