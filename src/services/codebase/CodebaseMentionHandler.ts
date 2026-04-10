/**
 * Phase 15.4 — Codebase Mention Handler
 * Handles @codebase mentions: search, caching, and autocomplete.
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';
import { CodebaseSearchClient } from './CodebaseSearchClient';
import { CodebaseContext, CODEBASE_CONSTANTS } from './CodebaseTypes';

interface CachedResult {
  context: CodebaseContext;
  timestamp: number;
}

export interface MentionSuggestion {
  type: string;
  value: string;
  displayName: string;
  description?: string;
  icon: string;
  insertText: string;
  sortOrder: number;
}

export class CodebaseMentionHandler {
  private static instance: CodebaseMentionHandler;
  private searchClient: CodebaseSearchClient;
  private cache: Map<string, CachedResult> = new Map();

  static getInstance(): CodebaseMentionHandler {
    if (!CodebaseMentionHandler.instance) {
      CodebaseMentionHandler.instance = new CodebaseMentionHandler();
    }
    return CodebaseMentionHandler.instance;
  }

  private constructor() {
    this.searchClient = CodebaseSearchClient.getInstance();
  }

  // ============ Mention Handling ============

  async handleMention(
    mention: string,
    userMessage: string
  ): Promise<string> {
    const cacheKey = `${mention}::${userMessage}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CODEBASE_CONSTANTS.CACHE_TTL_MS) {
      Logger.debug('[CodebaseMention] Returning cached result');
      return cached.context.formatted;
    }

    try {
      // Parse filter from the mention value (e.g., "src/", "*.test.ts", "recent")
      const filter = this.searchClient.parseCodebaseFilter(mention);

      // Extract the actual search query from the user message
      const query = this.extractSearchQuery(mention, userMessage);

      Logger.debug(`[CodebaseMention] Searching: query="${query}", filter=${JSON.stringify(filter)}`);

      const context = await this.searchClient.searchForContext(
        query,
        CODEBASE_CONSTANTS.MAX_TOKENS,
        filter
      );

      // Cache the result
      this.cache.set(cacheKey, { context, timestamp: Date.now() });
      this.pruneCache();

      Logger.info(
        `[CodebaseMention] Found ${context.chunks.length} chunks, ` +
        `${context.tokenCount} tokens, truncated=${context.truncated}`
      );

      return context.formatted;
    } catch (error) {
      Logger.error('[CodebaseMention] Failed to handle mention:', error);
      return '<codebase>Search failed. Please try again.</codebase>';
    }
  }

  private extractSearchQuery(mention: string, userMessage: string): string {
    // Remove @codebase and any filter parts from the user message to get the real query
    let query = userMessage
      .replace(/@codebase(?::[\w.*\/\s]+)?/gi, '')
      .trim();

    // If the query is empty after stripping, use the mention value itself
    if (!query) {
      query = mention.replace(/^codebase:?/, '').trim() || userMessage;
    }

    return query;
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > CODEBASE_CONSTANTS.CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }

  // ============ Autocomplete ============

  async getCompletions(partial: string): Promise<MentionSuggestion[]> {
    const suggestions: MentionSuggestion[] = [];

    // Base @codebase suggestion
    if (!partial || 'codebase'.startsWith(partial.toLowerCase())) {
      suggestions.push({
        type: 'codebase',
        value: 'codebase',
        displayName: 'Codebase',
        description: 'Search across the entire codebase',
        icon: '$(search)',
        insertText: '@codebase',
        sortOrder: 0,
      });
    }

    // Filter suggestions
    const filterSuggestions: Array<{ suffix: string; label: string; desc: string }> = [
      { suffix: 'recent', label: 'Recent files', desc: 'Search recently modified files only' },
      { suffix: '*.ts', label: 'TypeScript files', desc: 'Search .ts files only' },
      { suffix: '*.py', label: 'Python files', desc: 'Search .py files only' },
      { suffix: '*.go', label: 'Go files', desc: 'Search .go files only' },
      { suffix: '*.rs', label: 'Rust files', desc: 'Search .rs files only' },
    ];

    for (const fs of filterSuggestions) {
      const full = `codebase:${fs.suffix}`;
      if (partial && full.toLowerCase().includes(partial.toLowerCase())) {
        suggestions.push({
          type: 'codebase',
          value: full,
          displayName: `Codebase: ${fs.label}`,
          description: fs.desc,
          icon: '$(filter)',
          insertText: `@${full}`,
          sortOrder: 5,
        });
      }
    }

    // Dynamic workspace directory listing
    try {
      const dirs = await this.getWorkspaceDirectories(partial);
      for (const dir of dirs) {
        const full = `codebase:${dir}`;
        suggestions.push({
          type: 'codebase',
          value: full,
          displayName: `Codebase: ${dir}`,
          description: `Search in ${dir}`,
          icon: '$(folder)',
          insertText: `@${full}`,
          sortOrder: 10,
        });
      }
    } catch (error) {
      Logger.debug('[CodebaseMention] Failed to list workspace directories:', error);
    }

    return suggestions.slice(0, 15);
  }

  private async getWorkspaceDirectories(partial: string): Promise<string[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    // Strip codebase: prefix to get directory filter
    const dirFilter = partial.replace(/^codebase:?/, '').trim();

    // Use findFiles to discover top-level directories
    const pattern = dirFilter
      ? new vscode.RelativePattern(workspaceFolder, `${dirFilter}*/**`)
      : new vscode.RelativePattern(workspaceFolder, '*/**');

    const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);

    // Extract unique top-level directories
    const dirs = new Set<string>();
    for (const file of files) {
      const rel = vscode.workspace.asRelativePath(file, false);
      const topDir = rel.split('/')[0];
      if (topDir && !topDir.startsWith('.')) {
        dirs.add(`${topDir}/`);
      }
    }

    return Array.from(dirs).sort();
  }
}
