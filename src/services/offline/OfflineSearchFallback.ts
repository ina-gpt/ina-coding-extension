/**
 * Phase 10.3 — Offline Search Fallback
 * Provides basic keyword search when server is offline.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

export class OfflineSearchFallback {
  private static instance: OfflineSearchFallback;
  private isIndexLoaded = false;

  static getInstance(): OfflineSearchFallback {
    if (!OfflineSearchFallback.instance) {
      OfflineSearchFallback.instance = new OfflineSearchFallback();
    }
    return OfflineSearchFallback.instance;
  }

  private constructor() {}

  async initialize(): Promise<void> {
    this.isIndexLoaded = true;
    Logger.debug('[OfflineSearch] Fallback search initialized');
  }

  async search(query: string, maxResults = 10): Promise<{ filePath: string; preview: string; score: number }[]> {
    if (!query.trim()) return [];

    const keywords = this.tokenize(query.toLowerCase());
    if (keywords.length === 0) return [];

    const results: { filePath: string; preview: string; score: number }[] = [];

    try {
      // Use VS Code workspace search (local operation)
      for (const keyword of keywords.slice(0, 3)) {
        const pattern = new vscode.RelativePattern(
          vscode.workspace.workspaceFolders?.[0] || '',
          '**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,css,html}'
        );
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);

        for (const file of files.slice(0, 20)) {
          try {
            const doc = await vscode.workspace.openTextDocument(file);
            const content = doc.getText();
            const score = this.scoreMatch(content, keywords);
            if (score > 0) {
              const lines = content.split('\n');
              const matchLine = lines.findIndex(l => l.toLowerCase().includes(keyword));
              const preview = matchLine >= 0
                ? lines.slice(Math.max(0, matchLine - 1), matchLine + 3).join('\n')
                : lines.slice(0, 3).join('\n');

              const existing = results.find(r => r.filePath === file.fsPath);
              if (existing) {
                existing.score += score;
              } else {
                results.push({
                  filePath: vscode.workspace.asRelativePath(file),
                  preview: preview.slice(0, 200),
                  score,
                });
              }
            }
          } catch { /* skip unreadable files */ }
        }
      }
    } catch (e) {
      Logger.debug('[OfflineSearch] Search error:', e);
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  async searchSymbols(query: string): Promise<{ name: string; kind: string; filePath: string; line: number }[]> {
    try {
      // VS Code workspace symbol search — fully local via LSP
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query
      );
      return (symbols || []).slice(0, 20).map(s => ({
        name: s.name,
        kind: vscode.SymbolKind[s.kind],
        filePath: vscode.workspace.asRelativePath(s.location.uri),
        line: s.location.range.start.line + 1,
      }));
    } catch {
      return [];
    }
  }

  async searchFiles(pattern: string): Promise<string[]> {
    try {
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 50);
      return files.map(f => vscode.workspace.asRelativePath(f));
    } catch {
      return [];
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\-_.,;:!?()[\]{}'"<>\/\\|@#$%^&*+=~`]+/)
      .filter(w => w.length >= 2);
  }

  private scoreMatch(content: string, keywords: string[]): number {
    const lower = content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx >= 0) score += 1;
      // Bonus for exact word boundary matches
      const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) score += matches.length * 0.5;
    }
    return score;
  }

  dispose(): void {}
}
