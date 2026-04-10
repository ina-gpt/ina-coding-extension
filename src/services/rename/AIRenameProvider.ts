/**
 * AIRenameProvider.ts
 * Phase 16.7 — AI-powered rename suggestions
 *
 * Hooks into VS Code's rename flow (F2) by providing a dedicated command
 * that fetches suggestions from the chat model and lets the user pick one.
 * The standard VS Code rename flow remains untouched as a fallback.
 */

import * as vscode from 'vscode';
import {
  RenameSuggestion,
  RenameContext,
  NamingConvention,
  DEFAULT_MAX_SUGGESTIONS,
} from './AIRenameTypes';
import { ApiService } from '../ApiService';
import { Logger } from '../../utils/Logger';
import { ConfigManager } from '../../utils/ConfigManager';
import { RulesInjector } from '../rules/RulesInjector';

export class AIRenameProvider {
  private static instance: AIRenameProvider;
  private apiService: ApiService | null = null;

  private constructor() {}

  static getInstance(): AIRenameProvider {
    if (!AIRenameProvider.instance) {
      AIRenameProvider.instance = new AIRenameProvider();
    }
    return AIRenameProvider.instance;
  }

  setApiService(api: ApiService): void {
    this.apiService = api;
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Fetch AI-powered rename suggestions for the symbol at the given position.
   */
  async getSuggestions(
    document: vscode.TextDocument,
    position: vscode.Position,
    currentName: string
  ): Promise<RenameSuggestion[]> {
    const context = await this.buildContext(document, position, currentName);

    // Try AI suggestions
    if (this.apiService) {
      const aiSuggestions = await this.fetchFromAI(context);
      if (aiSuggestions.length > 0) {
        return aiSuggestions.slice(0, this.getMaxSuggestions());
      }
    }

    // Heuristic fallback when no AI is available
    return this.heuristicSuggestions(context);
  }

  /**
   * Register the AI rename command. Returns a Disposable that should be
   * pushed onto the extension's subscriptions.
   *
   * The command is `inaCoding.aiRename` (registered in extension.ts to call
   * this method). It shows a QuickPick of suggestions plus a "manual entry"
   * option that falls back to the standard rename flow.
   */
  registerRenameProvider(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Code action: surface "Rename with AI…" wherever the cursor is
    disposables.push(
      vscode.languages.registerCodeActionsProvider(
        { pattern: '**' },
        {
          provideCodeActions: (document, range) => {
            const action = new vscode.CodeAction(
              '$(sparkle) Rename with AI…',
              vscode.CodeActionKind.Refactor
            );
            action.command = {
              command: 'inaCoding.aiRename',
              title: 'Rename with AI',
              arguments: [document.uri, range.start],
            };
            return [action];
          },
        }
      )
    );

    return disposables;
  }

  /**
   * Run the AI rename interactive flow. Called by the registered command.
   */
  async runInteractive(uri?: vscode.Uri, position?: vscode.Position): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }
    const document = uri ? await vscode.workspace.openTextDocument(uri) : editor.document;
    const pos = position ?? editor.selection.active;

    // Find the word range at this position
    const wordRange = document.getWordRangeAtPosition(pos);
    if (!wordRange) {
      vscode.window.showWarningMessage('No symbol at cursor');
      return;
    }
    const currentName = document.getText(wordRange);
    if (!currentName) return;

    const fetchPromise = this.getSuggestions(document, pos, currentName);

    const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { newName?: string }>();
    quickPick.title = `Rename "${currentName}"`;
    quickPick.placeholder = 'Type a new name or pick a suggestion (Enter to confirm)';
    quickPick.busy = true;
    quickPick.items = [{ label: '$(loading~spin) Fetching AI suggestions...' }];
    quickPick.show();

    // Allow free typing → use the typed value
    let typedValue = '';
    quickPick.onDidChangeValue((value) => {
      typedValue = value;
    });

