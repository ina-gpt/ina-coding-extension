import * as vscode from 'vscode';
import * as path from 'path';
import { RelatedFile, RelatedFileContext, ImportContext, ImportStatement } from './ContextTypes';
import { SensitiveFileDetector } from '../../codesec/SensitiveFileDetector';

export class RelatedFileFinder implements vscode.Disposable {
  private fileCache: Map<string, { content: string; symbols: string[]; timestamp: number }> =
    new Map();
  private maxRelatedFiles: number = 5;
  private maxSnippetLines: number = 30;
  private similarityThreshold: number = 0.6;
  private cacheTTL: number = 60000;

  async findRelatedFiles(
    document: vscode.TextDocument,
    position: vscode.Position,
    imports: ImportContext,
    tokenBudget: number
  ): Promise<RelatedFileContext> {
    const candidates: RelatedFile[] = [];
    let tokensUsed = 0;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath || '';

    // Gather candidates from multiple sources (with error handling for each)
    const [importFiles, dirFiles, recentFiles] = await Promise.allSettled([
      this.findImportedFiles(imports.imports, workspaceRoot, document.uri.fsPath),
      this.findInSameDirectory(document, 3),
      this.findRecentlyEdited(3, document.uri.fsPath),
    ]);

    if (importFiles.status === 'fulfilled') candidates.push(...importFiles.value);
    if (dirFiles.status === 'fulfilled') candidates.push(...dirFiles.value);
    if (recentFiles.status === 'fulfilled') candidates.push(...recentFiles.value);

    // Score, rank, and deduplicate
    // Filter out sensitive files before ranking
    const detector = SensitiveFileDetector.getInstance();
    const safeCandidates = candidates.filter(f => !detector.isSensitiveFile(f.path));

    const ranked = this.scoreAndRank(safeCandidates);

    // Apply token budget
    const included: RelatedFile[] = [];
    for (const file of ranked) {
      const snippetTokens = Math.ceil(file.snippet.length / 4);
      if (tokensUsed + snippetTokens > tokenBudget) break;
      if (included.length >= this.maxRelatedFiles) break;
      included.push(file);
      tokensUsed += snippetTokens;
    }

    return {
      files: included,
      totalCount: candidates.length,
      maxIncluded: this.maxRelatedFiles,
      tokenBudget,
      tokensUsed,
    };
  }

  async findImportedFiles(
    imports: ImportStatement[],
    workspaceRoot: string,
    currentFilePath: string
  ): Promise<RelatedFile[]> {
    const results: RelatedFile[] = [];

    for (const imp of imports) {
      if (imp.isDynamic) continue; // Skip dynamic imports

      const resolvedPath = this.resolveImportPath(imp.source, currentFilePath, workspaceRoot);
      if (!resolvedPath) continue;

      try {
        const content = await this.readFileWithCache(resolvedPath);
        if (!content) continue;

        const { snippet, range } = this.extractExportsSnippet(content, this.maxSnippetLines);
        const relativePath = workspaceRoot
          ? path.relative(workspaceRoot, resolvedPath)
          : resolvedPath;
        const ext = path.extname(resolvedPath).slice(1);

        results.push({
          path: resolvedPath,
          relativePath,
          language: ext === 'ts' || ext === 'tsx' ? 'typescript' : ext === 'js' || ext === 'jsx' ? 'javascript' : ext,
          similarity: 0.9,
          relevanceScore: 0.9,
          snippet,
          snippetRange: range,
          symbols: imp.specifiers.map((s) => s.alias || s.name),
          reason: 'import',
        });
      } catch {
        // File not readable, skip
      }
    }

    return results;
  }

