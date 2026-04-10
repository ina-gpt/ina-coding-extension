/**
 * Diff Preview Controller
 *
 * Main controller orchestrating the diff preview system.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { DiffCalculator, diffCalculator } from '../services/diff/DiffCalculator';
import { DiffDecorationManager } from '../services/diff/DiffDecorationManager';
import { InlineDiffRenderer } from '../services/diff/InlineDiffRenderer';
import { SideBySideDiffProvider } from '../services/diff/SideBySideDiffProvider';
import { PartialAcceptManager, partialAcceptManager } from '../services/diff/PartialAcceptManager';
import { EditBeforeAcceptManager } from '../services/diff/EditBeforeAcceptManager';
import { DiffCodeLensProvider } from '../providers/DiffCodeLensProvider';
import { DiffActionButtonsProvider } from '../providers/DiffActionButtonsProvider';
import { DiffLineActionProvider } from '../providers/DiffLineActionProvider';
import { DiffGutterProvider } from '../providers/DiffGutterProvider';
import { DiffPreviewState, DiffViewMode, DiffResult } from '../services/diff/DiffTypes';
import { InlineEditSession } from '../services/InlineEditService';

// ============ Diff Preview Controller ============

export class DiffPreviewController implements vscode.Disposable {
  private calculator: DiffCalculator;
  private decorationManager: DiffDecorationManager;
  private inlineRenderer: InlineDiffRenderer;
  private sideBySideProvider: SideBySideDiffProvider;
  private codeLensProvider: DiffCodeLensProvider;
  private actionButtonsProvider: DiffActionButtonsProvider;
  private lineActionProvider: DiffLineActionProvider;
  private gutterProvider: DiffGutterProvider;
  private partialAcceptMgr: PartialAcceptManager;
  private editManager: EditBeforeAcceptManager;

  private activePreviews: Map<string, DiffPreviewState> = new Map();
  private disposables: vscode.Disposable[] = [];

  // Events
  private onAcceptedEmitter = new vscode.EventEmitter<{ sessionId: string; content: string }>();
  private onRejectedEmitter = new vscode.EventEmitter<string>();

  readonly onAccepted = this.onAcceptedEmitter.event;
  readonly onRejected = this.onRejectedEmitter.event;

  constructor(
    codeLensProvider: DiffCodeLensProvider,
    lineActionProvider: DiffLineActionProvider,
    gutterProvider: DiffGutterProvider,
    storagePath: string
  ) {
    this.calculator = diffCalculator;
    this.decorationManager = DiffDecorationManager.getInstance();
    this.inlineRenderer = new InlineDiffRenderer();
    this.sideBySideProvider = new SideBySideDiffProvider(storagePath);
    this.codeLensProvider = codeLensProvider;
    this.actionButtonsProvider = new DiffActionButtonsProvider();
    this.lineActionProvider = lineActionProvider;
    this.gutterProvider = gutterProvider;
    this.partialAcceptMgr = partialAcceptManager;
    this.editManager = new EditBeforeAcceptManager();
  }

  // ============ Show Preview ============

  async showPreview(session: InlineEditSession): Promise<void> {
    if (!session.generatedContent) return;

    const original = session.originalContent;
    const modified = session.generatedContent;

    // Calculate diff
    const diffResult = this.calculator.calculateDiff(original, modified);

    // Create state
    const defaultViewMode = vscode.workspace.getConfiguration('inaCoding.diff')
      .get<string>('defaultViewMode', 'inline') === 'sideBySide'
      ? DiffViewMode.SIDE_BY_SIDE
      : DiffViewMode.INLINE;

    const state: DiffPreviewState = {
      sessionId: session.id,
      originalContent: original,
      modifiedContent: modified,
      currentContent: modified,
      diffResult,
      viewMode: defaultViewMode,
      selectedHunks: new Set(),
      appliedHunks: new Set(),
      isEditing: false,
      editedContent: null,
    };

    this.activePreviews.set(session.id, state);

    // Initialize partial accept
    this.partialAcceptMgr.initializeSession(session.id, diffResult);

    // Show based on view mode
    if (state.viewMode === DiffViewMode.INLINE) {
      await this.showInlinePreview(session.editor, state);
    } else {
      await this.showSideBySidePreview(session, state);
    }

    // Update providers
    this.codeLensProvider.setState(session.id, state);
    this.lineActionProvider.setActiveState(state);

    // Show action buttons
    const range = new vscode.Range(session.context.selection.start, session.context.selection.end);
    this.actionButtonsProvider.showActionButtons(session.editor, range, state);
    this.actionButtonsProvider.showStatusBarButtons();

    // Show gutter
    this.gutterProvider.showGutterIcons(session.editor, diffResult);

    // Set context keys
    vscode.commands.executeCommand('setContext', 'inaCoding.diffPreviewActive', true);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffHasMultipleHunks', diffResult.hunks.length > 1);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffCanPartialAccept', diffResult.hunks.length > 1);

    // Scroll to first change
    this.inlineRenderer.scrollToFirstChange(session.editor, diffResult);

    Logger.info(`Diff preview shown for ${session.id}: ${diffResult.additions} additions, ${diffResult.deletions} deletions`);
  }

  // ============ Accept / Reject ============

  async acceptAll(sessionId: string): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Apply modified content
    await this.applyChangesToDocument(editor, state.modifiedContent, state);

    // Animate
    await this.inlineRenderer.animateTransition(editor, state.originalContent, state.modifiedContent);

    // Emit and cleanup
    this.onAcceptedEmitter.fire({ sessionId, content: state.modifiedContent });
    this.cleanupPreview(sessionId);

    Logger.info(`All changes accepted for ${sessionId}`);
  }

  async rejectAll(sessionId: string): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    // Restore original (undo the preview replacement)
    await this.applyChangesToDocument(editor, state.originalContent, state);

    this.onRejectedEmitter.fire(sessionId);
    this.cleanupPreview(sessionId);

    Logger.info(`All changes rejected for ${sessionId}`);
  }

  async acceptHunk(sessionId: string, hunkId: string): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    this.partialAcceptMgr.acceptHunk(sessionId, hunkId);

    const hunk = state.diffResult.hunks.find(h => h.id === hunkId);
    if (hunk) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.decorationManager.showAcceptedHunk(editor, hunk);
      }
      hunk.applied = true;
      state.appliedHunks.add(hunkId);
    }

    this.codeLensProvider.refresh();

    // If all hunks handled, finalize
    if (this.allHunksResolved(state)) {
      await this.finalizePartialAccept(sessionId);
    }
  }

  async rejectHunk(sessionId: string, hunkId: string): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    this.partialAcceptMgr.rejectHunk(sessionId, hunkId);

    const hunk = state.diffResult.hunks.find(h => h.id === hunkId);
    if (hunk) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.decorationManager.showRejectedHunk(editor, hunk);
      }
      hunk.applied = true;
      state.appliedHunks.add(hunkId);
    }

    this.codeLensProvider.refresh();

    if (this.allHunksResolved(state)) {
      await this.finalizePartialAccept(sessionId);
    }
  }

  async acceptLine(sessionId: string, lineNumber: number): Promise<void> {
    this.partialAcceptMgr.acceptLine(sessionId, lineNumber);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.gutterProvider.updateGutterIcon(editor, lineNumber, 'accepted');
    }
  }

  async rejectLine(sessionId: string, lineNumber: number): Promise<void> {
    this.partialAcceptMgr.rejectLine(sessionId, lineNumber);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.gutterProvider.updateGutterIcon(editor, lineNumber, 'rejected');
    }
  }

  // ============ View Mode ============

  async toggleViewMode(sessionId: string): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    if (state.viewMode === DiffViewMode.INLINE) {
      state.viewMode = DiffViewMode.SIDE_BY_SIDE;
      this.decorationManager.clearAllDecorations(editor);
      this.gutterProvider.clearGutterIcons(editor);

      // Find session to get filename and language
      await this.sideBySideProvider.showSideBySideDiff(
        sessionId,
        state.originalContent,
        state.modifiedContent,
        'edit',
        'typescript'
      );
    } else {
      state.viewMode = DiffViewMode.INLINE;
      await this.sideBySideProvider.closeDiffEditor(sessionId);

      this.decorationManager.showInlineDiff(
        editor,
        state.diffResult,
        new vscode.Range(0, 0, editor.document.lineCount - 1, 0)
      );
      this.gutterProvider.showGutterIcons(editor, state.diffResult);
    }
  }

  // ============ Edit Mode ============

  async startEditMode(sessionId: string): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    state.isEditing = true;

    // Hide diff decorations
    this.decorationManager.clearAllDecorations(editor);
    this.gutterProvider.clearGutterIcons(editor);
    this.actionButtonsProvider.hideActionButtons(editor);
    this.actionButtonsProvider.hideStatusBarButtons();
    this.codeLensProvider.clearState(sessionId);

    // Get the range of the modified content
    const range = this.getCurrentRange(editor, state);

    await this.editManager.startEditing(sessionId, editor, state.modifiedContent, range);

    vscode.commands.executeCommand('setContext', 'inaCoding.diffEditing', true);
    Logger.info(`Edit mode started for ${sessionId}`);
  }

  async finishEditMode(sessionId: string, accept: boolean): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    if (accept) {
      const result = await this.editManager.finishEditing(sessionId);
      if (result) {
        state.editedContent = result.finalContent;
        this.onAcceptedEmitter.fire({ sessionId, content: result.finalContent });
        this.cleanupPreview(sessionId);
      }
    } else {
      await this.editManager.cancelEditing(sessionId);
      state.isEditing = false;

      // Restore preview
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.decorationManager.showInlineDiff(
          editor,
          state.diffResult,
          new vscode.Range(0, 0, editor.document.lineCount - 1, 0)
        );
        this.codeLensProvider.setState(sessionId, state);
        this.actionButtonsProvider.showStatusBarButtons();
      }
    }

    vscode.commands.executeCommand('setContext', 'inaCoding.diffEditing', false);
  }

  // ============ Navigation ============

  navigateToNextHunk(sessionId: string): void {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const currentLine = editor.selection.active.line;
    const nextHunk = state.diffResult.hunks.find(h => h.startLine > currentLine);

    if (nextHunk) {
      const position = new vscode.Position(nextHunk.startLine, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } else if (state.diffResult.hunks.length > 0) {
      // Wrap to first
      const first = state.diffResult.hunks[0];
      const position = new vscode.Position(first.startLine, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  }

  navigateToPrevHunk(sessionId: string): void {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const currentLine = editor.selection.active.line;
    const prevHunks = state.diffResult.hunks.filter(h => h.startLine < currentLine);

    if (prevHunks.length > 0) {
      const prev = prevHunks[prevHunks.length - 1];
      const position = new vscode.Position(prev.startLine, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    } else if (state.diffResult.hunks.length > 0) {
      // Wrap to last
      const last = state.diffResult.hunks[state.diffResult.hunks.length - 1];
      const position = new vscode.Position(last.startLine, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  }

  // ============ Queries ============

  getPreviewState(sessionId: string): DiffPreviewState | undefined {
    return this.activePreviews.get(sessionId);
  }

  isPreviewActive(sessionId: string): boolean {
    return this.activePreviews.has(sessionId);
  }

  // ============ Private Helpers ============

  private async showInlinePreview(editor: vscode.TextEditor, state: DiffPreviewState): Promise<void> {
    const range = new vscode.Range(0, 0, editor.document.lineCount - 1, 0);
    this.decorationManager.showInlineDiff(editor, state.diffResult, range);
  }

  private async showSideBySidePreview(session: InlineEditSession, state: DiffPreviewState): Promise<void> {
    await this.sideBySideProvider.showSideBySideDiff(
      session.id,
      state.originalContent,
      state.modifiedContent,
      session.context.filePath,
      session.context.language
    );
  }

  private async applyChangesToDocument(editor: vscode.TextEditor, content: string, state: DiffPreviewState): Promise<boolean> {
    const edit = new vscode.WorkspaceEdit();
    const range = this.getCurrentRange(editor, state);
    edit.replace(editor.document.uri, range, content);
    return vscode.workspace.applyEdit(edit);
  }

  private getCurrentRange(editor: vscode.TextEditor, state: DiffPreviewState): vscode.Range {
    // Use the full document range for now - the content was replaced in place
    const lastLine = editor.document.lineCount - 1;
    return new vscode.Range(0, 0, lastLine, editor.document.lineAt(lastLine).text.length);
  }

  private allHunksResolved(state: DiffPreviewState): boolean {
    return state.diffResult.hunks.every(h => h.applied);
  }

  private async finalizePartialAccept(sessionId: string): Promise<void> {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const finalContent = this.partialAcceptMgr.buildFinalContent(
      sessionId,
      state.originalContent,
      state.modifiedContent,
      state.diffResult
    );

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      await this.applyChangesToDocument(editor, finalContent, state);
    }

    this.onAcceptedEmitter.fire({ sessionId, content: finalContent });
    this.cleanupPreview(sessionId);
  }

  private cleanupPreview(sessionId: string): void {
    const state = this.activePreviews.get(sessionId);
    if (!state) return;

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.decorationManager.clearAllDecorations(editor);
      this.gutterProvider.clearGutterIcons(editor);
      this.actionButtonsProvider.hideActionButtons(editor);
    }

    this.actionButtonsProvider.hideStatusBarButtons();
    this.codeLensProvider.clearState(sessionId);
    this.lineActionProvider.setActiveState(null);
    this.partialAcceptMgr.clearSession(sessionId);
    this.sideBySideProvider.cleanupTempFiles(sessionId);

    this.activePreviews.delete(sessionId);

    vscode.commands.executeCommand('setContext', 'inaCoding.diffPreviewActive', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffEditing', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffHasMultipleHunks', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.diffCanPartialAccept', false);
  }

  // ============ Dispose ============

  dispose(): void {
    for (const [sessionId] of this.activePreviews) {
      this.cleanupPreview(sessionId);
    }

    this.inlineRenderer.dispose();
    this.sideBySideProvider.dispose();
    this.actionButtonsProvider.dispose();
    this.editManager.dispose();
    this.onAcceptedEmitter.dispose();
    this.onRejectedEmitter.dispose();

    for (const d of this.disposables) d.dispose();
  }
}