    let suggestions: RenameSuggestion[] = [];
    try {
      suggestions = await fetchPromise;
    } catch (e: any) {
      Logger.warn(`[AIRename] suggestions failed: ${String(e)}`);
    } finally {
      quickPick.busy = false;
      if (suggestions.length === 0) {
        quickPick.items = [
          { label: '$(edit) Type a new name above and press Enter' },
        ];
      } else {
        quickPick.items = suggestions.map((s) => ({
          label: `$(sparkle) ${s.name}`,
          description: `${(s.confidence * 100).toFixed(0)}% — ${s.convention}`,
          detail: s.reason,
          newName: s.name,
        }));
      }
    }

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      const newName = selected?.newName || typedValue.trim();
      quickPick.hide();
      if (!newName || newName === currentName) return;
      await this.performRename(document, wordRange, newName);
    });

    quickPick.onDidHide(() => {
      quickPick.dispose();
    });
  }

  /**
   * Apply a rename across the document and any references.
   * Uses VS Code's built-in rename provider for accuracy.
   */
  private async performRename(
    document: vscode.TextDocument,
    wordRange: vscode.Range,
    newName: string
  ): Promise<void> {
    try {
      const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        document.uri,
        wordRange.start,
        newName
      );
      if (edit && edit.size > 0) {
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Renamed to ${newName}`);
        return;
      }
    } catch (e) {
      Logger.warn(`[AIRename] rename provider failed: ${String(e)}`);
    }

    // Fallback: simple in-document replace
    try {
      const editor = await vscode.window.showTextDocument(document);
      await editor.edit((b) => b.replace(wordRange, newName));
      await document.save();
      vscode.window.showInformationMessage(`Renamed to ${newName} (local only)`);
    } catch (e) {
      Logger.error('[AIRename] fallback rename failed:', e);
      vscode.window.showErrorMessage(`Rename failed: ${String(e)}`);
    }
  }

  // ============================================================
  // Context building
  // ============================================================

  private async buildContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    currentName: string
  ): Promise<RenameContext> {
    const symbolKind = await this.detectSymbolKind(document, position);
    const usageContext = await this.collectUsageContext(document, position, currentName);
    const fileContent = this.extractSurroundingContent(document, position, 50);
    const projectConventions = this.getProjectConvention();

    return {
      currentName,
      symbolKind,
      language: document.languageId,
      usageContext,
      fileContent,
      projectConventions,
    };
  }

  private async detectSymbolKind(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<string> {
    try {
      const symbols = (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      )) ?? [];
      const found = this.findSymbolAtPosition(symbols, position);
      if (found) return vscode.SymbolKind[found.kind] ?? 'symbol';
    } catch {
      /* noop */
    }
    return 'symbol';
  }

  private findSymbolAtPosition(
    symbols: vscode.DocumentSymbol[],
    position: vscode.Position
  ): vscode.DocumentSymbol | null {
    for (const s of symbols) {
      if (s.range.contains(position)) {
        // Recurse into children for the most specific match
        const child = this.findSymbolAtPosition(s.children ?? [], position);
        return child ?? s;
      }
    }
    return null;
  }

  private async collectUsageContext(
    document: vscode.TextDocument,
    position: vscode.Position,
    currentName: string
  ): Promise<string[]> {
    try {
      const refs = (await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        document.uri,
        position
      )) ?? [];
      const ctx: string[] = [];
      for (const ref of refs.slice(0, 5)) {
        const doc = await vscode.workspace.openTextDocument(ref.uri);
        const lineNum = ref.range.start.line;
        const start = Math.max(0, lineNum - 1);
        const end = Math.min(doc.lineCount - 1, lineNum + 1);
        const lines: string[] = [];
        for (let i = start; i <= end; i++) {
          lines.push(doc.lineAt(i).text);
        }
        ctx.push(lines.join('\n'));
      }
      return ctx;
    } catch {
      // Fall back: search the current document only
      const text = document.getText();
      const idx = text.indexOf(currentName);
      if (idx >= 0) {
        return [text.substring(Math.max(0, idx - 100), idx + currentName.length + 100)];
      }
      return [];
    }
  }

  private extractSurroundingContent(
    document: vscode.TextDocument,
    position: vscode.Position,
    lines: number
  ): string {
    const start = Math.max(0, position.line - lines);
    const end = Math.min(document.lineCount - 1, position.line + lines);
    const range = new vscode.Range(start, 0, end, 0);
    return document.getText(range);
  }

  private getProjectConvention(): string | null {
    try {
      const rulesContext = RulesInjector.getInstance().getActiveRulesContext();
      if (!rulesContext) return null;
      // Pull anything in the rules text mentioning naming
      const allText = [
        rulesContext.forChat ?? '',
        rulesContext.forCompletion ?? '',
        rulesContext.forAgent ?? '',
      ].join('\n');
      const match = allText.match(/naming\s*[:\-—]\s*([^\n]+)/i);
      return match ? match[1].trim() : null;
    } catch {
      return null;
    }
  }

  // ============================================================
  // AI / heuristic suggestions
  // ============================================================

  private async fetchFromAI(context: RenameContext): Promise<RenameSuggestion[]> {
    if (!this.apiService) return [];

    const prompt = this.buildPrompt(context);
    try {
      const messages = [
        {
          role: 'user' as const,
          content: prompt,
        },
      ];
      let fullText = '';
      for await (const chunk of this.apiService.chatStream({
        messages,
        options: {
          temperature: 0.4,
          maxTokens: 600,
        },
      } as any)) {
        if (typeof chunk === 'string') fullText += chunk;
      }
      return this.parseAIResponse(fullText);
    } catch (e) {
      Logger.warn(`[AIRename] AI fetch failed: ${String(e)}`);
      return [];
    }
  }

  private buildPrompt(context: RenameContext): string {
    const usage = context.usageContext.length
      ? context.usageContext.map((u, i) => `### Usage ${i + 1}\n\`\`\`${context.language}\n${u}\n\`\`\``).join('\n')
      : '(no usage context)';

    return [
      `Suggest ${this.getMaxSuggestions()} better names for this ${context.symbolKind} currently named "${context.currentName}".`,
      `Language: ${context.language}`,
      context.projectConventions ? `Project convention: ${context.projectConventions}` : '',
      '',
      'Used in these contexts:',
      usage,
      '',
      'For each suggestion provide:',
      '- name: the new identifier (matching the language convention)',
      '- reason: 1 short sentence explaining why',
      '- confidence: 0..1 (how strongly you recommend it)',
      '- convention: the naming convention (camelCase, PascalCase, snake_case, UPPER_SNAKE, kebab-case)',
      '',
      'Output ONLY a JSON array of objects, no prose, no markdown fences.',
      'Example: [{"name":"foo","reason":"...","confidence":0.9,"convention":"camelCase"}]',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseAIResponse(text: string): RenameSuggestion[] {
    if (!text) return [];
    // Try direct JSON
    const trimmed = text.trim();
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Try to extract JSON array from response
      const match = trimmed.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (!match) return [];
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(parsed)) return [];

    const out: RenameSuggestion[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name ?? '').trim();
      if (!name) continue;
      out.push({
        name,
        reason: String(item.reason ?? '').trim() || 'Suggested by AI',
        confidence: this.clampConfidence(item.confidence),
        convention: this.normalizeConvention(item.convention) ?? this.detectConventionOf(name),
      });
    }
    out.sort((a, b) => b.confidence - a.confidence);
    return out;
  }

  private clampConfidence(c: any): number {
    const num = typeof c === 'number' ? c : parseFloat(c);
    if (!Number.isFinite(num)) return 0.5;
    return Math.max(0, Math.min(1, num));
  }

  private normalizeConvention(c: any): NamingConvention | null {
    if (typeof c !== 'string') return null;
    const lower = c.toLowerCase().replace(/\s+/g, '');
    if (lower.includes('pascal')) return 'PascalCase';
    if (lower.includes('camel')) return 'camelCase';
    if (lower.includes('upper')) return 'UPPER_SNAKE';
    if (lower.includes('snake')) return 'snake_case';
    if (lower.includes('kebab')) return 'kebab-case';
    return null;
  }

  private detectConventionOf(name: string): NamingConvention {
    if (/^[A-Z][A-Z0-9_]*$/.test(name)) return 'UPPER_SNAKE';
    if (/^[A-Z][A-Za-z0-9]*$/.test(name)) return 'PascalCase';
    if (/^[a-z][A-Za-z0-9]*$/.test(name)) return 'camelCase';
    if (/^[a-z][a-z0-9_]*$/.test(name)) return 'snake_case';
    if (/^[a-z][a-z0-9-]*$/.test(name)) return 'kebab-case';
    return 'unknown';
  }

  /**
   * Detect the dominant convention of a document — used as a fallback
   * when no project rules are present.
   */
  private detectConvention(document: vscode.TextDocument): NamingConvention {
    const text = document.getText().slice(0, 5000);
    const counts: Record<NamingConvention, number> = {
      camelCase: 0,
      PascalCase: 0,
      snake_case: 0,
      UPPER_SNAKE: 0,
      'kebab-case': 0,
      unknown: 0,
    };
    const re = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const c = this.detectConventionOf(match[0]);
      counts[c]++;
    }
    let best: NamingConvention = 'camelCase';
    let max = -1;
    for (const [k, v] of Object.entries(counts)) {
      if (v > max && k !== 'unknown') {
        max = v;
        best = k as NamingConvention;
      }
    }
    return best;
  }

  /** Generate generic suggestions without an AI call (fallback) */
  private heuristicSuggestions(context: RenameContext): RenameSuggestion[] {
    const conv = context.projectConventions
      ? this.normalizeConvention(context.projectConventions) ?? 'camelCase'
      : 'camelCase';
    const base = context.currentName.replace(/^_+|_+$/g, '');
    const out: RenameSuggestion[] = [
      {
        name: this.toCamelCase(`new ${base}`),
        reason: 'Heuristic — clearer prefix',
        confidence: 0.5,
        convention: conv,
      },
      {
        name: this.toCamelCase(`${base} value`),
        reason: 'Heuristic — descriptive suffix',
        confidence: 0.4,
        convention: conv,
      },
    ];
    return out;
  }

  private toCamelCase(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^[A-Z]/, (c) => c.toLowerCase());
  }

  private getMaxSuggestions(): number {
    return ConfigManager.get<number>('rename.maxSuggestions', DEFAULT_MAX_SUGGESTIONS);
  }
}
