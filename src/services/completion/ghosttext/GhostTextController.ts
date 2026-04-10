import * as vscode from 'vscode';
import { GhostTextRenderer } from './GhostTextRenderer';
import { GhostTextSessionManager } from './GhostTextSessionManager';
import { GhostTextAcceptor } from './GhostTextAcceptor';
import { GhostTextDismisser } from './GhostTextDismisser';
import { GhostTextCycler } from './GhostTextCycler';
import {
  GhostTextConfig,
  GhostTextItem,
  GhostTextMetrics,
  AcceptMode,
  CycleResult,
  DEFAULT_GHOST_TEXT_CONFIG,
} from './GhostTextTypes';
import { CompletionItem } from '../CompletionTypes';
import { Logger } from '../../../utils/Logger';

export class GhostTextController implements vscode.Disposable {
  private renderer: GhostTextRenderer;
  private sessionManager: GhostTextSessionManager;
  private acceptor: GhostTextAcceptor;
  private dismisser: GhostTextDismisser;
  private cycler: GhostTextCycler;
  private config: GhostTextConfig;
  private disposables: vscode.Disposable[] = [];

  private readonly onAcceptEmitter = new vscode.EventEmitter<{
    item: GhostTextItem;
    mode: AcceptMode;
    text: string;
  }>();
  private readonly onDismissEmitter = new vscode.EventEmitter<{
    item: GhostTextItem;
    reason: string;
  }>();
  private readonly onCycleEmitter = new vscode.EventEmitter<CycleResult>();

  public readonly onAccept = this.onAcceptEmitter.event;
  public readonly onDismiss = this.onDismissEmitter.event;
  public readonly onCycle = this.onCycleEmitter.event;

  constructor(config?: Partial<GhostTextConfig>) {
    this.config = { ...DEFAULT_GHOST_TEXT_CONFIG, ...config };
    this.renderer = new GhostTextRenderer(this.config);
    this.sessionManager = new GhostTextSessionManager();
    this.acceptor = new GhostTextAcceptor(this.sessionManager, this.renderer);
    this.dismisser = new GhostTextDismisser(this.sessionManager, this.renderer, this.config);
    this.cycler = new GhostTextCycler(this.sessionManager, this.renderer);

    // Wire session events
    this.disposables.push(
      this.sessionManager.onSessionEnd(({ session, outcome }) => {
        if (outcome === 'dismissed' || outcome === 'replaced') {
          const item = session.items[session.currentIndex];
          if (item) {
            this.onDismissEmitter.fire({ item, reason: outcome });
          }
        }
      })
    );
  }

  showCompletions(
    editor: vscode.TextEditor,
    items: CompletionItem[],
    position: vscode.Position
  ): void {
    if (!this.config.enabled || items.length === 0) return;

    const ghostItems = items.map((item, index) => this.toGhostTextItem(item, position, editor, index));

    const session = this.sessionManager.createSession(editor.document, position, ghostItems);
    const firstItem = ghostItems[0];

    if (this.config.showDelay > 0) {
      setTimeout(() => {
        if (this.sessionManager.getActiveSession()?.id === session.id) {
          this.renderer.show(editor, firstItem, session);
          this.setupDismisser(editor);
          this.setContextKeys(true, ghostItems.length > 1);
        }
      }, this.config.showDelay);
    } else {
      this.renderer.show(editor, firstItem, session);
      this.setupDismisser(editor);
      this.setContextKeys(true, ghostItems.length > 1);
    }
  }

  showSingleCompletion(
    editor: vscode.TextEditor,
    text: string,
    position: vscode.Position
  ): void {
    const item: GhostTextItem = {
      id: `ghost-${Date.now()}`,
      text,
      displayText: text,
      range: new vscode.Range(position, position),
      position,
      language: editor.document.languageId,
      confidence: 1,
      source: 'model',
      lineCount: text.split('\n').length,
      isTruncated: false,
      fullText: text,
      tokens: Math.ceil(text.length / 4),
    };

    const session = this.sessionManager.createSession(editor.document, position, [item]);
    this.renderer.show(editor, item, session);
    this.setupDismisser(editor);
    this.setContextKeys(true, false);
  }

