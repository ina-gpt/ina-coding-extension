/**
 * Multi-Cursor Edit Controller
 *
 * Orchestrates the entire multi-cursor edit flow.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { MultiCursorEditService } from '../services/multicursor/MultiCursorEditService';
import { MultiCursorDiffManager } from '../services/multicursor/MultiCursorDiffManager';
import { MultiCursorApplicator } from '../services/multicursor/MultiCursorApplicator';
import { MultiCursorCodeLensProvider } from '../providers/MultiCursorCodeLensProvider';
import { MultiCursorProgressWidget } from '../widgets/MultiCursorProgressWidget';
import {
  MultiCursorSession, MultiCursorEditMode, MultiCursorStatus,
} from '../services/multicursor/MultiCursorTypes';

// ============ Multi-Cursor Edit Controller ============

export class MultiCursorEditController implements vscode.Disposable {
  private multiCursorService: MultiCursorEditService;
  private diffManager: MultiCursorDiffManager;
  private codeLensProvider: MultiCursorCodeLensProvider;
  private progressWidget: MultiCursorProgressWidget;
  private applicator: MultiCursorApplicator;
  private disposables: vscode.Disposable[] = [];
  private currentNavigationIndex: number = 0;

  constructor(
    multiCursorService: MultiCursorEditService,
    diffManager: MultiCursorDiffManager,
    codeLensProvider: MultiCursorCodeLensProvider,
    progressWidget: MultiCursorProgressWidget
  ) {
    this.multiCursorService = multiCursorService;
    this.diffManager = diffManager;
    this.codeLensProvider = codeLensProvider;
    this.progressWidget = progressWidget;
    this.applicator = MultiCursorApplicator.getInstance();

    // Listen to progress
    this.disposables.push(
      multiCursorService.onProgress(progress => {
        this.progressWidget.updateProgress(progress);
      })
    );

    // Listen to session updates
    this.disposables.push(
      multiCursorService.onSessionUpdate(session => {
        this.handleSessionUpdate(session);
      })
    );
  }

  // ============ Trigger ============

  async triggerMultiCursorEdit(editor: vscode.TextEditor): Promise<void> {
    if (!editor || editor.selections.length < 2) {
      vscode.window.showInformationMessage('Place multiple cursors first (Cmd+Click or Cmd+D), then press Cmd+Shift+K');
      return;
    }

    // Show mode selection
    const mode = await this.showModeSelection();
    if (!mode) return;

    try {
      // Start session
      const session = await this.multiCursorService.startMultiCursorEdit(editor, mode);

      // Show progress
      this.progressWidget.showProgress(session);
      this.progressWidget.createMinimap(editor, session.cursors);

      // Set context
      vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorPreviewActive', true);

      // Get prompt from user
      const prompt = await vscode.window.showInputBox({
        prompt: `Edit ${session.cursors.length} selections with AI (${mode} mode)`,
        placeHolder: 'Enter your edit instruction...',
        ignoreFocusOut: true,
      });

      if (!prompt) {
        this.multiCursorService.cancelSession(session.id);
        this.cleanupSession(session.id);
        return;
      }

      // Generate edits
      await this.handlePromptReceived(session, prompt);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start multi-cursor edit';
      vscode.window.showErrorMessage(`INA Coding: ${message}`);
      Logger.error('Multi-cursor trigger failed:', error);
    }
  }

  // ============ Prompt Handling ============

  async handlePromptReceived(session: MultiCursorSession, prompt: string): Promise<void> {
    try {
      await this.multiCursorService.generateEditsForSession(session, prompt);

      // Show diff previews
      this.diffManager.showAllDiffPreviews(session.editor, session);
      this.codeLensProvider.setSession(session);

      // Auto-accept in identical mode if configured
      const autoAccept = vscode.workspace.getConfiguration('inaCoding.multiCursor')
        .get<boolean>('autoAcceptIdentical', false);

      if (autoAccept && session.mode === MultiCursorEditMode.IDENTICAL) {
        await this.acceptAll(session.id);
      }

    } catch (error) {
      this.progressWidget.showError('Generation failed');
      Logger.error('Multi-cursor generation failed:', error);
    }
  }

  // ============ Accept / Reject ============

  async acceptAll(sessionId: string): Promise<void> {
    const session = this.multiCursorService.getSession(sessionId);
    if (!session) return;

    this.multiCursorService.acceptAllEdits(sessionId);

    // Apply atomically
    session.status = MultiCursorStatus.APPLYING;
    const success = await this.applicator.applyAllEdits(session.editor, session);

    if (success) {
      session.status = MultiCursorStatus.COMPLETE;
      const result = this.multiCursorService.getEditResult(sessionId);
      if (result) {
        this.progressWidget.showComplete(result);
      }
    } else {
      this.progressWidget.showError('Failed to apply edits');
    }

    this.cleanupSession(sessionId);
    Logger.info(`Multi-cursor accept all: ${sessionId}`);
  }

  async rejectAll(sessionId: string): Promise<void> {
    const session = this.multiCursorService.getSession(sessionId);
    if (!session) return;

    this.multiCursorService.rejectAllEdits(sessionId);
    this.cleanupSession(sessionId);
    Logger.info(`Multi-cursor reject all: ${sessionId}`);
  }

  async acceptOne(sessionId: string, cursorId: string): Promise<void> {
    const session = this.multiCursorService.getSession(sessionId);
    if (!session) return;

    this.multiCursorService.acceptCursorEdit(sessionId, cursorId);

    const cursor = session.cursors.find(c => c.id === cursorId);
    if (cursor) {
      this.diffManager.showCursorAccepted(session.editor, cursorId, cursor);
    }

    this.codeLensProvider.refresh();

    // Check if all resolved
    if (this.allCursorsResolved(session)) {
      await this.finalizeSession(sessionId);
    }
  }

  async rejectOne(sessionId: string, cursorId: string): Promise<void> {
    const session = this.multiCursorService.getSession(sessionId);
    if (!session) return;

    this.multiCursorService.rejectCursorEdit(sessionId, cursorId);

    const cursor = session.cursors.find(c => c.id === cursorId);
    if (cursor) {
      this.diffManager.showCursorRejected(session.editor, cursorId, cursor);
    }

    this.codeLensProvider.refresh();

    if (this.allCursorsResolved(session)) {
      await this.finalizeSession(sessionId);
    }
  }

  // ============ Navigation ============

  navigateCursor(direction: 'next' | 'prev'): void {
    const session = this.multiCursorService.getActiveSession();
    if (!session) return;

    const count = session.cursors.length;
    if (count === 0) return;

    if (direction === 'next') {
      this.currentNavigationIndex = (this.currentNavigationIndex + 1) % count;
    } else {
      this.currentNavigationIndex = (this.currentNavigationIndex - 1 + count) % count;
    }

    const cursor = session.cursors[this.currentNavigationIndex];
    this.diffManager.navigateToCursor(session.editor, cursor.id, cursor);
  }

  // ============ Retry ============

  async retryFailed(sessionId: string): Promise<void> {
    const session = this.multiCursorService.getSession(sessionId);
    if (!session) return;

    const errorCursors = session.cursors.filter(c => {
      const edit = session.edits.get(c.id);
      return edit?.status === 'error';
    });

    if (errorCursors.length === 0) {
      vscode.window.showInformationMessage('No failed edits to retry');
      return;
    }

    this.progressWidget.showGenerating(1, errorCursors.length);

    // Re-generate for each failed cursor
    for (const cursor of errorCursors) {
      const edit = session.edits.get(cursor.id);
      if (edit) {
        edit.status = 'pending';
        edit.error = null;
      }
    }

    await this.multiCursorService.generateEditsForSession(session, session.prompt);
    this.diffManager.showAllDiffPreviews(session.editor, session);
    this.codeLensProvider.refresh();
  }

  // ============ Mode Selection ============

  async showModeSelection(): Promise<MultiCursorEditMode | undefined> {
    const items: Array<vscode.QuickPickItem & { mode: MultiCursorEditMode }> = [
      {
        label: '$(zap) Identical Edit',
        description: 'Same edit for all cursors (fastest)',
        detail: 'Generate once, clone to all. Best for same-pattern changes.',
        mode: MultiCursorEditMode.IDENTICAL,
      },
      {
        label: '$(lightbulb) Contextual Edit',
        description: 'Adapt edit to each cursor\'s context (smarter)',
        detail: 'Generate per cursor in parallel. Best for varied contexts.',
        mode: MultiCursorEditMode.CONTEXTUAL,
      },
      {
        label: '$(list-ordered) Sequential Edit',
        description: 'Generate one by one (most control)',
        detail: 'Generate and review each cursor sequentially.',
        mode: MultiCursorEditMode.SEQUENTIAL,
      },
    ];

    const defaultMode = vscode.workspace.getConfiguration('inaCoding.multiCursor')
      .get<string>('defaultMode', 'identical');

    // Sort default first
    items.sort((a, b) => {
      if (a.mode === defaultMode) return -1;
      if (b.mode === defaultMode) return 1;
      return 0;
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select multi-cursor edit mode',
      title: 'INA Multi-Cursor Edit',
    });

    return selected?.mode;
  }

  // ============ Private Helpers ============

  private handleSessionUpdate(session: MultiCursorSession): void {
    const hasErrors = Array.from(session.edits.values()).some(e => e.status === 'error');
    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorHasErrors', hasErrors);
    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorGenerating',
      session.status === MultiCursorStatus.GENERATING);
  }

  private allCursorsResolved(session: MultiCursorSession): boolean {
    for (const [, edit] of session.edits) {
      if (edit.status === 'pending') return false;
    }
    return true;
  }

  private async finalizeSession(sessionId: string): Promise<void> {
    const session = this.multiCursorService.getSession(sessionId);
    if (!session) return;

    // Apply accepted edits
    const hasAccepted = Array.from(session.edits.values()).some(e => e.status === 'accepted');
    if (hasAccepted) {
      session.status = MultiCursorStatus.APPLYING;
      await this.applicator.applyAllEdits(session.editor, session);
    }

    session.status = MultiCursorStatus.COMPLETE;
    const result = this.multiCursorService.getEditResult(sessionId);
    if (result) {
      this.progressWidget.showComplete(result);
    }

    this.cleanupSession(sessionId);
  }

  private cleanupSession(sessionId: string): void {
    const session = this.multiCursorService.getSession(sessionId);
    if (session) {
      this.diffManager.clearAllPreviews(session.editor);
    }

    this.codeLensProvider.setSession(null);
    this.progressWidget.hide();
    this.multiCursorService.removeSession(sessionId);
    this.currentNavigationIndex = 0;

    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorPreviewActive', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorGenerating', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.multiCursorHasErrors', false);
  }

  // ============ Dispose ============

  dispose(): void {
    const active = this.multiCursorService.getActiveSession();
    if (active) {
      this.cleanupSession(active.id);
    }

    this.multiCursorService.dispose();
    this.diffManager.dispose();
    this.progressWidget.dispose();

    for (const d of this.disposables) d.dispose();
  }
}
