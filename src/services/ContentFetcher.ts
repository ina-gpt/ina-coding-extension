import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { tokenCounter } from './TokenCounter';
import { languageDetector } from './LanguageDetector';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface FetchedFile {
  path: string;
  relativePath: string;
  content: string;
  language: string;
  tokens: number;
  truncated: boolean;
  metadata: FileMetadata;
}

export interface FileMetadata {
  size: number;
  modified: Date;
  lineCount: number;
  encoding: string;
  isBinary: boolean;
}

export interface FetchOptions {
  maxTokens?: number;
  encoding?: BufferEncoding;
  lineRange?: { start: number; end: number };
  skipBinary?: boolean;
  cache?: boolean;
}

interface CacheEntry {
  content: string;
  tokens: number;
  timestamp: number;
  metadata: FileMetadata;
}

// ============ Constants ============

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.pyc', '.pyo', '.class', '.o', '.obj',
  '.lock', '.sqlite', '.db',
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const CACHE_TTL = 30000; // 30s

const DEFAULT_OPTIONS: FetchOptions = {
  maxTokens: 10000,
  encoding: 'utf-8',
  skipBinary: true,
  cache: true,
};

// ============ Content Fetcher ============

export class ContentFetcher {
  private cache: Map<string, CacheEntry> = new Map();
  private pendingFetches: Map<string, Promise<FetchedFile | null>> = new Map();

  async fetchFile(filePath: string, options: FetchOptions = {}): Promise<FetchedFile | null> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const absolutePath = await this.resolvePath(filePath);
      if (!absolutePath) { return null; }

      // Check cache
      if (opts.cache) {
        const cached = this.getFromCache(absolutePath);
        if (cached) {
          return this.buildResult(absolutePath, cached.content, cached.metadata, opts);
        }
      }

      // Dedupe concurrent fetches for same file
      const key = absolutePath;
      if (this.pendingFetches.has(key)) {
        return this.pendingFetches.get(key)!;
      }

