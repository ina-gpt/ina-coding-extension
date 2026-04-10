import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ignoreManager } from './IgnoreManager';
import { ChangeQueue, FileChange, createIndexingQueue } from './ChangeQueue';
import { Logger } from '../utils/Logger';

// ============ Types ============

export interface FileWatcherOptions {
  debounceMs?: number;
  batchSize?: number;
  watchPatterns?: string[];
  respectGitignore?: boolean;
  onIndexingNeeded?: (changes: FileChange[]) => Promise<void>;
}

export interface WatcherStats {
  isWatching: boolean;
  watchedFolders: number;
  totalEvents: number;
  ignoredEvents: number;
  queuedChanges: number;
  lastEvent: number | null;
}

// ============ Constants ============

const DEFAULT_WATCH_PATTERNS = [
  '**/*.{ts,tsx,js,jsx,mjs,cjs}',
  '**/*.{py,pyi}',
  '**/*.{rs,go,java,kt,scala}',
  '**/*.{c,cpp,h,hpp,cc}',
  '**/*.{cs,fs,vb}',
  '**/*.{rb,php,swift,m}',
  '**/*.{vue,svelte,astro}',
  '**/*.{json,yaml,yml,toml}',
  '**/*.{md,mdx,txt,rst}',
  '**/*.{html,css,scss,sass,less}',
  '**/*.{sql,graphql,prisma}',
  '**/*.{sh,bash,zsh,ps1}',
];

// ============ File Watcher Class ============

export class FileWatcher implements vscode.Disposable {
  private watchers: Map<string, vscode.FileSystemWatcher[]> = new Map();
  private changeQueue: ChangeQueue;
  private options: Required<FileWatcherOptions>;
  private stats: WatcherStats = {
    isWatching: false, watchedFolders: 0, totalEvents: 0,
    ignoredEvents: 0, queuedChanges: 0, lastEvent: null,
  };
  private disposed = false;

  private onFileCreatedEmitter = new vscode.EventEmitter<vscode.Uri>();
  private onFileChangedEmitter = new vscode.EventEmitter<vscode.Uri>();
  private onFileDeletedEmitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onFileCreated = this.onFileCreatedEmitter.event;
  readonly onFileChanged = this.onFileChangedEmitter.event;
  readonly onFileDeleted = this.onFileDeletedEmitter.event;

  constructor(options: FileWatcherOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 500,
      batchSize: options.batchSize ?? 100,
      watchPatterns: options.watchPatterns ?? DEFAULT_WATCH_PATTERNS,
      respectGitignore: options.respectGitignore ?? true,
      onIndexingNeeded: options.onIndexingNeeded ?? (async () => {}),
    };

