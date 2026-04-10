/**
 * Inline Edit Input Controller
 *
 * Orchestrates the input flow for inline edit.
 */

import * as vscode from 'vscode';
import { InlineEditService, InlineEditSession } from '../services/InlineEditService';
import { InlineEditHistory } from '../services/InlineEditHistory';
import { InlineEditInputWidget } from '../widgets/InlineEditInputWidget';
import { InlineEditOverlay } from '../widgets/InlineEditOverlay';
import { InlineEditStatusBar } from '../widgets/InlineEditStatusBar';
import { enhancePrompt, detectPromptIntent } from '../utils/promptEnhancer';
import { Logger } from '../utils/Logger';

// ============ Controller ============

export class InlineEditInputController implements vscode.Disposable {
  private editService: InlineEditService;
  private history: InlineEditHistory;
  private currentWidget: InlineEditInputWidget | null = null;
  private overlay: InlineEditOverlay;
  private statusBar: InlineEditStatusBar;
  private disposables: vscode.Disposable[] = [];

  // Events
  private onInputAcceptedEmitter = new vscode.EventEmitter<{ session: InlineEditSession; prompt: string }>();
  private onInputCancelledEmitter = new vscode.EventEmitter<InlineEditSession>();
  private onActionSelectedEmitter = new vscode.EventEmitter<{ session: InlineEditSession; action: string }>();

  readonly onInputAccepted = this.onInputAcceptedEmitter.event;
  readonly onInputCancelled = this.onInputCancelledEmitter.event;
  readonly onActionSelected = this.onActionSelectedEmitter.event;

  constructor(editService: InlineEditService, history: InlineEditHistory) {
    this.editService = editService;
    this.history = history;
    this.overlay = InlineEditOverlay.getInstance();
    this.statusBar = InlineEditStatusBar.getInstance();
  }

  // ============ Input Flow ============

  async startInput(session: InlineEditSession): Promise<{ prompt: string; action: string } | undefined> {
    // Show overlay at selection
    const range = new vscode.Range(
      session.context.selection.start,
      session.context.selection.end
    );
    this.overlay.showInputIndicator(session.editor, range);

    // Update status bar
    this.statusBar.show('input');

    // Set context for keybindings
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditActive', true);

    // Create and show input widget
    this.currentWidget = new InlineEditInputWidget(session, this.history);

    try {
      const prompt = await this.currentWidget.show();

      if (prompt) {
        this.handleInputAccepted(prompt, session);
        return { prompt, action: detectPromptIntent(prompt) };
      } else {
        this.handleInputCancelled(session);
        return undefined;
      }
    } catch (error) {
      Logger.error('Input flow error:', error);
      this.handleInputCancelled(session);
      return undefined;
    }
  }

  cancelInput(): void {
    if (this.currentWidget) {
      this.currentWidget.hide();
      this.currentWidget.dispose();
      this.currentWidget = null;
    }

    this.overlay.hide();
    this.statusBar.hide();
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditActive', false);
  }

  // ============ Handlers ============

  private handleInputAccepted(prompt: string, session: InlineEditSession): void {
    // Enhance prompt if enabled
    const enhanceEnabled = vscode.workspace.getConfiguration('inaCoding.inlineEdit')
      .get<boolean>('enhancePrompts', true);

    const finalPrompt = enhanceEnabled
      ? enhancePrompt(prompt, session.context)
      : prompt;

    // Add to history
    const rememberHistory = vscode.workspace.getConfiguration('inaCoding.inlineEdit')
      .get<boolean>('rememberHistory', true);

    if (rememberHistory) {
      this.history.addEntry({
        prompt,
        language: session.context.language,
        accepted: true,
        editType: InlineEditHistory.categorizePrompt(prompt),
      });
    }

    // Update session
    this.editService.updateSession(session.id, {
      prompt: finalPrompt,
      status: 'generating',
    });

    // Update UI
    this.showGeneratingState(session);

    // Emit event
    this.onInputAcceptedEmitter.fire({ session, prompt: finalPrompt });

    // Cleanup widget
    this.currentWidget?.dispose();
    this.currentWidget = null;

    Logger.info(`Input accepted for session ${session.id}: "${prompt}"`);
  }

  private handleInputCancelled(session: InlineEditSession): void {
    this.overlay.hide();
    this.statusBar.hide();

    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditActive', false);

    this.editService.endSession(session.id, 'rejected');
    this.onInputCancelledEmitter.fire(session);

    this.currentWidget?.dispose();
    this.currentWidget = null;

    Logger.debug(`Input cancelled for session ${session.id}`);
  }

  // ============ State Updates ============

  showGeneratingState(session: InlineEditSession): void {
    const range = new vscode.Range(
      session.context.selection.start,
      session.context.selection.end
    );

    this.overlay.showGeneratingIndicator(session.editor, range);
    this.statusBar.show('generating');

    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditGenerating', true);
  }

  showPreviewState(): void {
    this.overlay.hide();
    this.statusBar.show('preview');

    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditGenerating', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditPreview', true);
  }

  hideAll(): void {
    this.overlay.hide();
    this.statusBar.hide();

    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditActive', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditGenerating', false);
    vscode.commands.executeCommand('setContext', 'inaCoding.inlineEditPreview', false);
  }

  // ============ Dispose ============

  dispose(): void {
    this.cancelInput();
    this.onInputAcceptedEmitter.dispose();
    this.onInputCancelledEmitter.dispose();
    this.onActionSelectedEmitter.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
