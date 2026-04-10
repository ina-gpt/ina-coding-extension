import * as vscode from 'vscode';
import { GhostTextSessionManager } from './GhostTextSessionManager';
import { GhostTextRenderer } from './GhostTextRenderer';
import { GhostTextConfig, GhostTextSession } from './GhostTextTypes';

export class GhostTextDismisser implements vscode.Disposable {
  private sessionManager: GhostTextSessionManager;
  private renderer: GhostTextRenderer;
  private config: GhostTextConfig;
  private documentChangeListener: vscode.Disposable | null = null;
  private cursorChangeListener: vscode.Disposable | null = null;

  constructor(
    sessionManager: GhostTextSessionManager,
    renderer: GhostTextRenderer,
    config: GhostTextConfig
  ) {
    this.sessionManager = sessionManager;
    this.renderer = renderer;
    this.config = config;
  }

  setupListeners(editor: vscode.TextEditor): void {
    this.removeListeners();

    this.documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === editor.document) {
        this.handleDocumentChange(event, editor);
      }
    });

    this.cursorChangeListener = vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === editor) {
        this.handleCursorMove(event);
      }
    });
  }

  dismiss(
    editor: vscode.TextEditor,
    reason: 'escape' | 'edit' | 'cursor_move' | 'timeout' | 'manual'
  ): void {
    this.renderer.hide(editor, reason === 'escape');
    this.renderer.hideCycleIndicator(editor);
    this.sessionManager.endSession('dismissed');
    this.removeListeners();

    vscode.commands.executeCommand('setContext', 'inaCoding.ghostTextVisible', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.hasMultipleCompletions', false);
  }

  handleDocumentChange(
    event: vscode.TextDocumentChangeEvent,
    editor: vscode.TextEditor
  ): void {
    const session = this.sessionManager.getActiveSession();
    if (!session) return;

    for (const change of event.contentChanges) {
      if (this.shouldDismissOnEdit(change, session)) {
        this.dismiss(editor, 'edit');
        return;
      }
    }
  }

  handleCursorMove(event: vscode.TextEditorSelectionChangeEvent): void {
    const session = this.sessionManager.getActiveSession();
    if (!session) return;

    const newPosition = event.selections[0].active;
    if (this.shouldDismissOnCursorMove(newPosition, session)) {
      this.dismiss(event.textEditor, 'cursor_move');
    }
  }

  handleEscapeKey(editor: vscode.TextEditor): void {
    this.dismiss(editor, 'escape');
  }

  shouldDismissOnEdit(
    change: vscode.TextDocumentContentChangeEvent,
    session: GhostTextSession
  ): boolean {
    if (!this.config.dismissOnEdit) return false;

    // If editing at the ghost text position, dismiss
    if (change.range.start.line === session.position.line) {
      return true;
    }

    // If editing elsewhere, dismiss based on config
    return this.config.dismissOnEdit;
  }

  shouldDismissOnCursorMove(
    newPosition: vscode.Position,
    session: GhostTextSession
  ): boolean {
    if (!this.config.dismissOnCursorMove) return false;

    // Allow cursor to be on the same line
    if (newPosition.line === session.position.line) {
      return false;
    }

    // If partial accept is in progress, allow cursor within the accepted range
    if (session.partialAcceptPosition > 0) {
      const item = session.items[session.currentIndex];
      if (item) {
        const completionLines = item.fullText.split('\n').length;
        if (newPosition.line <= session.position.line + completionLines) {
          return false;
        }
      }
    }

    return true;
  }

  removeListeners(): void {
    if (this.documentChangeListener) {
      this.documentChangeListener.dispose();
      this.documentChangeListener = null;
    }
    if (this.cursorChangeListener) {
      this.cursorChangeListener.dispose();
      this.cursorChangeListener = null;
    }
  }

  updateConfig(config: Partial<GhostTextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  dispose(): void {
    this.removeListeners();
  }
}
