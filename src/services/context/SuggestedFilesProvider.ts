/**
 * Phase 28 — Suggested Files Provider
 *
 * Automatically suggests relevant files when the user types in chat
 * without requiring @ mentions. Strategies:
 *   1. Imports of the current file (highest relevance)
 *   2. Recently changed files (git diff)
 *   3. Currently open editors
 *   4. Keyword match from user query
 *   5. Test file for current file
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface SuggestedFile {
  relativePath: string;
  reason: 'import' | 'recent' | 'open' | 'related' | 'test';
  score: number;
}

export class SuggestedFilesProvider {
  private cache = new Map<string, SuggestedFile[]>();
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 10_000;

  async getSuggestedFiles(currentFilePath: string | undefined, userQuery: string): Promise<SuggestedFile[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) return [];
    const root = folders[0].uri.fsPath;

    const cacheKey = `${currentFilePath || ''}:${userQuery.substring(0, 50)}`;
    if (this.cache.has(cacheKey) && Date.now() < this.cacheExpiry) {
      return this.cache.get(cacheKey)!;
    }

    const suggestions: SuggestedFile[] = [];
    const seen = new Set<string>();
    const currentRel = currentFilePath ? path.relative(root, currentFilePath) : '';

    const maxFiles = vscode.workspace.getConfiguration('inaCoding.context').get<number>('suggestedFilesMax', 5);

    // 1. Imports of current file
    if (currentFilePath) {
      for (const imp of await this.getImportedFiles(currentFilePath, root)) {
        if (!seen.has(imp)) { seen.add(imp); suggestions.push({ relativePath: imp, reason: 'import', score: 0.95 }); }
      }
    }

    // 2. Recently changed files
    for (const rf of await this.getRecentlyChangedFiles(root)) {
      if (!seen.has(rf) && rf !== currentRel) { seen.add(rf); suggestions.push({ relativePath: rf, reason: 'recent', score: 0.8 }); }
    }

    // 3. Open editors
    const openEditors = vscode.window.tabGroups.all
      .flatMap(g => g.tabs)
      .filter(t => t.input instanceof vscode.TabInputText)
      .map(t => path.relative(root, (t.input as vscode.TabInputText).uri.fsPath))
      .filter(p => !p.startsWith('..') && p !== currentRel);
    for (const oe of openEditors.slice(0, 3)) {
      if (!seen.has(oe)) { seen.add(oe); suggestions.push({ relativePath: oe, reason: 'open', score: 0.6 }); }
    }

    // 4. Keyword match
    if (userQuery.length > 3) {
      const keywords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      for (const kf of await this.findFilesByKeywords(keywords, root)) {
        if (!seen.has(kf)) { seen.add(kf); suggestions.push({ relativePath: kf, reason: 'related', score: 0.5 }); }
      }
    }

    // 5. Test file
    if (currentFilePath) {
      const testFile = await this.findTestFile(currentFilePath, root);
      if (testFile && !seen.has(testFile)) { seen.add(testFile); suggestions.push({ relativePath: testFile, reason: 'test', score: 0.4 }); }
    }

    const result = suggestions.sort((a, b) => b.score - a.score).slice(0, maxFiles);
    this.cache.set(cacheKey, result);
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
    return result;
  }

  private async getImportedFiles(filePath: string, root: string): Promise<string[]> {
    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))).toString('utf8');
      const importRegex = /(?:import|require)\s*(?:\(?\s*['"]([^'"]+)['"]\s*\)?|.*from\s+['"]([^'"]+)['"])/g;
      const imports: string[] = [];
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1] || match[2];
        if (importPath && (importPath.startsWith('./') || importPath.startsWith('../'))) {
          const resolved = path.resolve(path.dirname(filePath), importPath);
          for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
            try {
              await vscode.workspace.fs.stat(vscode.Uri.file(resolved + ext));
              imports.push(path.relative(root, resolved + ext));
              break;
            } catch { /* try next */ }
          }
        }
      }
      return imports.slice(0, 5);
    } catch { return []; }
  }

  private async getRecentlyChangedFiles(root: string): Promise<string[]> {
    try {
      const { execSync } = require('child_process');
      const output = execSync('git diff --name-only HEAD~3 HEAD 2>/dev/null || git diff --name-only HEAD 2>/dev/null', {
        cwd: root, encoding: 'utf8', timeout: 3_000,
      });
      return output.trim().split('\n').filter(Boolean).slice(0, 5);
    } catch { return []; }
  }

  private async findFilesByKeywords(keywords: string[], root: string): Promise<string[]> {
    try {
      const { execSync } = require('child_process');
      const patterns = keywords.slice(0, 3).map(k => `-iname "*${k.replace(/[^a-z0-9]/g, '')}*"`).join(' -o ');
      if (!patterns) return [];
      const output = execSync(
        `find . -type f \\( ${patterns} \\) -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | head -5`,
        { cwd: root, encoding: 'utf8', timeout: 3_000 },
      );
      return output.trim().split('\n').filter(Boolean).map((f: string) => f.replace('./', ''));
    } catch { return []; }
  }

  private async findTestFile(filePath: string, root: string): Promise<string | null> {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    for (const pattern of [`${base}.test${ext}`, `${base}.spec${ext}`, `__tests__/${base}${ext}`]) {
      try {
        const full = path.join(dir, pattern);
        await vscode.workspace.fs.stat(vscode.Uri.file(full));
        return path.relative(root, full);
      } catch { /* not found */ }
    }
    return null;
  }
}
