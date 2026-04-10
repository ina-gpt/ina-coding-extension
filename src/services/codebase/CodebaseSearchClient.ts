/**
 * Phase 15.4 — Codebase Search Client
 * Performs RAG search against the codebase index via API,
 * with offline fallback and token-aware context formatting.
 */

import { ConfigManager } from '../../utils/ConfigManager';
import { Logger } from '../../utils/Logger';
import { AuthService } from '../AuthService';
import { OfflineSearchFallback } from '../offline/OfflineSearchFallback';
import { tokenCounter } from '../TokenCounter';
import {
  CodebaseSearchResult,
  CodebaseChunk,
  CodebaseFilter,
  CodebaseContext,
  CODEBASE_CONSTANTS,
} from './CodebaseTypes';

export class CodebaseSearchClient {
  private static instance: CodebaseSearchClient;
  private authService: AuthService | null = null;

  static getInstance(): CodebaseSearchClient {
    if (!CodebaseSearchClient.instance) {
      CodebaseSearchClient.instance = new CodebaseSearchClient();
    }
    return CodebaseSearchClient.instance;
  }

  private constructor() {}

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

  // ============ Core Search ============

  async search(
    query: string,
    options?: { topK?: number; filters?: CodebaseFilter }
  ): Promise<CodebaseSearchResult> {
    const startTime = Date.now();
    const topK = options?.topK ?? CODEBASE_CONSTANTS.DEFAULT_TOP_K;
    const filters = options?.filters ?? null;

    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${this.getBaseUrl()}/api/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          topK: Math.min(topK, CODEBASE_CONSTANTS.MAX_TOP_K),
          filters,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        chunks?: CodebaseChunk[];
        totalMatches?: number;
      };
      const searchTimeMs = Date.now() - startTime;

      return {
        chunks: data.chunks || [],
        totalMatches: data.totalMatches ?? (data.chunks?.length || 0),
        searchTimeMs,
        query,
        filters,
      };
    } catch (error) {
      Logger.warn('[CodebaseSearch] API search failed, falling back to offline:', error);
      return this.offlineFallback(query, topK, filters, startTime);
    }
  }

  private async offlineFallback(
    query: string,
    topK: number,
    filters: CodebaseFilter | null,
    startTime: number
  ): Promise<CodebaseSearchResult> {
    try {
      const fallback = OfflineSearchFallback.getInstance();
      const results = await fallback.search(query, topK);

      const chunks: CodebaseChunk[] = results.map((r) => ({
        filePath: r.filePath,
        content: r.preview,
        startLine: 0,
        endLine: 0,
        language: this.detectLanguage(r.filePath),
        relevanceScore: r.score,
        matchType: 'keyword' as const,
        symbols: [],
      }));

      return {
        chunks,
        totalMatches: chunks.length,
        searchTimeMs: Date.now() - startTime,
        query,
        filters,
      };
    } catch (fallbackError) {
      Logger.error('[CodebaseSearch] Offline fallback also failed:', fallbackError);
      return {
        chunks: [],
        totalMatches: 0,
        searchTimeMs: Date.now() - startTime,
        query,
        filters,
      };
    }
  }

  // ============ Context-Aware Search ============

  async searchForContext(
    query: string,
    maxTokens: number = CODEBASE_CONSTANTS.MAX_TOKENS,
    filters?: CodebaseFilter
  ): Promise<CodebaseContext> {
    let topK = CODEBASE_CONSTANTS.DEFAULT_TOP_K;
    let result = await this.search(query, { topK, filters });

    // If we got fewer chunks than requested and haven't hit the max,
    // try fetching more to fill the token budget
    while (
      result.chunks.length >= topK &&
      topK < CODEBASE_CONSTANTS.MAX_TOP_K
    ) {
      const currentTokens = this.estimateChunksTokens(result.chunks);
      if (currentTokens >= maxTokens) {
        break;
      }
      topK = Math.min(topK + 5, CODEBASE_CONSTANTS.MAX_TOP_K);
      result = await this.search(query, { topK, filters });
    }

    return this.formatAsContext(result.chunks, maxTokens);
  }

  private formatAsContext(
    chunks: CodebaseChunk[],
    maxTokens: number
  ): CodebaseContext {
    const selected: CodebaseChunk[] = [];
    let totalTokens = 0;
    let truncated = false;

    // Sort by relevance descending
    const sorted = [...chunks].sort((a, b) => b.relevanceScore - a.relevanceScore);

    for (const chunk of sorted) {
      const chunkTokens = tokenCounter.quickEstimate(chunk.content);
      if (totalTokens + chunkTokens > maxTokens) {
        truncated = true;
        break;
      }
      selected.push(chunk);
      totalTokens += chunkTokens;
    }

    const formatted = this.formatXml(selected);
    const formattedTokens = tokenCounter.quickEstimate(formatted);

    return {
      formatted,
      tokenCount: formattedTokens,
      chunks: selected,
      truncated,
    };
  }

  private formatXml(chunks: CodebaseChunk[]): string {
    if (chunks.length === 0) {
      return '<codebase>No relevant code found.</codebase>';
    }

    let xml = '<codebase>\n';
    for (const chunk of chunks) {
      const lineRange = chunk.startLine > 0
        ? ` lines="${chunk.startLine}-${chunk.endLine}"`
        : '';
      const symbols = chunk.symbols.length > 0
        ? ` symbols="${chunk.symbols.join(', ')}"`
        : '';
      xml += `  <chunk file="${chunk.filePath}" lang="${chunk.language}"${lineRange}${symbols} score="${chunk.relevanceScore.toFixed(2)}">\n`;
      xml += `    ${chunk.content}\n`;
      xml += `  </chunk>\n`;
    }
    xml += '</codebase>';
    return xml;
  }

  // ============ Filter Parsing ============

  parseCodebaseFilter(mention: string): CodebaseFilter {
    const filter: CodebaseFilter = {
      directory: null,
      pattern: null,
      language: null,
      recentOnly: false,
    };

    if (!mention) {
      return filter;
    }

    const parts = mention.split(/\s+/).filter(Boolean);

    for (const part of parts) {
      if (part === 'recent') {
        filter.recentOnly = true;
      } else if (part.includes('*') || part.startsWith('*.')) {
        filter.pattern = part;
        // Also infer language from pattern like *.ts
        const extMatch = part.match(/^\*\.(\w+)$/);
        if (extMatch) {
          filter.language = this.extToLanguage(extMatch[1]);
        }
      } else if (part.endsWith('/') || part.includes('/')) {
        filter.directory = part;
      } else {
        // Treat as language or directory
        const lang = this.extToLanguage(part);
        if (lang) {
          filter.language = lang;
        } else {
          filter.directory = part;
        }
      }
    }

    return filter;
  }

  // ============ Helpers ============

  private estimateChunksTokens(chunks: CodebaseChunk[]): number {
    return chunks.reduce(
      (sum, c) => sum + tokenCounter.quickEstimate(c.content),
      0
    );
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    return this.extToLanguage(ext) || ext;
  }

  private extToLanguage(ext: string): string | null {
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', go: 'go', rs: 'rust', java: 'java',
      c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
      css: 'css', html: 'html', json: 'json', md: 'markdown',
      rb: 'ruby', swift: 'swift', kt: 'kotlin', cs: 'csharp',
    };
    return map[ext] ?? null;
  }
}
