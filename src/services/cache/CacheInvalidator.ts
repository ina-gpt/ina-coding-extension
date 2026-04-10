import * as vscode from 'vscode';
import { CacheManager } from './CacheManager';
import { Logger } from '../../utils/Logger';

export class CacheInvalidator {
  private static instance: CacheInvalidator;
  private cacheManager: CacheManager;
  private disposables: vscode.Disposable[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  static getInstance(): CacheInvalidator {
    if (!CacheInvalidator.instance) {
      CacheInvalidator.instance = new CacheInvalidator();
    }
    return CacheInvalidator.instance;
  }

  private constructor() {
    this.cacheManager = CacheManager.getInstance();
  }

  start(): void {
    // File content changes → invalidate file + symbols + types
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        this.debounce('change:' + e.document.uri.fsPath, () => {
          this.invalidateForDocument(e.document);
        }, 300);
      })
    );

    // File save → invalidate file + completion cache
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        this.invalidateForDocument(doc);
        this.cacheManager.getCache('completionCache')?.clear();
      })
    );

    // File create/delete/rename → invalidate related caches
    this.disposables.push(
      vscode.workspace.onDidCreateFiles(() => {
        this.cacheManager.getCache('symbolCache')?.clear();
      }),
      vscode.workspace.onDidDeleteFiles(e => {
        for (const uri of e.files) {
          this.cacheManager.invalidateFile(uri.fsPath);
        }
      }),
      vscode.workspace.onDidRenameFiles(e => {
        for (const { oldUri, newUri } of e.files) {
          this.cacheManager.invalidateFile(oldUri.fsPath);
          this.cacheManager.invalidateFile(newUri.fsPath);
        }
      })
    );

    // Active editor change → pre-warm cache for new file
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.preWarmForFile(editor.document.uri.fsPath).catch(() => {});
        }
      })
    );

    Logger.info('CacheInvalidator started');
  }

  invalidateForDocument(document: vscode.TextDocument): void {
    const filePath = document.uri.fsPath;
    this.cacheManager.invalidateFile(filePath);
  }

  invalidateForWorkspace(): void {
    this.cacheManager.invalidateAll();
  }

  async preWarmForFile(_filePath: string): Promise<void> {
    // Pre-warming is handled by individual services when they access the cache
    // This is a hook for future optimization
  }

  private debounce(id: string, fn: () => void, ms: number): void {
    const existing = this.debounceTimers.get(id);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(id, setTimeout(() => {
      fn();
      this.debounceTimers.delete(id);
    }, ms));
  }

  stop(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
  }

  dispose(): void {
    this.stop();
  }
}