      const promise = this.doFetch(absolutePath, opts);
      this.pendingFetches.set(key, promise);
      try { return await promise; } finally { this.pendingFetches.delete(key); }
    } catch (error) {
      Logger.error(`Failed to fetch file: ${filePath}`, error);
      return null;
    }
  }

  private async doFetch(absolutePath: string, opts: FetchOptions): Promise<FetchedFile | null> {
    const stats = await fs.stat(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();

    // Binary check
    if (opts.skipBinary && BINARY_EXTENSIONS.has(ext)) {
      return this.placeholder(absolutePath, stats, `[Binary file: ${ext}]`, true);
    }

    // Size check
    if (stats.size > MAX_FILE_SIZE) {
      return this.placeholder(absolutePath, stats, `[File too large: ${Math.round(stats.size / 1024)}KB]`, false);
    }

    let content = await fs.readFile(absolutePath, opts.encoding || 'utf-8');

    // Apply line range
    if (opts.lineRange) {
      const lines = content.split('\n');
      const start = Math.max(0, opts.lineRange.start - 1);
      const end = Math.min(lines.length, opts.lineRange.end);
      content = lines.slice(start, end).join('\n');
    }

    const metadata: FileMetadata = {
      size: stats.size,
      modified: stats.mtime,
      lineCount: content.split('\n').length,
      encoding: opts.encoding || 'utf-8',
      isBinary: false,
    };

    if (opts.cache) { this.addToCache(absolutePath, content, metadata); }

    return this.buildResult(absolutePath, content, metadata, opts);
  }

  private buildResult(absolutePath: string, content: string, metadata: FileMetadata, opts: FetchOptions): FetchedFile {
    const relativePath = vscode.workspace.asRelativePath(absolutePath);
    const langInfo = languageDetector.detectFromExtension(path.extname(absolutePath));

    let finalContent = content;
    let truncated = false;
    let tokens = tokenCounter.quickEstimate(content);

    if (opts.maxTokens && tokens > opts.maxTokens) {
      const result = tokenCounter.truncateToFit(content, opts.maxTokens, { strategy: 'smart' });
      finalContent = result.content;
      truncated = result.truncated;
      tokens = result.tokens;
    }

    return { path: absolutePath, relativePath, content: finalContent, language: langInfo?.id || 'plaintext', tokens, truncated, metadata };
  }

  private placeholder(absolutePath: string, stats: { size: number; mtime: Date }, msg: string, isBinary: boolean): FetchedFile {
    return {
      path: absolutePath,
      relativePath: vscode.workspace.asRelativePath(absolutePath),
      content: msg,
      language: isBinary ? 'binary' : 'plaintext',
      tokens: 5,
      truncated: !isBinary,
      metadata: { size: stats.size, modified: stats.mtime, lineCount: 0, encoding: 'utf-8', isBinary },
    };
  }

  // ============ Multiple Files ============

  async fetchFiles(filePaths: string[], options: FetchOptions & { totalMaxTokens?: number } = {}): Promise<Map<string, FetchedFile>> {
    const { totalMaxTokens = 30000, ...fetchOpts } = options;
    const perFile = Math.floor(totalMaxTokens / Math.max(filePaths.length, 1));
    const results = new Map<string, FetchedFile>();

    const CONCURRENCY = 5;
    for (let i = 0; i < filePaths.length; i += CONCURRENCY) {
      const chunk = filePaths.slice(i, i + CONCURRENCY);
      const promises = chunk.map(async (fp) => {
        const file = await this.fetchFile(fp, { ...fetchOpts, maxTokens: perFile });
        if (file) { results.set(fp, file); }
      });
      await Promise.all(promises);
    }

    return results;
  }

  async fetchByPattern(pattern: string, options: FetchOptions & { maxFiles?: number } = {}): Promise<Map<string, FetchedFile>> {
    const { maxFiles = 20, ...fetchOpts } = options;
    try {
      const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxFiles);
      return this.fetchFiles(files.map(f => f.fsPath), fetchOpts);
    } catch (error) {
      Logger.error(`Failed to fetch by pattern: ${pattern}`, error);
      return new Map();
    }
  }

  // ============ Line Fetching ============

  async fetchLines(filePath: string, startLine: number, endLine: number, options: FetchOptions = {}): Promise<FetchedFile | null> {
    return this.fetchFile(filePath, { ...options, lineRange: { start: startLine, end: endLine } });
  }

  async fetchContext(filePath: string, centerLine: number, contextLines: number = 20, options: FetchOptions = {}): Promise<FetchedFile | null> {
    return this.fetchLines(filePath, Math.max(1, centerLine - contextLines), centerLine + contextLines, options);
  }

  // ============ Path Resolution ============

  private async resolvePath(filePath: string): Promise<string | null> {
    if (path.isAbsolute(filePath)) {
      try { await fs.access(filePath); return filePath; } catch { return null; }
    }

    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders) {
      for (const folder of wsFolders) {
        const abs = path.join(folder.uri.fsPath, filePath);
        try { await fs.access(abs); return abs; } catch { continue; }
      }
    }
    return null;
  }

  // ============ Cache ============

  private getFromCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) { return null; }
    if (Date.now() - entry.timestamp > CACHE_TTL) { this.cache.delete(key); return null; }
    return entry;
  }

  private addToCache(key: string, content: string, metadata: FileMetadata): void {
    this.cache.set(key, { content, tokens: tokenCounter.quickEstimate(content), timestamp: Date.now(), metadata });
    if (this.cache.size > 100) {
      const oldest = Array.from(this.cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 20);
      oldest.forEach(([k]) => this.cache.delete(k));
    }
  }

  clearCache(): void { this.cache.clear(); }

  isBinaryFile(filePath: string): boolean {
    return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }
}

// ============ Singleton Export ============

export const contentFetcher = new ContentFetcher();