  async findInSameDirectory(
    document: vscode.TextDocument,
    limit: number
  ): Promise<RelatedFile[]> {
    const results: RelatedFile[] = [];
    const dirPath = path.dirname(document.uri.fsPath);
    const currentFileName = path.basename(document.uri.fsPath);
    const currentExt = path.extname(document.uri.fsPath);

    try {
      const dirUri = vscode.Uri.file(dirPath);
      const entries = await vscode.workspace.fs.readDirectory(dirUri);

      const relatedExtensions = this.getRelatedExtensions(currentExt);

      const candidates = entries
        .filter(([name, type]) => {
          if (type !== vscode.FileType.File) return false;
          if (name === currentFileName) return false;
          const ext = path.extname(name);
          return relatedExtensions.includes(ext);
        })
        .slice(0, limit);

      for (const [name] of candidates) {
        const filePath = path.join(dirPath, name);
        try {
          const content = await this.readFileWithCache(filePath);
          if (!content) continue;

          const { snippet, range } = this.extractExportsSnippet(content, 15);
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

          results.push({
            path: filePath,
            relativePath: workspaceRoot ? path.relative(workspaceRoot, filePath) : name,
            language: document.languageId,
            similarity: 0.6,
            relevanceScore: 0.5,
            snippet,
            snippetRange: range,
            symbols: [],
            reason: 'same_directory',
          });
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Directory read failed
    }

    return results;
  }

  async findRecentlyEdited(limit: number, excludePath: string): Promise<RelatedFile[]> {
    const results: RelatedFile[] = [];

    // Use VS Code's recently opened tabs as proxy for recent edits
    const tabGroups = vscode.window.tabGroups;
    const recentTabs: vscode.Uri[] = [];

    for (const group of tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input && typeof tab.input === 'object' && 'uri' in tab.input) {
          const uri = (tab.input as { uri: vscode.Uri }).uri;
          if (uri.fsPath !== excludePath && uri.scheme === 'file') {
            recentTabs.push(uri);
          }
        }
      }
    }

    for (const uri of recentTabs.slice(0, limit)) {
      try {
        const content = await this.readFileWithCache(uri.fsPath);
        if (!content) continue;

        const { snippet, range } = this.extractExportsSnippet(content, 15);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const ext = path.extname(uri.fsPath).slice(1);

        results.push({
          path: uri.fsPath,
          relativePath: workspaceRoot ? path.relative(workspaceRoot, uri.fsPath) : path.basename(uri.fsPath),
          language: ext,
          similarity: 0.5,
          relevanceScore: 0.4,
          snippet,
          snippetRange: range,
          symbols: [],
          reason: 'recent_edit',
        });
      } catch {
        // Skip
      }
    }

    return results;
  }

  private extractExportsSnippet(
    content: string,
    maxLines: number
  ): { snippet: string; range: { start: number; end: number } } {
    const lines = content.split('\n');
    const exportLines: string[] = [];
    let start = -1;
    let end = 0;

    // Extract exported declarations
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (
        trimmed.startsWith('export ') ||
        trimmed.startsWith('module.exports') ||
        trimmed.startsWith('exports.')
      ) {
        if (start === -1) start = i;
        end = i;
        exportLines.push(lines[i]);

        // Include body of exported function/class (limited)
        if (trimmed.includes('{') && !trimmed.includes('}')) {
          let depth = 1;
          for (let j = i + 1; j < lines.length && exportLines.length < maxLines; j++) {
            exportLines.push(lines[j]);
            for (const ch of lines[j]) {
              if (ch === '{') depth++;
              else if (ch === '}') depth--;
            }
            end = j;
            if (depth <= 0) break;
          }
        }

        if (exportLines.length >= maxLines) break;
      }
    }

    // If no exports found, take the first N lines
    if (exportLines.length === 0) {
      const snippet = lines.slice(0, Math.min(maxLines, lines.length)).join('\n');
      return { snippet, range: { start: 0, end: Math.min(maxLines, lines.length) - 1 } };
    }

    return {
      snippet: exportLines.join('\n'),
      range: { start: start === -1 ? 0 : start, end },
    };
  }

  scoreAndRank(candidates: RelatedFile[]): RelatedFile[] {
    // Deduplicate by path
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seen.has(c.path)) return false;
      seen.add(c.path);
      return true;
    });

    // Compute combined score
    return unique
      .map((c) => ({
        ...c,
        relevanceScore: c.similarity * 0.6 + c.relevanceScore * 0.4,
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  resolveImportPath(
    importSource: string,
    currentFilePath: string,
    workspaceRoot: string
  ): string | null {
    // Skip node_modules / absolute packages
    if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
      return null;
    }

    const currentDir = path.dirname(currentFilePath);
    const resolved = path.resolve(currentDir, importSource);

    // Try with common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', ''];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      // We can't do sync file check in extension, but we'll try the path
      // The readFileWithCache will handle missing files
      if (ext === '' && !path.extname(resolved)) continue;
      if (ext === '') return resolved;
      return candidate;
    }

    // Try index file
    return path.join(resolved, 'index.ts');
  }

  private async readFileWithCache(filePath: string): Promise<string | null> {
    const cached = this.fileCache.get(filePath);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.content;
    }

    try {
      const uri = vscode.Uri.file(filePath);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const content = new TextDecoder().decode(bytes);

      // Don't cache very large files
      if (content.length < 100000) {
        this.fileCache.set(filePath, {
          content,
          symbols: [],
          timestamp: Date.now(),
        });
      }

      return content;
    } catch {
      return null;
    }
  }

  private getRelatedExtensions(ext: string): string[] {
    const groups: string[][] = [
      ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'],
      ['.py', '.pyi'],
      ['.go'],
      ['.rs'],
      ['.java', '.kt'],
      ['.c', '.h', '.cpp', '.hpp'],
    ];

    for (const group of groups) {
      if (group.includes(ext)) return group;
    }
    return [ext];
  }

  clearCache(): void {
    this.fileCache.clear();
  }

  dispose(): void {
    this.fileCache.clear();
  }
}
