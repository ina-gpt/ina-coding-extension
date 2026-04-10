/**
 * Phase 15.3 — Location Predictor
 * Core prediction engine using rules, LSP, and LLM strategies.
 */
import * as vscode from 'vscode';
import { EditEvent, PredictedEdit, PredictionResult, EditType, PREDICTION_CONSTANTS } from './PredictTypes';
import { Logger } from '../../utils/Logger';

let predictCounter = 0;

export class LocationPredictor {
  private static instance: LocationPredictor;
  private constructor() {}
  static getInstance(): LocationPredictor {
    if (!LocationPredictor.instance) LocationPredictor.instance = new LocationPredictor();
    return LocationPredictor.instance;
  }

  async predict(edit: EditEvent): Promise<PredictionResult> {
    const start = Date.now();
    const allPredictions: PredictedEdit[][] = [];
    try {
      const [rulesPreds, lspPreds] = await Promise.all([
        this.predictByRules(edit),
        this.predictByLSP(edit),
      ]);
      allPredictions.push(rulesPreds, lspPreds);
    } catch (e) {
      Logger.debug('[LocationPredictor] Prediction error:', e);
    }
    const merged = this.mergeAndRank(allPredictions);
    return { predictions: merged, method: 'combined', latencyMs: Date.now() - start };
  }

  private async predictByRules(edit: EditEvent): Promise<PredictedEdit[]> {
    const predictions: PredictedEdit[] = [];
    if (edit.editType === EditType.RENAME && edit.oldText.trim() && edit.newText.trim()) {
      const oldSym = edit.oldText.trim();
      const newSym = edit.newText.trim();
      if (/^\w+$/.test(oldSym) && /^\w+$/.test(newSym)) {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(edit.filePath));
          const text = doc.getText();
          const regex = new RegExp(`\\b${this.escapeRegex(oldSym)}\\b`, 'g');
          let match;
          while ((match = regex.exec(text)) !== null) {
            const pos = doc.positionAt(match.index);
            if (pos.line === edit.line && pos.character === edit.column) continue;
            predictions.push({
              id: `pred-${++predictCounter}`,
              filePath: edit.filePath,
              line: pos.line,
              column: pos.character,
              oldText: oldSym,
              newText: newSym,
              reason: `Rename "${oldSym}" → "${newSym}"`,
              confidence: 0.9,
              editType: EditType.RENAME,
              relatedToEditId: null,
              priority: 1,
              previewText: `${oldSym} → ${newSym}`,
            });
          }
        } catch {}
      }
    }
    return predictions.slice(0, PREDICTION_CONSTANTS.MAX_CHAIN_LENGTH);
  }

  private async predictByLSP(edit: EditEvent): Promise<PredictedEdit[]> {
    const predictions: PredictedEdit[] = [];
    if (edit.editType !== EditType.RENAME || !edit.symbolName) return predictions;
    try {
      const uri = vscode.Uri.file(edit.filePath);
      const pos = new vscode.Position(edit.line, edit.column);
      const locations = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', uri, pos);
      if (!locations?.length) return predictions;
      for (const loc of locations.slice(0, PREDICTION_CONSTANTS.MAX_REFERENCES_TO_CHECK)) {
        if (loc.uri.fsPath === edit.filePath && loc.range.start.line === edit.line) continue;
        predictions.push({
          id: `pred-${++predictCounter}`,
          filePath: loc.uri.fsPath,
          line: loc.range.start.line,
          column: loc.range.start.character,
          oldText: edit.oldText.trim(),
          newText: edit.newText.trim(),
          reason: `Reference in ${vscode.workspace.asRelativePath(loc.uri)}`,
          confidence: 0.85,
          editType: EditType.RENAME,
          relatedToEditId: null,
          priority: loc.uri.fsPath === edit.filePath ? 1 : 2,
          previewText: `${edit.oldText.trim()} → ${edit.newText.trim()}`,
        });
      }
    } catch (e) {
      Logger.debug('[LocationPredictor] LSP prediction failed:', e);
    }
    return predictions;
  }

  private mergeAndRank(predictionSets: PredictedEdit[][]): PredictedEdit[] {
    const all = predictionSets.flat();
    const seen = new Map<string, PredictedEdit>();
    for (const p of all) {
      const key = `${p.filePath}:${p.line}:${p.column}`;
      const existing = seen.get(key);
      if (!existing || p.confidence > existing.confidence) {
        seen.set(key, p);
      } else if (existing) {
        existing.confidence = Math.min(existing.confidence + 0.1, 1.0);
      }
    }
    return [...seen.values()]
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.confidence - a.confidence;
      })
      .slice(0, PREDICTION_CONSTANTS.MAX_CHAIN_LENGTH);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
