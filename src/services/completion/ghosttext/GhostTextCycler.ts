import * as vscode from 'vscode';
import { GhostTextSessionManager } from './GhostTextSessionManager';
import { GhostTextRenderer } from './GhostTextRenderer';
import { CycleResult } from './GhostTextTypes';

export class GhostTextCycler {
  private sessionManager: GhostTextSessionManager;
  private renderer: GhostTextRenderer;
  private cycleIndicatorVisible: boolean = false;
  private indicatorHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionManager: GhostTextSessionManager, renderer: GhostTextRenderer) {
    this.sessionManager = sessionManager;
    this.renderer = renderer;
  }

  canCycle(): boolean {
    const session = this.sessionManager.getActiveSession();
    return session !== null && session.items.length > 1;
  }

  getAlternativeCount(): number {
    const session = this.sessionManager.getActiveSession();
    return session?.items.length || 0;
  }

  cycleNext(editor: vscode.TextEditor): CycleResult | null {
    const result = this.sessionManager.cycleNext();
    if (!result) return null;

    this.renderer.show(editor, result.item, this.sessionManager.getActiveSession()!);
    this.showCycleIndicator(editor);
    return result;
  }

  cyclePrevious(editor: vscode.TextEditor): CycleResult | null {
    const result = this.sessionManager.cyclePrevious();
    if (!result) return null;

    this.renderer.show(editor, result.item, this.sessionManager.getActiveSession()!);
    this.showCycleIndicator(editor);
    return result;
  }

  cycleToIndex(editor: vscode.TextEditor, index: number): boolean {
    const session = this.sessionManager.getActiveSession();
    if (!session || index < 0 || index >= session.items.length) return false;

    this.sessionManager.setCurrentIndex(index);
    const item = session.items[index];
    this.renderer.show(editor, item, session);
    this.showCycleIndicator(editor);
    return true;
  }

  showCycleIndicator(editor: vscode.TextEditor): void {
    const session = this.sessionManager.getActiveSession();
    if (!session) return;

    this.renderer.showCycleIndicator(
      editor,
      session.currentIndex,
      session.items.length
    );
    this.cycleIndicatorVisible = true;

    // Auto-hide after 2 seconds
    if (this.indicatorHideTimer) clearTimeout(this.indicatorHideTimer);
    this.indicatorHideTimer = setTimeout(() => {
      this.hideCycleIndicator(editor);
    }, 2000);
  }

  hideCycleIndicator(editor: vscode.TextEditor): void {
    this.renderer.hideCycleIndicator(editor);
    this.cycleIndicatorVisible = false;
    if (this.indicatorHideTimer) {
      clearTimeout(this.indicatorHideTimer);
      this.indicatorHideTimer = null;
    }
  }

  getCurrentIndex(): number {
    return this.sessionManager.getActiveSession()?.currentIndex ?? 0;
  }

  getTotalCount(): number {
    return this.sessionManager.getActiveSession()?.items.length ?? 0;
  }

  getPreviewForIndex(index: number): string | null {
    const session = this.sessionManager.getActiveSession();
    if (!session || index < 0 || index >= session.items.length) return null;
    return session.items[index].displayText;
  }

  getAllPreviews(): Array<{ index: number; preview: string; isCurrent: boolean }> {
    const session = this.sessionManager.getActiveSession();
    if (!session) return [];

    return session.items.map((item, index) => ({
      index,
      preview: item.displayText.split('\n')[0].slice(0, 80),
      isCurrent: index === session.currentIndex,
    }));
  }
}
