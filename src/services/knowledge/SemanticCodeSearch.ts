/**
 * SemanticCodeSearch.ts — Phase 19 Step 19.4
 * Multi-pass code search: fuzzy name → content → semantic
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CodeEntity, SearchResult, KnowledgeGraph } from './KnowledgeTypes';
import { Logger } from '../../utils/Logger';

export class SemanticCodeSearch {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  search(query: string, graph: KnowledgeGraph, maxResults: number = 20): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    const entities = Array.from(graph.entities.values()).filter(e => e.type !== 'file');

    // Pass 1: Exact name match
    for (const entity of entities) {
      if (entity.name.toLowerCase() === queryLower) {
        results.push({ entity, relevanceScore: 100, matchType: 'name', context: entity.signature });
      }
    }

    // Pass 2: Fuzzy name match
    for (const entity of entities) {
      if (results.some(r => r.entity.id === entity.id)) continue;
      const score = this.fuzzyMatch(queryLower, entity.name.toLowerCase());
      if (score > 0.5) {
        results.push({ entity, relevanceScore: Math.round(score * 80), matchType: 'name', context: entity.signature });
      }
    }

    // Pass 3: Docstring match
    for (const entity of entities) {
      if (results.some(r => r.entity.id === entity.id)) continue;
      if (entity.docstring && entity.docstring.toLowerCase().includes(queryLower)) {
        results.push({ entity, relevanceScore: 60, matchType: 'docstring', context: entity.docstring });
      }
    }

    // Pass 4: Content search (grep-like)
    if (results.length < maxResults) {
      const contentResults = this.searchContent(query, entities, maxResults - results.length);
      for (const cr of contentResults) {
        if (!results.some(r => r.entity.id === cr.entity.id)) {
          results.push(cr);
        }
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, maxResults);
  }

  private fuzzyMatch(query: string, target: string): number {
    if (target.includes(query)) return 0.9;
    if (query.includes(target)) return 0.7;

    // Simple Levenshtein-based similarity
    const maxLen = Math.max(query.length, target.length);
    if (maxLen === 0) return 1;
    const dist = this.levenshtein(query, target);
    return 1 - dist / maxLen;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }

    return dp[m][n];
  }

  private searchContent(query: string, entities: CodeEntity[], limit: number): SearchResult[] {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();
    const checkedFiles = new Set<string>();

    for (const entity of entities) {
      if (results.length >= limit) break;
      if (checkedFiles.has(entity.filePath)) continue;
      checkedFiles.add(entity.filePath);

      try {
        const absPath = path.join(this.workspaceRoot, entity.filePath);
        const content = fs.readFileSync(absPath, 'utf-8');
        if (content.toLowerCase().includes(queryLower)) {
          // Find the entity containing the match
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(queryLower)) {
              const matchEntity = entities.find(e =>
                e.filePath === entity.filePath && e.startLine <= i + 1 && e.endLine >= i + 1
              ) || entity;
              if (!results.some(r => r.entity.id === matchEntity.id)) {
                results.push({
                  entity: matchEntity,
                  relevanceScore: 40,
                  matchType: 'content',
                  context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
                });
              }
              break;
            }
          }
        }
      } catch { /* */ }
    }

    return results;
  }
}
