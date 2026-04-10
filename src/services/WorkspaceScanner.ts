import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ignoreManager } from './IgnoreManager';
import { FileChange } from './ChangeQueue';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface ScanOptions {
  includePatterns?: string[];
  maxFiles?: number;
  maxDepth?: number;
  concurrency?: number;
  onProgress?: (scanned: number, total: number) => void;
  abortSignal?: AbortSignal;
}

export interface ScanResult {
  files: ScannedFile[];
  stats: ScanStats;
  errors: ScanError[];
}

export interface ScannedFile {
  uri: vscode.Uri;
  relativePath: string;
  size: number;
  modified: Date;
  language: string;
}

export interface ScanStats {
  totalFiles: number;
  totalSize: number;
  scannedDirs: number;
  ignoredFiles: number;
  ignoredDirs: number;
  duration: number;
  byLanguage: Map<string, number>;
}

export interface ScanError {
  path: string;
  error: string;
}

// ============ Constants ============

const DEFAULT_INCLUDE = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi', '.rs', '.go', '.java', '.kt', '.scala',
  '.c', '.cpp', '.h', '.hpp', '.cc', '.cs', '.fs', '.vb',
  '.rb', '.php', '.swift', '.m', '.vue', '.svelte', '.astro',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.txt', '.rst',
  '.html', '.css', '.scss', '.sass', '.less',
  '.sql', '.graphql', '.prisma',
  '.sh', '.bash', '.zsh', '.ps1',
];

// ============ Workspace Scanner ============

export class WorkspaceScanner {
  private scanning = false;
  private abortController: AbortController | null = null;

