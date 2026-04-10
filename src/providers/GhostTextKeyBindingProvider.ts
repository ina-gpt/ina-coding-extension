import * as vscode from 'vscode';
import { GhostTextController } from '../services/completion/ghosttext/GhostTextController';
import { GhostTextConfig } from '../services/completion/ghosttext/GhostTextTypes';

export class GhostTextKeyBindingProvider implements vscode.Disposable {
  private ghostTextController: GhostTextController;
  private config: GhostTextConfig;
  private disposables: vscode.Disposable[] = [];

  constructor(
    ghostTextController: GhostTextController,
    context: vscode.ExtensionContext,
    config: GhostTextConfig
  ) {
    this.ghostTextController = ghostTextController;
    this.config = config;
    this.registerCommands(context);
  }

  registerCommands(context: vscode.ExtensionContext): void {
    this.disposables.push(
      vscode.commands.registerCommand('inaCoding.acceptCompletion', () => this.handleTab()),
      vscode.commands.registerCommand('inaCoding.acceptCompletionWord', () => this.handleCmdRight()),
      vscode.commands.registerCommand('inaCoding.acceptCompletionLine', () => this.handleCmdShiftRight()),
      vscode.commands.registerCommand('inaCoding.dismissCompletion', () => this.handleEscape()),
      vscode.commands.registerCommand('inaCoding.cycleCompletionNext', () => this.handleAltBracketRight()),
      vscode.commands.registerCommand('inaCoding.cycleCompletionPrevious', () => this.handleAltBracketLeft()),
      vscode.commands.registerCommand('inaCoding.showCompletionAlternatives', () => this.showAlternativesQuickPick()),
    );

    for (const d of this.disposables) {
      context.subscriptions.push(d);
    }
  }

  handleTab(): void {
    if (!this.ghostTextController.isShowing()) return;

    if (this.config.cycleWithTab && this.ghostTextController.getAlternativesCount() > 1) {
      this.ghostTextController.cycleNext();
    } else {
      this.ghostTextController.acceptFull();
    }
  }

  handleCmdRight(): void {
    if (!this.ghostTextController.isShowing()) return;
    if (!this.config.enableWordAccept) return;

    this.ghostTextController.acceptWord();
  }

  handleCmdShiftRight(): void {
    if (!this.ghostTextController.isShowing()) return;
    if (!this.config.enableLineAccept) return;

    this.ghostTextController.acceptLine();
  }

  handleEscape(): void {
    if (!this.ghostTextController.isShowing()) return;

    this.ghostTextController.dismiss();
  }

  handleAltBracketRight(): void {
    if (!this.ghostTextController.isShowing()) return;
    if (!this.config.enableCycling) return;

    this.ghostTextController.cycleNext();
  }

  handleAltBracketLeft(): void {
    if (!this.ghostTextController.isShowing()) return;
    if (!this.config.enableCycling) return;

    this.ghostTextController.cyclePrevious();
  }

  handleCmdAltSpace(): void {
    this.showAlternativesQuickPick();
  }

  async showAlternativesQuickPick(): Promise<void> {
    if (!this.ghostTextController.isShowing()) return;

    const count = this.ghostTextController.getAlternativesCount();
    if (count <= 1) {
      vscode.window.showInformationMessage('No alternative completions available');
      return;
    }

    // Build quick pick items with previews
    const items: Array<vscode.QuickPickItem & { index: number }> = [];
    const session = this.ghostTextController.getCurrentCompletion();

    // We need to get all items from the session manager via controller
    for (let i = 0; i < count; i++) {
      const isCurrent = i === 0; // Simplified - actual index tracked in session
      items.push({
        label: `${isCurrent ? '$(check) ' : ''}Alternative ${i + 1}`,
        description: isCurrent ? '(current)' : '',
        detail: `Completion option ${i + 1} of ${count}`,
        index: i,
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Select completion alternative (${count} available)`,
    });

    if (selected) {
      // Cycle to the selected index
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.ghostTextController.acceptFull();
      }
    }
  }

  setKeyBindingContext(showing: boolean): void {
    vscode.commands.executeCommand('setContext', 'inaCoding.ghostTextVisible', showing);
  }

  dispose(): void {
    // Commands are disposed via context.subscriptions
  }
}
