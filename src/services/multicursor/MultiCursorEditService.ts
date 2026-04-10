/**
 * Multi-Cursor Edit Service
 *
 * Main service orchestrating multi-cursor edit operations.
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../utils/Logger';
import { EditGenerationClient } from '../EditGenerationClient';
import { MultiCursorDetector } from './MultiCursorDetector';
import {
  MultiCursorSession, MultiCursorEditMode, MultiCursorStatus,
  CursorEdit, CursorPosition, MultiCursorEditResult, MultiCursorProgress,
} from './MultiCursorTypes';

// ============ Multi-Cursor Edit Service ============

export class MultiCursorEditService implements vscode.Disposable {
  private activeSessions: Map<string, MultiCursorSession> = new Map();
  private detector: MultiCursorDetector;
  private editGenerator: EditGenerationClient;
  private disposables: vscode.Disposable[] = [];

  private onSessionUpdateEmitter = new vscode.EventEmitter<MultiCursorSession>();
  private onProgressEmitter = new vscode.EventEmitter<MultiCursorProgress>();

  readonly onSessionUpdate = this.onSessionUpdateEmitter.event;
  readonly onProgress = this.onProgressEmitter.event;

  constructor() {
    this.detector = MultiCursorDetector.getInstance();
    this.editGenerator = new EditGenerationClient();
  }

  // ============ Session Management ============

  async startMultiCursorEdit(editor: vscode.TextEditor, mode: MultiCursorEditMode): Promise<MultiCursorSession> {
    const cursors = this.detector.detectCursors(editor);

    const validation = this.detector.validateCursors(cursors);
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    if (validation.warnings.length > 0) {
      vscode.window.showWarningMessage(`INA Coding: ${validation.warnings.join('; ')}`);
    }

    const session: MultiCursorSession = {
      id: uuidv4(),
      mode,
      cursors,
      prompt: '',
      status: MultiCursorStatus.DETECTING,
      edits: new Map(),
      originalSelections: [...editor.selections],
      editor,
      startTime: Date.now(),
    };

    // Initialize empty edits for each cursor
    for (const cursor of cursors) {
      session.edits.set(cursor.id, {
        cursorId: cursor.id,
        originalContent: cursor.content,
        generatedContent: '',
        diffResult: null,
        status: 'pending',
        error: null,
        tokens: 0,
        timing: 0,
      });
    }

    this.activeSessions.set(session.id, session);
    this.onSessionUpdateEmitter.fire(session);

    Logger.info(`Multi-cursor session started: ${session.id} (${cursors.length} cursors, mode: ${mode})`);
    return session;
  }

  // ============ Generation ============

  async generateEditsForSession(session: MultiCursorSession, prompt: string): Promise<void> {
    session.prompt = prompt;
    session.status = MultiCursorStatus.GENERATING;
    this.onSessionUpdateEmitter.fire(session);

    try {
      switch (session.mode) {
        case MultiCursorEditMode.IDENTICAL:
          await this.generateIdenticalEdit(session, prompt);
          break;
        case MultiCursorEditMode.CONTEXTUAL:
          await this.generateContextualEdits(session, prompt);
          break;
        case MultiCursorEditMode.SEQUENTIAL:
          await this.generateSequentialEdits(session, prompt);
          break;
      }

      session.status = MultiCursorStatus.PREVIEW;
    } catch (error) {
      Logger.error(`Multi-cursor generation failed for ${session.id}:`, error);
      session.status = MultiCursorStatus.IDLE;
    }

    this.onSessionUpdateEmitter.fire(session);
  }

  // ============ Identical Mode ============

  private async generateIdenticalEdit(session: MultiCursorSession, prompt: string): Promise<void> {
    const firstCursor = session.cursors[0];

    this.onProgressEmitter.fire({
      current: 1,
      total: session.cursors.length,
      currentCursorId: firstCursor.id,
      phase: 'generating',
      message: 'Generating edit (identical mode)...',
    });

    const startTime = Date.now();

    try {
      const response = await this.editGenerator.generateEdit({
        sessionId: session.id,
        selection: {
          content: firstCursor.content,
          startLine: firstCursor.lineNumber,
          endLine: firstCursor.selection.end.line,
          startColumn: firstCursor.column,
          endColumn: firstCursor.selection.end.character,
        },
        context: {
          filePath: vscode.workspace.asRelativePath(session.editor.document.uri),
          language: firstCursor.context.language,
          surroundingBefore: firstCursor.context.surroundingLines.slice(0, 5).join('\n'),
          surroundingAfter: firstCursor.context.surroundingLines.slice(5).join('\n'),
          indentation: firstCursor.context.indentation,
        },
        prompt,
      });

      const timing = Date.now() - startTime;

      // Clone result to all cursors, adjusting indentation
      for (const cursor of session.cursors) {
        const edit = session.edits.get(cursor.id);
        if (!edit) continue;

        let generatedContent = response.generatedContent;

        // Adjust indentation to match cursor
        if (cursor.context.indentation !== firstCursor.context.indentation) {
          generatedContent = this.adjustIndentation(
            generatedContent,
            firstCursor.context.indentation,
            cursor.context.indentation
          );
        }

        edit.generatedContent = generatedContent;
        edit.status = 'pending';
        edit.tokens = response.tokens.completion;
        edit.timing = timing;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Generation failed';
      for (const cursor of session.cursors) {
        const edit = session.edits.get(cursor.id);
        if (edit) {
          edit.status = 'error';
          edit.error = errorMsg;
        }
      }
    }
  }

  // ============ Contextual Mode ============

  private async generateContextualEdits(session: MultiCursorSession, prompt: string): Promise<void> {
    const maxParallel = vscode.workspace.getConfiguration('inaCoding.multiCursor')
      .get<number>('parallelGeneration', 3);

    // Process in batches
    for (let i = 0; i < session.cursors.length; i += maxParallel) {
      if (session.status === MultiCursorStatus.CANCELLED) break;

      const batch = session.cursors.slice(i, i + maxParallel);
      const promises = batch.map(cursor => this.generateSingleEdit(session, cursor, prompt));

      await Promise.allSettled(promises);

      this.onProgressEmitter.fire({
        current: Math.min(i + maxParallel, session.cursors.length),
        total: session.cursors.length,
        currentCursorId: batch[batch.length - 1].id,
        phase: 'generating',
        message: `Generated ${Math.min(i + maxParallel, session.cursors.length)}/${session.cursors.length} edits`,
      });
    }
  }

  // ============ Sequential Mode ============

  private async generateSequentialEdits(session: MultiCursorSession, prompt: string): Promise<void> {
    for (let i = 0; i < session.cursors.length; i++) {
      if (session.status === MultiCursorStatus.CANCELLED) break;

      const cursor = session.cursors[i];

      this.onProgressEmitter.fire({
        current: i + 1,
        total: session.cursors.length,
        currentCursorId: cursor.id,
        phase: 'generating',
        message: `Generating edit ${i + 1}/${session.cursors.length}...`,
      });

      await this.generateSingleEdit(session, cursor, prompt);
    }
  }

  // ============ Single Edit ============

  private async generateSingleEdit(session: MultiCursorSession, cursor: CursorPosition, prompt: string): Promise<void> {
    const edit = session.edits.get(cursor.id);
    if (!edit) return;

    const startTime = Date.now();

    try {
      const response = await this.editGenerator.generateEdit({
        sessionId: `${session.id}-${cursor.id}`,
        selection: {
          content: cursor.content,
          startLine: cursor.lineNumber,
          endLine: cursor.selection.end.line,
          startColumn: cursor.column,
          endColumn: cursor.selection.end.character,
        },
        context: {
          filePath: vscode.workspace.asRelativePath(session.editor.document.uri),
          language: cursor.context.language,
          surroundingBefore: cursor.context.beforeText + '\n' + cursor.context.surroundingLines.slice(0, 5).join('\n'),
          surroundingAfter: cursor.context.afterText + '\n' + cursor.context.surroundingLines.slice(5).join('\n'),
          indentation: cursor.context.indentation,
        },
        prompt,
      });

      edit.generatedContent = response.generatedContent;
      edit.status = 'pending';
      edit.tokens = response.tokens.completion;
      edit.timing = Date.now() - startTime;
    } catch (error) {
      edit.status = 'error';
      edit.error = error instanceof Error ? error.message : 'Generation failed';
      edit.timing = Date.now() - startTime;
    }
  }

  // ============ Accept / Reject ============

  acceptCursorEdit(sessionId: string, cursorId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const edit = session.edits.get(cursorId);
    if (edit) {
      edit.status = 'accepted';
      this.onSessionUpdateEmitter.fire(session);
    }
  }

  rejectCursorEdit(sessionId: string, cursorId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const edit = session.edits.get(cursorId);
    if (edit) {
      edit.status = 'rejected';
      this.onSessionUpdateEmitter.fire(session);
    }
  }

  acceptAllEdits(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    for (const [, edit] of session.edits) {
      if (edit.status === 'pending') {
        edit.status = 'accepted';
      }
    }

    this.onSessionUpdateEmitter.fire(session);
  }

  rejectAllEdits(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    for (const [, edit] of session.edits) {
      if (edit.status === 'pending' || edit.status === 'accepted') {
        edit.status = 'rejected';
      }
    }

    session.status = MultiCursorStatus.CANCELLED;
    this.onSessionUpdateEmitter.fire(session);
  }

  // ============ Results ============

  getEditResult(sessionId: string): MultiCursorEditResult | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const edits = Array.from(session.edits.values());
    const accepted = edits.filter(e => e.status === 'accepted').length;
    const rejected = edits.filter(e => e.status === 'rejected').length;
    const errors = edits.filter(e => e.status === 'error').length;

    return {
      sessionId,
      totalCursors: session.cursors.length,
      accepted,
      rejected,
      errors,
      edits,
      finalContent: '',
    };
  }

  // ============ Session Queries ============

  cancelSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = MultiCursorStatus.CANCELLED;
      this.activeSessions.delete(sessionId);
      this.onSessionUpdateEmitter.fire(session);
    }
  }

  getSession(sessionId: string): MultiCursorSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  getActiveSession(): MultiCursorSession | undefined {
    for (const [, session] of this.activeSessions) {
      if (session.status !== MultiCursorStatus.COMPLETE && session.status !== MultiCursorStatus.CANCELLED) {
        return session;
      }
    }
    return undefined;
  }

  removeSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  // ============ Helpers ============

  private adjustIndentation(code: string, fromIndent: string, toIndent: string): string {
    if (fromIndent === toIndent) return code;

    return code.split('\n').map(line => {
      if (line.startsWith(fromIndent)) {
        return toIndent + line.slice(fromIndent.length);
      }
      return line;
    }).join('\n');
  }

  // ============ Dispose ============

  dispose(): void {
    for (const [id] of this.activeSessions) {
      this.cancelSession(id);
    }
    this.onSessionUpdateEmitter.dispose();
    this.onProgressEmitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