  async scanWorkspace(options: ScanOptions = {}): Promise<ScanResult> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return this.emptyResult(); }

    const allFiles: ScannedFile[] = [];
    const allErrors: ScanError[] = [];
    const stats: ScanStats = { totalFiles: 0, totalSize: 0, scannedDirs: 0, ignoredFiles: 0, ignoredDirs: 0, duration: 0, byLanguage: new Map() };
    const startTime = Date.now();

    for (const folder of folders) {
      const result = await this.scanFolder(folder.uri.fsPath, options);
      allFiles.push(...result.files);
      allErrors.push(...result.errors);
      stats.totalFiles += result.stats.totalFiles;
      stats.totalSize += result.stats.totalSize;
      stats.scannedDirs += result.stats.scannedDirs;
      stats.ignoredFiles += result.stats.ignoredFiles;
      stats.ignoredDirs += result.stats.ignoredDirs;
      for (const [lang, count] of result.stats.byLanguage) {
        stats.byLanguage.set(lang, (stats.byLanguage.get(lang) || 0) + count);
      }
    }

    stats.duration = Date.now() - startTime;
    return { files: allFiles, stats, errors: allErrors };
  }

  async scanFolder(folderPath: string, options: ScanOptions = {}): Promise<ScanResult> {
    const opts = {
      includePatterns: options.includePatterns ?? DEFAULT_INCLUDE,
      maxFiles: options.maxFiles ?? 50000,
      maxDepth: options.maxDepth ?? 20,
      concurrency: options.concurrency ?? 10,
      onProgress: options.onProgress,
      abortSignal: options.abortSignal,
    };

    const wsFolder = vscode.workspace.workspaceFolders?.find(f => f.uri.fsPath === folderPath);
    if (wsFolder) { await ignoreManager.initialize(wsFolder); }

    this.scanning = true;
    this.abortController = new AbortController();

    const files: ScannedFile[] = [];
    const errors: ScanError[] = [];
    const stats: ScanStats = { totalFiles: 0, totalSize: 0, scannedDirs: 0, ignoredFiles: 0, ignoredDirs: 0, duration: 0, byLanguage: new Map() };
    const startTime = Date.now();

    try {
      await this.scanDir(folderPath, folderPath, 0, opts, files, errors, stats);
    } catch (error) {
      if (error instanceof Error && error.message !== 'Scan aborted') {
        Logger.error('Scan error:', error);
        errors.push({ path: folderPath, error: error.message });
      }
    }

    stats.duration = Date.now() - startTime;
    this.scanning = false;
    this.abortController = null;

    Logger.info(`Scan complete: ${stats.totalFiles} files in ${stats.duration}ms`);
    return { files, stats, errors };
  }

  private async scanDir(
    dirPath: string, rootPath: string, depth: number,
    opts: { includePatterns: string[]; maxFiles: number; maxDepth: number; concurrency: number; onProgress?: (s: number, t: number) => void; abortSignal?: AbortSignal },
    files: ScannedFile[], errors: ScanError[], stats: ScanStats
  ): Promise<void> {
    if (opts.abortSignal?.aborted || this.abortController?.signal.aborted) { throw new Error('Scan aborted'); }
    if (depth > opts.maxDepth || files.length >= opts.maxFiles) { return; }

    stats.scannedDirs++;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const dirs: string[] = [];
      const filesToProcess: { name: string; fullPath: string }[] = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const result = ignoreManager.shouldIgnore(fullPath, rootPath);
          if (result.ignored) { stats.ignoredDirs++; continue; }
          dirs.push(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!opts.includePatterns.includes(ext)) { continue; }

          const result = ignoreManager.shouldIgnore(fullPath, rootPath);
          if (result.ignored) { stats.ignoredFiles++; continue; }

          filesToProcess.push({ name: entry.name, fullPath });
        }
      }

      // Process files in batches
      for (let i = 0; i < filesToProcess.length && files.length < opts.maxFiles; i += opts.concurrency) {
        const batch = filesToProcess.slice(i, i + opts.concurrency);
        const results = await Promise.all(batch.map(async ({ name, fullPath }) => {
          try {
            const stat = await fs.stat(fullPath);
            if (ignoreManager.isFileTooLarge(stat.size, rootPath)) { stats.ignoredFiles++; return null; }
            const relativePath = fullPath.slice(rootPath.length + 1);
            const language = this.getLanguage(path.extname(name).toLowerCase());
            return { uri: vscode.Uri.file(fullPath), relativePath, size: stat.size, modified: stat.mtime, language } as ScannedFile;
          } catch (error) {
            errors.push({ path: fullPath, error: error instanceof Error ? error.message : 'Unknown' });
            return null;
          }
        }));

        for (const r of results) {
          if (r && files.length < opts.maxFiles) {
            files.push(r);
            stats.totalFiles++;
            stats.totalSize += r.size;
            stats.byLanguage.set(r.language, (stats.byLanguage.get(r.language) || 0) + 1);
          }
        }

        if (opts.onProgress) { opts.onProgress(files.length, opts.maxFiles); }
      }

      // Recurse into subdirectories
      for (const subDir of dirs) {
        if (files.length >= opts.maxFiles) { break; }
        await this.scanDir(subDir, rootPath, depth + 1, opts, files, errors, stats);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'Scan aborted') {
        errors.push({ path: dirPath, error: error.message });
      }
    }
  }

  toFileChanges(files: ScannedFile[], type: 'create' | 'change' = 'create'): FileChange[] {
    return files.map(f => ({ uri: f.uri, type, timestamp: f.modified.getTime(), metadata: { size: f.size, language: f.language } }));
  }

  abort(): void { this.abortController?.abort(); }
  isScanning(): boolean { return this.scanning; }

  private emptyResult(): ScanResult {
    return { files: [], stats: { totalFiles: 0, totalSize: 0, scannedDirs: 0, ignoredFiles: 0, ignoredDirs: 0, duration: 0, byLanguage: new Map() }, errors: [] };
  }

  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
      '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.pyi': 'python',
      '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin', '.scala': 'scala',
      '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.h': 'c', '.hpp': 'cpp',
      '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
      '.vue': 'vue', '.svelte': 'svelte', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
      '.md': 'markdown', '.html': 'html', '.css': 'css', '.scss': 'scss',
      '.sql': 'sql', '.graphql': 'graphql', '.prisma': 'prisma',
      '.sh': 'shellscript', '.bash': 'shellscript', '.ps1': 'powershell',
    };
    return map[ext] || 'plaintext';
  }
}

export const workspaceScanner = new WorkspaceScanner();
