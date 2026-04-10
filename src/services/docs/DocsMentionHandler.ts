import { DocsClient } from './DocsClient';
import { DocSearchResult } from './DocsTypes';
import { Logger } from '../../utils/Logger';

export interface MentionSuggestion {
  type: string;
  value: string;
  displayName: string;
  description?: string;
  icon: string;
  insertText: string;
  sortOrder: number;
}

export class DocsMentionHandler {
  private static instance: DocsMentionHandler;
  private docsClient: DocsClient;
  private recentSearches: string[] = [];

  static getInstance(): DocsMentionHandler {
    if (!DocsMentionHandler.instance) {
      DocsMentionHandler.instance = new DocsMentionHandler();
    }
    return DocsMentionHandler.instance;
  }

  private constructor() {
    this.docsClient = DocsClient.getInstance();
  }

  async resolveMention(mention: { type: string; value: string }): Promise<string> {
    if (mention.type !== 'docs') return '';

    const { source, query } = this.parseDocsQuery(mention.value);

    try {
      let results: DocSearchResult[];

      if (source && query) {
        const sources = await this.docsClient.listSources();
        const matchedSource = sources.find(s =>
          s.name.toLowerCase() === source.toLowerCase() ||
          s.package_name?.toLowerCase() === source.toLowerCase()
        );
        const sourceIds = matchedSource ? [matchedSource.id] : undefined;
        results = await this.docsClient.search(query, sourceIds, 5);
      } else if (source) {
        results = await this.docsClient.search(source, undefined, 5);
      } else {
        results = await this.docsClient.search(mention.value, undefined, 5);
      }

      if (query || source) {
        const searchTerm = query || source || mention.value;
        this.recentSearches = [searchTerm, ...this.recentSearches.filter(s => s !== searchTerm)].slice(0, 10);
      }

      return this.formatDocsForPrompt(results);
    } catch (error) {
      Logger.error('Failed to resolve @docs mention:', error);
      return `[Documentation search failed for "${mention.value}"]`;
    }
  }

  async getSuggestions(partial: string): Promise<MentionSuggestion[]> {
    const suggestions: MentionSuggestion[] = [];

    try {
      const sources = await this.docsClient.listSources();
      const readySources = sources.filter(s => s.status === 'ready');

      for (const source of readySources) {
        const name = source.name.toLowerCase();
        if (!partial || name.includes(partial.toLowerCase())) {
          suggestions.push({
            type: 'docs',
            value: `docs:${source.package_name || source.name.toLowerCase()}`,
            displayName: source.name,
            description: `${source.doc_count} pages, ${source.chunk_count} chunks`,
            icon: '$(book)',
            insertText: `@docs:${source.package_name || source.name.toLowerCase()}`,
            sortOrder: 10,
          });
        }
      }

      for (const recent of this.recentSearches) {
        if (!partial || recent.toLowerCase().includes(partial.toLowerCase())) {
          suggestions.push({
            type: 'docs',
            value: `docs:${recent}`,
            displayName: `Search: ${recent}`,
            description: 'Recent search',
            icon: '$(search)',
            insertText: `@docs:${recent}`,
            sortOrder: 20,
          });
        }
      }
    } catch (error) {
      Logger.warn('Failed to get docs suggestions:', error);
    }

    return suggestions.slice(0, 15);
  }

  formatDocsForPrompt(results: DocSearchResult[]): string {
    if (results.length === 0) return '<documentation>No relevant documentation found.</documentation>';

    let output = '<documentation>\n';
    for (const result of results) {
      const url = result.page.url || '';
      const section = result.chunk.section_title || '';
      output += `  <doc source="${result.source.name}" url="${url}" section="${section}">\n`;
      output += `    ${result.chunk.content}\n`;
      if (result.chunk.code_snippets && result.chunk.code_snippets.length > 0) {
        for (const code of result.chunk.code_snippets) {
          output += `    <code>${code}</code>\n`;
        }
      }
      output += `  </doc>\n`;
    }
    output += '</documentation>';
    return output;
  }

  private parseDocsQuery(value: string): { source: string | null; query: string } {
    if (value.includes('/')) {
      const [source, ...rest] = value.split('/');
      return { source, query: rest.join('/') };
    }

    const knownSources = ['react', 'next', 'nextjs', 'typescript', 'node', 'nodejs', 'vue', 'express', 'prisma', 'zod', 'jest', 'tailwind', 'docker', 'go', 'rust', 'python', 'postgresql'];
    const firstWord = value.split(/\s+/)[0].toLowerCase();

    if (knownSources.includes(firstWord)) {
      return { source: firstWord, query: value.slice(firstWord.length).trim() };
    }

    return { source: null, query: value };
  }
}
