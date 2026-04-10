/**
 * Phase 15.3 — Prediction Chain Manager
 * Manages the "Tab-Tab-Tab" editing flow.
 */
import * as vscode from 'vscode';
import { PredictionChain, PredictedEdit, EditEvent, PREDICTION_CONSTANTS } from './PredictTypes';
import { LocationPredictor } from './LocationPredictor';
import { EditTracker } from './EditTracker';
import { Logger } from '../../utils/Logger';

export class PredictionChainManager {
  private static instance: PredictionChainManager;
  private activeChain: PredictionChain | null = null;
  private locationPredictor: LocationPredictor;
  private statusBarItem: vscode.StatusBarItem;
  private decorationType: vscode.TextEditorDecorationType;
  private debounceTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.locationPredictor = LocationPredictor.getInstance();
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.statusBarItem.command = 'inaCoding.viewPredictions';
    this.decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(59, 130, 246, 0.08)',
      border: '1px dotted rgba(59, 130, 246, 0.3)',
      after: { contentText: ' ← Tab', color: 'rgba(59, 130, 246, 0.5)', fontStyle: 'italic', margin: '0 0 0 1em' },
    });
  }

  static getInstance(): PredictionChainManager {
    if (!PredictionChainManager.instance) PredictionChainManager.instance = new PredictionChainManager();
    return PredictionChainManager.instance;
  }

  async startChain(triggerEdit: EditEvent): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.cancelChain();
      const result = await this.locationPredictor.predict(triggerEdit);
      if (result.predictions.length === 0) return;
      this.activeChain = {
        id: `chain-${Date.now()}`,
        triggerEdit,
        predictions: result.predictions,
        currentIndex: 0,
        status: 'active',
        createdAt: Date.now(),
      };
      vscode.commands.executeCommand('setContext', 'inaCoding.predictionActive', true);
      this.showCurrentPrediction();
      Logger.info(`[Predict] Chain started: ${result.predictions.length} predictions (${result.latencyMs}ms)`);
    }, PREDICTION_CONSTANTS.DEBOUNCE_MS);
  }

  showCurrentPrediction(): void {
    if (!this.activeChain || this.activeChain.currentIndex >= this.activeChain.predictions.length) {
      this.completeChain();
      return;
    }
    const prediction = this.activeChain.predictions[this.activeChain.currentIndex];
    this.updateStatusBar();
    // Show decoration at prediction location in current file
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.fsPath === prediction.filePath) {
      const range = new vscode.Range(prediction.line, prediction.column, prediction.line, prediction.column + prediction.oldText.length);
      editor.setDecorations(this.decorationType, [{ range }]);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  async acceptCurrent(): Promise<boolean> {
    if (!this.activeChain || this.activeChain.status !== 'active') return false;
    const prediction = this.activeChain.predictions[this.activeChain.currentIndex];
    if (!prediction) return false;
    const editor = vscode.window.activeTextEditor;
    try {
      const uri = vscode.Uri.file(prediction.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const activeEditor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
      const range = new vscode.Range(prediction.line, prediction.column, prediction.line, prediction.column + prediction.oldText.length);
      const currentText = doc.getText(range);
      if (currentText === prediction.oldText) {
        await activeEditor.edit(eb => { eb.replace(range, prediction.newText); });
      } else {
        Logger.debug(`[Predict] Text mismatch at ${prediction.filePath}:${prediction.line}, skipping`);
      }
    } catch (e: any) {
      Logger.error('[Predict] Accept failed:', e);
    }
    this.activeChain.currentIndex++;
    editor?.setDecorations(this.decorationType, []);
    if (this.activeChain.currentIndex < this.activeChain.predictions.length) {
      this.showCurrentPrediction();
    } else {
      this.completeChain();
    }
    return true;
  }

  skipCurrent(): void {
    if (!this.activeChain || this.activeChain.status !== 'active') return;
    const editor = vscode.window.activeTextEditor;
    editor?.setDecorations(this.decorationType, []);
    this.activeChain.currentIndex++;
    if (this.activeChain.currentIndex < this.activeChain.predictions.length) {
      this.showCurrentPrediction();
    } else {
      this.completeChain();
    }
  }

  cancelChain(): void {
    if (!this.activeChain) return;
    this.activeChain.status = 'cancelled';
    this.activeChain = null;
    vscode.commands.executeCommand('setContext', 'inaCoding.predictionActive', false);
    const editor = vscode.window.activeTextEditor;
    editor?.setDecorations(this.decorationType, []);
    this.statusBarItem.hide();
  }

  completeChain(): void {
    if (!this.activeChain) return;
    const applied = this.activeChain.currentIndex;
    this.activeChain.status = 'completed';
    this.activeChain = null;
    vscode.commands.executeCommand('setContext', 'inaCoding.predictionActive', false);
    const editor = vscode.window.activeTextEditor;
    editor?.setDecorations(this.decorationType, []);
    this.statusBarItem.hide();
    if (applied > 0) {
      vscode.window.setStatusBarMessage(`$(check) Applied ${applied} predicted edit(s)`, 3000);
    }
  }

  getChainStatus(): { active: boolean; current: number; total: number; currentPrediction: PredictedEdit | null } {
    if (!this.activeChain || this.activeChain.status !== 'active') {
      return { active: false, current: 0, total: 0, currentPrediction: null };
    }
    return {
      active: true,
      current: this.activeChain.currentIndex,
      total: this.activeChain.predictions.length,
      currentPrediction: this.activeChain.predictions[this.activeChain.currentIndex] || null,
    };
  }

  private updateStatusBar(): void {
    if (!this.activeChain || this.activeChain.status !== 'active') { this.statusBarItem.hide(); return; }
    const remaining = this.activeChain.predictions.length - this.activeChain.currentIndex;
    const current = this.activeChain.predictions[this.activeChain.currentIndex];
    this.statusBarItem.text = `$(lightbulb) Tab → ${remaining} more edit(s)`;
    this.statusBarItem.tooltip = current ? `Next: ${current.previewText} at ${vscode.workspace.asRelativePath(current.filePath)}:${current.line + 1}` : '';
    this.statusBarItem.show();
  }

  dispose(): void {
    this.cancelChain();
    this.statusBarItem.dispose();
    this.decorationType.dispose();
  }
}
