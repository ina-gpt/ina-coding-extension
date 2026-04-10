/**
 * Phase 17.1 — Shadow File System Provider
 *
 * Implements vscode.FileSystemProvider for the 'ina-shadow' URI scheme.
 * All reads and writes go to in-memory Maps, never touching the real filesystem.
 * This allows AI-generated changes to be previewed in VS Code's diff editor
 * without modifying any actual files on disk.
 */
import * as vscode from 'vscode';
import { Logger } from '../../utils/Logger';

interface FileStat {
  ctime: number;
  mtime: number;
  size: number;
}

export class ShadowFileSystemProvider implements vscode.FileSystemProvider {
  private static instance: ShadowFileSystemProvider | null = null;

  private readonly fileContents: Map<string, Uint8Array> = new Map();
  private readonly fileStats: Map<string, FileStat> = new Map();

  private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

  private readonly logger = Logger;
  private disposables: vscode.Disposable[] = [];

  private constructor() {}

  /**
   * Returns the singleton instance of ShadowFileSystemProvider.
   */
  public static getInstance(): ShadowFileSystemProvider {
    if (!ShadowFileSystemProvider.instance) {
      ShadowFileSystemProvider.instance = new ShadowFileSystemProvider();
    }
    return ShadowFileSystemProvider.instance;
  }

  /**
   * Register this provider with the VS Code workspace for the 'ina-shadow' scheme.
   */
  public register(context: vscode.ExtensionContext): void {
    const registration = vscode.workspace.registerFileSystemProvider(
      'ina-shadow',
      this,
      { isCaseSensitive: true }
    );
    this.disposables.push(registration);
    context.subscriptions.push(registration);
    this.logger.info('[ShadowFS] Registered ina-shadow file system provider');
  }

  /**
   * Return file metadata.
   * Throws FileNotFound if the file does not exist in the shadow filesystem.
   */
  public stat(uri: vscode.Uri): vscode.FileStat {
    const key = this.uriToKey(uri);
    const stats = this.fileStats.get(key);

    if (!stats) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return {
      type: vscode.FileType.File,
      ctime: stats.ctime,
      mtime: stats.mtime,
      size: stats.size,
    };
  }

  /**
   * Read a file from the in-memory store.
   * Throws FileNotFound if the file does not exist.
   */
  public readFile(uri: vscode.Uri): Uint8Array {
    const key = this.uriToKey(uri);
    const content = this.fileContents.get(key);

    if (!content) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    return content;
  }

  /**
   * Write a file to the in-memory store.
   * Creates the file if it doesn't exist, updates it if it does.
   */
  public writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): void {
    const key = this.uriToKey(uri);
    const exists = this.fileContents.has(key);

    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (exists && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    const now = Date.now();
    const ctime = exists ? this.fileStats.get(key)!.ctime : now;

    this.fileContents.set(key, content);
    this.fileStats.set(key, {
      ctime,
      mtime: now,
      size: content.byteLength,
    });

    const changeType = exists
      ? vscode.FileChangeType.Changed
      : vscode.FileChangeType.Created;

    this._onDidChangeFile.fire([{ type: changeType, uri }]);

    this.logger.debug(`[ShadowFS] ${exists ? 'Updated' : 'Created'} file: ${key}`);
  }

  /**
   * Delete a file from the in-memory store.
   */
  public delete(uri: vscode.Uri, options?: { recursive: boolean }): void {
    const key = this.uriToKey(uri);

    if (!this.fileContents.has(key)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    this.fileContents.delete(key);
    this.fileStats.delete(key);

    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);

    this.logger.debug(`[ShadowFS] Deleted file: ${key}`);
  }

  /**
   * List virtual files in a directory by prefix matching.
   * Returns tuples of [name, FileType].
   */
  public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const prefix = this.uriToKey(uri);
    const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
    const entries: [string, vscode.FileType][] = [];
    const seen = new Set<string>();

    for (const key of this.fileContents.keys()) {
      if (!key.startsWith(normalizedPrefix)) {
        continue;
      }

      const relativePath = key.slice(normalizedPrefix.length);
      const slashIndex = relativePath.indexOf('/');

      if (slashIndex === -1) {
        // Direct child file
        if (!seen.has(relativePath)) {
          seen.add(relativePath);
          entries.push([relativePath, vscode.FileType.File]);
        }
      } else {
        // Subdirectory
        const dirName = relativePath.slice(0, slashIndex);
        if (!seen.has(dirName)) {
          seen.add(dirName);
          entries.push([dirName, vscode.FileType.Directory]);
        }
      }
    }

    return entries;
  }

  /**
   * Create a directory — no-op for the in-memory filesystem.
   * Directories are implicit based on file paths.
   */
  public createDirectory(uri: vscode.Uri): void {
    // No-op: directories are implicit in the in-memory filesystem
  }

  /**
   * Rename/move a file within the in-memory store.
   */
  public rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean }
  ): void {
    const oldKey = this.uriToKey(oldUri);
    const newKey = this.uriToKey(newUri);

    const content = this.fileContents.get(oldKey);
    const stats = this.fileStats.get(oldKey);

    if (!content || !stats) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }

    if (this.fileContents.has(newKey) && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(newUri);
    }

    this.fileContents.delete(oldKey);
    this.fileStats.delete(oldKey);

    this.fileContents.set(newKey, content);
    this.fileStats.set(newKey, {
      ...stats,
      mtime: Date.now(),
    });

    this._onDidChangeFile.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    ]);

    this.logger.debug(`[ShadowFS] Renamed: ${oldKey} -> ${newKey}`);
  }

  /**
   * Watch a resource for changes — returns a no-op disposable.
   * Change events are fired by writeFile/delete/rename methods.
   */
  public watch(
    uri: vscode.Uri,
    options: { readonly recursive: boolean; readonly excludes: readonly string[] }
  ): vscode.Disposable {
    // No-op: changes are tracked internally via writeFile/delete
    return new vscode.Disposable(() => {});
  }

  /**
   * Clear all files from the in-memory store.
   */
  public clear(): void {
    const count = this.fileContents.size;
    this.fileContents.clear();
    this.fileStats.clear();
    this.logger.info(`[ShadowFS] Cleared all files (${count} removed)`);
  }

  /**
   * Return all file paths stored in the shadow filesystem.
   */
  public getFilePaths(): string[] {
    return Array.from(this.fileContents.keys());
  }

  /**
   * Check whether a file exists in the shadow filesystem.
   */
  public has(uri: vscode.Uri): boolean {
    return this.fileContents.has(this.uriToKey(uri));
  }

  /**
   * Convert a URI to a normalized string key for map lookups.
   */
  private uriToKey(uri: vscode.Uri): string {
    return uri.path;
  }

  /**
   * Dispose of all resources.
   */
  public dispose(): void {
    this._onDidChangeFile.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.clear();
    ShadowFileSystemProvider.instance = null;
  }
}