    this.changeQueue = createIndexingQueue(this.options.onIndexingNeeded);
  }

  // ============ Lifecycle ============

  async start(): Promise<void> {
    if (this.disposed || this.stats.isWatching) { return; }

    Logger.info('FileWatcher: Starting...');
    await ignoreManager.initializeAll();

    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { Logger.warn('FileWatcher: No workspace folders'); return; }

    for (const folder of folders) {
      this.watchFolder(folder);
    }

    this.stats.isWatching = true;
    this.stats.watchedFolders = folders.length;
    Logger.info(`FileWatcher: Started watching ${folders.length} folders`);
  }

  stop(): void {
    for (const watchers of this.watchers.values()) {
      for (const w of watchers) { w.dispose(); }
    }
    this.watchers.clear();
    this.stats.isWatching = false;
    this.stats.watchedFolders = 0;
    Logger.info('FileWatcher: Stopped');
  }

  // ============ Folder Watching ============

  private watchFolder(folder: vscode.WorkspaceFolder): void {
    const folderPath = folder.uri.fsPath;
    const watchers: vscode.FileSystemWatcher[] = [];

    for (const pattern of this.options.watchPatterns) {
      const relativePattern = new vscode.RelativePattern(folder, pattern);
      const watcher = vscode.workspace.createFileSystemWatcher(relativePattern);

      watcher.onDidCreate((uri) => this.handleEvent(uri, 'create', folderPath));
      watcher.onDidChange((uri) => this.handleEvent(uri, 'change', folderPath));
      watcher.onDidDelete((uri) => this.handleEvent(uri, 'delete', folderPath));

      watchers.push(watcher);
    }

    this.watchers.set(folderPath, watchers);
    Logger.debug(`FileWatcher: Watching ${folderPath} with ${watchers.length} patterns`);
  }

  private unwatchFolder(folder: vscode.WorkspaceFolder): void {
    const folderPath = folder.uri.fsPath;
    const watchers = this.watchers.get(folderPath);
    if (watchers) {
      for (const w of watchers) { w.dispose(); }
      this.watchers.delete(folderPath);
      this.stats.watchedFolders--;
    }
  }

  // ============ Event Handling ============

  private async handleEvent(uri: vscode.Uri, type: 'create' | 'change' | 'delete', folderPath: string): Promise<void> {
    this.stats.totalEvents++;
    this.stats.lastEvent = Date.now();

    // For deletes, don't check ignore (need to remove from index)
    // But skip ignored directories
    if (type === 'delete') {
      const relativePath = uri.fsPath.slice(folderPath.length + 1);
      const parts = relativePath.split(path.sep);
      const ignoredDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'];
      if (parts.some(p => ignoredDirs.includes(p))) {
        this.stats.ignoredEvents++;
        return;
      }
    } else {
      // Check ignore for create/change
      if (this.options.respectGitignore) {
        const result = ignoreManager.shouldIgnore(uri.fsPath, folderPath);
        if (result.ignored) {
          this.stats.ignoredEvents++;
          return;
        }
      }

      // Check file size for change events
      if (type === 'change') {
        try {
          const stat = await fs.stat(uri.fsPath);
          if (ignoreManager.isFileTooLarge(stat.size, folderPath)) {
            this.stats.ignoredEvents++;
            return;
          }
        } catch { /* file may have been deleted */ }
      }
    }

    // Get metadata
    let metadata: { size?: number; language?: string } | undefined;
    if (type !== 'delete') {
      try {
        const stat = await fs.stat(uri.fsPath);
        const ext = path.extname(uri.fsPath);
        metadata = { size: stat.size, language: this.getLanguage(ext) };
      } catch { /* ignore */ }
    }

    const change: FileChange = { uri, type, timestamp: Date.now(), metadata };
    this.changeQueue.enqueue(change);
    this.stats.queuedChanges = this.changeQueue.size;

    // Emit events
    if (type === 'create') { this.onFileCreatedEmitter.fire(uri); }
    else if (type === 'change') { this.onFileChangedEmitter.fire(uri); }
    else { this.onFileDeletedEmitter.fire(uri); }
  }

  handleRename(oldUri: vscode.Uri, newUri: vscode.Uri): void {
    this.stats.totalEvents += 2;
    this.stats.lastEvent = Date.now();
    this.changeQueue.enqueue({ uri: newUri, type: 'rename', timestamp: Date.now(), oldUri });
    this.stats.queuedChanges = this.changeQueue.size;
  }

  // ============ Utilities ============

  private getLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact',
      '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.cs': 'csharp', '.rb': 'ruby', '.php': 'php',
      '.swift': 'swift', '.vue': 'vue', '.svelte': 'svelte', '.md': 'markdown',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.html': 'html',
      '.css': 'css', '.scss': 'scss', '.sql': 'sql',
    };
    return map[ext.toLowerCase()] || 'plaintext';
  }

  async flush(): Promise<void> { await this.changeQueue.flushNow(); this.stats.queuedChanges = 0; }
  clearQueue(): void { this.changeQueue.clear(); this.stats.queuedChanges = 0; }
  getStats(): WatcherStats { return { ...this.stats, queuedChanges: this.changeQueue.size }; }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.changeQueue.dispose();
    this.onFileCreatedEmitter.dispose();
    this.onFileChangedEmitter.dispose();
    this.onFileDeletedEmitter.dispose();
    ignoreManager.dispose();
  }
}

export const fileWatcher = new FileWatcher();
