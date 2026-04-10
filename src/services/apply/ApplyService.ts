/**
 * Phase 15.2 — Apply Service
 * Orchestrates code application from chat to files.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { ApplyResult, ApplyPreview, ApplyStrategy, CodeBlockInfo } from './ApplyTypes';
import { FileDetector } from './FileDetector';
import { DiffApplicator } from './DiffApplicator';
import { CodeSecurityGate } from '../codesec/CodeSecurityGate';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';

export class ApplyService {
  private static instance: ApplyService;
  private fileDetector: FileDetector;
  private diffApplicator: DiffApplicator;
  private constructor() {
    this.fileDetector = FileDetector.getInstance();
    this.diffApplicator = DiffApplicator.getInstance();
  }
  static getInstance(): ApplyService {
    if (!ApplyService.instance) ApplyService.instance = new ApplyService();
    return ApplyService.instance;
  }

  async applyCodeBlock(codeBlock: CodeBlockInfo, options?: { preferredFile?: string }): Promise<ApplyResult> {
    // Security scan
    const gate = CodeSecurityGate.getInstance();
    const scan = gate.scanIncomingCode(codeBlock.code, 'chat');
    if (!scan.safe) {
      return { success: false, filePath: '', strategy: 'surgical', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: `Security: ${scan.warnings.join(', ') || 'Code blocked by security gate'}`, undoId: '' };
    }

    // Detect target
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let target = await this.fileDetector.detectTarget(codeBlock, wsRoot);
    if (options?.preferredFile) {
      target = { filePath: options.preferredFile, matchMethod: 'user_selected', confidence: 1.0, alternatives: [] };
    }

    // User confirmation for low confidence
    if (target.confidence < 0.5 && !options?.preferredFile) {
      const chosen = await this.showFileSelectionQuickPick(target, codeBlock);
      if (!chosen) return { success: false, filePath: '', strategy: 'surgical', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: 'Cancelled by user', undoId: '' };
      target = { filePath: chosen, matchMethod: 'user_selected', confidence: 1.0, alternatives: [] };
    }

    if (!target.filePath) {
      return { success: false, filePath: '', strategy: 'surgical', linesChanged: 0, linesAdded: 0, linesRemoved: 0, error: 'No target file detected', undoId: '' };
    }

    // Determine strategy
    const strategy = this.determineStrategy(codeBlock, target);

    // Apply with smart model routing
    const result = await this.diffApplicator.apply(target.filePath, codeBlock.code, strategy);

    if (result.success) {
      const relPath = vscode.workspace.asRelativePath(result.filePath);

      // Feature 2: Instant Apply — skip diff preview if high confidence
      const instantApply = ConfigManager.get<boolean>('apply.instantApply', false);
      const threshold = ConfigManager.get<number>('apply.instantApplyThreshold', 0.95);
      const confidence = this.calculateApplyConfidence(codeBlock, target, result);

      if (instantApply && confidence >= threshold) {
        vscode.window.showInformationMessage(
          `INA-7 Pro: ${relPath} aktualisiert (${Math.round(confidence * 100)}% Sicherheit). Cmd+Z zum Rückgängig.`
        );
      } else {
        vscode.window.showInformationMessage(`Applied to ${relPath} (${result.linesChanged} lines ${strategy === 'create' ? 'created' : 'changed'})`);
      }
    }

    return result;
  }

  async applyAllCodeBlocks(codeBlocks: CodeBlockInfo[]): Promise<ApplyResult[]> {
    const results: ApplyResult[] = [];
    for (const block of codeBlocks) {
      results.push(await this.applyCodeBlock(block));
    }
    const succeeded = results.filter(r => r.success).length;
    if (codeBlocks.length > 1) {
      vscode.window.showInformationMessage(`Applied ${succeeded}/${codeBlocks.length} code blocks`);
    }
    return results;
  }

  async previewApply(codeBlock: CodeBlockInfo): Promise<ApplyPreview> {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const target = await this.fileDetector.detectTarget(codeBlock, wsRoot);
    let beforeContent = '';
    if (target.filePath) {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(target.filePath));
        beforeContent = doc.getText();
      } catch {}
    }
    const strategy = this.determineStrategy(codeBlock, target);
    return { targetFile: target, strategy, diff: '', beforeContent, afterContent: codeBlock.code, regions: [] };
  }

  private determineStrategy(codeBlock: CodeBlockInfo, target: any): ApplyStrategy {
    if (target.matchMethod === 'new_file') return 'create';
    if (codeBlock.isComplete) return 'replace';
    const hasSymbol = /(?:function|class|interface|type|const|let)\s+\w+/.test(codeBlock.code);
    if (hasSymbol) return 'surgical';
    return 'insert';
  }

  private async showFileSelectionQuickPick(target: any, codeBlock: CodeBlockInfo): Promise<string | null> {
    const items: vscode.QuickPickItem[] = [];
    if (target.filePath) items.push({ label: target.filePath, description: `${Math.round(target.confidence * 100)}% match` });
    for (const alt of target.alternatives || []) {
      items.push({ label: alt.filePath, description: `${Math.round(alt.confidence * 100)}% — ${alt.reason}` });
    }
    const active = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (active && !items.find(i => i.label === active)) {
      items.push({ label: active, description: 'Active editor' });
    }
    items.push({ label: '$(file-add) Create new file...', description: '' });
    const picked = await vscode.window.showQuickPick(items, { placeHolder: `Apply ${codeBlock.language || 'code'} block to which file?` });
    if (!picked) return null;
    if (picked.label.includes('Create new file')) {
      const uri = await vscode.window.showSaveDialog({ filters: { 'All': ['*'] } });
      return uri?.fsPath || null;
    }
    return picked.label;
  }

  // Feature 1: Smart Apply Model — route apply through faster model
  getApplyModel(): string {
    const mode = ConfigManager.get<string>('apply.model', 'fast');
    return mode === 'fast' ? 'qwen3:14b' : 'qwen2.5-coder:32b';
  }

  // Feature 2: Calculate apply confidence for instant apply
  private calculateApplyConfidence(codeBlock: CodeBlockInfo, target: any, result: ApplyResult): number {
    let confidence = 0.5;
    // Small change → high confidence
    if (result.linesChanged <= 10) confidence += 0.2;
    if (result.linesChanged <= 3) confidence += 0.15;
    // File was user-selected → high confidence
    if (target.matchMethod === 'user_selected') confidence += 0.15;
    // High detection confidence
    if (target.confidence >= 0.9) confidence += 0.1;
    // Only additions → higher confidence
    if (result.linesRemoved === 0) confidence += 0.1;
    return Math.min(confidence, 1.0);
  }
}