  hide(editor: vscode.TextEditor): void {
    this.dismisser.dismiss(editor, 'manual');
    this.setContextKeys(false, false);
  }

  async acceptFull(): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const item = this.sessionManager.getCurrentItem();
    const success = await this.acceptor.acceptFull(editor);

    if (success && item) {
      this.onAcceptEmitter.fire({
        item,
        mode: 'full',
        text: item.fullText,
      });
      this.setContextKeys(false, false);
    }

    return success;
  }

  async acceptWord(): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const item = this.sessionManager.getCurrentItem();
    const result = await this.acceptor.acceptWord(editor);

    if (result && item) {
      this.onAcceptEmitter.fire({
        item,
        mode: 'word',
        text: result.acceptedText,
      });

      if (result.isComplete) {
        this.setContextKeys(false, false);
      }
    }

    return result !== null;
  }

  async acceptLine(): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const item = this.sessionManager.getCurrentItem();
    const result = await this.acceptor.acceptLine(editor);

    if (result && item) {
      this.onAcceptEmitter.fire({
        item,
        mode: 'line',
        text: result.acceptedText,
      });

      if (result.isComplete) {
        this.setContextKeys(false, false);
      }
    }

    return result !== null;
  }

  dismiss(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const item = this.sessionManager.getCurrentItem();
    this.dismisser.dismiss(editor, 'escape');

    if (item) {
      this.onDismissEmitter.fire({ item, reason: 'escape' });
    }
    this.setContextKeys(false, false);
  }

  cycleNext(): boolean {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const result = this.cycler.cycleNext(editor);
    if (result) {
      this.onCycleEmitter.fire(result);
    }
    return result !== null;
  }

  cyclePrevious(): boolean {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const result = this.cycler.cyclePrevious(editor);
    if (result) {
      this.onCycleEmitter.fire(result);
    }
    return result !== null;
  }

  isShowing(): boolean {
    return this.sessionManager.hasActiveSession();
  }

  getCurrentCompletion(): GhostTextItem | null {
    return this.sessionManager.getCurrentItem();
  }

  getAlternativesCount(): number {
    return this.cycler.getAlternativeCount();
  }

  updateConfig(config: Partial<GhostTextConfig>): void {
    this.config = { ...this.config, ...config };
    this.dismisser.updateConfig(config);
    if (config.color || config.opacity || config.fontStyle) {
      this.renderer.setStyle({
        color: config.color || this.config.color,
        opacity: config.opacity || this.config.opacity,
        fontStyle: config.fontStyle || this.config.fontStyle,
        backgroundColor: null,
        border: null,
      });
    }
  }

  getMetrics(): GhostTextMetrics {
    return this.sessionManager.getMetrics();
  }

  private toGhostTextItem(
    item: CompletionItem,
    position: vscode.Position,
    editor: vscode.TextEditor,
    index: number
  ): GhostTextItem {
    const lines = item.insertText.split('\n');
    const maxLines = this.config.maxPreviewLines;
    const isTruncated = lines.length > maxLines;
    const displayLines = isTruncated ? lines.slice(0, maxLines) : lines;

    return {
      id: item.id || `ghost-${index}-${Date.now()}`,
      text: item.insertText,
      displayText: displayLines.join('\n'),
      range: new vscode.Range(position, position),
      position,
      language: editor.document.languageId,
      confidence: item.confidence,
      source: item.source,
      lineCount: lines.length,
      isTruncated,
      fullText: item.insertText,
      tokens: item.tokens,
    };
  }

  private setupDismisser(editor: vscode.TextEditor): void {
    this.dismisser.setupListeners(editor);
  }

  private setContextKeys(showing: boolean, hasMultiple: boolean): void {
    vscode.commands.executeCommand('setContext', 'inaCoding.ghostTextVisible', showing);
    vscode.commands.executeCommand('setContext', 'inaCoding.hasMultipleCompletions', hasMultiple);
  }

  dispose(): void {
    this.renderer.dispose();
    this.sessionManager.dispose();
    this.dismisser.dispose();
    this.onAcceptEmitter.dispose();
    this.onDismissEmitter.dispose();
    this.onCycleEmitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
