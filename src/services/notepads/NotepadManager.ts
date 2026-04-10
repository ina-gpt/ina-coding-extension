/**
 * NotepadManager.ts
 * Phase 16.4 — Persistent scratch pads for pinned context
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  Notepad,
  NotepadType,
  NotepadConfig,
  NotepadIndex,
  NotepadIndexEntry,
  DEFAULT_NOTEPAD_CONFIG,
  TYPE_EXTENSIONS,
  NOTEPAD_INDEX_FILE,
  estimateTokens,
} from './NotepadTypes';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class NotepadManager {
  private static instance: NotepadManager;

  private notepads = new Map<string, Notepad>();
  private storageDir: string | null = null;
  private fileWatcher: vscode.FileSystemWatcher | null = null;

  private readonly _onNotepadsChanged = new vscode.EventEmitter<Notepad[]>();
  readonly onNotepadsChanged = this._onNotepadsChanged.event;

  private constructor() {}

  static getInstance(): NotepadManager {
    if (!NotepadManager.instance) {
      NotepadManager.instance = new NotepadManager();
    }
    return NotepadManager.instance;
  }

  private getConfig(): NotepadConfig {
    return {
      storageLocation: ConfigManager.get<'workspace' | 'global'>(
        'notepads.storageLocation',
        DEFAULT_NOTEPAD_CONFIG.storageLocation
      ),
      workspaceDir: DEFAULT_NOTEPAD_CONFIG.workspaceDir,
      maxPinnedTokens: ConfigManager.get<number>(
        'notepads.maxPinnedTokens',
        DEFAULT_NOTEPAD_CONFIG.maxPinnedTokens
      ),
      maxAttachedTokens: DEFAULT_NOTEPAD_CONFIG.maxAttachedTokens,
    };
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async loadFromDisk(workspaceRoot: string): Promise<void> {
    if (!workspaceRoot) return;

    this.storageDir = path.join(workspaceRoot, this.getConfig().workspaceDir);

    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch (e) {
        Logger.warn(`[Notepads] Failed to create storage dir: ${String(e)}`);
        return;
      }
    }

    // Load index
    const indexPath = path.join(this.storageDir, NOTEPAD_INDEX_FILE);
    if (fs.existsSync(indexPath)) {
      try {
        const raw = fs.readFileSync(indexPath, 'utf8');
        const parsed = JSON.parse(raw) as NotepadIndex;
        for (const entry of parsed.notepads ?? []) {
          const fullPath = path.isAbsolute(entry.filePath)
            ? entry.filePath
            : path.join(this.storageDir, entry.filePath);
          let content = '';
          try {
            if (fs.existsSync(fullPath)) {
              content = fs.readFileSync(fullPath, 'utf8');
            }
          } catch (e) {
            Logger.warn(`[Notepads] Failed to read ${fullPath}: ${String(e)}`);
          }
          this.notepads.set(entry.id, {
            ...entry,
            content,
            filePath: fullPath,
            tokenCount: estimateTokens(content),
          });
        }
        Logger.info(`[Notepads] Loaded ${this.notepads.size} notepads`);
      } catch (e) {
        Logger.warn(`[Notepads] Failed to parse index: ${String(e)}`);
      }
    }

    // Watch for external changes
    this.watchForChanges();
    this._onNotepadsChanged.fire(this.getAll());
  }

  async saveToDisk(): Promise<void> {
    if (!this.storageDir) return;

    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      const indexPath = path.join(this.storageDir, NOTEPAD_INDEX_FILE);
      const index: NotepadIndex = {
        version: 1,
        notepads: [...this.notepads.values()].map((n) => ({
          id: n.id,
          name: n.name,
          type: n.type,
          isPinned: n.isPinned,
          isAttached: n.isAttached,
          tokenCount: n.tokenCount,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          filePath: n.filePath ? path.relative(this.storageDir!, n.filePath) : '',
        })),
      };
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');
    } catch (e) {
      Logger.warn(`[Notepads] Failed to save index: ${String(e)}`);
    }
  }

  // ============================================================
  // CRUD
  // ============================================================

  async create(name: string, type: NotepadType, content: string = ''): Promise<Notepad> {
    if (!this.storageDir) {
      throw new Error('Notepads not initialized — no workspace open');
    }

    const id = this.generateId();
    const ext = TYPE_EXTENSIONS[type];
    const safeName = this.slugify(name);
    const filename = `${safeName}-${id.substring(0, 6)}${ext}`;
    const filePath = path.join(this.storageDir, filename);

    // Initial content with header
    const initialContent =
      content || `# ${name}\n\n_Created: ${new Date().toLocaleString()}_\n\n`;

    try {
      fs.writeFileSync(filePath, initialContent, 'utf8');
    } catch (e) {
      throw new Error(`Failed to write notepad file: ${String(e)}`);
    }

    const now = Date.now();
    const notepad: Notepad = {
      id,
      name,
      type,
      content: initialContent,
      isPinned: false,
      isAttached: false,
      tokenCount: estimateTokens(initialContent),
      createdAt: now,
      updatedAt: now,
      filePath,
    };

    this.notepads.set(id, notepad);
    await this.saveToDisk();
    this._onNotepadsChanged.fire(this.getAll());
    return notepad;
  }

  async update(id: string, content: string): Promise<void> {
    const notepad = this.notepads.get(id);
    if (!notepad) return;

    notepad.content = content;
    notepad.tokenCount = estimateTokens(content);
    notepad.updatedAt = Date.now();

    if (notepad.filePath) {
      try {
        fs.writeFileSync(notepad.filePath, content, 'utf8');
      } catch (e) {
        Logger.warn(`[Notepads] Failed to write ${notepad.filePath}: ${String(e)}`);
      }
    }

    await this.saveToDisk();
    this._onNotepadsChanged.fire(this.getAll());
  }

  async delete(id: string): Promise<void> {
    const notepad = this.notepads.get(id);
    if (!notepad) return;

    if (notepad.filePath && fs.existsSync(notepad.filePath)) {
      try {
        fs.unlinkSync(notepad.filePath);
      } catch (e) {
        Logger.warn(`[Notepads] Failed to delete file: ${String(e)}`);
      }
    }
    this.notepads.delete(id);
    await this.saveToDisk();
    this._onNotepadsChanged.fire(this.getAll());
  }

  // ============================================================
  // Queries
  // ============================================================

  get(id: string): Notepad | null {
    return this.notepads.get(id) ?? null;
  }

  getAll(): Notepad[] {
    return [...this.notepads.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getPinned(): Notepad[] {
    return this.getAll().filter((n) => n.isPinned);
  }

  getAttached(): Notepad[] {
    return this.getAll().filter((n) => n.isAttached);
  }

  // ============================================================
  // Pin / attach toggles
  // ============================================================

  pin(id: string): void {
    const n = this.notepads.get(id);
    if (!n) return;
    n.isPinned = true;
    n.updatedAt = Date.now();
    this.saveToDisk();
    this._onNotepadsChanged.fire(this.getAll());
  }

  unpin(id: string): void {
    const n = this.notepads.get(id);
    if (!n) return;
    n.isPinned = false;
    n.updatedAt = Date.now();
    this.saveToDisk();
    this._onNotepadsChanged.fire(this.getAll());
  }

  attach(id: string): void {
    const n = this.notepads.get(id);
    if (!n) return;
    n.isAttached = true;
    n.updatedAt = Date.now();
    this._onNotepadsChanged.fire(this.getAll());
  }

  detach(id: string): void {
    const n = this.notepads.get(id);
    if (!n) return;
    n.isAttached = false;
    n.updatedAt = Date.now();
    this._onNotepadsChanged.fire(this.getAll());
  }

  /** Reset all attached state — called when conversation ends */
  detachAll(): void {
    let changed = false;
    for (const n of this.notepads.values()) {
      if (n.isAttached) {
        n.isAttached = false;
        changed = true;
      }
    }
    if (changed) this._onNotepadsChanged.fire(this.getAll());
  }

  // ============================================================
  // Editor integration
  // ============================================================

  async openInEditor(id: string): Promise<void> {
    const n = this.notepads.get(id);
    if (!n || !n.filePath) {
      vscode.window.showWarningMessage('Notepad has no file backing');
      return;
    }
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(n.filePath));
      await vscode.window.showTextDocument(doc);
    } catch (e) {
      Logger.warn(`[Notepads] openInEditor failed: ${String(e)}`);
    }
  }

  // ============================================================
  // Context content for chat
  // ============================================================

  /**
   * Build the prompt-injection block from pinned + attached notepads.
   * Respects token budgets from config.
   */
  getContextContent(): string {
    const config = this.getConfig();
    const pinned = this.getPinned();
    const attached = this.getAttached().filter((n) => !n.isPinned);

    const pieces: string[] = [];
    let pinnedBudget = config.maxPinnedTokens;
    let attachedBudget = config.maxAttachedTokens;

    pieces.push('<notepads>');

    for (const n of pinned) {
      if (pinnedBudget <= 0) break;
      const slice = this.truncateToTokens(n.content, pinnedBudget);
      pinnedBudget -= estimateTokens(slice);
      pieces.push(
        `  <notepad name="${this.escapeAttr(n.name)}" type="${n.type}" pinned="true">`
      );
      pieces.push(this.indent(slice, 4));
      pieces.push('  </notepad>');
    }

    for (const n of attached) {
      if (attachedBudget <= 0) break;
      const slice = this.truncateToTokens(n.content, attachedBudget);
      attachedBudget -= estimateTokens(slice);
      pieces.push(
        `  <notepad name="${this.escapeAttr(n.name)}" type="${n.type}" attached="true">`
      );
      pieces.push(this.indent(slice, 4));
      pieces.push('  </notepad>');
    }

    pieces.push('</notepads>');

    if (pinned.length === 0 && attached.length === 0) return '';
    return pieces.join('\n');
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  private watchForChanges(): vscode.Disposable | null {
    if (!this.storageDir) return null;
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
    try {
      const pattern = new vscode.RelativePattern(this.storageDir, '*');
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      this.fileWatcher.onDidChange((uri) => this.handleFileChange(uri));
      return this.fileWatcher;
    } catch (e) {
      Logger.warn(`[Notepads] watcher failed: ${String(e)}`);
      return null;
    }
  }

  private handleFileChange(uri: vscode.Uri): void {
    if (uri.fsPath.endsWith(NOTEPAD_INDEX_FILE)) return;
    // Find notepad with this filePath
    for (const n of this.notepads.values()) {
      if (n.filePath === uri.fsPath) {
        try {
          const content = fs.readFileSync(uri.fsPath, 'utf8');
          n.content = content;
          n.tokenCount = estimateTokens(content);
          n.updatedAt = Date.now();
          this._onNotepadsChanged.fire(this.getAll());
          this.saveToDisk();
        } catch (e) {
          Logger.warn(`[Notepads] reload failed: ${String(e)}`);
        }
        break;
      }
    }
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 32) || 'notepad';
  }

  private generateId(): string {
    return `np_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '\n... (truncated)';
  }

  private indent(text: string, n: number): string {
    const pad = ' '.repeat(n);
    return text
      .split('\n')
      .map((line) => pad + line)
      .join('\n');
  }

  private escapeAttr(s: string): string {
    return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  dispose(): void {
    this.fileWatcher?.dispose();
    this._onNotepadsChanged.dispose();
    this.notepads.clear();
  }
}
