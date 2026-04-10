/**
 * Phase 17.1 — Shadow Workspace Manager
 *
 * The main orchestrator for the shadow workspace feature.
 * Manages sessions, file operations, diffing, checkpoints,
 * and integration with VS Code's diff editor.
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../../utils/Logger';
import { ShadowFileSystemProvider } from './ShadowFileSystemProvider';
import {
  ShadowFile,
  ShadowFileStatus,
  ShadowSession,
  ShadowCheckpoint,
  ShadowDiff,
  DiffHunk,
  ShadowWorkspaceEvent,
  ShadowConfig,
  DEFAULT_SHADOW_CONFIG,
} from './ShadowTypes';

export class ShadowWorkspaceManager extends EventEmitter {
  private static instance: ShadowWorkspaceManager | null = null;

  private readonly sessions: Map<string, ShadowSession> = new Map();
  private activeSessionId: string | null = null;
  private readonly fsProvider: ShadowFileSystemProvider;
  private readonly expiryTimers: Map<string, NodeJS.Timeout> = new Map();

  private readonly logger = Logger;

  private constructor() {
    super();
    this.fsProvider = ShadowFileSystemProvider.getInstance();
  }

  /**
   * Returns the singleton instance of ShadowWorkspaceManager.
   */
  public static getInstance(): ShadowWorkspaceManager {
    if (!ShadowWorkspaceManager.instance) {
      ShadowWorkspaceManager.instance = new ShadowWorkspaceManager();
    }
    return ShadowWorkspaceManager.instance;
  }

  /**
   * Get the underlying file system provider.
   */
  public getFileSystemProvider(): ShadowFileSystemProvider {
    return this.fsProvider;
  }

  // ────────────────────────────────────────────
  // Session Management
  // ────────────────────────────────────────────

  /**
   * Create a new shadow session and set it as active.
   * Enforces the maxSessions limit by discarding the oldest expired/discarded sessions.
   */
  public createSession(name: string, sourceOperation: string): ShadowSession {
    const config = this.getConfig();

    // Enforce max sessions limit
    if (this.sessions.size >= config.maxSessions) {
      this.evictOldestSession();
    }

    const id = this.generateId();
    const now = Date.now();
    const expiresAt = now + config.autoExpireMinutes * 60 * 1000;

    const session: ShadowSession = {
      id,
      name,
      files: new Map(),
      status: 'active',
      createdAt: now,
      expiresAt,
      checkpoints: [],
      sourceOperation,
    };

    this.sessions.set(id, session);
    this.activeSessionId = id;
    this.startExpiryTimer(session);

    this.emitEvent({
      type: 'sessionCreated',
      sessionId: id,
      filePath: null,
      data: { name, sourceOperation },
    });

    this.logger.info(`[ShadowWS] Created session: ${name} (${id})`);
    return session;
  }

  /**
   * Get the currently active session, or null if none.
   */
  public getActiveSession(): ShadowSession | null {
    if (!this.activeSessionId) {
      return null;
    }
    return this.sessions.get(this.activeSessionId) || null;
  }

  /**
   * Get a session by ID.
   */
  public getSession(id: string): ShadowSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * List all sessions ordered by creation time (newest first).
   */
  public listSessions(): ShadowSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  // ────────────────────────────────────────────
  // File Operations
  // ────────────────────────────────────────────

  /**
   * Write a file to the shadow workspace.
   * Reads the original content from the real filesystem, creates a ShadowFile,
   * writes to the fsProvider, and optionally creates a checkpoint.
   */
  public async writeFile(
    sessionId: string,
    filePath: string,
    content: string,
    options?: { sourceOperation?: string; metadata?: Record<string, any> }
  ): Promise<ShadowFile> {
    const session = this.requireSession(sessionId);
    const config = this.getConfig();

    // Read original content from the real filesystem
    let originalContent = '';
    const realUri = vscode.Uri.file(filePath);

    try {
      const existingContent = await vscode.workspace.fs.readFile(realUri);
      originalContent = Buffer.from(existingContent).toString('utf-8');
    } catch {
      // File doesn't exist on disk yet — originalContent stays empty
    }

    const shadowUri = vscode.Uri.parse(`ina-shadow:/${sessionId}${filePath}`);
    const now = Date.now();
    const isUpdate = session.files.has(filePath);

    const shadowFile: ShadowFile = {
      realUri,
      shadowUri,
      content,
      originalContent,
      status: ShadowFileStatus.PENDING,
      createdAt: isUpdate ? session.files.get(filePath)!.createdAt : now,
      modifiedAt: now,
      sourceOperation: options?.sourceOperation || session.sourceOperation,
      metadata: options?.metadata || {},
    };

    // Write content to the virtual filesystem
    const encoder = new TextEncoder();
    this.fsProvider.writeFile(shadowUri, encoder.encode(content), {
      create: true,
      overwrite: true,
    });

    session.files.set(filePath, shadowFile);

    // Auto-checkpoint if configured
    if (config.autoCreateCheckpoints && !isUpdate) {
      await this.createCheckpoint(sessionId, `Auto: wrote ${filePath}`);
    }

    this.emitEvent({
      type: isUpdate ? 'fileModified' : 'fileAdded',
      sessionId,
      filePath,
      data: { sourceOperation: shadowFile.sourceOperation },
    });

    this.logger.debug(`[ShadowWS] ${isUpdate ? 'Updated' : 'Added'} file: ${filePath} in session ${sessionId}`);
    return shadowFile;
  }

  /**
   * Create a new file in the shadow workspace (originalContent is empty).
   */
  public async createFile(
    sessionId: string,
    filePath: string,
    content: string
  ): Promise<ShadowFile> {
    return this.writeFile(sessionId, filePath, content, {
      sourceOperation: 'create',
    });
  }

  /**
   * Mark a file as deleted in the shadow workspace.
   */
  public async deleteFile(sessionId: string, filePath: string): Promise<void> {
    const session = this.requireSession(sessionId);
    const shadowFile = session.files.get(filePath);

    if (!shadowFile) {
      throw new Error(`File not found in session: ${filePath}`);
    }

    // Remove from the virtual filesystem
    try {
      this.fsProvider.delete(shadowFile.shadowUri);
    } catch {
      // Already removed
    }

    // Mark as rejected (effectively deleted from shadow)
    shadowFile.status = ShadowFileStatus.REJECTED;
    shadowFile.modifiedAt = Date.now();
    session.files.delete(filePath);

    this.logger.debug(`[ShadowWS] Deleted file: ${filePath} from session ${sessionId}`);
  }

  // ────────────────────────────────────────────
  // Diffing
  // ────────────────────────────────────────────

  /**
   * Compute the diff between original and shadow content for a file.
   */
  public getDiff(sessionId: string, filePath: string): ShadowDiff | null {
    const session = this.requireSession(sessionId);
    const shadowFile = session.files.get(filePath);

    if (!shadowFile) {
      return null;
    }

    const hunks = this.computeLineDiff(
      shadowFile.originalContent,
      shadowFile.content
    );

    let linesAdded = 0;
    let linesRemoved = 0;
    let linesChanged = 0;

    for (const hunk of hunks) {
      const origLines = hunk.originalContent
        ? hunk.originalContent.split('\n').filter((l) => l.length > 0).length
        : 0;
      const modLines = hunk.modifiedContent
        ? hunk.modifiedContent.split('\n').filter((l) => l.length > 0).length
        : 0;

      if (origLines === 0) {
        linesAdded += modLines;
      } else if (modLines === 0) {
        linesRemoved += origLines;
      } else {
        const changed = Math.min(origLines, modLines);
        linesChanged += changed;
        if (modLines > origLines) {
          linesAdded += modLines - origLines;
        } else if (origLines > modLines) {
          linesRemoved += origLines - modLines;
        }
      }
    }

    return {
      filePath,
      hunks,
      linesAdded,
      linesRemoved,
      linesChanged,
    };
  }

  /**
   * Compute diffs for all files in a session.
   */
  public getAllDiffs(sessionId: string): ShadowDiff[] {
    const session = this.requireSession(sessionId);
    const diffs: ShadowDiff[] = [];

    for (const filePath of session.files.keys()) {
      const diff = this.getDiff(sessionId, filePath);
      if (diff) {
        diffs.push(diff);
      }
    }

    return diffs;
  }

  // ────────────────────────────────────────────
  // Preview
  // ────────────────────────────────────────────

  /**
   * Open VS Code's diff editor to preview a shadow file against its original.
   */
  public async previewFile(
    sessionId: string,
    filePath: string
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const shadowFile = session.files.get(filePath);

    if (!shadowFile) {
      throw new Error(`File not found in session: ${filePath}`);
    }

    const title = `Shadow: ${filePath.split('/').pop()} (${session.name})`;

    await vscode.commands.executeCommand(
      'vscode.diff',
      shadowFile.realUri,
      shadowFile.shadowUri,
      title
    );
  }

  /**
   * Open diff editors for the first 10 files in a session.
   */
  public async previewAll(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    const files = Array.from(session.files.entries()).slice(0, 10);

    for (const [filePath] of files) {
      await this.previewFile(sessionId, filePath);
    }
  }

  // ────────────────────────────────────────────
  // Accept / Reject
  // ────────────────────────────────────────────

  /**
   * Accept a shadow file: write its content to the real filesystem.
   */
  public async acceptFile(
    sessionId: string,
    filePath: string
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const shadowFile = session.files.get(filePath);

    if (!shadowFile) {
      throw new Error(`File not found in session: ${filePath}`);
    }

    // Write shadow content to the real filesystem
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(
      shadowFile.realUri,
      encoder.encode(shadowFile.content)
    );

    shadowFile.status = ShadowFileStatus.ACCEPTED;
    shadowFile.modifiedAt = Date.now();

    // Remove from virtual filesystem
    try {
      this.fsProvider.delete(shadowFile.shadowUri);
    } catch {
      // Already removed
    }

    this.emitEvent({
      type: 'fileAccepted',
      sessionId,
      filePath,
      data: null,
    });

    this.logger.info(`[ShadowWS] Accepted file: ${filePath}`);
  }

  /**
   * Accept all pending/edited files in a session and mark the session as committed.
   */
  public async acceptAll(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);

    for (const [filePath, shadowFile] of session.files) {
      if (
        shadowFile.status === ShadowFileStatus.PENDING ||
        shadowFile.status === ShadowFileStatus.EDITED
      ) {
        await this.acceptFile(sessionId, filePath);
      }
    }

    session.status = 'committed';
    this.clearExpiryTimer(sessionId);

    this.emitEvent({
      type: 'sessionCommitted',
      sessionId,
      filePath: null,
      data: null,
    });

    this.logger.info(`[ShadowWS] Committed session: ${session.name} (${sessionId})`);
  }

  /**
   * Reject a shadow file: remove it from the virtual filesystem.
   */
  public async rejectFile(
    sessionId: string,
    filePath: string
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const shadowFile = session.files.get(filePath);

    if (!shadowFile) {
      throw new Error(`File not found in session: ${filePath}`);
    }

    // Remove from virtual filesystem
    try {
      this.fsProvider.delete(shadowFile.shadowUri);
    } catch {
      // Already removed
    }

    shadowFile.status = ShadowFileStatus.REJECTED;
    shadowFile.modifiedAt = Date.now();

    this.emitEvent({
      type: 'fileRejected',
      sessionId,
      filePath,
      data: null,
    });

    this.logger.info(`[ShadowWS] Rejected file: ${filePath}`);
  }

  /**
   * Reject all files in a session and mark the session as discarded.
   */
  public async rejectAll(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);

    for (const [filePath, shadowFile] of session.files) {
      if (
        shadowFile.status === ShadowFileStatus.PENDING ||
        shadowFile.status === ShadowFileStatus.EDITED
      ) {
        await this.rejectFile(sessionId, filePath);
      }
    }

    session.status = 'discarded';
    this.clearExpiryTimer(sessionId);

    this.emitEvent({
      type: 'sessionDiscarded',
      sessionId,
      filePath: null,
      data: null,
    });

    this.logger.info(`[ShadowWS] Discarded session: ${session.name} (${sessionId})`);
  }

  // ────────────────────────────────────────────
  // Edit
  // ────────────────────────────────────────────

  /**
   * Update the shadow content of a file and mark it as edited.
   */
  public async editShadowFile(
    sessionId: string,
    filePath: string,
    newContent: string
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const shadowFile = session.files.get(filePath);

    if (!shadowFile) {
      throw new Error(`File not found in session: ${filePath}`);
    }

    shadowFile.content = newContent;
    shadowFile.status = ShadowFileStatus.EDITED;
    shadowFile.modifiedAt = Date.now();

    // Update in virtual filesystem
    const encoder = new TextEncoder();
    this.fsProvider.writeFile(shadowFile.shadowUri, encoder.encode(newContent), {
      create: true,
      overwrite: true,
    });

    this.emitEvent({
      type: 'fileModified',
      sessionId,
      filePath,
      data: { edited: true },
    });
  }

  // ────────────────────────────────────────────
  // Checkpoints
  // ────────────────────────────────────────────

  /**
   * Create a checkpoint capturing the current state of all files in the session.
   */
  public async createCheckpoint(
    sessionId: string,
    description: string
  ): Promise<ShadowCheckpoint> {
    const session = this.requireSession(sessionId);

    const snapshot = new Map<string, string>();
    for (const [filePath, shadowFile] of session.files) {
      snapshot.set(filePath, shadowFile.content);
    }

    const checkpoint: ShadowCheckpoint = {
      id: this.generateId(),
      timestamp: Date.now(),
      description,
      snapshot,
    };

    session.checkpoints.push(checkpoint);

    this.emitEvent({
      type: 'checkpointCreated',
      sessionId,
      filePath: null,
      data: { checkpointId: checkpoint.id, description },
    });

    this.logger.debug(`[ShadowWS] Created checkpoint: ${description} in session ${sessionId}`);
    return checkpoint;
  }

  /**
   * Restore all files in a session to the state captured in a checkpoint.
   */
  public async restoreCheckpoint(
    sessionId: string,
    checkpointId: string
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const checkpoint = session.checkpoints.find((cp) => cp.id === checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const encoder = new TextEncoder();

    for (const [filePath, content] of checkpoint.snapshot) {
      const shadowFile = session.files.get(filePath);
      if (shadowFile) {
        shadowFile.content = content;
        shadowFile.modifiedAt = Date.now();
        shadowFile.status = ShadowFileStatus.PENDING;

        this.fsProvider.writeFile(
          shadowFile.shadowUri,
          encoder.encode(content),
          { create: true, overwrite: true }
        );
      }
    }

    this.logger.info(`[ShadowWS] Restored checkpoint: ${checkpoint.description} in session ${sessionId}`);
  }

  // ────────────────────────────────────────────
  // Stats
  // ────────────────────────────────────────────

  /**
   * Get statistics for a session: file counts by status and total line changes.
   */
  public getSessionStats(sessionId: string): {
    totalFiles: number;
    pending: number;
    accepted: number;
    rejected: number;
    edited: number;
    conflict: number;
    linesAdded: number;
    linesRemoved: number;
    linesChanged: number;
  } {
    const session = this.requireSession(sessionId);
    const stats = {
      totalFiles: session.files.size,
      pending: 0,
      accepted: 0,
      rejected: 0,
      edited: 0,
      conflict: 0,
      linesAdded: 0,
      linesRemoved: 0,
      linesChanged: 0,
    };

    for (const shadowFile of session.files.values()) {
      switch (shadowFile.status) {
        case ShadowFileStatus.PENDING:
          stats.pending++;
          break;
        case ShadowFileStatus.ACCEPTED:
          stats.accepted++;
          break;
        case ShadowFileStatus.REJECTED:
          stats.rejected++;
          break;
        case ShadowFileStatus.EDITED:
          stats.edited++;
          break;
        case ShadowFileStatus.CONFLICT:
          stats.conflict++;
          break;
      }
    }

    const diffs = this.getAllDiffs(sessionId);
    for (const diff of diffs) {
      stats.linesAdded += diff.linesAdded;
      stats.linesRemoved += diff.linesRemoved;
      stats.linesChanged += diff.linesChanged;
    }

    return stats;
  }

  // ────────────────────────────────────────────
  // Private Helpers
  // ────────────────────────────────────────────

  /**
   * Start an expiry timer for a session.
   * Warns 5 minutes before expiry, then discards the session.
   */
  private startExpiryTimer(session: ShadowSession): void {
    const config = this.getConfig();
    const expiryMs = config.autoExpireMinutes * 60 * 1000;

    // Warn 5 minutes before expiry (or at half-time if session is shorter)
    const warningMs = Math.max(expiryMs - 5 * 60 * 1000, expiryMs / 2);

    const warningTimer = setTimeout(() => {
      const currentSession = this.sessions.get(session.id);
      if (currentSession && currentSession.status === 'active') {
        vscode.window.showWarningMessage(
          `Shadow session "${session.name}" will expire in ${Math.round((expiryMs - warningMs) / 60000)} minutes. Accept or reject changes to keep them.`,
          'Accept All',
          'Extend',
          'Dismiss'
        ).then((action) => {
          if (action === 'Accept All') {
            this.acceptAll(session.id);
          } else if (action === 'Extend') {
            this.clearExpiryTimer(session.id);
            currentSession.expiresAt = Date.now() + expiryMs;
            this.startExpiryTimer(currentSession);
          }
        });
      }
    }, warningMs);

    const expiryTimer = setTimeout(() => {
      const currentSession = this.sessions.get(session.id);
      if (currentSession && currentSession.status === 'active') {
        currentSession.status = 'expired';
        this.rejectAll(session.id).catch((err) => {
          this.logger.error(`[ShadowWS] Error expiring session: ${err}`);
        });
        vscode.window.showInformationMessage(
          `Shadow session "${session.name}" has expired and was discarded.`
        );
      }
    }, expiryMs);

    // Store the expiry timer (we use a combined timeout approach)
    this.expiryTimers.set(session.id, expiryTimer);

    // Also track the warning timer for cleanup
    const warningKey = `${session.id}:warning`;
    this.expiryTimers.set(warningKey, warningTimer);
  }

  /**
   * Clear expiry timers for a session.
   */
  private clearExpiryTimer(sessionId: string): void {
    const timer = this.expiryTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(sessionId);
    }
    const warningTimer = this.expiryTimers.get(`${sessionId}:warning`);
    if (warningTimer) {
      clearTimeout(warningTimer);
      this.expiryTimers.delete(`${sessionId}:warning`);
    }
  }

  /**
   * Evict the oldest non-active session to make room for a new one.
   */
  private evictOldestSession(): void {
    const sessions = this.listSessions();
    const evictable = sessions
      .filter((s) => s.status !== 'active')
      .sort((a, b) => a.createdAt - b.createdAt);

    if (evictable.length > 0) {
      const toEvict = evictable[0];
      this.sessions.delete(toEvict.id);
      this.clearExpiryTimer(toEvict.id);
      this.logger.info(`[ShadowWS] Evicted session: ${toEvict.name} (${toEvict.id})`);
    }
  }

  /**
   * Simple line-based diff algorithm.
   * Compares original and modified content line by line and returns DiffHunk[].
   */
  private computeLineDiff(original: string, modified: string): DiffHunk[] {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');
    const hunks: DiffHunk[] = [];

    let i = 0;
    let j = 0;

    while (i < origLines.length || j < modLines.length) {
      // Skip matching lines
      if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
        i++;
        j++;
        continue;
      }

      // Found a difference — collect the hunk
      const startOrig = i;
      const startMod = j;
      const origHunkLines: string[] = [];
      const modHunkLines: string[] = [];

      // Advance through differing lines until we find a match or reach the end
      while (i < origLines.length || j < modLines.length) {
        if (i < origLines.length && j < modLines.length && origLines[i] === modLines[j]) {
          break;
        }

        // Try to find the current original line ahead in modified
        let foundInMod = false;
        if (i < origLines.length) {
          for (let lookAhead = j; lookAhead < Math.min(j + 5, modLines.length); lookAhead++) {
            if (origLines[i] === modLines[lookAhead]) {
              // Collect inserted lines
              while (j < lookAhead) {
                modHunkLines.push(modLines[j]);
                j++;
              }
              foundInMod = true;
              break;
            }
          }
        }

        if (foundInMod) {
          break;
        }

        // Try to find the current modified line ahead in original
        let foundInOrig = false;
        if (j < modLines.length) {
          for (let lookAhead = i; lookAhead < Math.min(i + 5, origLines.length); lookAhead++) {
            if (modLines[j] === origLines[lookAhead]) {
              // Collect deleted lines
              while (i < lookAhead) {
                origHunkLines.push(origLines[i]);
                i++;
              }
              foundInOrig = true;
              break;
            }
          }
        }

        if (foundInOrig) {
          break;
        }

        // No match found in look-ahead — both lines are changed
        if (i < origLines.length) {
          origHunkLines.push(origLines[i]);
          i++;
        }
        if (j < modLines.length) {
          modHunkLines.push(modLines[j]);
          j++;
        }
      }

      if (origHunkLines.length > 0 || modHunkLines.length > 0) {
        hunks.push({
          startLineOriginal: startOrig + 1,
          endLineOriginal: startOrig + Math.max(origHunkLines.length, 1),
          startLineModified: startMod + 1,
          endLineModified: startMod + Math.max(modHunkLines.length, 1),
          originalContent: origHunkLines.join('\n'),
          modifiedContent: modHunkLines.join('\n'),
        });
      }
    }

    return hunks;
  }

  /**
   * Get a session or throw if not found / not active.
   */
  private requireSession(sessionId: string): ShadowSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Shadow session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Generate a unique ID for sessions and checkpoints.
   */
  private generateId(): string {
    return `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Get the shadow config from VS Code settings, falling back to defaults.
   */
  private getConfig(): ShadowConfig {
    const vsConfig = vscode.workspace.getConfiguration('inaCoding.shadow');
    return {
      enabled: vsConfig.get('enabled', DEFAULT_SHADOW_CONFIG.enabled),
      autoExpireMinutes: vsConfig.get('autoExpireMinutes', DEFAULT_SHADOW_CONFIG.autoExpireMinutes),
      showInExplorer: vsConfig.get('showInExplorer', DEFAULT_SHADOW_CONFIG.showInExplorer),
      requireConfirmation: vsConfig.get('requireConfirmation', DEFAULT_SHADOW_CONFIG.requireConfirmation),
      autoCreateCheckpoints: vsConfig.get('autoCreateCheckpoints', DEFAULT_SHADOW_CONFIG.autoCreateCheckpoints),
      maxSessions: vsConfig.get('maxSessions', DEFAULT_SHADOW_CONFIG.maxSessions),
    };
  }

  /**
   * Emit a typed event to listeners.
   */
  private emitEvent(event: ShadowWorkspaceEvent): void {
    this.emit(event.type, event);
    this.emit('*', event);
  }

  /**
   * Dispose of all resources: timers, sessions, and the filesystem provider.
   */
  public dispose(): void {
    for (const timer of this.expiryTimers.values()) {
      clearTimeout(timer);
    }
    this.expiryTimers.clear();
    this.sessions.clear();
    this.activeSessionId = null;
    this.removeAllListeners();
    ShadowWorkspaceManager.instance = null;

    this.logger.info('[ShadowWS] Disposed ShadowWorkspaceManager');
  }
}
